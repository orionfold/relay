---
title: Workflow Learning Approval Reliability
status: completed
shipped-date: 2026-05-03
priority: P1
milestone: post-mvp
source: internal history record
dependencies:
  - workflow-context-batching
  - inbox-notifications
  - learned-context-ux-completion
---

# Workflow Learning Approval Reliability

## Description

ainative already batches learned-context proposals at the workflow level, but the current runtime still leaks individual proposal notifications when child-task pattern extraction finishes after the workflow learning session has already closed. Table enrichment makes this obvious because one workflow can fan out over many rows, but the failure mode belongs to the shared workflow-learning pipeline rather than the enrichment planner itself.

The Inbox also treats responded learning notifications as still-active items. After an operator approves or rejects a context proposal, the underlying notification row is updated, but the default Inbox list continues to render it. That makes the approval queue look stale and undermines trust in the review flow.

This follow-up hardens the shared runtime and notification queue so workflow-scoped learning behaves like one reviewable batch, and responded learning items disappear from the active Inbox immediately without deleting historical records.

## User Story

As an operator running multi-row enrichments or other child-task workflows, I want one workflow-level learning review and immediate Inbox cleanup after I respond, so the approval flow feels trustworthy instead of noisy or stale.

## Technical Approach

- Update `src/lib/agents/claude-agent.ts` so completed task execution and resume paths await `analyzeForLearnedPatterns()` before final execution cleanup, while keeping extraction failures non-fatal and explicitly logged.
- Preserve the current `src/lib/agents/learning-session.ts` batching model, but ensure the learning session stays open long enough for late child-task extraction to buffer proposal row IDs before `closeLearningSession()` flushes the batch notification.
- Keep `src/lib/agents/pattern-extractor.ts` responsible for deciding between workflow-session buffering and standalone proposal creation; this slice changes timing reliability, not extraction quality or proposal formatting.
- Update Inbox data loading and active-list filtering so responded `context_proposal` and `context_proposal_batch` notifications are treated as resolved by default while remaining stored in `notifications`.
- Render `ContextProposalReview` for `context_proposal` and `BatchProposalReview` for `context_proposal_batch` inside the full Inbox item surface so approval behavior matches the pending-approval host.
- Keep existing approval endpoints and payload shapes unchanged:
  - `PATCH /api/profiles/[id]/context`
  - `POST /api/context/batch`

## Acceptance Criteria

- [x] Completed workflow child tasks await learned-pattern extraction before execution cleanup removes their runtime state — `src/lib/agents/claude-agent.ts:651-655` (initial path) and `:808-812` (resume path) both `await analyzeForLearnedPatterns(taskId, profileId)` before the `finally { clearPermissionCache; removeExecution }` cleanup block at lines 673-676.
- [x] Child-task proposals created while a workflow learning session is still active are buffered into that session instead of creating standalone `context_proposal` notifications — `src/lib/agents/pattern-extractor.ts:115` calls `bufferProposal(workflowId, rowId)` when `getTaskWorkflowId(taskId)` returns a workflow with an active session.
- [x] One workflow run produces at most one pending `context_proposal_batch` notification for its buffered proposals — `closeLearningSession` in `src/lib/agents/learning-session.ts:80-141` inserts exactly one notification with `type: "context_proposal_batch"` per workflow if `proposalIds.length > 0`, else zero.
- [x] Table enrichment across many rows no longer creates approval spam when workflow child tasks finish close to session shutdown — table enrichment runs through the workflow engine, which opens a session at `src/lib/workflows/engine.ts:83` (and `:1269` for the alternate path) and closes it at `:116`, `:193`, `:1332`, ensuring the buffer/flush boundary covers the entire workflow lifetime, including late child-task extraction.
- [x] Responded `context_proposal` notifications do not appear in the default Inbox list or default notifications fetch — `buildDefaultNotificationVisibilityCondition` in `src/lib/notifications/visibility.ts:31-33` excludes them from SQL; `filterDefaultVisibleNotifications` post-filters in JS. Used at: `src/app/inbox/page.tsx:23` (SQL where), `src/app/inbox/page.tsx:61` (initial post-filter), `src/app/api/notifications/route.ts:14` (API SQL where), `src/components/notifications/inbox-list.tsx:32` (initial state) and `:39` (live updates).
- [x] Responded `context_proposal_batch` notifications do not appear in the default Inbox list or default notifications fetch — same code path; the SQL condition at `src/lib/notifications/visibility.ts:32` enumerates both types in the `NOT IN` clause.
- [x] Approving or rejecting an individual context proposal removes it from the visible Inbox immediately after refresh — direct consequence of (5) plus the response/respondedAt write in `batchApproveProposals`/`batchRejectProposals` (`src/lib/agents/learning-session.ts:223-229`, `:297-304`) and the equivalent updates in the `PATCH /api/profiles/[id]/context` and `POST /api/context/batch` routes.
- [x] Approving or rejecting a batch proposal removes it from the visible Inbox immediately after refresh — `markBatchNotificationResponded` (`src/lib/agents/learning-session.ts:319-354`) sets `response` + `respondedAt` on the batch notification, which then matches the `respondedAt IS NOT NULL` branch of the visibility filter.
- [x] Existing `permission_required` notification behavior and Inbox rendering remain unchanged — `isLearningNotificationType` in `src/lib/notifications/visibility.ts:11-13` only matches the two learning types, so `permission_required` flows through unfiltered. Confirmed by `src/components/notifications/__tests__/permission-response-actions.test.tsx` (4 tests pass).

