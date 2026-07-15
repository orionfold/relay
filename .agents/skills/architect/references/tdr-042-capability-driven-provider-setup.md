---
id: TDR-042
title: Capability-driven provider setup over operator-trusted endpoints
date: 2026-07-15
status: accepted
category: runtime
---

# TDR-042: Capability-driven provider setup over operator-trusted endpoints

## Context

Ollama, LiteLLM, and LM Studio share configuration concepts but not management
semantics. Ollama pulls model artifacts, LM Studio downloads and loads local
artifacts, and LiteLLM registers upstream deployments that may include provider
credentials. Separate Settings implementations drifted in validation, secret
handling, connection testing, model detail, actions, and status communication.

Relay intentionally connects to operator-selected LAN and remote runtime hosts.
Private-address blocking would defeat that product contract, while a DNS lookup
without socket pinning would not prevent rebinding.

## Decision

Use one provider-setup grammar and state machine for common fields and phases,
driven by explicit provider capability definitions. Shared presentation does
not imply shared management authority or identical wire operations.

- Ollama may Pull models and optionally use a Bearer key for direct
  `ollama.com` or an operator-configured authenticated proxy.
- LM Studio may Download models through its native v1 API, with status polling.
- LiteLLM setup remains a runtime-client boundary: Relay discovers models and
  links operators to gateway management, but does not call the beta privileged
  registration API or collect upstream provider secrets.

Provider destinations are operator-trusted. Relay uniformly enforces HTTP/S
URL validation, no URL credentials/query/fragment, explicit consent for
non-loopback HTTP, redirect refusal, bounded failures, and server-only secret
resolution/redaction. DNS allowlisting or pinning is deferred to a reusable
outbound-network trust layer spanning all operator-configured integrations.

## Consequences

- Save/Test/status behavior can remain consistent while provider-specific
  actions stay truthful.
- A normal runtime API key never silently grants gateway-admin privileges.
- Every production Ollama caller must use the same endpoint/auth configuration;
  raw settings reads and unguarded redirects are architectural drift.
- Rich-detail endpoints are optional enrichment. Their failure cannot erase a
  healthy basic model list, and absent metadata is never invented.
- Changes are runtime-registry-adjacent and require a real Next.js task smoke.

## Alternatives considered

- One generic `Pull model` action: rejected because LiteLLM does not host model
  weights and LM Studio uses download/load lifecycle semantics.
- LiteLLM `/model/new` from Settings: rejected because it is privileged, beta,
  and may carry upstream provider secrets.
- Block private DNS answers: rejected because Relay explicitly supports LAN
  provider servers.
- Pre-fetch DNS checks without connection pinning: rejected as security theater.
- Fully separate cards and transports: rejected because existing drift proves
  shared common behavior needs one contract.

## References

- `features/coherent-runtime-provider-setup.md`
- `features/coherent-runtime-provider-setup-plan.md`
- TDR-006, TDR-032, TDR-041
- https://docs.ollama.com/api/authentication
- https://docs.ollama.com/api/pull
- https://docs.litellm.ai/docs/proxy/model_management
- https://lmstudio.ai/docs/developer/rest
