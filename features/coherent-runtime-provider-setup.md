# Coherent Ollama, LiteLLM, and LM Studio setup (G-076)

Status: complete — PROCEED contract verified 2026-07-15
Date: 2026-07-15
Owner: Relay runtime settings

## Outcome

Settings gives Ollama, LiteLLM, and LM Studio one setup grammar wherever their
capabilities overlap: Base URL, authentication when the provider consumes it,
remote-HTTP consent, default model, Save, Test and discover, connection state,
model details, and model-acquisition guidance. Genuine provider differences
remain explicit rather than appearing as missing or inconsistent controls.

Testing a dirty form validates and persists the exact edited values first. A
save failure prevents the connection test. A successful test displays the
provider-reported model name, canonical id, and available metadata without
inventing absent values or converting valid `false` and zero values to unknown.

## Current product and code drift

- Ollama saves an unvalidated Base URL separately from Test, silently ignores a
  settings-load failure, has no remote-HTTP switch in Settings, and does not
  expose its persisted default model in the Ollama card.
- LiteLLM and LM Studio share normalized URL and secret-redaction behavior, but
  Test uses the last persisted settings even when the visible form is dirty.
- The compatible-runtime UI reduces discovered models to ids, even when the
  provider can return names, parameters, capabilities, size, quantization, or
  load state.
- Save/Test labels, button order, feedback, errors, model lists, and acquisition
  areas differ across the three cards.
- The OpenAI-compatible transport refuses redirects, but Ollama fetches do not
  yet share that guard. No provider path currently implements DNS pinning.

## Authoritative capability matrix

| Capability | Ollama | LiteLLM | LM Studio |
|---|---|---|---|
| Base URL | Native API root; local default `http://localhost:11434`; direct cloud root `https://ollama.com` | OpenAI-compatible root; default `http://localhost:4000/v1` | OpenAI-compatible root; default `http://localhost:1234/v1`; native management API is on the same origin under `/api/v1` |
| Authentication | None for the local API. Bearer API key is required for direct `ollama.com` API access; a signed-in local server authenticates its own cloud requests | Bearer virtual/master key when the gateway requires it; unauthenticated deployments also exist | Optional Bearer API token; native token support requires LM Studio 0.4.0+ |
| Remote HTTP | Valid for LAN deployments, but non-loopback cleartext needs explicit operator consent | Valid for LAN/remote gateways with explicit cleartext consent | Valid when network serving is enabled, with explicit cleartext consent |
| Default model | Supported and already persisted by Relay | Supported; may be a LiteLLM model alias | Supported; use the canonical LM Studio model key |
| Basic discovery | `GET /api/tags` | `GET /v1/models` | `GET /v1/models` |
| Rich discovery | Name/model id, modified time, size, digest, format, family, parameter size, quantization | `/model/info` or `/v1/model/info` can add model metadata, token limits, mode, provider, and configured cost metadata while excluding API keys | `GET /api/v1/models` exposes display name/key, publisher, architecture, quantization, size, parameter count, loaded instances/config, context limits, format, and capabilities |
| Acquisition | `POST /api/pull` is a real model pull operation | No model-weight pull operation. `/model/new` registers an upstream deployment, is documented as beta, requires privileged gateway configuration, and may contain upstream credentials | `POST /api/v1/models/download` plus status polling downloads a model; `POST /api/v1/models/load` loads it with optional runtime parameters |

## Provider-specific contract recommended for approval

### Authentication

- Add `API key (optional)` to Ollama with `OLLAMA_API_KEY` environment
  precedence and the same never-return-a-secret boundary used by compatible
  runtimes.
- Explain in the field helper that a key is unnecessary for a local server and
  is used for direct `ollama.com` or an operator-configured authenticated proxy.
- Send credentials only to the validated configured origin, refuse redirects,
  and retain the explicit warning when an operator permits remote HTTP.

### Model acquisition

- Ollama: retain `Pull model` backed by `/api/pull`.
- LM Studio: expose `Download model` with bounded status polling. Show load
  state in discovered models; keep an explicit `Load` action out of the first
  slice because LM Studio can JIT-load on inference and load parameters require
  their own operator choices.
- LiteLLM: do not call `/model/new` from ordinary provider setup. Show a
  same-position `Manage models in LiteLLM` explanation plus Refresh. Registration
  belongs in a separately privileged gateway-administration feature because it
  can mutate upstream routing and receive provider secrets.

### Endpoint security

- Use one URL validator and request policy for all three providers: only HTTP/S,
  no URL credentials/query/fragment, normalize provider-specific paths, allow
  loopback HTTP, require explicit consent for non-loopback HTTP, refuse
  redirects, bound response/error bodies, and never expose stored secrets.
- Treat configured provider endpoints as operator-trusted destinations. Do not
  add a public/private DNS allowlist in G-076: legitimate Relay-to-LAN provider
  hosts resolve to private addresses, so such a rule would break the distributed
  topology G-057 was created to support. DNS pinning would also require a shared
  outbound transport rather than ordinary `fetch` and should be designed across
  every operator-configured connector, not improvised in Settings.

## Scope challenge and operator gate

### REDUCE

Unify labels/layout and autosave-before-test only. Keep basic ids and current
Ollama auth/security behavior. This is the smallest change, but it leaves the
known endpoint-validation, model-truth, and provider-metadata gaps open.

