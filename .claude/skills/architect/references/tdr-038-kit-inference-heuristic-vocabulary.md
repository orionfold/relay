---
id: TDR-038
title: Kit Auto-Inference Heuristic Vocabulary — Conservative Column-Shape Probes
status: proposed
date: 2026-05-08
category: classification
related-spec: docs/superpowers/specs/2026-05-08-f2-f4-kit-inference-design.md
---

# TDR-038: Kit Auto-Inference Heuristic Vocabulary

## Context

The composed-app view-kit system at `src/lib/apps/view-kits/inference.ts` selects which UI kit (`tracker`, `workflow-hub`, `coach`, `ledger`, `inbox`, `research`, `placeholder`) renders a user's app. Selection is a 7-rule decision table, first match wins, no scoring, no tie-breakers. Each rule is a small named pure predicate that asks the manifest and column-shape probes a yes/no question.

The system has been live since Phase 2; Phase 5 hardening tightened `rule3_research` and `rule5_inbox` against personal-log shapes. Two further misfires surfaced in the F2/F4 design queue (handoff 2026-05-08):

- `rule1_ledger` matched any hero with a currency-named column, even snapshots (positions tables) with no transactional date.
- `rule2_tracker` only fired on `date + (boolean | rating)`, missing trackers that use categorical state or count columns as their progress signal.

Both misfires were currently masked by `view.kit:` pins on the live manifests. The design queue called for a coherent rule-set, not two patches.

## Decision

**Tighten ledger to require currency AND date. Broaden tracker to accept status-like and count-like signals alongside boolean and rating.** Add two new column-shape probes (`hasStatusLike`, `hasCountLike`) with deliberately conservative name vocabulary. Preserve "first match wins, no scoring" — no structural changes.

The ledger predicate becomes:

```ts
hasCurrency(cols) && hasDate(cols)
```

The tracker predicate becomes:

```ts
hasDate(cols) && (
  hasBoolean(cols) || hasRating(cols) || hasStatusLike(cols) || hasCountLike(cols)
)
```

The new probes match a **tight** vocabulary:

- `hasStatusLike`: `status`, `state`, `stage`, `phase` (or semantic `"status"`)
- `hasCountLike`: `count`, `total` (or semantic `"count"`)

Notably **excluded** from the initial vocabulary: `views`, `votes`, `qty`, `quantity`, `progress`, `hits`. These can be added later when a real misfire surfaces — never speculatively.

## Why these rules

**Ledger as transactional time-series.** A ledger kit renders a series chart, a categories breakdown, and a transactions list — all of which require a date axis. A positions snapshot has currency-shaped columns but no transactional date, and rendering it as a ledger produces a degenerate view. Requiring date prevents that.

**Tracker as dated-entries-with-any-progress-signal.** Trackers come in many shapes: habit logs (boolean `completed`), reading lists (numeric `rating`), pipeline stages (categorical `status`), engagement metrics (numeric `engagement_count`). The unifying property is "dated entries with some signal of state or measurement," not any single column type. Broadening to `boolean | rating | status-like | count-like` covers the population of real composed apps without inventing a runtime signal.

**Conservative probe vocabulary.** False positives in inference are expensive — they show users the wrong kit on first load, and the workaround (manifest pin) hides the problem rather than fixing it. The cost of a false negative is much lower: the workflow-hub fallback still renders something usable. So the rule of thumb is: **add probe terms only when a real composed app misfires, never speculatively**. `discount` looks like a count column; in practice it is currency. `subtotal_id` looks count-like; in practice it is a foreign key. The conservative vocabulary avoids these.

## Why not row counts

A `rowCount` column already exists on `user_tables` (`src/lib/db/schema.ts:894`), and the original F4 suggestion was a "if hero has rowCount > 5, prefer tracker" rule. We deliberately **did not adopt** this approach for three reasons:

1. **Volatile signal.** Row counts shift between dev and prod, between empty seed and live data. A tracker app on first launch with zero rows would mis-classify, then re-classify after the first row insert. That's a confusing UX.
2. **Out of layer.** Inference is a pure function of manifest + column shapes. Adding a runtime data signal is a larger architectural change — it would couple inference to the data layer's freshness model and require new staleness handling.
3. **Not needed.** The semantic-broadening approach (status/count probes) fixes the F4 reproducer without it.

If a future misfire can't be solved by manifest analysis alone, revisit. Until then, keep inference pure.

## Why not de-rank ledger to explicit-only

A more conservative option was to drop `rule1_ledger` from auto-inference entirely and require manifest opt-in. Rejected because the `finance-pack` fixture (`amount + date + category`) is a genuinely good auto-detection case, and the other zero-config kits (tracker, coach, research, inbox) all keep their inference paths. De-ranking ledger alone would make the system asymmetric without principled cause.

## Implementation contract

- Predicates remain pure functions of `(manifest, ColumnSchemaRef[])`.
- Probes follow tiered match precedence: explicit `semantic` > name regex (consistent with `hasCurrency`, `hasDate`, etc.).
- Name regexes use word boundaries `(^|_)X(_|$)` to avoid substring leaks (`discount` ≠ `count`, `phaser` ≠ `phase`).
- New probes export from `inference.ts` for test access (consistent with `hasRating`, `hasSourceShape`, etc.).

## Acceptance fixtures

Per the regression-prevention precedent set by `reading-log → tracker NOT research` (`inference.test.ts:553-578`), every real composed app that exposed a misfire becomes a permanent test fixture. This TDR adds two:

- `portfolio-manager-shape → workflow-hub` (currency cols but no date — no rule fires)
- `marketing-campaign-tracker-shape → tracker` (date + status + count)

The live manifests for both apps drop their `view.kit:` pins as a result. The pins served as workarounds for the misfires; with the rules correct, they are unnecessary, and removing them is the design oracle: **if the rules are right, the pins are unnecessary**.

## Future widening guidelines

When adding a new probe term:

1. **Real reproducer required.** A live composed app must misfire because of a missing term. Speculative additions are rejected.
2. **Test fixture.** Add the misfiring app's column shape as an acceptance fixture in `inference.test.ts`.
3. **Substring negative.** Add an explicit negative test for the most plausible substring collision (`discount` for `count`, `phaser` for `phase`).
4. **TDR amendment.** Document the new term and the live app it unblocks in this TDR's "history" section so the conservative-vocabulary discipline remains visible.

## Status

Proposed 2026-05-08. Will be promoted to **accepted** after F2+F4 ship + smoke-verify.

## Related

- Spec: `docs/superpowers/specs/2026-05-08-f2-f4-kit-inference-design.md`
- Phase 5 hardening precedent: `inference.test.ts` lines 553-578 (`reading-log → tracker NOT research`)
- Existing rule structure: `src/lib/apps/view-kits/inference.ts`
