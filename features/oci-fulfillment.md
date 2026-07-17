---
title: Relay Host fulfillment across npm and OCI
status: completed
priority: P1
milestone: host-r3
source: _IDEAS/host-cell-fulfill.md
dependencies:
  - relay-host-artifact
  - relay-host-fleet-manager-contract
tdr: TDR-044
goal: G-095
---

# Relay Host fulfillment across npm and OCI

## Outcome

Relay uses one placement-neutral, offline-verifiable commercial contract for
managed Host authority. Relay Core and the public Relay Cell image remain free.
Premium Packs and managed Host operations are separate paid rights that may be
carried in one signed license envelope without becoming one entitlement.

The Website can issue the exact contract without inferring runtime behavior,
and the future Host supervisor can enforce it without contacting Orionfold.
Artifact authenticity, registry access, and commercial authority remain three
independent checks.

## Personas and product boundary

| Persona | Free path | Paid path |
|---|---|---|
| One person running Relay on a laptop | npm direct single Cell | Premium Packs only if wanted |
| Operator managing customer Cells on one laptop/server | Direct unmanaged Cell remains free | Host entitlement for managed lifecycle/capacity |
| Operator running several independent Hosts | One free direct Cell on each machine | One signed Host right per concurrently operated Host |
| Customer running a Cell supplied by an operator | Public Cell image and customer-owned data | Operator owns Host right; Pack rights belong to the customer unless redistribution is explicit |

The public OCI image contains the free Cell runtime only. The npm package
contains the direct local runtime and, under G-083, the Host supervisor. Buying
Host does not buy image bytes, and pulling image bytes does not grant Host
authority.

## Accepted commercial defaults

- Host entitlement: `product:relay-host`.
- Pack entitlement: `product:orionfold-relay`; it remains independent.
- Launch Host shape: one concurrently operated Host and ten managed Cells,
  represented by signed integers rather than a seat count.
- Launch term: 12 months. `updates_until` is signed separately and normally
  equals the term end so future support/update policies can evolve without
  changing canonicalization.
- Bundle: one envelope may contain both entitlements and grants; the rights and
  prices remain independently legible.
- Managed-customer use is allowed. Reselling or sublicensing the Host license
  itself is not included. An operator Pack entitlement is never copied into a
  customer Cell unless a future SKU grants that right explicitly.
- Same-licensee machine replacement is allowed after the prior Host is retired.
  Transfer to another legal customer requires reissue.
- Critical security updates for an existing compatible managed Cell remain
  available after lapse. Routine feature upgrades require current update
  eligibility.
- Public GHCR is the intended primary Cell registry; a Docker Hub mirror and
  private token exchange remain deferred to G-094 or a later approved goal.
- Website owns price amounts, lookup keys, checkout, issuance, and public sales
  copy. Relay links to the canonical `/relay/pricing.json` and does not hardcode
  a Host amount.

These defaults are customer-protective and deliberately avoid online metering.
Because the signed file is portable, `limits.hosts` is an auditable commercial
right rather than globally provable DRM. G-083 records a local Host claim and
refuses concurrent local misuse; stronger global enforcement requires a new
privacy and availability contract.

## Signed contract

The outer envelope remains the shipped `orionfold.license/v1` contract:

```json
{
  "payload": {
    "schema": "orionfold.license/v1",
    "license_id": "OF-RELAY-HOST-2026-0001",
    "product": "orionfold-relay-host",
    "tier": "host",
    "issued_to": { "email": "operator@example.com", "org": "Northstar" },
    "issued_at": "2026-07-17T00:00:00Z",
    "not_before": "2026-07-17T00:00:00Z",
    "expires_at": "2027-07-17T00:00:00Z",
    "entitlements": ["product:relay-host"],
    "grants": {
      "product:relay-host": {
        "schema": "orionfold.relay-host/v1",
        "sku": "relay-host-10-annual",
        "licensee": { "kind": "organization", "ref": "org_northstar" },
        "limits": { "hosts": 1, "managed_cells": 10 },
        "updates_until": "2027-07-17T00:00:00Z",
        "rights": {
          "managed_customer_cells": true,
          "packs": "separate",
          "reseller": false,
          "transfer": "same-licensee-replacement",
          "critical_security_updates": "included"
        }
      }
    }
  },
  "signature": { "alg": "ed25519", "key_id": "...", "value": "..." }
}
```

Rules:

1. Ed25519 verifies the raw canonical payload before parsing or defaults.
2. The outer schema stays v1; the optional `grants` extension is signed.
3. A Host license requires both the entitlement string and its matching grant.
4. `hosts` and `managed_cells` are positive integers. V1 has no unlimited
   sentinel; a larger right is another explicit signed integer.
