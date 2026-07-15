---
title: Workflow Execution Resilience
status: completed
priority: P1
milestone: post-mvp
source: ideas/analysis-chat-issues.md
dependencies: [workflow-engine, workflow-document-pool]
---

# Workflow Execution Resilience

## Description

Workflow execution has 4 compounding state machine failures that make multi-step workflows unreliable. Step state is written to the database before task creation succeeds, causing steps to get permanently stuck in "running" if creation fails. Execution errors are caught and logged but not propagated, leaving workflows in an inconsistent state. Re-execution is blocked for "active" workflows even when no tasks are actually running (crashed state). And `updateWorkflowState()` silently returns on missing workflows instead of throwing.

Additionally, per-step document binding exists in the DB schema (`workflowDocumentInputs.stepId`) and the query code (`buildPoolDocumentContext` at `context-builder.ts:143-152`) but isn't exposed in the `create_workflow` chat tool — every step gets all documents, burning tokens on irrelevant context.

## User Story

As a workflow operator, I want failed workflows to recover gracefully and retry cleanly so that I don't have to delete and recreate workflows after every failure.

## Technical Approach

- **Defer step state writes** in `engine.ts` (~lines 812-841): move task creation BEFORE state write. Only persist `stepState.status = "running"` after `executeTaskWithRuntime()` call is initiated. Pattern: `createTask() → executeTaskWithRuntime() → writeState("running")`
- **Explicit rollback on failure**: replace the error-swallowing catch block (~line 779-781) with:
  - Set `stepState.status = "failed"`, `stepState.error = err.message`, `stepState.completedAt`
  - Call `updateWorkflowState()` with failed state
  - Re-throw error (propagate, don't swallow)
- **Make `updateWorkflowState` throw**: replace `if (!workflow) return;` (~line 903) with `throw new Error(...)` — named error, callers handle via existing pattern executor try/catch
- **Allow re-execution from "active"** in `execute/route.ts` (~lines 23-28): before the 409 block, query tasks table for running/queued tasks. If workflow is "active" AND 0 live tasks → treat as re-executable (crashed workflow recovery). If live tasks > 0 → 409 (genuinely running)
- **Full reset on re-execution**: extend reset block (~lines 30-47) to:
  1. Cancel orphaned tasks (`UPDATE tasks SET status='cancelled' WHERE workflowId=? AND status IN ('running','queued')`)
  2. Delete `_state` and `_loopState` from definition
  3. Reset ALL step states to "pending"
  4. Set workflow status to "draft", then atomic claim to "active"
- **Per-step document binding**: in `create_workflow` tool (`workflow-tools.ts` ~lines 128-144), accept optional `documentIds: string[]` in each step definition. Insert into `workflowDocumentInputs` with `stepId = step.id`. Keep existing global `documentIds` param (inserts with `stepId = null`). The query side already works — `buildPoolDocumentContext(workflowId, stepId)` at `context-builder.ts:143-152` handles both global and step-scoped bindings.

## Acceptance Criteria

- [ ] Step state is NOT written to DB until task creation succeeds — verify by forcing task creation failure
- [ ] If `executeTaskWithRuntime` throws, step state rolls back to "failed" with error message preserved
- [ ] Errors are propagated (not swallowed) — workflow status reflects the failure
- [ ] `updateWorkflowState` throws a named error when workflow is missing (not silent return)
- [ ] Workflows in "active" state with 0 running/queued tasks can be re-executed (crash recovery)
- [ ] Workflows in "active" state with live tasks return 409 (genuinely running)
- [ ] Re-execution resets ALL step states to "pending" and cancels orphaned tasks
- [ ] `create_workflow` chat tool accepts per-step `documentIds` arrays in step definitions
- [ ] Global `documentIds` and step-scoped `documentIds` coexist correctly (both inserted into workflowDocumentInputs)
- [ ] `buildPoolDocumentContext` returns union of global + step-specific docs when both exist

## Scope Boundaries

**Included:**
- State machine atomicity (deferred writes + explicit rollback)
- Re-execution from crashed "active" state
- Full step state reset on re-execution
- Orphaned task cancellation
- Per-step document binding in create_workflow tool

**Excluded:**
- Partial re-execution (retry from failed step, skip completed steps) — future enhancement
- Step-level retry UI (covered in workflow-intelligence-observability)
- Document relevance scoring or automatic binding — future intelligence feature
- Workflow versioning or definition diffing — separate concern

## References

- Source: `ideas/analysis-chat-issues.md` — Issues 2, 5, 7
- Historical design: Relay git commit `da666406` — Feature 3
- Related features: `workflow-engine` (completed, this hardens it), `workflow-document-pool` (planned, this exposes step-level binding), `workflow-intelligence-observability` (enabled by this — needs reliable state for debug panel)
- Key files: `src/lib/workflows/engine.ts:720-841,903-914`, `src/app/api/workflows/[id]/execute/route.ts:23-47`, `src/lib/chat/tools/workflow-tools.ts:84-89,128-144`, `src/lib/documents/context-builder.ts:143-152`
