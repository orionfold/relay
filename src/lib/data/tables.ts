import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { eq, and, like, or, desc, sql, count } from "drizzle-orm";
import {
  userTables,
  userTableColumns,
  userTableRows,
  userTableTemplates,
  projects,
} from "@/lib/db/schema";
import type {
  CreateTableInput,
  UpdateTableInput,
  AddColumnInput,
  UpdateColumnInput,
  AddRowInput,
  UpdateRowInput,
  ColumnDef,
  RowQueryOptions,
  CloneFromTemplateInput,
} from "@/lib/tables/types";
import { buildRowQuery } from "@/lib/tables/query-builder";
import { hashRowData } from "@/lib/data/row-hash";

// ── Table CRUD ───────────────────────────────────────────────────────

export async function createTable(input: CreateTableInput) {
  const id = randomUUID();
  const now = new Date();

  // Build column schema from input columns
  const columns = (input.columns ?? []).map((col, i) => ({
    ...col,
    position: col.position ?? i,
  }));

  await db.insert(userTables).values({
    id,
    name: input.name,
    description: input.description ?? null,
    projectId: input.projectId ?? null,
    columnSchema: JSON.stringify(columns),
    rowCount: 0,
    source: input.source ?? "manual",
    templateId: input.templateId ?? null,
    createdAt: now,
    updatedAt: now,
  });

  // Create individual column records
  if (columns.length > 0) {
    await db.insert(userTableColumns).values(
      columns.map((col) => ({
        id: randomUUID(),
        tableId: id,
        name: col.name,
        displayName: col.displayName,
        dataType: col.dataType,
        position: col.position,
        required: col.required ?? false,
        defaultValue: col.defaultValue ?? null,
        config: col.config ? JSON.stringify(col.config) : null,
        createdAt: now,
        updatedAt: now,
      }))
    );
  }

  return db.select().from(userTables).where(eq(userTables.id, id)).get()!;
}

export async function getTable(id: string) {
  return db.select().from(userTables).where(eq(userTables.id, id)).get() ?? null;
}

export async function listTables(filters?: {
  projectId?: string;
  source?: string;
  search?: string;
}) {
  const conditions = [];
  if (filters?.projectId) {
    conditions.push(eq(userTables.projectId, filters.projectId));
  }
  if (filters?.source) {
    conditions.push(eq(userTables.source, filters.source as "manual" | "imported" | "agent" | "template"));
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(userTables.name, `%${filters.search}%`),
        like(userTables.description, `%${filters.search}%`)
      )
    );
  }

  const rows = db
    .select({
      table: userTables,
      projectName: projects.name,
    })
    .from(userTables)
    .leftJoin(projects, eq(userTables.projectId, projects.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(userTables.updatedAt))
    .all();

  return rows.map((r) => ({
    ...r.table,
    projectName: r.projectName,
    columnCount: parseColumnSchema(r.table.columnSchema).length,
  }));
}

export async function updateTable(id: string, updates: UpdateTableInput) {
  await db
    .update(userTables)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(userTables.id, id));

  return db.select().from(userTables).where(eq(userTables.id, id)).get() ?? null;
}

export async function deleteTable(id: string) {
  // FK-safe: delete children first
  await db.delete(userTableRows).where(eq(userTableRows.tableId, id));
  await db.delete(userTableColumns).where(eq(userTableColumns.tableId, id));
  await db.delete(userTables).where(eq(userTables.id, id));
}

// ── Column CRUD ──────────────────────────────────────────────────────

export async function getColumns(tableId: string) {
  return db
    .select()
    .from(userTableColumns)
    .where(eq(userTableColumns.tableId, tableId))
    .orderBy(userTableColumns.position)
    .all();
}

export async function addColumn(tableId: string, input: AddColumnInput) {
  const id = randomUUID();
  const now = new Date();

  // Get current max position
  const existing = await getColumns(tableId);
  const position = existing.length;

  await db.insert(userTableColumns).values({
    id,
    tableId,
    name: input.name,
    displayName: input.displayName,
    dataType: input.dataType,
    position,
    required: input.required ?? false,
    defaultValue: input.defaultValue ?? null,
    config: input.config ? JSON.stringify(input.config) : null,
    createdAt: now,
    updatedAt: now,
  });

  // Update the denormalized column_schema on the table
  await syncColumnSchema(tableId);

  return db.select().from(userTableColumns).where(eq(userTableColumns.id, id)).get()!;
}

