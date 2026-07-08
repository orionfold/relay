---
title: Pack compat diff gate — fail release on breaking pack updates (R5)
status: shipped
priority: P1
milestone: post-mvp
source: _IDEAS/packs-robustify.md §6 Pillar C / §10 R5
dependencies: [pack-taxonomy-codified, pack-taxonomy-ci-gate]
built: 2026-07-08
---

# Pack compat diff gate — fail release on breaking pack updates (R5)

## Description

R1/R3 make every current manifest reconcile with the codified taxonomy. This gate protects the
next axis: **a future version of a pack must not remove customer-visible contracts from the last
published version** unless the pack explicitly raises its `relayCore` major.

The check is local and fail-closed. It compares the current bundled templates against a git baseline
ref (`origin/main` by default, overridable with `RELAY_PACK_COMPAT_BASE_REF`) and fails on breaking
manifest drift:

- removed pack
- removed table
- removed/renamed column
- removed blueprint
- removed row-insert trigger or trigger retarget
- removed schedule
- removed existing `view.bindings` reference for a still-present primitive

New packs and additive tables, columns, blueprints, schedules, and view references pass.

## Built

- `scripts/check-pack-compat.mjs`
  - exports a pure `checkPackCompat()` core for tests
  - snapshots pack manifests from the filesystem and from a git ref
  - defaults baseline to `origin/main`; release CI can set `RELAY_PACK_COMPAT_BASE_REF=vX.Y.Z`
  - reports allowed breaking findings when `relayCore` major is raised
- `package.json`
  - adds `npm run check:pack-compat`
- `scripts/npx-prod-smoke.mjs`
  - adds **Case TC** between taxonomy and tarball checks

## Acceptance

- [x] Clean additive changes pass.
- [x] Removed tables, columns, blueprints, schedules, triggers, view bindings, and packs fail.
- [x] A `relayCore` major bump allows an intentional breaking change.
- [x] The real template set passes against the default `origin/main` baseline.
- [x] The release smoke runs the gate as Case TC.

## Scope Boundaries

Included: manifest-level backward compatibility for bundled packs.

Excluded:
- Runtime install-time side-by-side collision refusal (R2).
- Join-key/integration validation (R7).
- Remote "last published" discovery. The gate is intentionally local-first; the release caller chooses
  the baseline ref when `origin/main` is not the precise published baseline.

## Verification

- `npm run check:pack-compat`
- `npx vitest run src/lib/packs/__tests__/pack-compat-gate.test.ts`
