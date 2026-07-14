---
title: Agent Self-Improvement
status: completed
priority: P3
milestone: post-mvp
dependencies:
  - workflow-engine
  - multi-agent-routing
  - autonomous-loop-execution
---

# Agent Self-Improvement

## User Story

As a power user running recurring agent tasks, I want agents to learn from their own execution history so that they improve over time — proposing better instructions, catching recurring issues, and auditing the codebase for improvement opportunities — all under my review and approval.

## Problem

Agents currently start every task from the same static system prompt. Patterns discovered during execution (common errors, preferred approaches, effective tool sequences) are lost between runs. Users must manually update profile instructions to encode these learnings. There's also no mechanism for agents to proactively audit the project for improvement opportunities.

## Solution

Three interconnected capabilities:

1. **Instruction Evolution** — After task completion, the agent proposes additions to its learned context. Human reviews and approves before persistence.
2. **Sweep Cycles** — Periodic audit tasks that scan project state for technical debt, test gaps, documentation drift, and other improvement opportunities.
3. **Guardrails** — Approval workflows, version history, rollback, and size limits to keep learned context safe and useful.

## Acceptance Criteria

- [ ] Agent can propose additions to its learned context after task completion
- [ ] Human approval step before learned patterns are persisted
- [ ] Version history of all context modifications with diff view
- [ ] Rollback to any previous version of agent context
- [ ] Sweep task type that audits project state and generates improvement tasks
- [ ] Maximum context size enforced with summarization when limit approached

## Scope Boundaries

### In Scope

- Pattern extraction from completed task logs
- Human-in-the-loop approval for all context changes
- Learned context CRUD API and review UI
- Sweep agent that generates improvement tasks
- Version history with diff view and one-click rollback
- Context size limits with automatic summarization

### Out of Scope

- Automatic approval (all changes require human review)
- Cross-project knowledge transfer
- Agent modifying its own base system prompt (only learned context is mutable)
- Real-time learning during task execution (only post-completion)
- Fine-tuning or model training

## Technical Design

### Data Layer — `learned_context` Table (Existing)

The `learned_context` table already exists in the schema with the right structure:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | text PK | Row identifier |
| `profileId` | text | Links to agent profile |
| `version` | integer | Auto-incrementing version per profile |
| `content` | text | Full context content at this version |
| `diff` | text | What changed from previous version |
| `changeType` | enum | `proposal` → `approved` / `rejected` / `rollback` / `summarization` |
| `createdAt` | timestamp | When the change was proposed |

Indexed on `(profileId, version)` and `changeType`.

### Instruction Evolution Flow

```
Task completes → extractPatterns(taskId, agentLogs)
  → creates learned_context row with changeType="proposal"
  → notification sent to inbox (reuses inbox-notifications)
  → user reviews in context-editor UI (approve / reject / edit)
  → approved: new row with changeType="approved", version++
  → next task execution: profile.skillMd + latest approved context
```

### Sweep Cycles

Sweep tasks reuse two completed features:

- **`autonomous-loop-execution`** — sweep runs as a loop with stop condition "no more improvements found" or max iterations
- **`multi-agent-routing`** — sweep dispatches audit subtasks to specialized profiles (code-reviewer for code quality, researcher for dependency updates, etc.)

Sweep produces a prioritized list of improvement tasks inserted into the task queue with `sourceType: "sweep"`.

### Guardrails

| Guardrail | Implementation |
|-----------|---------------|
| Human approval | Reuses `inbox-notifications` + `ambient-approval-toast` pattern |
| Version history | Row-per-version in `learned_context`, displayed as timeline |
| Rollback | Restore = new row with `changeType="rollback"`, copying content from target version |
| Size limit | Configurable `maxContextTokens` per profile (default 4000). When approaching limit, trigger `changeType="summarization"` |

### Key Files

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/agents/self-improvement.ts` | Create | `extractPatterns()` — analyzes task logs, proposes context additions |
| `src/lib/agents/sweep-agent.ts` | Create | Sweep loop using autonomous-loop-execution, dispatches audit subtasks |
| `src/app/api/agents/[id]/context/route.ts` | Create | GET (list versions), POST (propose), PATCH (approve/reject/rollback) |
| `src/components/agents/context-editor.tsx` | Create | Review UI with diff view, version timeline, approve/reject buttons, rollback |
| `src/lib/agents/profiles/types.ts` | Modify | Add `learnedContext?: string` and `maxContextTokens?: number` to `AgentProfile` |
| `src/lib/agents/claude-agent.ts` | Modify | Inject latest approved learned context into system prompt at execution time |
| `src/lib/agents/runtime/claude.ts` | Modify | Pass learned context through runtime execution |

### Integration Points

- **Task execution** (`claude-agent.ts`): After task completes, call `extractPatterns(taskId)` to analyze logs and propose context
- **Profile registry** (`registry.ts`): Load latest approved `learned_context` when building profile for execution
- **Notification system**: Proposal creates inbox notification with "Review Agent Learning" action
- **Autonomous loop**: Sweep agent registered as a loop-compatible task type

## References

- **Inspiration**: internal research synthesis — Autoresearch's `program.md` (human-authored, immutable) vs `AGENT.md` (agent-authored, mutable); Ralph Wiggum's self-updating instructions; Gas Town sweep agents
- **DB Schema**: `src/lib/db/schema.ts` lines 172-202 — `learned_context` table
- **Autonomous loops**: `features/autonomous-loop-execution.md` — stop conditions, iteration context, pause/resume
- **Multi-agent routing**: `features/multi-agent-routing.md` — profile registry, task classifier, execution integration
