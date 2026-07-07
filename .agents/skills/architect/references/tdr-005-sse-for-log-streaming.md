---
id: TDR-005
title: SSE for agent log streaming
date: 2026-03-30
status: accepted
category: api-design
---

# TDR-005: SSE for agent log streaming

## Context

Agent execution produces a stream of events (tool calls, outputs, errors) that the UI needs to display in real-time.

## Decision

Use Server-Sent Events (SSE) via ReadableStream for streaming agent logs to the browser. The /api/logs/stream endpoint polls the agent_logs table and pushes new entries as SSE events.

## Consequences

- Native browser EventSource API support.
- Automatic reconnection on disconnect.
- One-directional (server to client) which matches the use case.
- No WebSocket complexity.

## Alternatives Considered

- **WebSocket** — bidirectional not needed for logs.
- **Long-polling** — worse latency.
- **Polling from client** — too many requests.

## References

- `src/app/api/logs/stream/route.ts`
- `src/lib/db/schema.ts` (agent_logs table)