5. `licensee.ref` is an opaque Website-issued identity, not customer content.
6. Registry credentials, pull tokens, image signatures, and OCI signing
   material are forbidden from the license.
7. A bundle adds `product:orionfold-relay` to `entitlements`; it never changes
   the Host grant or treats Pack seats as Hosts/Cells.
8. Installing a newly signed higher-capacity envelope is sufficient for an
   upgrade. Existing Cell identity and data do not change.

The machine-readable schema is `contracts/relay-host-license-v1.schema.json`.
Canonical issuer/verifier vectors live at
`src/lib/licensing/__tests__/fixtures/relay-host-license-v1.json`.

## Capacity accounting

| Cell state | Counts toward `managed_cells` | Reason |
|---|---:|---|
| `running` | yes | Managed and recoverable by the Host |
| `stopped` | yes | Stopping cannot bypass capacity |
| `retained` | yes | Host still owns lifecycle/data responsibility |
| `exported` | no | Standalone archive has left Host management |
| `purged` | no | Host registry/resources are permanently removed |
| `direct_unmanaged` | no | Free Relay Core path, outside Host authority |

Create, import, adopt, clone, and restore-to-new must reserve a slot before any
port, path, volume, network, registry row, or customer state is created. An
over-limit request returns `HOST_CAPACITY_EXCEEDED` and changes nothing.

## Term and lifecycle policy

| Operation | Active + capacity | Lapsed/updates ended | Missing current license with prior managed receipt |
|---|---:|---:|---:|
| Create/import/adopt/clone/restore new | allow | refuse | refuse |
| Start/stop/restart existing | allow | allow | allow |
| Backup/export/recover existing | allow | allow | allow |
| Restore over existing identity | allow | allow | allow |
| Purge or export-and-release | allow | allow | allow |
| Routine feature upgrade | if `updates_until` current | refuse | refuse |
| Compatible critical security update | allow | allow | allow |
| Claim replacement Host | active + same licensee + prior retirement | refuse pending renewal/reissue | refuse |

A not-yet-valid, tampered, unknown-key, malformed, or wrong-licensee document
never grants paid expansion. Continuity operations require an existing
Host-managed receipt; a random unlicensed user cannot manufacture Host authority
by asking for recovery.

## Named failure contract

- `HOST_LICENSE_REQUIRED`
- `HOST_LICENSE_SIGNATURE_INVALID`
- `HOST_LICENSE_KEY_UNTRUSTED`
- `HOST_LICENSE_SCHEMA_UNSUPPORTED`
- `HOST_GRANT_MISSING`
- `HOST_GRANT_INVALID`
- `HOST_LICENSE_NOT_YET_VALID`
- `HOST_LICENSE_LAPSED`
- `HOST_UPDATES_EXPIRED`
- `HOST_LICENSEE_MISMATCH`
- `HOST_CAPACITY_REQUEST_INVALID`
- `HOST_CAPACITY_EXCEEDED`
- `HOST_REPLACEMENT_REQUIRES_RETIREMENT`
- `HOST_LICENSE_CONTAINS_REGISTRY_SECRET`

Registry/image failures use separate artifact names; they are never reported as
license refusals.

## Acceptance criteria

- [x] Host-only, Pack-only, bundle, capacity-upgrade, and distinct-owner
  fixtures reproduce identical canonical bytes/signatures through the Relay
  verifier and Website-compatible issuer recipe.
- [x] Unknown schema/key, tampering, absent entitlement/grant, invalid limits,
  future/lapsed term, owner mismatch, and registry-secret payloads fail by name.
- [x] Running/stopped/retained managed Cells count; exported/purged/direct Cells
  do not; every expansion action refuses atomically at limit.
- [x] Lapse blocks expansion and routine upgrades while preserving existing
  start/stop, export, recovery, rollback, purge, and critical security updates.
- [x] A higher signed limit becomes effective without changing existing Cells.
- [x] README, trust terms, Host artifact documentation, schema, fixtures, and
  Website handoff agree on free/paid, authority, capacity, and lapse.
- [x] G-083's canonical Goal Contract requires consumption of this module rather
  than a second policy; G-094 remains the artifact-publication authority. The
  real supervisor effects and integration tests remain correctly owned by
  those incomplete goals rather than being simulated in G-095.

## Not in scope

- Host supervisor storage, lifecycle effects, or UI — G-083/G-084.
- OCI publication, signature identity, registry retention, or mirrors — G-094.
- Stripe products, public price amounts, checkout, issuance, emails, Website
  pages, or production signing — Website G-030.
- Online activation, global DRM, telemetry, or a private registry token broker.
- Fleet control across several Hosts.

## References

- `_IDEAS/host-cell-fulfill.md`
- `docs/relay-host-fulfillment.md`
- `docs/relay-host-artifact.md`
- `docs/trust/license-terms.md`
- `.agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md`
