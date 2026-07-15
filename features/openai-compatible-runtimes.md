# LiteLLM and LM Studio runtimes (G-069)

Status: completed locally; external three-host topology unverified
Date: 2026-07-14
Owner: Relay runtime system

## Outcome

Relay can connect from its server process to separately configured LiteLLM and
LM Studio endpoints, discover models, and run Chat, tasks, workflow steps, and
scheduled firings without hiding which runtime and model actually executed.
The two product identities share a narrow OpenAI Chat Completions transport;
they are not presented as interchangeable providers.

## Scope decision

- **REDUCE:** settings plus task-only execution. Rejected because it would leave
  Chat and model selection inconsistent with the runtime catalog.
- **PROCEED (selected):** two explicit runtimes, one shared transport, safe
  settings, live model discovery, streamed Chat, task execution, and receipts
  inherited by workflow and schedule tasks.
- **EXPAND:** arbitrary OpenAI-compatible providers, provider marketplace,
  provider-specific SDKs, MCP/tool parity, and endpoint auto-detection. Deferred
  because each broadens identity, trust, and capability claims beyond G-069.

## Functional contract

### Runtime identity

- Runtime IDs are `litellm` and `lmstudio`; provider IDs remain the same names.
- Model selector IDs are namespaced as `litellm:<model>` and
  `lmstudio:<model>` so identical upstream model names cannot collide.
- Requests strip only the Relay namespace. The effective model returned by the
  endpoint is recorded when present; otherwise Relay records the requested
  endpoint model.
- An explicit compatible-runtime selection never falls back to another runtime
  or model. Named configuration, connection, HTTP, protocol, and empty-response
  failures are shown to the operator.

### Configuration and security

- Defaults are `http://localhost:4000/v1` for LiteLLM and
  `http://localhost:1234/v1` for LM Studio.
- Only `http:` and `https:` URLs are accepted. User info, query strings, and
  fragments are rejected. A missing path is normalized to `/v1`; an explicit
  path is preserved.
- Plain HTTP is allowed automatically only for loopback. A non-loopback HTTP
  endpoint requires the operator to enable an explicit insecure-remote switch.
- Requests originate on the Relay server. The UI says this directly so a
  browser client on another host is not mistaken for the network origin.
- API keys remain server-side. Environment variables `LITELLM_API_KEY` and
  `LMSTUDIO_API_KEY` override saved settings. API responses expose only
  `hasApiKey` and the source, never the secret.
- Authentication is optional because both deployments can be intentionally
  unauthenticated. The UI warns rather than claiming that absence of a key is
  secure.

### Models and execution

- Model discovery uses `GET <base>/models` and accepts the OpenAI-compatible
  `{ data: [{ id }] }` shape. Empty and malformed lists are named failures for
  execution and an empty picker state for discovery.
- Chat and task execution use `POST <base>/chat/completions`.
- Chat uses SSE streaming and requires a `[DONE]` terminal marker. Empty terminal
  streams, malformed events, disconnects, and HTTP failures fail visibly and
  reconcile the placeholder message.
- Tasks use a non-streaming completion. The first assistant text response is the
  task result. Tool calls are explicitly rejected with a capability error in
  G-069; cross-provider tool-loop parity is owned by G-072.
- Resume, profile assist/tests, filesystem/Bash, MCP servers, and plugin MCP are
  not advertised for these runtimes.

### Usage and cost truth

- Token usage comes only from the endpoint response.
- LiteLLM's optional `x-litellm-response-cost` header is recorded only when it
  is a finite, non-negative numeric value. Otherwise cost is unknown.
- LM Studio cost is always recorded as unknown; Relay never infers zero cost,
  locality, privacy, or offline operation from the runtime name.
- Ledger rows carry task/workflow/schedule/project linkage plus runtime,
  provider, effective model, usage completeness/source, and cost provenance.

## Acceptance criteria

1. Settings can save, load, test, and clear each endpoint independently without
   returning secrets; unsafe remote HTTP is rejected until explicitly enabled.
2. Model discovery adds namespaced LiteLLM and LM Studio choices without
   duplicating an existing model ID.
3. Explicit Chat selections stream, persist, reconcile, and write requested /
   effective runtime-model metadata without fallback.
4. Explicit task execution completes or fails visibly, and workflow/schedule
   task rows produce correctly linked usage receipts.
5. Contract tests cover auth, alias/effective model, usage/cost truth, malformed
   responses, empty output, common HTTP errors, abort/disconnect, and tool-call
   refusal.
6. The runtime module graph loads under a real Next.js dev server and a real
   task executes against a deterministic compatible fixture.
7. Settings receives browser verification in light and dark themes. No cursor
   switching style or instruction is introduced.

## External verification boundary

The deterministic fixture proves loopback and non-loopback policy behavior on
this machine. A real three-host customer LAN remains environment-specific and
is not represented as completed without access to that topology.

## Verification — 2026-07-14

- Transport, target, catalog, Settings, Chat, and receipt regressions passed,
  including redirects, timeouts, secret precedence/redaction, malformed and
  empty responses, strict no-fallback targeting, SSE terminal semantics, tool
  refusal, and provider-specific cost truth.
- The real Next.js runtime-module-graph smoke executed a LiteLLM task, an LM
  Studio workflow, an LM Studio scheduled firing, and Chat on both runtimes
  against a deterministic local OpenAI-compatible fixture. Five linked usage
  receipts preserved runtime/provider/model identity; only LiteLLM recorded its
  reported cost.
- Settings passed real-browser checks in light and dark themes. Controls retain
  the system cursor and communicate that requests originate on the Relay
  server.
- The exact PR quality profile passed all 16 planned lanes in 96.94 seconds:
  427 default files, 3,301 passing tests plus one intentional skip; 40.49% line
  and 34.58% branch coverage across 977 eligible files; all 11 risk-surface
  ratchets; real runtime graph; and 7/7 required mutation kills plus the known
  survivor control. The production Next.js build also passed.

## Authoritative references

- LiteLLM proxy documentation: https://docs.litellm.ai/docs/simple_proxy
- LiteLLM documentation home: https://docs.litellm.ai/
- LM Studio OpenAI compatibility: https://lmstudio.ai/docs/developer/openai-compat
- LM Studio model listing: https://lmstudio.ai/docs/developer/openai-compat/models
- LM Studio serving on the network: https://lmstudio.ai/docs/developer/core/server/serve-on-network
- LM Studio authentication: https://lmstudio.ai/docs/developer/core/authentication
