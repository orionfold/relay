---
id: TDR-006
title: Multi-runtime adapter registry pattern
date: 2026-03-30
status: accepted
category: runtime
---

# TDR-006: Multi-runtime adapter registry pattern

## Context

The project supports seven runtime identities across Anthropic, OpenAI, Ollama,
LiteLLM, and LM Studio. It needs one abstraction for provider-specific
execution without collapsing distinct authentication, transport, capability,
model, or operator-policy semantics.

## Decision

A runtime adapter registry maps runtime IDs to adapter implementations. Each adapter implements AgentRuntimeAdapter interface (executeTask, resumeTask, cancelTask, runTaskAssist, runProfileAssist, runProfileTests). A capability matrix in catalog.ts declares what each runtime supports (resume, cancel, approvals, mcpServers, etc.). Runtime assignment is validated at task creation and profile assignment time.

## Consequences

- Adding a new provider requires only implementing the adapter interface and registering in catalog.ts.
- Shared orchestration code is provider-agnostic.
- Capability validation prevents runtime errors from unsupported operations.
- Ollama, LiteLLM, and LM Studio demonstrate the registry's extensibility while
  retaining limited capability contracts. Their configured endpoints may be
  local, LAN, cloud, proxied, billed, or unbilled; provider identity is not
  evidence of locality, privacy, cost, latency, or model quality.
- TDR-043 layers an explicit eligible-runtime policy over this registry.
  Current configuration, profile compatibility, hard capabilities, and health
  are computed at execution time; explicit and Manual targets remain strict.

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
- `src/lib/agents/runtime/openai-compatible-adapter.ts`
- TDR-041, TDR-042, TDR-043
