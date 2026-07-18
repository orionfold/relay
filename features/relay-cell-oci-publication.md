---
title: Signed multi-architecture Relay Cell OCI publication
status: implementation
priority: P1
milestone: host-r3
goal: G-094
dependencies:
  - relay-host-artifact
  - oci-fulfillment
tdr: TDR-044
---

# Signed multi-architecture Relay Cell OCI publication

## Outcome

A clean OCI-only `cell-vX.Y.Z` source tag can drive one protected GitHub Actions workflow that
publishes the already-audited G-093 Relay Cell artifact for `linux/amd64` and
`linux/arm64` to `ghcr.io/orionfold/relay-cell`. Each platform manifest and the
multi-platform index are addressed by immutable digest, signed through the
GitHub Actions OIDC identity, and accompanied by SBOM, provenance, compatibility
and checksum evidence. The Host consumes the digest; tags only help a person
discover an accepted release.

The dedicated source-tag namespace is a release-safety boundary: `cell-vX.Y.Z`
can publish only OCI artifacts, while the stable npm/GitHub release workflow
continues to listen only for `vX.Y.Z`. The registry still exposes the immutable
customer-facing image tag `vX.Y.Z`, so distribution channels share a semantic
version without sharing a publication trigger.

This goal creates the repeatable publication mechanism. It does not authorize
or perform a registry write, package visibility change, tag, push, npm publish,
GitHub Release or customer release by itself.

## Approved policy — 2026-07-18

- GHCR is the primary and only launch registry.
- Production is `ghcr.io/orionfold/relay-cell`, public with anonymous pulls
  after an explicit one-time visibility approval.
- Validation is `ghcr.io/orionfold/relay-cell-staging`, private and never a
  customer manifest authority.
- Exact registry `vX.Y.Z` tags are never overwritten. `vX.Y`, `stable`, and the bounded
  recovery pointer `stable-previous` are mutable discovery pointers; `latest`
  is forbidden. Host manifests always pin a `sha256` digest.
- `stable` moves only after customer-identical staging. Each move preserves the
  displaced supported digest at `stable-previous`; rollback may only swap back
  to that verified digest. It never rebuilds or rewrites an exact release.
- GitHub Actions keyless signing trusts only the dedicated tag workflow under
  issuer `https://token.actions.githubusercontent.com`.
- No paid registry, runner, mirror, KMS key or long-lived registry/signing
  credential is introduced.
- Production release content and evidence are retained indefinitely. Staging
  policy is 30 days or five candidates, with no automatic production deletion.

The machine-readable authority is
`config/relay-cell-publication-policy.json`.

## Invariants and states

1. Source must be a clean checkout of the exact `cell-vX.Y.Z` tag, and the tag
   version must equal `package.json`.
2. G-093 publication-profile content, privacy, size, component, vulnerability,
   reproducibility, npm-boundary, manifest and conformance gates must pass on
   each native architecture before registry upload.
3. The exact audited OCI archive is copied to GHCR. Rebuilding a second image
   for publication is forbidden because its digest would not be the audited
   artifact.
4. Platform receipts must agree on Relay version, source revision, source-tree
   digest, schema range and runtime contract before an index is created.
5. The index contains exactly `linux/amd64` and `linux/arm64`; mutable-tag-only,
   missing-platform or digest-drift evidence fails closed by name.
6. Cosign verification binds the digest to the approved workflow identity and
   issuer. GitHub provenance and per-platform CycloneDX SBOM attestations bind
   to the same subject digests.
7. The release receipt reports npm compressed/unpacked size separately from
   OCI image/archive size and states that npm relies on destination Node,
   dependencies, OS and native libraries.
8. A partial publication never advances `vX.Y`, `stable`, or customer docs.
   Exact uploaded platform digests remain quarantined evidence until a complete
   index verifies.
9. Registry acquisition, artifact verification, and paid Host entitlement are
   separate failure classes.

The local mechanism has these states:

```text
policy-valid → platform-evidence-ready → index-plan-ready → dry-run-complete
                                                      ↘ external-write-gated

authorized CI only:
tag-verified → platform-pushed/signed/attested → index-published/verified
             → customer-identical staging → stable promoted
```

## Named failures

