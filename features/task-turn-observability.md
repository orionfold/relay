---
title: Task Turn Count Observability
status: completed
shipped-date: 2026-05-03
priority: P2
milestone: post-mvp
source: internal history record
dependencies: [agent-integration, scheduled-prompt-loops]
---

# Task Turn Count Observability

## Description

Surface per-task turn and token metrics on `get_task` and `list_tasks`, and commit to a written definition of what the existing turn-count metric actually measures. Today, turn counts are aggregated on the `schedules` table (`lastTurnCount`, `avgTurnsPerFiring`) but individual `tasks` rows have no persisted metrics — the scheduler computes them on demand via `COUNT(*) FROM agentLogs WHERE taskId = ?`. That works for schedule aggregates but leaves one-off test tasks and manual task runs with no visible metric at all.

The second half of the problem is interpretive, not technical. Observed turn counts in production range from 700 to 2,900+:

| Schedule | Avg Turns | Last Turns |
|---|---|---|
| Prediction Markets Monitor | 2,530 | 20 |
| Price Monitor | 2,462 | 2,926 |
| Daily Briefing | 1,759 | 2,012 |
| News Sentinel | 1,686 | 2,227 |

These numbers are far higher than any plausible "reasoning round" count — an agent making 2,900 tool-call rounds would be prohibitively slow and expensive. The metric is almost certainly counting something else (assistant messages in the stream, agentLogs rows of all types, or a composite). Without written definition, both users and AI assistants misread the numbers and reach wrong diagnoses (e.g., "the agent is hitting a 48-turn limit" when it's actually completing successfully with 2,227 of whatever unit).

## User Story

As an operator tuning a schedule's prompt, I want to fire a one-off test task and immediately see how many turns and tokens it consumed, with a clear and written understanding of what those numbers represent — so I can validate my prompt optimization and compare apples-to-apples against the schedule's historical average.

## Technical Approach

### 1. Establish the metric definition first

Before adding any columns, a short investigation subtask: trace `turnCount++` at `src/lib/agents/claude-agent.ts:225` and the scheduler's `COUNT(*) FROM agentLogs` at `src/lib/schedules/scheduler.ts:191-195`. Determine exactly what is being counted. Write one precise paragraph into the References section of this spec defining the metric (e.g., "Number of stream frames where the agent produced an assistant message"). If the definition reveals the current name is misleading, rename or split the field — do not persist a misnamed metric.

### 2. Data model

- Add `turnCount: integer("turn_count")` and `tokenCount: integer("token_count")` to the `tasks` table in `src/lib/db/schema.ts` (near line 57 where `maxTurns` lives). Both nullable — `null` means "not yet populated or pre-existing row."
- Add matching idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` updates in `src/lib/db/bootstrap.ts`. Per `MEMORY.md` → "DB bootstrap": schema.ts and bootstrap.ts must stay in sync or deployed DBs get "no such table/column" errors.
- No migration file is strictly required for this to work locally, but if the project's migration convention applies, add one under `src/lib/db/migrations/`.

### 3. Capture at task completion

- In `src/lib/agents/claude-agent.ts` near the result-frame handler (~lines 225, 300-309), persist the final `turnCount` and the token total onto the task row at completion. The token total is available in the SDK result frame's usage metadata.
- The scheduler-side aggregation at `src/lib/schedules/scheduler.ts:191-236` should continue to work unchanged, but ideally it now reads from `tasks.turnCount` directly for completed tasks instead of recomputing via `COUNT(*)`. Keep the `COUNT(*)` path as a fallback for rows with `turnCount IS NULL` (pre-existing rows).

### 4. Surface on MCP tool responses

- Extend `get_task` and `list_tasks` output in `src/lib/chat/tools/task-tools.ts:215-236` to include `turnCount` and `tokenCount` for completed tasks. Add a short field comment that references the written definition from step 1.

### 5. Consistency with schedule aggregates

- Ensure `lastTurnCount` and `avgTurnsPerFiring` on schedules are computed from the same field that tasks now expose, so chat responses describing a schedule and chat responses describing one of its fired tasks don't contradict each other.

## Acceptance Criteria

- [x] The metric definition is written into this spec's References section (and mirrored to `MEMORY.md`'s "Architecture Notes" section) before any columns are added — see "Metric Definition" below; mirror at `MEMORY.md` (under "Architecture Notes", `tasks.turnCount counts streamed assistant frames, NOT SDK reasoning rounds`).
- [x] `tasks` table has `turnCount` and `tokenCount` columns, reflected in both `src/lib/db/schema.ts:66-79` and `src/lib/db/bootstrap.ts:84-85` (CREATE block) and `:614-615` (ALTER for existing DBs).
- [x] `get_task` and `list_tasks` responses include both fields for completed tasks — both tools select via `db.select().from(tasks)` (`src/lib/chat/tools/task-tools.ts:67-72` and similar in `get_task`), so the new schema columns flow through to the response automatically with no field-mapping change.
- [x] One-off manual tasks (not schedule-fired) also capture and expose these metrics — the persistence happens at `src/lib/agents/claude-agent.ts:382-389` in the result-frame handler, which fires for every successful task regardless of source (manual/scheduled/heartbeat/workflow).
- [x] Schedule aggregates `lastTurnCount` / `avgTurnsPerFiring` are consistent with the individual task `turnCount` for the same firing — `src/lib/schedules/scheduler.ts:175-208` now reads `tasks.turnCount` first and only falls back to the legacy `COUNT(*) FROM agentLogs` when the persisted value is null (pre-existing rows). New firings produce identical numbers across `get_task` and the schedule aggregate.
- [x] `src/lib/data/clear.ts` safety-net test still passes — no FK-dependent tables introduced, just new columns; clear.test.ts green (verified 2026-05-03).
- [x] Existing `claude-agent` and `scheduler` tests still pass — 41/41 claude-agent tests + 131/131 schedule tests pass after the change.
- [x] A new test asserts that a completed task has `turnCount > 0` and `tokenCount > 0` — `src/lib/agents/__tests__/claude-agent.test.ts` "A2b: persists turnCount and tokenCount on the completion update" pins both fields against a mock stream with two assistant frames (turnCount=2) and a result frame carrying `total_tokens: 300` (tokenCount=300).

## Verification

Run on 2026-05-03:

- `npx vitest run src/lib/agents/__tests__/claude-agent.test.ts src/lib/data/__tests__/clear.test.ts` — 41/41 pass.
- `npx vitest run src/lib/schedules` — 131/131 pass across 13 files.
- `npx tsc --noEmit` — clean for `schema.ts`, `bootstrap.ts`, `claude-agent.ts`, `scheduler.ts`.

## Design Decisions

### Stream-frame counter (not reasoning-round counter)

The persisted `turnCount` deliberately matches what the existing in-memory counter at `claude-agent.ts:295` already produces — number of `assistant`-role frames emitted by the runtime stream, not number of model invocations. Two reasons: (1) the metric was already being surfaced as `lastTurnCount`/`avgTurnsPerFiring` on schedules using a different (and inflated) counting basis (`COUNT(*) FROM agentLogs`), so the in-memory counter is the closest existing definition that still has signal; (2) renaming to "reasoning rounds" or similar would have required either parsing the SDK's own turn-budget metadata at completion (which would diverge across runtimes) or post-hoc reconstructing the count from logs. The Metric Definition section above documents the choice explicitly so operators don't misread the numbers as a `maxTurns`-comparable budget unit.

### Schema column duplication of usage_ledger.totalTokens

`tokenCount` on `tasks` is denormalized — the same value lands in `usage_ledger.totalTokens` for billing. The duplication is intentional: `get_task` and `list_tasks` are the primary chat-tool reads, and they should never have to JOIN against the usage ledger to surface a token count. The denormalized field is a one-time write at completion (`claude-agent.ts:382-389`) and never updated thereafter — the ledger remains authoritative for billing reconciliation; the task field is authoritative for chat surfaces.

### Scheduler falls back to COUNT(*) only for null rows

The scheduler at `scheduler.ts:198-206` reads `tasks.turnCount` first; only falls back to `COUNT(*) FROM agentLogs` when null (pre-existing tasks). This means new firings produce schedule aggregates that are *strictly consistent* with the per-task field, while historical data continues to surface its existing (inflated) numbers without a migration. Operators who care about apples-to-apples comparison can wait one cron cycle and the schedule aggregate will reflect the new metric.

## Scope Boundaries

**Included:**
- Schema columns on `tasks` (`turnCount`, `tokenCount`) in schema.ts + bootstrap.ts
- Capture at task completion in `claude-agent.ts`
- MCP tool response field additions on `get_task` / `list_tasks`
- Written metric definition in spec References + AGENTS.md / MEMORY.md
- Consistency check between schedule aggregates and task metrics

**Excluded:**
- A full cost-and-usage dashboard (already covered by `cost-and-usage-dashboard.md`)
- Historical backfill of pre-existing tasks (new rows only — historical rows keep `turnCount: null` and fall back to the scheduler's `COUNT(*)` path)
- Per-turn timing breakdowns
- Cross-runtime metric normalization (this spec is scoped to the `claude-code` runtime — other runtimes can be extended in a follow-up if needed)

## References

- Source: `internal history record`
- `src/lib/db/schema.ts:57` — existing `maxTurns` column on `tasks` (new columns land nearby)
- `src/lib/agents/claude-agent.ts:225` — existing `turnCount++` counter in stream processing
- `src/lib/agents/claude-agent.ts:300-309` — result-frame handler (target for persist-on-completion)
- `src/lib/schedules/scheduler.ts:191-195` — existing `COUNT(*) FROM agentLogs` aggregation path
- `src/lib/schedules/scheduler.ts:235-236` — existing write of `lastTurnCount` / `avgTurnsPerFiring` to schedule row
- `src/lib/chat/tools/task-tools.ts:215-236` — existing `get_task` / `list_tasks` response shape
- Related features: `cost-and-usage-dashboard.md`, `workflow-intelligence-observability.md`, `scheduled-prompt-loops.md`

## Metric Definition

**`turnCount`** is the number of `assistant`-role messages emitted in the runtime
stream during a task run, where the assistant message carries content blocks
(text, thinking, or `tool_use`). The counter increments at
`src/lib/agents/claude-agent.ts:295` on every `message.type === "assistant" && message.message?.content`
frame. Each model "reasoning round" can emit multiple such frames — for example,
a single round that produces a thinking block plus a tool_use block plus a final
text block emits three assistant messages and increments `turnCount` by three.
This is why observed values run from hundreds to low thousands for autonomous
loop schedules: a single tool-using round may contribute 3–5+ to the count.

**This is not the SDK's `maxTurns`-budgeted "reasoning round" metric** — the SDK
counts model invocations, while `turnCount` here counts streamed assistant
frames. The two values can diverge by an order of magnitude. Operators reading
the dashboard should treat `turnCount` as a *stream-frame work-volume signal*
useful for relative comparison (this run did 2× the frames as the previous one)
rather than as a budget unit comparable to `maxTurns`.

**`tokenCount`** is the total token count (input + output, including cache hits)
accumulated across the runtime stream by `applyUsageSnapshot` in the usage
ledger. At task completion the value is the same one written to the
`usage_ledger` row for billing, denormalized onto the `tasks` row for cheap
single-task lookups via `get_task` / `list_tasks`. Null until the result frame
arrives or for runtimes other than `claude-code`.
