# Relay Host supervisor

The Relay Host supervisor is the npm-delivered, local control plane for managed
Relay Cells on one laptop, workstation, server, or VM. It is a separate
executable and does not start with the normal Relay app:

```bash
relay host help
# equivalent standalone executable
relay-host help
```

A Host is one machine. A Cell is one complete Relay instance with its own data
root, database, identity, private network, loopback port, resource budget,
secret reference, logs, license state, and recovery lineage. A Host supervisor
controls only Cells physically on its machine. It is not a Fleet Controller and
cannot reach into Cells on other Hosts.

## Current release state

The local G-083 control plane is implemented on mainline. G-094 has published
and proved the public signed multi-architecture Cell image at immutable index
digest `sha256:b0dbee1535a2da9d963814591c8f0307d719b0d1ee43baebd2cbedf5f1d22c73`.
G-084 has accepted the browser lifecycle UX, and G-101 has accepted the fresh
customer-identical npm-to-Host-to-managed-Cell release-candidate journey.
Production managed-Cell fulfillment is still not released: Website G-041 must
complete the separately authorized staged purchase, signed-grant delivery, and
cross-surface conformance packet before an R3 release is authorized. The
supervisor therefore must not be presented as currently purchasable merely
because its free runtime image and Relay-side release evidence are available.

## What it stores

The default Host root is `~/.relay-host`; override it with `RELAY_HOST_ROOT` or
`--host-root`. Its independent SQLite/WAL registry stores only strict,
content-free Host records, Cell allocation/state records, and lifecycle
receipts. It never reuses a Cell database or stores prompts, documents, table
data, model output, credentials, license envelopes, or raw runtime errors.

The supervisor derives every container name, private network, data root, secret
reference, and loopback mapping from the Host root and safe Cell ID. Unknown
manifest fields, arbitrary paths, mutable image tags, wrong repositories,
public port intent, collisions, capacity overflow, and symlink escape fail
before a runtime effect.

## Initialize one Host

Install a valid signed `product:relay-host` license through the normal Relay
license flow, then record the physical capacity this Host may allocate:

```bash
relay host init \
  --host-id host-a \
  --cpu-millis 8000 \
  --memory-bytes 17179869184 \
  --storage-bytes 536870912000 \
  --reserve-percent 20

relay host inventory
```

Initialization is idempotent for the same Host identity and fails closed for a
different identity or unsupported registry schema. The default runtime is
Docker. Podman is represented in the versioned Host contract but is not a
supported launch adapter yet.

## Create and manage a Cell

Every managed Cell uses strict `orionfold.relay-host-cell/v1` JSON. Production
execution authority is the immutable image reference, never a mutable tag:

```json
{
  "schema": "orionfold.relay-host-cell/v1",
  "cellId": "customer-a",
  "ownerRef": "owner_customer_a",
  "origin": "create",
  "artifact": {
    "version": "0.44.3",
    "imageReference": "ghcr.io/orionfold/relay-cell@sha256:b0dbee1535a2da9d963814591c8f0307d719b0d1ee43baebd2cbedf5f1d22c73",
    "imageDigest": "sha256:b0dbee1535a2da9d963814591c8f0307d719b0d1ee43baebd2cbedf5f1d22c73",
    "schemaMin": 1,
    "schemaMax": 1
  },
  "loopbackPort": 4101,
  "resources": {
    "cpuMillis": 1000,
    "memoryBytes": 1073741824,
    "storageBytes": 10737418240
  }
}
```

Use an opaque operation ID when another system may retry a request. Replaying
the same ID and plan returns the original receipt; reusing it for another plan
is refused.

```bash
relay host create --manifest ./customer-a.json --operation-id create-customer-a-v1
relay host start --cell-id customer-a --operation-id start-customer-a-v1
relay host stop --cell-id customer-a --operation-id stop-customer-a-v1
relay host restart --cell-id customer-a --operation-id restart-customer-a-v1
relay host inventory
relay host reconcile
```

Before Docker pulls anything, the supervisor independently verifies the image
with the accepted Cosign workflow identity and GitHub artifact attestation. It
then uses a private per-Cell bridge network with outbound provider access,
loopback-only ingress, a non-root user,
read-only root filesystem, dropped capabilities, no-new-privileges, bounded
CPU/memory/PIDs, and a distinct data bind mount. Docker command failures remain
visible as named Host failures rather than being reported as a missing Cell.

## Repeat the Host/Cell release-candidate proof

Use the permanent staging driver for a fresh release candidate rather than
assembling an ad hoc source-checkout smoke:

```bash
node scripts/staging.mjs build
node scripts/staging.mjs launch
RELAY_G101_EVIDENCE_DIR=output/staging/<date>-host-cell-release-candidate \
  node scripts/staging/host-cell-release-candidate.mjs
node scripts/staging.mjs teardown
```

The proof installs the packed npm artifact into the isolated staging scratch
environment, binds both `RELAY_DATA_DIR` and `RELAY_HOST_ROOT` under the staging
root, verifies the accepted public Cell digest with Cosign and GitHub
attestations, exercises the licensed ten-Cell lifecycle and recovery boundary,
and cleans only Docker resources bearing its Host labels. The final teardown
must report that the normal `~/.relay/relay.db` and `~/.relay-host/host.db`
remain byte-identical. Keep the evidence directory as the content-safe receipt;
do not substitute a source-checkout run for a release claim.

## Retain, release, and purge

`retain` removes runtime resources but keeps the Cell root and still consumes a
managed-Cell slot. `export-release` requires a verified recovery checkpoint
fingerprint and releases the slot. `purge` permanently deletes only that Cell's
derived root and requires fresh confirmation equal to the exact Cell ID.

```bash
relay host retain --cell-id customer-a --operation-id retain-customer-a-v1
relay host export-release \
  --cell-id customer-a \
  --checkpoint-ref sha256:<verified-recovery-fingerprint> \
  --checkpoint-receipt ./customer-a.relay-recovery.receipt.json \
  --checkpoint-bundle ./customer-a.relay-recovery \
  --operation-id release-customer-a-v1
relay host purge \
  --cell-id customer-a \
  --confirm customer-a \
  --operation-id purge-customer-a-v1
```

Running, stopped, and retained Cells count. Exported-and-released and purged
Cells do not. License lapse or removal blocks new expansion but never stops an
existing managed Cell or prevents start, stop, restart, export, recovery,
rollback, retain, release, or purge. Installing a newly signed higher-capacity
license changes admission without mutating existing Cells.

## Boundaries and prerequisites

- A direct unmanaged Relay Cell remains free and does not use Host capacity.
- The public Cell image is free; paid authority is managed Host lifecycle under
  the signed `product:relay-host` limit.
- Commercial license, OCI authenticity, and registry access are independent
  checks. A license file is never a registry password.
- Managed Cell creation requires Docker and Cosign on the Host. Cosign verifies
  the public image signature and SLSA provenance anonymously against Relay's
  exact protected release workflow; a GitHub login is not required.
- Same-Host Cells trust the Host administrator. Customers that do not accept
  that trust require separate machines or VMs.
- G-083 exposes no TCP or browser lifecycle API. G-084 must call this domain
  without bypassing its admission, state, and receipt contracts.

For the validated customer-owned server topology, follow
[Run a Relay Host on DigitalOcean](./digitalocean-relay-host.md). See
[Relay Host fulfillment](./relay-host-fulfillment.md), [Cell OCI acquisition
and verification](./relay-cell-oci-release.md), [Host ingress and administrator
access](./relay-host-access.md), and [encrypted Cell recovery](./relay-cell-recovery.md).
