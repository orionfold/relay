---
id: TDR-023
title: Chat conversation engine with SQLite-backed streaming
date: 2026-04-02
status: accepted
category: api-design
---

# TDR-023: Chat conversation engine with SQLite-backed streaming

## Context

The project needed a conversational interface where users can interact with agents naturally — asking questions about projects, creating tasks, and querying data. This required persistent conversation history, streaming responses, and access to ainative's data through a tool interface.

## Decision

The chat engine (`src/lib/chat/engine.ts`) manages conversations backed by two SQLite tables:

- **`conversations`**: Project-scoped sessions with configurable `runtimeId`, `modelId`, `contextScope` (JSON overrides), and `sessionId` for SDK session resumption.
- **`chatMessages`**: Individual messages with streaming status lifecycle (`pending` → `streaming` → `complete` → `error`).

**Streaming**: The engine uses Claude Agent SDK's `query()` for streaming responses via SSE. This is architecturally consistent with TDR-005 (SSE for log streaming) but distinct from TDR-003 (DB polling for async coordination). Chat streaming is content delivery, not coordination.

**Tool access**: Agents access ainative data through an MCP tool server pattern (`ainative-tools.ts`), not direct DB access. The tool registry (`tool-catalog.ts`) defines available tools per conversation context. This maintains the Server Component / API route boundary (TDR-004) — the chat engine is a server-side component that queries DB directly for context building but exposes data to agents only through tools.

**Context building**: `context-builder.ts` assembles per-turn context by merging project state, entity references from `@mentions` (detected by `entity-detector.ts`), and conversation history.

**Multi-runtime**: The engine supports multiple backends — Claude SDK (`engine.ts`), OpenAI Codex (`codex-engine.ts`), and Ollama (`ollama-engine.ts`), following the adapter pattern from TDR-006.

## Consequences

- Conversations are persistent and project-scoped — users can return to previous conversations.
- Streaming status tracking enables UI to show typing indicators and handle interruptions.
- MCP tool pattern means agents can only access data through defined tools — no arbitrary DB access.
- Context building is explicit and auditable — every piece of context injected into a turn is traceable.
- Multiple engine backends mean the chat interface is runtime-agnostic.

## Alternatives Considered

- **Stateless chat (no persistence)** — loses conversation history; users can't reference earlier discussions.
- **WebSocket-based streaming** — rejected per TDR-003 philosophy; SSE is simpler and sufficient.
- **Direct DB access from agent prompts** — security risk; tools provide a controlled data surface.

## References

- `src/lib/chat/engine.ts` — Claude SDK chat engine
- `src/lib/chat/codex-engine.ts` — OpenAI Codex engine
- `src/lib/chat/ollama-engine.ts` — Ollama local engine
- `src/lib/chat/context-builder.ts` — per-turn context assembly
- `src/lib/chat/entity-detector.ts` — @mention entity detection
- `src/lib/chat/ainative-tools.ts` — MCP tool server for agent data access
- `src/lib/chat/tool-catalog.ts` — tool registry and catalog
- `src/lib/db/schema.ts` — `conversations`, `chatMessages` tables
