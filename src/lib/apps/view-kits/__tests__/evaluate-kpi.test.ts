import { describe, expect, it, vi } from "vitest";
import { evaluateKpi, type KpiContext } from "../evaluate-kpi";
import type { ViewConfig } from "@/lib/apps/registry";

type KpiSpec = NonNullable<ViewConfig["bindings"]["kpis"]>[number];

function makeCtx(over: Partial<KpiContext> = {}): KpiContext {
  return {
    tableCount: vi.fn(async () => 42),
    tableSum: vi.fn(async () => 100),
    tableLatest: vi.fn(async () => "bar"),
    blueprintRunCount: vi.fn(async () => 7),
    scheduleNextFire: vi.fn(async () => 1_700_000_000_000),
    tableSumWindowed: vi.fn(async () => 0),
    tableSumWindowedSeries: vi.fn(async () => []),
    ...over,
  };
}

describe("evaluateKpi — pure switch over KpiSpec.source.kind", () => {
  it("dispatches tableCount to ctx.tableCount", async () => {
    const tableCount = vi.fn(async () => 5);
    const spec: KpiSpec = {
      id: "active",
      label: "Active",
      source: { kind: "tableCount", table: "tbl-1" },
      format: "int",
    };
    const tile = await evaluateKpi(spec, makeCtx({ tableCount }));
    expect(tableCount).toHaveBeenCalledWith("tbl-1", undefined);
    expect(tile).toEqual({ id: "active", label: "Active", value: "5" });
  });

  it("dispatches tableSum and formats currency", async () => {
    const tableSum = vi.fn(async () => 1234.5);
    const spec: KpiSpec = {
      id: "total",
      label: "Total",
      source: { kind: "tableSum", table: "tbl-1", column: "amount" },
      format: "currency",
    };
    const tile = await evaluateKpi(spec, makeCtx({ tableSum }));
    expect(tableSum).toHaveBeenCalledWith("tbl-1", "amount");
    expect(tile.value).toBe("$1,234.50");
  });

  it("dispatches tableLatest and passes strings through", async () => {
    const tableLatest = vi.fn(async () => "running");
    const spec: KpiSpec = {
      id: "last-status",
      label: "Last status",
      source: { kind: "tableLatest", table: "tbl-1", column: "status" },
      format: "int",
    };
    const tile = await evaluateKpi(spec, makeCtx({ tableLatest }));
    expect(tableLatest).toHaveBeenCalledWith("tbl-1", "status");
    expect(tile.value).toBe("running");
  });

  it("dispatches blueprintRunCount with window default", async () => {
    const blueprintRunCount = vi.fn(async () => 12);
    const spec: KpiSpec = {
      id: "runs",
      label: "Runs (7d)",
      source: { kind: "blueprintRunCount", blueprint: "bp-1", window: "7d" },
      format: "int",
    };
    const tile = await evaluateKpi(spec, makeCtx({ blueprintRunCount }));
    expect(blueprintRunCount).toHaveBeenCalledWith("bp-1", "7d");
    expect(tile.value).toBe("12");
  });

  it("dispatches scheduleNextFire and formats relative", async () => {
    const future = Date.now() + 2 * 86_400_000;
    const scheduleNextFire = vi.fn(async () => future);
    const spec: KpiSpec = {
      id: "next",
      label: "Next run",
      source: { kind: "scheduleNextFire", schedule: "sch-1" },
      format: "relative",
    };
    const tile = await evaluateKpi(spec, makeCtx({ scheduleNextFire }));
    expect(scheduleNextFire).toHaveBeenCalledWith("sch-1");
    expect(tile.value).toMatch(/in 2d/);
  });

  it("renders null source values as em dash", async () => {
    const tableLatest = vi.fn(async () => null);
    const spec: KpiSpec = {
      id: "x",
      label: "X",
      source: { kind: "tableLatest", table: "t", column: "c" },
      format: "int",
    };
    const tile = await evaluateKpi(spec, makeCtx({ tableLatest }));
    expect(tile.value).toBe("—");
  });
});

