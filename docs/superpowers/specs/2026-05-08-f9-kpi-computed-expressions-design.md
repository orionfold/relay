---
title: F9 — KPI computed expressions (structured ratio composition)
date: 2026-05-08
status: shipped
related-tdr: TDR-038
features: [F9]
touches:
  - src/lib/apps/registry.ts
  - src/lib/apps/view-kits/evaluate-kpi.ts
  - src/lib/apps/view-kits/__tests__/evaluate-kpi.test.ts
  - ~/.ainative/apps/portfolio-manager/manifest.yaml
---

# F9 — KPI computed expressions (structured ratio composition)

## Problem

The KPI source schema in `src/lib/apps/registry.ts` (`KpiSpecSchema`, lines 67-104) is a discriminated union of six leaf source kinds: `tableCount`, `tableSum`, `tableLatest`, `blueprintRunCount`, `scheduleNextFire`, `tableSumWindowed`. Each evaluates to a single column-or-row value. None can express a computed combination of two values.

The live reproducer is `portfolio-manager`. Its current "Largest Position %" tile (manifest line 40-46) is wired as `kind: tableLatest` over `market_value` — a wrong fixture that surfaces the latest write, not a percentage. The intent is clearly a ratio: a per-row average, a position concentration, a percentage. Without computed expressions, manifest authors have no way to express these.

Two shapes were considered in the prior handoff (HANDOFF.md lines 37-45):

- **`tableExpression`** — free-form expression strings like `total_value / total_positions * 100`. Maximally expressive. Biggest footgun: eval-injection risk, type-coercion ambiguity, no static validation that referenced columns exist.
- **Structured composition** — explicit, named ops over the existing source kinds. Less expressive, but every node is a typed Zod-validated tree. No parser, no eval.

## Decision

Add **one** new source kind: `kind: ratio`. It composes two leaf sources — a numerator and a denominator — and evaluates to `numerator / denominator` as a `KpiPrimitive` number. No other ops (`add`, `multiply`, `subtract`) ship in this pass; per TDR-038's heuristic-vocabulary discipline, future ops require a real reproducer (a live composed app whose intent cannot be expressed by `ratio`).

Why ratio first: every observed KPI request that the leaf kinds cannot express is a binary fraction — average per row (`sum / count`), concentration (`largest / total`), win-rate (`wins / (wins + losses)` — itself a ratio whose denominator is a count with a `where` filter). `ratio` covers all three with `format: percent` doing the ×100 step (already implemented in `formatKpi`).

### Schema shape

```ts
const LeafKpiSourceSchema = z.discriminatedUnion("kind", [/* the existing 6 arms */]);

const RatioKpiSourceSchema = z.object({
  kind: z.literal("ratio"),
  numerator: LeafKpiSourceSchema,
  denominator: LeafKpiSourceSchema,
});

const KpiSourceSchema = z.union([LeafKpiSourceSchema, RatioKpiSourceSchema]);
```

The leaf union is non-recursive by construction — children of `ratio` cannot themselves be ratios. If a real reproducer surfaces a ratio-of-ratios case (e.g. compounded growth rate), we explicitly relax it then. Until then, the schema rejects nesting at validate time, which makes the engine simpler and the failure mode obvious.

### Evaluator change

`evaluateKpi` extracts the existing 6-case switch into a private helper `evaluateLeaf(source, ctx): Promise<KpiPrimitive>`. The public entry then handles `ratio` first:

```ts
async function evaluateLeaf(source: LeafKpiSource, ctx: KpiContext): Promise<KpiPrimitive> {
  switch (source.kind) { /* the existing 6 arms unchanged */ }
}

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
  return { id: spec.id, label: spec.label, value: formatKpi(raw, spec.format) };
}

function computeRatio(num: KpiPrimitive, den: KpiPrimitive): KpiPrimitive {
  if (typeof num !== "number" || typeof den !== "number") return null;
  if (den === 0) return null;
  return num / den;
}
```

`KpiContext` is unchanged — `ratio` does not introduce a new method. It composes existing ones.

### Semantics

- `denominator === 0` → returns `null` (renders `—`). Division-by-zero is a real possibility (e.g. ratio over an empty filtered count) and surfacing `Infinity`/`NaN` in tiles would be wrong.
- `numerator` or `denominator` is `null`/`undefined` → returns `null`. Either child failing means the tile is uncomputable.
- Either child returns a non-number string (`tableLatest` over a status column, for example) → returns `null`. No implicit string→number coercion. Manifest authors picking incompatible leaves get an em-dash, not a misleading number.
- Format conversion is the consumer's responsibility. `format: percent` multiplies by 100 in `formatKpi` (line 29). A `ratio` of `0.42` with `format: percent` renders `"42%"`. With `format: int` it renders `"0"` (rounds toward zero). With `format: currency` it renders `"$0.42"`. This is consistent with how leaf kinds already interact with format.

