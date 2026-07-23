---
title: G-116 Entitlement-Aware Customer Orientation Implementation Plan
status: completed
specification: features/entitlement-aware-customer-onboarding.md
goal: G-116
---

# G-116 Entitlement-Aware Customer Orientation Implementation Plan

## Goal contract

Deliver a coherent first screen and Settings journey for Community, Packs,
Host, and combined entitlements without conflating licensee identity,
entitlements, installed Packs, or Host readiness.

Constraints:

- The free Relay Agency Pack is a guided one-click opt-in, never automatic.
- Preserve the truthful Cell isolation warning and the existing Host progress
  indicator.
- Do not add checkout, automatic sample seeding, or Host provisioning.
- Reuse the canonical file-backed license store, Pack registry/installer, and
  Host deployment state rather than introducing a second source of truth.

Executable verification:

- Typed state-model unit tests cover missing, invalid, active, expiring,
  lapsed, and read-error license paths plus Community, Packs, Host, and combined
  entitlement combinations.
- Component tests protect contextual actions, top-bar identity, Settings copy,
  Agency install success/failure/double-click behavior, and Host preview versus
  entitled progress.
- Typecheck and the affected Vitest suites pass.
- A real browser pass covers fresh and returning behavior at desktop and 390 px
  in light/dark mode, including keyboard focus and readable order.

Operator gates:

- Satisfied: guided one-click Agency installation and concise entitlement-aware
  message hierarchy.
- Still gated: public website copy, purchase/checkout changes, push, publish,
  release, and external writes.

Stop/rescue:

- If existing license or Host sources cannot express a required state without
  changing their security contract, stop with an evidence packet rather than
  manufacturing inferred authority.

## Scope challenge

- **REDUCE scope:** copy-only changes would be smaller, but Home, top bar,
  License, Cell boundary, and Host would continue deriving state independently.
- **PROCEED as-is:** one pure presentation resolver plus a read-only API and
  reuse across the existing surfaces is the smallest architecture that removes
  drift.
- **EXPAND scope:** a new onboarding wizard, checkout, automatic Pack install,
  or sample-data choice would add complexity and belongs to G-117/G-118.

Decision: proceed as-is, as authorized by the operator.

## NOT in scope

- Premium Pack offer layout, selection persistence, checkout, or public price
  language; G-117 owns these.
- Agency sample-data provenance, opt-in, cleanup, or derived KPI disclosure;
  G-118 owns these.
- New Host provisioning behavior or cloud-provider writes; existing Host
  capability is summarized only.
- Authentication or runtime-provider onboarding; those remain separate goals.
- Website publication, push, npm publish, OCI publish, or release.

## What already exists

- `src/lib/licensing/store.ts` lists every stored license, including invalid or
  lapsed entries, and keeps licensee identity distinct from entitlements.
- `src/lib/host/deployment/service.ts` exposes missing, invalid, active, or
  lapsed Host entitlement plus Host lifecycle.
- `src/lib/apps/registry.ts` distinguishes installed Packs from bundled
  availability.
- `src/app/api/packs/install/route.ts` provides the curated, license-aware Pack
  install boundary.
- `src/components/packs/pack-install-button.tsx` provides double-click
  protection, success/failure visibility, and refresh behavior.
- `src/components/dashboard/welcome-landing.tsx`,
  `src/components/shell/bar-identity-cluster.tsx`,
  `src/components/settings/license-section.tsx`,
  `src/components/instance/instance-section.tsx`, and
  `src/components/settings/host-deployment-section.tsx` are the existing
  customer surfaces to adapt.
- Semantic surface, status, focus, and responsive tokens already exist in
  `src/app/globals.css`; no new visual system is required.

## Implementation slices

### Slice 1 — Pure orientation contract

Create a typed resolver under `src/lib/onboarding/` that accepts license,
installed-Pack, bundled-Pack, and Host facts and returns:

- edition and license lifecycle;
- licensee identity;
- separate Packs and Host entitlement summaries;
- Agency availability/install lifecycle;
- Host availability/readiness;
- a ranked primary and secondary action set;
- customer-readable summary and continuity copy.

Add a server loader and `/api/onboarding/orientation` read route. Server
dependencies remain outside the pure resolver so fixture tests can exhaust the
state matrix.

### Slice 2 — Fresh Home and Agency opt-in

Pass the orientation contract into the existing fresh-instance welcome. Replace
the universal “build a Pack” hierarchy with contextual value, explicit current
edition/entitlement badges, and ranked actions. Add a reusable guided Agency
install action that calls the existing curated install endpoint, announces
success/failure, guards double-clicks, and refreshes into the installed Pack
state.

