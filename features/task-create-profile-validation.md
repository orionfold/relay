---
title: Task Create Profile Validation + Disappearance Investigation
status: completed
priority: P1
milestone: post-mvp
source: internal history record
dependencies: [agent-integration, agent-profile-catalog]
---

# Task Create Profile Validation + Disappearance Investigation

## Description

Close the validation gap in `create_task` — today it accepts any string as `agentProfile`, including values that are runtimes rather than profiles (e.g., `anthropic-direct`), so users can create tasks that are guaranteed to fail at execution time with no feedback at creation time.

Bundled with the validation fix is a time-boxed investigation spike for a separate reported symptom: a task whose ID was returned by `create_task` later became unfindable via `get_task`. The original handoff attributed this to "the task record was deleted." A codebase audit found **no task deletion code anywhere in ainative** — `claude-agent.ts` persists failed tasks with `status: "failed"` and `failureReason` in every error path, and there is no GC/cleanup for tasks. The disappearance is almost certainly a scoping mismatch (the `AINATIVE_DATA_DIR` env var used for isolation between domain clones, or the `projectId` filter on queries) rather than a data-loss bug. The spike must establish the real cause before we change any production code.

## User Story

As an operator creating tasks via chat or MCP, I want invalid profile IDs rejected at creation time with a clear error, and I want any task whose ID I've been handed to remain findable via `get_task` for as long as the task exists — so I never see "task not found" for a task I just created.

## Technical Approach

### 1. Profile validation at `create_task`