### Reproducer ship-gate

The portfolio-manager manifest's "Largest Position %" tile is replaced with a meaningful ratio fixture. Two candidates:

- `Avg Position Value`: `tableSum(market_value) / tableCount(positions)`, format `currency`. Expresses average market value per position. Easy to verify.
- `Concentration of Top Position` would require a `tableMax` leaf, which doesn't exist. Out of scope for F9 (would be a separate feature).

Pick `Avg Position Value`. The existing tile names will change from `[Total Market Value, Total Positions, Largest Position %]` to `[Total Market Value, Total Positions, Avg Position Value]`. This is the F9 acceptance fixture analogous to F2/F4's manifest-pin removals.

## Out of scope

- `add`, `subtract`, `multiply` source kinds — no live reproducer demands them. TDR-038 applies.
- `tableMax`, `tableMin`, `tableAvg` leaf kinds — adjacent extensions, but not required for F9. Fileable as separate follow-ups if a real app needs them.
- Sandboxed expression evaluator — explicitly rejected. The structured tree is the contract.
- Nested ratios — schema rejects them. Relax only when a real reproducer demands it.
- `loadColumnSchemas` silent-swallow fix (HANDOFF.md lines 30-35) — separate from F9 but a known follow-up.

## Risks

- **Wrong-format combinations.** `ratio` with `format: int` truncates fractional results. Real risk when a manifest author writes `kind: ratio, format: int`. Mitigation: example manifests use the right format; documentation in the schema's JSDoc points to `percent`/`currency` as the typical companions.
- **Two SQL queries instead of one.** `ratio` runs both children sequentially through the context interface. With `Promise.all` the wall time is one round-trip, not two — but it's still two DB queries. Acceptable for KPI tiles (cached upstream by `unstable_cache` per `kpi-context.ts:35`). Not a hot path.
- **Schema migration risk.** The Zod union widens from a single discriminated union to `union(leaf, ratio)`. Existing manifests parse identically — every leaf-kind manifest still validates against `LeafKpiSourceSchema` first. New `ratio` manifests validate via the second arm. Low risk; tests pin every existing leaf.

## Testing

- **Unit:** add `evaluate-kpi.test.ts` arms covering: ratio of two `tableSum`s; ratio with `format: percent`; ratio with denominator 0; ratio with null numerator; ratio with non-numeric child; ratio with `Promise.all` invocation order.
- **Schema:** add `view-schema.test.ts` arms covering: valid ratio manifest accepts; nested ratio (`ratio` as `numerator`) rejects; ratio missing `numerator`/`denominator` rejects.
- **Live reproducer:** edit `portfolio-manager` manifest, dev-server smoke, capture screenshot. Verify "Avg Position Value" tile renders a real currency number consistent with the seed data.

## Acceptance

- Schema accepts `kind: ratio` with two leaf children.
- Schema rejects nested ratios and missing children.
- `evaluateKpi` produces correct numeric output for the happy path.
- All four edge cases (den=0, null num, null den, non-numeric child) render as `—`.
- portfolio-manager renders the new `Avg Position Value` tile end-to-end against the live DB.
- All existing kpi tests pass unchanged.

## Verification (2026-05-08)

- Schema tests: 3 added (accept ratio, reject nested ratio, reject missing denominator). All green; existing 6-leaf coverage preserved (16/16 in `view-schema.test.ts`).
- Engine tests: 6 added (happy-path numeric output, denominator=0, null numerator, non-numeric child, percent format, parallel evaluation order). All green (14/14 in `evaluate-kpi.test.ts`).
- All 32 test files under `src/lib/apps/` green (338 tests, 1 pre-existing skip).
- Full project typecheck clean (`tsc --noEmit` 0 errors).
- portfolio-manager manifest pin removed: `Largest Position %` (a wrong `tableLatest` over `market_value`) replaced with `Avg Position Value` (`ratio` of `tableSum(market_value) / tableCount(positions)`, format `currency`).
- Live DB verification: `tableSum(market_value)` = `$94,924.39`, `tableCount` = `8`, expected ratio = `$11,865.55`. Browser-rendered tile reads `$11,865.55` — matches exactly.
- Required dev-server restart after schema commit; existing dev server held the pre-F9 schema in its module graph until restart.

## Latent issues (not fixed in F9)

- `loadColumnSchemas` silent-swallow (HANDOFF.md lines 30-35) — orthogonal to F9 but still on the same surface. Worth a small follow-up.
- Pre-existing `transport-dispatch.ts` dynamic-import warning + Turbopack workspace-root inference warning — both pre-date F9. Not introduced by this change.
