---
id: TDR-043
title: Explicit eligible-runtime policy separated from provider setup
date: 2026-07-15
status: accepted
category: runtime
---

# TDR-043: Explicit eligible-runtime policy separated from provider setup

## Context

Relay exposes Latency, Cost, Quality, and Manual task-routing policies, but the
Settings control historically rewrote provider authentication, provider model
defaults, and the Chat default. The executor independently considered every
configured compatible runtime, and Manual hard-coded Claude Agent SDK. This
made the selected policy neither an accurate execution constraint nor a stable
audit record. Ollama, LiteLLM, and LM Studio also make provider-identity claims
about locality, price, latency, and quality unsafe.

## Decision

Persist a versioned routing policy with an explicit automatic eligible-runtime
list, strict Manual default, and automatic-fallback flag.

- The v1 default list contains all seven registered runtime ids. Current
  configuration, profile compatibility, required capabilities, health, and
  temporary launch exclusions are computed at execution time.
- Explicit task/workflow targets remain strict and take precedence over policy.
  Manual uses its configured default strictly. Automatic fallback is bounded by
  the saved eligible pool and never applies to explicit or Manual targets.
- Routing preferences never mutate provider credentials, endpoints, models, or
  Chat defaults. Provider edits never silently change routing policy.
- Provider identity is not optimization evidence. Unknown cost receives no
  bonus and follows comparable known cost; unknown latency and quality remain
  tied in saved pool order after profile/content affinity and hard capability
  filters.
- Every launch attempt writes a bounded durable selection receipt containing
  the effective target, reason, considered order, and skipped candidates.

## Consequences

- Settings and execution share one auditable policy contract.
- Operators can exclude a runtime without deleting its configuration and can
  reverse that choice later.
- Automatic routing may fail visibly when the pool is empty or every member is
  currently unavailable; Relay does not silently broaden policy.
- Latency and Quality may use stable pool order when no comparable evidence
  exists. This is intentionally more honest than provider-name scoring and
  leaves room for separately governed evidence registries.
- The Settings health snapshot is advisory; execution always rechecks.
- Runtime-registry-adjacent changes require the real Next.js task smoke in
  addition to unit, type, and build verification.

## Alternatives considered

- Provider radio buttons beside routing policies: rejected because provider
  identity and selection policy are different concepts.
- Keep the credential/model cascade: rejected because it crosses provider and
  Chat ownership boundaries and silently mutates unrelated operator choices.
- Manual as hard-coded Claude Agent SDK: rejected because it is not operator
  controlled.
- Treat Ollama/LM Studio as free/local or direct APIs as fast: rejected because
  configured topology, billing, model, and performance are unknown.
- Benchmark and quality registry in v1: deferred because it adds collection,
  normalization, privacy, and evaluation policy beyond an explicit pool.

## References

- `features/explicit-eligible-runtime-pool.md`
- `features/explicit-eligible-runtime-pool-architect-report.md`
- `features/explicit-eligible-runtime-pool-plan.md`
- TDR-006, TDR-032, TDR-041, TDR-042
