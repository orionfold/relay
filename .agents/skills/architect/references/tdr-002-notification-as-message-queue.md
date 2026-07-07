---
id: TDR-002
title: Notification table as message queue for human-in-the-loop
date: 2026-03-30
status: accepted
category: workflow
---

# TDR-002: Notification table as message queue for human-in-the-loop

## Context

Agent execution needs human approval for tool permissions, budget alerts, and workflow checkpoints. Need a durable, auditable coordination mechanism.

## Decision

The notifications table serves as a message queue. Agents create notification rows (type: permission_required, read: false). The agent polls for a response on the notification's response/respondedAt fields. UI displays pending notifications in /inbox for human action.

## Consequences

- Full audit trail of every permission decision.
- Single source of truth for human-in-the-loop state.
- Polling is simple but adds latency (1.5s interval).
- Notifications persist even after task completion for audit.

## Alternatives Considered

- **WebSocket bidirectional channel** — complex, no persistence.
- **In-memory event emitter** — lost on restart.
- **External message broker like Redis** — over-engineered for local-first.

## References

- `src/lib/db/schema.ts` (notifications table)
- `src/lib/agents/claude-agent.ts` (canUseTool polling)
- `src/app/api/notifications/`
