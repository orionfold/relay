---
title: Transient Workflow Step Recovery Plan
status: completed
specification: features/runtime-first-value-reliability.md
goal: G-122
---

# Transient Workflow Step Recovery Plan

## Contract

Preserve completed workflow work when a sequence step loses its runtime,
present the interruption as recoverable, and resume from that exact step only
after a fresh runtime preflight. Never automatically replay generation or
re-run a completed prefix.

## Vertical slices

1. Extend the durable workflow state with a named `blocked_runtime` step and
   bounded recovery metadata. Carry the task's machine-readable failure reason
   into the engine and classify only safe transient failures.
2. On a transient sequence failure, perform one non-generating live target
   recheck. Regardless of a recovered probe, pause for explicit resume rather
   than risk replaying an accepted generation.
3. Extend the existing atomic retry claim to recover paused steps. Preflight
   the exact target before claiming, enforce two operator attempts, and retain
   completed prefix state and artifacts.
4. Add the sequence-detail recovery control and clear customer copy. Refresh
   the authoritative workflow state after success or refusal.
5. Protect timeout, outage, auth rejection, concurrent retry, retry exhaustion,
   restart persistence, completed-prefix artifact preservation and stale-target
   refusal with deterministic tests. Run runtime-graph smoke, the full suite,
   build, and customer-visible UI verification.

## Regression budget

- Engine state/classifier unit tests: 6–8 cases.
- Retry route SQLite contract tests: 5–7 cases.
- Sequence view interaction tests: 2–3 cases.
- Existing recovery, runtime registry, full suite and production build.

## Rescue and rollback

If generic workflows cannot prove side-effect safety, enable recovery only for
sequence steps whose completed prefix is represented by durable task/document/
operation receipts. Unreceipted side-effecting steps remain terminal. The
change is state-only and additive; rollback treats `blocked_runtime` as failed
without mutating completed prefix data.
