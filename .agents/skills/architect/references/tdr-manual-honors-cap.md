# TDR: Manual execute honors the global cap by default

**Status:** Accepted
**Date:** 2026-04-08

## Context

Operational controls like "Run now" buttons are tempting to implement as cap-bypassing shortcuts, but a user who clicks them 5 times in 2 seconds can reproduce the exact incident profile that motivated the cap in the first place (2026-04-08: 5 concurrent Opus runs, ~12,600 turns, starved chat).

## Decision

`POST /api/schedules/:id/execute` honors `SCHEDULE_MAX_CONCURRENT` by default. When the cap is full, return `429` with an ETA for the next free slot. An explicit `?force=true` query parameter bypasses the cap, logged to `usage_ledger` as `activityType='manual_force_bypass'` for audit.

## Consequences

- Future operational endpoints (bulk re-run, workflow force-trigger) should follow the same pattern: honor cap + explicit force flag + audit log.
- Users who genuinely need rapid-fire execution have an escape hatch, but the happy path defaults to safety.
- Audit log entries can be queried to detect abusive or automated bypass patterns.