export async function updateColumn(columnId: string, input: UpdateColumnInput) {
  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (input.displayName !== undefined) updates.displayName = input.displayName;
  if (input.dataType !== undefined) updates.dataType = input.dataType;
  if (input.required !== undefined) updates.required = input.required;
  if (input.defaultValue !== undefined) updates.defaultValue = input.defaultValue;
  if (input.config !== undefined) updates.config = input.config ? JSON.stringify(input.config) : null;

  await db.update(userTableColumns).set(updates).where(eq(userTableColumns.id, columnId));

  // Get column to find table ID for schema sync
  const col = db.select().from(userTableColumns).where(eq(userTableColumns.id, columnId)).get();
  if (col) await syncColumnSchema(col.tableId);

  return col ?? null;
}

export async function deleteColumn(columnId: string) {
  const col = db.select().from(userTableColumns).where(eq(userTableColumns.id, columnId)).get();
  if (!col) return;

  await db.delete(userTableColumns).where(eq(userTableColumns.id, columnId));
  await syncColumnSchema(col.tableId);
}

export async function reorderColumns(tableId: string, columnIds: string[]) {
  const now = new Date();
  for (let i = 0; i < columnIds.length; i++) {
    await db
      .update(userTableColumns)
      .set({ position: i, updatedAt: now })
      .where(eq(userTableColumns.id, columnIds[i]));
  }
  await syncColumnSchema(tableId);
}

/** Sync the denormalized column_schema JSON on user_tables from user_table_columns */
async function syncColumnSchema(tableId: string) {
  const columns = await getColumns(tableId);
  const schema: ColumnDef[] = columns.map((c) => ({
    name: c.name,
    displayName: c.displayName,
    dataType: c.dataType as ColumnDef["dataType"],
    position: c.position,
    required: c.required,
    defaultValue: c.defaultValue,
    config: c.config ? JSON.parse(c.config) : null,
  }));

  await db
    .update(userTables)
    .set({ columnSchema: JSON.stringify(schema), updatedAt: new Date() })
    .where(eq(userTables.id, tableId));
}

// ── Row History & Triggers ──────────────────────────────────────────
import { snapshotBeforeUpdate, snapshotBeforeDelete } from "@/lib/tables/history";
import { evaluateTriggers } from "@/lib/tables/trigger-evaluator";
import { evaluateManifestTriggers } from "@/lib/apps/manifest-trigger-dispatch";

// ── Row CRUD ─────────────────────────────────────────────────────────

/**
 * Normalize row data so keys always match a column's canonical `name`,
 * not its human-friendly `displayName`. Callers (notably the LLM via the
 * `add_rows` chat tool) sometimes use the displayName they saw in the
 * schema preview — that produces rows whose values are invisible to the
 * spreadsheet renderer (which reads `data[col.name]`) and to triggers
 * (which filter by canonical name). Rewriting at this single chokepoint
 * also covers `updateRow` and any future writers without each having to
 * remember the rule.
 *
 * Rules (in order of precedence):
 *   1. Key already matches a canonical column.name → pass through unchanged.
 *   2. Key matches a column.displayName → rewrite to that column's name.
 *      If both a canonical-name entry and a display-name entry exist for
 *      the same column, the canonical entry wins (the display-name copy
 *      is dropped) — the LLM occasionally sends both.
 *   3. Key matches case-insensitively against a column.displayName → rewrite.
 *      Catches `"ticker"` → `Ticker` style mismatches.
 *   4. Key matches nothing → pass through unchanged. We don't drop unknown
 *      keys; downstream readers will simply ignore them, and preserving them
 *      keeps the door open for ad-hoc metadata.
 */
function normalizeRowKeysAgainstColumns(
  data: Record<string, unknown>,
  columns: Array<{ name: string; displayName: string }>
): Record<string, unknown> {
  if (columns.length === 0) return data;

  const canonicalNames = new Set(columns.map((c) => c.name));
  const displayToName = new Map<string, string>();
  const lowerDisplayToName = new Map<string, string>();
  for (const c of columns) {
    if (c.displayName && c.displayName !== c.name) {
      displayToName.set(c.displayName, c.name);
      lowerDisplayToName.set(c.displayName.toLowerCase(), c.name);
    }
  }

  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(data)) {
    if (canonicalNames.has(rawKey)) {
      out[rawKey] = value;
      continue;
    }
    const exact = displayToName.get(rawKey);
    if (exact) {
      // Preserve any pre-existing canonical entry over a display-name dupe.
      if (!(exact in out)) out[exact] = value;
      continue;
    }
    const lower = lowerDisplayToName.get(rawKey.toLowerCase());
    if (lower) {
      if (!(lower in out)) out[lower] = value;
      continue;
    }
    // Unknown key: keep as-is so we don't silently lose data.
    out[rawKey] = value;
  }

  return out;
}

