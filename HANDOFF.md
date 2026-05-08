# Handoff: App-builder smoke for Portfolio Manager + Marketing Campaign Tracker — 13 findings, 1 P0 + 4 P1

**Created:** 2026-05-08 after end-to-end browser smoke composing two apps via chat (build → seed CSV → use → modify), running against `ainative-business@0.14.0` on the live dev server (PID 13499). Plan file: `~/.claude/plans/review-the-app-building-zazzy-newell.md`. Prior handoff (`0.14.0 shipped to npm`) archived at `.archive/handoff/2026-05-08-pre-app-builder-smoke-archived.md`.

**Status:** Smoke completed cleanly through all 12 phases on first attempt. Both apps composed successfully and persist on disk (`~/.ainative/apps/portfolio-manager/`, `~/.ainative/apps/marketing-campaign-tracker/`). The 2026-05-04 P0 (`workflow-hub.ts:51,63` server/client boundary) is **confirmed fixed** — composed-app view-shell renders without crash. **One new P0** surfaced (cell rendering by display_name vs. canonical name), plus 11 lower-severity findings. Two carry-forward findings from 2026-05-04 confirmed fixed (workflow-hub crash, "Habit tracker missing from starters").

---

## TL;DR for the next agent — fix in priority order

1. **🐛 P0: Row data in `user_table_rows.data` is keyed by column `display_name` instead of canonical `name` — invisible cells.** When a chat tool creates rows for a table whose `display_name` differs from `name` (e.g. `display_name: "Cost Basis ($)"` vs `name: "cost_basis"`), the data lands in the DB as `{"Cost Basis ($)": 145.2}` but the table renderer reads by canonical `name` → every cell shows `—`. Repro: the Portfolio Manager `/tables/8f744af3-1b0f-424b-950c-71ca9d74184f` page shows "8 rows" but every cell is a dash. DB has the data; UI can't find it. `output/2026-05-08-smoke-04-positions-imported.png`. Marketing's `/tables/03a6b017-...` works fine because its column display_names happen to equal the canonical names — confirming the contract mismatch. **Fix surface**: either (a) the row-create chat tool (probably in `src/lib/chat/tools/table-tools.ts`) must normalize incoming `data` to canonical column `name`, or (b) the table renderer (`src/components/tables/data-table.tsx` or wherever `user_table_rows.data` is read into cells) must fall back to display_name lookup. Option (a) is safer; (b) is more forgiving. Either way add a regression test that creates a column with `name: "x"` + `display_name: "X Pretty"`, inserts rows via the chat tool, and asserts the rendered cell shows the value. Same root cause likely behind the 2026-05-04 finance-pack date-overflow finding — display_name `Date` vs canonical `date` hitting the chart axis.

2. **🐛 P1 (compound): On `/apps/portfolio-manager` with auto-inferred `ledger` kit, the kit assumes income/expense semantics it doesn't have for a stock portfolio.** Symptoms cascade: KPI tiles show $0 (Net/Inflow/Outflow); "Trend (MTD)" chart x-axis renders "1970-01-21" (Unix epoch) for the first datum; "Recent transactions" lists 8 untitled rows at $0.00; "By category (MTD)" → "Uncategorized $0.00". Same data in tracker kit (Marketing app) renders perfectly. **Two distinct issues here**: (a) the kit-inference rule for "money-ish columns" is too eager — a `cost_basis` column doesn't make an app a ledger of expense transactions; consider using ratio of "money columns" to "non-money columns" or requiring a date column to confirm ledger semantics. (b) the ledger kit's date renderer treats numeric 0 / null as Unix epoch instead of "no date" — already noted in 2026-05-04 finance-pack archive but reproduces here as `1970-01-21`. `output/2026-05-08-smoke-06-portfolio-app.png`. **Fix surface**: `src/lib/apps/view-kits/inference.ts` (rules) and `src/lib/apps/view-kits/kits/ledger.ts` (date null guard).

