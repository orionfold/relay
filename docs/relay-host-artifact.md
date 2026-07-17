# Relay Cell OCI artifact

This is the engineering contract for the G-080/G-093 Relay Cell OCI artifact.
It is a local alpha input to the customer-owned Relay Host release train, not a
published image, paid-edition entitlement, or public capacity/support claim.

## Distribution boundary

- `npx orionfold-relay` remains the direct local single-Cell path. G-083 will
  add the managed-Host bootstrap/supervisor to the same npm package.
- A managed Host pulls this immutable Cell image from the approved OCI registry
  and runs one container per Cell. The image never contains or starts the Host
  supervisor and offers no Host/Cell mode switch.
- The common release manifest binds npm/supervisor compatibility to an exact
  Cell-image digest. The npm package references and verifies the image but does
  not contain its bytes.

The checked-in `Dockerfile.relay-host`, `host:artifact:*` scripts and output
directory retain historical internal names for compatibility. Their OCI output
is a Relay Cell image.

## Same release, different artifact closures

The npm package and the OCI image deliver the same Relay release and
compatibility contract, but they are not byte-identical packages and should not
have similar download sizes.

| Artifact | What it delivers | What the destination supplies |
|---|---|---|
| npm tarball | Relay CLI/application files, package metadata, and the direct local single-Cell path; later, the Host bootstrap/supervisor | Node.js, npm dependency installation, the operating system, native system libraries, and process administration |
| Relay Cell OCI image | A sealed Linux Cell runtime: Relay application, pinned Node runtime, required production/native runtime files, Linux base, filesystem ownership, and container metadata | An OCI-compatible container engine plus the Cell's mounted data and configuration |

The accepted npm measurement is `2,767,765` compressed bytes and `9,902,571`
unpacked bytes. That is the package payload before the destination supplies
Node.js, installs the dependency closure, and provides its OS/native libraries.
The optimized Linux/arm64 Cell image is `129,935,364` bytes and its OCI archive
is `129,960,448` bytes because it carries the complete pinned Linux runtime
closure required to start a Cell. The useful comparison is therefore an
installed npm deployment plus Node and its host runtime prerequisites versus a
complete OCI image—not the npm tarball alone versus the image. OCI layers can
also be cached and reused between Cell releases.

This is a **direct-versus-managed** distinction, not a laptop-versus-cloud
distinction. A person can run one Relay Cell through npm on a laptop or a cloud
VM. A managed Host uses OCI Cells on a laptop or a server to gain repeatable
isolation, pinned native dependencies, signed digests, explicit mounts,
networks, ports, users and limits, plus atomic upgrade and rollback. If Relay
only supported one personal Cell, the OCI channel would not be necessary; it
earns its distribution cost in the paid managed multi-Cell Host product.

## Host and Cell in plain terms

A **Host** is a laptop or server that owns the machine, storage, networking, and
administrative controls. A **Cell** is one complete Relay instance on that Host,
with its own database, files, identity, secrets, license, logs, limits, and
backup history. A customer row, project, or folder inside Relay organizes work;
it does not create a separate Cell or security boundary.

A **Host Supervisor** controls only Cells running on its own Host. It is not a
**Fleet Controller**. A future Fleet Controller could coordinate several Hosts,
but it would send requests to each Host supervisor rather than operating remote
Cells directly:

```text
Fleet Controller (future)
  → Host B supervisor → Cells on Host B
  → Host C supervisor → Cells on Host C
  → Host D supervisor → Cells on Host D
```

Calling Server A the “Host” when the Cells actually run on Servers B, C, and D
would be incorrect. Server A is the controller; B, C, and D are the Hosts.

Common deployments are:

1. **One person on one laptop:** `npx orionfold-relay` runs one direct local
   Cell. No OCI image or managed-Host supervisor is required.
2. **Several customers on one laptop:** the laptop is a Host. Use a separate
   process and data root per customer today; G-083 will let the npm-installed
   supervisor run a separate OCI Cell container per customer. Every customer
   must trust the laptop administrator.
3. **Several customers on one operator server:** npm installs the Host control
   surface and the Host pulls one signed OCI Cell image per isolated customer
   instance. Customers access their own Cell through authenticated ingress.
4. **One customer on the customer's server:** that server is the customer's
   Host, even with only one Cell. The customer owns the Host and data; a provider
   manages it only under explicitly granted authority.

Customers that must not trust the same Host administrator use separate VMs or
machines, not merely separate folders.

## What the artifact guarantees

