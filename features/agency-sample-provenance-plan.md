---
title: Agency Sample Provenance and Safe Transition Plan
status: completed
goal: G-118
authority: features/entitlement-aware-customer-onboarding.md
---

# Agency Sample Provenance and Safe Transition Plan

## Goal contract

**Outcome:** keep synthetic Relay Agency data as the default exploration mode,
make its status unmistakable wherever it affects customer interpretation, and
let a customer leave exploration mode without losing anything they created or
edited.

**Constraints:** provenance must be durable data; untouched sample, edited
sample and customer-created records must remain distinct; current-period KPIs
must not decay as the release ages; this work does not create agency billing
policy.

**Operator gate:** resolved 2026-07-23 — retain default sample loading with an
explicit, no-loss transition.

**Stop/rescue:** if row-level migration proves unsafe, preserve existing values
and use a pack-install ledger. Never infer deletability from a name, date or
current value.

## Codebase-grounded design

1. Extend table rows and customers with nullable `sample_source`,
   `sample_state`, and immutable `sample_seed_hash` metadata. Null means
   customer-created; `sample` means untouched; customer-facing mutation changes
   the state to `sample-edited`.
2. Stamp provenance only through the internal Pack installer. Public create
   APIs cannot claim sample provenance.
3. Materialize the explicit `{{current_month}}` token at install time so
   synthetic engagement dates stay useful after month/year rollover.
4. Add one Agency exploration panel that names the records as fictional,
   summarizes affected tables, discloses sample-derived KPI hints, previews the
   transition, supports cancel, and removes only untouched samples.
5. Surface `Sample` / `Edited sample` badges in both Row and Render Table modes.
6. Make removal idempotent. Preserve edited samples, customer-created rows and
   any sample customer referenced by projects or usage history.

## Vertical slices and regression budget

- **Provenance/write path:** schema/bootstrap compatibility, Pack install
  stamping, mutation transition, and current-month materialization.
- **No-loss transition:** mixed sample/customer records, edited samples,
  preview/cancel/confirm/retry, reference protection and repeated removal.
- **Presentation:** Agency panel, KPI disclosure and shared Table badges.
- **Verification:** targeted Pack/bootstrap/component tests; broader
  Pack/Table/onboarding tests; TypeScript; production build; fresh isolated
  desktop and 390 px light/dark browser proof.

## Rollback

The columns are nullable and additive. A rollback can stop writing or reading
them without rewriting existing customer data. The removal endpoint has no
value-based fallback: if provenance is unavailable it removes nothing.

## Acceptance receipt

Implementation completed 2026-07-23. Final verification evidence is recorded
in `features/entitlement-aware-customer-onboarding.md` and the feature
changelog.
