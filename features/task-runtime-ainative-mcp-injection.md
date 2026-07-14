---
title: Task Runtime ainative MCP Injection
status: completed
priority: P0
milestone: post-mvp
source: internal history record
dependencies: [agent-integration, chat-engine]
---

# Task Runtime ainative MCP Injection

## Description

Wire the in-process ainative MCP server into the Claude Agent SDK runtime entry points (`executeClaudeTask` and `resumeClaudeTask`) so that scheduled and manual task executions have reliable access to `mcp__stagent__*` tools — tables, notifications, row CRUD, and everything else the ainative tool registry exposes.

Today, only the chat engine injects `createStagentMcpServer` into its agent session. The `openai-direct` and `anthropic-direct` runtimes inject the equivalent `createToolServer()` directly. The `claude-code` runtime path — which is what schedules and manual task runs actually hit — skips the injection entirely, relying on profile-defined `mcpServers`/`allowedTools`. Because profiles don't (and shouldn't) hard-code ainative, scheduled agents silently report "No ainative table MCP tools are available in this session" on any step that needs table access. The News Sentinel, Price Monitor, and Daily Briefing schedules have all hit this in production.

This is a wiring gap, not a design question. The server factory, the permission gate, and the reference implementation all already exist — they just need to be called from two more sites.

## User Story

As a ainative operator running a scheduled agent that reads or writes tables (News Sentinel, Price Monitor, Daily Briefing), I want the agent to reliably access ainative table tools so that my scheduled runs don't silently skip table operations with "No ainative table MCP tools are available."

## Technical Approach

- **Inject at executeClaudeTask.** In `src/lib/agents/claude-agent.ts` at the MCP merge point (~line 492), call `createStagentMcpServer(task.projectId)` from `src/lib/chat/ainative-tools.ts` and merge it into `mergedMcpServers` under the `ainative` key, ahead of profile/browser/external servers:
  ```ts
  const stagentServer = createStagentMcpServer(task.projectId);
  const profileMcpServers = ctx.payload?.mcpServers ?? {};
  const mergedMcpServers = {
    ainative: stagentServer,
    ...profileMcpServers,
    ...browserServers,
    ...externalServers,
  };
  ```
- **Inject at resumeClaudeTask.** Apply the same injection in `resumeClaudeTask` (~line 611). Workflow step execution and session resumption go through this path.
- **Conditionally merge `mcp__stagent__*` into `allowedTools`.** The current code at `claude-agent.ts:511` only passes `allowedTools` to the SDK when the profile set one: `...(ctx.payload?.allowedTools && { allowedTools: ctx.payload.allowedTools })`. Profiles without an explicit allowlist rely on the `claude_code` preset's default tool surface (Bash/Read/Write/etc.) — unconditionally passing `allowedTools: ["mcp__stagent__*"]` would restrict them to ONLY ainative and break the preset. The correct behavior:
  ```ts
  const profileAllowedTools = ctx.payload?.allowedTools;
  const allowedTools = profileAllowedTools
    ? ["mcp__stagent__*", ...profileAllowedTools]
    : undefined; // fall through to preset defaults
  ```
  When the profile has no allowlist, the SDK still surfaces ainative tools because they are registered via `mcpServers.ainative`. When the profile has an allowlist, we merge ainative in so the profile doesn't accidentally strip it.
- **Permission gating is already correct and does not need changes.** The task path already routes `canUseTool` through `handleToolPermission(taskId, toolName, input, ctx.canUseToolPolicy)` at both `claude-agent.ts:520` and `:640`. Its permission model is per-profile `autoApprove`/`autoDeny` plus saved user patterns plus notification-based approval — any ainative tool not explicitly auto-approved by a profile will fall through to "create notification and wait," which is the safe default. The chat engine's inline `PERMISSION_GATED_TOOLS` switch is a chat-specific shortcut and must NOT be ported — the per-profile policy is the right model for task execution.
- **No schema changes, no DB migration, no frontend changes.** This is pure runtime wiring.

## Acceptance Criteria

- [ ] `executeClaudeTask` calls `createStagentMcpServer(task.projectId)` and includes it in `mergedMcpServers` under the `ainative` key.
- [ ] `resumeClaudeTask` does the same.
- [ ] When the profile has an explicit `allowedTools`, `mcp__stagent__*` is prepended so ainative tools survive the filter.
- [ ] When the profile has no `allowedTools`, the SDK option is still omitted (preset defaults preserved) and ainative tools are reachable via `mcpServers` registration.
- [ ] Permission-gated ainative tools (`execute_task`, `delete_workflow`) still route through `handleToolPermission` via the existing per-profile `canUseToolPolicy` — a profile that does not auto-approve them creates an approval notification.
- [ ] Existing `src/lib/agents/__tests__/claude-agent.test.ts` tests still pass.
- [ ] New unit tests assert that the SDK `query` call receives `mcpServers.ainative` on both `executeClaudeTask` and `resumeClaudeTask`, and that `allowedTools` prepends `mcp__stagent__*` only when the profile provided its own allowlist.
- [ ] Chat engine behavior is unchanged (no edits to `src/lib/chat/engine.ts`).

