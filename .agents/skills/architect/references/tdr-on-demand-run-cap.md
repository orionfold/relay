# TDR: On-demand runs have their own cap, their own queue, and no lease

**Status:** Accepted
**Date:** 2026-10-12
**Amended:** 2026-10-12 — the waiting line moved from memory into `tasks`.
See "Superseded: the in-memory waiting line".

## Context

`SCHEDULE_MAX_CONCURRENT` caps schedule firings, and `claimSlot` enforces it in
one atomic statement (`tdr-atomic-slot-claim.md`). That statement matches only
`source_type IN ('scheduled', 'heartbeat')`. Every other way a task run starts —
the manual execute route, resume, the chat `execute_task` tool, the handoff bus,
a workflow step — reached `startTaskExecution` and was marked `running`
unconditionally.

So the cap covered the unattended path and left the attended one open. A
workflow that fans out to parallel branches, or a burst of manual executes,
launched as many agent processes as it had work for. On a small host that
exhausts memory and every run in flight fails together.

A second gap: a run left `running` when the process stopped stayed `running`
forever. Only scheduled runs carry a lease for `reapExpiredLeases` to collect.

## Decision

A second, independent cap for **on-demand** runs — every task run whose
`source_type` is not `scheduled` or `heartbeat`, `NULL` included. Default 20,
read as `TASK_MAX_CONCURRENT`, then the `task.maxConcurrent` setting, then the
default, through the same `readIntConfig` the schedule cap uses.

Six decisions follow from it.

**The two caps stay independent and disjoint.** The on-demand count is the exact
complement of the scheduled one, so every running task is counted once and
neither cap can be filled by the other's work. The schedule cap is low (2)
because a firing is unattended and arrives in bursts; an on-demand run is
something a person or a workflow is waiting on, so its cap is set high enough to
be invisible in normal use and only bites when a burst would otherwise exhaust
the host. `tdr-evidence-based-cap.md` governs the schedule number and does not
govern this one.

**The claim is one SQL statement**, with the count as a subquery in the `WHERE`
clause, for the reason `tdr-atomic-slot-claim.md` gives: every start path can run
concurrently, so check-then-act would let two callers both read "one slot left".
It writes `slot_claimed_at` and deliberately writes no lease.

**The waiting line is in the table, marked.** *(Reversed 2026-10-12 — the
original decision, and why it was wrong, are under "Superseded" below.)* A
deferred run is `status = 'queued' AND run_requested_at IS NOT NULL`. The marker
is written by the same statement that parks the row, cleared by the same
statement that claims it, and cleared by every path that takes a row out of the
line without starting it (a cancel, a status written through the PATCH route).
A `queued` row with no marker is a task at rest and nothing may start it, which
is the property the in-memory list used to provide.

`run_requested_mode` rides alongside it — `start` or `resume` — because the row
cannot say which dispatcher entry point submitted the run. A resumed task is
`failed` only until it is parked, and resuming a run that was started fresh
replays the wrong session.

An in-memory map survives, holding the promise each waiting dispatcher is parked
on. That is the one thing the table cannot record and the one thing a restart
destroys. It no longer decides *order*: `drainTaskQueue` reads the deferred rows
from the table ordered by `run_requested_at`, and the map only answers whether a
dispatcher in this process is waiting for a given row.

FIFO is therefore by **submission order**, not by `created_at`, and the marker is
how submission order outlives the process. For a run that was submitted the
moment it was created the two agree; where they disagree, submission order is the
one that means "first come, first served". `COALESCE` on the park keeps the first
submission's instant when a row is parked a second time, which is what lets a
boot-recovered run keep the place it held before the restart even though its
dispatcher re-enters the line last.

Millisecond resolution, unlike `slot_claimed_at`'s seconds: a burst of
submissions lands well inside one second, and this column is the sort key.

**Every deferred run is accounted for at boot.** `recoverDeferredTaskRuns()`
(`src/lib/agents/deferred-run-recovery.ts`) runs after `sweepOrphanedTaskRuns()`
— so the slots the ghosts held are already free — and after the plugin loader, so
a run bound to a plugin profile resolves it. Three outcomes, and every deferred
row gets exactly one:

| Row | Outcome |
| --- | --- |
| `source_type = 'workflow'` | Failed, `failure_reason = 'process_restart'`. |
| Anything else | Re-dispatched, oldest first, as a start or a resume per `run_requested_mode`. |
| Marked but not a deferred run | Marker dropped as residue. |

A workflow step is failed rather than re-dispatched because its engine is driven
by `executeWorkflow` in the process that died and nothing at boot resurrects a
workflow run: the step would produce a result nobody reads, and leaving it
`queued` would hide a workflow that is never going to finish.

Re-dispatch is fire-and-forget — a recovered run holds its dispatcher for as long
as it executes, and boot must not wait for that. The table's ordering is what
keeps FIFO despite that.

**The park still overwrites the row's status with `queued`, and no column
records what it was.** The alternative considered was a `previous_status`, so a
re-submitted `failed` row that is dropped does not lose the `failed`. It buys
nothing now: with boot recovery no deferred row survives a restart unhandled, so
the row either runs — which overwrites the status anyway — or is explicitly
failed with `process_restart`, which says more than the status it replaced.

**Two residual gaps, both accepted and both narrow.**

A route answers `202 queued` before the dispatcher parks the row: the execute
route resolves its target first, the resume route leaves the row `failed` until
`resumeTaskExecution` reaches `acquireTaskSlot`. A process that dies inside that
window leaves a row that is not marked, and recovery cannot see it. Closing it
means marking from the routes as well as from the dispatcher, which puts the
marker on rows in three different statuses and makes "a marker means a deferred
`queued` run" stop being true. One writer is worth the window.

