---
id: TDR-032
title: Runtime entry points must consistently inject the in-process ainative MCP server
status: accepted
date: 2026-04-11
category: agent-system
---

# TDR-032: Runtime entry points must consistently inject the in-process ainative MCP server

## Context

ainative exposes an in-process MCP server (`createToolServer(projectId).asMcpServer()` from `src/lib/chat/ainative-tools.ts`) that surfaces table CRUD, notifications, project/task/workflow/schedule/document/profile/usage/settings/chat-history/handoff/runtime tools as `mcp__stagent__*`. Every runtime entry point that dispatches a task or chat turn to an LLM needs to register this server so the agent can read and write ainative state.

Historically the chat engine (`src/lib/chat/engine.ts:280-315`), the `openai-direct` runtime (`src/lib/agents/runtime/openai-direct.ts`), and the `anthropic-direct` runtime (`src/lib/agents/runtime/anthropic-direct.ts`) all injected the ainative server on every `query()` call. The `claude-code` runtime path (`executeClaudeTask` and `resumeClaudeTask` in `src/lib/agents/claude-agent.ts`) did **not** — it only merged profile + browser + external MCP servers, leaving scheduled and manual tasks without ainative tool access. Scheduled agents running News Sentinel, Price Monitor, and Daily Briefing silently reported "No ainative table MCP tools are available in this session" as a result.

This drift went unnoticed because:
1. The chat engine's working injection was covered by chat-engine tests that mocked the MCP layer.
2. The `claude-code` path's failing injection had no equivalent test — nothing asserted `mcpServers.ainative` was present in the SDK query call.
3. The symptom manifested only in scheduled tasks, not in interactive chat, so it looked like a task-specific tool-availability problem rather than a wiring gap.

The fix shipped in feature `task-runtime-ainative-mcp-injection` (commits `092f925` → `4906fcb` → `2b5ae42` → `3b269f3`) extracted two private helpers in `claude-agent.ts` and applied them to both `executeClaudeTask` and `resumeClaudeTask`. Unit tests now pin the wiring at the SDK call boundary, and an end-to-end smoke against a real `claude-code` runtime task confirmed the agent sees and invokes ainative tools through the injection path.

The job of this TDR is to codify the invariant so it cannot drift again when a new runtime adapter is added.

## Decision

**Every runtime entry point that dispatches an agent turn — whether for a task, chat conversation, workflow step, or scheduled firing — MUST register the in-process ainative MCP server in the runtime-native `mcpServers` map it passes to the underlying provider SDK.**

Concrete requirements:

1. **Construction.** Use `createToolServer(projectId).asMcpServer()` (or the runtime-native equivalent via `createToolServer(projectId).forProvider("anthropic" | "openai")` for direct API runtimes). The `projectId` closure argument scopes every tool invocation to the active project. Do **not** use the deprecated `createStagentMcpServer` wrapper — it exists only for chat-engine back-compat.

2. **Merge order.** When merging with profile/browser/external MCP server maps, spread the ainative server **last**:
   ```ts
   { ...profileServers, ...browserServers, ...externalServers, ainative: stagentServer }
   ```
   This ensures no profile that accidentally declares its own `ainative` key can shadow the in-process server. The naive spread-ainative-first version looks safer but is the opposite.

3. **AllowedTools handling.** When the runtime supports an `allowedTools` filter and the profile provides an explicit allowlist, prepend `"mcp__stagent__*"` to it, deduplicated via `Array.from(new Set([...]))`. When the profile has no allowlist, pass **nothing** for `allowedTools` — let the SDK use the preset defaults. Unconditionally passing `["mcp__stagent__*"]` would restrict every profile without an allowlist to ainative-only tools and break every profile that relies on `claude_code` preset built-ins (Bash, Read, Write, Grep, etc.).

4. **Permission gating.** The ainative injection does NOT change how dangerous tools are gated. Every runtime MUST route `canUseTool` / equivalent permission callbacks through `handleToolPermission(taskId, toolName, input, ctx.canUseToolPolicy)` so the per-profile `autoApprove` / `autoDeny` lists, saved user patterns, and notification-based approval flow all apply. **Do NOT port the chat engine's inline `PERMISSION_GATED_TOOLS` switch to the task path** — the task path's per-profile model is strictly stronger and any tool not explicitly auto-approved will correctly fall through to "create approval notification and wait."

5. **Module-load safety.** Any module that is transitively imported by `@/lib/agents/runtime/catalog.ts` (notably `claude-agent.ts`, `runtime/claude.ts`, `workflows/engine.ts`) MUST NOT statically import `@/lib/chat/ainative-tools` or any module that transitively imports `@/lib/chat/tools/*`. Use a dynamic `await import("@/lib/chat/ainative-tools")` inside a function body instead. A static import triggers `ReferenceError: Cannot access 'claudeRuntimeAdapter' before initialization` at Next.js request time because the chat tools registry imports back into the runtime registry, producing a module-graph cycle. Unit tests that `vi.mock("@/lib/chat/ainative-tools", ...)` structurally cannot catch this cycle because the real module is never evaluated.

6. **Shared helpers as the canonical pattern.** The `claude-code` runtime uses two private helpers in `src/lib/agents/claude-agent.ts`:
   - `withStagentMcpServer(profileServers, browserServers, externalServers, projectId)` — async, dynamically imports `@/lib/chat/ainative-tools`, returns the shadow-proof merge.
   - `withStagentAllowedTools(profileAllowedTools)` — sync, returns `undefined` or the deduped prepended array.

   New runtime adapters should either call these helpers directly (if their `mcpServers` / `allowedTools` types are compatible) or mirror their contract verbatim. Do not inline-duplicate the merge logic — that is exactly the drift pattern this TDR exists to prevent.

