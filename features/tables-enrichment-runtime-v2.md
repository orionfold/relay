---
title: Tables Enrichment Runtime V2
status: completed
priority: P1
milestone: post-mvp
source: internal history record
dependencies: [bulk-row-enrichment, workflow-engine, workflow-runtime-configuration]
---

# Tables Enrichment Runtime V2

## Description

Upgrade the row-driven enrichment runtime from a single-step writeback helper into a richer per-row execution primitive. The outer orchestration remains one workflow iteration per table row, but each row can now execute multiple planned steps before the final typed writeback happens.

This is the runtime layer that makes planner-driven enrichment viable. It keeps the base primitive generic so CRM, research, support, finance, and product-ops tables can all reuse the same loop engine without forking domain behavior into Growth-specific code.

## User Story

As an operator enriching a table column, I want each row to run the right number of agent steps and write back only a validated final value, so the workflow can handle both simple lookups and deeper synthesis without corrupting table data.

## Technical Approach

- Extend row-driven loop execution so `definition.steps[]` becomes an inner per-row sequence instead of assuming a single prompt.
- Bind row-step context for prompt interpolation:
  - `{{row.field}}` for current row data
  - `{{previous}}` for the previous step output inside the same row
  - `{{stepOutputs.stepId}}` for earlier step outputs inside the same row
- Keep autonomous non-row loop behavior unchanged; only row-driven loops get the richer inner sequence path.
- Restrict `postAction.update_row` to the final enrichment step and validate the final output against the target column contract before writeback.
- Support typed final contracts for `text`, `url`, `email`, `select`, `boolean`, and `number`.
- Skip invalid, empty, or `NOT_FOUND` final outputs without overwriting the target cell; emit named `agent_logs` events for skipped and invalid cases.
- Continue processing later rows when one row iteration fails; per-row failure should not abort the whole enrichment job.

## Acceptance Criteria

- [x] Row-driven loop workflows can execute multiple inner steps per row.
- [x] `{{row.field}}`, `{{previous}}`, and `{{stepOutputs.stepId}}` resolve in row-step prompts.
- [x] Only the final enrichment step performs row writeback.
- [x] Final writeback validates against the target column type before updating the row.
- [x] Invalid final outputs are logged and skipped rather than written into the table.
- [x] `NOT_FOUND` and empty values are skipped without failing the whole workflow.
- [x] A failed row iteration does not stop later rows from running.
- [x] Existing single-step enrichment workflows still run without requiring planner metadata.

## Scope Boundaries

**Included:**
- Multi-step row execution inside loop workflows
- Row prompt interpolation and prior-step context
- Typed output normalization for supported enrichment column types
- Row-level logging for skipped and invalid writeback cases

**Excluded:**
- Parallel row execution
- Multi-column writeback from one enrichment job
- New workflow-engine patterns outside row-driven enrichment

## References

- Source: `internal history record`
- Related features: `bulk-row-enrichment`, `workflow-engine`, `workflow-runtime-configuration`
