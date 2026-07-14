---
title: Runtime module-graph regression contract
status: completed
goal: G-066
date: 2026-07-14
---

# Runtime module-graph regression contract

## Outcome

Relay has a repeatable, credential-free Tier-0 control that boots a real Next
development process on an isolated data directory and proves a synthetic task,
workflow, scheduled claim, and Chat turn through production module boundaries.
The control fails on runtime-registry initialization cycles, target drift,
double claims, incomplete Chat finalization, or unnamed transport failures.

## Invariants

1. Importing and first-requesting runtime-registry-adjacent routes under Next
   never raises an initialization `ReferenceError`.
2. A requested, available Ollama task persists `requested=effective=ollama`,
   completes through the production dispatcher, and writes start/completion log
   evidence.
3. A one-step workflow executes its child task through the same dispatcher and
   reaches a truthful terminal workflow state.
4. Two independent SQLite connections/processes racing beneath cap 1 produce
   one scheduled-task claim, never two.
5. Every Ollama Chat generator exit leaves its assistant message terminal and
   records exactly one primary termination reason: completed, signal abort,
   finalized error, or abandonment. The SSE route separately records client
   cancellation. Reconciliation retains its stale-orphan reason code.
6. Empty, malformed, and upstream-error fake-provider responses produce named,
   visible outcomes rather than a silent completed turn.

## Test boundary

The credential-free smoke starts a local fake Ollama HTTP transport, then a real
`next dev` process with a harness-owned `RELAY_DATA_DIR`. It uses public Relay
HTTP routes to configure Ollama, create/execute/poll a task and workflow, create
a conversation, consume its SSE response, and inspect Chat diagnostics. The
fake supplies deterministic `/api/tags` and `/api/chat` responses but does not
replace any Relay module.

Unit/integration tests own combinatorial termination and concurrency cases. The
real-process smoke owns module loading, route wiring, dispatcher wiring, and the
successful end-to-end path. A credentialed or billable provider call is a
separate operator gate and cannot be silently substituted for this control.

## Acceptance evidence

- true two-process/connection cap race with one winner
- Ollama completed/error/abort/abandon finalization and telemetry tests
- real Next smoke with task id, workflow id, conversation id, effective target,
  task logs, SSE done event, and diagnostics count
- normal and fixed-seed shuffled default suites
- TypeScript, audit/static, documentation-link, and public-boundary checks

## Completion evidence — 2026-07-14

- `npm run test:runtime-graph` passed through a real isolated Next/Turbopack
  process. Task `f635746c-adbe-45c9-b2b2-5faa655d449e` retained
  requested/effective `ollama` and `started`/`completed` logs; workflow
  `c23ee487-790e-4538-a4c9-2bc56b52e792` completed child task
  `3fc2d1d0-e958-452f-81fe-44bf6c19f57a`; conversation
  `b0778971-f664-4046-89e9-95a9cdb8cb4c` persisted complete with
  `stream.completed` diagnostics.
- The G-066 focused matrix passed 57/57. Normal and seed-6301 shuffled suites
  each passed 3,243 tests with one intentional live-app conditional skip and no
  failures.
- TypeScript, audit/static, doc-link, public-boundary, and diff checks passed.
  Independent review approved the module boundary, termination, race, cleanup,
  and cross-platform credential-isolation controls.
- No credentialed, OAuth, or billable provider call was made. Such a lane remains
  a separate operator gate and supplements rather than conditions this
  deterministic regression contract.

## Rollback

The smoke is an additive script/package command. Chat changes are confined to
the Ollama generator's terminal/finally handling. If the fake transport cannot
faithfully exercise production routing, retain the deterministic tests and stop
with evidence; do not add a production-only test runtime or weaken target
resolution.