## Consequences

**Positive:**
- A new runtime adapter cannot accidentally skip ainative injection — the architecture review mode of `/architect` (see Drift Heuristic addition below) will flag any adapter that doesn't call `createToolServer` or `withStagentMcpServer`.
- The dedup-at-spread-site pattern (`mergedAllowedTools` const) is now the canonical idiom, eliminating the O(n) double-Set-construction micro-cost.
- The dynamic-import cycle-break pattern is documented for any future module in the runtime-registry neighborhood.

**Neutral:**
- The dynamic `await import()` adds one module-resolution hop per task execution, but Node's module cache makes this a single-digit-microsecond cost after the first call per process. Negligible compared to SDK startup.
- Helper signatures use `Record<string, unknown>` for server maps, widening from the more specific types returned by `getBrowserMcpServers` / `getExternalMcpServers`. Acceptable pragmatic choice because the merged map is consumed only by the SDK as an opaque `mcpServers` option — no downstream code dereferences individual entries.

**Negative / watch for:**
- Any future runtime adapter that hard-codes a different merge order (ainative first, or ainative in the middle) will silently break the shadow-proofing guarantee. The drift heuristic below should catch this.
- Profiles that want to auto-approve groups of ainative tools (e.g., "all ainative read tools") currently cannot — `canUseToolPolicy.autoApprove` expects exact tool names. A separate feature would add wildcard support. Until then, profiles must list each ainative tool individually or accept the notification-based approval flow.

## Alternatives Considered

1. **Shared deny-list constant across all runtimes (lift `PERMISSION_GATED_TOOLS` from chat engine).** Rejected. The chat engine's inline switch is a chat-specific shortcut — it bypasses profile-level policies and forces a universal deny-list regardless of profile. The task path's per-profile `canUseToolPolicy` model is strictly stronger: profiles can auto-approve specific ainative tools, and the default for everything else is "notification + wait," which is safe. Porting the chat engine's shortcut would regress the task path's granularity.

2. **Static import of ainative-tools in claude-agent.ts.** Rejected. The static import triggers a module-load cycle through `@/lib/agents/runtime/catalog → runtime/index.ts:31 → claudeRuntimeAdapter` while `claude-agent.ts` itself is still evaluating. Crashes with `ReferenceError: Cannot access 'claudeRuntimeAdapter' before initialization` at Next.js request time. The dynamic-import fix is structurally necessary, not a style preference.

3. **Wildcard support in `canUseToolPolicy.autoApprove`.** Deferred to a separate feature. Most profiles currently list tools explicitly, and the feature under TDR does not require wildcard support to ship correctly. If a profile needs to auto-approve a group of ainative tools, the feature can be added later without changing the invariant this TDR codifies.

4. **Cross-runtime MCP server sharing via a module-level singleton.** Rejected. Each `createToolServer` call is scoped by `projectId` closure, and different tasks may run under different projects concurrently. A singleton would require threading `projectId` as a tool-call argument rather than a closure, which contradicts the existing design of every ainative tool handler.

## References

**Feature spec:** `features/task-runtime-ainative-mcp-injection.md` (status: completed, 2026-04-11)

**Commits that implement this TDR:**
- `221f2db` — grooming batch
- `092f925` — initial `executeClaudeTask` injection (inline)
- `ddd58fd` — switch from deprecated `createStagentMcpServer` wrapper to `createToolServer().asMcpServer()`
- `4906fcb` — extract `withStagentMcpServer` / `withStagentAllowedTools` helpers + apply to `resumeClaudeTask`
- `2b5ae42` — break module-load cycle via dynamic `await import()`
- `3b269f3` — dedupe `withStagentAllowedTools` at spread sites
- `48088a7` — flip feature to completed

**Reference implementations:**
- `src/lib/agents/claude-agent.ts:45-88` — canonical helper definitions
- `src/lib/agents/claude-agent.ts:547-578` — `executeClaudeTask` call site
- `src/lib/agents/claude-agent.ts:677-708` — `resumeClaudeTask` call site
- `src/lib/chat/engine.ts:280-315` — chat engine injection (still inline, chat-specific, separate permission model)
- `src/lib/agents/runtime/openai-direct.ts` + `anthropic-direct.ts` — direct API runtimes using `createToolServer(...).forProvider(...)`

**Related TDRs:**
- TDR-006 (multi-runtime adapter registry) — defines the adapter interface this TDR extends
- TDR-008 (learned context versioning) — unrelated permission dimension; ainative tools that mutate learned context still go through the proposal/approval flow
- TDR-024 (permission-gated chat tools) — the chat engine's approach, explicitly NOT ported to the task path per Decision item 4

**Drift heuristic added to `/architect`:**

The architect skill's drift detection checks (under "Drift Heuristics → Runtime Checks") gains a new check:

> **Runtime ainative injection consistency.** For every file under `src/lib/agents/runtime/` and every function that calls the provider SDK's `query()` / `createMessage()` / equivalent in `src/lib/agents/`, grep for either `createToolServer` (direct use) or `withStagentMcpServer` (shared helper). Any dispatcher that calls the provider SDK without one of these is a candidate for injection and should be flagged in the architecture review report. Also flag any static `import` of `@/lib/chat/ainative-tools` from a file in `src/lib/agents/` — the correct pattern is a dynamic `await import()` inside the function body.

This check runs automatically in architecture review mode and as a sub-step of architecture health mode.