A deferred row whose dispatcher has not yet re-entered the line is **skipped** by
the drain rather than blocking it. Strict head-of-line would stall every other
run for as long as that takes, and forever if the dispatcher never arrives.

**Over the cap is never an error.** The row stays `queued`, the route answers
`202` with `state: "queued"`, and the dispatcher holds the caller until its turn
comes. A caller that awaits the run — `executeChildTask` above all — simply waits
longer. `?force=true` on the manual execute route bypasses the cap and writes a
`manual_force_bypass` row to `usage_ledger` before dispatch, as
`tdr-manual-honors-cap.md` prescribes for every "run now" surface.

**Orphans are swept once at startup, and never reaped on a timer.** A periodic
reaper needs a duration to measure against, and an on-demand run has none: the
only thing a timer could reliably kill is a long legitimate run. A row still
`running` after a restart, by contrast, is unambiguously dead — nothing in the
new process is executing it. `sweepOrphanedTaskRuns()` fails exactly those, with
`failure_reason = 'process_restart'`, before anything can start a new run.

## Deadlock analysis

A capped run that waits on another capped run deadlocks if the waiter holds a
slot its dependency needs. Every path that can start a run was read for this:

| Path | Awaits the run? | Does the waiter hold a slot? |
| --- | --- | --- |
| `executeChildTask` (workflow step, every pattern incl. parallel and swarm) | yes | **no** — the workflow engine is driven by `executeWorkflow`, which is fire-and-forget from its routes, the chat tool, the app-trigger dispatcher and the scheduler. A workflow is not a task row and holds no slot. |
| Manual execute route | no | n/a |
| Resume route | no | n/a |
| Chat `execute_task` | no — fire-and-forget | n/a (and a chat conversation is not a task row) |
| Handoff bus | no — fire-and-forget, dispatched from the scheduler tick | n/a |
| Heartbeat evaluation | yes, but `source_type = 'heartbeat'` — not capped here | n/a |

So no cycle exists today: nothing that holds an on-demand slot awaits another
on-demand run. A workflow's parallel branches are siblings, not a parent and a
child, so with the cap at 1 they run one at a time and the fan-out completes.
`src/lib/workflows/__tests__/child-task-concurrency.test.ts` pins that.

The invariant to keep is therefore: **a running task must not await another task
run.** If a future feature needs one — a step that synchronously delegates to a
sub-task, an awaiting handoff — the fix is not a bigger cap but releasing the
parent's slot for the duration of the wait, because any cap can be filled by
enough nested waiters.

## Consequences

- `source_type` is now written on workflow step tasks (`workflow`) and on tasks
  created through the API and the chat tool (`manual`), so the count is explicit
  rather than inferred from `NULL`. `NULL` still counts as on-demand, which is
  what makes the change safe for rows that already exist.
- `executeChildTask` no longer sets its step task `running` before dispatch; the
  claim makes that transition, and setting it first would have made the step
  count against the cap before it had a slot.
- No new table and no new index: `idx_tasks_running_scheduled` is
  `(status, source_type, lease_expires_at)`, and its first two columns are
  exactly what the on-demand count filters on.
- A missed release can delay a queued run until the next drain tick; it can
  never let the cap be exceeded, because the cap is counted from the table on
  every claim rather than from an in-memory number.
- Two nullable columns on `tasks`, `run_requested_at` and `run_requested_mode`,
  added through `addColumnIfMissing` like `slot_claimed_at`. Still no new table
  and no new index: `idx_tasks_running_scheduled` leads on `(status,
  source_type)`, which is what the deferred predicate filters on.
- `drainTaskQueue()` reads the table. It returns immediately when nothing in
  this process is waiting, so the hot path — a run settling with an empty line —
  still touches no SQL.
- `clearRunRequest()` is called from `cancelTaskWithRuntime`, the one chokepoint
  every cancel passes through, and the PATCH route clears the marker in the same
  statement that writes a status change. A marker left on a row that leaves the
  line would come back to life the moment anything put that row back to
  `queued`; `clearStaleRunRequests()` at boot is the backstop for a path that is
  ever missed.

## Superseded: the in-memory waiting line

The original decision held the line in memory, and the reasoning was sound as
far as it went. `drainQueue` walks the `tasks` table for queued schedule
firings, which is safe because a scheduled task row only exists once it has
fired. For on-demand work `queued` is a *resting* state — a task a person
created and has not run yet sits in it indefinitely — so a drain that walked
every queued row would launch runs nobody asked for. An in-memory list held only
runs that were actually submitted.

It accepted the cost in one sentence: "a restart empties the line. That leaves
those rows `queued`, which is where they would have been had the process died a
moment earlier, and a person can run them again." Two things in that are wrong.

The caller is not where it would have been: it already holds a `202` with
`state: "queued"` from `POST /api/tasks/:id/execute` or `.../resume`, which is a
promise that the run was accepted. And a person cannot run them again, because
nothing tells them which rows those are — a waiting row and a task nobody has
ever submitted are the same row in `relay.db`, and `sweepOrphanedTaskRuns()`
touches only `running`. The loss is silent and unqueryable.

It also lands at the worst moment. The line exists only when the cap is full,
and every deploy restarts the Relay.

What the original reasoning actually required was that a drain start only runs
somebody submitted. A marker gives that just as well as a separate list does,
and unlike the list it survives the process.
