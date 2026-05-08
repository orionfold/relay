# Handoff: design queue — F2+F4 → F9 → F10 → Phase-5 → publish 0.14.2 (or 0.14.3)

**Created:** 2026-05-08, end of a session that smoke-verified F8/F11/F12/F7 (all 4 PASS) and approved the Workflow Learning proposal for `marketing-campaign-tracker--strategist`. Prior handoff archived at `.archive/handoff/2026-05-08-f8-f11-f12-f7-shipped-and-smoked.md`.

**Status:** clean on `main` at `fdf41bec`. `package.json` is at `ainative-business@0.14.2` but **not yet published to npm** — publish is deliberately deferred to the very end of the queue below so a single tagged release can cover whatever F2+F4 / F9 / F10 produce. If anything else lands in code, bump to `0.14.3` and publish that instead.

---

## Start here — F2 + F4 (brainstorm before code)

These two share a root: kit auto-inference in `src/lib/apps/view-kits/inference.ts` is misfiring on two adjacent disambiguations. Solve them with one coherent rule-set, not two patches.

**F2 (P1) — Ledger over-eager.** Any table with a money column gets tagged ledger (e.g. positions table with `cost_basis` ≠ ledger semantics). Symptom currently masked by portfolio-manager's manifest manually setting `view.kit: workflow-hub`. Heuristic options to evaluate:
- require multiple money columns (ratio of money-cols to total cols) before considering ledger
- require a `date` / `timestamp` column to consider ledger
- require the textbook double-entry shape (money + date + a `category`/`type` column)
- de-rank ledger in inference; keep it for explicit `view.kit: ledger` only

**F4 (P2) — Workflow-hub hides table for trackers.** Marketing Campaign Tracker auto-infers to workflow-hub, hiding the data table the user wants to see. Suggested rule: `userTableRows.count > 5` favors a table-rendering kit over workflow-hub.

**Process recommendation:** invoke `superpowers:brainstorming` on F2+F4 jointly → write a rule-set spec → record as a TDR via `/architect` (heuristic rules deserve documented "why this rule?" answers) → `superpowers:writing-plans` for the code change. Estimate: 1 design session, 1 implementation session, +1 smoke run.

---

## Then — F9 (P3): KPI computed expressions

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

Pre-existing failure (4 in `router.test.ts`, 1 each in `api-version-window` / `settings`) — present on `main` since before this week's sessions. Two paths:
1. Author the missing builtins under `~/.ainative/blueprints/` so the test passes for everyone.
2. Mark the test environment-conditional (skip when builtins absent).

**Recommendation:** option (1) — a missing builtin is a real gap, not a test infra issue. Easiest path is to copy from a verified instance (one of the worktree clones) if they have them.

---

## Last — `npm publish ainative-business@0.14.2` (or `0.14.3`)

`package.json` already at `0.14.2` (committed `217181ea`, smoke-verified `fdf41bec`). Defer publish until F2+F4 / F9 / F10 / Phase-5 either ship or are formally deferred with a written reason. If any of them land in code, bump to `0.14.3` and publish that single release — fewer release-noise commits, more user-visible value per tag.

**Trigger when:** the four design items above are each either (a) shipped + smoke-verified, or (b) explicitly punted with a reason in this handoff. **Pattern:** `npm publish` → `docs(handoff): mark <version> published` (or version-bump-and-publish in the same commit if `0.14.3`).

---

## State left behind

### Branch / remote
On `main`, clean tree, ahead by 0 commits. Latest: `fdf41bec fix(chat): ship F7 — collapse duplicate same-name project pills in QuickAccess (P3)`. Tag in `package.json`: `ainative-business@0.14.2` (unpublished).

### Dev server
PID 28819 (parent 28818) was running through the smoke session and held the DB lock. If it's still up when you arrive, leave it; otherwise restart per the recurring-issues note in `MEMORY.md` (`pkill -f "next dev --turbopack$"` + `pkill -f "next-server"` + check `lsof ~/.ainative/ainative.db`).

### DB
- `~/.ainative/ainative.db.bak-2026-05-08-pre-row-key-backfill` — old F1 snapshot. Safe to delete after sanity check.
- F13 verification artifact: workflow `881d043b-340d-4201-9902-ad93d96c9dcc` in `marketing-campaign-tracker` (status=active). Its Channel Audit task hit the 13-turn limit, generated a Workflow Learning proposal, which was approved during the smoke session.
- New approved row: `learned_context.dc61b794-570a-4feb-b522-ad6120b892be` (approved, version=2) for `marketing-campaign-tracker--strategist`. Two patterns committed (turn-limit-exhaustion / aggregated-SQL preference). Original proposal `44bc5a70-…` retained as version=1 history (append-only).

### Apps on disk (8 total, unchanged)
| Slug | view.kit | Notes |
|---|---|---|
| portfolio-manager | workflow-hub | F1 backfill + F3 KPIs render. **Ledger override masked by manifest because of F2 misfire — this is the F2 reproducer.** |
| marketing-campaign-tracker | tracker | F13 trigger fires correctly. F4 reproducer: auto-inference would pick workflow-hub here, manifest pins tracker. |
| demo-* (6 apps) | unset | untouched. |

### Test count
2147 passing across the full suite. 8 pre-existing failures unchanged (router / settings / api-version-window / phase-5-blueprints-validity).

---

## Quick context for whoever picks this up

- **F2/F4 reproducers are sitting in the apps table** — both portfolio-manager and marketing-campaign-tracker have manifest overrides that mask the inference misfire. When designing the heuristic, run inference *without* the manifest override on these two apps to see what the rule would pick by default.
- **Smoke pattern from this session:** drop a small `.<name>-smoke-verify.ts` (gitignored implicit by leading dot) into the project root, `import` from `@/lib/...`, run via `npx tsx`. Calls real code paths against the real DB. Same proof as chat-driven smoke at a fraction of the cost. Always clean up synthetic state after.
- `src/test/setup.ts` stubs `hasPointerCapture` + `releasePointerCapture` (added F12). Any new test using a Radix dropdown / select / popover "just works" without per-file workarounds.
- TS diagnostic panel is unreliable — phantom `Cannot find module '@/lib/db'` warnings appear and clear after a few seconds. Trust `npx tsc --noEmit | grep <file>` for ground truth (per `MEMORY.md`).
- "Fix at the chokepoint" pattern (F1, F8) keeps paying interest — closing a bug class at the data-layer beats per-caller patches. F2+F4 should preserve this: one rule update at the inference layer, not per-app overrides.
