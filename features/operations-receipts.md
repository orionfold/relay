---
title: Operations Receipts for unattended runs
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md G-008; _IDEAS/reprioritze.md Gap #2
dependencies: [scheduled-prompt-loops, workflow-engine, workflow-run-history, usage-metering-ledger, document-output-generation]
---

# Operations Receipts for unattended runs

## Outcome

Schedules and workflows can declare a small deterministic success bar. Every
new terminal unattended run produces one durable Operations Receipt that says
`Passed`, `At risk`, or `Failed`, shows the evidence used for each criterion,
and names the next operator action.

The receipt replaces the trust role once assigned to the deprecated generic
analytics surface. It is a per-run operational artifact derived entirely from
Relay's local run data, not a new telemetry or ROI analytics system.

## Operator decision gate

Approved by the operator on 2026-07-13: the closed four-check criterion grammar
and the exact user-visible verdicts `Passed`, `At risk`, and `Failed`.

### Proposed criterion grammar

```yaml
successCriteria:
  - id: completed
    label: Run completed
    level: required
    check: status_is
    value: completed
  - id: report-created
    label: Produced at least one report
    level: required
    check: output_count_at_least
    value: 1
  - id: timely
    label: Finished within ten minutes
    level: advisory
    check: duration_at_most_seconds
    value: 600
```

The first grammar is deliberately a closed discriminated union:

- `status_is` with the terminal value `completed`
- `result_contains` with a non-empty, case-insensitive text value
- `output_count_at_least` with a non-negative integer value
- `duration_at_most_seconds` with a positive integer value

Every criterion also requires a stable `id`, a user-facing `label`, and a
`level` of `required` or `advisory`. Criteria are ANDed. There is no arbitrary
regex, script execution, free-text LLM judge, nested boolean expression, or
user-authored SQL in the first version.

### Proposed verdict language and rules

- `Passed` — the source run completed, every required criterion is true, every
  advisory criterion is true, and all required evidence is present.
- `At risk` — the source run completed, but no success criteria were configured,
  required evidence is missing, or at least one advisory criterion is false.
- `Failed` — the source run failed/cancelled/blocked, or a required criterion is
  definitively false.

Missing evidence never silently becomes a pass or a fail. It produces `At risk`
with the missing fact named. A receipt evaluator error also produces an
`At risk` receipt with a named `evaluation_error` evidence item.

## What already exists

- `tasks.scheduleId`, `tasks.workflowId`, and `tasks.workflowRunNumber` identify
  the source operation and run without parsing task titles.
- Schedule child tasks already carry terminal status/result, timestamps, output
  documents, usage ledger rows, and firing metrics.
- Workflow definitions already persist per-step/iteration status, result, error,
  timestamps, a monotonic `runNumber`, and a bounded run-history summary.
- Schedule and workflow detail surfaces already render run histories and link to
  task/Monitor evidence.
- `usage_ledger` remains authoritative for provider usage and cost; Operations
  Receipts should reference those facts, not duplicate or reinterpret billing.

## Data contract

Add nullable JSON text columns named `success_criteria` to `schedules` and
`workflows`. Validate them at every input boundary with one shared Zod schema;
persist only the normalized closed-union representation.

Add an `operations_receipts` table with:

- `id` — receipt UUID
- `source_key` — unique idempotency key (`schedule:{id}:task:{taskId}` or
  `workflow:{id}:run:{runNumber}`)
- `owner_type` — `schedule` or `workflow`
- nullable `schedule_id`, `workflow_id`, `task_id`, and `workflow_run_number`
- `verdict` — `passed`, `at_risk`, or `failed`
- `criteria_snapshot` — exact normalized criteria evaluated for this run
- `evidence` — bounded criterion results and source facts
- `summary` — deterministic one-line explanation
- `next_action` — deterministic operator action
- `started_at`, `finished_at`, and `created_at`

The criteria snapshot is copied into each receipt so editing a future success
bar cannot rewrite historical meaning.

## Evaluation model

