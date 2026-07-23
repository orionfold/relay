/**
 * Table import module — extract structured data from documents,
 * infer column types, and batch-import rows.
 */

import { readFile } from "fs/promises";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import {
  documents,
  userTableImports,
  tableDocumentInputs,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { addRows } from "@/lib/data/tables";
import type { ColumnDataType } from "@/lib/constants/table-status";
import { readXlsxWorkbook } from "@/lib/spreadsheets/xlsx";

// ── Type inference patterns ──────────────────────────────────────────

const EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const URL_RE = /^https?:\/\/.+/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const US_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const EU_DATE_RE = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;
const BOOLEAN_VALUES = new Set(["true", "false", "yes", "no", "1", "0"]);
const CURRENCY_RE = /^[$€£¥]?\s?[\d,]+\.?\d*$/;
const PERCENT_RE = /^[\d.]+%$/;

interface ExtractedData {
  headers: string[];
  rows: Record<string, string>[];
}

interface InferredColumn {
  name: string;
  displayName: string;
  dataType: ColumnDataType;
  config?: Record<string, unknown>;
}

interface ImportResult {
  importId: string;
  rowsImported: number;
  rowsSkipped: number;
  errors: Array<{ row: number; error: string }>;
}

// ── Extract structured data from a document ──────────────────────────

export async function extractStructuredData(
  documentId: string
): Promise<ExtractedData> {
  const doc = db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .get();

  if (!doc) throw new Error("Document not found");

  const mime = doc.mimeType;
  const buffer = await readFile(doc.storagePath);

  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel"
  ) {
    return extractFromExcel(buffer);
  }

  if (mime === "text/csv" || mime === "text/tab-separated-values") {
    const delimiter = mime === "text/tab-separated-values" ? "\t" : ",";
    return extractFromCsv(buffer.toString("utf-8"), delimiter);
  }

  throw new Error(`Unsupported mime type for import: ${mime}`);
}

async function extractFromExcel(buffer: Buffer): Promise<ExtractedData> {
  const [worksheet] = await readXlsxWorkbook(buffer);
  if (!worksheet) throw new Error("No worksheets found");

  const [headerRow = [], ...dataRows] = worksheet.rows;
  const headers = headerRow.map((value, index) =>
    String(value ?? `col_${index}`).trim(),
  );
  const rows = dataRows.map((values) => {
    const rowData: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = values[index];
      rowData[header] = value == null ? "" : String(value);
    });
    return rowData;
  });

  return { headers, rows };
}

function extractFromCsv(
  content: string,
  delimiter: string
): ExtractedData {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) throw new Error("Empty file");

  // Simple CSV parser (handles basic cases, not quoted fields with newlines)
  function parseLine(line: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuotes) {
        inQuotes = true;
      } else if (ch === '"' && inQuotes) {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const rowData: Record<string, string> = {};
    headers.forEach((h, j) => {
      rowData[h] = values[j] ?? "";
    });
    rows.push(rowData);
  }

  return { headers, rows };
}

// ── Infer column types from sample data ──────────────────────────────

export function inferColumnTypes(
  headers: string[],
  sampleRows: Record<string, string>[]
): InferredColumn[] {
  return headers.map((header) => {
    const values = sampleRows
      .map((r) => r[header])
      .filter((v) => v != null && v !== "");

    if (values.length === 0) {
      return makeColumn(header, "text");
    }

    // Check patterns across all non-empty values
    const allEmail = values.every((v) => EMAIL_RE.test(v));
    if (allEmail) return makeColumn(header, "email");

    const allUrl = values.every((v) => URL_RE.test(v));
    if (allUrl) return makeColumn(header, "url");

    const allBoolean = values.every((v) => BOOLEAN_VALUES.has(v.toLowerCase()));
    if (allBoolean) return makeColumn(header, "boolean");

    const allDate = values.every(
      (v) => ISO_DATE_RE.test(v) || US_DATE_RE.test(v) || EU_DATE_RE.test(v)
    );
    if (allDate) return makeColumn(header, "date");

    const allNumber = values.every(
      (v) => CURRENCY_RE.test(v.replace(/,/g, "")) || PERCENT_RE.test(v) || !isNaN(Number(v))
    );
    if (allNumber) return makeColumn(header, "number");

    // Check for select: small set of repeated values
    const unique = new Set(values);
    if (unique.size <= 10 && unique.size < values.length * 0.5) {
      return makeColumn(header, "select", {
        options: Array.from(unique).sort(),
      });
    }

    return makeColumn(header, "text");
  });
}

