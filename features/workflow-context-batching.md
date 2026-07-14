---
title: Workflow Context Batching
status: completed
priority: P2
milestone: post-mvp
layer: Agent Intelligence
dependencies:
  - agent-self-improvement
  - workflow-engine
---

# Workflow Context Batching

## Summary

Buffer context proposals generated during multi-step workflow execution and present them as a single batch at workflow completion, reducing approval interruptions and enabling workflow-scoped auto-approve for low-risk patterns.

## Problem

When a workflow executes multiple steps (sequence, parallel, or blueprint), each completed task fires `analyzeForLearnedPatterns()` independently. This creates one notification per task — a 3-step workflow generates 3 separate context proposal notifications. During the E2E test report, every workflow test produced multiple context proposals that required individual approval, adding friction to what should be an uninterrupted flow.

The problem compounds with parallel workflows: two branches completing simultaneously can create overlapping proposals that the user must evaluate without the full workflow context.

## User Story

As a user running multi-step workflows, I want context proposals to be collected during workflow execution and presented as a single batch when the workflow completes, so I can review all learned patterns together with full context instead of being interrupted after each step.

## Solution

### Workflow Session Scope

When the workflow engine starts execution, it opens a "learning session" that buffers proposals instead of creating individual notifications. When the workflow completes (or fails), the session closes and fires a single batch notification.

### Batch Approval UI

A new `BatchProposalReview` component shows all proposals from a workflow run in a single view:
- Grouped by profile (e.g., 2 proposals for `general`, 1 for `code-reviewer`)
- Each proposal shows which workflow step generated it
- "Approve All" / "Reject All" buttons for quick batch actions
- Individual approve/reject per proposal for selective approval
- Deduplication: if two steps propose the same pattern, highlight and merge

### Auto-Approve for Low-Risk Patterns

Optional setting: auto-approve context proposals during workflow execution when they match low-risk criteria:
- Pattern is additive (not modifying existing context)
- Pattern content is under 200 tokens
- Profile already has approved context (not first-ever proposal)
- Setting: `workflow.autoApproveContext` (default: `false`)

## Acceptance Criteria

- [ ] Workflow execution buffers context proposals instead of creating individual notifications
- [ ] Single batch notification created at workflow completion
- [ ] Batch proposal UI shows all proposals grouped by profile
- [ ] "Approve All" and "Reject All" batch actions work correctly
- [ ] Individual approve/reject within batch view works
- [ ] Duplicate proposals from different workflow steps are detected and merged
- [ ] Non-workflow tasks continue to create individual proposals (no regression)
- [ ] Failed workflows still present buffered proposals for review
- [ ] Optional auto-approve setting for low-risk patterns during workflows
- [ ] Workflow step origin shown per proposal in the batch view

## Scope Boundaries

### In Scope

- Workflow-scoped proposal buffering
- Batch notification at workflow completion
- Batch approval/rejection UI
- Proposal deduplication within a workflow run
- Optional auto-approve setting

### Out of Scope

- Auto-approve without any user opt-in (all proposals require at least one-time approval or explicit setting)
- Cross-workflow deduplication (only within a single workflow run)
- Modifying the pattern extraction logic itself (only the notification/approval flow changes)
- Schedule-scoped batching (only workflow execution scope)

## Technical Approach

### Learning Session Lifecycle

```
workflowEngine.execute(workflowId)
  → openLearningSession(workflowId)
  → for each step:
      → task executes
      → analyzeForLearnedPatterns(taskId, { sessionId: workflowId })
      → proposal stored with sessionId instead of creating notification
  → closeLearningSession(workflowId)
  → create single batch notification with all buffered proposals
```

### Key Files

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/agents/learning-session.ts` | Create | Session lifecycle: open, buffer, close, batch notify |
| `src/lib/workflows/engine.ts` | Modify | Wrap execution in learning session open/close |
| `src/lib/agents/pattern-extractor.ts` | Modify | Accept optional `sessionId`, buffer instead of notify |
| `src/lib/agents/learned-context.ts` | Modify | Add `batchApprove(ids[])` and `batchReject(ids[])` |
| `src/app/api/profiles/[id]/context/batch/route.ts` | Create | POST batch approve/reject endpoint |
| `src/components/notifications/batch-proposal-review.tsx` | Create | Batch approval UI with grouping and dedup |
| `src/components/notifications/pending-approval-host.tsx` | Modify | Route batch notifications to batch review component |

### Data Model Extension

The `learned_context` table already has all needed columns. Add `sessionId` (nullable text) to link proposals to a workflow run:

```sql
ALTER TABLE learned_context ADD COLUMN sessionId TEXT;
CREATE INDEX idx_learned_context_session ON learned_context(sessionId);
```

Proposals with a `sessionId` are buffered; proposals without one behave as today (immediate notification).

## References

- **Origin**: internal Agent E2E Test Report, Recommendation #5 — "Multiple context proposals during workflow execution add friction — consider auto-approving within a workflow session"
- **Builds on**: [agent-self-improvement](agent-self-improvement.md) — pattern extraction and learned context system
- **Builds on**: [workflow-engine](workflow-engine.md) — workflow execution lifecycle
- **Related**: [ambient-approval-toast](ambient-approval-toast.md) — notification delivery pattern