3. **🐛 P1: workflow-hub kit doesn't render `view.bindings.kpis` even though they're in the manifest.** After `set_app_view_kpis` writes 3 valid KPIs to `~/.ainative/apps/portfolio-manager/manifest.yaml` under `view.bindings.kpis`, opening `/apps/portfolio-manager` (with `view.kit: workflow-hub`) shows ONLY the blueprint card — no KPI tiles. The chat tool's success message claims "KPI tiles front-and-center" but the kit doesn't read them. Read the manifest at `~/.ainative/apps/portfolio-manager/manifest.yaml` — the `view.bindings.kpis` array is correctly populated with `total-market-value` (tableSum), `total-positions` (tableCount), `largest-position-pct` (tableLatest). Repro: open `/apps/portfolio-manager` with the manifest as-is. `output/2026-05-08-smoke-08-portfolio-workflow-hub.png`. **Suspect mismatch**: the chat tool writes to `view.bindings.kpis` but the kit reads from `view.kpis` (or vice versa). Workflow-hub kit at `src/lib/apps/view-kits/kits/workflow-hub.ts` should be checked against `src/lib/chat/tools/app-view-tools.ts:set_app_view_kpis`. **Also**: workflow-hub has no Run-now button — the only interactive surface is the blueprint card itself, which displays "never run, 0 runs". For an app whose entry point IS triggering a blueprint, that's a dead end.

4. **🐛 P2: Auto-inferred kit for "blueprint + schedule + data table" combinations defaults to workflow-hub, which hides the data table.** Marketing Campaign Tracker's 13 posts were invisible until I asked the agent to switch to `tracker` kit (`output/2026-05-08-smoke-11-marketing-app.png` shows the workflow-hub default; `output/2026-05-08-smoke-12-marketing-tracker-kit.png` shows the tracker kit with all 13 posts and a "Run now" button visible). The inference rule should weight "table has many rows" toward `tracker`/`ledger` rather than `workflow-hub` when there's also data to display. Same kit serving two completely different intents (data review vs. execution monitoring) is the root issue.

5. **🐛 P2: Chat tools `create_blueprint` and `create_schedule` have undocumented input schemas — agent has to fail-and-retry to discover.** Both apps showed identical recovery loops:
   - First attempt at `create_blueprint` fails with a YAML structure mismatch ("steps need `requiresApproval` and `expectedOutput`"); agent reads an existing builtin blueprint to discover the correct shape, then retries.
   - First attempt at `create_schedule` fails on interval format; agent retries with a cron expression.
   Each retry costs 30-60 seconds of streaming + tool calls. Across 2 apps × 4 retries (2 per app) that's ~3-4 minutes wasted per build. **Fix**: bake the required-fields shape and an example into the tool's `description`/JSON schema so the agent gets it right first try. The blueprint tool should document `pattern`, `variables[]`, `steps[].requiresApproval`, `steps[].expectedOutput` explicitly; the schedule tool should specify cron format and reject non-cron strings with a precise error.

---

## Other findings (P3 / observations)

6. **Schedules bind to profiles, not blueprints.** Both apps' `runs:` field in manifest is `profile:<id>--<role>` even when the user's stated intent was clearly to fire the blueprint ("run a portfolio review", "generate the next post"). User mental model: schedule fires the WORK (blueprint). System model: schedule fires the WORKER (profile). Either align by binding to `blueprint:<id>` when one exists and the user mentions blueprint-y intent, or expose this distinction in the chat tool description.

7. **Chat response shows duplicate Portfolio-related project links to user.** The Portfolio Manager materialization card linked to TWO projects: `Portfolio Manager` (existing UUID-id project, pre-existing fixture) AND `Portfolio Analyst` (new slug-id project named after the profile). Confusing. Either suppress the existing-name match when composing OR rename the slug-id project after the APP not the PROFILE.

8. **The slug-based project gets named after the profile, not the app.** Project ID `portfolio-manager` has name "Portfolio Analyst". Wrong cardinality — one app can have many profiles, so naming the project after a profile is a category error. `compose-integration.ts:ensureAppProject(appId, displayName)` is called from somewhere with the profile name as displayName instead of the app name. Fix: in `compose-integration.ts`, prefer the app manifest's `name` field over any profile passed in.

