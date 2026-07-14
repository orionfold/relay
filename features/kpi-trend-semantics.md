---
title: Semantically truthful KPI trends
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md G-037; _IDEAS/triage.md TRIAGE-003
dependencies: [pack-primitive-resurface]
---

# Semantically truthful KPI trends

## Outcome

Comparable KPI tiles distinguish three facts that the former `up | down | flat`
field collapsed: arithmetic direction across the declared window, latest
momentum, and whether that movement is favorable for the metric. Labels,
icons, color, watermark, sparkline, and accessible text tell the same named
story without assuming that up is good or down is bad.

The approved v1 comparison is deterministic: overall comparison is the last
daily bucket versus the first observed daily bucket, while latest momentum is
the last bucket versus the immediately preceding bucket. KPI authors declare
favorability explicitly; Relay never infers it from a label or the sign of a
stored value.

## User story

As an operator reading a composed-app dashboard, I want a KPI trend to name
what changed, how it is moving now, and whether that is favorable so that I do
not mistake a falling cost, negative series, rebound, or reversal for the
opposite business meaning.

## Approved comparison contract

Manifest `KpiSpec` gains an optional semantic declaration:

```yaml
semantics:
  favorable: higher | lower | closer-to-zero | neutral
```

- `higher`: an arithmetically higher endpoint is favorable.
- `lower`: an arithmetically lower endpoint is favorable.
- `closer-to-zero`: a smaller endpoint magnitude is favorable, including a
  negative cost changing from `-100` to `-50`.
- `neutral`: movement has no positive/negative business judgment. This is the
  backwards-compatible default when semantics are absent.

Only windowed KPI sources currently provide a daily series. Non-comparable
scalar KPIs remain scalar rather than inventing a comparison.

## Visual and accessible vocabulary

- The comparison arrow always shows arithmetic endpoint direction.
- The comparison label names the absolute formatted delta and baseline:
  `Up $50.00 vs first observed day`, `Down 4 vs first observed day`, or
  `No change vs first observed day`, followed by the visible word `Favorable`,
  `Unfavorable`, or `Neutral` so meaning never depends on color alone.
- The sparkline shows the complete retained daily series. Its semantic color
  reflects the favorability of latest momentum; neutral momentum is muted.
- A short second label names latest momentum: `Latest movement up`, `Latest
  movement down`, or `Latest movement flat`, followed by its visible
  favorability word.
- Favorability color applies only to the signal it describes. A lower-is-better
  decrease can therefore use a down arrow with favorable color.
- The large trend watermark appears only for non-flat series where comparison
  and latest momentum agree in both arithmetic direction and favorability.
  Rebounds, reversals, and zero-crossing semantic conflicts omit it rather than
  overstating one direction.
- Sparse series show `Need 2 observations` with no arrow or watermark.
- Each comparable tile is a labeled group exposing one screen-reader summary naming value,
  comparison, momentum, and favorability; decorative icons stay hidden.

## State model

```text
daily series
    |
    +-- 0..1 observations --> sparse: explicit message, no invented signal
    |
    +-- 2+ observations
            |
            +-- comparison = last vs first
            +-- momentum   = last vs previous
            +-- favorability policy evaluates each movement
            +-- watermark only when direction and favorability agree
```

## What already exists

- `KpiSpecSchema` is the strict typed manifest boundary reused by pack YAML,
  Chat view-editing tools, and composed-app loaders.
- `evaluateKpi` already owns pure KPI evaluation and caps series at 30 points.
- `tableSumWindowedSeries` supplies ascending daily buckets.
- `KpiTile`, `KPIStrip`, and `Sparkline` are the shared projection and rendering
  primitives used across composed-app kits.
- Semantic success, destructive, and muted design tokens already cover
  favorable, unfavorable, and neutral signals in light and dark themes.

## Acceptance criteria

