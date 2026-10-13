---
title: On-Demand Run Concurrency Cap
status: completed
shipped-date: 2026-10-12
priority: P1
milestone: post-mvp
source: uncapped manual, chat, handoff and workflow-step starts
dependencies: [schedule-collision-prevention, agent-integration, workflow-engine]
---

# On-Demand Run Concurrency Cap

## Description

`schedule-collision-prevention` capped schedule firings at
`SCHEDULE_MAX_CONCURRENT` and made the claim atomic. The cap matches only
`source_type IN ('scheduled', 'heartbeat')`, so it governed the unattended half
of task execution and left the attended half open.

Everything else — the manual execute route, resume, the chat `execute_task`
tool, the handoff bus, and every workflow step — reached `startTaskExecution`
and was marked `running` unconditionally. A workflow that fans out to parallel
branches, or an operator clicking Run on a dozen tasks, started as many agent
processes as there was work for. On a small host that exhausts memory and every
run in flight fails together.

This feature gives those runs a cap of their own.

## Behaviour

**A second, independent cap.** `TASK_MAX_CONCURRENT`, then the
`task.maxConcurrent` setting, then **20**. It governs every task run whose
`source_type` is not `scheduled` or `heartbeat`, `NULL` included. The two counts
are exact complements, so a full schedule cap cannot block an on-demand run and
a full on-demand cap cannot block a firing.

**The claim is atomic.** One `UPDATE` with the count as a subquery in its
`WHERE` clause, the same shape as `SLOT_CLAIM_SQL`. Two concurrent start paths
cannot both take the last slot.

**Over the cap, nothing fails.** The row stays `queued` and the run takes a
place in a FIFO line, in submission order. It starts when a slot frees — drained
when a run settles, and by a timer that exists only while something is waiting.
A caller that awaits the run, including a workflow step, waits longer rather
than erroring.

**The line is in the table, and survives a restart.** A deferred run is
`status = 'queued' AND run_requested_at IS NOT NULL`; `queued` with no marker is
a task sitting at rest, which nothing may start. The marker is written by the
statement that parks the row, cleared by the statement that claims it, and
cleared by a cancel or by a status written through `PATCH /api/tasks/:id`.
`run_requested_mode` records `start` or `resume` beside it. The drain orders by
`run_requested_at`, at millisecond resolution, so submission order is what
decides who goes next — not the order dispatchers happened to arrive in. An
in-memory map holds the promise each waiting dispatcher is parked on, which is
the one thing a table cannot record.

**Every deferred run is accounted for at boot.** `recoverDeferredTaskRuns()`
runs after the orphan sweep and after the plugin loader. Workflow steps are
failed with `failure_reason = 'process_restart'`, because their workflow engine
died with the process and nothing at boot resurrects a workflow run. Every other
deferred run is re-dispatched through the normal cap, oldest submission first,
as a start or a resume per its recorded mode. A marker found on a row that is
not a deferred run is dropped. Nothing is left `queued` and silently dead — which
is what used to happen, and is what the caller's `202 queued` had already
promised would not.

**The routes say so.** `POST /api/tasks/:id/execute` and
`POST /api/tasks/:id/resume` answer `202` either way, with `state: "running"` or
`state: "queued"` and the cap that applied. `?force=true` on execute bypasses the
cap and writes a `manual_force_bypass` row to `usage_ledger` before dispatch.

**Orphans are swept at startup, not reaped on a timer.** On-demand runs carry no
lease: an agent run has no bounded duration to measure against, so a reaper could
only ever kill a long legitimate run. A row still `running` when a new process
boots is unambiguously dead, and `sweepOrphanedTaskRuns()` fails exactly those
with `failure_reason = 'process_restart'` before anything can start.

**`source_type` is explicit.** Workflow step tasks are stamped `workflow`; tasks
created through the API and the chat `create_task` tool are stamped `manual`. A
`NULL` still counts as on-demand, so rows that already exist are unaffected.

## Design decisions

The full record is
`.agents/skills/architect/references/tdr-on-demand-run-cap.md`: the deadlock
analysis of every awaiting start path, why the waiting line moved out of memory
and into `tasks` (it was held in memory at first, and a restart dropped it
silently), and the two residual windows that move left open.

## Implementation

| Area | File |
| --- | --- |
| Cap, claim, FIFO line, drain, startup sweep | `src/lib/agents/task-slots.ts` |
| The gate every on-demand run passes | `src/lib/agents/task-dispatch.ts` |
| Settings key | `src/lib/constants/settings.ts` |
| Shared config reader | `src/lib/schedules/config.ts` |
| Routes | `src/app/api/tasks/[id]/execute/route.ts`, `src/app/api/tasks/[id]/resume/route.ts` |
| Workflow step provenance and claim | `src/lib/workflows/engine.ts` |
| Boot recovery of the deferred line | `src/lib/agents/deferred-run-recovery.ts` |
| The two marker columns | `src/lib/db/schema.ts`, `src/lib/db/bootstrap.ts` |
| Marker cleared on cancel | `src/lib/agents/runtime/index.ts` |
| Marker cleared on a status edit | `src/app/api/tasks/[id]/route.ts` |
| Startup sweep and recovery wiring | `src/instrumentation-node.ts` |

## Tests

`node` project:

- `src/lib/agents/__tests__/task-slots.test.ts` — the cap and its default,
  config precedence, the claim refusing over the cap and leaving the row queued,
  two real SQLite connections racing beneath cap 1, the two caps' independence,
  FIFO ordering across three deferred runs, a cancelled waiter dropped rather
  than started, 12 runs submitted at once never exceeding a cap of 3, `force`,
  and the startup sweep touching only orphaned on-demand runs. Then the
  persisted line: a deferred row carries the marker and a resting one does not,
  the mode is recorded, a second park keeps the first submission's instant, the
  claim clears the marker, a resting `queued` row is never drained, the drain
  follows the marker even when dispatchers arrive out of order, and
  `clearStaleRunRequests` / `failDeferredWorkflowRuns` touch only what they
  should.
- `src/lib/agents/__tests__/deferred-run-recovery.test.ts` — the restart,
  simulated: deferred rows left by a process that is gone and an empty in-memory
  line. Re-dispatch oldest first, a resume re-dispatched as a resume, a workflow
  step failed with `process_restart` instead, a resting `queued` row untouched,
  a stale marker dropped, every deferred row accounted for, and one dispatch
  throwing without stranding the rest.
- `src/app/api/tasks/[id]/__tests__/run-request-marker.test.ts` — a PATCH that
  changes the status takes the row out of the line, one that does not leaves it
  alone, and a delete takes it out with the row.
- `src/app/api/tasks/[id]/cancel/__tests__/route.test.ts` — a cancel on a
  deferred run clears its marker.
- `src/lib/db/__tests__/tasks-run-request.test.ts` — the two columns exist,
  round-trip at millisecond resolution, and are NULL on a row nobody submitted
  a run for.
- `src/lib/agents/__tests__/task-dispatch.test.ts` — the dispatcher gate holds an
  on-demand run and starts it when a slot frees, and does not gate a firing.
- `src/lib/workflows/__tests__/child-task-concurrency.test.ts` — three parallel
  branches complete with the cap set to 1, never more than one at a time.
- `src/app/api/tasks/[id]/execute/__tests__/route.test.ts` and
  `.../resume/__tests__/route.test.ts` — the `202 queued` answer and the audited
  `force` bypass.
