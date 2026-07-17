---
title: Relay Cell OCI artifact for managed Relay Hosts
status: accepted
goal: G-080
date: 2026-07-16
authority: features/relay-host-authority-isolation-contract.md
---

# Relay Cell OCI artifact for managed Relay Hosts

## Outcome

Relay can be built as an immutable Linux **Cell** image from the same locked
source and package version as the npm distribution. A customer-owned Relay Host
can start multiple Cells from that image with distinct mounts, private networks and
loopback-published ports. Each cell runs non-root with a read-only root, exposes
private liveness/readiness endpoints, drains background claimers on signals and
checkpoints SQLite before exit.

The artifact is locally signed as a canonical manifest envelope that binds the
Relay/npm version, OCI digest, schema range, health contract, data mount, SBOM
digest, source revision and an explicit rollback digest. Mutable tags never
authorize launch. Registry publication, release/version changes and public
support/capacity claims remain separate operator gates.

## Distribution boundary

- **npm:** ships the Relay CLI and current direct local single-Cell runtime.
  G-083 extends that same package with the managed-Host bootstrap/supervisor.
- **OCI registry:** ships the immutable Relay Cell runtime image used by a
  managed Host. The image contains no Host supervisor and has no Host/Cell mode
  switch.
- **Common release manifest:** binds the npm version, Host supervisor
  compatibility and exact Cell-image digest. The npm tarball carries the
  reference and verifier, never the OCI image bytes.

Internal filenames and commands retain the historical `relay-host-artifact`
name for compatibility; in product and architecture language the emitted OCI
payload is a **Relay Cell image**.

“Same release” means the npm and OCI artifacts share locked source, Relay
version, schema/runtime compatibility, and one release manifest. It does not
mean the artifacts contain the same bytes. The accepted npm tarball is
2,767,765 compressed bytes / 9,902,571 unpacked bytes and relies on the target's
Node, dependency installation, OS and native libraries. The optimized arm64
Cell image is 129,935,364 bytes (129,960,448-byte OCI archive) because it closes
over the pinned Linux application runtime. Size comparisons must therefore use
the complete installed runtime closure, not compare the sparse npm tarball with
the sealed image in isolation.

OCI is selected for the managed path regardless of whether the Host is a
laptop or cloud VM. It provides repeatable Cell isolation, signed immutable
identity, pinned native dependencies, container-level mounts/networks/users/
limits, and atomic upgrade/rollback. A direct personal single-Cell deployment
does not need OCI.

## Scope challenge

- **REDUCE:** manifest only. Rejected because it cannot prove the native module,
  data durability or isolation contracts.
- **PROCEED:** one digest-pinned, signed local OCI artifact plus executable
  one-Host/two-cell conformance. Selected.
- **EXPAND:** registry publication, cosign/OIDC, multi-architecture Cell release,
  supervisor and cloud-provider adapters. Deferred to authorized release and
  G-083/G-085.

## Contracts

- Build uses Node 22.23.1 Bookworm slim and the final runtime uses distroless
  Node 22 Debian 13 non-root; both are pinned by immutable manifest digest and
  dependencies come from a clean `npm ci` over `package-lock.json`.
- OCI output uses Next standalone only when `RELAY_OCI_BUILD=true`; npm and local
  development keep their existing output shape.
- Runtime UID/GID is 10001, `/var/lib/relay` is the only durable write root,
  `/tmp` is ephemeral, and the launcher fails with named errors when the data
  mount, cell ID, non-root identity or write probe is invalid.
- `GET /api/health/live` proves process availability without touching storage.
  `GET /api/health/ready` proves SQLite and cell identity without returning
  paths, credentials or customer content.
- SIGINT/SIGTERM synchronously stop the upgrade poller, scheduler, channel
  poller, auto-backup timer and history cleanup, report snapshot/task state and
  checkpoint WAL. Running work remains durable for existing lease recovery.
- Manifest signatures use Ed25519 over deterministic canonical JSON. A verifier
  rejects signature, digest, version, schema, SBOM or rollback mismatches.
- The smoke fixture must use two separate Docker networks, volumes and loopback
  ports; drop all capabilities; set no-new-privileges, resource limits and a
  read-only root; omit all Host/container sockets.

## Acceptance criteria

1. Clean image build proves `better-sqlite3`, PDF parsing and the explicit
   externalization state in the target artifact.
2. A missing data mount fails before Next starts with `DATA_MOUNT_REQUIRED`.
3. Two cells report distinct IDs, cannot resolve one another, persist through
   restart, and emit a successful shutdown checkpoint receipt.
4. The signed envelope verifies only against the expected public key, OCI
   digest, Relay version, schema range and SBOM digest.
5. A stopped-cell export has a content hash and can restore to a fresh volume;
   rollback authority is an explicit prior digest, never a mutable tag.
6. The artifact build and manifest are reproducible for identical locked inputs,
   or any tool-owned nondeterminism is named and guarded by a deterministic
   release-input digest.
7. G-034 closes with clean-install warning attribution, safe updates, native and
   PDF tests, externalization proof and a no-growth dependency-debt guard.

## Implementation plan

