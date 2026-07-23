# Relay Cell OCI acquisition and verification

> Publication status (2026-07-23): the protected workflow published and verified Relay Cell
> `v0.46.3` for `linux/amd64` and `linux/arm64`. The immutable accepted index is
> `sha256:98aba662fc4c7bc9b79e5e384178bef2bdaac7977d1be5b490726740c4223ac1`.
> This makes the free Cell runtime available; it does not make the separately
> licensed Relay Host journey customer-ready.

Relay Host is the local control plane installed through npm. A managed Relay
Cell is Relay's isolated customer runtime. A Host may start a Cell from the npm
installation on the same machine, or it may start the same Cell runtime from an
OCI image on a Linux server. OCI supplies a complete, reproducible Linux
runtime; it does not create a different Relay product or a second paid SKU.

The launch registry is `ghcr.io`. Production is the public image
`ghcr.io/orionfold/relay-cell`; pre-release validation uses the private
`ghcr.io/orionfold/relay-cell-staging`. Anonymous production pulls are intended
after the one-time public visibility gate. Relay entitlement is enforced by the
Host, not by making the Cell image private.

## Digest authority

Release notes and the Host manifest provide a value such as:

```text
ghcr.io/orionfold/relay-cell@sha256:98aba662fc4c7bc9b79e5e384178bef2bdaac7977d1be5b490726740c4223ac1
```

Use that complete reference for deployment. `vX.Y.Z`, `vX.Y`, and `stable`
help a person discover a release, but tags can move or be mistyped. The digest
is the authority. The tag `latest` is not part of Relay's publication policy.

Pull and inspect the accepted digest:

```bash
export RELAY_CELL_DIGEST='sha256:98aba662fc4c7bc9b79e5e384178bef2bdaac7977d1be5b490726740c4223ac1'
docker pull "ghcr.io/orionfold/relay-cell@$RELAY_CELL_DIGEST"
docker buildx imagetools inspect "ghcr.io/orionfold/relay-cell@$RELAY_CELL_DIGEST"
```

The index must contain exactly `linux/amd64` and `linux/arm64`. A Host manifest
must continue to pin the digest rather than save `stable` as runtime authority.

## Verify origin, integrity, provenance, and SBOM

Relay releases are signed keylessly by the protected GitHub Actions tag
workflow. The source tag uses the OCI-only `cell-vX.Y.Z` namespace so publishing
a Cell image cannot accidentally publish the npm package or create a GitHub
Release. The customer-facing image still uses `vX.Y.Z`; verification is
intentionally narrow:

```bash
cosign verify "ghcr.io/orionfold/relay-cell@$RELAY_CELL_DIGEST" \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  --certificate-identity-regexp '^https://github\.com/orionfold/relay/\.github/workflows/publish-relay-cell\.yml@refs/tags/cell-v[0-9]+\.[0-9]+\.[0-9]+$'

cosign verify-attestation \
  "ghcr.io/orionfold/relay-cell@$RELAY_CELL_DIGEST" \
  --type 'https://slsa.dev/provenance/v1' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  --certificate-identity-regexp '^https://github\.com/orionfold/relay/\.github/workflows/publish-relay-cell\.yml@refs/tags/cell-v[0-9]+\.[0-9]+\.[0-9]+$'
```

Cosign verifies anonymously that the digest was signed by Relay's exact
protected release workflow under GitHub's OIDC issuer and that its SLSA
provenance attestation has the same authority. A managed Host therefore does not
need a GitHub login merely to verify a public Cell. GitHub CLI's
`gh attestation verify --bundle-from-oci` remains a valid optional operator
inspection when an authenticated GitHub CLI session is already available; it
is not a Host runtime dependency. Each platform has a CycloneDX SBOM attestation;
the multi-platform index also has provenance and Relay compatibility evidence.
If a signature, subject digest, issuer, identity, platform, or attestation is
missing or different, stop instead of broadening the verification expression.

## Copy to an air-gap or customer registry