describe("evaluateKpi — tableSumWindowed", () => {
  it("evaluates Net (no sign, with window)", async () => {
    const spec: KpiSpec = {
      id: "net",
      label: "Net",
      format: "currency",
      source: {
        kind: "tableSumWindowed",
        table: "transactions",
        column: "amount",
        window: "mtd",
      },
    };
    const ctx: KpiContext = {
      tableCount: async () => 0,
      tableSum: async () => 0,
      tableLatest: async () => 0,
      blueprintRunCount: async () => 0,
      scheduleNextFire: async () => 0,
      tableSumWindowed: async (t, c, s, w) => {
        expect(t).toBe("transactions");
        expect(c).toBe("amount");
        expect(s).toBeUndefined();
        expect(w).toBe("mtd");
        return 1234.56;
      },
      tableSumWindowedSeries: async () => [],
    };
    const tile = await evaluateKpi(spec, ctx);
    expect(tile.value).toBe("$1,234.56");
  });

  it("passes sign='positive' for Inflow", async () => {
    const spec: KpiSpec = {
      id: "inflow",
      label: "Inflow",
      format: "currency",
      source: {
        kind: "tableSumWindowed",
        table: "transactions",
        column: "amount",
        sign: "positive",
        window: "mtd",
      },
    };
    let captured: string | undefined;
    const ctx: KpiContext = {
      tableCount: async () => 0,
      tableSum: async () => 0,
      tableLatest: async () => 0,
      blueprintRunCount: async () => 0,
      scheduleNextFire: async () => 0,
      tableSumWindowed: async (_t, _c, sign) => {
        captured = sign;
        return 100;
      },
      tableSumWindowedSeries: async () => [],
    };
    await evaluateKpi(spec, ctx);
    expect(captured).toBe("positive");
  });
});

