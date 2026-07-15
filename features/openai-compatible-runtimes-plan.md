# G-069 implementation plan

Authoritative specification: `features/openai-compatible-runtimes.md`

## Scope challenge

Use the selected PROCEED scope from the specification. Do not generalize the UI
or transport into an arbitrary provider marketplace, add an SDK dependency, or
claim tool/MCP parity.

## Affected surfaces

- Runtime catalog/registry, setup health, execution-target resolver, router
- Shared compatible HTTP transport and two adapter instances
- Chat dispatch, streaming engine, model discovery/selector/conversation API
- Settings keys/API/component/page
- Usage ledger receipts and requested/effective metadata
- Runtime/Chat/Settings contract tests and real module-graph smoke
- TDR-041 and G-069 ledger/changelog

## Vertical slices

1. Add runtime IDs and TDR-backed shared transport types/errors/configuration.
   Verify URL normalization, secret precedence, model-list protocol, and HTTP
   error taxonomy with fetch fixtures.
2. Add two adapter instances and execution-target/model resolution. Verify
   strict explicit targeting, empty/model/tool refusal, task completion, and
   task/workflow/schedule ledger linkage.
3. Add streamed Chat dispatch plus namespaced discovery/selection. Verify SSE
   terminal semantics, abort/disconnect reconciliation, effective model and
   optional LiteLLM cost truth, and no fallback.
4. Add Settings save/test/clear UI and API. Verify secret redaction, unsafe LAN
   HTTP gate, independent configurations, and browser behavior in both themes.
5. Run catalog/profile/router/type/lint tests, the broader affected suites, a
   real task through `npm run dev`, and the runtime-module-graph smoke.

## Regression-test budget

- Transport: approximately 18 cases across normalization, model listing,
  authentication, HTTP status classes, malformed/empty responses, SSE terminal
  semantics, cost parsing, and abort.
- Adapter/target: approximately 10 cases across two identities, task receipts,
  workflow/schedule attribution, tool refusal, and strict no-fallback.
- API/UI/discovery: approximately 10 cases across redaction, save/clear/test,
  grouping, and model namespaces.
- Broader guards: catalog parity, profile schema, routing, Chat routes, typecheck,
  lint, runtime graph, and browser smoke.

## Rescue and rollback

- If a provider diverges from the shared contract, keep its explicit identity
  and split only the divergent method; do not fork the whole adapter.
- If streaming proves incompatible, fail that runtime's Chat path visibly while
  preserving task support; never route to another provider.
- If registry imports form a cycle, move chat-tool or settings imports behind
  function-local dynamic imports per TDR-032 and rerun the real dev-server task.
- Rollback is additive: remove the two catalog entries/registry instances and
  Settings section; no migration or user-data rewrite is required.
