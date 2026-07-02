/**
 * One-shot backfill: rewrite user_table_rows.data so keys match the
 * canonical column.name. Idempotent — safe to re-run.
 *
 * Use after pulling the F1 fix from HANDOFF.md (2026-05-08). Existing
 * rows that landed via the chat tool's `add_rows` were keyed by display
 * name (e.g. "Cost Basis ($)") and rendered as "—". The normalizer here
 * mirrors `_normalizeRowKeysAgainstColumns` in src/lib/data/tables.ts —
 * the regression test in tables-row-key-normalization.test.ts pins that
 * contract; this script repeats the rules verbatim because pulling the
 * helper through tsx triggers an unrelated ESM/CJS issue in the import
 * chain (src/lib/utils/app-root.ts uses CJS require).
 *
 * Usage: npx tsx scripts/backfill-row-key-normalization.ts [--dry-run]
 */

import Database from "better-sqlite3";
import { homedir } from "os";
import { join } from "path";

const dryRun = process.argv.includes("--dry-run");

const dataDir =
  process.env.RELAY_DATA_DIR ?? join(homedir(), ".relay");
const dbPath = join(dataDir, "relay.db");

interface ColumnRow {
  name: string;
  display_name: string;
}
interface UserTable {
  id: string;
  name: string;
}
interface RowRow {
  id: string;
  data: string;
}

function normalizeRowKeysAgainstColumns(
  data: Record<string, unknown>,
  columns: ColumnRow[]
): Record<string, unknown> {
  if (columns.length === 0) return data;

  const canonicalNames = new Set(columns.map((c) => c.name));
  const displayToName = new Map<string, string>();
  const lowerDisplayToName = new Map<string, string>();
  for (const c of columns) {
    if (c.display_name && c.display_name !== c.name) {
      displayToName.set(c.display_name, c.name);
      lowerDisplayToName.set(c.display_name.toLowerCase(), c.name);
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
      if (!(exact in out)) out[exact] = value;
      continue;
    }
    const lower = lowerDisplayToName.get(rawKey.toLowerCase());
    if (lower) {
      if (!(lower in out)) out[lower] = value;
      continue;
    }
    out[rawKey] = value;
  }

  return out;
}

interface ChangeReport {
  tableId: string;
  tableName: string;
  rowsScanned: number;
  rowsRewritten: number;
}

function backfill(db: Database.Database): ChangeReport[] {
  const tables = db
    .prepare("SELECT id, name FROM user_tables")
    .all() as UserTable[];

  const reports: ChangeReport[] = [];

  const colsStmt = db.prepare(
    "SELECT name, display_name FROM user_table_columns WHERE table_id = ?"
  );
  const rowsStmt = db.prepare(
    "SELECT id, data FROM user_table_rows WHERE table_id = ?"
  );
  const updateStmt = db.prepare(
    "UPDATE user_table_rows SET data = ?, updated_at = ? WHERE id = ?"
  );

  for (const table of tables) {
    const cols = colsStmt.all(table.id) as ColumnRow[];
    if (cols.length === 0) continue;

    const rows = rowsStmt.all(table.id) as RowRow[];

    let rewritten = 0;
    for (const row of rows) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(row.data) as Record<string, unknown>;
      } catch {
        continue;
      }
      const normalized = normalizeRowKeysAgainstColumns(parsed, cols);
      const before = JSON.stringify(parsed);
      const after = JSON.stringify(normalized);
      if (before === after) continue;

      rewritten++;
      if (!dryRun) {
        updateStmt.run(after, new Date().toISOString(), row.id);
      }
    }

    reports.push({
      tableId: table.id,
      tableName: table.name,
      rowsScanned: rows.length,
      rowsRewritten: rewritten,
    });
  }

  return reports;
}

function main() {
  const db = new Database(dbPath);
  try {
    const reports = backfill(db);
    const totalRewritten = reports.reduce((s, r) => s + r.rowsRewritten, 0);
    const totalScanned = reports.reduce((s, r) => s + r.rowsScanned, 0);
    const affected = reports.filter((r) => r.rowsRewritten > 0);

    console.log(
      `[backfill] DB: ${dbPath}`
    );
    console.log(
      `[backfill] scanned ${totalScanned} rows across ${reports.length} tables; ${
        dryRun ? "would rewrite" : "rewrote"
      } ${totalRewritten} rows in ${affected.length} tables`
    );

    for (const r of affected) {
      console.log(
        `  - ${r.tableName} (${r.tableId}): ${r.rowsRewritten}/${r.rowsScanned} rows`
      );
    }

    if (totalRewritten === 0) {
      console.log("[backfill] no rows needed normalization — clean state");
    }
  } finally {
    db.close();
  }
}

main();
