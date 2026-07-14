---
title: Approval Resolution Exactly Once
status: completed
shipped-date: 2026-07-12
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md G-044
dependencies:
  - ambient-approval-toast
  - inbox-notifications
  - tool-permission-persistence
  - workflow-learning-approval-reliability
---

# Approval Resolution Exactly Once

## Description

Relay presents tool permissions, agent questions, individual context proposals,
and workflow-level context batches in both the ambient `Permission required`
host and Inbox. Those surfaces previously shared controls but not a complete
resolution contract: two mounted views could submit concurrently, context
decisions could create duplicate learned-context versions, batch review removed
itself before the server acknowledged the mutation, and stale SSE/poll snapshots
could resurrect a locally completed request. A runtime timeout also returned a
denial without resolving its notification, leaving an approval that could no
longer unblock work.

This feature makes the notification response the single durable claim for all
approval contracts. The side effect and response commit together, clients remove
only after a validated acknowledgement, and locally resolved IDs cannot return
from an older snapshot.

## User Story

As an operator supervising governed work, I want every permission or proposal
decision to take effect once and remain settled so I can trust that one click
unblocks the intended work without duplicate changes or stale approval cards.

## Technical Approach

- Add named approval errors and stable response codes for missing, already
  resolved, type-mismatched, payload-mismatched, malformed, and persistence
  failures.
- Resolve tool permissions inside one SQLite transaction. `Always Allow` updates
  the saved permission-pattern setting in the same transaction as the
  notification response, so neither record can commit alone.
- Resolve individual and batch context proposals inside transactions that
  validate notification type and proposal ownership, insert learned-context
  versions, and conditionally claim the unresolved notification.
- Require `notificationId` on the batch endpoint and verify its stored proposal
  IDs exactly match the submitted batch instead of scanning unresolved
  notifications for any overlapping ID.
- Use one client mutation guard and resolved event across ambient/detail/Inbox
  surfaces. Successful actions broadcast immediate removal; session tombstones
  filter stale SSE and poll snapshots.
- Keep failed controls mounted, restore button availability, and render an
  inline named explanation in addition to the toast.
- On the 55-second runtime boundary, conditionally persist the timeout denial.
  If a user response wins that race, return the durable user decision to the
  runtime.

## Acceptance Criteria

- [x] Allow Once, Always Allow, Deny, and question replies write at most one
  durable permission response.
- [x] Always Allow cannot leave a response without its permission pattern or a
  pattern without its response.
- [x] Individual context approve/reject creates exactly one decision version and
  validates the proposal's profile.
- [x] Batch context approve/reject resolves only the notification whose complete
  proposal-ID set matches the submitted payload.
- [x] Missing, already-resolved, type/payload mismatch, malformed response, and
  persistence failures have named codes and visible retry/refresh guidance.
- [x] A second mounted surface does not issue a second network mutation while
  the first response is in flight.
- [x] Success is not dismissed before a validated server acknowledgement.
- [x] Compact host, detail dialog/sheet, and Inbox remove a successful decision
  immediately and stale SSE/poll snapshots cannot restore it.
- [x] A runtime timeout durably denies and removes the request; a user decision
  racing the timeout is returned instead of overwritten.
- [x] A real Claude Code task paused on `npm publish --dry-run`, was approved
  once from the shared surface, resumed, and completed successfully.

## Verification

Run on 2026-07-12:

- Reproduced the original batch defect in the former component test: its
  `onResponded` callback fired before the pending fetch completed.
- The expanded G-044 regression command — approval API, resolution services,
  permission runtime, and all affected notification surfaces — passed **82/82
  tests across 9 files**, including question replies and the persisted timeout
  path.
- `npm run build` — passed TypeScript, route compilation, and 94-page static
  generation; existing Turbopack broad-file-trace warnings remain unchanged.
- Live `npm run dev` acceptance task
  `e1fc6fd9-1e05-42af-86e1-aae4dd45a164`:
  - Claude Code emitted a real Bash permission for `npm publish --dry-run`.
  - Desktop compact card and detail dialog exposed the same action set.
  - At 390px the bottom sheet retained full command context and usable stacked
    actions without horizontal overflow.
  - Allow Once persisted one response at
    `73ab56eb-1d6c-4cbe-82c9-8982242d8c25`, immediately advanced the ambient
    overflow queue, disappeared from Inbox, stayed absent after reload/API
    refetch, and the task completed successfully.

The repository-wide Vitest command also ran **3,064 passing tests**. The
remaining failures were outside the modified G-044 surfaces (legacy router and
settings assertions, pack fixture drift, private-reference lint in the strategy
backlog, sandboxed local HTTP/E2E reachability); a clean baseline for those
failures was not established. The G-044-owned suites and affected Claude timeout
suite pass independently.

## Design Decisions

### The notification response is the compare-and-set claim

No new approval table or merged response schema was introduced. Each contract
keeps its existing response shape, while `notifications.response IS NULL` is the
shared unresolved predicate. Conditional updates make a second session receive
`APPROVAL_ALREADY_RESOLVED` rather than repeat a side effect.

### Client tombstones last for the browser session

An ID resolved by this page remains filtered for the rest of the session. A
notification ID is immutable and never reused, so retaining the tombstone is
safer than trying to infer when every SSE/poll producer has observed the write.
Reload starts from authoritative database state and provides the second-session
control.

### Summarization follows the durable context commit

Context summarization remains asynchronous and non-blocking after an approved
proposal commits. A summarization failure is logged explicitly but does not roll
back an already accepted operator decision or make the approval reappear.

## Scope Boundaries

Included: shared permission/question responses, individual/batch context
decisions, runtime timeout reconciliation, ambient/detail/Inbox client state,
and responsive acceptance.

Excluded: changing which SDK tools require approval, redesigning approval copy,
or deleting historical responded notifications from Inbox history.