9. **KPI source kinds don't support computed expressions (ratios, percentages).** Agent flagged this proactively when asked for "largest position percentage". Available kinds (per agent-reported list): `tableSum`, `tableCount`, `tableLatest`. Missing: ratio/percentage/min/max/avg. For now the agent uses `tableLatest` as a placeholder and explains the limitation, which is graceful — but a `tableMax` + `tableSum` + `divide` composition or a single `tableExpression` source would unlock real concentration metrics.

10. **Agent inserted 13 rows from a 12-row CSV (1 duplicate).** Marketing CSV had 12 distinct posts; DB has 13 rows. Agent noticed the duplicate and surfaced it in the chat ("Heads up: rows 9 and 13 appear to be duplicates"), which is great — but the duplicate wouldn't have happened if the row-creation tool had idempotency on a (table_id, normalized_data_hash) constraint OR if the agent was using a single batch-insert call instead of per-row.

11. **Long app names truncate in the app detail header.** "Marketing Campaign Tracker" became "Marketing Campaign Tra..." in the H1 of `/apps/marketing-campaign-tracker`. `output/2026-05-08-smoke-11-marketing-app.png`. Tailwind `truncate` class likely. Worth giving the title at least 2 lines or a wider container for app names up to ~40 chars.

12. **Bright red "Delete app" button at the top right of every app detail page.** First-class destructive action with no confirmation modal-equivalent visible (need to click to verify). For an entry point users will visit dozens of times daily, the Delete button having equal visual weight to "Run now" is a footgun. Move to a kebab-menu or require a confirm step.

13. **🐛 P1 (regression vs 2026-05-04): Row trigger fires but no task is created.** Bonus verification post-Phase 12. POSTed `{"data":{"title":"Smoke test trigger...","channel":"LinkedIn","status":"draft","publish_date":"2026-05-22","engagement_count":0,"notes":""}}` to `/api/tables/03a6b017-6587-4e94-99ad-096252f92ad4/rows`. API returned 201 with the new row id `7f704e0e-2a78-4060-8f5e-2536d17e618a`. Trigger `299f6bc1-...` shows `fire_count: 1`, `last_fired_at: 1778270020` (~13s after the POST) — so `manifest-trigger-dispatch.ts` ran. **But `tasks` table has no row with `context_row_id='7f704e0e-...'`. No agent_logs for `marketing-campaign-tracker` project. No errors in dev log.** This is *worse* than the 2026-05-04 finding (where populated rows created tasks that then failed at the runtime layer) — now the dispatch path **silently drops the work entirely**. Both blueprint variables (`focus_channel`, `content_tone`) are `required: false`, so variable validation is not the cause. Likely surface: `src/lib/apps/manifest-trigger-dispatch.ts` resolves the trigger's `action_config` (action_type=`run_workflow`, blueprintId, prompt) but its hand-off into `task-dispatch.ts` either (a) finds no matching dispatch path for `action_type: run_workflow`, (b) looks up the blueprint by id and silently fails when the blueprint is at `~/.ainative/blueprints/...yaml` (custom location, not builtin), or (c) the task-creation call throws but the catch in the trigger fire path swallows it. Add error visibility — every silent return in `manifest-trigger-dispatch.ts` should at minimum increment a counter or log to `agent_logs`. **Repro**: re-POST the same row body to the same URL; check for a NEW task in `tasks` with `context_row_id` matching the new row id; if 0 rows, you're seeing the same bug.

---

## Reproductions of 2026-05-04 archived findings

