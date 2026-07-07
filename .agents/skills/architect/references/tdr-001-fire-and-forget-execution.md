---
id: TDR-001
title: Fire-and-forget task execution with 202 responses
date: 2026-03-30
status: accepted
category: api-design
---

# TDR-001: Fire-and-forget task execution with 202 responses

## Context

Agent task execution can take minutes to hours. Blocking HTTP requests would cause timeouts and poor UX.

## Decision

POST /api/tasks/[id]/execute returns 202 Accepted immediately. Task execution happens asynchronously via executeTaskWithRuntime(). In-memory tracking via execution-manager.ts with AbortController for cancellation.

## Consequences

- Simpler client code (no long-polling needed for initial request).
- Requires separate mechanism for status updates (SSE, polling).
- Client must handle "task started but no result yet" state.

## Alternatives Considered

- **WebSocket-based execution** — too complex for local-first app.
- **Synchronous execution with timeout** — unreliable for long tasks.
- **Server-sent events for the initial request** — conflates request/response with streaming.

## References

- `src/app/api/tasks/[id]/execute/route.ts`
- `src/lib/agents/execution-manager.ts`
