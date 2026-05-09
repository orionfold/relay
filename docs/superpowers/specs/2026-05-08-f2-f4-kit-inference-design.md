---
title: F2 + F4 — Kit Auto-Inference Rule-Set Tightening
date: 2026-05-08
status: draft
related-tdr: TDR-038
features: [F2, F4]
touches:
  - src/lib/apps/view-kits/inference.ts
  - src/lib/apps/view-kits/__tests__/inference.test.ts
  - ~/.ainative/apps/portfolio-manager/manifest.yaml
  - ~/.ainative/apps/marketing-campaign-tracker/manifest.yaml
---

# F2 + F4 — Kit Auto-Inference Rule-Set Tightening

## Problem

Two adjacent misfires in the kit auto-inference decision table at `src/lib/apps/view-kits/inference.ts`. They share a root — the hero-table semantic vocabulary is too narrow — and should be solved with one coherent rule-set, not two patches.

**F2 (P1) — `rule1_ledger` over-eager.** Any hero table with a currency-named column triggers the ledger kit. The reproducer is `portfolio-manager`: hero columns `ticker, name, shares, cost_basis, current_price, market_value` match `(cost|...)`, so ledger fires even though there is no date column and the table is a positions snapshot, not a transaction log. Currently masked by a `view.kit: workflow-hub` pin in the live manifest.

**F4 (P2) — `rule2_tracker` under-fires; workflow-hub fallback hides the data table.** A tracker requires date + (boolean | rating). The reproducer is `marketing-campaign-tracker`: hero columns `title, channel, status, publish_date, engagement_count, notes` have a date and a categorical state column and a count column, but no boolean/rating. All seven rules miss → falls through to `workflow-hub`, which renders blueprint cards instead of the table the user wants to see. Currently masked by a `view.kit: tracker` pin.

Both pins are workarounds. The right fix lives in the inference layer.

## Decision

Tighten ledger semantics; broaden tracker semantics. No structural changes — the 7-rule decision table, predicate purity, and "first match wins" property are all preserved. Two new column-shape probes are added; two existing predicates change.

### Predicate changes

**`rule1_ledger` — currency AND date required.**

```ts
// before
return cols !== null && hasCurrency(cols);
// after
return cols !== null && hasCurrency(cols) && hasDate(cols);
```

A ledger is intrinsically a transactional time-series. A snapshot of currency-shaped columns without a date is not a ledger. `portfolio-manager` (no date column on positions) stops firing rule1; `finance-pack` (`amount + date + category`) keeps firing.

**`rule2_tracker` — broaden to status-like and count-like signals.**

```ts
// before
return hasDate(cols) && (hasBoolean(cols) || hasRating(cols));
// after
return hasDate(cols) && (
  hasBoolean(cols) ||
  hasRating(cols) ||
  hasStatusLike(cols) ||
  hasCountLike(cols)
);
```

A tracker is dated entries with any progress/state/measurement signal. `marketing-campaign-tracker` matches via `publish_date + status + engagement_count`. All existing tracker fixtures (habit-tracker, reading-log, reading-radar) still match.

### New column-shape probes

Conservative name patterns. Same tiered match precedence as existing probes (`semantic` > name regex). Word-boundary anchored to avoid substring false positives.

```ts
// Categorical state column — the workflow's "lane"
const STATUS_NAME_RE = /(^|_)(status|state|stage|phase)(_|$)/i;
export function hasStatusLike(cols: Col[]): boolean {
  return cols.some(c => c.semantic === "status" || STATUS_NAME_RE.test(c.name));
}

// Numeric measurement/aggregation column
const COUNT_NAME_RE = /(^|_)(count|total)(_|$)/i;
export function hasCountLike(cols: Col[]): boolean {
  return cols.some(c => c.semantic === "count" || COUNT_NAME_RE.test(c.name));
}
```

The deliberately tight pattern set (status/state/stage/phase + count/total) trades coverage for precision. Future widening (e.g., `views`, `votes`, `qty`, `progress`) is a deliberate decision documented in TDR-038, not a drive-by addition.

### Live manifest cleanup

After the rule changes pass tests, remove the `view.kit:` pins from the two reproducer manifests:

- `~/.ainative/apps/portfolio-manager/manifest.yaml` — drop `kit: workflow-hub` from `view:`.
- `~/.ainative/apps/marketing-campaign-tracker/manifest.yaml` — drop `kit: tracker` from `view:`.

The two apps must pick the correct kit via auto-inference alone. This is the design oracle: if the rules are right, the pins are unnecessary. If the pins are still required, the rules need another pass.

## Test plan

Additions to `src/lib/apps/view-kits/__tests__/inference.test.ts`:

**Probe coverage**

- `hasStatusLike` — positive (`status`, `state`, `stage`, `phase`, `_status`, `pipeline_stage`, semantic `"status"`); negative for substring leak (`statesman`, `phaser`); semantic-wins-over-name precedence.
- `hasCountLike` — positive (`count`, `total`, `engagement_count`, `total_views`, semantic `"count"`); negative (`discount`, `subtotal_id`); semantic precedence.

