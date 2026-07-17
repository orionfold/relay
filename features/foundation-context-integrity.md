---
title: Foundation customer, project, and document context integrity
status: accepted
goal: G-097
date: 2026-07-17
dependencies:
  - relay-cell-identity
  - workflow-document-pool
---

# Foundation context integrity

## Outcome

Foundation carries an operator's selected customer, project, and document
context from creation through editing, processing, selection, and detail views.
No successful response may silently discard an association.

## Scope challenge

- **REDUCE:** repair only the workflow `projectId` PATCH. Rejected because the
  R1 staging failure is an end-to-end context break: the same project/customer
  truth must remain visible and uploaded documents must enter the selected
  project's workflow pool.
- **PROCEED:** validated project/customer/document references, truthful
  relationship links, project-aware upload, readiness-aware picker, and
  deterministic workflow document replacement. Selected.
- **EXPAND:** implicit customer inheritance fields, automatic reassignment,
  bulk migration, and destructive cross-project moves. Deferred.

## Contracts

### Reference semantics

- A missing request key leaves an existing association unchanged.
- An explicit `null` clears a nullable association.
- A non-null ID must be a non-empty text key and must resolve before mutation.
- Invalid workflow project, document project/task, project customer, or
  workflow document references return a specific 4xx response. They never rely
  on a raw foreign-key exception as product behavior.
- Global documents and unlinked workflows remain supported.

### Workflow context

- Workflow create accepts a validated optional project.
- Workflow edit can set, change, or explicitly clear `projectId` while
  preserving the existing draft/completed/failed edit rules.
- Both workflow status response arms include `projectId` and `projectName`.
- The workflow header renders one linked project badge using the real name.
  Unlinked workflows render no fake `Project` badge.
- Workflow-level document selections are replace-all: an empty array clears,
  every ID is validated before mutation, and a failure prevents the form from
  claiming that save completed.

### Customer context

- Project create/edit validates any referenced customer while retaining
  explicit-null clearing.
- Project detail reads its linked customer in the Server Component and renders
  a navigable customer badge. An unlinked project displays an honest
  `No customer` fallback.
- Documents do not duplicate customer ownership. Their customer context is the
  customer currently linked to their project.

### Document context and readiness

- Multipart and file-path upload may include an optional validated project.
  The document is inserted with that project from its first database row.
- Document reassignment validates the destination project and referenced task;
  explicit `null` still clears either association.
- The Documents upload dialog offers an optional Project selector. When the
  Documents view is filtered to a project, that project is the upload default.
- The workflow picker lists all documents in its selected project regardless
  of processing state. Only `ready` rows may be selected. Uploaded, processing,
  and error rows name their state; errors remain inspectable.
- Fetch and mutation failures are visible rather than being converted into an
  empty pool or a success toast.

## Acceptance criteria

1. Route regressions prove workflow create/set/change/clear and reject a
   missing project without changing the row.
2. Route regressions prove project customer set/change/clear and reject a
   missing customer without changing the row.
3. Status/component regressions prove the real project name/link and unlinked
   fallback; project detail proves linked customer name/link and unlinked
   fallback.
4. Upload/document regressions prove valid project persistence, invalid project
   rejection, task validation, and explicit-null clearing.
5. Workflow document replacement validates all referenced documents, replaces
   atomically, and supports an empty selection.
6. Picker regressions prove processing/error rows remain visible but cannot be
   selected, while ready rows can.
7. An isolated integration run proves upload→project association→ready state→
   workflow picker visibility and binding without modifying the default Relay
   database.
8. Desktop and narrow browser verification repeats the Foundation J1/J3 path
   and captures relationship labels, readiness, association, and clear/edit
   behavior.

## Not in scope

- A new document/customer schema relationship.
- Automatic document reassignment when a workflow changes project.
- Bulk ownership migration or destructive cross-project moves.
- Changing working-directory execution, customer attribution, or Cell
  isolation into one combined identity.
- Rebuilding/publishing the OCI artifact or releasing Relay; G-099 and the
  release train own those gates.

## Rescue and rollback

After two materially different implementations fail on the same boundary,
stop with the failing request, response, database row, and focused test. All
changes are additive validation/read-contract/UI changes over the existing
schema. Rollback is a code revert; no database migration or external state is
created.

## Acceptance receipt — 2026-07-17

- Seven focused route/component files plus the workflow-form hydration
  regression passed with 20 assertions; the full suite passed 3,632 tests
  (3,631 passed, one intentionally skipped).
- TypeScript, the production Next build, design-token validation, test-project
  classification, public-boundary checks, local documentation links, and all
  source-derived user-guide/API/product-stat gates passed.
- A real isolated Relay server under `/tmp/relay-g097-acceptance` proved
  customer→project set/clear/reset, project-aware multipart upload,
  processing→ready, workflow project set/clear/reset, atomic document
  clear/rebind, status-name propagation, and invalid-reference refusal.
- In-app Browser acceptance proved the linked customer on project detail, the
  linked project on workflow detail and edit, the ready project document in
  the workflow picker, and the project-preselected Documents upload dialog.
  The first pass exposed a Radix Select hydration defect; synchronous
  server-provided project state plus a component regression fixed it before
  acceptance. Because the in-app Browser viewport override remained at 1280px,
  the documented isolated Playwright fallback repeated project-detail
  acceptance at 768×900; the customer context remained visible and the page
  measured 768px wide with no horizontal overflow. Evidence is retained under
  `output/playwright/g097-narrow/`.
- No schema migration, OCI rebuild, release, publish, push, or operator data
  mutation occurred. G-099 owns the rebuilt-artifact customer-identical rerun.

## References

- `_IDEAS/backlog.md` — G-097
- `output/staging/2026-07-17-g025-r1/EVALUATION.md`
- `features/workflow-document-pool.md`
- `features/fix-project-customer-link-ui.md`
- TDR-004, TDR-013, TDR-017, TDR-022, TDR-031
