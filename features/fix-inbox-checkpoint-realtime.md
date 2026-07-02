---
title: Inbox checkpoint approvals appear in real time (no manual refresh)
status: done
priority: P2
milestone: mvp
source: _IDEAS/backlog.md
dependencies: []
---

## Verification run — 2026-07-02

**Root cause:** `InboxList` and `UnreadBadge` each polled `/api/notifications`
on a 10s `setInterval` and never subscribed to any stream, so a
workflow-blocking checkpoint (`type=permission_required` / `WorkflowCheckpoint`)
surfaced only on the next poll (~10-15s). The Monitor, by contrast, streams over
SSE. Crucially, a purpose-built SSE for exactly these rows already existed
(`/api/notifications/pending-approvals/stream`, ~750ms server-side tail, already
includes checkpoint rows via `listPendingApprovalPayloads`) — it just wasn't
consumed by the Inbox (only the ambient toast host used it).

**Fix (SSE-as-invalidation-signal):** both components now subscribe to that
existing stream and treat each snapshot's *arrival* as a "re-pull the
authoritative list" trigger — `InboxList` calls `refresh()`, `UnreadBadge` calls
`fetchCount()` — rather than rendering the approval-only payload directly. This
avoids merging two divergent data shapes: `/api/notifications` stays the single
source of truth for what renders (all types, read/unread). The 10s poll is kept
as the fallback for non-approval notification types and on SSE failure. Mirrors
`PendingApprovalHost`'s SSE lifecycle (close + poll-fallback on error).

**Verified:**
- Real dev-server smoke: subscribed to the SSE stream, inserted a
  `permission_required` / `WorkflowCheckpoint` row into the live `~/.relay`
  DB, measured **741ms** from insert to stream emit (< 2s acceptance).
  Since both components refresh on `onmessage`, the checkpoint + badge surface
  in ~1s vs the prior ~10-15s. Smoke row cleaned up.
- Touched files typecheck clean; notifications suite passes.

**Follow-up (unchanged scope):** the deliverable-preview-in-approval-card
enhancement remains split out (see Scope Boundaries → Excluded).

# Inbox checkpoint approvals appear in real time (no manual refresh)

## Description

When a workflow hits a human-in-the-loop checkpoint, the approval notification row is written to the DB
(`type=permission_required`, `WorkflowCheckpoint`) but the Inbox UI showed "0 shown / No
notifications" for ~15s until a manual refresh — then the badge jumped and both items rendered. Not a
lost approval, but a **time-critical, workflow-blocking checkpoint shouldn't require the user to
guess-refresh**: the workflow is stuck until they do. The Monitor stream is real-time; the Inbox lags —
so tightening the Inbox SSE/poll to match Monitor closes the gap.

This is friction (not a hard blocker — the approval isn't lost), but it undercuts the "governed,
unattended" promise: the one moment the user must act is the moment the UI goes quiet.

## User Story

As an agency owner, I want workflow checkpoint approvals to appear in my Inbox the instant they're
raised, so that a blocked workflow doesn't wait on me guessing to refresh.

## Technical Approach

- Compare the Inbox notification delivery (`inbox-notifications.md` surface) against the Monitor's
  real-time SSE — the Monitor already streams live, so mirror its subscription for inbox notification
  rows (`type=permission_required` / `WorkflowCheckpoint`).
- Either push new notifications over the existing SSE channel to the Inbox, or tighten the poll
  interval so a checkpoint surfaces within ~1-2s.
- **Enhancement (bundle if cheap):** the checkpoint card shows raw IDs (`workflowId`, `stepName`) but
  not the deliverable to review — surfacing a preview/diff of the produced artifact would make the
  human-in-the-loop review real, not a rubber-stamp. (Split out if it grows the unit.)

## Acceptance Criteria

- [ ] A workflow checkpoint notification appears in the Inbox within ~2s of being raised — no manual
      refresh needed (verified live against a running workflow).
- [ ] The Inbox badge count updates in real time alongside the row.

## Scope Boundaries

**Included:**
- Real-time delivery of checkpoint/permission notifications to the Inbox (SSE or tight poll).

**Excluded:**
- The deliverable-preview-in-approval-card enhancement (list as a follow-up unless trivially bundled).
- The broader approval-fatigue reduction (configuring workflow checkpoints + step auto-approve
  together) — that's the J6 friction opportunity, a separate unit.

## References

- Source: `_IDEAS/backlog.md` — J5 inbox-lag friction entry (+ J6 approval-fatigue opportunity, related).
- Related features: `inbox-notifications.md`, `ambient-approval-toast.md`,
  `workflow-learning-approval-reliability.md`, `monitoring-dashboard.md`.
