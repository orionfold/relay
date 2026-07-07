# TDR: All lock holders carry lease expiries + reapers

**Status:** Accepted
**Date:** 2026-04-08

## Context

A hung SDK call can permanently wedge any lock: group locks, concurrency slots, even the existing per-schedule claim (which sets `nextFireAt = NULL` as a lock at `src/lib/schedules/scheduler.ts:240`; if `fireSchedule` throws before writing the new `nextFireAt`, the schedule is stuck until process restart).

## Decision

Every lock primitive in the scheduler pipeline must carry a lease expiry and a reaper:
1. **Concurrency slots** — `tasks.lease_expires_at` reaped at each `tickScheduler()` call. Expired leases are aborted via the execution-manager AbortController and marked failed/lease_expired.
2. **Per-schedule claim** — currently relies on `bootstrapNextFireTimes()` at startup; future work should add a time-based reaper.
3. **New locks** — any future coordination primitive must ship with a reaper from day one.

Default lease: 20 minutes. Override per-schedule via `schedules.max_run_duration_sec`.

## Consequences

- Lock holders cannot rely on "the other code path will clean this up." Every claim must be either released normally (on completion) or reaped (on lease expiry).
- The reaper is idempotent — safe to run at every tick.
- Aborting via AbortController requires the runtime adapter to honor the signal; all SDK query calls must pass through the abort controller from execution-manager.
