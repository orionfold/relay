---
id: TDR-006
title: Multi-runtime adapter registry pattern
date: 2026-03-30
status: accepted
category: runtime
---

# TDR-006: Multi-runtime adapter registry pattern

## Context

The project supports multiple AI providers (Anthropic Claude, OpenAI Codex). Need a way to abstract provider-specific execution logic.

## Decision

A runtime adapter registry maps runtime IDs to adapter implementations. Each adapter implements AgentRuntimeAdapter interface (executeTask, resumeTask, cancelTask, runTaskAssist, runProfileAssist, runProfileTests). A capability matrix in catalog.ts declares what each runtime supports (resume, cancel, approvals, mcpServers, etc.). Runtime assignment is validated at task creation and profile assignment time.

## Consequences

- Adding a new provider requires only implementing the adapter interface and registering in catalog.ts.
- Shared orchestration code is provider-agnostic.
- Capability validation prevents runtime errors from unsupported operations.
- Ollama (5th provider, added Sprint 37) demonstrates the pattern's extensibility — local model execution with $0 cost rate, limited capabilities (no resume, no approvals, no mcpServers). Smart router uses provider affinity to route privacy-sensitive tasks to Ollama.

## Alternatives Considered

- **Direct provider imports throughout codebase** — tight coupling.
- **Plugin system with dynamic loading** — over-engineered.
- **Single-provider assumption** — limits growth.

## References

- `src/lib/agents/runtime/catalog.ts`
- `src/lib/agents/runtime/index.ts` (registry)
- `src/lib/agents/runtime/claude.ts`
- `src/lib/agents/runtime/openai-codex.ts`
- `src/lib/agents/runtime/ollama-adapter.ts`
