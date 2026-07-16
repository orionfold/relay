---
id: TDR-045
title: Workshop editions are content-addressed manifests with minimal local run state
status: accepted
date: 2026-07-16
category: infrastructure
---

# TDR-045: Workshop editions are content-addressed manifests with minimal local run state

## Context

Relay must support an account-free, zero-founder-runtime Operator Workshop
without becoming a course platform. The learner needs deterministic preflight,
restart-safe checkpoints, bounded rescue, and portable evidence. Orionfold
Website owns paid instruction, checkout, access and delivery; Relay owns local
execution and evidence. Paid workshop prose must not accidentally ship in the
public npm package.

Progress cannot live only in React state because reloads, process restarts and
duplicate actions are acceptance cases. A generic course/catalog schema would
duplicate Website and create an LMS-shaped subsystem. Storing progress in the
ordinary settings table would hide a public state machine in untyped JSON and
make cleanup, recovery and conformance difficult to audit.

## Decision

Relay supports workshops through two bounded contracts:

1. A versioned, strict, content-addressed `WorkshopEditionManifest`. It names
   the Relay compatibility range, fixture family and hash, required and
   optional capabilities, checkpoint definitions, rescue catalog, source
   references and completion-artifact policy. The canonical hash is SHA-256 of
   stable JSON with the hash/signature envelope omitted.
2. One `workshop_runs` row per local run. It stores the edition identity/hash,
   status, checkpoint state JSON, installed project/app/workflow identities,
   receipt identity, last named error and timestamps.

The public npm package may contain the runner, schema, free sample metadata and
synthetic Marketing Line starter. Paid instruction remains Website-owned.
Website-delivered editions may include a detached Ed25519 signature; Relay
verifies it against an explicit trusted-key registry before starting. Built-in
official editions are trusted by their embedded canonical hash. Unknown keys,
invalid signatures, unsupported schema versions, incompatible Relay versions,
and hash mismatches fail closed with named errors.

Checkpoints are observations over existing Relay primitives. They do not own a
second task/workflow/table/approval/cost/evaluation implementation. Completion
evidence composes the existing Operations Receipt, selected output documents,
and user-created app export. Verdict vocabulary remains `passed`, `at_risk`,
and `failed`.

## Consequences

- Runs resume after reload/restart and duplicate start can return the same
  authoritative run.
- Relay gains one table and one strict manifest schema, not course/catalog,
  lesson, enrollment, certificate, cohort, grading or instructor tables.
- Website can change presentation and fulfillment without changing Relay
  execution truth.
- A purchased guide can remain private while the local starter and evidence
  stay useful offline after delivery.
- Signature rotation requires a trusted-key update; unsigned external editions
  are refused rather than silently downgraded.
- `clearAllData()` and demo reset must delete workshop runs before referenced
  projects/workflows/receipts.

## Alternatives Considered

- **Website-hosted instruction with transient URL progress.** Rejected because
  it is not restart-safe or offline after delivery.
- **Signed archive containing all paid content inside npm.** Rejected because
  it risks publishing paid instruction and couples content releases to Relay
  package releases.
- **Generic LMS schema in Relay.** Rejected as duplication and scope expansion.
- **Progress in settings JSON.** Rejected because the state machine, identity
  joins and cleanup order would be implicit and weakly testable.
- **Derive all progress from existing rows with no run anchor.** Rejected
  because retries, fallback use, edition identity and selected evidence would
  be ambiguous across restarts.

## References

- `features/relay-operator-workshop-enablement.md`
- `features/relay-operator-workshop-enablement-plan.md`
- `src/lib/operations/receipts.ts`
- `src/lib/packs/app-exporter.ts`
- `src/lib/documents/output-scanner.ts`
- TDR-009, TDR-011, TDR-012, TDR-013
