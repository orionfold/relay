import type { ViewConfig } from "@/lib/apps/registry";

type FunnelSpec = NonNullable<ViewConfig["bindings"]["funnel"]>;
type FunnelBandSpec = FunnelSpec["bands"][number];

/** One computed band of the funnel flow, ready for `FunnelFlowView`. */
export interface FunnelBand {
  key: "attract" | "capture" | "nurture" | "convert";
  label: string;
  /** Whole-number band count (rows / summed reach). */
  count: number;
  /** Human context line (e.g. "reach across active channels"). */
  detail: string | null;
  /**
   * Whole-percent conversion from the `conversionFrom` band, or `null` where
   * this band declares no denominator or the denominator is 0 — an honest
   * gap-marker instead of NaN/Infinity.
   */
  conversion: number | null;
  /** Grouped sub-chips `[value, count]`, descending by count. */
  sub: [string, number][];
}

/** A table's already-loaded, already-JSON-parsed rows. */
type LoadedRows = { data: Record<string, unknown> }[];
type RowMap = Record<string, LoadedRows>;

/**
 * Pure funnel-flow compute. Takes the declared spec plus already-loaded table
 * rows (no DB, no I/O — the same
 * separation the KPI layer uses between `evaluateKpi` and `KpiContext`), and
 * returns one `FunnelBand` per declared band, in declared order.
 *
 * Counts: `sumColumn` sums a numeric column (optionally restricted to active
 * rows); `rowsWhereIn` counts stage membership; `rowsRecent` counts arrivals
 * within a day window. Conversion % is computed only between two real leads
 * counts; a 0 denominator yields `null`, not a divide-by-zero.
 *
 * Shadow paths (Principle #3): a missing table → count 0; an unparseable
 * numeric cell → contributes 0 to a sum; a missing date cell → not recent.
 * Nothing throws — a malformed cell degrades one band's number, never the view.
 */
export function computeFunnelBands(
  spec: FunnelSpec,
  rows: RowMap,
  opts: { now: number }
): FunnelBand[] {
  const counts = new Map<string, number>();

  const bands = spec.bands.map((band): FunnelBand => {
    const tableRows = rows[band.table] ?? [];
    const count = countBand(band, tableRows, opts.now);
    counts.set(band.key, count);
    return {
      key: band.key,
      label: band.label,
      count,
      detail: band.detail ?? null,
      conversion: null, // filled in the second pass once all counts exist
      sub: band.subBy ? subChips(tableRows, band, opts.now) : [],
    };
  });

  // Second pass: resolve conversions now that every band count is known. A
  // `conversionFrom` may reference any prior band (always earlier in order).
  for (let i = 0; i < bands.length; i++) {
    const from = spec.bands[i].conversionFrom;
    if (!from) continue;
    const denom = counts.get(from);
    if (denom == null || denom === 0) continue; // honest gap-marker, not NaN
    bands[i].conversion = Math.round((bands[i].count / denom) * 100);
  }

  return bands;
}

function countBand(
  band: FunnelBandSpec,
  tableRows: LoadedRows,
  now: number
): number {
  const c = band.count;
  if (c.kind === "sumColumn") {
    let sum = 0;
    for (const row of tableRows) {
      if (isExcluded(row, c)) continue;
      sum += toNumber(row.data[c.column]);
    }
    return sum;
  }
  if (c.kind === "rowsWhereIn") {
    const set = new Set(c.values);
    return tableRows.filter((r) => set.has(String(r.data[c.column]))).length;
  }
  // rowsRecent
  const cutoff = now - c.withinDays * 86_400_000;
  return tableRows.filter((r) => {
    const t = Date.parse(String(r.data[c.column]));
    return !Number.isNaN(t) && t >= cutoff;
  }).length;
}

/** Group the rows counted by a band on `subBy`, descending by group count. */
function subChips(
  tableRows: LoadedRows,
  band: FunnelBandSpec,
  now: number
): [string, number][] {
  const rowsInBand = rowsMatchingBand(tableRows, band, now);
  const groups = new Map<string, number>();
  for (const row of rowsInBand) {
    const raw = row.data[band.subBy!];
    if (raw == null || raw === "") continue;
    const key = String(raw);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  return [...groups.entries()].sort((a, b) => b[1] - a[1]);
}

/** The subset of rows a band's count is over — the basis for its sub-chips. */
function rowsMatchingBand(
  tableRows: LoadedRows,
  band: FunnelBandSpec,
  now: number
): LoadedRows {
  const c = band.count;
  if (c.kind === "sumColumn") {
    return tableRows.filter((r) => !isExcluded(r, c));
  }
  if (c.kind === "rowsWhereIn") {
    const set = new Set(c.values);
    return tableRows.filter((r) => set.has(String(r.data[c.column])));
  }
  const cutoff = now - c.withinDays * 86_400_000;
  return tableRows.filter((r) => {
    const t = Date.parse(String(r.data[c.column]));
    return !Number.isNaN(t) && t >= cutoff;
  });
}

/**
 * True when a `sumColumn` row is explicitly-dead and should be dropped from the
 * sum (e.g. a `refresh_status: deprecated` channel). Exclusion-based: any row
 * NOT carrying a listed dead value counts, so live values the spec doesn't
 * enumerate (a future `stale`) still contribute reach.
 */
function isExcluded(
  row: { data: Record<string, unknown> },
  count: { excludeColumn?: string; excludeValues?: string[] }
): boolean {
  if (!count.excludeColumn || !count.excludeValues) return false;
  return count.excludeValues.includes(String(row.data[count.excludeColumn]));
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