```text
schedule task terminal ─┐
                       ├─> collect local run facts ─> evaluate criteria
workflow run terminal ─┘             │                      │
                                     │                      v
                                     └──────────────> durable receipt
                                                            │
                                      schedule/workflow detail history
```

For schedules, the source run is the child task identified by `scheduleId`.
For workflows, the source run is the workflow's current `runNumber` plus the
tasks and persisted workflow state carrying that run number.

The persisted terminal workflow/run state is authoritative over individual
attempt rows. Exact-step recovery deliberately retains a failed task attempt
and creates a new completed attempt in the same run; when that run ultimately
completes, receipt reconciliation must update the existing run receipt to the
completed verdict without deleting either attempt. For a historical run, the
receipt-run marker is the authority because the workflow row may already point
at a newer run.

The terminal result fact is the schedule task result or the workflow's terminal
result: final sequence/checkpoint/planner step, synthesis/refinery step for
parallel/swarm, or final loop iteration. If a pattern has no unambiguous terminal
result, `result_contains` records missing evidence and yields `At risk`.

## Write and repair path

Use one idempotent `ensureOperationsReceipt(source)` service at both terminal
write points and receipt-history read boundaries:

1. A schedule task completion and a workflow terminal transition call the
   service after their source state is durable.
2. `source_key` uniqueness makes repeated callbacks/retries harmless.
3. Schedule/workflow detail APIs reconcile a terminal source run with no receipt
   before returning history, repairing process interruption between source and
   receipt commits.
4. If evaluation or persistence still fails, write a named Inbox failure notice
   containing the source run and recovery action. Do not swallow the error.

Workflow terminal hooks must use a dynamic import from `engine.ts` and receive a
real `npm run dev` workflow smoke because that module is runtime-registry-adjacent.

## User experience

- Reuse one compact Success Criteria builder in schedule and workflow create/edit
  surfaces. Each row selects Required/Advisory, a supported check, and its typed
  value, with inline validation and a short plain-language preview.
- Schedule and workflow detail surfaces replace bare status-only histories with
  receipt rows showing verdict, timestamp/duration, short summary, and next
  action. Expanding a row shows the snapshotted criterion evidence and links to
  the source task or filtered Monitor view.
- Empty history explains that receipts appear after the next run. A configured
  operation with no terminal run must not display a fabricated verdict.
- `Passed`, `At risk`, and `Failed` use existing semantic status tokens, icons,
  and text together; color is never the only signal.

## Error & Rescue Registry

| Error | Trigger | Impact | Rescue |
|-------|---------|--------|--------|
| Invalid criterion | malformed API/YAML/chat-tool input | success bar cannot be evaluated | reject with field-specific Zod issues; preserve prior criteria |
| No criteria | existing operation or intentionally empty list | no declared bar | write `At risk`; next action says Configure success criteria |
| Missing result | completed run has null/empty result | text criterion is indeterminate | record missing evidence; `At risk`; link to source run |
| Ambiguous workflow result | pattern has no terminal synthesis/result | text criterion is indeterminate | record missing evidence; `At risk`; recommend output-count/status criterion |
| Source run failed | task/workflow terminal failure | operation did not complete | `Failed`; preserve source error and link to diagnostics |
| Evaluator throws | corrupt historical state or unsupported legacy value | receipt cannot be normally scored | write `At risk` with `evaluation_error`; emit named log |
| Receipt insert interrupted | process exits after terminal source commit | missing durable receipt | idempotent read-boundary reconciliation recreates it |
| Receipt insert repeatedly fails | DB lock/disk error | history remains incomplete | named Inbox failure notice; retry on next detail read |
| Criteria edited during a run | operator changes future bar before completion | historical meaning could drift | snapshot criteria when the run starts or from source-run metadata |
| Duplicate terminal callbacks | scheduler drain/retry or workflow retry | duplicate receipt risk | unique `source_key` plus insert-once reconciliation |
| Failed attempt later recovers | exact-step retry creates a completed attempt in the same run | stale Failed receipt contradicts Completed workflow | terminal workflow/run marker wins; upsert the same source key while retaining attempt history |
| Owner deleted | schedule/workflow removed after receipt | receipt loses navigation target | retain bounded receipt facts; show Source removed instead of broken link |

