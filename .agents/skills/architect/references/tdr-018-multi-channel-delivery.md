---
id: TDR-018
title: Multi-channel delivery adapter registry
date: 2026-04-02
status: accepted
category: infrastructure
---

# TDR-018: Multi-channel delivery adapter registry

## Context

Agents need to deliver results beyond the web UI — to Slack channels, Telegram chats, and external webhooks. Each platform has different APIs, authentication patterns, and message formats. The system needs a unified delivery surface without coupling agent execution to any specific platform.

## Decision

A pluggable adapter registry (`src/lib/channels/registry.ts`) maps channel type strings (`slack`, `telegram`, `webhook`) to adapter implementations. Each adapter implements the `ChannelAdapter` interface: `send()`, `testConnection()`, and optionally `parseInbound()`, `verifySignature()`, and `sendReply()` for bidirectional channels.

Channel configurations are stored in `channelConfigs` table with credential JSON in a TEXT column. All API responses must mask sensitive fields via `maskChannelConfig()` before returning — raw credentials never leave the server.

Bidirectional channels bind to conversations via the `channelBindings` junction table, which tracks `externalThreadId` for platform-specific threading (Slack thread_ts, Telegram chat_id). A gateway (`gateway.ts`) bridges inbound messages from external platforms into the chat engine.

Polling infrastructure (`poller.ts`) handles platforms without webhook support (Slack conversations.history, Telegram getUpdates).

Schedule-fired tasks can specify `deliveryChannels` (JSON array of channel config IDs) for automatic result delivery after execution.

## Consequences

- Adding a new channel type requires only implementing the adapter interface and registering in the registry map.
- Credential storage is plaintext JSON — a future improvement should add encryption at rest.
- Bidirectional channels require both an adapter and a poller; outbound-only channels need just the adapter.
- The gateway pattern means the chat engine is channel-agnostic — it receives messages through a uniform interface.

## Alternatives Considered

- **Direct platform SDK usage throughout codebase** — tight coupling, no reuse.
- **Third-party notification service (e.g., Novu)** — external dependency, self-hosted requirement conflicts with SQLite-first architecture.
- **WebSocket-based push** — rejected per TDR-003 philosophy; polling is simpler and the latency is acceptable for delivery use cases.

## References

- `src/lib/channels/types.ts` — ChannelAdapter interface
- `src/lib/channels/registry.ts` — adapter registry
- `src/lib/channels/slack-adapter.ts`, `telegram-adapter.ts`, `webhook-adapter.ts`
- `src/lib/channels/gateway.ts` — inbound message bridge
- `src/lib/channels/poller.ts` — platform polling infrastructure
- `src/lib/db/schema.ts` — `channelConfigs`, `channelBindings` tables
