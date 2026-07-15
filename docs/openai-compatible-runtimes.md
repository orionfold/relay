# LiteLLM and LM Studio runtime setup

Relay supports LiteLLM and LM Studio as two named runtimes over their shared
OpenAI-compatible model-list and Chat Completions boundary. They remain separate
in Settings, model selection, execution metadata, and usage receipts.

## Configure an endpoint

1. Start the LiteLLM proxy or LM Studio server and make it reachable from the
   machine running Relay.
2. Open **Settings → LiteLLM & LM Studio**.
3. Enter the server base URL, including an explicit proxy path when required.
   Relay adds `/v1` only when the URL has no path.
4. Enter an API key if the server requires one, then save and test the runtime.
5. Discover the endpoint's current models and optionally save a default model.

The request originates from the Relay server, not from the browser. If Relay is
in a VM and the browser is on another machine, the endpoint must therefore be
reachable from the VM. Loopback means the Relay server itself.

The default URLs are:

- LiteLLM: `http://localhost:4000/v1`
- LM Studio: `http://localhost:1234/v1`

Environment variables can supply configuration without storing a secret in
Relay:

```bash
LITELLM_BASE_URL=https://gateway.example/v1
LITELLM_API_KEY=replace-me

LMSTUDIO_BASE_URL=http://127.0.0.1:1234/v1
LMSTUDIO_API_KEY=replace-me
```

Environment API keys take precedence over saved keys. Settings and API
responses report only whether a key exists and where it came from; they never
return the secret.

## Remote-network safety

HTTPS is accepted for remote hosts. Plain HTTP is accepted automatically only
for loopback. To use an intentionally unencrypted LAN endpoint, enable **Allow
insecure remote HTTP** for that runtime. This is an explicit disclosure: prompts
and in-scope context can be observed or modified on that network path.

Relay does not follow redirects from configured endpoints, so credentials are
not forwarded to an unvalidated redirect target. A non-loopback hostname does
not imply cloud or local operation: LiteLLM may route to local or hosted
upstreams, and LM Studio may be served over a LAN.

## Current capability boundary

LiteLLM and LM Studio support model discovery, Chat, tasks, workflow steps, and
scheduled task firings. Relay records the named runtime and the endpoint's
effective model when it reports one. Explicit selections never fall back to a
different runtime.

This first boundary does not advertise tool loops, MCP tools, filesystem/Bash,
task resume, or profile testing. If an endpoint requests a tool call, Relay
fails the run visibly instead of pretending it completed.

Token usage is recorded only when reported by the endpoint. LiteLLM cost is
recorded only when it supplies a valid `x-litellm-response-cost` value. LM
Studio cost remains unknown; Relay does not infer zero cost, privacy, offline
operation, or local-only execution from its name.

## Troubleshooting

- **Not configured:** save a base URL before selecting that runtime.
- **Connection refused or timeout:** test reachability from the Relay server
  host; do not test only from the browser client.
- **401/403:** configure the endpoint's API key in Settings or the environment.
- **No models:** load/configure a model in LM Studio or expose a model alias in
  LiteLLM, then discover again.
- **Remote HTTP rejected:** use HTTPS or explicitly allow insecure remote HTTP.
- **Tool-call refusal:** use a profile/runtime path that does not require tools;
  compatible-runtime tool loops are outside this capability boundary.

Authoritative provider references: [LiteLLM proxy](https://docs.litellm.ai/docs/simple_proxy),
[LM Studio OpenAI compatibility](https://lmstudio.ai/docs/developer/openai-compat),
[LM Studio network serving](https://lmstudio.ai/docs/developer/core/server/serve-on-network),
and [LM Studio authentication](https://lmstudio.ai/docs/developer/core/authentication).
