---
title: Provider Runtime Abstraction
status: completed
priority: P1
milestone: post-mvp
source: ideas/mvp-vision.md, features/agent-integration.md
dependencies: [agent-integration, inbox-notifications, monitoring-dashboard, session-management, tool-permission-persistence]
---

# Provider Runtime Abstraction

## Description

ainative currently has a strong Claude-first execution stack, but the implementation is still provider-shaped: task execution, resume, approvals, schedules, workflow child tasks, task-definition AI, profile smoke tests, and auth checks all import Claude-specific runtime code directly. That makes the app effective today, but it turns every new provider into a cross-cutting rewrite.

This feature introduces a provider-neutral runtime boundary so ainative can support multiple agent backends without fracturing the product surface. The goal is not to ship a flashy provider switch immediately. The goal is to preserve the existing governed execution model while making Claude the first adapter behind a common contract and opening the path for a second runtime such as OpenAI Codex App Server.

## User Story

As a ainative operator, I want agent execution to run through a provider-neutral runtime layer so that Claude remains stable today and new runtimes can be added later without breaking tasks, workflows, schedules, inbox approvals, or monitoring.

## Technical Approach

- Create a runtime contract under `src/lib/agents/runtime/` with a small set of operations:
  - `executeTask(taskId)`
  - `resumeTask(taskId)`
  - `cancelTask(taskId)`
  - `runTaskAssist(input)`
  - `runProfileTest(profileId, provider)`
  - `getCapabilities(provider)`
- Introduce runtime-owned capability metadata and provider-neutral service entry points first; deeper event normalization can be layered in when the second runtime integration needs it.
- Move the current Claude implementation behind a `claude-code` adapter. Existing task execution behavior should continue to work through the new interface with no user-visible regression.
- Replace direct imports of `executeClaudeTask()` or `query()` in shared orchestration code. Workflow execution, schedule firing, task-definition AI, profile smoke tests, and settings connectivity checks should all call the runtime facade rather than a provider SDK directly.
- Keep using `tasks.assignedAgent` as the task-level runtime selector, but centralize supported values and validation so `assignedAgent` becomes an intentional product field rather than an unbounded string.
- Add capability metadata per runtime for features that may not be universal:
  - session resume
  - user approvals/questions
  - MCP passthrough
  - profile smoke tests
  - task-definition assist
- Split auth and connectivity checks into provider-aware helpers so the settings surface can evolve from "Anthropic auth" into "runtime auth and health" without changing every caller again later.

## Acceptance Criteria

- [x] A provider runtime registry exists and exposes at least one adapter: `claude-code`
- [x] Task execute, resume, and cancel flows dispatch through the runtime registry instead of directly importing Claude-specific execution helpers
- [x] Workflow engine and scheduler launch child tasks through the runtime abstraction rather than `executeClaudeTask()` directly
- [x] Task-definition AI and profile smoke tests use provider-aware runtime services rather than importing the Claude SDK directly
- [x] Supported `assignedAgent` values are centralized and validated in shared code
- [x] Runtime capability metadata exists and can be queried by API and UI code
- [x] Existing Claude task execution, inbox approval flow, monitoring logs, and session resume behavior continue to work after the abstraction is introduced
- [x] Claude runtime includes 30s abort timeout on task assist queries with proper cleanup
- [x] Codex runtime includes 60s timeout with subprocess error handling

## Scope Boundaries

**Included:**
- Runtime contract and registry
- Claude adapter migration
- Capability metadata
- Shared orchestration refactor for tasks, workflows, schedules, assist, tests, and connectivity checks

**Excluded:**
- Shipping a second provider runtime
- Automatic provider fallback or cost routing
- User-facing pricing, model benchmarking, or provider analytics
- Cross-provider profile portability beyond what is needed to keep Claude working

## References

- Related features: [agent-integration](agent-integration.md), [session-management](session-management.md), [tool-permission-persistence](tool-permission-persistence.md), [monitoring-dashboard](monitoring-dashboard.md)
- Follow-on feature: [openai-codex-app-server](openai-codex-app-server.md)
- Follow-on feature: [cross-provider-profile-compatibility](cross-provider-profile-compatibility.md)
- Follow-on feature: [sdk-runtime-hardening](sdk-runtime-hardening.md)

## Post-Completion Updates

- **SDK audit (2026-03-15)**: Refactored `executeClaudeTask()` and `resumeClaudeTask()` to use `systemPrompt: { type: 'preset', preset: 'claude_code', append }` instead of concatenating profile instructions into the user prompt (F1). Extracted shared `buildTaskQueryContext()` helper to eliminate duplicate prompt construction between execute and resume paths (F12). See [sdk-runtime-hardening](sdk-runtime-hardening.md)
- **Output contract (2026-03-17)**: All runtime adapters must call `scanTaskOutputDocuments()` after task completion to detect and register output artifacts, and use `buildTaskOutputInstructions()` to inject output path conventions into the task prompt. This contract is already implemented in both the Claude Code and Codex adapters — the output directory convention (`~/.ainative/outputs/{taskId}/`) is shared across runtimes. No `onTaskCompleted` hook exists in the `AgentRuntimeAdapter` interface; both adapters handle this inline after execution. The durable requirement came from Recommendation #2 of an internal Agent E2E report.
