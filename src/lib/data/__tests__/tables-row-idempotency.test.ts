import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  userTables,
  userTableColumns,
  userTableRows,
} from "@/lib/db/schema";
import { addRows } from "@/lib/data/tables";

/**
 * Regression for F10 (HANDOFF.md): an agent inserted 13 rows from a 12-row
 * CSV because it re-read one row mid-batch. Both within-batch and across-batch
 * duplicate rows must collide on the partial UNIQUE INDEX over
 * (table_id, data_hash).
 *
 * The fix lives at the addRows chokepoint in src/lib/data/tables.ts:
 * canonical hash + onConflictDoNothing.
 */

vi.mock("@/lib/tables/trigger-evaluator", () => ({
  evaluateTriggers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/apps/manifest-trigger-dispatch", () => ({
  evaluateManifestTriggers: vi.fn().mockResolvedValue(undefined),
}));

const TABLE_ID = "tbl-idem-test";

async function provisionTable() {
  const now = new Date();
  await db.delete(userTableRows).where(eq(userTableRows.tableId, TABLE_ID));
  await db
    .delete(userTableColumns)
    .where(eq(userTableColumns.tableId, TABLE_ID));
  await db.delete(userTables).where(eq(userTables.id, TABLE_ID));

  await db.insert(userTables).values({
    id: TABLE_ID,
    name: TABLE_ID,
    columnSchema: JSON.stringify([
      { name: "ticker", displayName: "Ticker", dataType: "text", position: 0 },
      { name: "shares", displayName: "Shares", dataType: "number", position: 1 },
    ]),
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(userTableColumns).values([
    {
      id: `col-${TABLE_ID}-ticker`,
      tableId: TABLE_ID,
      name: "ticker",
      displayName: "Ticker",
      dataType: "text",
      position: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: `col-${TABLE_ID}-shares`,
      tableId: TABLE_ID,
      name: "shares",
      displayName: "Shares",
      dataType: "number",
      position: 1,
      createdAt: now,
      updatedAt: now,
    },
  ]);
}

describe("addRows F10 idempotency", () => {
  beforeEach(async () => {
    await provisionTable();
  });

  it("dedupes within-batch identical rows (the 13-from-12 reproducer)", async () => {
    const rows = [
      { data: { ticker: "AAPL", shares: 10 } },
      { data: { ticker: "AAPL", shares: 10 } }, // exact dup
      { data: { ticker: "MSFT", shares: 5 } },
    ];
    const { ids, skippedHashes } = await addRows(TABLE_ID, rows);
    expect(ids.length).toBe(2);
    expect(skippedHashes.length).toBe(1);
  });

  it("dedupes across-batch via the partial unique index", async () => {
    const first = await addRows(TABLE_ID, [
      { data: { ticker: "GOOG", shares: 7 } },
    ]);
    expect(first.ids.length).toBe(1);
    expect(first.skippedHashes.length).toBe(0);

    const second = await addRows(TABLE_ID, [
      { data: { ticker: "GOOG", shares: 7 } }, // same data
    ]);
    expect(second.ids.length).toBe(0);
    expect(second.skippedHashes.length).toBe(1);
  });

  it("accepts identical-data rows on different tables (scope-by-table_id)", async () => {
    const otherId = "tbl-idem-test-other";
    const now = new Date();
    await db.delete(userTableRows).where(eq(userTableRows.tableId, otherId));
    await db.delete(userTableColumns).where(eq(userTableColumns.tableId, otherId));
    await db.delete(userTables).where(eq(userTables.id, otherId));
    await db.insert(userTables).values({
      id: otherId,
      name: otherId,
      columnSchema: JSON.stringify([
        { name: "ticker", displayName: "Ticker", dataType: "text", position: 0 },
        { name: "shares", displayName: "Shares", dataType: "number", position: 1 },
      ]),
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(userTableColumns).values([
      {
        id: `col-${otherId}-ticker`,
        tableId: otherId,
        name: "ticker",
        displayName: "Ticker",
        dataType: "text",
        position: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `col-${otherId}-shares`,
        tableId: otherId,
        name: "shares",
        displayName: "Shares",
        dataType: "number",
        position: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const a = await addRows(TABLE_ID, [{ data: { ticker: "X", shares: 1 } }]);
    const b = await addRows(otherId, [{ data: { ticker: "X", shares: 1 } }]);
    expect(a.ids.length).toBe(1);
    expect(b.ids.length).toBe(1);
  });

  it("12-row CSV with 1 mid-batch duplicate inserts 11, skips 1", async () => {
    const csvRows = Array.from({ length: 12 }, (_, i) => ({
      data: { ticker: `T${i}`, shares: i + 1 },
    }));
    csvRows[7] = csvRows[3]; // simulate agent re-read

    const { ids, skippedHashes } = await addRows(TABLE_ID, csvRows);
    expect(ids.length).toBe(11);
    expect(skippedHashes.length).toBe(1);
  });

  it("treats null and empty-string values as identical for dedupe", async () => {
    const a = await addRows(TABLE_ID, [{ data: { ticker: "Z" } }]);
    const b = await addRows(TABLE_ID, [{ data: { ticker: "Z", shares: null } }]);
    const c = await addRows(TABLE_ID, [{ data: { ticker: "Z", shares: "" } }]);
    expect(a.ids.length).toBe(1);
    expect(b.ids.length).toBe(0);
    expect(b.skippedHashes.length).toBe(1);
    expect(c.ids.length).toBe(0);
    expect(c.skippedHashes.length).toBe(1);
  });
});
