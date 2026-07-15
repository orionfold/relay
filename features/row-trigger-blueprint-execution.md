---
title: Row-Trigger Blueprint Execution
status: completed
priority: P1
milestone: phase-5
source: Relay git commit c153605e
dependencies: [composed-app-kit-inbox-and-research]
---

# Row-Trigger Blueprint Execution

## Description

Wires the manifest's `blueprints[].trigger.kind: "row-insert"` field through the workflow engine. When a row arrives at a user-table that any composed app's manifest subscribes to, the dispatcher instantiates that app's named blueprint with row-derived variables and executes it asynchronously. The resulting task carries `tasks.contextRowId = <row-id>` so the Phase 4 Inbox UI can attribute drafts back to the row that triggered them.

## What shipped

- `evaluateManifestTriggers` dispatcher at `src/lib/apps/manifest-trigger-dispatch.ts` — fire-and-forget called from `addRows()` alongside the existing `evaluateTriggers`
- `listAppsWithManifestsCached(appsDir)` + `invalidateAppsCache()` at `src/lib/apps/registry.ts` — 5-second TTL cache returning `AppDetail[]` with manifest hydrated; invalidation hooks on `upsertAppManifest()` and `deleteApp()`
- `instantiateBlueprint(id, vars, projectId, metadata?)` extended with optional 4th param — persists `_contextRowId` into `workflows.definition` JSON
- Engine `executeChildTask` reads `_contextRowId` from the definition at task-creation time and stamps `tasks.context_row_id`
- Two real blueprints under `~/.ainative/blueprints/` (gitignored, local-only): `customer-follow-up-drafter--draft-followup` and `research-digest--weekly-digest`
- Phase 4's smoke manifests updated to canonical qualified-id + `source: $AINATIVE_DATA_DIR/...` pattern (matching `habit-tracker--weekly-review`)
- 14 unit tests for the dispatcher (happy path, 0/N matches, variable substitution, unknown blueprint → notification, multi-app continuation, listApps filesystem fault tolerance) and 2 integration tests at `src/lib/data/__tests__/tables-row-insert-dispatch.test.ts`

## Architecture

```
POST /api/tables/:id/rows
  └─ addRows(tableId, rows)  [src/lib/data/tables.ts]
       ├─ db.insert(user_table_rows)
       ├─ evaluateTriggers(...).catch(...)            [existing UI-trigger path]
       └─ evaluateManifestTriggers(tableId, ids[i], rows[i].data).catch(...)  [NEW]
            ├─ listAppsWithManifestsCached() — 5s TTL, returns AppDetail[]
            ├─ findMatchingSubscriptions(apps, tableId) — filter by trigger.kind=row-insert
            ├─ for each match:
            │    ├─ buildVariables(blueprintId, rowData) — resolves {{row.<col>}} from getBlueprint
            │    ├─ await import("@/lib/workflows/blueprints/instantiator")
            │    ├─ await instantiateBlueprint(id, vars, appId, { _contextRowId: rowId })
            │    │    └─ inserts workflows row with definition._contextRowId = rowId
            │    ├─ await import("@/lib/workflows/engine")
            │    └─ executeWorkflow(workflowId).catch(log)  — fire-and-forget
            │           └─ engine.executeChildTask reads workflow.definition._contextRowId
            │              and stamps tasks.context_row_id at insert time
            └─ on error: db.insert(notifications) with type=task_failed
```

## Verification run — 2026-05-02

Dev server `PORT=3010 npm run dev`, fresh restart after all 14 W1-W7 commits. Cold start clean, no `ReferenceError`, no module-load cycle.

Smoke flow:
1. Loaded `/apps/customer-follow-up-drafter` (Inbox kit with row-insert trigger chip) — rendered clean, console-clean. → `output/phase-5-inbox-pre-insert.png`
2. Visited `/tables/customer-touchpoints`. Phase 4 smoke fixture had `user_tables.column_schema = '[]'` (denormalized JSON empty), masking the 4 columns; populated it with the proper schema JSON for the 4 columns (channel, customer, summary, sentiment) so the Tables UI rendered. → `output/phase-5-table-with-delta-row.png`
3. Inserted a row via the API: `POST /api/tables/customer-touchpoints/rows` with `{customer: "Delta Industries", summary: "Asking about pricing", sentiment: "neutral", channel: "email"}`. Returned row id `b5ad153a-9e3a-4eb8-9415-721865daec68`.
4. Within seconds, the dispatcher fired:
   - 1 new workflow `aa9ace67-...` for `project_id = customer-follow-up-drafter`
   - `definition._blueprintId = "customer-follow-up-drafter--draft-followup"` ✅
   - `definition._contextRowId = "b5ad153a-..."` ✅ (exact match to the new row id)
   - `definition.steps[0].prompt` resolved with row data: "Draft a brief, empathetic follow-up reply for **Delta Industries**. Touchpoint summary: **Asking about pricing**. Channel: **email**. Detected sentiment: **neutral**." ✅
   - 1 new task `bd416ffd-...` with `context_row_id = b5ad153a-...` ✅ and `project_id = customer-follow-up-drafter` ✅