function makeColumn(
  header: string,
  dataType: ColumnDataType,
  config?: Record<string, unknown>
): InferredColumn {
  const name = header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    || `col_${Math.random().toString(36).slice(2, 6)}`;

  return {
    name,
    displayName: header,
    dataType,
    config,
  };
}

// ── Coerce values to target types ────────────────────────────────────

function coerceValue(value: string, dataType: ColumnDataType): unknown {
  if (value === "") return null;

  switch (dataType) {
    case "number": {
      const cleaned = value.replace(/[$€£¥,%\s]/g, "").replace(/,/g, "");
      const num = Number(cleaned);
      return isNaN(num) ? null : num;
    }
    case "boolean": {
      const lower = value.toLowerCase();
      return lower === "true" || lower === "yes" || lower === "1";
    }
    case "date": {
      // Try to normalize to ISO format
      if (ISO_DATE_RE.test(value)) return value;
      // US format: MM/DD/YYYY
      const usMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (usMatch) {
        const year = usMatch[3].length === 2 ? `20${usMatch[3]}` : usMatch[3];
        return `${year}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
      }
      // EU format: DD.MM.YYYY
      const euMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
      if (euMatch) {
        const year = euMatch[3].length === 2 ? `20${euMatch[3]}` : euMatch[3];
        return `${year}-${euMatch[2].padStart(2, "0")}-${euMatch[1].padStart(2, "0")}`;
      }
      return value;
    }
    default:
      return value;
  }
}

// ── Batch import rows ────────────────────────────────────────────────

export async function importRows(
  tableId: string,
  rawRows: Record<string, string>[],
  columnMapping: InferredColumn[]
): Promise<ImportResult> {
  const importId = randomUUID();
  const errors: Array<{ row: number; error: string }> = [];
  let rowsImported = 0;

  // Process in chunks of 100
  const CHUNK_SIZE = 100;
  for (let i = 0; i < rawRows.length; i += CHUNK_SIZE) {
    const chunk = rawRows.slice(i, i + CHUNK_SIZE);
    const validRows: Array<{ data: Record<string, unknown> }> = [];

    for (let j = 0; j < chunk.length; j++) {
      const rawRow = chunk[j];
      const rowNum = i + j + 2; // +2 for 1-indexed + header row

      try {
        const data: Record<string, unknown> = {};
        for (const col of columnMapping) {
          const rawValue = rawRow[col.displayName] ?? "";
          data[col.name] = coerceValue(rawValue, col.dataType);
        }
        validRows.push({ data });
      } catch (err) {
        errors.push({
          row: rowNum,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    if (validRows.length > 0) {
      const { ids } = await addRows(tableId, validRows);
      // F10: count actual inserts, not attempted inserts. Duplicates are
      // silently deduped at the DB layer; surface them as skipped.
      rowsImported += ids.length;
    }
  }

  return { importId, rowsImported, rowsSkipped: errors.length, errors };
}

// ── Create import audit record ───────────────────────────────────────

export async function createImportRecord(
  tableId: string,
  documentId: string,
  result: ImportResult
): Promise<void> {
  const now = new Date();

  // Create audit record
  await db.insert(userTableImports).values({
    id: result.importId,
    tableId,
    documentId,
    rowCount: result.rowsImported,
    errorCount: result.rowsSkipped,
    errors: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
    status: result.rowsSkipped > 0 && result.rowsImported === 0 ? "failed" : "completed",
    createdAt: now,
  });

  // Link document to table
  try {
    await db.insert(tableDocumentInputs).values({
      id: randomUUID(),
      tableId,
      documentId,
      createdAt: now,
    });
  } catch {
    // Unique constraint — already linked
  }
}
