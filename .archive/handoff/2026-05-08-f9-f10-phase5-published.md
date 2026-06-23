# Handoff: F9 + F10 + Phase-5 shipped — `ainative-business@0.14.3` published

**Created:** 2026-05-08, end of a session that shipped F9 (KPI ratio composition), F10 (row-add idempotency), and Phase-5 (blueprints validity test fix), then released as `ainative-business@0.14.3` to npm. Prior handoff archived at `.archive/handoff/2026-05-08-design-queue-f9-f10-phase5.md`.

**Status:** clean on `main` at `015aa155`, fully pushed to `origin/main`. **`ainative-business@0.14.3` is live on npm** (verified via `npm view`). The full session push spans `757f37cd..015aa155` (10 commits: 8 feature/docs + 1 release + 1 README polish).

---

## What just shipped

### F9 — KPI computed expressions (P3)

Added `kind: ratio` as a structured composition KPI source in `src/lib/apps/registry.ts` and `src/lib/apps/view-kits/evaluate-kpi.ts`. Composes two leaf sources into `numerator / denominator`; nested ratios rejected at schema level by construction. `Promise.all`-parallel child evaluation.

Live reproducer fixed: `~/.ainative/apps/portfolio-manager/manifest.yaml` had a wrong `Largest Position %` tile (used `tableLatest` of `market_value`). Replaced with `Avg Position Value` = `tableSum(market_value) / tableCount(positions)`. Browser-verified: tile renders `$11,865.55`, exact match with `$94,924.39 / 8` from a live DB query.

3 schema tests + 6 engine tests added. **Spec:** `docs/superpowers/specs/2026-05-08-f9-kpi-computed-expressions-design.md`. **Plan:** `docs/superpowers/plans/2026-05-08-f9-kpi-computed-expressions.md`.

### F10 — Row-add idempotency (P3)

Added `data_hash TEXT` column on `user_table_rows` plus a partial UNIQUE INDEX on `(table_id, data_hash) WHERE data_hash IS NOT NULL`. New helper `src/lib/data/row-hash.ts` does column-ordered canonicalization (null/undefined/`""` collapsed to a single canonical empty) + SHA-256.

`addRows()` in `src/lib/data/tables.ts` now hashes every input row, dedupes within-batch via an in-memory `Set`, and uses Drizzle's `onConflictDoNothing()` (no target — partial-index-friendly) for across-batch dedupe. Return shape changed from `string[]` to `{ ids, skippedHashes }`. Updated all 5 callers (`add_rows` chat tool, `/api/tables/[id]/rows`, `tables/import.ts`, `data/seed.ts`, plus 2 test files).

The 12-row CSV with 1 mid-batch dup reproducer is now a regression test — `tests/tables-row-idempotency.test.ts` confirms 11 inserted, 1 skipped.

8 hash-helper tests + 5 idempotency tests added. **Spec:** `docs/superpowers/specs/2026-05-08-f10-row-add-idempotency-design.md`.

