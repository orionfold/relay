---
title: Resurface primitives (wave 1) — declarable table charts, wire the heatmap, feed KPI trend/spark
status: planned
priority: P1
milestone: post-mvp
source: _IDEAS/packs-evolution.md §6 + §8.2
dependencies: []
---

# Resurface primitives (wave 1)

## Description

A pack is only as expressive as the primitive kinds it can declare. The catalog's north-star
projects need richer analytics — factor-exposure matrices, risk-budget breakdowns, vitals
trending, N-panel dashboards. The visualization audit (`packs-evolution.md §6`) is decisive:
for wave 1, **the gap is wiring and declarability, not charting.** Several rich capabilities
already exist in the codebase but are un-declarable from a manifest, buried behind non-default
tabs, or wired to nothing.

This feature resurfaces the three cheapest, highest-leverage capabilities — it lifts *every
existing pack* without building any new chart component:

1. **Table charts exist but are un-declarable and buried.** Recharts bar/line/pie/scatter
   render behind a non-default "Charts" tab, three clicks deep
   (`src/components/tables/table-detail-tabs.tsx`), and **no manifest can pre-declare one**.
2. **A fully-built, tested `RunCadenceHeatmap` is wired to nothing**
   (`src/components/charts/run-cadence-heatmap.tsx`); the coach view kit even carries
   `coachCadenceCells` data it never renders.
3. **`KpiTile` has `trend`/`spark` fields that `evaluateKpi` never populates**
   (`src/lib/apps/view-kits/evaluate-kpi.ts`) — every manifest KPI renders as a dead flat scalar.

Wave 1 is P1: it is cheap, unblocks the depth packs' visual needs that *already have a
component*, and is a prerequisite for `pack-depth-next-wave` deciding what genuinely needs a
*new* primitive (§6 build-vs-resurface rule).

## User Story

As a pack author, I want to declare a chart, a run-cadence heatmap, and a KPI trend sparkline
directly in my app manifest, so that a pack ships with its analytics visible by default instead
of hidden behind tabs or silently un-rendered.

## Technical Approach

Each item follows the §6 rule "capability EXISTS, just un-declarable or buried → **resurface**":

- **Declarable + auto-materialized table charts.** Add a manifest-declarable chart binding
  (new Zod arm on the view/table schema in `src/lib/apps/registry.ts`, staying `.strict()`)
  that a pack can pre-declare, and auto-materialize a sensible default chart so the "Charts"
  tab is not the only entry point. Keep the existing tab; add a manifest path + a promoted
  default surface. No new chart component — reuse the existing recharts library.
- **Wire `RunCadenceHeatmap` to a view kit.** Bind the orphaned, tested heatmap to the coach
  kit's already-present `coachCadenceCells` data, and expose it as a manifest-declarable kit
  slot. This is pure wiring — the component and its tests already exist.
- **Feed `trend`/`spark` into `evaluateKpi`.** Populate the existing `KpiTile.trend`/`spark`
  fields from the KPI source's windowed history (the same windowing `tableSumWindowed`
  already computes for ledger KPIs), so manifest KPIs render as trend tiles instead of flat
  scalars. No new KPI-source kind — extend the evaluator to emit the fields the tile already
  accepts.
- **Manifest ceiling stays the discipline.** Every new declarable arm is a deliberate Core
  primitive with a Zod arm + evaluator/kit wiring — never a manifest escape hatch, never a
  component ref or formula string (`registry.ts` `.strict()` contract preserved).

**Smoke budget (CLAUDE.md):** the view-kit evaluator and manifest schema are reachable from
the runtime registry — budget an end-to-end `npm run dev` smoke that installs a pack declaring
each resurfaced primitive and renders it, not just unit tests.

## Acceptance Criteria

- [ ] A pack manifest can declare a table chart; the chart renders on a default/promoted
      surface (not only three clicks deep behind the "Charts" tab), and an undeclared table
      still auto-materializes a sensible default chart.
- [ ] `RunCadenceHeatmap` renders from a manifest-declarable view-kit slot fed by
      `coachCadenceCells`; the previously-orphaned component is no longer wired to nothing.
- [ ] `evaluateKpi` populates `trend` and `spark` for KPI sources with windowed history; a
      manifest KPI renders as a trend tile with a sparkline instead of a flat scalar.
- [ ] The manifest schema stays `.strict()` — no component refs, no formula strings; each new
      capability is a typed Zod arm with an evaluator/kit binding.
- [ ] An end-to-end dev-server smoke installs a pack exercising all three resurfaced primitives
      and renders them correctly (per the runtime-registry smoke budget).
- [ ] Every existing pack still installs and renders; no regression to current view kits.

## Scope Boundaries

**Included:**
- Making table charts manifest-declarable + promoting them off the buried tab.
- Wiring the existing `RunCadenceHeatmap` to a kit slot.
- Populating existing `trend`/`spark` KPI-tile fields from windowed history.

**Excluded:**
- **Building any genuinely-new primitive** — value-heatmap/matrix, radar/spider,
  multi-series/overlay trends, N-panel dashboard grid. Those are ABSENT under the fixed slots
  and are `pack-depth-next-wave`'s "build only when a selected pack needs it" scope (§6).
- Exposing the cost/monitor dashboard widgets to kits (deferred; lower leverage this wave).
- Any pack content changes — this is engine-side resurfacing shared by all packs.

## References

- Source: `_IDEAS/packs-evolution.md` §6 (missing & hidden primitives, resurface-before-build
  rule), §8.2.
- Anchors: `src/components/tables/table-detail-tabs.tsx` (buried Charts tab),
  `src/components/charts/run-cadence-heatmap.tsx` (orphaned), `src/lib/apps/view-kits/evaluate-kpi.ts`
  (trend/spark gap), `src/lib/apps/registry.ts` (`.strict()` view/KPI schema).
- Enables: `pack-depth-next-wave` (which builds only the primitives that remain ABSENT after
  this resurfacing).
