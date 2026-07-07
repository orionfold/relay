---
id: TDR-022
title: N:M document pool with junction tables for cross-entity binding
date: 2026-04-02
status: accepted
category: data-layer
---

# TDR-022: N:M document pool with junction tables for cross-entity binding

## Context

Documents were originally bound 1:1 to tasks via `documents.taskId`. As workflows evolved, documents needed to be shared across multiple workflow steps, reused across workflows, and inherited from project-level defaults. The 1:1 model couldn't express these relationships.

## Decision

Three junction tables implement N:M document binding:

- **`workflowDocumentInputs`**: Binds documents to workflows with optional step-level scoping (`stepId` — null means available to all steps). Unique index on `(workflowId, documentId, stepId)` prevents duplicates.
- **`scheduleDocumentInputs`**: Binds documents to schedules so fired tasks inherit document context. Unique index on `(scheduleId, documentId)`.
- **`projectDocumentDefaults`**: Binds documents at project level — these are auto-populated into new tasks/workflows created within that project. Unique index on `(projectId, documentId)`.

Document resolution (`src/lib/documents/document-resolver.ts`) assembles the full document context for any entity by merging: entity-specific bindings + project defaults + step-scoped inputs. The resolver supports glob pattern matching for document selection.

`buildPoolDocumentContext()` is injected into all 6 workflow execution patterns (sequential, parallel, conditional, loop, map, swarm) to provide document context at each step.

Cross-workflow chaining is enabled via URL parameter pre-population (`?inputDocs=id1,id2`) and an Output Dock UI on completed workflows with a "Chain Into New Workflow" action.

A shared `DocumentPickerSheet` component provides visual document pool browsing with configurable groupBy (workflow/project/source).

## Consequences

- Documents can be reused across any number of workflows, schedules, and projects without duplication.
- Step-level scoping enables precision — a 50-page PDF can be scoped to only the analysis step, not the summary step.
- Project defaults provide inheritance — set once, apply to all new entities.
- The junction table pattern is consistent across all three binding types, reducing cognitive load.
- The original `documents.taskId` FK is retained for backward compatibility (direct 1:1 task attachments).

## Alternatives Considered

- **JSON array of document IDs on each entity** — no referential integrity, no step scoping, harder to query.
- **Single polymorphic junction table** — requires `entityType` discriminator column; separate tables are cleaner and allow type-specific columns (like `stepId`).
- **Document copies per workflow** — wastes storage, creates consistency problems when source documents are updated.

## References

- `src/lib/db/schema.ts` — `workflowDocumentInputs`, `scheduleDocumentInputs`, `projectDocumentDefaults`
- `src/lib/documents/document-resolver.ts` — document pool resolution with glob matching
- `src/lib/documents/context-builder.ts` — `buildPoolDocumentContext()` for workflow execution
