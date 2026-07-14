---
title: Schedule maxTurns API Control
status: completed
priority: P2
milestone: post-mvp
source: internal history record
dependencies: [scheduled-prompt-loops]
---

# Schedule maxTurns API Control

## Description

Expose the existing `schedules.maxTurns` column on the `create_schedule` and `update_schedule` MCP tools so operators can tune per-schedule turn budgets through the chat interface instead of editing the database by hand. The column, the scheduler plumbing, and the handoff from schedule to task firing all already exist — only the Zod input schemas on the chat tools are missing.

This matters because different schedules have very different complexity profiles. A simple portfolio snapshot might need 10–15 turns; a news sentinel with web searches, table writes, and divergence checks might need 40–60. Without per-schedule control, the system default is either too low for complex prompts (causing premature capping) or too high for simple ones (wasting budget on runaway loops). Operators currently have no way to tune this without direct database access.

## User Story

As an operator running schedules of varying complexity, I want to set a per-schedule turn cap via chat tools so I can tune budgets without touching the DB — and so that simple schedules don't waste turns while complex ones aren't prematurely capped by the global default.

## Technical Approach

- **Add `maxTurns` to `create_schedule`.** In `src/lib/chat/tools/schedule-tools.ts:46-72`, add `maxTurns: z.number().int().min(10).max(500).optional()` to the `create_schedule` input Zod schema. Thread the value into the service-layer call that inserts the schedule row.
- **Add `maxTurns` to `update_schedule`.** Same file, lines 202-219. Also support explicit `null` so operators can clear an override back to "inherit global default."
- **No other wiring required.** The column already exists in `src/lib/db/schema.ts:237-239` as `maxTurns: integer("max_turns")` with a comment "Hard cap on turns per firing; NULL inherits global MAX_TURNS". The scheduler at `src/lib/schedules/scheduler.ts:535` already copies `schedule.maxTurns` to the task at firing time, and records `maxTurnsAtFiring` in firing metrics at line 284.
- **Verify `get_schedule` response already echoes the field.** The handoff claims `get_schedule` shows `maxTurns: null` today, so the read path is already wired — confirm by reading the current response serialization and, if missing, add it.
- **Null/unset falls back to system default.** Existing schedules see no behavioral change.

## Acceptance Criteria

- [ ] `create_schedule` accepts an optional `maxTurns` integer (10–500) and persists it to the schedule row.
- [ ] `update_schedule` accepts the same field and updates it, including explicit `null` to clear an override back to inherit-default.
- [ ] `get_schedule` reflects the user-set value in its response.
- [ ] Scheduler continues to thread `maxTurns` from the schedule to the fired task (regression test — existing behavior, don't break it).
- [ ] Null/unset `maxTurns` falls back to system default with no behavioral change for existing schedules.
- [ ] Out-of-range values (below 10, above 500) are rejected with a descriptive Zod error.
- [ ] Unit test in `src/lib/chat/tools/__tests__/schedule-tools.test.ts` covers create-with-value, update-to-new-value, and clear-to-null.

## Scope Boundaries

**Included:**
- MCP tool schema changes for `create_schedule` and `update_schedule`
- Persistence wiring (if the service layer doesn't already accept the field)
- `get_schedule` response echo (verify + fix if missing)
- Test coverage for all three mutation modes

**Excluded:**
- Per-schedule default overrides driven by a global admin setting
- Surfacing `maxTurns` in any new UI surface (chat-tool access only for now — the existing `src/app/schedules/` UI can be updated in a separate feature if needed)
- Changing the system default
- Migrating historical schedules that currently have `maxTurns: null`

## References

- Source: `internal history record`
- `src/lib/db/schema.ts:237-239` — existing `maxTurns` column with doc comment
- `src/lib/chat/tools/schedule-tools.ts:46-72` — target `create_schedule` Zod schema
- `src/lib/chat/tools/schedule-tools.ts:202-219` — target `update_schedule` Zod schema
- `src/lib/schedules/scheduler.ts:284` — existing `maxTurnsAtFiring` firing-metrics capture
- `src/lib/schedules/scheduler.ts:535` — existing schedule → task `maxTurns` handoff
- Related features: `scheduled-prompt-loops.md`, `heartbeat-scheduler.md`
