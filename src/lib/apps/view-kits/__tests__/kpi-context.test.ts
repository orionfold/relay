import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userTables, userTableRows } from "@/lib/db/schema";
import { createKpiContext, windowStart } from "../kpi-context";

const TEST_TABLE = "test-transactions-kpi-context";

beforeEach(() => {
  // Clean up any prior rows + parent table to keep state deterministic
  db.delete(userTableRows).where(eq(userTableRows.tableId, TEST_TABLE)).run();
  db.delete(userTables).where(eq(userTables.id, TEST_TABLE)).run();

  // Seed parent table (FK requirement) and 3 rows: +100 (this month),
  // -50 (this month), +200 (last month, mid-month so it survives MTD/YTD
  // boundary tests).
  const now = new Date();
  db.insert(userTables)
    .values({
      id: TEST_TABLE,
      name: "Test Transactions",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  db.insert(userTableRows)
    .values([
      {
        id: "r1",
        tableId: TEST_TABLE,
        data: JSON.stringify({ amount: 100 }),
        position: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "r2",
        tableId: TEST_TABLE,
        data: JSON.stringify({ amount: -50 }),
        position: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "r3",
        tableId: TEST_TABLE,
        data: JSON.stringify({ amount: 200 }),
        position: 2,
        createdAt: lastMonthDate,
        updatedAt: lastMonthDate,
      },
    ])
    .run();
});

describe("createKpiContext().tableSumWindowed", () => {
  it("sums all rows when no window/sign", async () => {
    const ctx = createKpiContext();
    const result = await ctx.tableSumWindowed(
      TEST_TABLE,
      "amount",
      undefined,
      undefined
    );
    expect(result).toBe(250); // 100 - 50 + 200
  });

  it("filters MTD when window=mtd", async () => {
    const ctx = createKpiContext();
    const result = await ctx.tableSumWindowed(
      TEST_TABLE,
      "amount",
      undefined,
      "mtd"
    );
    expect(result).toBe(50); // 100 - 50 (this month only)
  });

  it("filters positive amounts when sign=positive", async () => {
    const ctx = createKpiContext();
    const result = await ctx.tableSumWindowed(
      TEST_TABLE,
      "amount",
      "positive",
      undefined
    );
    expect(result).toBe(300); // 100 + 200
  });

  it("filters negative amounts when sign=negative", async () => {
    const ctx = createKpiContext();
    const result = await ctx.tableSumWindowed(
      TEST_TABLE,
      "amount",
      "negative",
      undefined
    );
    expect(result).toBe(-50);
  });

  it("combines sign + window (Inflow MTD)", async () => {
    const ctx = createKpiContext();
    const result = await ctx.tableSumWindowed(
      TEST_TABLE,
      "amount",
      "positive",
      "mtd"
    );
    expect(result).toBe(100); // only +100 this month
  });

  it("returns 0 for an empty table", async () => {
    const ctx = createKpiContext();
    const result = await ctx.tableSumWindowed(
      "does-not-exist",
      "amount",
      undefined,
      "mtd"
    );
    expect(result).toBe(0);
  });
});

describe("createKpiContext().tableSumWindowedSeries", () => {
  it("buckets this-month rows into a single day (net) within MTD", async () => {
    // r1 (+100) and r2 (-50) share `now`, so they collapse to one daily
    // bucket summing to 50; r3 (+200) is last month → outside MTD.
    const ctx = createKpiContext();
    const series = await ctx.tableSumWindowedSeries(
      TEST_TABLE,
      "amount",
      undefined,
      "mtd"
    );
    expect(series).toEqual([50]);
  });

  it("applies sign=positive to the series (Inflow MTD)", async () => {
    const ctx = createKpiContext();
    const series = await ctx.tableSumWindowedSeries(
      TEST_TABLE,
      "amount",
      "positive",
      "mtd"
    );
    expect(series).toEqual([100]); // only +100 survives the positive filter
  });

  it("includes last-month rows under a YTD window", async () => {
    // YTD spans both months; r3 (+200, last month) and the current-month
    // net (50) are separate daily buckets, ascending by date.
    const ctx = createKpiContext();
    const series = await ctx.tableSumWindowedSeries(
      TEST_TABLE,
      "amount",
      undefined,
      "ytd"
    );
    expect(series.reduce((a, b) => a + b, 0)).toBe(250); // 200 + 50
    expect(series.length).toBeGreaterThanOrEqual(1);
  });

  it("returns [] for a table with no rows in the window", async () => {
    const ctx = createKpiContext();
    const series = await ctx.tableSumWindowedSeries(
      "does-not-exist",
      "amount",
      undefined,
      "mtd"
    );
    expect(series).toEqual([]);
  });
});

describe("windowStart helper", () => {
  it("returns first day of current month for mtd", () => {
    const start = windowStart("mtd");
    const now = new Date();
    expect(start.getFullYear()).toBe(now.getFullYear());
    expect(start.getMonth()).toBe(now.getMonth());
    expect(start.getDate()).toBe(1);
  });

  it("returns first day of current quarter for qtd", () => {
    const start = windowStart("qtd");
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3) * 3;
    expect(start.getFullYear()).toBe(now.getFullYear());
    expect(start.getMonth()).toBe(q);
    expect(start.getDate()).toBe(1);
  });

  it("returns first day of current year for ytd", () => {
    const start = windowStart("ytd");
    const now = new Date();
    expect(start.getFullYear()).toBe(now.getFullYear());
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
  });
});
