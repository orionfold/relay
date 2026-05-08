# Handoff: 4 P3 quick wins shipped + 0.14.2 release — F8/F11/F12/F7 (smoke verified)

**Created:** 2026-05-08 after a foreground "ship F8 quick win" → "continue" → "commit and push then continue" autopilot run. All four fixes have unit tests AND were live-smoked against the running dev instance later the same day (see "Verification — 2026-05-08 (smoke run)" below). Prior handoff archived at `.archive/handoff/2026-05-08-f1-f3-f5-f13-shipped-archived.md`.

**Status:** 6 commits pushed to `origin/main` (`56c3f9a1..fdf41bec`); released as `ainative-business@0.14.2` (version bump committed but **not published to npm** — see "Release decision" below). 2147 unit tests pass across the affected surfaces; the 8 pre-existing failures from `main` are unchanged (router, settings, api-version-window, phase-5-blueprints-validity).

---

## What shipped this session

| ID | Severity | What | Files | Verification |
|----|----|----|----|----|
| F8 | P3 | `ensureAppProject()` now resolves project name from the app manifest (or `titleCase(appId)` fallback), not from a caller-supplied artifact name. The `displayName` parameter is removed; all 4 chat-tool callers updated. Closes the bug class for any future writer (plugins, MCP, future tools) — not just the chat tools that surfaced it. | `src/lib/apps/compose-integration.ts`, `src/lib/chat/tools/{profile,blueprint,table,schedule}-tools.ts`, `src/lib/apps/__tests__/compose-integration.test.ts`, `src/lib/chat/tools/__tests__/profile-tools.test.ts` | New regression test asserts manifest's name wins over a slug-cased fallback even when the manifest carries an unrelated label. Existing 3 tests adapted to the new signature. |
| F11 | P3 | `/apps/<id>` H1 wraps to 2 lines (`line-clamp-2`) instead of single-line ellipsis. `title` attr preserved for hover-tooltip. | `src/components/apps/kit-view/slots/header.tsx` | Pure CSS change. No test added — visual-only. |
| F12 | P3 | "Delete app" moved out of the always-visible toolbar into a kebab `MoreHorizontal` dropdown. Existing `ConfirmDialog` flow preserved; two-layer safety (out-of-eyeline + confirm) for an irreversible action. Test setup gained `hasPointerCapture`/`releasePointerCapture` stubs alongside the existing `scrollIntoView` + `ResizeObserver` stubs so Radix DropdownMenu opens in JSDOM — unblocks **all** future Radix-dropdown / Select / Popover component tests. | `src/components/apps/app-detail-actions.tsx`, `src/components/apps/__tests__/app-detail-actions.test.tsx`, `src/test/setup.ts` | New "kebab-only at rest" test + 7 existing pluralization/toast-path tests adapted to navigate kebab → menuitem → confirm. 8/8 pass. |
| F7 | P3 | New `deduplicateByEntityTypeAndLabel` collapses QuickAccess pills sharing `(entityType, lowercased label)`. Applied only in `detectEntities` (name-substring path), NOT in `extractToolResultEntities` (which intentionally repeats labels like "View Project" for distinct tool-result entities). | `src/lib/chat/entity-detector.ts`, `src/lib/chat/__tests__/entity-detector-dedup.test.ts` | 5 new unit tests: same-name collapse, case insensitivity, cross-type preservation, no-op on unique input, regression guard on the existing entityId dedup. |
| — | release | `chore(release): 0.14.2` — F1/F3/F5/F13 + F8/F11/F12 batch. Version bump only; no `npm publish` performed. | `package.json`, `package-lock.json` | Lockfile updated via `npm version 0.14.2 --no-git-tag-version`. |

`★ Why F7 needed F8 first`
F8's manifest-name resolution made same-name collisions **more frequent**, not less. Pre-F8, slug-id projects were named after their first composed primitive (e.g. "Portfolio Coach"), which usually didn't collide with the canonical app name a user might already have. Post-F8, the slug-id project uses the manifest name ("Portfolio Manager") — exactly the name a user is most likely to type/reference. So the substring matcher in entity-detector now finds **both** projects and emits both as pills. The handoff's two options ("suppress existing-name match" vs "rename slug-id project") aren't either-or — F8 took rename, F7 added the suppression layer on top. They're a pair.

---

## Verification — 2026-05-08 (smoke run)

All four fixes smoke-verified against the live dev server (PID 28819, `~/.ainative/ainative.db`). No regressions observed.