**Rule changes**

- `rule1_ledger` — positive (`amount + date`); negative for snapshot shape (`cost_basis, current_price, market_value` — no date); negative for date-only (no currency).
- `rule2_tracker` — positive for status-only (`publish_date + status`); positive for count-only (`date + total_views`); positive for combined (status + count); still negative for date-only without any progress signal.

**Acceptance fixtures** (regression-prevention pattern, per the existing `reading-log → tracker NOT research` precedent at lines 553-578):

```ts
it("portfolio-manager-shape (positions snapshot) → workflow-hub", () => {
  // currency cols but no date — no rule fires, falls through
  const m = makeManifest({
    id: "portfolio-manager",
    profiles: [{ id: "portfolio-manager--analyst" }],
    blueprints: [{ id: "portfolio-manager--review" }],
    tables: [{ id: "t-pos" }],
    schedules: [{ id: "s", cron: "30 16 * * 1-5" }],
  });
  const colMap: ColumnSchemaRef[] = [{
    tableId: "t-pos",
    columns: [
      { name: "ticker" }, { name: "name" }, { name: "shares" },
      { name: "cost_basis" }, { name: "current_price" }, { name: "market_value" },
    ],
  }];
  expect(pickKit(m, colMap)).toBe("workflow-hub");
});

it("marketing-campaign-tracker-shape → tracker", () => {
  // date + status + count signal — tracker fires
  const m = makeManifest({
    id: "marketing-campaign-tracker",
    profiles: [{ id: "marketing-campaign-tracker--strategist" }],
    blueprints: [{ id: "marketing-campaign-tracker--content-pipeline" }],
    tables: [{ id: "t-camp" }],
    schedules: [{ id: "s", cron: "0 9 * * 1" }],
  });
  const colMap: ColumnSchemaRef[] = [{
    tableId: "t-camp",
    columns: [
      { name: "title" }, { name: "channel" }, { name: "status" },
      { name: "publish_date" }, { name: "engagement_count" }, { name: "notes" },
    ],
  }];
  expect(pickKit(m, colMap)).toBe("tracker");
});
```

**Decision-table precedence guard**

Add a test confirming ledger still wins over tracker when both could fire (currency + date + status all present). Prevents the new tracker probes from accidentally swallowing legitimate ledger cases.

## Smoke verification

Per the smoke discipline in `MEMORY.md` (recurring issues §smoke-test budget), tests are necessary but not sufficient for inference changes that depend on live column data. Drop a `.f2-f4-smoke-verify.ts` (gitignored by leading-dot convention) at project root:

```ts
import { loadColumnSchemas, pickKit } from "@/lib/apps/view-kits";
import { getApp } from "@/lib/apps/registry";

for (const id of ["portfolio-manager", "marketing-campaign-tracker"] as const) {
  const app = getApp(id);
  if (!app) throw new Error(`smoke fail: app ${id} missing`);
  // Synthetically remove the manifest pin to exercise inference
  const synthetic = { ...app.manifest, view: undefined };
  const cols = await loadColumnSchemas(synthetic);
  const kit = pickKit(synthetic, cols);
  console.log(`${id} → ${kit.id}`);
}
// Expected: portfolio-manager → workflow-hub
//           marketing-campaign-tracker → tracker
```

Run via `npx tsx .f2-f4-smoke-verify.ts`. Delete the file after smoke passes.

## Out of scope

- **Row-count signal as a kit selector.** A rowCount column already exists on `user_tables` (`src/lib/db/schema.ts:894`), but introducing a runtime data signal into inference is a larger architectural change. The current approach fixes both reproducers without it. Revisit if a future misfire can't be solved by manifest analysis alone.
- **Adding more progress-signal probes** (`views`, `votes`, `qty`, `progress`). Deliberately deferred — over-broadening tracker risks swallowing apps that genuinely have no progress signal. Add probes incrementally as real misfires surface.
- **Manifest-pin removal as a default policy.** The two manifests in this scope are the designed reproducers; pin removal here proves the rules. Other live apps with `view.kit:` pins are not in scope and stay untouched.

## Risks

| Risk | Mitigation |
|---|---|
| Tracker over-broadens, swallows apps that should be workflow-hub | Conservative probe vocabulary (no `views`/`qty`/`progress`); regression test for ledger precedence over tracker |
| `discount` matches `hasCountLike` (substring leak) | Word-boundary `(^|_)(count|total)(_|$)` regex; explicit negative test (`discount` does not match) |
| Removing manifest pins breaks the live apps if rules are wrong | Smoke verification step before commit; pins can be restored in seconds if regressions surface |
| Future column-shape probe additions get sloppy | TDR-038 documents the conservative-pattern principle; widening is a deliberate decision, not a drive-by |