1. Reconcile G-034 dependencies and freeze the accepted upstream debt set.
2. Add the phase-scoped standalone build, runtime launcher and OCI definition.
3. Add health/readiness and synchronous signal-drain modules with focused tests.
4. Add canonical manifest signing/verification and dependency-debt tooling.
5. Add the two-cell Docker smoke/export fixture and a non-publishing CI check.
6. Run targeted tests, CLI/Next builds, clean-image smoke, signature negative
   tests, broader regressions and fresh architecture/security review.

## Rescue and rollback

All application behavior remains available through the unchanged npm path. If
standalone tracing misses a module, keep the OCI output gated and add the exact
trace input rather than changing npm packaging. Failed smoke resources use a
unique run ID and are cleaned in `finally`; volumes are retained only when the
operator explicitly requests debugging. No registry or provider state exists.

## Acceptance receipt — 2026-07-16

Accepted locally with no publication:

- clean Linux `npm ci` completed with nine attributed upstream deprecations;
  the dependency-debt guard, native SQLite load, real PDF parse, CLI build and
  3,590-test full suite passed;
- `npm pack --dry-run` measured 2,767,765 compressed bytes / 9,902,571 unpacked
  bytes across 1,315 entries; this records the G-036 baseline without changing
  the trigger-gated bundled-pack scope;
- the final arm64 image is about 890 MB with 407 indexed packages and a 2.9 MB
  CycloneDX SBOM; density remains provisional and the broad
  Next output trace is recorded for later optimization;
- Ed25519 verification bound the immutable OCI/archive digests, exact
  dirty-local worktree digest, npm 0.43.0, SBOM, schema/runtime contract and
  v0.42.2 rollback digest recorded in `output/relay-host/`;
- the two-cell smoke passed distinct network/volume/loopback-port isolation,
  non-root/read-only/capability/resource controls, missing-mount refusal,
  restart persistence, active-task/SIGTERM and snapshot interruption receipts,
  WAL checkpoint, stopped-volume export, UID-normalized upgrade and rollback;
- interrupted snapshot rows reconcile to named failures on restart, while a
  corrupt outside-root partial path is refused and preserved; and
- `output/relay-host/smoke-evidence.json` records the local evidence. Generated
  fixtures clean up after the run and TypeScript excludes `output/**`.

The final local manifest intentionally says `dirty-local`. Publication requires
a separately authorized clean committed build and production signing authority.

## G-093 optimization receipt — 2026-07-17

G-093 supersedes only the G-080 size/component baseline, not its runtime
contract. The latest G-096 rebuild measures 129,935,364 bytes (85.40% smaller)
with 5,197 files, 25 layers and 60 attributed CycloneDX components. The
distroless final image contains no build shell/npm, operator/repository
surfaces, tests, session state or nested release archives and has zero
unapproved high/critical findings.

The same `npm run host:artifact:build` command now drives local and CI builds,
real-archive content policy, checksum-pinned Trivy, cached/no-cache semantic
comparison, npm separation, signed manifest, bundle checksums and the complete
two-cell lifecycle smoke. Exact platform/path/mode/link inventory is the
operator-approved reproducibility gate; compiled-content digests remain
diagnostic. The bundle verifier validates all 18 evidence files and pass
receipts.

## G-025 customer-identical staging receipt — 2026-07-17

J0–J3 ran against the accepted `0.43.0` linux/arm64 bundle from a fresh,
loopback-only Docker Cell and synthetic data volume. The Cell stayed healthy;
customer, project, document, Agent, built-in blueprint, from-scratch workflow,
and custom blueprint paths all produced browser evidence. Teardown removed only
the isolated container/network/volume and left the default Relay database hash
unchanged. The complete local receipt is
`output/staging/2026-07-17-g025-r1/`.

G-025 is accepted as validation evidence, not as a clean R1 release. Code review
confirmed that no-git OCI Settings/target previews ignore `RELAY_CELL_ID`, and
workflow project edits can report success without persisting `projectId`.
G-096 has closed the identity blocker; G-097 owns the remaining context blocker,
and G-099 reruns Foundation against the rebuilt artifact before R1 advances.
G-098 owns a non-blocking Agent test-result empty-state defect. No public
publication or release was authorized.

## G-096 canonical Cell identity receipt — 2026-07-17

The optimized arm64 artifact was rebuilt after the managed-Cell resolver change
and passed the complete G-093 artifact pipeline. Its immutable OCI manifest
digest is
`sha256:f9e08451c1d7c39e9092e6bf84b61df47eedc2f70ac71c3ab4e02f98cf5de783`;
the local manifest remains explicitly `dirty-local`, signed with an ephemeral
test key, and ineligible for promotion.

A separate hardened, loopback-only smoke Cell supplied
`RELAY_CELL_ID=g096-cell`. Readiness, instance config, Settings, and a real
workflow execution-target preview all reported that same identity. The Cell ran
non-root with a read-only root, no capabilities, `no-new-privileges`, bounded
CPU/memory/PIDs, and its own network and volume. Evidence is retained under
`output/staging/2026-07-17-g096-cell-identity/`; teardown removed only those
disposable resources. G-097 remains the next Host R1 release blocker, followed
by the G-099 customer-identical rerun.
