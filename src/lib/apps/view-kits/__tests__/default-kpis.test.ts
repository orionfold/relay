import { describe, expect, it } from "vitest";
import { defaultLedgerKpis, defaultTrackerKpis } from "../default-kpis";

describe("defaultTrackerKpis — synthesizes KpiSpecs from hero columns", () => {
  it("returns empty when no table is provided", () => {
    expect(defaultTrackerKpis(undefined, [])).toEqual([]);
  });

  it("synthesizes a 'Total entries' tableCount KPI", () => {
    const kpis = defaultTrackerKpis("tbl-1", [
      { name: "habit", type: "text" },
      { name: "active", type: "boolean" },
    ]);
    expect(kpis[0]).toMatchObject({
      label: "Total entries",
      source: { kind: "tableCount", table: "tbl-1" },
      format: "int",
    });
  });

  it("synthesizes an 'Active' tableCount KPI when an active boolean column exists", () => {
    const kpis = defaultTrackerKpis("tbl-1", [
      { name: "habit", type: "text" },
      { name: "active", type: "boolean" },
    ]);
    const active = kpis.find((k) => k.label === "Active");
    expect(active).toBeDefined();
    expect(active?.source).toMatchObject({
      kind: "tableCount",
      table: "tbl-1",
      where: "active",
    });
  });

  it("synthesizes a 'Current streak' tableLatest KPI when a *_streak column exists", () => {
    const kpis = defaultTrackerKpis("tbl-1", [
      { name: "habit", type: "text" },
      { name: "current_streak", type: "number" },
    ]);
    const streak = kpis.find((k) => k.label === "Current streak");
    expect(streak).toBeDefined();
    expect(streak?.source).toMatchObject({
      kind: "tableLatest",
      table: "tbl-1",
      column: "current_streak",
    });
  });

  it("returns at most 4 KPIs", () => {
    const kpis = defaultTrackerKpis("tbl-1", [
      { name: "active", type: "boolean" },
      { name: "completed", type: "boolean" },
      { name: "current_streak", type: "number" },
      { name: "best_streak", type: "number" },
      { name: "amount", type: "number" },
    ]);
    expect(kpis.length).toBeLessThanOrEqual(4);
  });

  it("assigns unique stable ids", () => {
    const kpis = defaultTrackerKpis("tbl-1", [
      { name: "active", type: "boolean" },
      { name: "current_streak", type: "number" },
    ]);
    const ids = kpis.map((k) => k.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("defaultLedgerKpis", () => {
  it("synthesizes Net + Inflow + Outflow when currency column present", () => {
    const cols = [
      { name: "amount", type: "number", semantic: "currency" },
      { name: "category", type: "string" },
    ];
    const kpis = defaultLedgerKpis("transactions", cols, "mtd");
    expect(kpis.map((k) => k.id)).toEqual(["net", "inflow", "outflow"]);
    expect(kpis[0].source.kind).toBe("tableSumWindowed");
    expect(kpis[1].source).toMatchObject({ sign: "positive", window: "mtd" });
    expect(kpis[2].source).toMatchObject({ sign: "negative", window: "mtd" });
    expect(kpis.map((k) => k.semantics?.favorable)).toEqual([
      "neutral",
      "higher",
      "closer-to-zero",
    ]);
  });

  it("appends Run-rate KPI when blueprintId provided", () => {
    const cols = [{ name: "amount", type: "number", semantic: "currency" }];
    const kpis = defaultLedgerKpis("transactions", cols, "mtd", "monthly-close");
    expect(kpis.map((k) => k.id)).toContain("run-rate");
  });

  it("returns empty array when no currency column", () => {
    const cols = [{ name: "category", type: "string" }];
    const kpis = defaultLedgerKpis("transactions", cols, "mtd");
    expect(kpis).toEqual([]);
  });

  it("scopes window to whatever period is passed", () => {
    const cols = [{ name: "amount", type: "number", semantic: "currency" }];
    const kpis = defaultLedgerKpis("t", cols, "ytd");
    expect(kpis[0].source).toMatchObject({ window: "ytd" });
  });
});
