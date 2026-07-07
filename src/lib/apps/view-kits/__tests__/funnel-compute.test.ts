import { describe, expect, it } from "vitest";
import { computeFunnelBands } from "../funnel-compute";
import type { ViewConfig } from "@/lib/apps/registry";

type FunnelSpec = NonNullable<ViewConfig["bindings"]["funnel"]>;

/**
 * The funnel-flow compute is a PURE function over already-loaded, already-parsed
 * table rows — the same DB-free separation the KPI layer uses (evaluateKpi +
 * KpiContext). These tests pin the funnel-flow semantics:
 *   - band counts by membership / sum / recency,
 *   - stage-to-stage conversion % between two real leads counts,
 *   - the deliberately-blank Attract→Capture junction (reach ≠ contacts),
 *   - honest empty-tree behavior (no throw, sensible zeros/None).
 */

const spec: FunnelSpec = {
  id: "leads-funnel",
  title: "Lead funnel",
  bands: [
    {
      key: "attract",
      label: "Attract",
      table: "channels",
      count: { kind: "sumColumn", column: "audience", excludeColumn: "refresh_status", excludeValues: ["deprecated"] },
      detail: "reach across active channels",
      subBy: "platform",
    },
    {
      key: "capture",
      label: "Capture",
      table: "leads",
      count: { kind: "rowsRecent", column: "created_at", withinDays: 28 },
      detail: "new leads (28d)",
      subBy: "source_origin",
    },
    {
      key: "nurture",
      label: "Nurture",
      table: "leads",
      count: { kind: "rowsWhereIn", column: "stage", values: ["subscriber", "engaged", "qualified"] },
      detail: "in nurture",
      conversionFrom: "capture",
      subBy: "stage",
    },
    {
      key: "convert",
      label: "Convert",
      table: "leads",
      count: { kind: "rowsWhereIn", column: "stage", values: ["customer", "champion"] },
      detail: "won",
      conversionFrom: "nurture",
      subBy: "source_campaign",
    },
  ],
};

/** Fixed "today" so `rowsRecent` is deterministic (no Date.now in the pure fn). */
const NOW = Date.parse("2026-07-06T00:00:00Z");
const daysAgo = (n: number) =>
  new Date(NOW - n * 86_400_000).toISOString().slice(0, 10);

function tableRows(): Record<string, { data: Record<string, unknown> }[]> {
  return {
    channels: [
      { data: { platform: "x", audience: 1200, refresh_status: "ok" } },
      { data: { platform: "linkedin", audience: 800, refresh_status: "ok" } },
      // `deprecated` is the only explicitly-dead status → excluded from reach.
      { data: { platform: "old-blog", audience: 5000, refresh_status: "deprecated" } },
      // A `stale` channel is still live (just needs a refresh) → COUNTED. This
      // pins the exclusion (not inclusion-allowlist) semantics.
      { data: { platform: "newsletter", audience: 300, refresh_status: "stale" } },
    ],
    leads: [
      // Capture window (28d): 3 recent arrivals
      { data: { stage: "lead", created_at: daysAgo(2), source_origin: "magnet" } },
      { data: { stage: "subscriber", created_at: daysAgo(5), source_origin: "campaign" } },
      { data: { stage: "engaged", created_at: daysAgo(10), source_origin: "magnet" } },
      // Older than 28d → not Capture, but still count toward lifetime Nurture/Convert
      { data: { stage: "qualified", created_at: daysAgo(60), source_origin: "referral" } },
      { data: { stage: "customer", created_at: daysAgo(90), source_campaign: "2026-q3" } },
      { data: { stage: "champion", created_at: daysAgo(120), source_campaign: "2026-q3" } },
    ],
  };
}

describe("computeFunnelBands — funnel-flow semantics", () => {
  it("Attract sums reach over live rows, excluding only explicitly-dead ones", () => {
    const bands = computeFunnelBands(spec, tableRows(), { now: NOW });
    const attract = bands.find((b) => b.key === "attract")!;
    // 1200 + 800 + 300 (stale still counts); deprecated 5000 excluded.
    expect(attract.count).toBe(2300);
    expect(attract.conversion).toBeNull(); // Attract never carries a conversion
  });

  it("Capture counts rows within the recency window", () => {
    const bands = computeFunnelBands(spec, tableRows(), { now: NOW });
    const capture = bands.find((b) => b.key === "capture")!;
    expect(capture.count).toBe(3); // 3 leads within 28d
  });

  it("Nurture/Convert count lifetime stage membership", () => {
    const bands = computeFunnelBands(spec, tableRows(), { now: NOW });
    const nurture = bands.find((b) => b.key === "nurture")!;
    const convert = bands.find((b) => b.key === "convert")!;
    expect(nurture.count).toBe(3); // subscriber, engaged, qualified
    expect(convert.count).toBe(2); // customer, champion
  });

  it("conversion % is Nurture/Capture and Convert/Nurture, rounded", () => {
    const bands = computeFunnelBands(spec, tableRows(), { now: NOW });
    const nurture = bands.find((b) => b.key === "nurture")!;
    const convert = bands.find((b) => b.key === "convert")!;
    expect(nurture.conversion).toBe(100); // 3/3 = 100%
    expect(convert.conversion).toBe(67); // 2/3 = 66.6 → 67
  });

  it("Attract→Capture junction is deliberately blank (no conversionFrom)", () => {
    const bands = computeFunnelBands(spec, tableRows(), { now: NOW });
    const capture = bands.find((b) => b.key === "capture")!;
    expect(capture.conversion).toBeNull();
  });

  it("sub chips carry per-group counts, descending", () => {
    const bands = computeFunnelBands(spec, tableRows(), { now: NOW });
    const nurture = bands.find((b) => b.key === "nurture")!;
    // stage sub: subscriber(1), engaged(1), qualified(1)
    expect(nurture.sub).toEqual(
      expect.arrayContaining([
        ["subscriber", 1],
        ["engaged", 1],
        ["qualified", 1],
      ])
    );
  });

  it("empty tables → zero counts, null conversions, no throw", () => {
    const bands = computeFunnelBands(spec, { channels: [], leads: [] }, { now: NOW });
    expect(bands).toHaveLength(4);
    expect(bands.map((b) => b.count)).toEqual([0, 0, 0, 0]);
    // conversion from a 0 denominator is null (not NaN/Infinity) — honest small-N
    expect(bands.find((b) => b.key === "nurture")!.conversion).toBeNull();
  });

  it("missing table in the row map → count 0, not a throw", () => {
    const bands = computeFunnelBands(spec, {}, { now: NOW });
    expect(bands.every((b) => b.count === 0)).toBe(true);
  });

  it("preserves band order as declared", () => {
    const bands = computeFunnelBands(spec, tableRows(), { now: NOW });
    expect(bands.map((b) => b.key)).toEqual(["attract", "capture", "nurture", "convert"]);
  });
});
