---
title: Tables Enrichment Planner API
status: completed
priority: P1
milestone: post-mvp
source: internal history record
dependencies: [tables-enrichment-runtime-v2, provider-runtime-abstraction, tables-agent-integration]
---

# Tables Enrichment Planner API

## Description

Add a planner-backed API layer in front of table enrichment so operators can preview the strategy, prompts, profile, and typed contract before launching a background run. This promotes enrichment from a static API into a generic planning primitive that can choose a cheaper single-pass path or a richer research-and-synthesize path depending on the target column and prompt intent.

The planner stays base-product generic. It can accept operator guidance and planner hints, but it does not encode Growth-specific playbooks or Contacts-specific heuristics.

## User Story

As an operator preparing a table enrichment run, I want to preview the recommended strategy and final writeback contract before launch, so I can confirm the plan matches my target column and row scope.

## Technical Approach

- Add `POST /api/tables/[id]/enrich/plan` to preview a launch plan without creating a workflow.
- Expand `POST /api/tables/[id]/enrich` to accept planner-backed launches in addition to the original custom-prompt path.
- Keep the planner strategy set fixed in v2:
  - `single-pass-lookup`
  - `single-pass-classify`
  - `research-and-synthesize`
- Generate a typed target contract from the selected table column and include it in both preview and workflow metadata.
- Validate submitted plans server-side before launch so UI-side edits cannot bypass the typed contract or step requirements.
- Persist enrichment metadata on the workflow definition so later UX can show recent runs without new database schema.
- Keep old `prompt + targetColumn` callers working by treating them as custom-mode launches.

## Acceptance Criteria

- [x] `POST /api/tables/[id]/enrich/plan` returns strategy, profile, steps, reasoning, target contract, eligible row count, and sample bindings.
- [x] `POST /api/tables/[id]/enrich` accepts planner-backed launches and validates submitted plans server-side.
- [x] Unsupported target column types return 400 with an actionable error.
- [x] Existing custom-prompt enrichment callers remain compatible.
- [x] Planner metadata is persisted on created workflows for later UX.
- [x] Recent enrichment runs can be queried per table without schema changes.

## Scope Boundaries

**Included:**
- Preview endpoint
- Launch validation
- Heuristic planner for supported table column types
- Workflow metadata for recent-run UX

**Excluded:**
- Domain-specific planner adapters
- Persisted planner drafts
- Force-overwrite mode for already-populated cells

## References

- Source: `internal history record`
- Related features: `tables-enrichment-runtime-v2`, `bulk-row-enrichment`, `tables-agent-integration`
