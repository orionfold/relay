---
id: TDR-021
title: Async inter-agent message bus with chain depth governance
date: 2026-04-02
status: accepted
category: agent-system
---

# TDR-021: Async inter-agent message bus with chain depth governance

## Context

Multi-agent workflows require agents to delegate sub-tasks to specialized profiles. Without governance, delegation chains can loop indefinitely (A hands to B, B hands to C, C hands back to A). The system needs asynchronous inter-agent communication with safety bounds.

## Decision

The `agentMessages` table provides an async message bus between agent profiles. Messages carry:
- **Routing**: `fromProfileId`, `toProfileId`, `taskId` (source), `targetTaskId` (created by recipient).
- **Content**: `subject`, `body`, `attachments` (JSON), `priority` (1-5 scale).
- **Lifecycle**: `pending` → `accepted` → `in_progress` → `completed` / `rejected` / `expired`.
- **Governance**: `chainDepth` increments with each handoff; `parentMessageId` enables threading; `expiresAt` enables automatic cleanup.
- **Human oversight**: `requiresApproval` flag routes messages through notification approval before processing; `approvedBy` tracks who approved.

This is distinct from the notification system (TDR-002) which handles human-agent coordination. Agent messages handle agent-agent coordination.

The `send_handoff` chat tool (`src/lib/chat/tools/handoff-tools.ts`) enables agents to initiate handoffs during chat conversations.

## Consequences

- Chain depth limits prevent unbounded delegation cycles.
- Expiration timestamps enable automatic cleanup of stale handoffs without manual intervention.
- Human approval gate provides oversight for sensitive cross-agent delegations.
- The message bus is pull-based (agents check for pending messages) rather than push-based, consistent with TDR-003.
- Priority levels enable urgent handoffs to be processed before routine ones.

## Alternatives Considered

- **Direct function calls between agents** — synchronous, no governance, no audit trail.
- **Shared task queue with agent routing** — conflates tasks with messages; messages may not result in tasks.
- **Notification table reuse** — overloading notifications (TDR-002) would blur the human-agent and agent-agent boundaries.

## References

- `src/lib/db/schema.ts` — `agentMessages` table
- `src/lib/agents/handoff/bus.ts` — message bus implementation
- `src/lib/chat/tools/handoff-tools.ts` — chat tool for initiating handoffs
