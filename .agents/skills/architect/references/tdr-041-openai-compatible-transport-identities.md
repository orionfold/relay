---
id: TDR-041
title: Shared OpenAI-compatible transport with explicit runtime identities
date: 2026-07-14
status: accepted
category: runtime
---

# TDR-041: Shared OpenAI-compatible transport with explicit runtime identities

## Context

Relay is adding LiteLLM and LM Studio. Both expose OpenAI-compatible model-list
and Chat Completions endpoints, but they are operationally different: LiteLLM
is a gateway that can route to many upstreams, while LM Studio is an inference
server that may run on loopback or a network host. Duplicating adapters would
duplicate protocol parsing; collapsing them into a generic provider would lose
identity, credential, security, and usage truth.

## Decision

Add two runtime/provider identities (`litellm`, `lmstudio`) under TDR-006's
registry. They share a dependency-free fetch transport for URL validation,
model listing, Chat Completions, SSE parsing, typed failures, and usage parsing.
Identity-specific defaults, environment keys, labels, security copy, and cost
handling remain explicit.

Explicit selection is strict: compatible runtime/model failures are surfaced
and never enter Relay's Claude/OpenAI/Ollama fallback chain. API keys remain on
the server. Non-loopback HTTP requires explicit operator acceptance. Relay
records provider-reported tokens and a valid LiteLLM-reported cost only; it
does not infer cost, upstream provider, locality, privacy, or offline status.

G-069 advertises text Chat/task execution, cancellation, model discovery, and
health checks. It does not advertise resume, filesystem/Bash, MCP/plugin-MCP,
approvals, or provider tool loops. Cross-provider Chat/tool contract parity is
deferred to G-072.

## Consequences

- One protocol fix covers both runtimes while operator-facing receipts retain
  the selected identity.
- Runtime-ID union growth affects every exhaustive record and requires broad
  compile/catalog regression checks.
- A provider protocol divergence should split the smallest affected transport
  method, not copy the adapter wholesale.
- Arbitrary compatible endpoints remain out of scope; adding one requires an
  explicit identity and capability review.

## Alternatives considered

- One generic `openai-compatible` runtime: rejected because it erases identity
  and makes security/cost claims ambiguous.
- Two fully duplicated adapters: rejected because protocol and failure handling
  would drift.
- Provider SDK dependency: rejected because fetch covers the required protocol
  and no dependency gate was authorized.
- Treat LM Studio as Ollama or LiteLLM as OpenAI Direct: rejected because their
  APIs, cost semantics, and operational identities are materially different.

## References

- TDR-006 — multi-runtime adapter registry
- TDR-032 — runtime ainative MCP injection and module-load safety
- `features/openai-compatible-runtimes.md`
- https://docs.litellm.ai/
- https://lmstudio.ai/docs/developer/openai-compat
- https://lmstudio.ai/docs/developer/core/server/serve-on-network
