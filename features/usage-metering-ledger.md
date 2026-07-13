---
title: Usage Metering Ledger
status: completed
priority: P1
milestone: post-mvp
source: features/provider-runtime-abstraction.md, features/openai-codex-app-server.md, user request 2026-03-12
dependencies: [provider-runtime-abstraction, openai-codex-app-server, monitoring-dashboard]
---

# Usage Metering Ledger

## Description

ainative now runs governed activity across Claude and Codex, but usage accounting is still incidental. Some token usage appears inside provider-specific `agent_logs` payloads, some actions have no durable usage record at all, and there is no stable data model for answering basic operator questions such as "what did we spend today?", "which provider consumed the most tokens?", or "which workflow step caused the spike?".

This feature introduces a first-class usage ledger for all provider-calling activity. The ledger becomes the source of truth for cost and token accounting across task execution, task resume, workflow child tasks, scheduled firings, task-definition assist, and profile tests. It stores raw usage plus derived pricing so ainative can build trustworthy dashboards, budget guardrails, and audit trails without scraping provider-shaped log blobs.

## User Story

As a ainative operator, I want every Claude- or Codex-backed activity to produce a normalized usage record so that I can audit spend, compare provider usage, and build budget enforcement on top of durable data.

## Technical Approach

- Add a dedicated table under `src/lib/db/schema.ts` for normalized usage records, for example `usage_ledger`, with fields for:
  - stable row ID
  - activity type (`task_run`, `task_resume`, `workflow_step`, `scheduled_firing`, `task_assist`, `profile_test`)
  - linked `taskId`, `workflowId`, `scheduleId`, and optional project linkage where available
  - runtime ID, provider ID, model ID
  - status (`completed`, `failed`, `cancelled`, `blocked`, `unknown_pricing`)
  - prompt/input tokens, completion/output tokens, total tokens
  - derived cost stored as integer micros or another non-floating fixed unit
  - pricing metadata snapshot or version marker so future pricing changes do not mutate historical records
  - started/finished timestamps
- Introduce a shared usage writer in the provider runtime layer under `src/lib/agents/runtime/` so Claude and Codex adapters emit the same normalized record shape instead of persisting provider-specific accounting ad hoc.
- Capture raw usage as close to runtime completion as possible:
  - task runs and resumes write one ledger row per execution attempt
  - workflow child tasks and scheduled firings write task-linked rows plus parent workflow/schedule linkage
  - task assist and profile tests write standalone rows without requiring a task record
  - runtime connectivity tests do not create ledger rows
- Add a pricing registry keyed by runtime/provider/model so cost derivation is explicit and testable. If usage exists but pricing is unknown, still persist the row with token counts and a null/flagged cost instead of dropping the record.
- Add server-side query helpers for:
  - daily spend totals
  - daily token totals
  - provider/model breakdowns
  - paginated audit-log listings with joins back to task/workflow/project context
- Add durable workflow and schedule linkage on task rows so workflow child tasks and schedule firings can be metered without relying on task-title conventions
- Update seed data so development and browser verification can exercise spend charts and audit tables with believable multi-provider usage.

## Acceptance Criteria

- [x] A dedicated usage ledger table exists with normalized activity metadata, provider/model identity, token counts, fixed-unit cost fields, status, and timestamps
- [x] Claude-backed task executions and resumes write normalized ledger rows without relying on downstream log parsing
- [x] Codex-backed task executions and resumes write the same ledger row shape as Claude-backed runs
- [x] Workflow child tasks and scheduled firings preserve workflow/schedule linkage in ledger records
- [x] Task assist and profile-test activity are recorded in the ledger even when no task row exists
- [x] Unknown model pricing does not drop usage data; the row is persisted with visible unknown-cost state
- [x] Query helpers exist for daily spend/token trends, provider breakdowns, and audit-log listings
- [x] Seed data includes representative Claude and Codex usage rows with token and cost variance

## Implementation Notes

- Added `usage_ledger` plus task-level `workflow_id` and `schedule_id` linkage to the SQLite/Drizzle schema, bootstrap DDL, and migration SQL
- Added pricing-registry and usage-query helpers under `src/lib/usage/`
- Wired ledger writes into Claude task execution/resume, Codex task execution/resume, both task-assist flows, and Claude profile tests
- Updated workflow child-task creation and scheduler child-task creation to persist parent linkage for downstream metering
- Seed data now includes representative Claude and Codex usage rows for governance and analytics development
- **SDK audit (2026-03-15)**: Pricing registry expanded from 2 to 6 model families — 3 Anthropic (Sonnet 4, Opus 4, Haiku 4) + 3 OpenAI (Codex Mini, GPT-4o, GPT-5) with conservative fallback for unknown models (F5). Added `getProviderModelBreakdown()` to extract per-model usage from SDK `modelUsage` field (F6). See [sdk-runtime-hardening](sdk-runtime-hardening.md)
- **G-040 hardening (2026-07-12):** Claude task receipts now use the terminal SDK result's cumulative `modelUsage` plus provider-reported `total_cost_usd`, preserving the per-model breakdown as receipt evidence. Ledger rows carry explicit complete/partial/unavailable scope and runtime source; partial accounting is visible in task detail, run history, budget settings, the cost dashboard, and its audit log.

## Verification

- Verified with full Vitest suite (`169` passing tests) on March 12, 2026
- Verified with a successful production build on March 12, 2026
- G-040 verified with 67 focused tests, TypeScript, a production build, and a real delegated task whose Opus parent plus Haiku subagent reconciled to 25,773 tokens and $1.199163 across the task row, ledger, APIs, and browser UI on July 12, 2026

## Scope Boundaries

**Included:**
- Normalized usage ledger schema and migrations
- Provider-runtime usage writer and pricing registry
- Metering for task runs, resumes, workflow child tasks, scheduled firings, task assist, and profile tests
- Query helpers and seed-data support for later UI features

**Excluded:**
- User-facing budget configuration
- Blocking execution when budgets are exceeded
- A dashboard route or sidebar navigation
- Export, invoicing, or external billing reconciliation
- ROI or time-saved estimation

## References

- Related features: [provider-runtime-abstraction](provider-runtime-abstraction.md), [openai-codex-app-server](openai-codex-app-server.md), [monitoring-dashboard](monitoring-dashboard.md), [scheduled-prompt-loops](scheduled-prompt-loops.md)
- Follow-on features: [spend-budget-guardrails](spend-budget-guardrails.md), [cost-and-usage-dashboard](cost-and-usage-dashboard.md)
