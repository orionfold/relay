---
title: Customer Onboarding and First Value Release Train
status: accepted
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
suite passed. G-123 was accepted 2026-07-23 after dangling and valid symlink,
unreadable, malformed, absent-root, redaction and named-scanner-failure
regressions passed; the real customer skill tree now returns 91 valid profiles
with one path-free CLI diagnostic instead of 31 entry warnings. O3 is complete.
O4 is complete.

### O4 — First successful and recoverable run

G-121 was accepted 2026-07-23 after evidence-only responsive readiness,
zero-orphan refusal, idempotent atomic start and exact semantic workflow links
passed 3,894 regressions, production build and deterministic real-runtime graph
proof. G-122 was accepted 2026-07-23 after adding durable transient-runtime
pause state, exact-step preflight and atomic recovery, bounded fail-closed retry,
completed-prefix and receipt preservation, 3,908 regressions, production build,
runtime-graph smoke and isolated customer-visible browser proof. The final G-025
local-runtime run then exposed TRIAGE-055: shared task context still resolved
non-Claude profiles as Claude Code, and non-Claude adapters omitted the
machine-readable failure reason required by G-122. O4 is temporarily reopened
for the bounded G-124 parity repair. G-124 was accepted 2026-07-23 after the
Ollama-only profile, controlled 503, `blocked_runtime`, exact-step retry and
no-duplicate-prefix proof passed; O4 is complete again.

### O5 — Release acceptance and CLI polish

G-115 was accepted 2026-07-23 after the real packed-install warning count fell
from seven to one, stale ExcelJS was replaced with maintained Node 20-compatible
XLSX components, and the remaining native-installer path received an exact
Node 22 adoption trigger. G-124 repaired the cross-runtime recovery parity
finding from G-025's first pass. G-025 was accepted 2026-07-23 with the final
customer-identical clean-cache journey and G-114's accepted same-cache upgrade
proof. Its evidence bundle exposed two bounded truth inconsistencies. G-125 was
accepted 2026-07-23 after terminal run authority reconciled the retained failed
attempt into the same truthful receipt and real browser evidence passed. G-126
was accepted 2026-07-23 after the shared mutation event refreshed identity and
Settings-at-a-glance readers, out-of-order responses were rejected, and real
remove/reactivate browser proof reconciled every visible entitlement consumer
without a manual reload. O5 and the release train are complete.

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
- [x] A customer can start a compatible Pack workflow with no orphan or inert
      success action.
- [x] A transient later-step runtime timeout can recover without recreating
      prior documents or schedules on the runtime readiness selected, including
      an Ollama-only profile (G-124).
- [x] A recovered run's singular Operations Receipt reconciles to the final
      terminal outcome while retaining its failed and completed attempts
      (G-125).
- [x] Successful license add/remove reconciles the app bar, Current Access,
      data boundary, Settings-at-a-glance, Packs, and Host guidance without a
      manual reload or stale-response rollback (G-126).
- [x] The final Mode B staging bundle proves clean install, shared-cache upgrade,
      activation, workflow completion/recovery and isolation.
- [x] Every originating TRIAGE-036–TRIAGE-057 finding is mapped to exactly one
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

- `_IDEAS/triage.md` — TRIAGE-036 through TRIAGE-057 grooming map
- `output/staging/2026-07-23/` — G-025 O5 acceptance evidence
- `output/staging/2026-07-22-operator-host-cell-pack/FINDINGS-live.md`
- `features/npm-customer-install-integrity.md`
- `features/entitlement-aware-customer-onboarding.md`
- `features/runtime-first-value-reliability.md`
