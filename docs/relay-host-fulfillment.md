# Relay Host fulfillment: what is free, what is paid, and what proves it

Relay uses two distribution channels for one release family:

- npm provides the Relay CLI/application, direct local single-Cell path, and
  the Host-local supervisor;
- an OCI registry provides the sealed Linux Relay Cell runtime used by a
  managed Host.

They do not create two editions. Relay Core and the public Cell image are free.
The paid Host product is the supervisor's authority to create and manage
isolated Cells within signed limits.

## Three independent proofs

| Proof | Answers | Mechanism |
|---|---|---|
| Commercial license | May this operator use managed Host actions, and within what limits? | Offline Ed25519 `orionfold.license/v1` envelope |
| OCI signature and digest | Did Orionfold's authorized release workflow produce these exact Cell bytes? | G-094 release signature, attestation, SBOM, and immutable digest |
| Registry credential | May this principal pull from this repository? | None for the intended public GHCR image; scoped registry token only for a customer mirror |

A license is never a Docker password. The license signing key never signs an
image. A registry credential never grants paid Host rights. Relay must report
which boundary failed instead of reducing them all to “not authorized.”

## Products

| Product | Entitlement | Meaning |
|---|---|---|
| Relay Core | none | Free application and direct unmanaged single Cell |
| Relay Cell image | none | Free signed OCI distribution of Core |
| Relay Packs | `product:orionfold-relay` | Install/update premium maintained Packs |
| Relay Host | `product:relay-host` | Managed Host/Cell lifecycle within signed limits |
| Operator bundle | both | Both rights in one envelope, still independently legible |

The accepted launch Host grant is annual, one Host, and ten managed Cells.
Website owns the amount and checkout lookup key; the canonical public source is
[orionfold.com/relay/pricing.json](https://orionfold.com/relay/pricing.json).
Until that feed contains the Host offer and G-084 ships the lifecycle UX, Relay
must describe Host as pre-release rather than purchasable. G-083 supplies the
local CLI/domain implementation, and G-094 now supplies the verified public Cell
image; neither authorizes a Host purchase or cloud deployment by itself.

## What counts

Running, stopped, and retained Host-managed Cells count toward
`limits.managed_cells`. A direct unmanaged Cell, a standalone exported archive,
and a permanently purged Cell do not. Exporting a backup alone does not free a
slot: the Host must complete an explicit export-and-release or purge transition.

Every create, import, adopt, clone, or restore-to-new request must pass the
pure admission contract before the Host allocates any port, path, volume,
network, registry row, or customer state. At capacity, Relay returns
`HOST_CAPACITY_EXCEEDED` without residue.

## Lapse, upgrade, replacement, and ownership

- Lapse prevents new managed Cells and routine feature upgrades.
- Existing Cells keep running and remain startable, stoppable, exportable,
  recoverable, rollback-capable, and purgeable.
- Compatible critical security updates remain available to existing Cells.
- Installing a newly signed higher-capacity license immediately makes the
  higher limit eligible; it does not recreate or mutate Cells.
- A one-Host license may move to a replacement machine for the same licensee
  after the prior Host claim is retired. Another organization requires reissue.
- An agency may manage customer Cells under its Host grant, but that is not a
  right to resell the license or copy its Pack entitlement into those Cells.

The file is portable and verification is offline. Consequently, `hosts` is a
signed commercial right enforced by each local supervisor and audited by the
operator, not invisible global DRM. Any future online registration service must
be separately specified for privacy, availability, recovery, and offline grace.

## Fulfillment journey

1. Website sells a Host-only or bundle SKU and issues the existing signed
   license envelope with the exact versioned Host grant.
2. The customer installs Relay through npm and runs
   `relay license add <license-file>`.
3. The Host supervisor verifies the signature, term, entitlement, grant,
   licensee, and local Host claim offline.
4. It resolves the release manifest, pulls the public Cell image by immutable
   digest, and independently verifies release identity and compatibility.
5. It admits the requested lifecycle operation only after licensed and physical
   capacity checks pass.

Website implementation is owned by Website G-030. OCI publication was accepted
under G-094 at the immutable `v0.44.3` index digest. Host lifecycle enforcement
is G-083; browser UX is G-084. The accepted machine-readable
contract lives at [`contracts/relay-host-license-v1.schema.json`](../contracts/relay-host-license-v1.schema.json),
with executable policy in
[`src/lib/licensing/host-entitlement.ts`](../src/lib/licensing/host-entitlement.ts).

The implemented local commands and their current release gates are documented
in [Relay Host supervisor](./relay-host-supervisor.md).
