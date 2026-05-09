# Handoff: design queue — F9 → F10 → Phase-5 → publish 0.14.2 (or 0.14.3)

**Created:** 2026-05-08, end of a session that shipped F2 + F4 (kit-inference rule-set tightening) and TDR-038 (heuristic-vocabulary discipline). Prior handoff archived at `.archive/handoff/2026-05-08-design-queue-f2-f4-pre-ship.md`.

**Status:** clean on `main` at `9fa90098`, pushed to `origin/main` (12 commits landed in this session). `package.json` still at `ainative-business@0.14.2` (unpublished). Publish remains deferred until F9 / F10 / Phase-5 are each shipped or formally punted. If anything else lands in code, bump to `0.14.3` and publish that single tag.

---

## What just shipped (F2 + F4)

Both ship-verified end-to-end against the live `portfolio-manager` and `marketing-campaign-tracker` apps with their manifest `view.kit:` pins removed (the design oracle).

**F2 — Ledger over-eager (P1).** `rule1_ledger` now requires currency AND date on the hero. Currency-shaped columns without a date are a snapshot, not a ledger. portfolio-manager (no date col on positions) cleanly drops to workflow-hub via the existing fallback.

**F4 — Workflow-hub hides table (P2).** `rule2_tracker` broadened to `date + (bool|rating|status|count)`. Two new column-shape probes — `hasStatusLike` (status/state/stage/phase) and `hasCountLike` (count/total) — follow the existing tiered-match-precedence pattern. marketing-campaign-tracker (publish_date + status + engagement_count) now resolves to tracker.

**EXPAND scope** that landed in the same pass:
- `DOC_BLUEPRINT_RE` and `INBOX_BLUEPRINT_RE` gained word-boundary anchors `(^|[-_])X([-_]|$)`. `executive-briefcase` no longer matches `brief`; `triaged-results` no longer matches `triage`.
- `rule3_research`'s legacy `if (!schemas) return true` fallback was replaced with `return false`. Closes a backdoor that fired research when callers omitted schemas.

**TDR-038 promoted to accepted** with the heuristic-vocabulary discipline codified: future probe terms require a real reproducer, never speculative additions.

Manifest pins removed from both reproducers. The pins served as workarounds for the misfires; with the rules correct, they are unnecessary.

**Commits:** `06372ae0` → `79a84e5a` (10 commits including the spec + TDR + plan).

---

## Latent issue surfaced (not fixed)

`loadColumnSchemas` (`src/lib/apps/view-kits/index.ts`) wraps `await import("@/lib/data/tables")` in a silent `try/catch` that returns empty cols on error. During F4 smoke verification, this masked a real `ReferenceError: require is not defined in ES module scope` originating from `src/lib/utils/app-root.ts:11` (`require("fs")` in an ESM context, transitively imported through profiles/registry).

The Next.js production runtime is unaffected (different module-load context). But the silent error swallow is a footgun: any future column-load regression will fail open to "no columns" instead of surfacing. Worth a small followup that either logs the error or removes the swallow entirely. See TDR-038's "Latent issue surfaced" section.

---

## Next up — F9 (P3): KPI computed expressions

KPI source kinds in `src/lib/apps/view-kits/evaluate-kpi.ts` don't support computed values like ratios/percentages. Two shapes to choose between:

- `tableExpression` — free-form expr like `total_value / total_positions * 100`. Maximally flexible; biggest footgun (eval injection if not sandboxed; type confusion).
- Structured composition — explicit `divide` / `ratio` / `percent` ops over existing source kinds. Safer; less expressive but easier to extend.

**Recommendation:** structured composition unless we hit a real case it can't express. Pre-decide a parse format that's easy to extend.

---

## Then — F10 (P3): Row-add idempotency

Symptom: agent inserted 13 rows from a 12-row CSV (1 dup). Need `(table_id, normalized_data_hash)` to prevent silent duplication. Open contract decisions:
- **Hash inputs:** all columns? user-marked "key" cols only? primary semantic cols?
- **Null/empty handling:** treat null and `""` as same? distinct?
- **Case sensitivity:** case-fold human-typed text fields, exact for IDs/numerics?
- **Scope:** within-batch dedupe vs across-batch vs both?

Likely needs a `row_hash` column migration on the table-rows surface alongside the `add_rows` chat tool change.

---

## Then — Phase-5 blueprints validity test

