---
title: Relay Operator Workshop Enablement Implementation Plan
status: completed
date: 2026-07-16
specification: features/relay-operator-workshop-enablement.md
tdr: TDR-045
---

# Relay Operator Workshop Enablement Implementation Plan

## Scope challenge

- **REDUCE:** W0/W1 only. Rejected because it proves interest but leaves the
  purchased capstone founder-dependent.
- **PROCEED:** all local Relay W0-W3 outcomes using existing primitives.
  Selected by the operator's instruction to complete the workstream.
- **EXPAND:** add LMS, Website checkout/auth, Motion rendering and public
  publishing. Rejected as duplication and separately gated external work.

## NOT in scope

- Public price, checkout, email, entitlement or account library: Website owns
  them and external writes require separate authorization.
- Video generation or rendition pipeline: Motion owns it; Relay produces a
  validated source handoff.
- Generic LMS/course/enrollment/certificate/cohort/instructor features: not
  required for the first autonomous workshop.
- New task, workflow, table, approval, evaluation, document or app-export
  engines: the workstream composes existing ones.
- Host/cell and enterprise connector modules: their workstreams remain
  independent.

## What already exists

- Home dashboard panels, Settings section/API patterns and local query sources.
- `ColumnDef`/`ColumnConfig`, `TableSpreadsheet`, tracker app hero and strict
  AppManifest column definitions.
- Marketing Line bundle and synthetic seed family.
- Static `_ASSETS/demo` fixture/boot state machines and validators.
- Pack install, app registry, workflow HITL, Inbox, costs/budgets and runtime
  settings.
- Operations Receipts, output documents and app-to-pack export.
- Knowledge bundle and version-aware Chat help.
- Customer-identical staging and demo capture harnesses.

## Specification and acceptance mapping

| Requirement | Slice |
|---|---|
| G-087 boundary/source contract | TDR-045, strict edition schema, source fragment and validators |
| G-062 adaptive Home | typed module registry, persisted preferences, settings UI, resilient module grid |
| G-061 Render/Row | additive display metadata, shared resolver/item, mode switcher/defaults |
| G-023 reset reliability | FK-safe demo deletion order plus reused-DB regression |
| G-088 free sample | workshop static-demo machine, coach lane, preflight/capstone fixtures and validators |
| G-089 preflight/starter | read-only preflight API, explicit idempotent starter install, minimal run row |
| G-090 checkpoints/rescue | observable checkpoint evaluator, named diagnosis/retry/fallback, bounded UI |
| G-091 completion bundle | compose receipt, selected outputs and user app export with leak/hash checks |
| G-092 conformance/handoff | fresh-data-dir journey, handoff schema validator, no-founder ledger and decision packet |

## Vertical slices

1. Lock contracts: finalize spec, TDR, schemas, named errors and fixtures.
2. W0 UX: dashboard registry/settings and semantic table renderer.
3. W1 reliability/sample: demo reset regression and static workshop lane.
4. W2 foundation: migration/bootstrap/clear, edition verification, preflight
   and idempotent starter.
5. W2 journey: checkpoint evaluation, diagnosis, retry/fallback and bounded UI.
6. W2 retention: deterministic redacted completion export and round trip.
7. W3: customer-identical run, static-demo/browser evidence and local
   Motion/Website handoff fixtures.
8. Reconcile specs/backlog/changelog, run ship verification and commit.

## Regression test budget

| Changed behavior | Protection |
|---|---|
| dashboard eligibility/rank/settings | new pure registry and Settings route/component tests |
| table semantic resolver/render modes | new resolver/component tests plus existing table/pack round trips |
| reused demo reset | new script integration test resetting the same isolated DB twice |
| edition/hash/signature/preflight | new unit and route tests for every named error and nil/tamper state |
| run start/resume/checkpoints | real SQLite integration tests including duplicate action and restart |
| completion export | deterministic archive/JSON tests, leak scanner and app-export refusal cases |
| static demo lane | derive-fixture and boot-shim tests, behavior/route/link/leak validators |
| customer path | real dev server and isolated-data-dir browser/runtime smoke |

Verification order:

1. closest new Vitest/Node tests;
2. impacted dashboard/table/pack/demo/receipt suites;
3. TypeScript build, token validation, schema/bootstrap/clear parity and public
   boundary checks;
4. real `npm run dev` workshop start/checkpoint/export task and runtime-module
   graph smoke because workflow modules are transitively exercised;
5. browser proof at 1440px, 944px and 390px in light/dark;
6. customer-identical staging slice and broader quality gate.

## Error & Rescue Registry

| Failure | Named error/state | Rescue |
|---|---|---|
| unsupported manifest/schema | `WorkshopEditionUnsupportedError` | use a supported edition; retain prior run unchanged |
| incompatible Relay version | `WorkshopRelayVersionError` | upgrade/downgrade explicitly; no silent substitution |
| source/starter hash mismatch | `WorkshopIntegrityError` | reinstall known-good fixture; preserve evidence |
| unknown/invalid signature | `WorkshopSignatureError` | obtain a trusted edition; never run unsigned external content |
| runtime absent/unreachable | `WorkshopRuntimeUnavailableError` | configure runtime or choose truthful deterministic fallback |
| data dir unsafe/unwritable | `WorkshopDataDirError` | choose writable isolated data dir |
| duplicate/partial install | `WorkshopInstallConflictError` | return authoritative run or rollback owned artifacts and retry |
| checkpoint unmet | `WorkshopCheckpointFailedError` | show actual evidence, deep link and bounded retry |
| rubric unavailable | `WorkshopRubricUnavailableError` | export at-risk deterministic result; never fabricate pass |
| receipt/output/export missing | `WorkshopEvidenceError` | show missing artifact and regenerate only the owned piece |
| secret/path leak | `WorkshopRedactionError` | block export and name offending field class |
| module loader failure | `DashboardModuleLoadError` | render isolated error card with source route |
| module-load cycle via chat tools | runtime `ReferenceError` | remove static chat-tools import, use dynamic `await import()`, rerun real task smoke |
| external dependency unavailable | handoff `not-ready` | produce validated local bundle and stop before publication |

## Rescue and rollback

- Migrations are additive; workshop runs can be deleted without affecting
  ordinary primitives.
- Starter install records owned identities before subsequent mutation and
  rolls back only those identities on a failed first install.
- Dashboard preferences reset by deleting one settings key.
- Render mode is additive and Row remains the canonical fallback.
- Static demo changes are derived from seed fixtures and can be regenerated.
- If the bounded workshop panel starts duplicating destination screens, stop
  and replace the duplicate with a checkpoint plus deep link.

## Completion receipt

All eight vertical slices completed on 2026-07-16. The customer-identical
isolated data-dir run reached five of five checkpoints, produced a passed
Operations Receipt and deterministic redacted completion archive, and exposed
the production handoff at `/api/workshop/handoff`.

The local release decision is **revise before public launch**: Relay runtime
and static sample conformance pass, while Website catalog/checkout/access and
operator-approved Motion production remain explicit external gates. No price,
SKU, checkout, email, paid generation, upload, publication, release or push
was performed.