The launch does not operate a second mirror. Customers may copy the immutable
digest under their own registry policy without changing Relay's authority:

```bash
oras cp \
  "ghcr.io/orionfold/relay-cell@$RELAY_CELL_DIGEST" \
  "registry.example.com/relay/relay-cell@$RELAY_CELL_DIGEST"
```

For offline transfer, copy the subject into an OCI layout archive, transport
the archive and checksum, then import it at the destination:

```bash
oras cp \
  "ghcr.io/orionfold/relay-cell@$RELAY_CELL_DIGEST" \
  --to-oci-layout relay-cell.oci.tar:relay-cell
sha256sum relay-cell.oci.tar
```

Re-run digest, signature and attestation checks against the authoritative GHCR
subject before accepting a copied image. A customer's registry availability is
their responsibility; Relay does not claim a launch mirror or registry SLA.

## Promotion, rollback, and support boundary

An exact `vX.Y.Z` release is immutable. After customer-identical staging passes,
a separate protected workflow may point `stable` at its already-signed index
digest. Each real move preserves the displaced digest at the discovery pointer
`stable-previous`. Rollback is allowed only to that signed and attested digest;
the operation swaps the two pointers, and never rebuilds, overwrites, or deletes
an exact release. The launch support window is therefore the current and prior
stable digest, enforced as well as documented.

Before an immutable `cell-vX.Y.Z` source tag exists, Relay's exact-SHA candidate
workflow must produce a still-valid `cell` receipt for that commit, git tree,
version, supported macOS/Windows Node/npm matrix, dependency policy, and
release-policy digest. The tag-triggered workflow revalidates that receipt
before private staging. After both audited native candidates are staged, one
protected `oci-production` decision gates the complete platform fan-out and
multi-platform index fan-in. Registry-native build, signature, SBOM,
attestation, and digest checks remain mandatory after the tag.

Relay's evidence supports claims about origin, integrity, provenance and the
declared compatibility contract. It is not a **vulnerability-free** claim, an
uptime SLA, a durability guarantee, an RPO/RTO promise, or a substitute for the
customer's host, backup, network and registry controls.

Registry acquisition, artifact verification and paid Host entitlement are
separate errors. A license lapse or registry outage must not stop existing
Cells or prevent export/recovery; it only affects new managed-Cell operations
according to the Host license contract.

## Current production proof and promotion boundary

The authorized G-094 run completed these one-time production checks:

1. GitHub environments `oci-staging` and `oci-production` exist with required
   reviewers; production deployment is limited to protected release tags.
2. `ghcr.io/orionfold/relay-cell-staging` remained private while both native
   candidates passed content, vulnerability, reproducibility and complete Cell
   lifecycle conformance before exact-digest production copy.
3. `ghcr.io/orionfold/relay-cell` is public; a fresh credential-free Docker
   configuration pulled the accepted index successfully.
4. The exact release receipt, platform receipts, SBOM, provenance, signatures,
   anonymous pull, startup, readiness, task checkpoint and restart recovery all
   passed for the current release. The run is
   [30050073420](https://github.com/orionfold/relay/actions/runs/30050073420).
5. No registry credential, signing key or paid/mirror dependency was added.

The current release receipt records amd64 digest
`sha256:d55470002b07a7a5ab8c46e42d7c68daaafd99fc1a226fa4e79c3b0760dd61af`
at 131,643,048 image bytes and arm64 digest
`sha256:ae278681df443cf55eb4c640951afede67a9b68ee2cb0c41908e2e3bff3f5218`
at 130,804,954 image bytes. The public index is an acquisition artifact, not a
paid entitlement or a Host release. `stable` remains a separately gated
promotion pointer; when no separately authorized promotion is performed,
`stable` remains unmoved. Exact `v0.46.3` and the accepted index digest are the current
discovery and authority surfaces.

Primary references: [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry),
[GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations),
[Cosign keyless containers](https://docs.sigstore.dev/cosign/signing/signing_with_containers/),
and [ORAS copy](https://oras.land/docs/commands/oras_cp/).
