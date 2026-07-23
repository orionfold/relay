---
title: Sample Data Dashboard Reconciliation
status: completed
priority: P0
milestone: mvp
source: _IDEAS/triage.md TRIAGE-060
dependencies: [agency-pack-depth]
---

# Sample Data Dashboard Reconciliation

## Description

The Agency “Use my own data” mutation already removes only untouched synthetic
records and preserves edited or customer-created data. The app detail page is a
Server Component whose runtime model is cached for 30 seconds, however, so both
the route and its tagged runtime snapshot must be invalidated after deletion.

After a successful deletion, the client must refresh the current route while
retaining the existing confirmation and success feedback. Failure must leave
the confirmation retry available and must not refresh stale or partially
mutated state.

## User story

As an Agency customer moving from samples to my own data, I want the dashboard
to immediately reflect the data that remains so that Relay never presents
fictional metrics after confirming removal.

## Acceptance criteria

- [x] A successful sample-removal response updates the panel and refreshes the
      current App Router route exactly once.
- [x] The refreshed Server Component rebuilds KPI and list models from the
      post-deletion database state.
- [x] A failed or invalid response does not refresh and keeps the retry action
      available.
- [x] Existing protections for edited samples and customer-created records
      remain unchanged.
- [x] Component regression coverage proves success refreshes and failure does
      not; browser evidence confirms Agency KPIs leave their seeded state.

## Scope boundaries

Included:

- Post-success route reconciliation for the existing mutation.
- Focused component and customer-identical browser regression evidence.

Excluded:

- Changing deletion semantics, sample provenance, or Agency KPI formulas.
- Optimistic recreation of the complete server model in the client.
- Applying blanket refresh behavior to unrelated mutations.

## References

- `src/components/apps/sample-data-panel.tsx`
- `src/lib/apps/app-runtime-cache.ts`
- `src/app/apps/[id]/page.tsx`
- `features/agency-pack-depth.md`
- Customer-identical rebuilt npm staging on 2026-07-23 removed 35 untouched
  rows and immediately changed Billed/Costs to `$0.00`, Margin to `—`, and
  Active clients to `0` without manual reload.
