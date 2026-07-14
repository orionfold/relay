---
title: Workflow Creation Deduplication
status: completed
priority: P1
milestone: post-mvp
source: internal history record
dependencies: [chat-engine, workflow-engine]
---

# Workflow Creation Deduplication

## Description

Chat agents currently create duplicate workflows in long multi-turn conversations. The `create_workflow` tool in `src/lib/chat/tools/workflow-tools.ts` performs zero pre-insert deduplication — every call inserts a new row regardless of how similar it is to an existing one in the same project. The `workflows` table (`src/lib/db/schema.ts:71-93`) has no unique constraint on `(projectId, name)` or on definition content, so nothing at the data layer catches it either.

The root cause is an interaction between the chat engine's sliding-window context builder and the LLM's tool-calling behavior. `src/lib/chat/context-builder.ts:60-80` caps the Tier 1 conversation history budget at ~8K tokens. In a conversation long enough to push the original `create_workflow` tool call out of the visible window, the LLM no longer sees its own prior creation. When the user says "redesign the workflow" or "redo this," the LLM re-derives intent from the truncated window and calls `create_workflow` again. The result is 2–3 orphan workflows per session, each wasting Claude tokens when they execute concurrently.

The contrast is striking: profile imports already have a working 3-tier dedup engine at `src/lib/import/dedup.ts` (exact ID → exact name → Jaccard similarity on extracted keywords). Workflows need the same protection — and can reuse most of the same code. This feature ports the pattern, adds a system-prompt guardrail so the LLM checks before creating, and extracts the shared keyword/Jaccard helpers into `src/lib/util/similarity.ts` so both modules share one implementation.

**Note on the secondary complaint in the source handoff doc:** The original bug report claimed active workflows with child tasks couldn't be deleted via the API. That no longer applies here — `src/app/api/workflows/[id]/route.ts:129-185` already cascades deletes to tasks, logs, documents, notifications, and usage ledger rows. Option E from the handoff doc is out of scope.

## User Story

As a user working with the chat agent on a multi-turn workflow design session, I want the agent to recognize and update existing workflows instead of silently creating duplicates, so that I don't waste compute or need to clean up orphan workflows manually.

## Technical Approach

### 1. Extract shared similarity helper

Create `src/lib/util/similarity.ts` containing:
- `extractKeywords(text: string, limit?: number): Set<string>` — lifted from `src/lib/import/dedup.ts:30-51`
- `jaccard(a: Set<string>, b: Set<string>): number` — lifted from `src/lib/import/dedup.ts:53-62`
- A small `STOP_WORDS` set (also lifted).

Update `src/lib/import/dedup.ts` to import these from the shared module instead of defining them inline. No behavior change for profile imports — verified by the existing profile import tests.

### 2. Add `findSimilarWorkflows` to workflow tools

In `src/lib/chat/tools/workflow-tools.ts`, add a new internal helper (not exposed as a tool):

```typescript
async function findSimilarWorkflows(
  projectId: string | null,
  name: string,
  definitionJson: string
): Promise<Array<{ id: string; name: string; reason: string; similarity: number }>> {
  // Tier 1: exact name match in same project
  // Tier 2: Jaccard similarity > 0.7 on name + step titles (extracted from definition JSON)
  // Return up to 3 matches, sorted by similarity descending
}
```

The helper queries existing workflows in the same project, extracts keywords from each workflow's name + step titles + step prompts, and compares against the candidate using the shared Jaccard helper. It returns matches with `similarity >= 0.7`, capped at 3.

### 3. Wire dedup into `create_workflow` handler

At the start of the insert block in `create_workflow` (after JSON validation, before the `db.insert(workflows)` call around line 137):

1. If `args.force !== true`, call `findSimilarWorkflows(effectiveProjectId, args.name, args.definition)`.
2. If matches are returned, respond with a structured result the LLM can act on:
   ```typescript
   return ok({
     status: "similar-found",
     message: "Found similar workflow(s) in this project. Use update_workflow to modify an existing one, or pass force=true to create anyway.",
     matches: [{ id, name, similarity, reason }],
   });
   ```