- [x] Rising, falling, rebound, reversal, flat, sparse, negative-series, and
  zero-crossing fixtures produce deterministic comparison, momentum,
  favorability, and watermark results.
- [x] Arithmetic direction is independent from favorability; `higher`, `lower`,
  `closer-to-zero`, and `neutral` policies are schema-validated and tested.
- [x] Existing manifests without `semantics` remain valid and render neutral
  trend judgments rather than inheriting green-up/red-down assumptions.
- [x] Bundled ledger/agency windowed KPIs declare truthful semantics, including
  `closer-to-zero` for negative cost/outflow series.
- [x] KPI cards render named comparison and momentum labels, semantic sparkline
  color, conditional watermark, explicit sparse/flat states, and one complete
  accessible summary.
- [x] No hand-cursor code or instruction is introduced; system cursor and
  focus-visible behavior remain unchanged.
- [x] Targeted schema/evaluator/context/component tests, TypeScript, token
  validation, and diff checks pass.
- [x] Live light/dark browser checks pass at desktop and 390px with no overflow,
  console errors, clipped labels, or contradictory indicator vocabulary.
- [x] A comprehension check can explain a lower-is-better decrease and a
  rebound/reversal without knowing the calculation implementation.

## Error and rescue registry

| Error | Trigger | Impact | Rescue |
|---|---|---|---|
| implicit polarity | semantics omitted | color invents good/bad meaning | default to `neutral` |
| negative-series inversion | signed costs move toward zero | arithmetic up is mislabeled unfavorable | explicit `closer-to-zero` policy and fixture |
| rebound/reversal overstatement | endpoint and latest direction or favorability differs | watermark contradicts sparkline tail | omit watermark and name both signals |
| zero baseline | first value is zero | percentage delta is undefined | display formatted absolute delta only |
| sparse history | fewer than two buckets | direction is fabricated | explicit sparse state |
| flat endpoints with internal movement | first equals last | path is hidden by a flat verdict | keep sparkline, label comparison flat, retain latest momentum |
| old manifest | no semantics field | install or render breaks | optional field with neutral default |
| narrow card | long labels at 390px | clipped or overlapping text | wrap semantic labels and browser-check |

## NOT in scope

- Prior-period, target, rolling-average, or author-selected comparison modes;
  those require the deferred comparison DSL.
- New KPI source kinds or trend series for scalar-only sources.
- Forecasting, anomaly detection, smoothing, or statistical significance.
- Dashboard layout redesign, card resizing, or unrelated chart styling.
- Inferring favorability from KPI names, currency signs, or domain heuristics.

## Verification run — 2026-07-14

- Option B was operator-approved: last-versus-first comparison, last-versus-
  previous momentum, explicit favorability policies, and a watermark only when
  non-flat direction and favorability agree.
- 113 focused schema, evaluator, component, default-KPI, Chat-tool, and planner
  tests passed. A further 91 affected context, composed-view, golden-master,
  bundle, and pack-taxonomy tests passed with one pre-existing skipped test.
- `tsc --noEmit`, the design-token validator, and `git diff --check` passed.
- Live Relay checks passed on `/apps/relay-agency` at 1280px and 390px in light
  and dark themes: the available one-day data rendered the truthful sparse
  state, accessible group names exposed the complete sparse summary, no card or
  page overflow appeared, and the browser console remained clean. Ready,
  rebound, reversal, flat, and negative-series states are protected by rendered
  component fixtures because the live pack had only one observation day.
- The non-color labels make the comprehension cases explicit: `300 → 200 → 50`
  under `lower` is down and favorable; `100 → 50 → 80` under `higher` is down
  overall but currently moving up, with no watermark; `-100 → -80 → -50` under
  `closer-to-zero` is arithmetically up and favorable.

## References

- Goal: `_IDEAS/backlog.md` G-037
- Existing series delivery: `features/pack-primitive-resurface.md`
- Design system: `design-system/MASTER.md` metric-card guidance
