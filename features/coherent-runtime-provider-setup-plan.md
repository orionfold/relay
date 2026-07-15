# G-076 implementation plan

Authoritative specification: `features/coherent-runtime-provider-setup.md`
Architecture impact: `features/coherent-runtime-provider-setup-architect-report.md`
Decision: PROCEED approved by the operator on 2026-07-15

## Scope challenge result

- **REDUCE:** UX/autosave consistency only. Rejected because it would leave the
  known endpoint-validation, auth, metadata, and acquisition-truth gaps open.
- **PROCEED (approved):** one setup state grammar, common endpoint protections,
  optional Ollama Bearer auth, rich discovery with fallbacks, Ollama Pull, LM
  Studio Download/status, and LiteLLM management guidance.
- **EXPAND:** LiteLLM admin registration, LM Studio load tuning, and shared DNS
  pinning. Deferred because these add materially different privilege and trust
  boundaries.

## What already exists

- Compatible-runtime URL normalization, remote-HTTP consent, environment/saved
  secret precedence, redacted responses, redirect refusal, typed errors, and
  discovery-cache invalidation.
- Ollama settings, tags, Pull, Chat/task execution, model resolution, and a real
  configured-endpoint smoke harness.
- Runtime-specific model discovery and deterministic LiteLLM/LM Studio fixture
  coverage from G-069.
- Calm Ops cards, semantic status tokens, accessible shadcn controls, and
  responsive Settings layout primitives.

## NOT in scope

- LiteLLM `/model/new` or upstream provider-secret collection: ordinary runtime
  credentials do not imply gateway-admin authority.
- LM Studio load/unload tuning: JIT inference remains available and load
  parameters need a separate product contract.
- Arbitrary OpenAI-compatible provider registration: TDR-041 retains explicit
  product identities.
- DNS allowlisting/pinning: legitimate LAN endpoints use private DNS; a correct
  pinned transport must be designed across all outbound integrations.
- Provider-name-based claims of locality, privacy, zero infrastructure cost, or
  offline operation.

## Specification and acceptance mapping

| Acceptance criterion | Implementation slice | Protecting evidence |
|---|---|---|
| AC1 shared field/action/layout grammar | Shared provider setup card and provider capability definitions | Component provider matrix + browser parity |
| AC2 dirty Test saves first | Explicit dirty/saving/testing/discovering state machine | Ordered fetch assertions, duplicate activation guard, browser edit→Test |
| AC3 phase-specific visible failures | Named UI phases and bounded route errors | Validation/save/test/discovery/acquisition matrix |
| AC4 secret preservation/redaction | Ollama key/source settings plus existing compatible boundary | Real SQLite route tests and blank-field browser check |
| AC5 endpoint policy | Shared URL validator/request options and atomic writes | Pure URL matrix, route tests, source guard, LAN fixture |
| AC6 truthful model detail/default | Normalized model-detail envelope with provider adapters/fallbacks | Complete/partial/false/zero fixtures and unavailable-default UI test |
| AC7 truthful acquisition | Ollama Pull, LM Studio Download/status, LiteLLM guidance | Route capability matrix and component actions |
| AC8 broad verification | Targeted tests, static guards, real runtime graph/task, browser matrix | Recorded commands/artifacts in the spec |

## Vertical slices

### 1. Endpoint/configuration foundation

- Add Ollama API-key and insecure-remote setting keys.
- Extract a provider-neutral URL/header/request-options leaf used by Ollama and
  the compatible transport while preserving existing public error classes.
- Add a server-only Ollama configuration reader with environment-over-saved
  secret precedence and redacted response mapping.
- Route every production Ollama Base URL/auth read through that configuration;
  retain function-local dynamic imports where registry adjacency requires them.
- Add pure/config tests and a source guard against raw production URL fetches.

Checkpoint: provider endpoint/config tests, Ollama model resolver tests, and
existing compatible transport tests pass.

### 2. Typed settings and provider-management APIs

- Make Ollama GET/PUT (plus legacy POST alias) match the compatible redacted
  settings response and atomically validate the whole proposed form.
- Normalize Ollama tags and compatible discovery into one safe model envelope.
- Add best-effort LiteLLM `/model/info` enrichment and LM Studio native-v1 model
  enrichment with basic `/v1/models` fallback plus a non-fatal metadata warning.
- Retain Ollama Pull with auth/redirect/timeout protections.
- Add LM Studio Download and bounded status polling endpoints; reject the same
  action for LiteLLM.
- Invalidate Chat discovery only after successful persistence/acquisition.

Checkpoint: settings and runtime route contracts pass against real SQLite and
provider fixtures, including malformed JSON, invalid runtime/action, redaction,
remote HTTP, redirects, provider refusal, partial data, and zero values.

### 3. Shared Settings workflow

- Replace divergent card internals with a shared capability-driven setup card.
- Keep provider-specific identity, copy, icon, API URLs, and acquisition action.
- Implement dirty/untested, saving, testing, discovering, connected, and failed
  states with one in-flight guard and phase-specific errors.
