# G-057 — Distributed Ollama diagnostic

**Status:** completed — not reproduced on the available local topology; customer topology unavailable
**Started:** 2026-07-14
**Closed:** 2026-07-14
**Baseline:** Relay `0.40.0` at `bfccccb09c3c`

## Goal contract

- **Outcome:** distinguish browser-client → Relay, Relay → Ollama, model,
  profile/capability, and requested/effective-target failures in the reported
  three-host topology without treating a Claude fallback as success.
- **Constraints:** one reporter topology and one compatible workflow per packet;
  redact host details and credentials; do not change firewall, bind address,
  Ollama configuration, or profile capabilities without approval.
- **Executable verification:** Settings Save/Test and model discovery; direct
  Relay-host probes to Ollama; isolated Chat/task/workflow execution with
  persisted `requested = effective = ollama`; missing-model and compatibility
  refusal controls; client-host UI/API reachability.
- **Operator gates:** customer/reporter coordination and credentials; any network
  or server-configuration change; public trust/cost/privacy messaging.
- **Stop/rescue:** if the actual topology is unavailable after the code audit and
  local controls, retain the reusable redacted diagnostic and close with an
  explicit local-only disposition; do not infer a customer-network fix from
  loopback evidence.

## Topology and code path

```text
browser client
  -> Relay origin /api/settings/ollama and /api/runtimes/ollama
  -> Relay server process reads ollama.baseUrl
  -> Relay server fetches <baseUrl>/api/tags and <baseUrl>/api/chat
  -> selected model and requested/effective runtime persist with the run
```

The browser does not fetch Ollama directly. `OllamaSection` calls same-origin
Relay routes, and the route/runtime modules perform the Ollama HTTP requests.
Browser CORS is therefore not the Relay → Ollama boundary. The configured Base
URL is shared by model discovery, connection testing, Chat, tasks, and workflow
child tasks.

## Evidence collected

### Local control — not the customer topology

- Host: macOS arm64, not the required Linux VM/server.
- Relay listened on port 3000; Ollama `0.31.2` listened only on
  `127.0.0.1:11434`.
- The configured endpoint classified as loopback. Relay Settings and runtime
  discovery reported a reachable Ollama with three pulled models.
- The deterministic transport control passed task, workflow, and Chat through
  a real isolated Next process with `requestedRuntimeId = ollama`,
  `effectiveRuntimeId = ollama`, and `stream.completed`.
- The configured-endpoint mode then ran the same isolated task, compatible
  sequence workflow, and Chat against the real local Ollama process. All three
  completed with `requested = effective = ollama`; no fallback was present.
- A first Chat run deliberately exposed a stale fixture model id and received a
  visible Ollama 404 `model not found` error. Correcting the diagnostic to use
  the selected configured model returned the path to green. This is a named
  model-selection control, not evidence of the reported distributed failure.

The runtime smoke now accepts an opt-in
`RELAY_RUNTIME_SMOKE_OLLAMA_BASE_URL` plus optional
`RELAY_RUNTIME_SMOKE_OLLAMA_MODEL`. Its receipt reports only endpoint class,
model, runtime ids, durable object ids, and Chat termination; it does not print
the configured host URL or response content. The default deterministic fixture
remains unchanged.

## Confirmed findings

1. **The architecture already permits a remote Ollama URL.** All relevant
   requests originate in Relay's server process; no browser-to-Ollama CORS
   dependency exists.
2. **The Settings write boundary is weak.** The Ollama settings route accepts
   unvalidated `baseUrl` and `defaultModel` strings. URL normalization, scheme
   policy, trailing-slash handling, redaction, and a named error taxonomy are not
   centralized.
3. **Connection errors are not yet classified to the G-057 contract.** Current
   routes generally return a raw fetch message or `connected: false`; DNS,
   refusal, timeout, authentication, missing model, malformed response, and
   upstream failures do not share typed stable reason codes.
4. **Provider-summary model truth can drift.** With no persisted Ollama default,
   `/api/settings/ollama` truthfully returned an empty default while
   `/api/settings/providers` synthesized `llama3`. Actual runtime resolution may
   choose the first pulled model instead. This confirmed truth gap is added to
   G-056.
5. **Local/private/free language is conditional, not provider identity.** The
   UI, usage comments, and public trust/docs repeatedly describe Ollama as
   localhost-only, private, free, and `$0` even though Relay accepts a remote
   Base URL. The current ledger correctly represents zero per-token provider
   billing, but that does not prove zero infrastructure cost or no network
   egress. Public copy changes remain an operator gate.
6. **The reported `document-writer` message is a capability refusal, not an
   Ollama network result.** The profile declares Ollama in `supportedRuntimes`
   but also allows `Read`, `Write`, and `Edit`; target resolution interprets
   those tools as a filesystem requirement, while the Ollama catalog entry has
   no filesystem tools. Ollama is therefore filtered after the supported-runtime
   check, yet the resulting message lists Ollama among the expected runtimes and
   does not name the missing filesystem capability. G-056 must make this refusal
   truthful before execution. The compatible local G-057 control tested the
   execution path independently.
7. **`Manual` currently means “skip auto-routing and use the default,” not “use
   the provider I was looking at.”** The router records exactly that reason.
   The reporter's Manual → Claude observation can therefore be an ambiguous UI
   contract rather than evidence that an explicit Ollama target was ignored.
   G-056 owns the preflight and explicit rescue choice. Any future customer
   packet must record whether Ollama was actually requested.

## Future customer-environment evidence packet

Record without exposing credentials or full private addresses:

- Relay version/commit, Linux/VM distribution and network mode, Relay bind
  hostname, browser/OS, Ollama version, selected model, profile, and workflow.
- Redacted client → Relay host/port plus UI and API reachability.
- Redacted Relay → Ollama host/port plus `/api/tags` and a minimal `/api/chat`
  response initiated on the Relay host.
- Saved Base URL classification, Settings Test result, selected/default model,
  and whether the model is actually present on Ollama.
- Compatible task/workflow/Chat ids, persisted status/error, requested/effective
  runtime/model, agent logs, Chat termination reason, and absence/presence of
  fallback fields.
- Controls for the intentional incompatible-profile refusal and the reported
  Manual → Claude behavior.

## Acceptance verification and disposition

| Criterion | Result | Evidence |
|---|---|---|
| Separate browser → Relay from Relay → Ollama | PASS | Code-path audit confirms browser uses same-origin Relay APIs and Relay performs Ollama HTTP calls. |
| Exercise a compatible Ollama Chat/task/workflow without fallback | PASS | Deterministic and real local Ollama controls completed with `requested = effective = ollama` and terminal Chat state. |
| Retain missing-model and incompatible-profile controls | PASS | A stale model produced a visible Ollama 404; `document-writer` was identified as a filesystem-capability refusal rather than a network failure. |
| Test the reported Manual → Claude behavior | PASS | Router audit confirms Manual intentionally uses the configured default; the target-truth UX gap is assigned to G-056. |
| Run the reporter's three-host customer topology | OUT OF SCOPE | Relay has no access to the customer environment and no equivalent three-host environment is available on this machine. The operator explicitly approved local closure. |

**Final disposition: not reproduced locally; external topology unverified.** The
available code audit, deterministic fixture, and real loopback Ollama all pass.
No customer-network cause or speculative network fix is asserted. Confirmed
target-selection, capability-message, provider-summary, endpoint-validation,
and trust-copy findings remain routed to G-056 and the subsequent runtime
series. The redacted configured-endpoint smoke remains available if equivalent
evidence becomes accessible later; that would be new diagnostic work, not a
condition for reopening this completed goal.
