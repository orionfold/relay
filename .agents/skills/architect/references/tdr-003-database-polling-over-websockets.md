---
id: TDR-003
title: Database polling over WebSockets for async coordination
date: 2026-03-30
status: accepted
category: workflow
---

# TDR-003: Database polling over WebSockets for async coordination

## Context

Multiple async coordination points exist: tool permissions, schedule firing, task status updates. Need a reliable coordination mechanism.

## Decision

Use database polling (SELECT with interval) instead of WebSockets for all async coordination. canUseTool polls notifications table at 1.5s interval with 55s deadline. Scheduler polls schedules table at 60s interval. Frontend uses SSE (not WebSocket) for log streaming.

## Consequences

- Dramatically simpler implementation — no WebSocket server, connection management, or reconnection logic.
- Slightly higher latency than push (1.5s vs. near-instant).
- Database handles all durability and concurrency.
- Works reliably across process restarts.

## Alternatives Considered

- **WebSocket server** — complex connection lifecycle, hard to debug.
- **Redis pub/sub** — external dependency.
- **In-process event bus** — lost on restart.

## Evolved Patterns

The chat conversation engine (TDR-023) uses Claude Agent SDK streaming via SSE for real-time message delivery, not DB polling. This is architecturally consistent — SSE was already approved in TDR-005 for log streaming. Chat streaming is *content delivery*, not *coordination*. The core decision (DB polling for async coordination: permissions, scheduling, task status) remains valid and unchanged. Heartbeat evaluation (TDR-019) also uses the polling loop — the scheduler polls, then delegates the execution decision to the agent.

## References

- `src/lib/agents/claude-agent.ts` (permission polling)
- `src/lib/schedules/scheduler.ts` (schedule polling + heartbeat branch)
- `src/app/api/logs/stream/`
- `src/lib/chat/engine.ts` (SSE streaming — see TDR-023)