- The Linux application is built from `package-lock.json` with Node 22.23.1
  Bookworm slim and runs on the distroless Node 22 Debian 13 non-root image;
  both bases are pinned by digest.
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
- The real OCI archive must satisfy the checked-in path, size, layer, native
  platform and component budgets. Checksum-pinned Trivy generates the
  CycloneDX SBOM and rejects any unapproved high/critical final-image finding.

Mutable image tags and the locally generated test key are never launch or
publication authority.

## Local verification

Prerequisites are Docker Desktop with Buildx, Node 22.18 or newer, npm, and
network access when the pinned Trivy archive or vulnerability database is not
already cached.

```sh
npm ci
npm run check:install-debt
npm run test:relay-host
npm run host:artifact:build
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

`npm run host:artifact:build` is the canonical local/CI path. It emits a flat
`output/relay-host/<version>/<platform>/` evidence bundle and performs no push,
publish or release. To inspect a bundle already produced by it:

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

## Accepted optimization measurement — 2026-07-17

The latest Linux/arm64 image is `129,934,743` bytes and its OCI archive is
`129,959,936` bytes: an 85.40% reduction from the `889,827,989`-byte G-080
baseline. The final filesystem contains 5,197 files across 25 layers. Its
CycloneDX SBOM contains 60 components, all attributed to Relay, the pinned
runtime base, `package-lock.json`, or Next's bundled runtime; the final-image
scan has zero unapproved high/critical findings.

Cached and no-cache builds must match platform, file count and the exact
path/mode/link inventory. Next/Webpack compiled-content and OCI metadata digests
are retained as observations rather than equality gates because the operator
accepted semantic/path-inventory reproducibility. The signed immutable digest
still identifies the exact artifact consumed by a later promotion.

`npm run host:artifact:verify` checks every flat bundle file against
`SHA256SUMS`, verifies the manifest signature and measured OCI/SBOM identities,
and requires all content, component, vulnerability, reproducibility, npm,
manifest and conformance receipts to pass. Local bundles use an explicitly
ephemeral test key; any non-local signing authority requires an external trusted
public key.

The first customer-identical R1 Foundation run completed on 2026-07-17 against
the accepted `0.43.0` linux/arm64 local-alpha bundle. It proved isolated startup,
readiness, customer/project setup, document upload, Agent duplication, workflow
creation, blueprint authoring and deterministic teardown. The run also did what
a release gate should do: it exposed inconsistent managed-Cell identity and a
silently dropped workflow project edit. Host R1 therefore remains open until
those defects are fixed and the rebuilt optimized image passes the same journey.

The first defect is now closed by G-096. In a managed OCI Cell,
`RELAY_CELL_ID` is the validated identity authority and the same value appears
in readiness, Settings, instance configuration, and task/workflow execution
context. Invalid values fail visibly as `CELL_ID_INVALID`; they never fall back
to a git-bootstrap identity. Direct no-git npx, development, and initialized
git-backed installs retain their existing behavior when `RELAY_CELL_ID` is
absent. The rebuilt local arm64 artifact at digest
`sha256:f9e08451c1d7c39e9092e6bf84b61df47eedc2f70ac71c3ab4e02f98cf5de783`
passed the artifact pipeline and a hardened browser-visible Cell smoke. It is a
dirty-local, ephemeral-test-signed verification artifact—not a published
release.

G-097 subsequently closed the remaining context-integrity blocker. G-099 then
rebuilt the complete optimized artifact from clean commit
`60f096917fd877f407307739fbc14bf882cb4fcd` and accepted Host R1 against the
immutable linux/arm64 image digest
`sha256:b181931cb66f3014db82377186742b431cfd42db5deb973a6816059bf735723a`.
The artifact passed content, component, vulnerability, reproducibility, npm
boundary, manifest, conformance, two-Cell lifecycle, persistence, backup,
export, upgrade, restore and rollback gates. It remains a local artifact signed
with an ephemeral test key; no registry publication or public release occurred.

The fresh-volume customer-identical run used canonical Cell identity
`g099-r1` and proved J0–J3 across Settings, customer/project creation, a
project-linked document upload, Agent duplication, a project- and
document-linked workflow, the built-in blueprint path and custom blueprint
authoring. A reload preserved the customer → project → document → workflow
references, and the API snapshot agreed with the visible UI. Teardown removed
only the isolated browser/container/network/volume resources and left the
default Relay database hash unchanged. With zero surviving release blockers,
Host R1 — Local Host alpha is accepted. G-094 still owns any signed registry
publication, while G-095 owns the paid Host fulfillment contract.
