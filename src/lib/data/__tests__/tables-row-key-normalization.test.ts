import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  userTables,
  userTableColumns,
  userTableRowHistory,
  userTableRows,
} from "@/lib/db/schema";
import {
  addRows,
  updateRow,
  _normalizeRowKeysAgainstColumns,
} from "@/lib/data/tables";

/**
 * Regression for HANDOFF.md F1 (P0): rows arriving via the chat tool were
 * keyed by display_name (e.g. "Cost Basis ($)") while the renderer reads
 * by canonical name (e.g. "cost_basis"), so every cell rendered as "—".
 *
 * The fix lives at the addRows/updateRow chokepoint in src/lib/data/tables.ts;
 * these tests pin the contract so it doesn't regress when the chat tool or
 * any other writer evolves.
 */

vi.mock("@/lib/tables/trigger-evaluator", () => ({
  evaluateTriggers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/apps/manifest-trigger-dispatch", () => ({
  evaluateManifestTriggers: vi.fn().mockResolvedValue(undefined),
}));

const TABLE_ID = "tbl-norm-test";

async function provisionTable(
  columns: Array<{ name: string; displayName: string }>
) {
  const now = new Date();
  await db
    .delete(userTableRowHistory)
    .where(eq(userTableRowHistory.tableId, TABLE_ID));
  await db.delete(userTableRows).where(eq(userTableRows.tableId, TABLE_ID));
  await db
    .delete(userTableColumns)
    .where(eq(userTableColumns.tableId, TABLE_ID));
  await db.delete(userTables).where(eq(userTables.id, TABLE_ID));

  await db.insert(userTables).values({
    id: TABLE_ID,
    name: TABLE_ID,
    columnSchema: JSON.stringify(
      columns.map((c, i) => ({
        name: c.name,
        displayName: c.displayName,
        dataType: "text" as const,
        position: i,
      }))
    ),
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(userTableColumns).values(
    columns.map((c, i) => ({
      id: `col-${TABLE_ID}-${c.name}`,
      tableId: TABLE_ID,
      name: c.name,
      displayName: c.displayName,
      dataType: "text" as const,
      position: i,
      createdAt: now,
      updatedAt: now,
    }))
  );
}

function readRowData(rowId: string): Record<string, unknown> {
  const row = db
    .select({ data: userTableRows.data })
    .from(userTableRows)
    .where(eq(userTableRows.id, rowId))
    .get();
  if (!row) throw new Error(`row ${rowId} missing`);
  return JSON.parse(row.data) as Record<string, unknown>;
}

describe("addRows row-key normalization", () => {
  beforeEach(async () => {
    await provisionTable([
      { name: "ticker", displayName: "Ticker" },
      { name: "cost_basis", displayName: "Cost Basis ($)" },
    ]);
  });

  it("rewrites display_name keys to canonical column names on insert", async () => {
    const { ids: [rowId] } = await addRows(TABLE_ID, [
      { data: { Ticker: "AAPL", "Cost Basis ($)": 145.2 } },
    ]);
    const data = readRowData(rowId);
    expect(data).toEqual({ ticker: "AAPL", cost_basis: 145.2 });
  });

  it("passes canonical-name keys through unchanged", async () => {
    const { ids: [rowId] } = await addRows(TABLE_ID, [
      { data: { ticker: "MSFT", cost_basis: 310.5 } },
    ]);
    expect(readRowData(rowId)).toEqual({ ticker: "MSFT", cost_basis: 310.5 });
  });

  it("rewrites case-insensitively when the agent lowercases display names", async () => {
    const { ids: [rowId] } = await addRows(TABLE_ID, [
      { data: { ticker: "NVDA", "cost basis ($)": 425.75 } },
    ]);
    expect(readRowData(rowId)).toEqual({ ticker: "NVDA", cost_basis: 425.75 });
  });

  it("preserves canonical entry when both canonical and display key are sent", async () => {
    const { ids: [rowId] } = await addRows(TABLE_ID, [
      { data: { cost_basis: 1, "Cost Basis ($)": 2 } },
    ]);
    expect(readRowData(rowId)).toEqual({ cost_basis: 1 });
  });

  it("retains unknown keys instead of dropping them", async () => {
    const { ids: [rowId] } = await addRows(TABLE_ID, [
      { data: { ticker: "GOOG", note: "added by hand" } },
    ]);
    expect(readRowData(rowId)).toEqual({ ticker: "GOOG", note: "added by hand" });
  });
});

describe("updateRow row-key normalization", () => {
  beforeEach(async () => {
    await provisionTable([
      { name: "ticker", displayName: "Ticker" },
      { name: "current_price", displayName: "Current Price ($)" },
    ]);
  });

  it("collapses a display_name patch onto the canonical key already on disk", async () => {
    const { ids: [rowId] } = await addRows(TABLE_ID, [
      { data: { ticker: "AAPL", current_price: 100 } },
    ]);
    const updated = await updateRow(rowId, {
      data: { "Current Price ($)": 293.52 },
    });
    expect(updated).not.toBeNull();
    expect(readRowData(rowId)).toEqual({ ticker: "AAPL", current_price: 293.52 });
  });
});

describe("_normalizeRowKeysAgainstColumns helper", () => {
  it("is a no-op when no columns are provided (fresh-table guard)", () => {
    const out = _normalizeRowKeysAgainstColumns(
      { Anything: 1, "Else Goes": 2 },
      []
    );
    expect(out).toEqual({ Anything: 1, "Else Goes": 2 });
  });
});