| Old finding | Reproduced now? |
|---|---|
| 🐛 workflow-hub crash via server/client mismatch (`workflow-hub.ts:51,63`) | ✅ **FIXED** — workflow-hub kit now uses `createElement(LastRunCard, ...)` correctly (verified at `src/lib/apps/view-kits/kits/workflow-hub.ts:52,64`). Switched portfolio-manager to workflow-hub via chat → page rendered with no error. |
| ⚠️ Habit Tracker missing from /apps starters row | ✅ **FIXED** — `output/2026-05-08-smoke-02-apps-index.png` shows Habit tracker present (5-template starter row: Customer follow-up drafter, Finance pack, Habit tracker, Research digest, Weekly portfolio check-in) |
| ⚠️ finance-pack transaction-date overflow `+058303-09` | NOT REPRO directly (different app) but same root cause class re-emerged as portfolio-manager's "1970-01-21" Trend axis (P1 #2 above). Indicates the date null/0 → epoch path in the ledger kit is still load-bearing. |
| ⚠️ Reading Log routes to research kit but books table invisible (kit mismatch) | RELATED-REPRO — workflow-hub auto-inference for marketing-campaign-tracker is the same class of bug (kit picks rule3-ish wrong-fit, hides data). Different apps, same family. |
| 🐛 `anthropic-direct + claude-haiku-4-5` swallows trigger task errors | **WORSE-CASE REGRESSION** — Tested as bonus after Phase 12. POSTed a populated draft row to `/api/tables/03a6b017-.../rows` (row id `7f704e0e-...`). Trigger fired (`fire_count: 1`, `last_fired_at: 1778270020`) but **NO task was created at all** — query `SELECT * FROM tasks WHERE context_row_id='7f704e0e-...'` returns 0 rows. Latest task in DB predates this session by 3 days. No agent_logs for the marketing project. No runtime errors in dev log. Now F13 below. |

---

## Verification matrix

| Phase | Apps touched | Status | Evidence |
|---|---|---|---|
| 0 — Pre-flight | — | ✅ | dev server PID 13499, 6 demo-* apps untouched |
| 1 — Baseline | / + /apps | ✅ | `output/2026-05-08-smoke-01-home.png`, `-02-apps-index.png` |
| 2 — Build Portfolio Manager | portfolio-manager | ✅ | App composed; profile, blueprint, table, schedule all on disk |
| 3 — CSV import (8 positions) | portfolio-manager | ⚠️ | Rows in DB but **invisible in /tables UI** — F1 (P0) |
| 4 — Live stock prices via WebFetch | portfolio-manager | ✅ | Yahoo `query1.finance.yahoo.com/v8/finance/chart/` API worked; total $94,924.39 written to all 8 rows |
| 5 — Use Portfolio Manager | portfolio-manager | 🐛 | Ledger kit shows $0 across the board — F2 (P1) |
| 6 — Modify (workflow-hub + 3 KPIs) | portfolio-manager | ⚠️ | Kit switched, manifest correct, **KPIs don't render** — F3 (P1); workflow-hub crash regression FIXED |
| 7 — Build Marketing Campaign Tracker | marketing-campaign-tracker | ✅ | All 4 primitives composed; `Posts` table has select columns for Channel/Status |
| 8 — CSV import (12 → 13 posts) | marketing-campaign-tracker | ✅ | All rows render correctly in /tables (canonical names match) — F10 (P3) for duplicate |
| 9 — Use Marketing Tracker | marketing-campaign-tracker | 🐛 | Auto-inferred to workflow-hub — posts invisible — F4 (P2) |
| 10 — Modify (tracker kit + row trigger) | marketing-campaign-tracker | ✅ | Kit switched to `tracker` (KPI auto-default "Total entries: 13"). Trigger row in DB at `user_table_triggers:299f6bc1-...` (action `run_workflow` → `marketing-campaign-tracker--content-pipeline`). Trigger NOT yet fired — left for next session. |
| 11 — Findings consolidation | — | ✅ | This document + 12 numbered findings |
| 12 — HANDOFF.md | — | ✅ | Old handoff archived; this document |

---

## State left behind for next session

### Apps on disk (8 total, 2 new)
| Slug | Source | view.kit | Notes |
|---|---|---|---|
| portfolio-manager | this-session chat-composed | workflow-hub (declared) | Manifest has 3 KPIs that don't render; cells in Positions table invisible (P0). |
| marketing-campaign-tracker | this-session chat-composed | tracker (declared) | All 13 rows render. Trigger active, never fired. 1 dup row to clean up. |
| demo-* (6 apps) | seeded | unset | untouched |

