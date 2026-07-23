import { readFile } from "fs/promises";
import type { ProcessorResult } from "../registry";
import { readXlsxWorkbook } from "@/lib/spreadsheets/xlsx";

/** Parse XLSX/CSV to a text table representation */
export async function processSpreadsheet(filePath: string): Promise<ProcessorResult> {
  const buffer = await readFile(filePath);
  const workbook = await readXlsxWorkbook(buffer);
  const sheets = workbook.map(({ name, rows }) => {
    const textRows = rows.map((row) =>
      row.map((value) => (value ?? "").toString()).join(","),
    );
    return `--- Sheet: ${name} ---\n${textRows.join("\n")}`;
  });

  return { extractedText: sheets.join("\n\n") };
}
