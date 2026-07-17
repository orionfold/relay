# Relay Host cell artifact

This is the engineering contract for the G-080 Relay Host/cell OCI artifact.
It is a local alpha input to the customer-owned Relay Host release train, not a
published image, paid-edition entitlement, or public capacity/support claim.

## What the artifact guarantees

- The Linux image is built from `package-lock.json` with Node 22.18.0
  Bookworm slim pinned by digest.
- The Relay version in the image must equal the npm package version.
- The runtime is UID/GID `10001:10001`, uses a read-only root, and requires a
  dedicated writable mount at `/var/lib/relay`.
- Each cell requires a DNS-label `RELAY_CELL_ID`. Liveness is
  `/api/health/live`; readiness is `/api/health/ready`.
- SIGINT/SIGTERM stop background claimers, report durable active-task and
  snapshot state, and checkpoint SQLite. Interrupted snapshots are visible as
  named failures after restart rather than remaining silently in progress.
- The Ed25519-signed canonical manifest binds the immutable OCI digest, OCI
  archive, npm version, schema range, runtime contract, SBOM, rollback digest,
  source revision, exact worktree digest, and whether the source was clean.

Mutable image tags and the locally generated test key are never launch or
publication authority.

## Local verification

Prerequisites are Docker Desktop with Buildx and Docker Scout, Node 22.18 or
newer, and npm.

```sh
npm ci
npm run check:install-debt
npm run test:relay-host
npm run host:smoke
```

The smoke builds the current image and a real `v0.42.2` prior-version fixture,
then verifies:

- two cells with separate networks, volumes, and loopback-only random ports;
- non-root identity, read-only root, all capabilities dropped,
  `no-new-privileges`, and CPU/memory/PID limits;
- named refusal when the data mount is missing;
- native SQLite and PDF paths in the Linux artifact;
- persistence across restarts and a WAL checkpoint on SIGTERM;
- visible active-task and snapshot interruption state;
- stopped-volume export, ownership normalization, upgrade to the current cell,
  and restore under the prior image;
- CycloneDX SBOM generation and signed-manifest positive/negative checks.

Artifacts and evidence are written below `output/relay-host/` and are ignored
by git. The smoke deletes its containers, networks, and volumes in a `finally`
block. It performs no push, registry publication, release, or cloud write.

## Build and verification commands

`npm run host:smoke` is the preferred conformance path. To inspect an artifact
already produced by it:

```sh
npm run host:artifact:verify
```

The manifest reports `sourceState: dirty-local` when it was created from local
uncommitted inputs. Only a clean, committed source state may be considered by a
future publication job. Production signing key custody, OIDC/cosign registry
attestation, multi-architecture publication, and paid-license authorization
belong to later release-train goals and are intentionally absent here.

## Volume export contract

Export only while the source cell is stopped. Hash the resulting archive and
verify the hash before restore. A restore controller must normalize ownership
for the target runtime: `10001:10001` for the hardened cell artifact, or the
documented UID/GID of the explicit rollback image. Start the restored cell only
after extraction and ownership normalization succeed.

Rollback always names a prior immutable digest. The tested fixture uses tag
`v0.42.2` only to build the prior image; its resulting digest is recorded in the
current signed manifest and smoke receipt.

## Current measurement and deferred density work

The first arm64 local artifact measured about 890 MB and contained 407 indexed
packages. That is a baseline, not a density or support promise. Next standalone
reported broad output-file tracing caused by dynamic workspace path handling;
image-size and trace reduction should be addressed before capacity claims or a
public Host release.