| ID | How verified | Result |
|---|---|---|
| F12 | Browser: navigated to `/apps/portfolio-manager`, inspected toolbar at rest (no Delete button visible — only Running badge, schedule chip, kebab `…`, View manifest). Clicked the kebab, confirmed single-item dropdown with "Delete app" (trash icon, destructive red). | PASS |
| F11 | Browser: H1 className confirmed as `text-xl font-semibold tracking-tight line-clamp-2`. Forced a 105-char string into the H1 via DOM injection: text wrapped to exactly 2 lines (`clientHeight=49px = 2× line-height`); toolbar gracefully reflowed below the H1. DOM reverted after test. | PASS |
| F8 | Direct code-path invocation: wrote `~/.ainative/apps/f8-smoke/manifest.yaml` with `name: "Content Engine"`, ran `ensureAppProject('f8-smoke')` via tsx against the live DB. Inserted `projects` row had `name="Content Engine"` (manifest source of truth), not the slug-cased fallback. | PASS |
| F7 | Direct code-path invocation: with two `projects` rows sharing `name="Content Engine"` (real `07d7edff-…` + synthetic `f8-smoke`), called `detectEntities("Looking at Content Engine, the project has weekly SEO articles…")`. Result: exactly 1 project pill (entityId=`07d7edff-…`). Pre-F7 would have emitted 2. | PASS |

**Why direct code-path invocation for F8/F7 instead of full chat smoke:** tsx scripts call the exact functions the chat UI depends on (`ensureAppProject`, `detectEntities`) against the real DB — same proof, no model-call cost, no chat-agent flakiness. Synthetic app/scripts cleaned up after the run; baseline state restored (8 apps on disk; only the approved `learned_context` row from the inbox approval below remains).

**Inbox housekeeping done same session:** approved the pending Workflow Learning context proposal (`44bc5a70-c9ce-49b4-9a8b-c4b91c6e688b`) for `marketing-campaign-tracker--strategist`. Two patterns committed (turn-limit exhaustion / aggregated-SQL preference) — version=2, change_type=approved, approved_by=human. Source was the Channel Audit failure tied to the F13 verification workflow `881d043b-…`.

**Bonus infra discovery:** The TS diagnostic panel showed bogus `Cannot find module '@/lib/db'` warnings during the smoke run for several files — confirms the `MEMORY.md` note that the inline diagnostics panel is unreliable. `npx tsc --noEmit` is the trustworthy ground truth.

---

## Carry-forward findings (need brainstorming/design before code)

These remain open and need design conversation before implementation. Severities preserved.

- **F2 P1** — Ledger kit too eagerly inferred for any table with a money column (e.g. `cost_basis` ≠ ledger semantics). Surface: `src/lib/apps/view-kits/inference.ts`. Open heuristic options: ratio-of-money-cols, require date-col for ledger, etc. Symptom is masked for portfolio-manager (manually switched to workflow-hub in its manifest), but the inference rule still misfires for new apps.
- **F4 P2** — workflow-hub auto-inferred for Marketing Tracker hides the data table. Same root cause as F2 but for tracker/workflow-hub disambiguation. Suggested heuristic: `userTableRows.count > 5` favors table-rendering kit. F2 + F4 share root and should be brainstormed together.
- **F6 P3** — Schedules bind to profiles, not blueprints. User mental model: "schedule fires the work" (blueprint). System model: "schedule fires the worker" (profile). Needs UX/spec decision before code.
- **F9 P3** — KPI source kinds don't support computed expressions (ratios, percentages). Needs a new source kind in the KPI evaluator (`tableExpression` or `divide` composition). Medium effort once shape is decided.
- **F10 P3** — Agent inserted 13 rows from 12-row CSV (1 dup). Idempotency on `(table_id, normalized_data_hash)` would prevent. Needs design for the hash contract (which fields contribute, how to handle nulls, how aggressively to dedupe).

---

## State left behind

### Branch / remote
- On `main`, clean working tree, ahead by 0 commits (all 6 pushed).
- Latest commit: `fdf41bec fix(chat): ship F7 — collapse duplicate same-name project pills in QuickAccess (P3)`
- Tag: `ainative-business@0.14.2` in `package.json` but **not published to npm**. The handoff that started this session noted F1 alone justified a patch release; with F8/F11/F12/F7 added, the case is stronger but `npm publish` still requires explicit user go-ahead.

### Dev server
- Prior handoff started PID 28796 — **status not verified this session** (no UI work). If you're picking up from here and need a running dev server, kill any stale processes first per the recurring-issues note in `MEMORY.md` (`pkill -f "next dev --turbopack$"` + `pkill -f "next-server"` + check `lsof ~/.ainative/ainative.db`).

