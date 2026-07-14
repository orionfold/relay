---
title: Task Runtime — Skill Parity With Chat
status: completed
priority: P1
milestone: post-mvp
source: ideas/chat-context-experience.md §11 (architect drift concern)
dependencies: [chat-claude-sdk-skills, agent-integration, task-runtime-ainative-mcp-injection]
---

# Task Runtime — Skill Parity With Chat

## Description

Chat and task execution are two parallel consumers of the same Claude Agent SDK. Chat goes through `src/lib/chat/engine.ts` (interactive streaming turns); task execution goes through `src/lib/agents/claude-agent.ts` (fire-and-forget background jobs). Phase 1a (`chat-claude-sdk-skills`) enables `settingSources: ["user", "project"]` and filesystem tools on the chat path. If `claude-agent.ts` is not updated in lockstep, a project skill will be visible when a user asks about it in chat but invisible when the very same user dispatches a background task through the Kanban board. This is the "same skill, everywhere" promise breaking silently — exactly the drift the architect flagged in §11.

This feature is a small, surgical mirror of Phase 1a into `claude-agent.ts`. It inherits the same design decisions (partitioned Tier 0 / CLAUDE.md, Bash via permission bridge, hooks excluded) and the same capability flags from `runtime-capability-matrix`. It is scoped narrowly to the Claude task runtime — Codex and Ollama task execution are either not wired the same way today or out of scope for this iteration.

## User Story

As a user who has `.claude/skills/researcher/SKILL.md` in my project, when I dispatch a task to the Kanban board and the task agent runs in the background, I want that skill (and my CLAUDE.md) to reach the agent just like they would in interactive chat, so my filesystem context is a property of the project — not of which surface I happen to be using.

## Technical Approach

### 1. Locate the SDK call in `claude-agent.ts`

`src/lib/agents/claude-agent.ts` constructs the `query()` options for task execution. Find the parallel to `engine.ts:300-315` and extend it the same way:

```typescript
query({
  prompt,
  options: {
    model, maxTurns, cwd, env,
    mcpServers: { ainative: stagentServer, ... },
    allowedTools: [
      "mcp__stagent__*",
      // ...existing browser/external patterns
      "Skill",
      "Read", "Grep", "Glob",
      "Edit", "Write",
      "Bash",
      "TodoWrite",
    ],
    settingSources: ["user", "project"],
  },
});
```

### 2. cwd resolution

Per Q4, use the task's project `workingDirectory` when present, else launch cwd. Reuse the same resolver introduced in Phase 1a.

### 3. Partitioned system prompt

Import the partitioned Tier 0 from the shared context builder (the partition from DD-CE-002 should be extracted into a shared helper in Phase 1a if it isn't already, so task and chat don't diverge).

### 4. Permission bridge

Task execution already has a permission bridge for ainative MCP tools. Extend it to cover the newly allowed filesystem tools and Bash. The notification/permission UI (`ambient-approval-toast`) already handles the pattern — just ensure the new tool names reach it.

### 5. Hooks excluded

Same rationale as Phase 1a (Q2): don't load filesystem hooks on task execution either. Hooks in a fire-and-forget background context are even riskier than in chat.

### 6. Capability flag check

Read `RuntimeFeatures` via `getFeaturesForModel(modelId)` before enabling the new options. This keeps the logic honest when future runtimes get their own task execution paths.

### 7. Verification

Real-environment test: create `.claude/skills/task-smoke/SKILL.md`, dispatch a task that should invoke the skill, confirm the skill is invoked and the resulting task log shows the skill event.

## Acceptance Criteria

- [x] `claude-agent.ts` passes `settingSources: ["user", "project"]` and the full allowed-tools list to `query()`
- [x] Task execution sees the same skills as chat on the same project (smoke test confirmed via `Skill` tool invocation)
- [x] CLAUDE.md and `.claude/rules/*.md` reach task execution (SDK auto-loads both via `settingSources: ["project"]`)
- [x] Filesystem tools (`Read`, `Grep`, etc.) are usable from tasks; `Edit`/`Write`/`Bash` gated by the existing permission bridge (Layer 1.75 in `handleToolPermission` auto-allows Read/Grep/Glob/Skill; Edit/Write/Bash route through notification polling)
- [ ] ~~Tier 0 partition is sourced from the shared helper — no duplicated prose between `engine.ts` and `claude-agent.ts`~~ — **deferred** per scope challenge; chat and task have genuinely different prompt shapes (history vs. document/table/output context). Documented in `internal implementation plan` "NOT in scope".
- [x] Hooks are **not** loaded on task execution (matching Q2) — regression test in `claude-agent-sdk-options.test.ts` greps for `\bhooks\s*:` in both `query()` blocks
- [x] Capability check: if a future runtime without `hasNativeSkills` is used for tasks, `settingSources`/`Skill` are not passed (gated via `getFeaturesForModel(...).hasNativeSkills` in both `executeClaudeTask` and `resumeClaudeTask`)
- [x] Smoke test: task invokes a project skill and the invocation appears in the task log — see "Verification run — 2026-04-13" below

## Scope Boundaries

**Included:**
- Claude task runtime (`claude-agent.ts`) SDK options parity with Phase 1a
- Shared Tier 0 partition helper (extract if not already shared)
- Permission bridge extension to new tools

**Excluded:**
- Codex task runtime (separate code path; Codex-based tasks are less common and out of scope here)
- Ollama task runtime (tasks on Ollama not currently a primary flow)
- UI changes — task dispatch flow is unchanged from the user's perspective
- Skill invocation UI on task detail view (covered elsewhere via task-turn-observability)

## Verification run — 2026-04-13

**Runtime:** claude-code (default Opus via SDK)
**Task ID:** `39331e2f-71a5-42fc-8928-bbe4c8f66ae3`
**Title:** `skill-parity-smoke`
**Prompt:** "Invoke the task-smoke skill via the Skill tool and report exactly what the skill told you to say."
**Skill fixture:** `.claude/skills/task-smoke/SKILL.md` (one-shot, deleted post-verification)
**Flow:** `POST /api/tasks` 201 → `PATCH status=queued` 200 → `POST /api/tasks/:id/execute` 202 → completed in ~10s
**Outcome:** **PASS** — task `result` field exactly equals `TASK_SMOKE_SKILL_REACHED_AGENT`. No `ReferenceError: Cannot access 'claudeRuntimeAdapter' before initialization` or other module-load errors in the dev-server output. Confirms `settingSources: ["user", "project"]` and the `Skill` tool reach the Claude task runtime (`executeClaudeTask`) identically to chat.

## References

- Source: `ideas/chat-context-experience.md` §11 (architect drift concern: "Task and chat are parallel runtimes for the same SDK — inconsistency here breaks the 'same skill, everywhere' promise")
- Depends on: `chat-claude-sdk-skills` (must land first for the shared partition helper), `runtime-capability-matrix`, `agent-integration`
- Related: `task-runtime-ainative-mcp-injection` (sibling architecture, TDR-032)
- Existing code: `src/lib/agents/claude-agent.ts`, `src/lib/chat/context-builder.ts`