describe("evaluateKpi — trend/spark (windowed series)", () => {
  const windowedSpec: KpiSpec = {
    id: "net",
    label: "Net",
    format: "currency",
    source: {
      kind: "tableSumWindowed",
      table: "transactions",
      column: "amount",
      window: "mtd",
    },
    semantics: { favorable: "higher" },
  };

  it("reports a rising series as favorable with an aligned watermark", async () => {
    const tile = await evaluateKpi(
      windowedSpec,
      makeCtx({
        tableSumWindowed: vi.fn(async () => 600),
        tableSumWindowedSeries: vi.fn(async () => [100, 200, 300]),
      })
    );
    expect(tile.spark).toEqual([100, 200, 300]);
    expect(tile.trend).toMatchObject({
      state: "ready",
      comparison: {
        direction: "up",
        favorability: "favorable",
        label: "Up $200.00 vs first observed day",
      },
      momentum: {
        direction: "up",
        favorability: "favorable",
        label: "Latest movement up",
      },
      watermark: "up",
    });
  });

  it("reports a lower-is-better fall as favorable", async () => {
    const tile = await evaluateKpi(
      { ...windowedSpec, semantics: { favorable: "lower" } },
      makeCtx({
        tableSumWindowedSeries: vi.fn(async () => [300, 200, 50]),
      })
    );
    expect(tile.trend).toMatchObject({
      state: "ready",
      comparison: { direction: "down", favorability: "favorable" },
      momentum: { direction: "down", favorability: "favorable" },
      watermark: "down",
    });
  });

  it("keeps rebound comparison and latest momentum distinct", async () => {
    const tile = await evaluateKpi(
      windowedSpec,
      makeCtx({
        tableSumWindowedSeries: vi.fn(async () => [100, 50, 80]),
      })
    );
    expect(tile.trend).toMatchObject({
      state: "ready",
      comparison: { direction: "down", favorability: "unfavorable" },
      momentum: { direction: "up", favorability: "favorable" },
    });
    expect(tile.trend?.state === "ready" && tile.trend.watermark).toBeUndefined();
  });

  it("keeps reversal comparison and latest momentum distinct", async () => {
    const tile = await evaluateKpi(
      windowedSpec,
      makeCtx({
        tableSumWindowedSeries: vi.fn(async () => [100, 150, 120]),
      })
    );
    expect(tile.trend).toMatchObject({
      state: "ready",
      comparison: { direction: "up", favorability: "favorable" },
      momentum: { direction: "down", favorability: "unfavorable" },
    });
    expect(tile.trend?.state === "ready" && tile.trend.watermark).toBeUndefined();
  });

  it("keeps a flat endpoint explicit while preserving internal movement", async () => {
    const tile = await evaluateKpi(
      windowedSpec,
      makeCtx({
        tableSumWindowedSeries: vi.fn(async () => [100, 250, 100]),
      })
    );
    expect(tile.trend).toMatchObject({
      state: "ready",
      comparison: {
        direction: "flat",
        favorability: "neutral",
        label: "No change vs first observed day",
      },
      momentum: { direction: "down", favorability: "unfavorable" },
    });
    expect(tile.spark).toEqual([100, 250, 100]);
  });

  it("renders an explicit sparse state when the series has fewer than 2 points", async () => {
    const tile = await evaluateKpi(
      windowedSpec,
      makeCtx({
        tableSumWindowedSeries: vi.fn(async () => [42]),
      })
    );
    expect(tile.spark).toBeUndefined();
    expect(tile.trend).toEqual({
      state: "sparse",
      label: "Need 2 observations",
      summary: "Net is $0.00. Need 2 observations for comparison.",
    });
  });

  it("handles a negative series moving closer to zero without inverting arithmetic direction", async () => {
    const tile = await evaluateKpi(
      { ...windowedSpec, semantics: { favorable: "closer-to-zero" } },
      makeCtx({
        tableSumWindowed: vi.fn(async () => -230),
        tableSumWindowedSeries: vi.fn(async () => [-100, -80, -50]),
      })
    );
    expect(tile.trend).toMatchObject({
      state: "ready",
      comparison: { direction: "up", favorability: "favorable" },
      momentum: { direction: "up", favorability: "favorable" },
      watermark: "up",
    });
  });

  it("omits the watermark when closer-to-zero favorability diverges after crossing zero", async () => {
    const tile = await evaluateKpi(
      { ...windowedSpec, semantics: { favorable: "closer-to-zero" } },
      makeCtx({
        tableSumWindowedSeries: vi.fn(async () => [-100, 10, 20]),
      })
    );
    expect(tile.trend).toMatchObject({
      state: "ready",
      comparison: { direction: "up", favorability: "favorable" },
      momentum: { direction: "up", favorability: "unfavorable" },
    });
    expect(tile.trend?.state === "ready" && tile.trend.watermark).toBeUndefined();
  });

  it("defaults omitted semantics to a neutral judgment", async () => {
    const tile = await evaluateKpi(
      { ...windowedSpec, semantics: undefined },
      makeCtx({ tableSumWindowedSeries: vi.fn(async () => [1, 2, 3]) })
    );
    expect(tile.trend).toMatchObject({
      state: "ready",
      comparison: { direction: "up", favorability: "neutral" },
      momentum: { direction: "up", favorability: "neutral" },
    });
  });

  it("caps spark at the most recent 30 points", async () => {
    const series = Array.from({ length: 45 }, (_, i) => i + 1); // 1..45
    const tile = await evaluateKpi(
      windowedSpec,
      makeCtx({
        tableSumWindowedSeries: vi.fn(async () => series),
      })
    );
    expect(tile.spark).toHaveLength(30);
    // The most recent 30 points are kept (16..45).
    expect(tile.spark?.[0]).toBe(16);
    expect(tile.spark?.[29]).toBe(45);
    expect(tile.trend).toMatchObject({
      state: "ready",
      comparison: { direction: "up", label: "Up $44.00 vs first observed day" },
    });
  });

  it("does not fetch a series or set trend/spark when no window is set", async () => {
    const spec: KpiSpec = {
      id: "unwindowed",
      label: "Unwindowed",
      format: "currency",
      source: {
        kind: "tableSumWindowed",
        table: "transactions",
        column: "amount",
      },
    };
    const tableSumWindowedSeries = vi.fn(async () => [1, 2, 3]);
    const tile = await evaluateKpi(spec, makeCtx({ tableSumWindowedSeries }));
    expect(tableSumWindowedSeries).not.toHaveBeenCalled();
    expect(tile.spark).toBeUndefined();
    expect(tile.trend).toBeUndefined();
  });

  it("leaves non-windowed KPI kinds as flat scalars (no trend/spark)", async () => {
    const spec: KpiSpec = {
      id: "count",
      label: "Count",
      source: { kind: "tableCount", table: "t" },
      format: "int",
    };
    const tile = await evaluateKpi(spec, makeCtx({ tableCount: vi.fn(async () => 9) }));
    expect(tile.spark).toBeUndefined();
    expect(tile.trend).toBeUndefined();
  });
});

