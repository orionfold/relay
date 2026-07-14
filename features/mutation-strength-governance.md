---
title: Mutation-strength governance for test pruning
status: completed
goal: G-068
date: 2026-07-14
---

# Mutation-strength governance for test pruning

## Outcome

Relay has a bounded, dependency-free, reproducible fault-injection control for
the load-bearing invariants identified by the G-063 audit. Test deletion or
scenario consolidation is allowed only when the retained guard still kills the
relevant fault and before/after evidence shows equal-or-better protection.

## Invariants

1. Mutations run only in a marked disposable source copy. The harness never
   selects tracked checkout sources, application databases, operator profile
   roots, credentials, or the shared dependency tree as write targets. Child
   processes receive no credential variables or live profile locations; this is
   environment isolation, not an operating-system filesystem sandbox.
2. Every source replacement has an exact one-match anchor. A missing or
   ambiguous anchor is a named harness failure, not a surviving mutant.
3. A mutant is `killed` only when its named test command fails for the expected
   assertion. Timeout, signal, setup failure, missing test collection, or an
   unrelated exception is a harness error.
4. The matrix covers database integrity, workflow failure propagation, schedule
   atomic claims, runtime target truth, Chat finalization, Pack provenance, and
   license signature verification.
5. The matrix contains one intentional survivor control. It demonstrates that
   a presence-only receipt-index assertion cannot protect uniqueness; the
   authoritative strengthened guard must kill the same production mutation.
6. Baseline and exact post-restoration matrices must both pass with identical
   collected case counts. Temporary artifacts are removed in `finally`.
7. Expected survivors require a written review disposition. Unexpected
   survivors, unexpected kills, or zero collected tests fail the command.
8. No test is deleted merely for overlapping coverage, similar naming, or
   source appearance. Historical provider-specific, cryptographic, real-SQLite,
   and failure-path scenarios remain unless the mutation/evidence contract says
   otherwise.

## Manifest contract

Each committed mutant declares:

- stable id and load-bearing surface
- production file plus exact search/replacement anchors
- bounded Vitest file/filter command
- expected `killed` or `survived` outcome
- expected failure evidence for killed mutants
- review disposition for an intentional survivor

The runner emits machine-readable per-mutant status, duration, test command,
matched failure evidence, baseline/restore counts, kill rate, and cleanup state.

## States and failures

| State | Meaning | Required action |
|---|---|---|
| killed | Named guard failed for the expected fault | retain as strength evidence |
| survived-control | Intentional weak-boundary command stayed green | record review disposition; authoritative guard must kill the paired mutant |
| unexpected-survivor | Required guard stayed green | fail; add/repair guard before any pruning |
| unexpected-kill | Survivor control failed | fail; control no longer proves survivor detection and must be redesigned |
| harness-error | Anchor, collection, timeout, signal, setup, or cleanup failed | fail; do not count as a kill |

## Acceptance criteria

- [x] `npm run test:mutation-strength` runs without a new dependency, mutates
      only its disposable source copy, and removes that copy afterward.
- [x] One green baseline and one green exact-restoration matrix collect the same
      tests.
- [x] Seven load-bearing production mutants are killed with named assertion
      evidence: DB, workflow, schedule, runtime, Chat, Pack, and licensing.
- [x] One intentional presence-only DB survivor is reported and reviewed; the
      paired uniqueness guard kills the same source fault.
- [x] The report records kill/survival counts and rate, per-mutant and total
      wall time, test count/LOC before and after any consolidation, and exact
      rollback evidence.
- [x] Candidate duplicate clusters receive keep/consolidate dispositions. Any
      consolidation retains scenario provenance and equal-or-better mutation
      evidence; if none qualifies, the report claims zero pruning.
- [x] Targeted tests, full normal and fixed-seed shuffled suites, TypeScript,
      audit/static checks, credential-free real runtime smoke, and independent
      review pass.
- [x] G-068 is removed from the strategy backlog and only goal-owned Relay
      changes are committed locally.

## Non-goals

- Full-repository mutation score or line-by-line mutant generation.
- A Stryker or other mutation dependency, hosted service, or CI compute change.
- Deleting tests to hit a numeric target.
- Provider calls, live credentials, browser work, or customer data.
- Reopening G-065 or G-067 CI/browser-environment decisions.

## Rollback

The runner, manifest, package command, receipt-uniqueness and workflow-failure
regressions, and quality documentation are additive. Revert the G-068 commit to
remove the control. Runtime production behavior is unchanged.

## Completion evidence

Four consecutive repaired mutation runs killed all seven required faults,
reported the intentional survivor, restored the same 7-file/63-test matrix, and
removed their disposable copies (median 8.32 seconds). The normal and seed-6301
default suites each passed 415 files and 3,246 collected cases. TypeScript,
static/audit/documentation/public-boundary checks, and the credential-free real
runtime-graph smoke passed. Independent quality review approved after two
documentation-accuracy corrections. No duplicate cluster qualified for safe
consolidation, so the evidence-backed pruning result is zero.