### DB rows added
- `projects`: +1 (`portfolio-manager` named "Portfolio Analyst" — F8)
- `user_tables`: +2 (`8f744af3-...` Positions, `03a6b017-...` Posts)
- `user_table_columns`: +12 (6 per app)
- `user_table_rows`: +21 (8 positions + 13 posts)
- `schedules`: +2 (`8a416ec8-...` Daily Portfolio Review, `6ebcdeaf-...` Weekly Content Pipeline)
- `user_table_triggers`: +1 (`299f6bc1-...` Draft Post → Generate Hook & CTA)
- Profiles: +2 (`portfolio-manager--analyst`, `marketing-campaign-tracker--strategist`) at `~/.ainative/profiles/`
- Blueprints: +2 (`portfolio-manager--review.yaml`, `marketing-campaign-tracker--content-pipeline.yaml`) at `~/.ainative/blueprints/`

### Conversations created this session
Single conversation accumulated all 5 prompts (build PM → CSV → prices → modify PM → build MCT → CSV → modify MCT). Conversation list in chat sidebar — title likely starts "Build me a Portfolio Manager app...".

### CSV files at `/tmp/`
- `/tmp/portfolio-positions.csv` (8 rows)
- `/tmp/marketing-posts.csv` (12 rows)

### Screenshots
All under `output/2026-05-08-smoke-NN-*.png`:
- `01-home.png` baseline
- `02-apps-index.png` baseline
- `03a-chat-empty.png` chat surface check
- `03b-prompt-typed.png` React-aware dispatch verified
- `03-portfolio-composed.png` materialization card
- `04-positions-imported.png` **P0 evidence** — 8 rows, all cells dashed
- `05-positions-table-blank-cells.png` second view of P0
- `05-prices-updated-chat.png` Yahoo Finance price-update conversation
- `06-portfolio-app.png` ledger-kit-with-stock-data **P1 evidence** ($0/Net/1970-01-21)
- `07-portfolio-manifest-sheet.png` manifest sheet UX
- `08-portfolio-workflow-hub.png` workflow-hub renders cleanly (regression-fix verified) but no KPIs (P1)
- `10-marketing-posts-imported.png` posts table rendering correctly (contrast with #04)
- `11-marketing-app.png` workflow-hub-default-hides-data (P2)
- `12-marketing-tracker-kit.png` tracker-kit-with-data (correct end state)

### Cleanup the next session might want
- 1 duplicate row in Posts table (rows #9 and #13 both "What I learned shipping daily" / LinkedIn / draft / May 20). DELETE one via `/api/tables/03a6b017-.../rows/<id>`.
- Test the trigger by POSTing a draft row to `/api/tables/03a6b017-6587-4e94-99ad-096252f92ad4/rows` with `{"data": {"title": "Test trigger fire", "channel": "LinkedIn", "status": "draft", "publish_date": "2026-05-22", "engagement_count": 0, "notes": ""}}` — confirms the carry-forward 2026-05-04 anthropic-direct error-swallow finding.

---

## Recommended next moves, priority order

1. **Fix F1 first (P0 cell rendering).** This is the most user-visible failure — a real user composes an app, imports their data, and sees nothing. Two clean fix surfaces: `src/lib/chat/tools/table-tools.ts` (normalize on write) or wherever `data-table.tsx` reads `user_table_rows.data` (fallback on read). Add a regression test.
2. **Fix F3 (P1 workflow-hub KPI rendering).** Quick win — likely a path mismatch between `view.bindings.kpis` (write) and `view.kpis` (read) or vice versa. Grep `src/lib/apps/view-kits/kits/workflow-hub.ts` for the kpi-read path.
3. **Tighten kit-inference rules (F2, F4).** The rule cluster around money/blueprint/schedule keeps picking the wrong kit. Consider a "data density" tie-breaker: if `userTableRows.count > 5`, prefer a kit that renders the table.
4. **Document the create_blueprint / create_schedule tool schemas (F5).** Saves ~30s per app build × every smoke and every real user. Pure docs/JSON-schema win.
5. **Investigate F13 (regressed row-trigger dispatch).** Verified worse than 2026-05-04: trigger fires, fire_count increments, but no task is ever created. Start at `src/lib/apps/manifest-trigger-dispatch.ts` and trace the `action_type: "run_workflow"` branch end-to-end. Add observability to the silent-return paths (an `agent_logs` write or a structured console.error) before fixing — the fact that this didn't surface earlier suggests there's a `catch` somewhere swallowing the dispatch failure.