## Verification

Run on 2026-05-03:

- `npx vitest run src/lib/notifications src/lib/agents/__tests__/learning-session.test.ts src/lib/agents/__tests__/pattern-extractor.test.ts src/components/notifications` — **19/19 passed across 7 files**:
  - `learning-session.test.ts` (1 test) — buffer/flush lifecycle
  - `pattern-extractor.test.ts` (7 tests) — including session buffering vs standalone notification branches
  - `visibility.test.ts` (2 tests) — `isResolvedLearningNotification` + `filterDefaultVisibleNotifications`
  - `batch-proposal-review.test.tsx` (2 tests)
  - `permission-response-actions.test.tsx` (4 tests) — pins AC #9 (permission_required unchanged)
  - `notification-item.test.tsx` (2 tests) — context_proposal + context_proposal_batch icon/label/render branches
  - `pending-approval-host.test.tsx` (1 test) — overflow + detail dialog

## Design Decisions

### Visibility filter is doubled in SQL and JS

`buildDefaultNotificationVisibilityCondition` runs in the database query, and `filterDefaultVisibleNotifications` runs against the in-memory list. The SQL filter cuts the wire payload; the JS filter handles live mutations after a user responds (where the SQL query is not re-issued until the next refresh). Both call paths exist in `src/components/notifications/inbox-list.tsx` (initial state at line 32, post-update setter at line 39) so an approve/reject action drops the notification from the visible list immediately, before any server round-trip. This matches MEMORY.md's "Zero silent failures" engineering principle — the user always sees their action take effect.

### Workflow engine owns session lifecycle, not the runtime adapter

`openLearningSession`/`closeLearningSession` are called from `src/lib/workflows/engine.ts`, not from the per-runtime adapters under `src/lib/agents/runtime/`. This keeps the buffering boundary tied to the workflow lifecycle rather than the model/runtime choice — a workflow run gets one batch notification regardless of whether its child tasks ran on Claude Agent SDK, Codex, OpenAI direct, or Anthropic direct. This is the right level for the abstraction: the operator approves what the workflow learned, not what each individual runtime emitted.

### Pattern extraction is awaited but its failures are non-fatal

`claude-agent.ts:651-655` and `:808-812` wrap `await analyzeForLearnedPatterns(...)` in a `try/catch` that logs to `console.error` but does not rethrow. This is intentional: the spec is about *reliability of approval delivery*, not about extraction correctness. A failed extraction still flushes whatever proposals had been buffered (the buffer survives across the failed analyze call), and the workflow itself completes normally.

## Scope Boundaries

**Included:**
- Workflow child-task extraction timing hardening
- Workflow learning-session close behavior
- Active Inbox filtering for responded learning notifications
- Full Inbox review actions for learning notifications
- Regression coverage for runtime batching and Inbox resolution behavior

**Excluded:**
- Table enrichment planner changes
- Proposal extraction heuristics or quality tuning
- Learned-context schema changes
- New approval routes or payload contracts
- Deleting historical responded notifications from the database

## References

- Source: `internal history record`
- Related features: `workflow-context-batching`, `inbox-notifications`, `learned-context-ux-completion`, `tables-enrichment-planner-ux`
