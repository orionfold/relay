# TDR: Chat and scheduled agents compete for the same Node event loop

**Status:** Accepted
**Date:** 2026-04-08

## Context

ainative runs chat and scheduled tasks in the same Node process, on the same event loop. The 2026-04-08 incident showed this is a critical architectural constraint: when 5 schedules saturated the event loop, a user's chat SSE stream was starved and dropped mid-stream.

## Decision

This is a known and intentional constraint until a worker-thread isolation architecture is designed. Any feature that adds agent-like workloads (image pipelines, MCP servers, streaming tools) must assume chat is on the critical path and must not starve it.

Mitigations:
1. Global concurrency cap limits scheduled agents to `SCHEDULE_MAX_CONCURRENT` (default 2).
2. Chat soft pressure signal — when chat is streaming, the scheduler defers new firings by 30s (`src/lib/chat/active-streams.ts` + `scheduler.ts:applyChatPressure`).
3. Spec B hotfix guarantees chat messages never persist as empty content even under worst-case contention.

## Consequences

- Future high-throughput features must evaluate event-loop impact before shipping.
- Worker-thread isolation is tracked as an architectural follow-up. This TDR is the anchor point for that future work.
- Profiling under load should measure `event_loop_lag_ms` and alert when p99 exceeds 50ms.