describe("evaluateKpi — ratio composition", () => {
  it("computes numerator / denominator for two leaf sources", async () => {
    const tableSum = vi.fn(async () => 1000);
    const tableCount = vi.fn(async () => 4);
    const spec: KpiSpec = {
      id: "avg",
      label: "Avg",
      format: "currency",
      source: {
        kind: "ratio",
        numerator: { kind: "tableSum", table: "t", column: "amount" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    const tile = await evaluateKpi(spec, makeCtx({ tableSum, tableCount }));
    expect(tableSum).toHaveBeenCalledWith("t", "amount");
    expect(tableCount).toHaveBeenCalledWith("t", undefined);
    expect(tile.value).toBe("$250.00");
  });

  it("renders em-dash when denominator is 0", async () => {
    const spec: KpiSpec = {
      id: "x",
      label: "X",
      format: "currency",
      source: {
        kind: "ratio",
        numerator: { kind: "tableSum", table: "t", column: "a" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    const tile = await evaluateKpi(
      spec,
      makeCtx({
        tableSum: vi.fn(async () => 100),
        tableCount: vi.fn(async () => 0),
      })
    );
    expect(tile.value).toBe("—");
  });

  it("renders em-dash when numerator is null", async () => {
    const spec: KpiSpec = {
      id: "x",
      label: "X",
      format: "int",
      source: {
        kind: "ratio",
        numerator: { kind: "tableLatest", table: "t", column: "c" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    const tile = await evaluateKpi(
      spec,
      makeCtx({
        tableLatest: vi.fn(async () => null),
        tableCount: vi.fn(async () => 5),
      })
    );
    expect(tile.value).toBe("—");
  });

  it("renders em-dash when a child returns a non-numeric string", async () => {
    const spec: KpiSpec = {
      id: "x",
      label: "X",
      format: "int",
      source: {
        kind: "ratio",
        numerator: { kind: "tableLatest", table: "t", column: "c" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    const tile = await evaluateKpi(
      spec,
      makeCtx({
        tableLatest: vi.fn(async () => "running"),
        tableCount: vi.fn(async () => 5),
      })
    );
    expect(tile.value).toBe("—");
  });

  it("formats ratio with format: percent (multiplies by 100)", async () => {
    const spec: KpiSpec = {
      id: "win-rate",
      label: "Win rate",
      format: "percent",
      source: {
        kind: "ratio",
        numerator: { kind: "tableCount", table: "t", where: "won" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    const calls: Array<[string, string | undefined]> = [];
    const tableCount = vi.fn(async (tbl: string, where: string | undefined) => {
      calls.push([tbl, where]);
      return where === "won" ? 3 : 12;
    });
    const tile = await evaluateKpi(spec, makeCtx({ tableCount }));
    expect(calls).toContainEqual(["t", "won"]);
    expect(calls).toContainEqual(["t", undefined]);
    expect(tile.value).toBe("25%");
  });

  it("evaluates numerator and denominator in parallel", async () => {
    const order: string[] = [];
    const tableSum = vi.fn(async () => {
      order.push("sum-start");
      await new Promise((r) => setTimeout(r, 5));
      order.push("sum-end");
      return 100;
    });
    const tableCount = vi.fn(async () => {
      order.push("count-start");
      await new Promise((r) => setTimeout(r, 5));
      order.push("count-end");
      return 4;
    });
    const spec: KpiSpec = {
      id: "avg",
      label: "Avg",
      format: "int",
      source: {
        kind: "ratio",
        numerator: { kind: "tableSum", table: "t", column: "a" },
        denominator: { kind: "tableCount", table: "t" },
      },
    };
    await evaluateKpi(spec, makeCtx({ tableSum, tableCount }));
    expect(order.indexOf("sum-start")).toBeLessThan(order.indexOf("count-end"));
    expect(order.indexOf("count-start")).toBeLessThan(order.indexOf("sum-end"));
  });
});
