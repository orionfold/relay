---
id: TDR-024
title: Permission-gated chat tools with per-key allowlist
date: 2026-04-02
status: accepted
category: agent-system
---

# TDR-024: Permission-gated chat tools with per-key allowlist

## Context

Chat tools that can modify system state (settings, configurations) need tighter governance than read-only tools. The existing permission pre-check system (TDR-015) handles tool-level gating, but settings modifications require per-key granularity — some settings are safe to change (UI preferences), others are sensitive (auth methods, API keys).

## Decision

Write-capable chat tools use an explicit allowlist pattern. `settings-tools.ts` defines a `WRITABLE_SETTINGS` map where each key declares:
- A validation function that checks the proposed value is acceptable.
- A description for user-facing transparency.

The allowlist currently covers 9 keys (runtime timeouts, routing preferences, browser MCP toggles, Ollama configuration). Keys excluded by design: secrets, auth methods, meta-permissions.

The tool returns `{ key, oldValue, newValue }` for transparency — users see exactly what changed.

Read tools are unrestricted. Write tools must pass both the allowlist check (is this key writable?) and per-value validation (is this value acceptable for this key?).

This pattern extends TDR-015's permission philosophy to the chat surface: TDR-015 gates tool *usage*; TDR-024 gates tool *parameters*.

## Consequences

- Adding a new writable setting requires only adding an entry to the allowlist map — the validation framework is reusable.
- Sensitive settings (API keys, auth methods) are unreachable from chat by design, not by accident.
- The `{ key, oldValue, newValue }` response pattern enables undo and audit.
- Per-key validation prevents invalid values from reaching the database.

## Alternatives Considered

- **Blanket write access with confirmation dialog** — too coarse; a single "allow writes" gate doesn't distinguish safe from sensitive keys.
- **Role-based access control** — over-engineered for single-user context; allowlist is simpler and sufficient.
- **No chat-based settings** — forces users to navigate to settings UI for every change; undermines conversational UX.

## References

- `src/lib/chat/tools/settings-tools.ts` — allowlist implementation
- `src/lib/chat/permission-bridge.ts` — permission bridge for chat tools
- TDR-015 — permission pre-check caching (tool-level gating)
