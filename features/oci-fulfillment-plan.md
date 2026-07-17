---
title: G-095 Relay Host fulfillment implementation plan
status: completed
specification: features/oci-fulfillment.md
goal: G-095
date: 2026-07-17
---

# G-095 implementation plan

## Scope challenge

Proceed with the contract slice. Reuse the shipped canonical JSON, Ed25519
verifier, file store, and license CLI. Do not build the Host supervisor, online
metering, registry publication, or Website commerce inside this goal.

## What already exists

- `src/lib/licensing/canonicalize.ts` owns frozen cross-language signing bytes.
- `src/lib/licensing/verify.ts` owns trusted keys, signature, term, and simple
  entitlement verification.
- `src/lib/licensing/store.ts` persists exact signed envelopes at mode `0600`.
- Website's issuer already accepts product/tier/entitlement overrides and uses
  the same `orionfold.license/v1` canonicalization.
- G-093/G-099 prove the OCI Cell artifact independently from licensing.
- TDR-044 owns the npm Host / OCI Cell distribution boundary.

## NOT in scope

- Host DB/registry or real resource allocation: G-083 needs the accepted
  contract first.
- Settings Host lifecycle UX and browser proof: G-084.
- Registry writes, Cosign identity, or multi-architecture publication: G-094.
- Website catalog/Stripe/email/page mutations or price setting: Website G-030.
- Online activation or cross-machine enforcement: conflicts with the accepted
  local-first/offline promise and needs a separate privacy contract.

## Specification and acceptance mapping

| Acceptance criterion | Implementation slice |
|---|---|
| Exact cross-repo contract | JSON Schema + canonical fixture corpus |
| Offline verified Host grant | `src/lib/licensing/host-entitlement.ts` |
| Capacity and lapse invariants | pure accounting/admission functions + matrix tests |
| Upgrade without Cell mutation | effective-grant selection tests |
| Documentation agreement | public fulfillment guide + deterministic parity check |
| Architecture continuity | TDR-044 amendment; G-083/G-094 ownership stays explicit |

## Vertical slices

1. Add the Host-grant JSON Schema and canonical vectors without changing the
   frozen outer license format.
2. Add a pure parser/inspector that verifies signature first, rejects secret
   material, validates the grant, and reports active/lapsed/update state.
3. Add pure Cell counting and action admission with named refusal codes.
4. Test Host-only/Pack-only/bundle/upgrade/owner/term/capacity/continuity cases.
5. Add public product-boundary docs and a deterministic parity script.
6. Reconcile TDR, backlog, changelog, and Website G-030 dependency state.

## Regression test budget

| Risk | Protecting evidence |
|---|---|
| Existing Pack license breaks | existing licensing verifier/store/gate/CLI/API suites |
| Signature parsed before verified | tampered Host payload test; existing canonical tests |
| Host grant accepts malformed limits/secret | schema/parser negative matrix |
| Stopped/retained Cell avoids capacity | state-accounting parameterized tests |
| Lapse strands customer data | operation matrix across active/lapsed/missing-with-receipt |
| Capacity upgrade mutates identity | grant-selection test over unchanged Cell snapshot |
| Docs contradict code | `check:host-fulfillment` exact constant/copy/link guard |
| Runtime registry cycle | not applicable: no agent/runtime/workflow imports touched |

Verification order:

1. `npx vitest run src/lib/licensing/__tests__/host-entitlement.test.ts`
2. `npx vitest run src/lib/licensing/__tests__ src/app/api/license/__tests__`
3. `npm run check:host-fulfillment`
4. `npm run check:doc-links`
5. `npm run build:cli`
6. `npm run build`

## Error & Rescue Registry

| Failure | Expected behavior | Rescue |
|---|---|---|
| Existing v1 license lacks `grants` | Pack path unchanged; Host parser returns `HOST_GRANT_MISSING` | Website issues Host-shaped envelope |
| Unknown grant schema | refuse Host authority, retain exact envelope | add explicit version adapter in a later contract |
| Lapsed license | deny expansion; allow receipt-bound continuity | renew with another signed envelope |
| Capacity exceeded | fail before any allocation | install higher-limit signed license or release a Cell |
| Wrong licensee | refuse paid action | reissue/transfer; never rewrite signed payload |
| Registry token in license | refuse Host contract as unsafe | issue token-less license and handle registry separately |
| Website fixture drift | parity check names exact bytes/path | update Website issuer to consume the accepted fixture |
| Plan proves Host effects impossible | do not fake resource tests | leave real mutation enforcement to G-083 |

## Rescue and rollback

The new Host contract is additive. Pack-only licenses and callers never enter
the Host parser. If adoption fails, G-083 remains blocked and the new module can
be removed without a database migration, license-store rewrite, or Cell change.
