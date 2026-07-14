---
title: Tables Enrichment Planner UX
status: completed
priority: P1
milestone: post-mvp
source: internal history record
dependencies: [tables-enrichment-planner-api, workflow-ux-overhaul, operational-surface-foundation]
---

# Tables Enrichment Planner UX

## Description

Bring enrichment planning into the table detail experience so operators can configure, preview, and launch planner-backed enrichment runs without leaving the Data tab. The UX is intentionally operational: one sheet for setup and preview, one compact recent-run surface, and a handoff to the existing workflow status screens for detailed execution state.

This avoids inventing a separate enrichment product surface while still making the planner visible and editable before launch.

## User Story

As a table operator, I want to launch enrichment from the table itself, preview the planner’s recommended strategy, and jump into workflow status after launch, so the enrichment flow feels native to the table workflow instead of hidden behind chat or raw APIs.

## Technical Approach

- Add a primary `Enrich` action to the Data tab toolbar in the table detail screen.
- Introduce a right-side `TableEnrichmentSheet` that covers:
  - target column selection
  - optional row filter
  - `Auto plan` vs `Custom prompt`
  - optional profile override and batch size
  - planner preview with strategy, profile, reasoning, typed contract, step prompts, and sample bindings
- Mark preview state stale when inputs change after the last preview; require a fresh preview before launch.
- On successful launch:
  - close the sheet
  - show a toast with the launched row count
  - navigate to workflow status
- Add a compact “Recent Enrichments” section in the Data tab that shows recent planner-backed enrichment runs for the current table.
- Keep styling aligned with Calm Ops operational surfaces: `surface-card`, `surface-card-muted`, and `surface-control`.

## Acceptance Criteria

- [x] Table Data tab toolbar shows an `Enrich` action.
- [x] Operators can configure target column, optional filter, mode, profile override, and batch size in a sheet.
- [x] Preview shows strategy, reasoning, target contract, step prompts, and eligible row count before launch.
- [x] Launch is blocked when the preview is stale relative to current inputs.
- [x] Successful launch closes the sheet, shows feedback, and routes to workflow status.
- [x] Table Data tab shows recent planner-backed enrichment runs for the current table.
- [x] UX uses existing operational surface patterns rather than introducing a new visual system.

## Scope Boundaries

**Included:**
- Table detail toolbar entrypoint
- Planner sheet
- Recent-run summary surface
- Workflow-status handoff after launch

**Excluded:**
- A standalone enrichment dashboard
- Column-header enrichment shortcuts
- Inline workflow monitoring embedded in the spreadsheet grid

## References

- Source: `internal history record`
- Related features: `tables-enrichment-planner-api`, `workflow-ux-overhaul`, `operational-surface-foundation`
