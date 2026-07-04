# fix: fresh install shows "Stale" pricing on day one (frozen bundled-default date)

**Status:** proposed · **Priority:** P3 (LOW) · **Milestone:** unscheduled
**Source:** staging Mode B run 2026-07-03, bundle `output/staging/2026-07-03/R2/` (finding J6-1, verified against HEAD `3e0f438c`)
**Dependencies:** none.

## Description (verified mechanism)

On a fresh install, `/costs` (Observe → Cost & Usage) shows PRICING freshness **"Stale · Updated Mar 16,
2026"** immediately, before the user does anything. Alarming cold-start impression ("your product shipped
with stale data") on a surface that's otherwise honest and well-built.

**Root cause — a frozen bundle date vs a short wall-clock window (design tension, not a math bug):**
- `src/lib/usage/pricing-registry.ts:170` — `const nowIso = "2026-03-17T00:00:00.000Z";` is a **frozen
  literal**, not `Date.now()`. It feeds `fetchedAtIso` (`:177`, `:186`) and `version: "bundled-2026-03-17"`
  (`:178`, `:187`) for both bundled providers.
- `:41` `STALE_AFTER_MS = 1000*60*60*24*7` (7 days). `:504-507` computes
  `stale = Date.now() - fetchedAt > STALE_AFTER_MS`.
- No release tooling regenerates the date — it only changes when someone hand-edits `:170`.
  (`scripts/check-price-drift.mjs` is unrelated: it diffs the *pack* USD price, not the LLM registry.)

Result: any install more than 7 days after the bundle was cut shows "Stale" on day one. Today (~108 days
after 2026-03-17) it's unconditional.

## Proposed fix (pick one)
- **(a)** Make `pricing-registry.ts:170` generated at release — a build/release step stamps the bundle
  date to the release date so a fresh install is "current" for its first ~week. Simplest to reason about;
  ties the pricing snapshot's freshness to the ship cadence.
- **(b)** Distinguish `sourceType: "bundled_default"` "never refreshed" from "refreshed-but-old" in the
  freshness indicator — a fresh install renders e.g. "Bundled pricing — refresh for latest" (neutral)
  rather than a red "Stale," and only shows "Stale" once the user has actually refreshed and that refresh
  aged out. More honest to the user's mental model (they haven't done anything to be "stale" about).

## Repro
Fresh install → Observe → Cost & Usage → PRICING tile reads "Stale · Updated Mar 16, 2026" with no prior action.

## Verification
Fresh instance → assert the freshness indicator does NOT read a red "Stale" on first load (per whichever
fix). If (a): assert the bundled `version`/`fetchedAtIso` matches the release date.
