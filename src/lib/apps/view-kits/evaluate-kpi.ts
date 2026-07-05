import type { ViewConfig } from "@/lib/apps/registry";
import { formatKpi, type KpiPrimitive } from "./format-kpi";
import type { KpiTile } from "./types";

type KpiSpec = NonNullable<ViewConfig["bindings"]["kpis"]>[number];
type KpiSource = KpiSpec["source"];
type LeafKpiSource = Exclude<KpiSource, { kind: "ratio" }>;

/**
 * Data-access surface for KPI evaluation. Concrete implementations live in
 * `kpi-context.ts` (DB-backed) and tests (in-memory mocks). Each method
 * returns the raw value; formatting happens in `evaluateKpi`.
 *
 * Why an interface (rather than direct DB calls inside `evaluateKpi`):
 * the switch stays unit-testable without a DB, and Phase 3+ kits can extend
 * the interface without touching this file.
 */
export interface KpiContext {
  tableCount(table: string, where: string | undefined): Promise<KpiPrimitive>;
  tableSum(table: string, column: string): Promise<KpiPrimitive>;
  tableLatest(table: string, column: string): Promise<KpiPrimitive>;
  blueprintRunCount(blueprint: string, window: "7d" | "30d"): Promise<KpiPrimitive>;
  scheduleNextFire(schedule: string): Promise<KpiPrimitive>;
  tableSumWindowed(
    table: string,
    column: string,
    sign: "positive" | "negative" | undefined,
    window: "mtd" | "qtd" | "ytd" | undefined
  ): Promise<KpiPrimitive>;
  /**
   * Daily-bucketed running series for a windowed sum, ascending by date. Feeds
   * the KPI tile's `spark`/`trend`. Same window + sign math as
   * `tableSumWindowed`; returns per-day sums rather than one aggregate.
   */
  tableSumWindowedSeries(
    table: string,
    column: string,
    sign: "positive" | "negative" | undefined,
    window: "mtd" | "qtd" | "ytd"
  ): Promise<number[]>;
}

/** KPI tiles cap the sparkline at 30 points (see KpiTile.spark). */
const MAX_SPARK_POINTS = 30;

/**
 * Derive a coarse trend direction from a series' first vs. last value. Callers
 * only invoke this with 2+ points; the tile renders the arrow/glyph.
 */
function trendOf(series: number[]): "up" | "down" | "flat" {
  const first = series[0];
  const last = series[series.length - 1];
  if (last > first) return "up";
  if (last < first) return "down";
  return "flat";
}

/**
 * Pure switch over a leaf KpiSource. New leaf kinds require a code change
 * here AND a Zod arm in `LeafKpiSourceSchema` — by design (no formula
 * strings, no manifest escape hatch).
 */
async function evaluateLeaf(source: LeafKpiSource, ctx: KpiContext): Promise<KpiPrimitive> {
  switch (source.kind) {
    case "tableCount":
      return ctx.tableCount(source.table, source.where);
    case "tableSum":
      return ctx.tableSum(source.table, source.column);
    case "tableLatest":
      return ctx.tableLatest(source.table, source.column);
    case "blueprintRunCount":
      return ctx.blueprintRunCount(source.blueprint, source.window);
    case "scheduleNextFire":
      return ctx.scheduleNextFire(source.schedule);
    case "tableSumWindowed":
      return ctx.tableSumWindowed(
        source.table,
        source.column,
        source.sign,
        source.window
      );
  }
}

/**
 * Combine two leaf-evaluated values into a ratio. Returns null when either
 * child is non-numeric or denominator is zero — the formatter renders null
 * as an em-dash, which is the design-system convention for "no value yet".
 *
 * No implicit string→number coercion: if a manifest author wires a
 * `tableLatest` over a status column as numerator, the tile renders `—`
 * rather than misleadingly numbering a label.
 */
function computeRatio(num: KpiPrimitive, den: KpiPrimitive): KpiPrimitive {
  if (typeof num !== "number" || typeof den !== "number") return null;
  if (den === 0) return null;
  return num / den;
}

/**
 * Public entry. Dispatches `ratio` (parallel-evaluating its two leaf
 * children) and falls through to `evaluateLeaf` for the six leaf kinds.
 */
export async function evaluateKpi(spec: KpiSpec, ctx: KpiContext): Promise<KpiTile> {
  let raw: KpiPrimitive;
  if (spec.source.kind === "ratio") {
    const [num, den] = await Promise.all([
      evaluateLeaf(spec.source.numerator, ctx),
      evaluateLeaf(spec.source.denominator, ctx),
    ]);
    raw = computeRatio(num, den);
  } else {
    raw = await evaluateLeaf(spec.source, ctx);
  }

  const tile: KpiTile = {
    id: spec.id,
    label: spec.label,
    value: formatKpi(raw, spec.format),
  };

  // Wave-1 resurface: a windowed sum has a daily-bucketed history, so we can
  // fill the tile's existing `trend`/`spark` fields instead of rendering a
  // dead flat scalar. Only `tableSumWindowed` with an explicit window has a
  // series to bucket — every other kind stays flat. A series of <2 points
  // can't show direction, so we leave trend/spark unset (the tile renders the
  // scalar alone, and Sparkline already no-ops below 2 points).
  if (spec.source.kind === "tableSumWindowed" && spec.source.window) {
    const series = await ctx.tableSumWindowedSeries(
      spec.source.table,
      spec.source.column,
      spec.source.sign,
      spec.source.window
    );
    if (series.length >= 2) {
      tile.spark = series.slice(-MAX_SPARK_POINTS);
      tile.trend = trendOf(series);
    }
  }

  return tile;
}
