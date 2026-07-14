---
title: Ambient Approval Toast
status: completed
priority: P1
milestone: post-mvp
source: ideas/mvp-vision.md
dependencies: [app-shell, inbox-notifications, tool-permission-persistence]
---

# Ambient Approval Toast

## Description

ainative's current human-in-the-loop model is inbox-first: permission requests are persisted correctly, the unread badge increments, and the user can respond once they navigate into `/inbox`. In live workflow supervision, that is not sufficient. A user watching a task or workflow run can miss a newly blocked permission because the unread badge changes in peripheral chrome while the active route remains visually unchanged.

This feature adds an in-app approval toast that appears above the current route, lets the user approve or deny directly in that surface, and preserves the Inbox as the durable audit log. The primary goal is not "more notifications." The goal is to keep the user in the current supervision context while still making permission requests impossible to miss.

The first shipped slice is browser/app-shell native: a global toast host, a compact approval card, and an expanded detail state for full context. The implementation should also introduce a channel abstraction so the same approval payload can later drive browser notifications and Tauri/macOS native notifications without changing the underlying permission model.

## User Story

As a user supervising an active task or workflow, I want permission requests to surface in place and be actionable immediately so that I do not have to notice a small unread badge, switch to Inbox, and reconstruct what just blocked the run.

## Technical Approach

### Product Shape

- Keep `notifications` as the canonical source of truth and keep Inbox as the durable record of all approvals and responses.
- Add a global approval host in the app shell so permission requests can surface on any route, including workflows, tasks, monitor, and documents.
- Treat this as an extension of the existing permission model, not a second approval system.

### Interaction Model

- On desktop, show a single pinned approval toast in the lower-right corner of the viewport, offset from page chrome.
- The default state is a compact, non-blocking card that animates in with a short slide/fade and does not steal focus.
- The compact card shows:
  - permission type (`Write`, `Bash`, etc.)
  - task/workflow context
  - one-line summary of the target file path or command
  - inline actions: `Allow Once`, `Always Allow`, `Deny`
  - secondary action: `Open Inbox`
- Clicking the toast body expands it into a modal-like detail panel with full permission context, larger action targets, and keyboard focus management.
- If multiple permission requests arrive, show one active card plus a `+N more` stacked indicator. The newest unresolved permission is primary.
- Unresolved permissions must not auto-dismiss. They may collapse to a minimized chip, but they remain visibly pending until answered or the underlying notification is resolved elsewhere.
- On mobile, render the same interaction as a bottom sheet rather than a corner toast.

### UI Architecture

- Add a shell-level component such as `PendingApprovalHost` mounted from the app shell rather than the Inbox page.
- Extract shared permission response controls from the Inbox card path so the toast and Inbox use the same response logic and copy.
- Use glass surfaces for the toast and expanded panel because they are shell chrome, not dense list content.
- Keep colors semantic:
  - `status-warning` or `chart-5` for pending attention
  - `status-completed` confirmation state after approval
  - `status-failed` for denial or timeout state messaging

### Data and Delivery Model

- Add a notification presenter layer that subscribes to newly created unresolved `permission_required` notifications.
- Replace the current "badge-only on 10s polling" experience for active routes with near-real-time delivery, preferably via SSE and polling fallback.
- Deduplicate by `notification.id` so the same approval request cannot render multiple toasts even if multiple clients or channel adapters observe it.
- Preserve Inbox mutation semantics: responding from the toast writes the same `response`, `respondedAt`, and `read` fields as responding from Inbox.

### Future-Proof Notification Channels

- Introduce a channel-agnostic payload for actionable notifications with:
  - `notificationId`
  - `taskId`
  - `workflowId` if present
  - `toolName`
  - compact summary text
  - deep-link target
  - supported action IDs (`allow_once`, `always_allow`, `deny`, `open_inbox`)
- Ship only the in-app presenter in this slice.
- Design the presenter so future adapters can subscribe to the same payload:
  - browser Notification API when the tab is hidden or unfocused
  - Tauri native notification bridge for desktop
  - future macOS-specific action buttons if the desktop runtime supports them cleanly
- Native/browser channels should deep-link back into the in-app approval surface instead of introducing a separate approval state machine.

### Accessibility and Motion

- New approval requests announce through a polite live region without abruptly stealing focus.
- The expanded detail state uses dialog semantics, traps focus while open, supports `Escape`, and returns focus to the invoking element.
- The unresolved compact toast must remain keyboard reachable from the current route.
- Motion should be short and informative:
  - enter: slide/fade 180-220ms
  - resolve: brief success/failure morph 120-160ms
  - no bounce, shake, or looping pulsing that competes with operational content

## Acceptance Criteria

- [x] A new unresolved `permission_required` notification appears as an in-app approval toast on any route without requiring Inbox navigation.
- [x] The approval toast shows the task or workflow context plus a compact summary of the command or file path being approved.
- [x] Users can `Allow Once`, `Always Allow`, or `Deny` directly from the toast.
- [x] Responding from the toast updates the canonical notification record exactly as Inbox response actions do.
- [x] The Inbox continues to show the same notification as the durable audit record, including responded state.
- [x] The toast does not steal focus on arrival, but it is keyboard reachable and screen-reader announced.
- [x] Expanding the toast opens a modal-like detail view with full context and proper focus return on close.
- [x] Multiple pending approvals are handled as a stack with one primary toast and an explicit overflow count rather than overlapping cards.
- [x] Unresolved permission toasts do not silently disappear before the user acts.
- [x] The presentation layer deduplicates by notification ID so one approval request cannot create multiple visible toasts.
- [x] The implementation introduces a channel abstraction so browser and Tauri/macOS notification adapters can reuse the same payload and action IDs later.
- [x] Mobile uses a bottom-sheet variant instead of a corner toast while preserving the same actions and semantics.

## Scope Boundaries

**Included:**
- In-app permission toast host available on all routes
- Compact toast + expanded detail state
- Inline permission response actions
- Near-real-time delivery for unresolved permission notifications
- Queue/stack handling for multiple pending approvals
- Shared action logic between Inbox and toast
- Channel abstraction for future browser/Tauri notification delivery

**Excluded:**
- Shipping browser Notification API prompts or delivery in this first slice
- Shipping Tauri/macOS native notification delivery in this first slice
- Native notification action buttons handled fully outside the app UI
- Extending the toast surface to completions, failures, or general agent messages
- User-configurable notification rules, snooze windows, or routing preferences
- Replacing Inbox as the canonical approval history

## References

- [inbox-notifications.md](inbox-notifications.md)
- [tool-permission-persistence.md](tool-permission-persistence.md)
- Retired desktop-shell design record (internal history)
- Source: `ideas/mvp-vision.md` human-in-the-loop and inbox sections
