---
title: Task summary and Inbox navigation affordances
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md G-043
dependencies: [task-board, inbox-notifications, task-output-rendering]
---

# Task summary and Inbox navigation affordances

## Outcome

Inbox notifications associated with tasks behave like the clickable operational
cards they appear to be, while the task side panel clearly distinguishes its
summary role from the full task-detail destination.

## Technical Approach

- Treat the non-interactive primary area of a navigable Inbox notification as
  one pointer and keyboard navigation target.
- Ignore nested links, buttons, inputs, permission controls, document rows, and
  active text selection before invoking task navigation.
- Keep mark-as-read secondary to navigation, but surface a named warning when
  that background mutation fails.
- Give the task side panel a stable `Task summary` title, preserve the selected
  task title beneath it, and place `Open task details` before a distinct Close
  control. The visible label collapses below `sm`, while the accessible name and
  native tooltip remain stable.

## Acceptance Criteria

- [x] Inbox task notifications navigate from header, body, result preview, and
  container whitespace with pointer activation.
- [x] Enter and Space activate the focused primary container.
- [x] Links, buttons, permission actions, downloads, document rows, and text
  selection do not trigger task navigation.
- [x] The task side panel is named `Task summary`, retains the selected task's
  identity, and exposes `Open task details` before a distinct Close control.
- [x] The task-detail destination remains `/tasks/{taskId}` for planned,
  running, completed, and failed tasks.
- [x] Accessible names, tooltips, DOM focus order, and visible focus classes are
  covered by component tests.
- [x] Desktop browser acceptance confirms the full Inbox card, nested Show more
  isolation, and task-summary header without overlap.
- [x] A 390px browser acceptance confirms the icon-only detail action and Close
  control do not overlap the `Task summary` header.

## Verification

- 14 focused tests pass across Inbox navigation, task-summary state coverage,
  and document-row isolation.
- `npm run build` passes TypeScript, compilation, and 94-page generation with
  the existing broad Turbopack file-trace warnings.
- Desktop in-app browser evidence confirms full-container navigation to
  `/tasks/e1fc6fd9-1e05-42af-86e1-aae4dd45a164`, nested Show more isolation,
  running-task identity, explicit detail/Close actions, and no console errors.
- Desktop artifact: `output/g043-task-summary-desktop.png`.
- Live 390×844 browser acceptance confirms the detail action collapses to its
  icon while preserving its accessible name, the detail and Close controls do
  not overlap each other or the `Task summary` heading, document width remains
  exactly 390px, and the browser console has no errors.

## Scope Boundaries

Included: Inbox task-linked notifications and the shared task-detail side
panel. Excluded: notification types without a task ID, task-route information
architecture, and changes to task lifecycle behavior.