Pre-existing failure (4 in `router.test.ts`, 1 each in `api-version-window` / `settings`, plus the `phase-5-blueprints-validity.test.ts` file) — present on `main` since before this week's sessions. Two paths:
1. Author the missing builtins under `~/.ainative/blueprints/` so the test passes for everyone.
2. Mark the test environment-conditional (skip when builtins absent).

**Recommendation:** option (1) — a missing builtin is a real gap, not a test infra issue. Easiest path is to copy from a verified instance (one of the worktree clones) if they have them.

---

## Last — `npm publish ainative-business@0.14.2` (or `0.14.3`)

`package.json` still at `0.14.2`. Defer publish until F9 / F10 / Phase-5 either ship or are formally punted with a written reason. If any of them land in code, bump to `0.14.3` and publish that single release.

**Trigger when:** the three queue items above are each either (a) shipped + smoke-verified, or (b) explicitly punted with a reason in this handoff.
**Pattern:** `npm publish` → `docs(handoff): mark <version> published` (or version-bump-and-publish in the same commit if `0.14.3`).

---

## State left behind

### Branch / remote
On `main`, clean tree, in sync with `origin/main`. Latest: `9fa90098 docs(handoff): archive prior handoff (design-queue-f2-f4-pre-ship)`. The full session pushed as `858de3c1..9fa90098` (12 commits: spec + plan + 7 view-kits commits + TDR + handoff rotation + handoff archive). Tag in `package.json`: `ainative-business@0.14.2` (unpublished).

### Dev server
Was running on port 3000 through this session's smoke. If still up when you arrive, leave it. Otherwise restart per `MEMORY.md` (`pkill -f "next dev --turbopack$"` + `pkill -f "next-server"` + check `lsof ~/.ainative/ainative.db`).

### DB
- `~/.ainative/ainative.db.bak-2026-05-08-pre-row-key-backfill` — old F1 snapshot. Safe to delete after sanity check.
- F13 verification artifact: workflow `881d043b-340d-4201-9902-ad93d96c9dcc` in `marketing-campaign-tracker` (status=active). Approved Workflow Learning at `learned_context.dc61b794-570a-4feb-b522-ad6120b892be` (version=2).

### Apps on disk (8 total, two with pins removed)
| Slug | view.kit | Notes |
|---|---|---|
| portfolio-manager | (auto) | F2 fix proven — auto-resolves workflow-hub via no-date heuristic. Pin removed. |
| marketing-campaign-tracker | (auto) | F4 fix proven — auto-resolves tracker via status/count probes. Pin removed. |
| demo-* (6 apps) | unset | untouched. |

### Test count
2171 passing across the full suite (up from 2147 baseline; +24 new tests across the F2/F4/EXPAND work). 8 pre-existing failures unchanged (router / settings / api-version-window / phase-5-blueprints-validity).

---

## Quick context for whoever picks this up

- **TDR-038 is now the gatekeeper for column-shape vocabulary.** Any future probe-term addition needs a real reproducer (a live composed app misfiring because of a missing term). Speculative additions are rejected; live-app column shapes become permanent test fixtures.
- **F2/F4 reproducers are now passing fixtures, not pinned.** Both apps prove the inference rules end-to-end — if either re-misfires, it's a regression and the fix is in `inference.ts`, not the manifests.
- **`loadColumnSchemas` silent-swallow** is the biggest non-feature footgun on this surface. F2/F4 closed the inference rules but not the load path. Worth a small followup if anyone is in `src/lib/apps/view-kits/index.ts` for other reasons.
- **Smoke pattern for inference work:** drop a `.something-smoke-verify.ts` (gitignored implicit by leading dot) at project root, use `better-sqlite3` directly + `js-yaml` for manifest parsing rather than `@/lib/apps/registry`. Avoids the `require()`-in-ESM chain in `app-root.ts`. Always clean up after. Working example pattern (extracted from this session's smoke):

```ts
import Database from "better-sqlite3";
import { load as parseYaml } from "js-yaml";
import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const db = new Database(join(homedir(), ".ainative", "ainative.db"), { readonly: true });
const stmt = db.prepare("SELECT name, data_type, config FROM user_table_columns WHERE table_id = ? ORDER BY position");
// then call your pure inference function with manifest YAML + stmt.all(tableId)
```
- "Fix at the chokepoint" pattern continues to pay off — F2+F4 closed the inference misfires at the predicate layer, no per-app pins needed. Same as F1, F8.