## Acceptance Criteria

- [x] Shared validation accepts only the four typed checks, required fields,
  valid level/value combinations, unique criterion IDs, and a bounded list.
- [x] Schedule API, YAML registry, chat-tool, and create/edit UI paths round-trip
  normalized criteria without losing an existing bar on validation failure.
- [x] Workflow API and create/edit paths round-trip the same criteria contract.
- [x] Every new terminal schedule firing creates exactly one durable receipt with
  a criteria snapshot, evidence, summary, next action, and source-task link.
- [x] Every new terminal workflow run creates exactly one durable receipt keyed
  by workflow ID and run number across sequence, loop, parallel, and swarm
  terminal-result shapes.
- [x] A failed task attempt followed by a successful exact-step retry updates
  that run's existing receipt to the final terminal verdict without erasing
  either attempt or changing the receipt identity.
- [x] Passed, At risk, and Failed fixtures cover true/false advisory and required
  criteria, no criteria, missing result/output/duration evidence, runtime failure,
  evaluator failure, duplicate callbacks, and interrupted-write reconciliation.
- [x] Schedule and workflow detail histories render verdict text/icon/token,
  evidence disclosure, next action, empty state, and source diagnostics link with
  keyboard and screen-reader coverage.
- [x] Existing task/workflow status, Monitor logs, usage ledger, and schedule
  firing metrics remain authoritative and unchanged by receipt evaluation.
- [x] Targeted tests, schema/bootstrap parity, production build, real workflow
  runtime smoke, and desktop/390px browser checks pass for all three verdicts.

## NOT in scope

- Aggregate analytics dashboards, leaderboards, ROI, hours-saved, or value
  estimates — receipts are per-run trust artifacts.
- Product telemetry, phone-home, cloud scoring, or model-based judging.
- Arbitrary regex, scripts, SQL, nested AND/OR groups, percentages, or cross-run
  trend criteria in the first grammar.
- Changing task/workflow execution status based on the receipt verdict. A run can
  complete technically while its operational receipt is `Failed`.
- Automatic pause/retry policies based on receipt verdicts; existing schedule
  runtime-failure protections remain separate.
- Retroactively fabricating receipts for pre-feature runs. Reconciliation covers
  new runs whose terminal receipt write was interrupted.

## Verification examples

- Schedule: a completed report task with one output document satisfies required
  status/output criteria and receives `Passed`.
- Schedule: the task completes but produces no required document and receives
  `Failed` with `Produce at least one report` as the next action.
- Workflow: all required criteria pass but an advisory duration ceiling is
  missed, producing `At risk` with duration evidence.
- Nil path: a result-text criterion cannot find a terminal result, producing
  `At risk` rather than silently passing or falsely failing.

## Verification run — 2026-07-13

- 104 focused tests passed across evaluation, persistence, workflow result
  shapes, UI, schedule/workflow input paths, bootstrap parity, and data clearing.
- TypeScript, design-token validation, and the production Next.js build passed.
- An isolated `npm run dev` run produced durable `Passed`, `At risk`, and
  `Failed` workflow receipts, including a zero-task loop and privacy-safe text
  evidence. This exercises the runtime-registry-adjacent workflow hook with the
  real module graph.
- The in-app browser verified all three verdict histories and the criteria
  editor at desktop and 390px. There was no horizontal overflow and no browser
  warning/error output.
- Fresh-context review found retry, historical-repair, zero-task, run-snapshot,
  failed-loop, corrupt-evidence, and accessibility gaps; each was repaired and
  covered before acceptance.
- The full-suite comparison finished with 3,111 passing tests and only the
  pre-recorded G-022 baseline/environment-gated failures; no G-008 failure
  remained.