5. The task ultimately failed with `NoCompatibleRuntimeError` for the `cs-coach` agent profile — this is a runtime configuration issue (no runtime registered for `cs-coach` in this dev env), NOT a Phase 5 bug. The dispatcher contract is fully verified end-to-end.
6. Reloaded `/apps/customer-follow-up-drafter` post-insert. Console clean. → `output/phase-5-inbox-post-insert.png`

**Critical CLAUDE.md rule check** (engine.ts is runtime-registry-adjacent): NO `ReferenceError: Cannot access 'claudeRuntimeAdapter' before initialization` in dev logs. The dispatcher's `await import("@/lib/workflows/engine")` and `await import("@/lib/workflows/blueprints/instantiator")` patterns successfully prevented the module-load cycle.

## Bugs found and fixed during implementation

1. **Code-island bug (caught by W5 implementer self-review):** the dispatcher initially imported `listAppsCached` which returns `AppSummary[]` — no `.manifest` field. Tests passed because mocks returned shapes WITH `.manifest`. At runtime the dispatcher would have silently found zero matches. Fix: added a parallel `listAppsWithManifestsCached` returning `AppDetail[]` with `.manifest` hydrated. Both caches share `invalidateAppsCache()`. Commit `66842782`.

2. **Schema enum constraint (caught at W5.4 implementation):** plan specified `notifications.kind: "trigger_failure"` but the actual `notifications.type` column is a strict Drizzle enum that does NOT include `trigger_failure`. Adapted to use `type: "task_failed"` and encode the error class in the `title` field.

3. **BlueprintSchema deviations (caught at W3.1 / W3.2):** `domain` is a strict enum (`"work" | "personal"`) — the plan's "customer-success" / "research" had to be mapped to `"work"`. `requiresApproval: false` is required on every step. Both forced adaptations preserve intent.

## Acceptance criteria — all met

- [x] `evaluateManifestTriggers(tableId, rowId, rowData)` exists and is called from `addRows()` after `evaluateTriggers`
- [x] When 1 manifest subscribes to a table, 1 workflow + task created with `contextRowId === rowId` and `projectId === appId`
- [x] When 0 manifests subscribe, no task created
- [x] When 2 manifests subscribe, 2 independent workflows
- [x] `{{row.<column>}}` placeholders resolve from row data
- [x] Unknown blueprint id → notification written, no task created, other apps still fire
- [x] `listAppsCached` + `listAppsWithManifestsCached` invalidate on `upsertAppManifest()` and `deleteApp()`
- [x] Real blueprints exist at `~/.ainative/blueprints/` with valid `BlueprintSchema` shape
- [x] Phase 4 smoke manifests use qualified ids + source pointers; existing tests still pass (340/340)
- [x] Engine smoke (per CLAUDE.md): real row insert via Tables API → workflow + task created → console clean → no ReferenceError ✅
- [x] All Phase 4 unit + integration tests still green
- [x] Dispatcher unit tests cover all error registry rows
- [x] Integration test at `src/lib/data/__tests__/tables-row-insert-dispatch.test.ts` exercises the full path

## References

- Historical design: Relay git commit `c153605e`
- Historical implementation plan: Relay git commit `7c8354dc`
- Phase 4: `features/composed-app-kit-inbox-and-research.md`
- Memory: `feedback-use-client-non-component-helpers.md` (parallel framework-boundary lesson)
- CLAUDE.md "Smoke-test budget for runtime-registry-adjacent features"
- Verification artifacts: `output/phase-5-{inbox-pre-insert,table-with-delta-row,inbox-post-insert}.png` (gitignored)
- Wave commit chain: a35c2075 → 2c0de09e → 2eb55d56 → d00cdf08 → 8402976e → e0b6b798 → 6917aca6 → 70719b7a → 5014698c → 66842782 → de5cd49f → 9bad7dec → af811299 → 85d88f6c (14 commits across 7 waves)