- In `src/lib/chat/tools/task-tools.ts:91-96`, convert the `agentProfile` field from an open `z.string()` into a `z.string().refine(...)` that checks the id against the profile registry via `getProfile()` from `src/lib/agents/profiles/registry.ts`.
- On validation failure, return a descriptive error message that names the invalid value and lists the currently-registered profile ids (the registry's `listProfiles()` output).
- Keep validation synchronous — the registry is an in-memory map, so there's no async cost.

### 2. Investigation spike for the disappearance claim (time-boxed, ~2 hours)

Before touching any "preserve failed tasks" code, reproduce the original symptom and determine the real cause. Candidates:

1. **Data-dir mismatch.** The creating context (e.g., a chat session in one domain clone) has `AINATIVE_DATA_DIR=~/.ainative/wealth-mgr` while the querying context hits `~/.ainative`. See `MEMORY.md` → `shared-ainative-data-dir.md`.
2. **Project scoping mismatch.** Task created under `projectId=A`, queried under `projectId=B`. `get_task` may filter by current project.
3. **Transaction rollback.** A create-then-execute path that wraps both in a transaction and rolls back on execution failure.
4. **Something else entirely** — the spike output is the data that tells us.

The spike writes its findings directly into the "References" section of this spec as a short addendum, with file:line citations, before any remediation code is merged. If the cause turns out to be #1 or #2, the remediation is a documentation + error-message improvement rather than a data-layer change.

### 3. Failed-state preservation (only if the spike finds a gap)

The codebase already persists failed tasks in every path the Explore pass examined:
- `src/lib/agents/claude-agent.ts:300-309` — result frame handler writes `status: "failed"`
- `src/lib/agents/claude-agent.ts:363-371` — stream-exhaustion safety net with `failureReason`
- `src/lib/agents/claude-agent.ts:731-740` — `handleExecutionError` persists status

If the spike reveals a failure path that does NOT persist status, fix it there with a single targeted change. Otherwise this acceptance criterion becomes verification-only.

### 4. Synchronous error surfacing in `execute_task`

When `execute_task` is called with a task that has a validation error knowable synchronously (invalid profile caught at creation, or a task created before this fix with an invalid profile), the tool response should include the error field in its immediate response rather than returning a 202 and leaving the user to poll.

## Acceptance Criteria

- [ ] `create_task` rejects `agentProfile` values not in the profile registry with a descriptive error that names the invalid value and lists valid options.
- [ ] A new test in `src/lib/chat/tools/__tests__/task-tools.test.ts` asserts `create_task` with `agentProfile: "anthropic-direct"` is rejected.
- [ ] The investigation spike documents the actual cause of the reported disappearance in this spec's References section (with file:line citations) before any failed-state-preservation code is written.
- [ ] No task returned from `create_task` is unfindable via `get_task` within the same data-dir + project scope (verified by a new integration test that creates, triggers a failure, and reads back).
- [ ] `execute_task` surfaces validation/profile errors synchronously in its response for synchronous-failure cases.
- [ ] Existing `task-tools` tests still pass.

## Scope Boundaries

**Included:**
- Profile validation at `create_task` (Zod refine + error message)
- Investigation spike for the disappearance symptom
- Test coverage for profile validation
- MCP response surfacing for synchronously-known failures

**Excluded:**
- A general task cleanup/GC retention policy (none exists today — do not build one speculatively)
- Profile validation on `execute_task` (already happens at runtime via `getProfile`)
- Refactoring the runtime-vs-profile taxonomy
- Any change to the domain-clone `AINATIVE_DATA_DIR` isolation model (even if the spike finds it is the cause — the fix there is error messaging, not isolation changes)

## References

- Source: `internal history record`
- `src/lib/chat/tools/task-tools.ts:91-96` — `create_task` Zod schema (target of validation change)
- `src/lib/agents/profiles/registry.ts:143-170` — `getProfile` / `listProfiles`
- `src/lib/agents/claude-agent.ts:300-309, 363-371, 731-740` — existing failed-state persistence paths
- `MEMORY.md` → `shared-ainative-data-dir.md` — domain-clone isolation model, likely root cause of the disappearance symptom
- **Correction note:** The handoff's claim "the task record was deleted rather than being preserved with a `failed` status" is not supported by the codebase. No DELETE on tasks exists anywhere in `src/`. The groomed spec frames the fix as "add validation + investigate scoping mismatch" instead of "stop deleting tasks."
- **Spike addendum — 2026-04-11**

  A codebase walk performed in the controller session before any code changes ruled out the handoff's original "task was deleted" framing and identified two actual root-cause candidates for the reported disappearance symptom.

  **Ruled out: task deletion.**
  - No `db.delete(tasks)` anywhere in `src/` (grep confirmed; prior Explore pass had already established this).
  - Every failure path in `src/lib/agents/claude-agent.ts` preserves the row with `status: "failed"` and a `failureReason`:
    - `:130` — partial-update path annotating a mid-stream error
    - `:418-420` — stream-exhaustion safety net
    - `:745-748` — OAuth/auth failure (`failureReason: "auth_failed"`)
    - `:809-811` — generic handler via `classifyError`
  - `create_task` at `src/lib/chat/tools/task-tools.ts:110-126` is a single `db.insert()` with no transaction wrapper. The subsequent read-back at `:123-126` confirms the insert before returning, so a silently-failed insert would surface as an empty result at creation time, not post-creation.

  **Root cause 1 (probable primary — UX-level):** `list_tasks` silently filters by `ctx.projectId`.
  - `src/lib/chat/tools/task-tools.ts:41` computes `effectiveProjectId = args.projectId ?? ctx.projectId ?? undefined`. If truthy, `:43-44` applies `eq(tasks.projectId, effectiveProjectId)` as a WHERE clause.
  - `get_task` at `:223-227` has no projectId filter — tasks are findable by ID regardless of active project scope.
  - Most likely user path: `create_task` under project A → `list_tasks` in a new session with `ctx.projectId = B` (or a different chat context) → empty result → perceived disappearance. The task is still in the DB and still findable by ID; the operator just does not know the filter is active.
  - **Remediation in this feature:** `list_tasks` returns a sibling `note` field in its response envelope when `effectiveProjectId` is set and zero rows are returned, naming the active scope and suggesting `projectId: null` or `get_task <id>` as alternatives. No behavior change, only messaging.

  **Root cause 2 (probable secondary — infrastructure-level):** `AINATIVE_DATA_DIR` per-process isolation.
  - `src/lib/utils/ainative-paths.ts:4-6`: `getAinativeDataDir()` reads `process.env.AINATIVE_DATA_DIR || ~/.ainative`.
  - `src/lib/db/index.ts:9-13`: the DB is opened from `join(dataDir, "ainative.db")` **once at module load**. The var is baked in per-process.
  - Per `MEMORY.md → shared-ainative-data-dir.md`, the user runs domain clones (`ainative-wealth`, `ainative-growth`, `ainative-venture`) which set this var to different paths. A task created in one process is physically in a different SQLite file than a task queried from another process. This is architecturally intentional — the three domain clones isolate state so wealth/growth/venture do not leak into each other.
  - **Remediation in this feature: none.** Per the Excluded list, domain-clone isolation changes are out of scope. A follow-up feature (outside this batch) could add an operator-facing startup log echoing the active data dir, or a `get_stagent_info` health-check tool. Not in this commit.

  **Ruled out: transaction rollback.** Not a transaction; single insert. If the insert fails, the error surfaces immediately at `create_task` return time.

  **Conclusion:** The profile validation gap (the primary spec ask) is unchanged in scope. The disappearance symptom is best addressed by the `list_tasks` empty-result note (added in this feature) plus operator-facing infrastructure discoverability (deferred). Failed-state preservation (AC #3) is verification-only — the code already does it correctly on every failure path identified.