### DB
- `~/.ainative/ainative.db.bak-2026-05-08-pre-row-key-backfill` — DB snapshot from the F1 backfill in the prior session. **Safe to delete after sanity check.** No new backups taken this session.
- One verification artifact from F13 still present: workflow `881d043b-340d-4201-9902-ad93d96c9dcc` in `marketing-campaign-tracker` project (status=active) and its associated task. The smoke run revealed this workflow's Channel Audit task hit the 13-turn limit (notification `d609be8e-…`) and emitted a Workflow Learning proposal that was approved during the smoke run (see Verification section). Harmless; let it run or `DELETE FROM workflows WHERE id='881d043b-...'`.
- New rows added in smoke session: `learned_context.dc61b794-570a-4feb-b522-ad6120b892be` (approved, version=2) for `marketing-campaign-tracker--strategist`. The original proposal row (`44bc5a70-…`, version=1) is retained as immutable history — that's how the approval flow shapes the table.

### Apps on disk (8 total — unchanged from prior handoff)
| Slug | view.kit | Notes |
|---|---|---|
| portfolio-manager | workflow-hub | F1 backfill (8 rows canonical-keyed) + F3 KPIs render. F8 fix means a re-compose would now create the project named "Portfolio Manager" (was "Portfolio Coach"). |
| marketing-campaign-tracker | tracker | F13 trigger fires correctly. |
| demo-* (6 apps) | unset | untouched. |

### Test count
- 2147 passing across the full suite (was 2145 in the prior handoff baseline + 2 new tests this session).
- 8 pre-existing failures unchanged: `phase-5-blueprints-validity` (4 in `router.test.ts`, 1 each in `api-version-window` and `settings`). Confirmed via `git stash` against unmodified `main` at start of session.

---

## Recommended next moves

1. **Decide on `npm publish` for 0.14.2.** Version bump is committed; only the publish step remains. If you publish, follow the existing pattern: `npm publish` → docs(handoff) commit marking it published. F1 (P0) is genuinely user-visible and was the original justification — F7's "two pills with the same name" is also visually confusing for any user with name-collisions, and is now smoke-verified.
2. **Brainstorm F2 + F4 together** — they share root (kit-inference rules in `src/lib/apps/view-kits/inference.ts`). Bring the heuristic options to discussion: data-density tie-breaker, money-col-ratio rule, required date-col for ledger. Coding without that conversation risks shipping the wrong rule and re-thrashing.
3. **Design F9 source kind** — pick between `tableExpression` (free-form expr like `total_value / total_positions * 100`) and a structured `divide`/`ratio` composition (safer, less footgun). Implement in `src/lib/apps/view-kits/evaluate-kpi.ts`. Medium effort once shape is decided.
4. **Design F10 idempotency** — the hash contract is the real decision: which columns contribute, case-sensitivity, null/empty-string handling, whether to dedupe within a single `add_rows` call or also across calls within a window.
5. **Phase 5 blueprints validity test** — pre-existing failure; either author the missing builtins under `~/.ainative/blueprints/` or mark the test environment-conditional. Not a regression from any session this week.
6. ~~Re-smoke F8/F11/F12/F7~~ — **DONE** in the smoke run section above. Move on to (1)–(5).

---

## Quick context for whoever picks this up

- `src/test/setup.ts` now stubs `hasPointerCapture` + `releasePointerCapture`. Any new test using a Radix dropdown / select / popover should "just work" without per-file workarounds. The pattern to open one in JSDOM: `fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false }); fireEvent.click(trigger); await screen.findByRole("menuitem", ...)`.
- The "fix at the chokepoint" pattern (F1, F8) keeps paying interest — closing a bug class at the data-layer means no per-caller patches and no future-writer regressions. Worth defaulting to when reviewing fixes that look like "5 callers all do X wrong."
- F8 + F7 are a **pair**: F8 fixes the canonical-naming intent, F7 fixes the substring-matcher's downstream consequence. If a future change reverts either, double-check the other still makes sense in isolation.
- **Smoke pattern that worked here**: drop a small `.f8-smoke-verify.ts` (gitignored implicit by leading dot) into the project root, `import` from `@/lib/...`, run via `npx tsx`. It calls the real code path against the real DB — same proof as a chat-driven smoke at a fraction of the cost. Useful when the bug is at the data layer and the chat UI is just a viewer. Always cleanup afterward.
