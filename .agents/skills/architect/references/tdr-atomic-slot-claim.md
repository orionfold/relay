# TDR: Concurrency slot claim is a single SQL statement, not check-then-act

**Status:** Accepted
**Date:** 2026-04-08
**Incident:** 2026-04-08 schedule starvation (5 concurrent firings consumed ~12,600 turns, killed chat SSE)

## Context

The scheduler has two concurrent coordination points: `tickScheduler()` (the poll loop) and `drainQueue()` (the post-completion chain at `src/lib/schedules/scheduler.ts:420`). Both need to check "is the global cap full?" before firing a new task. A naive SELECT then INSERT across these two entry points races and allows the cap to be exceeded.

## Decision

The slot claim MUST be a single SQL statement. We use an atomic conditional UPDATE with a subquery inside the WHERE clause, exploiting SQLite's serialized write lock to guarantee two concurrent claim attempts cannot both succeed.

The implementation lives in `src/lib/schedules/slot-claim.ts`.

## Consequences

- Future coordination primitives must also use single-statement atomic claims. Never SELECT then UPDATE.
- The approach is SQLite-specific. If the backend moves to Postgres, revisit with SELECT ... FOR UPDATE or advisory locks.
- `changes = 0` is a normal outcome meaning "lost the race" — callers must handle it as "leave in queued, retry via drain."
