---
id: TDR-019
title: Heartbeat engine with intelligence-driven execution
date: 2026-04-02
status: accepted
category: workflow
---

# TDR-019: Heartbeat engine with intelligence-driven execution

## Context

Clock-driven schedules (cron) fire unconditionally at set intervals, generating noise when there's nothing meaningful to do. The project needed a proactive execution mode where the agent evaluates whether action is warranted before consuming resources.

## Decision

The `schedules` table supports two execution modes via `type` column: `scheduled` (clock-driven, existing behavior) and `heartbeat` (intelligence-driven). Heartbeat schedules carry:

- **Checklist** (`heartbeatChecklist` JSON): prioritized items the agent evaluates each cycle.
- **Active hours** (`activeHoursStart/End` + `activeTimezone`): business-hour windowing via `active-hours.ts` — heartbeats only fire during configured hours.
- **Budget caps** (`heartbeatBudgetPerDay` in microdollars, `heartbeatSpentToday`, `heartbeatBudgetResetAt`): daily cost governance with automatic reset.
- **Suppression tracking** (`suppressionCount`, `lastActionAt`): consecutive no-action runs are tracked; high suppression signals the heartbeat frequency may be too aggressive.

The scheduler still polls (consistent with TDR-003), but the execution decision is delegated to the agent via a heartbeat evaluation prompt (`heartbeat-prompt.ts`). The agent decides whether to act or suppress.

Tasks created by heartbeats carry `sourceType: "heartbeat"` for tracking and cost attribution.

HEARTBEAT.md is a markdown-based format (`heartbeat-parser.ts`) for defining checklists in structured prose — H2 headings as schedule expressions, list items as checklist items.

## Consequences

- Heartbeat mode reduces noise: agents only act when checklist items need attention.
- Budget caps prevent runaway costs from misconfigured heartbeat frequencies.
- Active hours respect business-hour boundaries without complex timezone cron expressions.
- Suppression tracking provides a natural feedback signal for tuning heartbeat frequency.
- The scheduler code path branches on `type` — both modes share the same polling loop but differ in execution logic.

## Alternatives Considered

- **Event-driven triggers (webhooks/watchers)** — requires external infrastructure; heartbeat polling is self-contained.
- **LLM-based scheduling decisions** — evaluated and rejected; deterministic windowing + budget caps are more predictable.
- **Separate heartbeat service** — over-engineered; extending the existing scheduler keeps deployment simple.

## References

- `src/lib/schedules/scheduler.ts` — unified scheduler with heartbeat branch
- `src/lib/schedules/active-hours.ts` — business-hour windowing
- `src/lib/schedules/heartbeat-prompt.ts` — evaluation prompt generation
- `src/lib/schedules/heartbeat-parser.ts` — HEARTBEAT.md format parser
- `src/lib/db/schema.ts` — `schedules` table heartbeat columns
