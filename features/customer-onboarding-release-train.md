---
title: Customer Onboarding and First Value Release Train
status: in-progress
priority: P0
milestone: post-mvp
source: _IDEAS/triage.md
dependencies: []
---

# Customer Onboarding and First Value Release Train

## Description

The 2026-07-22 customer-identical `orionfold-relay@0.45.2` walkthrough proved
that Relay's individual capabilities are substantially ahead of the journey
that connects them. A customer can install the wrong cached application bytes
under a current version label, receive generic onboarding unrelated to their
entitlement, misunderstand the premium Pack offer, configure a provider that
other surfaces still call unavailable, create orphan workflows on failed start,
and lose a partially completed workflow to a transient health probe.

This workstream turns those verified failures into independently releasable
increments. It does not create a wizard or a second product shell. It makes the
existing CLI, welcome/dashboard, Settings, Packs, runtime routing, workflow
detail, Monitor, and Inbox surfaces form one truthful path to first value.

The canonical live status and exact Goal Contracts remain in
`_IDEAS/backlog.md`. This specification owns the durable product sequence and
cross-goal invariants.

## Personas and journeys

The train must work for:

1. A Community customer installing Relay locally for personal use.
2. A Pack-entitled customer installing and activating operating Packs.
3. A Host-entitled customer learning that managed Cells are optional capability,
   not mandatory setup.
4. A combined Pack + Host customer continuing from what is already unlocked.
5. A returning `npx @latest` customer upgrading without losing instance context.

The minimum first-value journey is:

`install → understand edition → choose/install Pack → connect eligible runtime
→ start exact workflow → observe progress/checkpoint → recover or complete`.

## Release increments

### O0 — Trustworthy published install

G-114 binds extracted builds and runtime inputs to the exact package version,
repairs same-cache upgrades atomically, and preserves the active instance's
restart context. Accepted 2026-07-22 after targeted, production, packed-npm and
customer-identical browser verification; it is a patch-release candidate on its
own.

### O1 — Entitlement-aware orientation

G-116 defines one state/persona model for the first screen, shell identity,
License, instance boundary, and optional Host journey. It resolves free Agency
Pack discovery without falsely claiming it is installed. Accepted 2026-07-22
after state/security regressions and real desktop/mobile light/dark browser
proof, including the guided Agency install and returning dashboard.

### O2 — Safe Pack activation

G-117 makes the product entitlement—not each Pack—the pricing object and
provides a resumable select/activate/install journey. G-118 makes Agency sample
data explicit and safely replaceable. G-117 was accepted 2026-07-23 after one
offer replaced twelve repeated price rails, local selection survived filter and
activation handoff, overlap-safe batch installation passed, and responsive
browser evidence confirmed the new decision cards. G-118 was accepted
2026-07-23 after durable row/customer provenance, current-month materialization,
no-loss cleanup and retained-table reinstall behavior passed 476 broader
regressions plus fresh desktop/mobile browser proof. O2 is complete.

### O3 — Truthful runtime readiness

G-119 creates one evidence-backed readiness presentation across credential,
OAuth, local provider, model inventory/load, routing, workflow preflight and
shell state. It was accepted 2026-07-23 after the complete state matrix,
3,870-test suite, production build, deterministic real-task runtime smoke, and
responsive dark-browser proof passed. G-120 now reorganizes Settings around
that contract and was accepted 2026-07-23 after compact provider-first
desktop/mobile proof, live routing reconciliation and the complete 3,874-test
suite passed. G-123 now removes filesystem-skill warning floods without hiding
real scanner failure.

### O4 — First successful and recoverable run

G-121 makes Start run preflighted and atomic, then navigates to the exact
workflow. G-122 introduces step-scoped recovery for transient runtime loss and
prevents completed side effects from replaying.

### O5 — Release acceptance and CLI polish

G-115 removes or truthfully dispositions npm dependency warnings. G-025 runs
the customer-identical clean-cache and same-cache acceptance journeys and owns
the final evidence bundle.

## Cross-goal invariants

- Displayed version, running bytes, package metadata and downloaded artifact
  must agree.
- Edition, licensee identity and entitlement classes are separate concepts.
- "Available", "installed", "configured", "connected", "loaded", "eligible",
  "running", and "completed" must never be used interchangeably.
- A refused Start run creates no hidden draft.
- A successful Start run always has an exact workflow identity and destination.
- A transient preflight failure after completed steps does not erase progress or
  authorize whole-workflow side-effect replay.
- No onboarding improvement introduces telemetry, mandatory registration,
  hosted state, or cloud dependence.
- Public pricing and entitlement claims remain operator-gated.
- Every goal receives a regression disposition and the nearest real runtime or
  browser proof proportionate to its risk.

## Acceptance criteria

- [x] `_IDEAS/backlog.md` exposes this as the active workstream and keeps its
      current increment/current goal synchronized on every state change.
- [x] G-114 independently proves a version-correct old→new shared-cache upgrade.
- [x] Community, Pack, Host and combined customers receive coherent first-screen,
      shell and Settings guidance.
- [x] Premium Packs present one entitlement and one resumable activation path.
- [x] Agency sample data is visibly synthetic and safely replaceable.
- [x] Provider/model/routing/shell states reconcile without manual extra refresh.
- [ ] A customer can start a compatible Pack workflow with no orphan or inert
      success action.
- [ ] A transient later-step runtime timeout can recover without recreating
      prior documents or schedules.
- [ ] The final Mode B staging bundle proves clean install, shared-cache upgrade,
      activation, workflow completion/recovery and isolation.
- [ ] Every originating TRIAGE-036–TRIAGE-054 finding is mapped to exactly one
      owning Goal Contract or a named shared dependency.

## Scope boundaries

**Included:**

- Published npm install/upgrade/restart experience.
- First screen, entitlement identity, License/Packs/Host continuity.
- Provider/model/routing readiness and first workflow lifecycle.
- Customer-facing CLI diagnostics encountered in that journey.
- Fresh-customer release acceptance.

**Excluded:**

- New cloud-provider support or Host Fleet control.
- Enterprise connector implementation.
- New Pack SKUs or per-Pack pricing.
- Real billing/invoicing policy owned by G-015.
- Broad navigation or dashboard redesign unrelated to first value.

## References

- `_IDEAS/triage.md` — TRIAGE-036 through TRIAGE-054 grooming map
- `output/staging/2026-07-22-operator-host-cell-pack/FINDINGS-live.md`
- `features/npm-customer-install-integrity.md`
- `features/entitlement-aware-customer-onboarding.md`
- `features/runtime-first-value-reliability.md`