3. Otherwise, proceed with the existing insert.

Add a new optional `force: z.boolean().optional()` parameter to the tool's Zod schema with a description explaining when to use it.

### 4. System prompt guardrail

In `src/lib/chat/system-prompt.ts`, add an instruction near the workflow-related guidance:

> **Before creating a workflow**, call `list_workflows` filtered by the current project to check whether a similar one already exists. If the user asks to "redesign" or "update" an existing workflow, call `update_workflow` on the matching row instead of creating a new one. Only pass `force: true` to `create_workflow` if the user has explicitly confirmed they want a second workflow alongside an existing similar one.

### 5. Tests

- Unit tests for `src/lib/util/similarity.ts` — exact cases, empty inputs, edge cases.
- Unit tests for `findSimilarWorkflows` — no matches, name-only match, step-title Jaccard match, mixed-project isolation.
- Integration test for `create_workflow` tool — simulated 12-turn conversation where agent creates a workflow, then user asks to "redesign," and the tool returns `similar-found` instead of inserting.
- Regression test: profile import dedup still passes after the shared helper extraction (run existing profile import test suite).

### Why not alternative options

| Option | Reason rejected |
|---|---|
| DB unique constraint on `(projectId, name)` | SQLite lacks partial unique indexes on JSON content, and users may legitimately want `v1`/`v2` variants. Too strict. |
| Session-level tool-call dedup in chat engine | Fragile across conversation boundaries; breaks if user clears history or starts a new conversation. |
| Cascade-delete fix (Option E in handoff doc) | Already implemented at `src/app/api/workflows/[id]/route.ts:129-185`. |

## Acceptance Criteria

- [ ] `src/lib/util/similarity.ts` exists and exports `extractKeywords`, `jaccard`, and `STOP_WORDS`.
- [ ] `src/lib/import/dedup.ts` imports from `@/lib/util/similarity` without behavior change (existing profile import tests pass).
- [ ] `create_workflow` tool, when called with a name/definition matching an existing workflow in the same project (>0.7 Jaccard), returns a `similar-found` response instead of inserting.
- [ ] `create_workflow` accepts a new `force: boolean` parameter; when `force: true`, dedup is bypassed and the workflow is created.
- [ ] System prompt in `src/lib/chat/system-prompt.ts` instructs the agent to call `list_workflows` before `create_workflow` and to prefer `update_workflow` for "redesign" requests.
- [ ] Unit tests cover `findSimilarWorkflows`: exact name match, Jaccard match on step titles, no match, cross-project isolation.
- [ ] Integration test: simulated multi-turn conversation where second `create_workflow` call is blocked and no duplicate row is inserted (verified by DB count).
- [ ] No regression: `npm test` passes, profile import tests green.
- [ ] `npx tsc --noEmit` clean.

## Scope Boundaries

**Included:**
- Extraction of shared similarity helper
- `findSimilarWorkflows` helper and wiring into `create_workflow`
- `force` parameter on `create_workflow`
- System prompt guardrail
- Unit + integration tests

**Excluded:**
- DB-level unique constraints (rejected — too strict)
- Session-level tool-call tracking (rejected — fragile)
- Cascade-delete changes (already done)
- Dedup for `create_project` / `create_task` / other chat tools (separate feature if demand emerges)
- SSE resume protocol (see `chat-stream-resilience-telemetry`)

## References

- Source: `internal history record`
- Existing pattern to reuse: `src/lib/import/dedup.ts:30-62`
- Files to modify: `src/lib/chat/tools/workflow-tools.ts`, `src/lib/chat/system-prompt.ts`, `src/lib/import/dedup.ts`
- Files to create: `src/lib/util/similarity.ts`, plus adjacent `__tests__/` entries
- Validated bug surface: `src/lib/db/schema.ts:71-93` (no unique constraint), `src/lib/chat/context-builder.ts:60-80` (sliding window)
- Secondary issue already fixed: `src/app/api/workflows/[id]/route.ts:129-185` (cascade delete)