- `CELL_PUBLICATION_POLICY_INVALID`
- `CELL_PUBLICATION_WORKFLOW_INVALID`
- `CELL_PUBLICATION_TAG_INVALID`
- `CELL_PUBLICATION_VERSION_MISMATCH`
- `CELL_PUBLICATION_SOURCE_DIRTY`
- `CELL_PUBLICATION_PLATFORM_SET_INVALID`
- `CELL_PUBLICATION_PLATFORM_EVIDENCE_INVALID`
- `CELL_PUBLICATION_DIGEST_MISMATCH`
- `CELL_PUBLICATION_ATTESTATION_MISSING`
- `CELL_PUBLICATION_SIGNER_INVALID`
- `CELL_PUBLICATION_TAG_REFUSED`
- `CELL_PUBLICATION_PERMISSION_EXCESSIVE`
- `CELL_PUBLICATION_REGISTRY_UNAVAILABLE`
- `CELL_PUBLICATION_EXTERNAL_WRITE_REFUSED`

## Acceptance criteria

- [x] Machine-readable policy exactly reflects the approved registry,
  namespace, visibility, tags, retention, OIDC identity, support and no-paid-
  dependency decisions.
- [x] Static workflow validation rejects ordinary-commit publication, missing
  protected environment, excessive permission, unpinned action, wrong image,
  forbidden tag, wrong runner/platform or missing signing/attestation step.
- [x] Pure release-evidence tests reject dirty source, tag/version mismatch,
  missing/duplicate/wrong platforms, manifest drift, missing SBOM/provenance,
  wrong signer/issuer and mutable-tag authority.
- [x] The production workflow is OCI-tag-only (`cell-v*`), cannot match the npm
  workflow's `v*` trigger, builds on native amd64/arm64 runners,
  copies the audited OCI layouts to GHCR, verifies the copied digests, signs and
  attests them, creates one multi-platform index and emits retained evidence.
- [x] Stable promotion/rollback is a separate protected, digest-only operation
  that verifies the release before retagging and never deletes content.
- [x] A deterministic local dry-run emits a content-free receipt with
  `publication: none`, `externalWrites: 0`, exact intended commands and no
  credentials.
- [x] Customer docs provide digest-pinned pull, Cosign identity verification,
  GitHub attestation verification, mirroring/export and conservative support
  language.
- [x] G-093 artifact tests, publication tests, full Relay tests, production
  build, documentation checks and fresh security review pass.
- [ ] An authorized staging/production run later proves native pull/start/task,
  anonymous production pull, partial-publication rescue and rollback before
  G-094 and Host R3 are accepted.

## Local implementation receipt — 2026-07-18

- Publication contract: 8 focused tests pass, including negative tag/source,
  platform-set, digest drift, signer/tag identity, missing attestation, npm
  parity, workflow trigger/permission/action-pin, index and rollback cases.
- G-093 regression contract: 17 Node artifact/manifest tests and 7 targeted
  Host/runtime tests pass.
- Full Relay regression: 501 files and 3,733 tests pass, with one intentional
  skip. The sandboxed attempt first exposed a local IPv6 listen `EPERM`; the
  permitted local-port rerun passed without that seatbelt artifact.
- `next build` passes. Its existing broad dynamic-path/NFT warnings are
  unchanged and outside this release-engineering diff.
- Real `npm pack` closure: 2,827,138 compressed bytes, 10,164,412 unpacked
  regular-file bytes, 1,356 regular files, public-boundary clean, and no
  symlink traversal. Publication remains `none` with zero external writes.
- Documentation links, knowledge-bundle verification, tracked-tree privacy,
  staged whitespace and public-boundary fixtures pass.
- The local Docker conformance rerun was unavailable because Docker Desktop's
  daemon was stopped. No build or network mutation started. Accepted G-099
  remains the container baseline; the required clean native amd64/arm64 build,
  private staging push/pull, production copy, signatures, attestations,
  anonymous pull, partial recovery and rollback remain the visible external
  acceptance gate rather than being simulated locally.
- Fresh two-pass security review: **APPROVE for local commit**. No unresolved
  critical finding. The only remaining test gap is deliberately the gated real
  GitHub/GHCR execution above; staging retention cleanup is policy/manual until
  an authorized registry operation implements it.

## Not in scope

- OCI product entitlement or private pull tokens: G-083 owns paid Host
  authority; image bytes remain public and free.
- Host lifecycle implementation or UX: G-083/G-084.
- Docker Hub or another mirror, paid runners, KMS keys, self-hosted release
  runners, automatic production cleanup, Fleet control or cloud provisioning.
- npm publish, GitHub Release creation, Website commerce or public price.
- A vulnerability-free, uptime, durability, RPO, RTO or compliance claim.

## References

- `features/relay-host-artifact.md`
- `features/oci-fulfillment.md`
- `docs/relay-host-artifact.md`
- `_IDEAS/host-cell-fulfill.md`
- `.agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md`
- <https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry>
- <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations>
- <https://docs.sigstore.dev/cosign/signing/signing_with_containers/>
- <https://oras.land/docs/commands/oras_cp/>
