# Architecture impact review — G-076

Date: 2026-07-15
Status: capability review complete; contract decision pending
Classification: high — Settings, API, transport/security, runtime resolution, Chat discovery, and provider management

## Existing patterns to reuse

- TDR-006's explicit runtime identities and capability catalog remain unchanged.
- TDR-041 already keeps LiteLLM and LM Studio identities separate while sharing
  their OpenAI-compatible inference transport.
- `normalizeCompatibleBaseUrl()` provides the strongest current endpoint
  validation and `request()` already refuses redirects before credentials can
  be forwarded.
- Compatible-runtime settings already implement environment-over-saved secret
  precedence, response redaction, atomic remote-HTTP validation, and dynamic
  model-discovery cache invalidation.
- Existing `Card`, form controls, semantic status tokens, `surface-*` utilities,
  and responsive grids cover the UI without a new visual pattern.
- The deterministic compatible-runtime fixture and configured-endpoint Ollama
  smoke provide the real module-graph and server-origin network harnesses.

`ConnectionTestControl` is too state-local to reuse unchanged: G-076 needs one
dirty/saving/testing/discovering/acquiring state machine, phase-specific errors,
discovered-model payloads, and duplicate-activation prevention. Its status icon
grammar can be retained in a richer shared control.

## Blast radius

| Layer | Current surfaces | Required contract impact |
|---|---|---|
| Settings data | `SETTINGS_KEYS`, settings helpers, Chat settings tool allowlist | Add Ollama API-key and remote-HTTP settings; validate through one server-only configuration boundary; keep secrets non-readable through Chat |
| Settings API | Ollama POST route; compatible GET/PUT/DELETE route | Typed strict payloads and one redacted response grammar; atomic validation before writes; explicit saved-secret clearing |
| Provider API | Ollama tags/pull route; compatible discovery route | One model-detail envelope; phase errors; redirect refusal; LM Studio native detail/download/status; LiteLLM detail fallback |
| Runtime transport | Ollama adapter, model resolver, Chat engine/discovery, execution-target resolver | Every Ollama caller must consume the same normalized config and auth headers; no raw Base URL reads may bypass policy |
| Frontend | Ollama card and compatible-runtime cards | Shared field/action/state/model/acquisition primitives while preserving provider copy and capability exceptions |
| Tests/smoke | route, component, transport, runtime-graph, configured Ollama fixtures | Provider matrix plus dirty-form sequencing, redaction, remote HTTP, metadata, acquisition, fallback, and real runtime evidence |

No database migration is required because settings are key/value rows and run
receipts already store runtime/provider/model identity. Runtime catalog IDs and
execution capability flags do not change.

## Dependency trace

```text
shared provider endpoint/config contract
  -> settings read/write responses
  -> Ollama adapter + Chat + task model resolution + discovery + pull
  -> compatible transport + discovery
  -> provider-detail/acquisition routes
  -> shared Settings form state and model presentation
  -> Chat model-discovery cache invalidation
```

The runtime registry imports the affected Ollama and compatible adapters. Any
transport refactor therefore requires a real Next.js task smoke even if unit,
type, and build checks pass, per TDR-032 and the repository smoke budget.

## Security boundary audit

### Preserve and align

- Accept only HTTP/S endpoints.
- Reject URL credentials, query strings, and fragments.
- Permit loopback HTTP by default; require explicit consent for non-loopback
  HTTP and warn when a credential would travel in cleartext.
- Refuse all endpoint redirects and bound provider error text.
- Resolve credentials server-side with environment precedence and return only
  presence/source metadata.
- Ensure provider-management requests use the same validated origin and auth
  boundary as discovery and inference.

### Explicit non-goal requiring broader architecture

There is no existing DNS pinning substrate. Blocking private DNS answers is
incompatible with intended LAN Ollama/LM Studio/LiteLLM hosts, while resolving
and checking without pinning the actual socket does not prevent rebinding. A
correct solution would require one outbound transport shared by runtime,
connector, webhook, and publisher destinations, with an operator-visible trust
policy. It should not be simulated by a pre-fetch lookup inside G-076.

### Proposed architecture record after approval

If the recommended contract is approved, create TDR-042 for capability-driven
provider setup and operator-trusted endpoints. It should codify:

- common configuration and state grammar does not imply identical provider
  management capabilities;
- management writes are capability-specific and explicit;
- ordinary runtime credentials do not imply gateway-administrator authority;
- operator-configured provider destinations are trusted, but URL, cleartext,
  redirect, and secret-forwarding rules are enforced uniformly.

## Executable acceptance evidence inventory

| Requirement | Lowest reliable guard | Broader evidence |
|---|---|---|
| URL normalization and remote-HTTP policy | Pure table-driven config tests across all three providers | Disposable LAN-address fixture |
| Secret precedence/redaction/clear | Settings route tests with real SQLite settings | Browser verifies blank secret field and source label |
| Dirty Test saves first | Shared state-machine/component tests asserting ordered requests and exact returned config | Browser edit → Test without Save |
| Save failure blocks Test | Component test with failed persistence and zero probe calls | Browser invalid remote HTTP |
| Phase-specific failures | Route + component matrices for validation/persistence/connection/discovery/acquisition | Browser visible alerts and stale-state clearing |
| Complete/partial/zero metadata | Provider fixtures and presentation tests | Browser populated model cards at three widths |
| Unavailable saved default | Component model-state test | Browser retained default with unavailable badge/text |
| Ollama Pull | Route contract including auth, redirect, duplicate request, upstream error | Real local Ollama pull is optional to avoid a large network download; deterministic fixture is required |
| LM Studio Download/status | Native-v1 fixture including already-downloaded, progress, completion, failure, and timeout | Disposable LM Studio server if available; otherwise official-shape fixture plus visible external boundary |
| LiteLLM management exception | Capability matrix test proves no registration mutation route | Browser guidance + refresh only |
| Runtime callers share config/auth | Source guard against raw Ollama Base URL reads outside the config module | Real Ollama Chat/task plus runtime-module-graph smoke |
| Responsive/theme/accessibility | Component roles/live-region tests | Browser light/dark at 1440/944/390, keyboard, no overflow, system cursor |

## Rescue conditions

- If LM Studio native v1 is unavailable, fall back to OpenAI-compatible model
  ids and show model management as unavailable; never report fabricated detail.
- If LiteLLM `/model/info` is missing or forbidden, keep successful `/v1/models`
  discovery and identify metadata as unavailable; a detail failure must not turn
  a healthy runtime into a false connection failure.
- If the shared state abstraction becomes provider-conditional throughout,
  retain shared primitives and split provider capability adapters rather than
  forcing one monolithic component.
- If a runtime-module import cycle appears, move Chat/settings imports behind
  function-local dynamic imports and rerun the real task smoke.