- Test on dirty form saves exact values first; save failure prevents Test.
- Render default model availability and safe provider metadata in a dense,
  responsive model list; preserve false/zero metadata.
- Render Ollama Pull, LM Studio Download/status, and LiteLLM guidance/Refresh in
  the same acquisition slot.

Checkpoint: component matrix passes clean Test, dirty Test, invalid/save/test/
discovery/acquisition failure, duplicates, secret clearing, later edits, empty
models, unavailable defaults, and complete/partial model detail.

### 4. Runtime and customer-path verification

- Run targeted tests followed by impacted Settings/Chat/runtime suites, token
  validation, TypeScript, critical API inventory, and production build as risk
  warrants.
- Start a fresh dev server on a free port and run `npm run test:runtime-graph` so
  a real task crosses the modified registry-adjacent path. Use the configured
  local Ollama mode when available and record runtime/task ids without endpoint
  secrets.
- Exercise deterministic LiteLLM/LM Studio local/LAN fixtures for success and
  failure. Do not claim an unavailable external three-host environment.
- Use the in-app Browser first to verify Settings in light/dark at 1440, 944,
  and 390 pixels, keyboard operation, live/error states, no overflow, and the
  system-cursor rule. Save evidence under `output/`.

Checkpoint: no module-load cycle, missing-tools error, secret leak, cursor
switching code, or acceptance gap remains.

### 5. Ship verification and closure

- Run a fresh diff review and AC-by-AC product-manager ship verification.
- Update the spec verification section/status, TDR references, changelog, and
  G-076 backlog state without disturbing unrelated strategy changes.
- Stage and locally commit only G-076-owned Relay changes under the standing
  goal-completion permission; do not push or release.

## Regression test budget

- Endpoint/config leaf: approximately 18 table cases covering empty/malformed,
  schemes, credentials/query/fragment, loopback variants, remote HTTP consent,
  path normalization, auth headers, redirect/manual, and error bounds.
- Settings/API: approximately 20 cases covering three runtimes, atomic writes,
  blank-preserve versus explicit clear, environment secrets, malformed JSON,
  unknown fields/actions, metadata fallback, acquisition progress/failure, and
  cache invalidation.
- Components: approximately 16 cases covering the full state and provider
  capability matrix, including false/zero detail and responsive semantics.
- Broader guards: existing compatible transport/engine, Ollama resolver/engine,
  execution-target, provider summary, critical routes, model discovery, runtime
  graph, token validation, TypeScript, build, and browser evidence.

Exact initial commands:

```bash
npx vitest run src/lib/agents/runtime/__tests__/provider-endpoint.test.ts \
  src/lib/agents/runtime/__tests__/ollama-config.test.ts \
  src/lib/agents/runtime/__tests__/openai-compatible.test.ts \
  src/lib/agents/runtime/__tests__/ollama-model-resolver.test.ts
npx vitest run src/app/api/settings/ollama/__tests__/route.test.ts \
  src/app/api/settings/openai-compatible/[runtimeId]/__tests__/route.test.ts \
  src/app/api/runtimes/ollama/__tests__/route.test.ts \
  src/app/api/runtimes/openai-compatible/[runtimeId]/__tests__/route.test.ts
npx vitest run src/components/settings/__tests__/provider-setup-card.test.tsx \
  src/components/settings/__tests__/ollama-section.test.tsx \
  src/components/settings/__tests__/openai-compatible-section.test.tsx
npx tsc --noEmit
npm run validate:tokens
npm run test:runtime-graph
npm run build
```

## Error & Rescue Registry

| Failure | Visible outcome | Rescue |
|---|---|---|
| Validation/persistence fails | Phase-named alert; no probe | Keep form dirty; repair input/storage and retry |
| Connection succeeds but detail endpoint fails | Connected with basic models and metadata warning | Preserve `/models` results; do not fabricate details |
| Provider list is empty | Connected, explicit zero-model state | Keep saved unavailable default visible; show acquisition guidance |
| Pull/download fails or stalls | Acquisition error/status; controls recover | Bound time/poll count; retain prior model list and allow retry |
| Secret environment override | Presence/source only; no clear action | Explain environment ownership; never write or reveal it |
| Module-load cycle via Chat-tools import | First real task fails before dispatch | Replace static import with function-local `await import()` per TDR-032 and rerun real smoke |
| Shared UI accumulates provider branches | Readability/coverage degrades | Split capability adapters while retaining shared primitives/state grammar |
| External LAN/provider unavailable | Explicit external boundary | Use deterministic local fixture and real local Ollama; do not claim customer topology |

## Rollback

The change is additive to key/value settings and API payloads. Roll back the
shared card/config modules and restore the two prior components/routes; remove
the two new Ollama setting keys. No schema migration or stored-data rewrite is
required, and unknown retained settings remain harmless.
