# TDR: Scheduler cap is static and evidence-based

**Status:** Accepted
**Date:** 2026-04-08

## Context

The 2026-04-08 incident showed 5 concurrent schedules starved the chat SSE stream. The cap of 2 (later 3) was chosen as a guess, not a measurement. Without `schedule_firing_metrics` we have no way to validate or refine it.

## Decision

The cap starts at 2 and is raised to 3 only after one week of `schedule_firing_metrics` telemetry shows:
- Chat SSE P99 first-token latency stays below 2 seconds
- `event_loop_lag_ms` p99 stays below 50ms
- `slot_wait_ms` p95 stays below 60s under typical load

Any future change to the cap requires re-running the validation against the metrics table.

## Consequences

- `schedule_firing_metrics` is load-bearing. Never cut it from follow-up specs.
- Dynamic cap adjustment is deferred until the static cap proves insufficient. Dynamic control loops have failure modes (oscillation, thundering herd) that don't belong in a first ship.
