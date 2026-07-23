---
title: G-117 Premium Pack Select-to-Activate Implementation Plan
status: completed
specification: features/entitlement-aware-customer-onboarding.md
goal: G-117
---

# G-117 Premium Pack Select-to-Activate Implementation Plan

## Goal contract

Turn the Packs page into one truthful product-entitlement journey: customers
choose useful premium Packs, retain that choice through license acquisition or
activation, and install the chosen set without seeing the same product price
repeated as if every Pack were a separate purchase.

Constraints:

- Use the existing canonical founding offer (`$349/year`, `$499/year` list) and
  current Website purchase URL; do not create a price, SKU, checkout or hosted
  entitlement service.
- A checkbox only chooses content. It never purchases, activates or installs.
- Keep free, installed, update, corrupt-template, bundle/component and Pack
  provenance states explicit.
- Persist only bundled Pack IDs locally; never persist license material or
  customer data.
- A partial batch install keeps failures selected and retryable while preserving
  successful installs.

Executable verification:

- Pure offer resolution rejects divergent price/URL metadata instead of
  arbitrarily choosing a Pack's copy.
- Component regressions cover empty/multiple/restored selections,
  Community/active/lapsed calls to action, bundle/component overlap, successful
  batch install, partial failure, retry and double-click protection.
- Existing Pack format/catalog/install/update tests, TypeScript and production
  build pass.
- A disposable browser verifies all/free/premium filters, selection
  persistence, responsive keyboard/focus/read order and no repeated card price.

Operator gates:

- Satisfied for local implementation: use the existing canonical founding/list
  offer and current public Relay purchase destination.
- Still gated: Website edits, checkout changes, push, publication and release.

Stop/rescue:

- If the Website cannot accept or return selected IDs, retain the selection in
  versioned local storage and present an explicit resume instruction. Never
  infer that checkout completed.

## Scope challenge

- **REDUCE:** copy-only removal of card prices would leave no resumable
  selection or multi-Pack installation path.
- **PROCEED:** a pure catalog-offer resolver plus one client selection component
  reuses current licensing and install APIs while addressing the complete
  verified journey.
- **EXPAND:** a Relay checkout, remote account, new SKU, Pack recommendation
  engine or sample-data lifecycle belongs elsewhere.

Decision: proceed with the bounded local selection and existing external
license handoff.

## Implementation slices

### Slice 1 — Canonical catalog offer

Resolve one product-level offer from premium Pack metadata. Require every
renderable premium Pack to agree on founding price, list price and purchase
destination. Surface drift as a named catalog error and suppress a misleading
purchase action.

### Slice 2 — Decision cards and persistent selection

Replace premium conversion rails with compact selectable cards showing `Job`,
`Choose it when`, `Includes`, and `Works with`. Persist selected IDs under a
versioned local-storage key, pruning unknown or already installed IDs.

Selecting a bundle removes its child components. Selecting a component removes
any selected bundle that contains it. Explain the adjustment so composition
never looks like multiple paid SKUs.

### Slice 3 — Activate or install

Community and lapsed customers receive one offer action and an explicit
locally-saved resume promise. Entitled customers receive `Install selected`.
Install sequentially through the existing curated endpoint. Remove successes
from the pending set, keep failures selected, name each failure and allow retry.

### Slice 4 — Verification and acceptance

Run the regression ladder and real browser matrix, repair fresh-review findings,
then update the authoritative specification, release train, changelog and
canonical backlog before committing only G-117-owned Relay changes.

## Regression budget

- New catalog-offer resolver tests: shared canonical offer, missing metadata,
  price drift and purchase-URL drift.
- New selector component tests: persistence, filters unaffected by selection,
  entitlement/lapse CTAs, bundle overlap, batch success, partial failure,
  retry and pending guard.
- Existing Pack schema, catalog, price-drift, install-route, install/update and
  licensing suites.
- TypeScript and `npm run build`.
- Disposable desktop/390 px, light/dark browser proof with keyboard focus.

No runtime-registry-adjacent import changes are planned, so the special real
runtime task smoke is not triggered.

## Error and rescue registry

| Failure | Visible behavior | Recovery |
| --- | --- | --- |
| Premium price/URL metadata diverges | Named offer configuration warning; no purchase link | Repair metadata; price-drift gate |
| localStorage unavailable/corrupt | Selection works for current page and names persistence failure | Choose again; no false restore claim |
| Checkout canceled or customer returns unlicensed | Pending IDs and resume explanation remain | Activate later and return |
| License invalid/lapsed | Renewal/activation action, no install claim | Activate current signed license |
| One Pack install fails | Per-Pack error; successes retained; failures remain selected | Retry failed selection |
| Bundle/component overlap | Selection is normalized and announced | Choose bundle or components explicitly |
| Slow/double click | One batch at a time | Disabled pending control |

## Rollback

Revert the G-117 commit. No data migration exists; installed Packs and license
files are untouched, and the versioned local selection key becomes inert.

## Completion receipt — 2026-07-23

All four slices completed. The final review added explicit recovery for a stale
license refusal, bundle-to-bundle overlap normalization, truthful all-installed
copy and a non-empty bundle `Includes` fallback.

Accepted evidence: 307 Pack/onboarding/API/component regressions, TypeScript,
production build, and an isolated in-app browser proof at desktop and 390 px in
light/dark. The browser confirmed exactly one `$349/year` offer, zero per-card
license links, selection persistence across All/Free/Premium filters,
bundle/component replacement, responsive layout and visible keyboard focus.