### PROCEED — recommended

Implement the shared form state machine and endpoint policy; optional Ollama
Bearer auth; rich discovery with graceful fallbacks; Ollama Pull; LM Studio
Download/status; and LiteLLM management guidance. This fulfills G-076 without
granting Relay LiteLLM administrator authority or adding a new generic network
security substrate.

### EXPAND

Also implement LiteLLM `/model/new`, LM Studio explicit load/unload tuning, DNS
resolution/pinning, and arbitrary authenticated reverse-proxy header schemes.
This crosses into gateway administration and a reusable outbound-network trust
layer, materially expanding privilege, state, and regression scope.

The operator approved **PROCEED** on 2026-07-15, including:

1. optional authenticated Ollama endpoints using a Bearer API key;
2. Ollama Pull, LM Studio Download, and LiteLLM guidance as the truthful
   provider-specific acquisition exceptions; and
3. retaining the existing operator-trusted-destination policy while making
   validation, remote-HTTP consent, redirect refusal, and credential handling
   consistent.

## Acceptance criteria

1. All three forms use the same field order, label grammar, helper hierarchy,
   Save/Test placement, status language, error placement, and responsive model
   and acquisition regions.
2. Test on a dirty form validates and saves once, tests only the returned
   persisted configuration, prevents duplicate activation, and leaves a later
   edit visibly dirty and untested.
3. Validation, persistence, connection, discovery, and acquisition failures are
   distinct, visible, named phases; stale success/models are cleared when the
   current test fails.
4. API responses never return a stored key. Blank secret fields preserve the
   saved/environment value; an explicit Clear removes only a saved key.
5. Non-loopback HTTP cannot be saved without explicit consent; disabling consent
   while such a URL remains configured is rejected atomically; all provider
   requests refuse redirects.
6. Each provider shows every safe metadata field it reports, preserving empty,
   partial, `false`, and zero values. A saved unavailable default remains visible
   and is identified as unavailable rather than silently replaced.
7. Ollama Pull and LM Studio Download/status work through explicit user actions;
   LiteLLM explains why model registration is managed at the gateway and offers
   model refresh in the same layout region.
8. Targeted schema/API/component matrices, deterministic local/LAN fixtures, a
   real local Ollama task, the real Next.js runtime-module graph, and Settings
   browser checks at 1440/944/390 in light/dark all pass without cursor-switching
   code or instructions.

## Verification record — 2026-07-15

- Endpoint/config, settings/runtime route, provider model, runtime/Chat, and
  shared-card matrices passed. The final focused review run covered 25 tests;
  the impacted matrix covered 107 tests.
- The clean full suite passed with **455 files, 3,494 tests, and 1 skipped**.
  TypeScript, token validation, critical API inventory, `git diff --check`, and
  the production build also passed. The build emitted only the existing broad
  file-tracing warnings around migration/data-dir scripts.
- `npm run test:runtime-graph` crossed the real Next.js module graph and ran a
  deterministic Ollama task plus compatible-runtime task/workflow/schedule
  paths. The smoke completed without the runtime-registry initialization cycle
  guarded by TDR-032.
- In-app Browser verification exercised the actual Settings workflow in light
  and dark at 1440, 944, and 390 pixels. A dirty invalid remote-HTTP endpoint
  failed during Save and did not probe; the restored loopback endpoint tested
  successfully and displayed three Ollama models with reported metadata.
  Provider cards and controls stayed contained at every viewport and the
  browser console remained free of warnings/errors. The existing mobile shell
  chrome overflow outside the provider region is not attributed to G-076.
- Browser artifacts are retained locally under `output/g076-provider-setup/`.
  Source inspection found no hand-cursor switching code or instructions in the
  affected surfaces.

Regression disposition: new pure policy/config tests protect endpoint and
secret handling; real-SQLite API tests protect atomic persistence and redaction;
provider fixtures protect rich-detail fallback and false/zero metadata;
component tests protect save-before-test, duplicate acquisition exclusion,
phase recovery, and provider-specific actions; existing runtime, Chat, routing,
usage, critical-route, full-suite, build, and real module-graph checks protect
the wider execution surface.

## NOT in scope for the recommended contract

- LiteLLM upstream registration or provider-secret collection.
- LM Studio load/unload parameter tuning.
- A generic arbitrary OpenAI-compatible provider marketplace.
- DNS allowlisting/pinning for every operator-configured outbound connector.
- Claims that a configured runtime is local, private, free, or offline based
  only on its provider identity.

## Authoritative references

- Ollama authentication: https://docs.ollama.com/api/authentication
- Ollama list models: https://docs.ollama.com/api/tags
- Ollama pull: https://docs.ollama.com/api/pull
- Ollama network configuration: https://docs.ollama.com/faq
- LiteLLM model management: https://docs.litellm.ai/docs/proxy/model_management
- LiteLLM virtual keys: https://docs.litellm.ai/docs/proxy/virtual_keys
- LM Studio REST API: https://lmstudio.ai/docs/developer/rest
- LM Studio list models: https://lmstudio.ai/docs/developer/rest/list
- LM Studio download: https://lmstudio.ai/docs/developer/rest/download
- LM Studio load: https://lmstudio.ai/docs/developer/rest/load
- LM Studio authentication: https://lmstudio.ai/docs/developer/core/authentication
