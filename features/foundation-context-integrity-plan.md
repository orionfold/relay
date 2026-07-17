---
title: Foundation context integrity implementation plan
status: completed
goal: G-097
spec: features/foundation-context-integrity.md
date: 2026-07-17
---

# Foundation context integrity implementation plan

## What already exists

- SQLite foreign keys already connect projects→customers and workflows/
  documents→projects; no migration is needed.
- Project create/edit UI already carries `customerId`; the API lacks reference
  validation and project detail does not render the relationship.
- Workflow form already carries `projectId`, but PATCH ignores it and the form
  serializes clear as omission.
- Workflow status already carries `projectId` in both TDR-031 arms; the header
  renders a placeholder label while the Server Component independently renders
  a duplicate real-name badge.
- Multipart upload already owns file persistence/processing but always inserts
  `projectId: null`. File-path upload and document PATCH accept project IDs
  without checking their targets.
- `DocumentPickerSheet` and TDR-022 bindings exist, but the picker hides every
  non-ready document and turns fetch failures into an empty list. Workflow form
  attachment is append-only and best-effort.

## Vertical slices

### 1. Mutation reference contract

- Add reusable server-side reference checks for projects, customers, tasks, and
  document ID sets.
- Add Zod workflow create/edit schemas preserving omitted versus explicit null.
- Validate project/customer/task/document references before writes.
- Add focused real-database route tests before changing behavior.

### 2. Workflow project truth

- Persist workflow project set/change/clear on editable workflows.
- Join the project in the status route and add nullable `projectName` to both
  TDR-031 arms.
- Render one named workflow-header link and remove the duplicate PageShell
  relationship badge/query.
- Protect linked and unlinked cases with route/component tests.

### 3. Project/customer truth

- Join customer in the project Server Component.
- Render linked customer navigation and explicit unlinked fallback alongside
  status.
- Protect linked/unlinked display and invalid-reference mutations.

### 4. Project-aware document lifecycle

- Pass the current document project filter and project list into upload dialog.
- Persist/return validated `projectId` in multipart upload.
- Apply the same validation to file-path upload and document reassignment.
- Surface upload non-2xx responses and refresh failures.

### 5. Predictable workflow document pool

- Fetch project documents without the ready-only filter.
- Label readiness and disable non-ready rows without hiding them.
- Surface picker/project-list load failures.
- Add transactional `PUT` replace semantics for workflow-level bindings and
  make workflow save await/validate that mutation, including empty selection.

### 6. Integration and release-train evidence

- Run focused route/component tests, typecheck, lint or scoped lint if
  available, then the broader regression suite proportionate to the change.
- Start Relay with an isolated `RELAY_DATA_DIR`; verify upload→project→ready→
  picker→workflow binding through real HTTP and SQLite.
- Use the in-app Browser at desktop and narrow widths for the J1/J3 path; use
  the documented Playwright fallback only if the task's browser surface is
  stale.
- Fresh-review runtime/context/security regressions, update the spec/changelog/
  Host workstream/backlog, clean disposable state, and locally commit only
  goal-owned Relay changes.

## Acceptance mapping

| Spec criterion | Protecting evidence |
|---|---|
| 1 | workflow route tests: create/set/change/clear/missing target |
| 2 | project route tests: customer set/change/clear/missing target |
| 3 | status route + workflow header + project relationship render tests |
| 4 | multipart/file-path/document PATCH route tests |
| 5 | workflow-document PUT transaction tests, including invalid and empty |
| 6 | picker component tests for ready/processing/error and load error |
| 7 | isolated real-runtime HTTP/DB integration receipt |
| 8 | browser screenshots/notes at desktop and narrow viewports |

## Regression-test budget

- Approximately 20–30 focused assertions across route and component tests.
- One real asynchronous document-processing integration flow.
- Typecheck plus full unit/integration suite because the shared status type and
  common document picker have broad consumers.
- No runtime-registry import is planned; the special TDR-032 real-task smoke is
  therefore not triggered. If implementation touches a module transitively
  reachable from the runtime catalog, add that smoke before completion.

## Error and rescue

- Keep all route mutations fail-before-write where possible; use one SQLite
  transaction for binding replacement.
- Preserve the isolated data directory and failing inputs if asynchronous
  processing does not converge to ready; record processor error state instead
  of retrying blindly.
- Stop after two materially different approaches fail at the same boundary and
  report a compact evidence packet.

## NOT doing

- No schema migration, customer ID duplication, bulk reassignment, automatic
  project inference, OCI build/publication, version bump, release, or push.
