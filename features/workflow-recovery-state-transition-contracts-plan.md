# G-071 implementation plan — workflow recovery state transitions

Authoritative specification:
`features/workflow-recovery-state-transition-contracts.md`

## Scope challenge

G-071 protects recovery invariants, not every workflow branch. Existing happy
path, blueprint, prompt, post-action, and UI suites stay authoritative. The
implementation adds no new workflow status, retry policy, queue service, or
provider dependency.

## Affected surfaces

- Test-side workflow transition inventory.
- Workflow engine sequence/checkpoint/parallel/delay/retry paths.
- Loop finalization and partial-row truth.
- Workflow stop, resume, retry, and notification-response routes.
- Existing SQLite workflow, task, notification, log, and receipt rows.
- Product roadmap/changelog, G-071 ledger, and quality-manager guidance.

## Vertical slices

1. **Matrix and baseline** — record transition states/invariants and the 26.82%
   line / 27.66% branch selected-surface baseline.
2. **Failure aggregation** — protect sequence, parallel, and loop child failure,
   partial completion, terminal parent state, and receipt truth.
3. **Durable waiting** — make delay and HITL state validate before atomic
   resume, prove process-style re-entry, and reject duplicate/stale answers.
4. **Stop and retry** — settle cancellation attempts, expose refusal, atomically
   claim one failed-step retry, preserve completed prefix, and fail recovery
   truthfully.
5. **Closure** — focused/shuffled coverage, release profile, runtime smoke,
   production build, two-pass review, Ship Verification, records, and commit.

## Regression-test budget

- One executable transition inventory test.
- One real-SQLite engine recovery suite, split only if fixture ownership leaks.
- Adjacent route tests for resume, stop, retry, and workflow notification
  response behavior.
- Deterministic promises/barriers for duplicate claims; no sleeps.
- Mock task/provider dispatch only. Keep state parsing, engine orchestration,
  database transitions, notification resolution, and receipts real.

## Broader verification

- Selected-surface coverage and fixed-seed shuffled workflow/route suites.
- Test-project membership, TypeScript, diff/secret checks, and coverage policy.
- Release quality profile including workflow mutation and real runtime graph.
- Production Next.js build. Browser verification is unnecessary because the
  goal changes server-side recovery semantics without a visual surface.

## Rescue and rollback

- Split fixtures before abstracting if one setup crosses state families.
- Preserve persisted state before dispatch so failed providers remain visible.
- Stop for operator choice if retry suffix or partial-row semantics are not
  already determined by the authoritative goal/specs.
- Roll back hardening per transition; retain matrix/regression evidence.