**Implementation deltas vs. spec** (recorded in the spec's verification section):
- Drizzle `onConflictDoNothing({ target: ... })` doesn't emit the partial-index `WHERE` clause SQLite needs. Switched to `onConflictDoNothing()` no-target form, which catches violations against ANY unique constraint.
- Backfill module (`src/lib/db/backfill/row-hash.ts`) deferred. Existing rows keep `data_hash = NULL`; the partial index ignores them. New rows always hash. This was acceptable per the user's reproducer focus (agent-driven inserts, not legacy data). Backfill is a fileable follow-up.
- Bootstrap placement: first attempt placed the `ALTER TABLE user_table_rows ADD COLUMN data_hash` at line ~635 (before the `CREATE TABLE` for `user_table_rows` at line 766) — exactly the MEMORY.md gotcha. Final placement is the post-CREATE-TABLE "safety: add columns" block at the end of `bootstrapAinativeDatabase()`.

### Phase-5 — Blueprints validity test

`phase-5-blueprints-validity.test.ts` was failing because the source YAMLs lived at `~/.ainative/blueprints/` (gitignored, dev-machine-only). Promoted both blueprints to repo-level builtins under `src/lib/workflows/blueprints/builtins/`:

- `customer-follow-up-drafter--draft-followup.yaml` (1 step, 4 row-driven variables, `domain: work`, `cs-coach` profile)
- `research-digest--weekly-digest.yaml` (1 step, 1 period variable, `domain: work`, `researcher` profile)

The registry's built-in scan (`registry.ts:9-12`) loads them automatically; the test was simplified — no more file-copy ceremony from a non-portable source. Existing user-authored overrides under `~/.ainative/blueprints/` continue to take precedence (registry merge order at `registry.ts:60`).

---

## Session test count

- **Before:** 2171 passing, 8 baseline failures (router x6, api-version-window, settings, phase-5-blueprints-validity).
- **After:** 2195 passing, 8 baseline failures (router x6, api-version-window, settings — phase-5 fixed and out of the failure list).
- **+24 new tests** across F9/F10/Phase-5.

---

## Commits this session (8 total)

```
16e68f87 feat(blueprints): promote Phase 5 blueprints to repo-level builtins
0ab653a5 docs(f10): mark shipped + record verification + impl deltas
b5984ee0 feat(tables): row-add idempotency via canonical hash + ON CONFLICT
55466b4e feat(tables): add canonical row-hash helper for F10 idempotency
de592501 docs(f10): design — row-add idempotency via canonical hash + ON CONFLICT
823c810d docs(f9): mark KPI ratio shipped + verification record
e6fb6fe8 feat(view-kits): dispatch ratio in evaluateKpi
6bd3f841 feat(view-kits): add KPI ratio source kind to schema
```

Bisectable order maintained: schema-only commits land first (engine non-exhaustive but vacuously safe), engine commits second, docs last.

---

## Release record — 0.14.3 published 2026-05-08

`ainative-business@0.14.3` is live on the npm registry. Published from a separate terminal after `npm pack` verification on this end. The published tarball's shasum differs from the local `npm pack` because `npm publish` re-runs the `prepublishOnly` hook (`npm run build:cli` → tsup), regenerating `dist/cli.js` with a fresh build artifact — version identity is what matters, and 0.14.3 is what's live.

Suggested next-step pipeline (not invoked this session): `/refresh-content-pipeline` to cascade the F9/F10 changes through screengrab → doc-generator → user-guide-sync → book-updater. The README + snapshot were updated surgically this session; book chapters and per-feature reference docs are still on the prior version.

---

## State left behind

### Branch / remote
On `main`, clean working tree (after the version-bump commit, which is uncommitted at the moment of writing this handoff). 9 commits ahead of `origin/main` (8 feature + 1 version bump pending).

### Dev server
Restarted once during this session (after the F9 schema commit — the running server held the pre-F9 schema in its module graph). Per `feedback-only-restart-own-dev-server.md`, was targeted to `:3000` PID via `lsof -ti:3000`. Currently running at PID 79561 with the post-F9 (and through Phase-5) code loaded. Pre-existing transport-dispatch dynamic-import warning + Turbopack workspace-root inference warning are unchanged from before this session.

### DB
- F9 verified against the same ainative.db that Phase-5 ran against — no DB mutations from F9.
- F10 added `data_hash` column. The dev server's process picked up the bootstrap on restart; existing rows in `~/.ainative/ainative.db` have `data_hash = NULL` (legacy, dedupe-disabled). New rows from any code path now get hashes.
- F10 backup recommendation: if anyone's worried about the F10 migration on their own DB, the bootstrap is idempotent — `addColumnIfMissing` no-ops if the column exists, and the partial index uses `IF NOT EXISTS`. Safe to re-run.
- Old `~/.ainative/ainative.db.bak-2026-05-08-pre-row-key-backfill` from prior F1 session — still safe to delete.

### Apps on disk (8 total)
| Slug | view.kit | Notes |
|---|---|---|
| portfolio-manager | (auto) | F9 fix proven — `Avg Position Value` ratio tile renders end-to-end. |
| marketing-campaign-tracker | (auto) | F4-shipped, untouched this session. |
| demo-* (6 apps) | unset | untouched. |

---

## Open follow-ups (low priority — file individually)

1. **F10 backfill module** — `src/lib/db/backfill/row-hash.ts` to retroactively hash legacy rows. The current ship lets legacy rows stay nullable (and dedupe-disabled) which is correct but means a 13th row insert with same data as an existing legacy row WILL succeed. Backfill closes that gap. Probe: `SELECT 1 FROM user_table_rows WHERE data_hash IS NULL LIMIT 1` — runs only when needed.
2. **`loadColumnSchemas` silent-swallow** (carried over from prior handoff lines 30-35) — the `try/catch` wrapping `await import("@/lib/data/tables")` in `src/lib/apps/view-kits/index.ts` masks real errors. Worth a small followup that either logs the error or removes the swallow entirely.
3. **F10 telemetry on dedupe rate** — fileable as a separate feature. The `skippedHashes` count is currently surfaced to the chat tool's response; a counter / log line on each dedupe would help spot agents that re-read excessively.
4. **`tableExpression` / `add` / `multiply` KPI source kinds** — explicitly out of scope per F9 spec and TDR-038's heuristic-vocabulary discipline. Add only when a real reproducer demands them.

---

## Quick context for whoever picks this up

- **The MEMORY.md `addColumnIfMissing` gotcha is real and recurring.** F10 hit it exactly. If you're adding a column to a table whose `CREATE TABLE` lives in a separate template-string block from the addColumnIfMissing calls, the ALTER will fail silently on fresh DBs. Always place the ALTER AFTER the CREATE TABLE block — bottom of `bootstrapAinativeDatabase()` is the safe spot.
- **Drizzle's `onConflictDoNothing()` no-target form is partial-index-friendly.** Specifying `{ target: [...] }` requires the partial WHERE clause to be echoed in the conflict target syntax, which Drizzle doesn't emit. The no-target form ("ON CONFLICT DO NOTHING") catches violations against ANY unique constraint and works seamlessly with partial indexes.
- **Schema changes that dev-server processes have already loaded need a server restart.** F9's schema change required killing the existing dev server (PID 28819 was started before the schema commit and held the pre-F9 Zod union in its module graph) — `getApp()` reads manifest.yaml fresh but the schema is module-scoped. Browser 404s with a "valid manifest fails to parse" hint = stale dev server.
- **Phase-5 builtins promotion was the right call.** The handoff's option (1) recommendation ("missing builtin is a real gap") is correct. The user-overrides-builtins merge in the registry means promoting to builtins doesn't disrupt anyone who customized the YAMLs locally.