## Scope Boundaries

**Included:**
- Claude-code runtime injection at `executeClaudeTask` and `resumeClaudeTask`
- `mcp__stagent__*` allowedTools merge (conditional on profile already setting an allowlist)
- Test coverage asserting the wiring is present on both paths

**Excluded:**
- Refactoring the ainative tool registry itself
- Adding new ainative tools
- Lifting `PERMISSION_GATED_TOOLS` out of `src/lib/chat/engine.ts` into a shared constant — the task path already has the correct (per-profile) permission model and should not be retrofitted with the chat engine's inline switch
- Rewiring the `openai-direct` / `anthropic-direct` runtimes (they already inject ainative tools via `createToolServer`)
- Adding wildcard support to `canUseToolPolicy.autoApprove` (separate follow-up if profiles need to auto-approve groups of ainative tools)

## References

- Source: `internal history record`
- `src/lib/chat/engine.ts:280-315` — reference implementation (chat engine MCP injection)
- `src/lib/chat/ainative-tools.ts:70-133` — `createToolServer` / `createStagentMcpServer` factories
- `src/lib/agents/claude-agent.ts:492-513` — `executeClaudeTask` MCP merge point (current, broken)
- `src/lib/agents/claude-agent.ts:606-633` — `resumeClaudeTask` MCP merge point (current, broken)
- `src/lib/agents/runtime/openai-direct.ts:19`, `src/lib/agents/runtime/anthropic-direct.ts:18` — parity runtimes that already do this
- Related features: `chat-engine.md`, `agent-integration.md`, `scheduled-prompt-loops.md`
- **TDR follow-up:** once this ships, propose a new `agent-system` TDR — "All runtime entry points must inject the in-process ainative MCP server and `mcp__stagent__*` allowlist consistently" — to codify the pattern and prevent regression in future runtime additions.

## Verification run — 2026-04-11

**Unit coverage:** 34/34 tests in `src/lib/agents/__tests__/claude-agent.test.ts` pass (32 pre-existing + A-ainative-1/2/3 + R-ainative-1/2). `npx tsc --noEmit` exit 0.

**End-to-end smoke** (against main repo dev server on `:3010`, clean `~/.ainative/ainative.db`):
- Prompt in chat: *"Create a task titled ainative-mcp-smoke-v2 using the general profile with prompt: Invoke mcp__stagent__list_tables once… Execute the task and report…"*
- Chat assistant created task `1d2bdb99-682d-65cc-bb9a-cbc99bdefe8` and executed it via `mcp__stagent__execute_task`.
- Task executed on the `claude-code` runtime (this feature's code path).
- The agent successfully located `mcp__stagent__list_tables` in its available tools and invoked it — the per-profile permission gate created an approval notification (`mcp__stagent__list_tables`, visible in Inbox).
- **No "No ainative table MCP tools are available" error occurred** — the acceptance criterion is met.
- The task reported a soft-failure ("MCP tool call timed out") because the permission approval wasn't granted during the agent's poll window, not because the tool was missing. The SDK saw and exposed the ainative server correctly.
- After approval (Allow Once), the pending permission notification resolved cleanly. Inbox returned to zero.

**Circular-dependency fix (caught by smoke, not by unit tests):** The initial helper implementation used a static `import { createToolServer } from "@/lib/chat/ainative-tools"` at the top of `src/lib/agents/claude-agent.ts`. At module-load time this triggered a `ReferenceError: Cannot access 'claudeRuntimeAdapter' before initialization` because `ainative-tools` transitively imports the chat tools registry, which imports `@/lib/agents/runtime/catalog` → `runtime/index.ts:31` which statically references `claudeRuntimeAdapter` — a module still mid-evaluation. The fix: the `withStagentMcpServer` helper now uses a dynamic `await import("@/lib/chat/ainative-tools")` inside the function body, deferring the ainative-tools load until `executeClaudeTask` / `resumeClaudeTask` actually run (by which time the runtime registry has finished initializing). Unit tests were unaffected because `vi.mock("@/lib/chat/ainative-tools", ...)` intercepts both static and dynamic imports equivalently.

**Lesson recorded:** Feature specs for changes that touch runtime-registry adjacent modules should budget a smoke test — unit tests that mock the transitively-imported module cannot catch module-load cycles. Added to the implementation plan's "Error & Rescue Registry" as a failure mode to watch for in future similar features.