/**
 * Internal: load minimal column info for normalization without re-parsing
 * the full schema each row. Returns [] if the table has no column rows yet
 * (which makes normalization a no-op, the safe behavior).
 */
function loadColumnsForNormalization(
  tableId: string
): Array<{ name: string; displayName: string }> {
  return db
    .select({
      name: userTableColumns.name,
      displayName: userTableColumns.displayName,
    })
    .from(userTableColumns)
    .where(eq(userTableColumns.tableId, tableId))
    .all();
}

/** Exported for the row-key backfill script. */
export function _normalizeRowKeysAgainstColumns(
  data: Record<string, unknown>,
  columns: Array<{ name: string; displayName: string }>
): Record<string, unknown> {
  return normalizeRowKeysAgainstColumns(data, columns);
}

export interface AddRowsResult {
  /** IDs of rows actually inserted (excludes deduped rows). */
  ids: string[];
  /** SHA-256 hashes of rows skipped because of duplicate (table_id, data_hash). */
  skippedHashes: string[];
}

export async function addRows(tableId: string, rows: AddRowInput[]): Promise<AddRowsResult> {
  const now = new Date();

  // Load column metadata once so every row in this batch normalizes
  // against the same schema snapshot.
  const cols = loadColumnsForNormalization(tableId);
  const columnNames = cols.map((c) => c.name);

  // Get current max position
  const maxPos = db
    .select({ maxPos: sql<number>`COALESCE(MAX(position), -1)` })
    .from(userTableRows)
    .where(eq(userTableRows.tableId, tableId))
    .get();
  let nextPosition = (maxPos?.maxPos ?? -1) + 1;

  const normalizedRows: AddRowInput[] = rows.map((row) => ({
    ...row,
    data: normalizeRowKeysAgainstColumns(row.data, cols),
  }));

  const insertedIds: string[] = [];
  const skippedHashes: string[] = [];
  const seenInBatch = new Set<string>();
  // Parallel array to track which input row got which inserted ID (or skipped).
  // Used to fire triggers only for actually-inserted rows.
  const idForRow: Array<string | null> = [];

  for (const row of normalizedRows) {
    const dataHash = hashRowData(row.data, columnNames);

    // Within-batch guard: skip exact dup before hitting the DB.
    if (seenInBatch.has(dataHash)) {
      skippedHashes.push(dataHash);
      idForRow.push(null);
      continue;
    }
    seenInBatch.add(dataHash);

    const id = randomUUID();
    // ON CONFLICT DO NOTHING (no target) matches ANY unique constraint —
    // including the partial UNIQUE INDEX on (table_id, data_hash). Specifying
    // `{ target: [...] }` would require echoing the partial WHERE clause,
    // which Drizzle's syntax doesn't emit; SQLite then refuses the upsert.
    const result = await db
      .insert(userTableRows)
      .values({
        id,
        tableId,
        data: JSON.stringify(row.data),
        dataHash,
        position: nextPosition,
        createdBy: row.createdBy ?? "user",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: userTableRows.id });

    if (result.length > 0) {
      insertedIds.push(id);
      idForRow.push(id);
      nextPosition++;
    } else {
      skippedHashes.push(dataHash);
      idForRow.push(null);
    }
  }

  // Update denormalized row count only if at least one row landed.
  if (insertedIds.length > 0) {
    await updateRowCount(tableId);
  }

  // Fire triggers only for rows actually inserted. Use the normalized
  // payload so trigger conditions and manifest variables resolve against
  // canonical column names — same contract as the persisted row.
  for (let i = 0; i < normalizedRows.length; i++) {
    const id = idForRow[i];
    if (!id) continue;
    evaluateTriggers(tableId, "row_added", normalizedRows[i].data).catch(() => {});
    evaluateManifestTriggers(tableId, id, normalizedRows[i].data).catch(() => {});
  }

  return { ids: insertedIds, skippedHashes };
}

export async function getRow(rowId: string) {
  return db.select().from(userTableRows).where(eq(userTableRows.id, rowId)).get() ?? null;
}

