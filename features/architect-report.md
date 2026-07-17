---
generated: 2026-07-17
mode: impact
goal: G-097
---

# Architect Report

## Change Impact Analysis — Foundation context integrity

### Proposed change

Make project context an explicit, validated mutation contract for workflows and
documents; derive customer context through the linked project; and expose the
same truth in workflow status, workflow detail, project detail, project-aware
upload, and the workflow document picker.

### Blast radius

| Layer | Surfaces | Impact |
|---|---|---|
| Validation | workflow/project/document request schemas plus shared reference checks | distinguish omitted from explicit `null`; reject dangling project/customer/task/document IDs before mutation |
| Workflow mutations | workflow create/edit and document-binding routes | persist set/change/clear project intent and replace selected document bindings atomically |
| Document mutations | multipart upload, file-path upload, document edit | preserve a validated project association at creation or reassignment |
| Read contracts | workflow status and project Server Component | return/render real project and customer names without a duplicate or placeholder relationship badge |
| UI | workflow form/header, project detail, upload dialog, document picker | make context selection, readiness, failures, and navigation visible |
| Tests/staging | route, component, integration, desktop and narrow browser checks | protect the complete upload→project→ready→workflow-selection journey |

**Classification:** medium-high. The data model is unchanged, but one user
choice crosses validation, mutation, asynchronous processing, read contracts,
and two detail views. The change is release-blocking because the current route
can report a successful workflow edit while dropping `projectId`.

### Dependency trace

`projects.customerId` → project detail customer badge and downstream cost
attribution. `workflows.projectId` → working-directory execution context,
workflow status/header project link, and default document pool. A document's
`projectId` → workflow picker scope; processing status determines whether the
document is selectable, not whether it is visible.

### Decisions

1. Keep `documents.projectId` as the project association and derive customer
   context through `projects.customerId`. Do not duplicate `customerId` on
   documents.
2. Preserve TDR-004: initial project/workflow page reads stay direct Server
   Component queries; polling clients continue to use the existing status API.
3. Extend both arms of TDR-031's discriminated workflow status union with the
   common nullable `projectName`; do not flatten pattern-specific fields.
4. Keep TDR-017 fire-and-forget processing. The picker lists uploaded,
   processing, ready, and error documents, but only ready documents are
   selectable and every non-ready row names its state.
5. Keep TDR-022 junction tables. Workflow-level selections are replaced in one
   validated transaction; cross-project selection remains intentional and is
   not converted into project ownership reassignment.
6. Text IDs are validated as non-empty strings, not syntactically as UUIDs.
   TDR-013 describes application-generated UUIDs, but installed-pack and other
   durable IDs already use the text-key contract without guaranteeing UUID
   grammar.

### Migration requirements

- Database/schema/bootstrap migration: no.
- Public API versioning: no; additions are compatible and mutation failures
  become explicit 4xx responses.
- Feature flag: no; this repairs established Foundation behavior.
- New TDR: no. TDR-004, TDR-013, TDR-017, TDR-022, and TDR-031 already govern
  the relevant boundaries.

### Risks and mitigations

- **Omitted versus null drift:** schema parsing and explicit key-presence checks
  preserve `undefined = unchanged` and `null = clear`.
- **Dangling references:** shared reference checks return a named 404 before
  database mutation, including project/customer/task/document references.
- **Partial document replacement:** validate all IDs first, then delete/insert
  within one SQLite transaction.
- **Processing appears missing:** fetch the project pool without a `ready`
  filter, render status, and disable only non-ready rows.
- **Duplicate relationship UI:** the polled workflow header owns the one project
  badge; the PageShell no longer renders a second copy.
- **Async error invisibility:** upload, picker, and binding mutations surface
  non-2xx responses; processor failures retain the existing document error
  state and logging.
- **Pack-ID rejection:** schemas accept non-empty text IDs rather than `.uuid()`.

### Recommended approach

Proceed as one vertical slice: pin route regressions first, add shared reference
validation and mutation semantics, expose names through existing read paths,
then make upload and picker readiness truthful. Verify the real isolated
upload→project→ready→picker flow at desktop and narrow widths. No OCI rebuild is
needed unless runtime packaging inputs change; G-099 owns the subsequent
customer-identical artifact rerun.

---

*Generated by `/architect` — Change Impact Analysis mode*
