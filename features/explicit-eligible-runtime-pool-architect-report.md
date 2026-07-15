# Architecture impact review — G-077

Date: 2026-07-15
Status: high-impact review complete; PROCEED contract approved 2026-07-15
Classification: high — Settings policy, runtime resolution, health probing,
dispatch receipts, history UX, and runtime-registry-adjacent imports

## Existing patterns to reuse

- TDR-006 and `runtime/catalog.ts` own the seven stable runtime identities and
  capability flags.
- `runtime-setup.ts` already separates configured state from provider identity.
- `resolveTaskExecutionTarget()` already owns strict explicit selection,
  profile/capability filters, availability checks, model resolution, and
  automatic launch exclusions. The pool belongs at this boundary rather than
  in adapters or provider forms.
- The execution-target preview contract already transports selection mode and
  reason to task/workflow forms.
- `agent_logs` plus task run history already form a durable semantic receipt
  surface. A `runtime_selected` event avoids adding duplicate task columns.
- The Providers & runtimes bento, semantic status tokens, shared form controls,
  and `surface-*` utilities cover the Settings UI without a new design system.
- G-076's configuration grammar and model-detail envelope can supply truthful
  configured model ids and provider-reported cost metadata when present.

## Architectural drift to remove

- `providers-runtimes-section.tsx` treats policy selection as a provider setup
  macro and rewrites auth/model/Chat defaults. It also infers Manual mode from
  subsequent provider edits. This crosses ownership boundaries and makes the
  saved routing preference an unreliable audit record.
- `routing-recommendation.ts` recommends provider configuration rather than an
  execution target and has no representation for LiteLLM or LM Studio.
- `router.ts` assigns provider-identity cost/latency/quality scores that are not
  supported for operator-configured endpoints and models.
- `execution-target.ts` hard-codes the Manual default and considers every
  configured runtime in automatic mode.
- The providers Settings response probes one runtime specially instead of
  exposing an all-runtime, bounded health snapshot.

## Blast radius

| Layer | Required impact |
|---|---|
| Settings data | Add versioned `routing.policy`; defensive parser/default/migration; preserve `routing.preference` for compatibility |
| Settings API | Zod-validated atomic read/write for preference + policy; return normalized policy, repair state, runtime rows, and preview |
| Runtime ranking | Replace provider-name score tables with hard filters, affinity, comparable evidence, and stable saved-order tie-breaking |
| Execution resolution | Intersect automatic candidates with eligible ids; strict configurable Manual default; preserve explicit/profile/model precedence; record skipped reasons |
| Health | TTL-cached `Promise.allSettled` snapshot across configured runtimes with bounded per-runtime errors and no global load failure |
| Dispatch/history | Emit `runtime_selected`; retain launch/fallback events; label and bound receipt detail in task history |
| Settings UI | Extract a focused routing-policy editor; remove forward/reverse provider cascade; show all runtime states and preview order |
| Tests/smoke | Pure policy/ranker, real-SQLite API, resolver matrix, dispatch/history receipts, component accessibility, runtime graph, configured local-provider tasks, browser parity |

No database schema migration is required. Settings are key/value rows and the
existing log table is the durable receipt store. Existing callers that read
only `routing.preference` remain compatible while execution reads the combined
normalized policy.

## Dependency trace

```text
routing.policy parser + ranking evidence
  -> routing Settings API
  -> all-runtime health/view model
  -> Settings routing editor + preview
  -> resolveTaskExecutionTarget
  -> task dispatch runtime_selected receipt
  -> task run history + Monitor
```

`execution-target.ts` imports the runtime registry and adapters. Any health or
settings import introduced into this graph must avoid eager cycles. Settings
or Chat dependencies that reach back into runtime adapters must use a
function-local dynamic import, followed by a real task under `npm run dev`, per
TDR-032 and the repository smoke-test budget.

## Data and trust boundaries

- The pool is an operator policy, not proof of configuration, health, privacy,
  pricing, or capability. Persist ids only; compute current status at read and
  execution time.
- Provider configuration remains owned by provider Settings APIs. Routing may
  link to repair those settings but may not write them.
- Health probes use existing server-only credential resolution and validated
  endpoint transports. Routing responses return no secrets or raw upstream
  bodies.
- Provider model metadata is untrusted optional evidence. Accept only finite,
  safe pricing values through the existing normalized envelope; absent or
  incomparable values remain unknown.
- Execution rechecks launchability. A Settings preview is advisory and must
  state its observation time; it is never a lease on runtime health.
- Receipt payloads are bounded, contain ids/reasons rather than secrets, and
  remain readable even if provider configuration changes later.

## Failure and concurrency audit

- Missing policy: serve the documented v1 default; persist on the next routing
  mutation.
- Corrupt or unsupported policy: use a conservative normalized state, flag the
  repair visibly, and never silently add a runtime beyond the documented v1
  default.
- Concurrent Settings edits: update preference and policy in one DB transaction
  and return the committed representation. A stale response cannot be shown as
  saved after a newer request.
- Health timeout/error: mark only that runtime unavailable with a named reason;
  do not reject the complete Settings response.
- Configuration drift after preview: execution recomputes candidates and the
  receipt records why the previewed candidate was skipped.
- Empty automatic pool: disable/guard save only if desired for immediate UX,
  but the server and executor must still reject it visibly because corrupt or
  concurrent state can bypass the client.
- Manual default removed or unconfigured: keep the saved id visible and fail
  strictly until the operator changes or repairs it.
- Launch race after a healthy probe: automatic fallback may try the next saved
  candidate once; explicit and Manual targets remain strict.

## Architecture decision

TDR-043 records these approved invariants:

1. routing preference and eligible pool are policy; provider setup is separate;
2. explicit targets and Manual defaults are strict, automatic fallback is
   bounded by the pool;
3. provider identity never substitutes for cost/latency/quality evidence;
4. current configuration/compatibility/capability/health are computed at
   execution, not persisted as policy; and
5. every selection and skip is represented in a durable semantic receipt.

## Rescue and rollback

- If all-runtime probes make Settings slow or flaky, return setup state
  immediately and load cached/refreshed health through a separate endpoint;
  do not restore an Ollama-only special case.
- If comparable cost metadata cannot be joined to the configured model without
  ambiguity, mark cost evidence unknown and use affinity + saved order rather
  than guessing.
- If routing/editor state makes the existing provider component conditional and
  brittle, extract the routing bento as a separately tested component instead
  of expanding the monolith.
- If a runtime module cycle appears, move settings/health dependencies behind
  function-local dynamic imports and rerun the real task smoke.
- Rollback can stop reading `routing.policy` and remove the editor while leaving
  the inert key/value row and `runtime_selected` logs harmlessly readable.

## Verification inventory

| Risk | Lowest reliable guard | Broader evidence |
|---|---|---|
| Policy parsing/migration | Pure version/corruption/order/id matrix | Real-SQLite API round trip |
| Precedence/filtering | Seven-runtime ranker + resolver tables | Real configured-provider task smokes |
| Unknown optimization evidence | Known/unknown cost, latency, quality fixtures | Browser preview copy inspection |
| Health fan-out | all-settled timeout/cache/error tests | Dev Settings load with mixed endpoints |
| No provider cascade | API call assertions in routing component tests | Browser preference change and provider-state check |
| Durable explanation | dispatch + history semantic-event tests | Task detail receipt/Monitor parity |
| Responsive/accessibility | roles, labels, keyboard, focus tests | 1440 and 390px light/dark browser checks |
| Module-cycle safety | type/build + runtime graph | Real task under Next.js dev server |