### Slice 3 — Shared shell and Settings continuity

Extend the existing instance-identity response with the same summarized
entitlement presentation for the top bar. Update License to lead with what is
active and what remains usable, keeping raw IDs, storage path, and verification
mechanics in progressive disclosure. Pass the orientation response into the
Cell boundary and Host sections so their copy and badge states agree. Preserve
the Host progress visualization, but label it as an optional capability preview
for customers without Host rights.

### Slice 4 — Verification, review, and completion

Run the regression ladder, exercise state fixtures in a real dev instance,
perform desktop/mobile light/dark keyboard browser checks, run a fresh
licensing-focused review, repair findings, update the specification, changelog,
canonical backlog/workstream status, and commit only G-116-owned Relay changes.

## Specification and acceptance mapping

The authoritative behavior is
`features/entitlement-aware-customer-onboarding.md`; this plan owns sequencing
only.

| Acceptance criterion | Implementation slice | Evidence |
| --- | --- | --- |
| One non-conflated API/presentation contract | Slice 1 | resolver + route tests |
| Contextual Community, Pack, Host, combined first screens | Slice 2 | resolver and welcome tests |
| Agency available never means installed | Slices 1–2 | state fixture + UI assertion |
| Top bar, License, boundary, Host agreement | Slice 3 | component/API tests |
| Correct Pack versus Host lapse continuity | Slices 1 and 3 | lifecycle fixture assertions |
| Desktop/390, light/dark, keyboard/focus/read order | Slice 4 | browser evidence |

G-117 owns the premium catalog acceptance criteria. G-118 owns sample-data
provenance and transition acceptance criteria.

## Regression test budget

Changed behaviors and tests:

- New `src/lib/onboarding/__tests__/orientation.test.ts`: Community, Packs,
  Host, combined, invalid, expiring, lapsed, missing, and read-error fixtures;
  Agency available/installed and Host preview/ready branches; action ranking
  and continuity language.
- New route test for `/api/onboarding/orientation`: loader success and named
  read failure.
- Extend `welcome-landing.test.tsx`: contextual heading/actions, guided Agency
  install success, failure, and double-click protection.
- Extend `bar-identity-cluster.test.tsx`: edition badge, licensee, and distinct
  entitlement summary.
- Extend `license-section`, `instance-section`, and
  `host-deployment-section` tests for customer-readable active/missing/lapsed
  and preview states.
- Run affected suites, `npx tsc --noEmit`, and `npm run build`.
- Browser: fresh Community and fixture-backed licensed states, desktop and
  390 px, light/dark, Tab/Enter activation, focus visibility, and DOM heading
  order. Verify that installing Agency transitions to an installed/open state.

No runtime-registry-adjacent module is touched, so the special real-task
runtime smoke is not triggered.

## Error & Rescue Registry

| Failure mode | Visible behavior | Recovery |
| --- | --- | --- |
| License directory unreadable | `read_error`, no false Community claim | Link to License retry/details; log named server error |
| Stored license invalid/lapsed | Explicit lifecycle and continuity copy | Preserve installed content; direct activation/renewal action |
| Host state unreadable | Host state `degraded`, not “not entitled” | Keep License truth, show retryable Host error |
| Agency catalog entry missing | No install action; explicit unavailable copy | Keep Chat/Packs secondary actions; packaging test fails |
| Agency install fails | Named toast/live error; no installed claim | Re-enable retry without losing page state |
| Double-click or slow install | One request while pending | Disabled control and idempotent refresh |
| Client API stale after activation/install | UI refreshes the authoritative server state | Manual Retry remains available |
| Presentation contract drifts from source | Fixture/API parity tests fail | Update resolver mapping, never duplicate source state |

## Verification commands

1. `npx vitest run <affected test paths>`
2. `npx tsc --noEmit`
3. `npm run build`
4. Start an isolated dev instance on a free port and verify the browser matrix.
5. Run a fresh code review focused on licensing truth, entitlement separation,
   failure visibility, accessibility, and unintended release-surface changes.

## Rollback

The change is additive at the model/API layer and edits existing presentation
surfaces without data migration. Revert the G-116 commit to restore the prior
copy and actions; installed Pack and license files remain untouched.

## Completion receipt — 2026-07-22

All four slices completed. The final security/state review additionally ensured
that invalid signatures cannot supply customer identity, mixed invalid/lapsed
stores use only the verified lapsed identity, existing Host state cannot be
mislabelled as a preview, Pack registry/catalog failures remain visible, and
license mutations refresh shell and Host presentation without waiting for the
polling interval.

Accepted evidence: 50 focused tests, 210 broader regressions, TypeScript,
production build, and the required desktop/mobile light/dark browser journey.