export async function listRows(tableId: string, options?: RowQueryOptions) {
  const table = await getTable(tableId);
  if (!table) return [];

  const columnSchema = parseColumnSchema(table.columnSchema);
  const query = buildRowQuery(columnSchema, options ?? {});

  const whereClause = query.where
    ? and(eq(userTableRows.tableId, tableId), query.where)
    : eq(userTableRows.tableId, tableId);

  const orderClause = query.orderBy ?? userTableRows.position;

  return db
    .select()
    .from(userTableRows)
    .where(whereClause)
    .orderBy(orderClause)
    .limit(query.limit)
    .offset(query.offset)
    .all();
}

export async function updateRow(rowId: string, input: UpdateRowInput) {
  const existing = await getRow(rowId);
  if (!existing) return null;

  // Snapshot before mutation (non-blocking)
  try { snapshotBeforeUpdate(rowId, existing.tableId, existing.data, "user"); } catch { /* history is non-critical */ }

  // Merge new data with existing data — normalize the patch first so any
  // display_name keys in the partial update collapse onto the canonical
  // names already on disk, instead of writing a duplicate display_name
  // entry alongside the canonical one.
  const cols = loadColumnsForNormalization(existing.tableId);
  const normalizedPatch = normalizeRowKeysAgainstColumns(input.data, cols);
  const existingData = JSON.parse(existing.data) as Record<string, unknown>;
  const mergedData = { ...existingData, ...normalizedPatch };

  await db
    .update(userTableRows)
    .set({
      data: JSON.stringify(mergedData),
      updatedAt: new Date(),
    })
    .where(eq(userTableRows.id, rowId));

  // Fire triggers (fire-and-forget)
  evaluateTriggers(existing.tableId, "row_updated", mergedData).catch(() => {});

  return db.select().from(userTableRows).where(eq(userTableRows.id, rowId)).get() ?? null;
}

export async function deleteRows(rowIds: string[]) {
  if (rowIds.length === 0) return;

  // Get table ID from first row to update count after
  const firstRow = await getRow(rowIds[0]);
  if (!firstRow) return;

  for (const id of rowIds) {
    const row = await getRow(id);
    if (row) {
      // Snapshot before deletion (non-blocking)
      try { snapshotBeforeDelete(id, row.tableId, row.data, "user"); } catch { /* history is non-critical */ }
      // Fire trigger before row is gone (fire-and-forget)
      evaluateTriggers(row.tableId, "row_deleted", JSON.parse(row.data) as Record<string, unknown>).catch(() => {});
    }
    await db.delete(userTableRows).where(eq(userTableRows.id, id));
  }

  await updateRowCount(firstRow.tableId);
}

/** Update the denormalized row_count on user_tables */
async function updateRowCount(tableId: string) {
  const result = db
    .select({ total: count() })
    .from(userTableRows)
    .where(eq(userTableRows.tableId, tableId))
    .get();

  await db
    .update(userTables)
    .set({ rowCount: result?.total ?? 0, updatedAt: new Date() })
    .where(eq(userTables.id, tableId));
}

// ── Template Operations ──────────────────────────────────────────────

export async function listTemplates(filters?: {
  category?: string;
  scope?: string;
}) {
  const conditions = [];
  if (filters?.category) {
    conditions.push(eq(userTableTemplates.category, filters.category as "business" | "personal" | "pm" | "finance" | "content"));
  }
  if (filters?.scope) {
    conditions.push(eq(userTableTemplates.scope, filters.scope as "system" | "user"));
  }

  return db
    .select()
    .from(userTableTemplates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(userTableTemplates.name)
    .all();
}

export async function getTemplate(id: string) {
  return db.select().from(userTableTemplates).where(eq(userTableTemplates.id, id)).get() ?? null;
}

export async function cloneFromTemplate(input: CloneFromTemplateInput) {
  const template = await getTemplate(input.templateId);
  if (!template) throw new Error("Template not found");

  const columns = parseColumnSchema(template.columnSchema);

  const table = await createTable({
    name: input.name,
    projectId: input.projectId,
    columns,
    source: "template",
    templateId: template.id,
  });

  // Optionally insert sample data
  if (input.includeSampleData && template.sampleData) {
    const sampleRows = JSON.parse(template.sampleData) as Record<string, unknown>[];
    if (sampleRows.length > 0) {
      await addRows(
        table.id,
        sampleRows.map((data) => ({ data }))
      );
    }
  }

  return table;
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseColumnSchema(raw: string): ColumnDef[] {
  try {
    return JSON.parse(raw) as ColumnDef[];
  } catch {
    return [];
  }
}
