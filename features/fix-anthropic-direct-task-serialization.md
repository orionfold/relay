---
title: Anthropic Direct task execution fails with circular-JSON serialization error
status: done
priority: P2
milestone: mvp
source: smoke run during fix-workflow-model-preference-propagation (2026-07-02)
dependencies: []
---

## Verification run — 2026-07-02

**Root cause:** `withAnthropicDirectMcpServers` merges the in-process `relay`
server (`createToolServer().asMcpServer()`, an SDK MCP object with a circular
`root` transport back-reference) into the map that was passed verbatim to
`params.mcp_servers`. The Anthropic Messages API `mcp_servers` field is for
REMOTE URL connectors and the SDK `JSON.stringify`s the request body → threw
"Converting circular structure to JSON … property 'root' closes the circle"
(the `'HJ'` constructor = the minified SDK MCP server class) on every task,
before the model call. The relay tools were already available locally via
`forProvider("anthropic")` + `executeHandler`, so the `mcp_servers` injection
was not only broken but redundant for local execution. openai-direct never had
the bug — its `mcpServersToOpenAiTools` already skips `relay`.

**Fix:** added `mcpServersToAnthropicConnectors` (mirrors openai-direct) that
projects the merge to the serializable URL-connector shape, dropping the
in-process `relay` object and local stdio (`command`) servers and keeping only
remote URL connectors. Wired at the injection site
(`src/lib/agents/runtime/anthropic-direct.ts`).

**Verified:**
- 9/9 unit tests pass incl. a REGRESSION test that builds the exact circular
  `root` cycle, asserts the raw merge throws on `JSON.stringify`, and asserts
  the projection output is JSON-safe (`anthropic-direct.test.ts` group T8b).
- Real dev-server smoke (CLAUDE.md runtime-registry-adjacent budget): a trivial
  `assignedAgent: "anthropic-direct"` task ("reply with exactly: ok") now
  **completes** with `result: "ok"` (was failing every run). effectiveModelId
  `claude-opus-4-8` recorded — model resolution intact.
- runtime + notifications suites: 51/51 pass.

# Anthropic Direct task execution fails with circular-JSON serialization error

## Description

Found live during the 2026-07-02 model-preference smoke: every task executed on the
`anthropic-direct` runtime fails with:

```
Task stopped: error — Converting circular structure to JSON
    --> starting at object with constructor 'HJ'
    --- property 'root' closes the circle
```

Reproduced twice on a fresh scratch DB (dev server, `npm run dev`), on a trivial
"reply with exactly: ok" task with no profile — so this is the plain
`executeAnthropicDirectTask` path, not profile- or MCP-specific. The `'HJ'` constructor
name suggests a minified SDK/framework object (possibly an Anthropic SDK response or an
error object) being passed to `JSON.stringify` somewhere in the task loop's logging,
result persistence, or ledger metadata path. Pre-existing — reproduced on a tree without
any of the day's changes to this file (only model resolution was touched, and the failure
occurs after the model call starts).

Model resolution itself works on this path (effectiveModelId was correctly recorded as
`claude-sonnet-4-6` under the balanced preference even on the failing run), and the
failure IS visible (task fails loudly with the error as its result; a failed ledger row is
written) — so this is a broken-runtime bug, not a silent-failure bug.

## User Story

As a user who configured the Anthropic Direct API runtime, I want tasks routed to it to
actually complete, so that the runtime is usable for real work rather than failing on
every execution.

## Technical Approach

- Reproduce under `npm run dev` (trivial queued task, `assignedAgent: "anthropic-direct"`).
- Find the `JSON.stringify` call that receives the circular object — likely candidates:
  `agentLogs` metadata writes, the stream-event serialization in
  `src/lib/agents/runtime/anthropic-direct.ts` (`emitEvent` consumers), or result
  persistence in the task loop (`agentic-loop.ts`).
- Serialize a projection (extract the fields needed), never a raw SDK object.
- Check `openai-direct.ts` for the same pattern — the two runtimes are structural twins.
- **Smoke-test budget applies** (CLAUDE.md): anthropic-direct is runtime-registry-adjacent;
  verify with a real task run end-to-end.

## Acceptance Criteria

- [ ] A trivial task on `anthropic-direct` completes with a result (dev-server verified).
- [ ] The same check passes on `openai-direct` (or the pattern is confirmed absent there).
- [ ] Whatever object was circular is serialized as an explicit projection with a test.

## Scope Boundaries

**Included:**
- The serialization defect in the anthropic-direct (and, if shared, openai-direct) task loop.

**Excluded:**
- Model resolution (shipped in `fix-workflow-model-preference-propagation`).
- Runtime routing/fallback behavior.

## References

- Source: `features/fix-workflow-model-preference-propagation.md` → "Verification run — 2026-07-02".
- Related features: `anthropic-direct-runtime.md`, `openai-direct-runtime.md`,
  `direct-runtime-advanced-capabilities.md`.
