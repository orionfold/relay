---
title: Workflow recovery and state-transition contracts
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md#G-071
dependencies: [workflow-engine, workflow-execution-resilience, workflow-step-delays, fix-workflow-hitl-ask-user, critical-api-route-contracts]
---

# Workflow recovery and state-transition contracts (G-071)

## Description

Relay already executes sequence, planner-executor, checkpoint, parallel, swarm,
and loop workflows, but its recovery behavior is spread across the engine,
schedule tick, notification response, and route handlers. G-071 makes that
behavior reviewable and executable as one bounded transition matrix. The goal
is not blanket workflow coverage: it protects the transitions where child
failure, partial completion, duplicate delivery, cancellation, retry, delay,
or process re-entry could make the parent lie or duplicate a side effect.

The contract uses real SQLite state and public engine/route boundaries. Only
provider dispatch is substituted with deterministic completion, failure, or a
barrier. A terminal parent must agree with its child tasks, persisted step or
iteration state, and workflow run receipt.

## User story

As an operator, I want interrupted or partially failed workflows to resume,
retry, or stop exactly once with truthful persisted state so that a restart or
duplicate action cannot silently complete the run or repeat work.

## Executable transition matrix

| Family | From | Event | Required result |
|---|---|---|---|
| Sequence | active/running | child completes | next step starts once with prior output |
| Sequence | active/running | child fails or times out | parent and step fail; dependents remain pending |
| Parallel | active/branches | one or all branches fail | all started branches settle; join and parent fail; synthesis never starts |
| Loop | active/iteration | autonomous iteration fails | iteration, loop, parent, and receipt fail |
| Loop | active/row fan-out | one or more rows fail | remaining rows may settle; partial run cannot report completed |
| Delay | paused/delayed | scheduler or manual resume | one atomic claim; delayed step completes; subsequent work starts once |
| Delay | paused/invalid persisted state | resume attempt | visible failure; row remains recoverably paused |
| HITL | paused/waiting | answer after process re-entry | exact notification resumes exact step once with persisted answer |
| HITL | paused/waiting | stale/duplicate answer | named conflict; no duplicate task or state mutation |
| Stop | active/live children | operator stop | every cancellable child settles; parent and active steps fail truthfully |
| Stop | active/live children | cancellation dependency refuses | named conflict; parent remains active for retry and failed child IDs are visible |
| Retry | failed/failed step | retry | one atomic claim; only the selected recovery suffix runs |
| Retry | active or duplicate request | retry | named conflict; no second child task or dispatch |

## Technical approach

- Add a typed test-side matrix whose unique transition IDs point to public
  engine or route guards. The matrix is quality metadata, not a second engine.
- Add one real-SQLite recovery integration suite with deterministic task
  dispatch. Preserve the engine, state JSON, receipts, and database queries.
- Make parallel branches convert setup/dispatch exceptions into settled branch
  failures before the parent terminal write, preventing late active writes.
- Make loop terminal status derive from iteration truth: `error` or any failed
  row is failed, not completed.
- Validate a persisted delay/HITL recovery token before an atomic paused-to-
  active claim. A losing duplicate returns without running work; invalid state
  is not consumed.
- Make stop and step-retry routes return named 404/409 outcomes. Retry claims
  the workflow from its observed terminal state before dispatch and persists a
  failed parent if recovery execution fails.

## Acceptance criteria

- [x] A typed executable matrix contains every transition above with unique
      IDs, from/event/to states, invariant, and protecting test paths.
- [x] Sequence failure and timeout fixtures persist the failed child and step,
      fail the parent/receipt, and leave downstream steps unstarted.
- [x] Parallel partial/all-failure fixtures settle every started branch before
      the join/parent terminal write and never dispatch synthesis.
- [x] Autonomous and row-driven loop failure fixtures cannot produce a
      completed loop, workflow, or receipt when an iteration failed.
- [x] Concurrent delayed resume attempts create exactly one subsequent child;
      invalid persisted delay state remains paused and restart-style re-entry
      uses only SQLite state.
- [x] HITL input is durably correlated to workflow, step, and notification;
      an answer resumes once after re-entry while stale/duplicate answers are
      refused without duplicate dispatch.
- [x] Stop attempts settle all successful cancellations, expose dependency
      refusals without falsely failing the parent, and a successful retry
      reaches one truthful failed terminal.
- [x] Step retry validates workflow/step state, atomically admits one caller,
      does not duplicate completed prefix work, and persists recovery failure.
- [x] The selected surfaces materially improve from the recorded 26.82% line /
      27.66% branch baseline; focused/shuffled tests, TypeScript, coverage
      ratchets, mutation strength, runtime-module-graph smoke, release quality,
      and production build pass without live credentials.

## Verification receipt — 2026-07-14

- The executable inventory guards 12 unique recovery transitions. Focused
  selected-surface coverage improved from 26.82% lines / 27.66% branches to
  59.01% / 55.65%; the final release run reported the broader Workflows risk
  surface at 65.00% / 58.47% without lowering any ratchet.
- Fixed-seed shuffled workflow/schedule tests passed 272 cases and the broader
  API/workflow/schedule tranche passed 502. The final release profile passed
  all 19 lanes with 448 files, 3,409 passing tests plus one intentional skip,
  and 7/7 required mutation kills.
- The real Next.js development runtime graph executed task, workflow, schedule,
  and Chat paths across deterministic Ollama, LiteLLM, and LM Studio fixtures.
  The production Next.js build and CLI bundle also passed without credentials.
- Fresh two-pass review found and fixed a false `workflow_completed` log after
  failed/paused loop settlement and prevented unexpected transition failures
  from exposing internal error text. Final verdict: APPROVE, no open findings.

## Scope boundaries

Included:

- Engine recovery for sequence, checkpoint, parallel, loop, delay, stop, and
  step retry.
- Persistence/receipt truth and deterministic duplicate-action barriers.
- Narrow route validation needed to expose these recovery outcomes.

Excluded:

- New workflow statuses, retry policies/backoff, automatic failed-step retry,
  distributed job queues, or multi-process leasing beyond existing SQLite
  atomic claims.
- New workflow UI, visual DAG work, live provider credentials, customer
  topology, or blanket coverage of every workflow helper.
- Changing the accepted indefinite-pause policy for `requiresInput`; G-071
  makes it restart-durable rather than introducing a timeout.

## Rescue and rollback

- If a shared recovery fixture starts mocking the transition it is meant to
  prove, split it by state family and keep real SQLite.
- If a transition has two materially valid product meanings not fixed by the
  existing specs, stop on the failing regression and request operator choice.
- If durable HITL recovery requires a schema migration, prefer additive state
  inside the existing definition JSON and notification row; do not invent a
  queue table for this bounded goal.
- Every behavior hardening change is independently reversible. Keep the matrix
  and failing regression as evidence if a product decision rolls one back.

## References

- Goal: `_IDEAS/backlog.md` G-071
- Engine: `src/lib/workflows/engine.ts`
- Loop executor: `src/lib/workflows/loop-executor.ts`
- Existing resilience: `features/workflow-execution-resilience.md`
- Delay contract: `features/workflow-step-delays.md`
- HITL decision: `features/fix-workflow-hitl-ask-user.md`
