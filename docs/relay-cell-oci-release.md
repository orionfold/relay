# Relay Cell OCI acquisition and verification

> Publication status (2026-07-18): G-094 published and verified Relay Cell
> `v0.44.3` for `linux/amd64` and `linux/arm64`. The immutable accepted index is
> `sha256:b0dbee1535a2da9d963814591c8f0307d719b0d1ee43baebd2cbedf5f1d22c73`.
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
ghcr.io/orionfold/relay-cell@sha256:b0dbee1535a2da9d963814591c8f0307d719b0d1ee43baebd2cbedf5f1d22c73
```

Use that complete reference for deployment. `vX.Y.Z`, `vX.Y`, and `stable`
help a person discover a release, but tags can move or be mistyped. The digest
is the authority. The tag `latest` is not part of Relay's publication policy.

Pull and inspect the accepted digest:

```bash
export RELAY_CELL_DIGEST='sha256:b0dbee1535a2da9d963814591c8f0307d719b0d1ee43baebd2cbedf5f1d22c73'
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

Relay's evidence supports claims about origin, integrity, provenance and the
declared compatibility contract. It is not a **vulnerability-free** claim, an
uptime SLA, a durability guarantee, an RPO/RTO promise, or a substitute for the
customer's host, backup, network and registry controls.

Registry acquisition, artifact verification and paid Host entitlement are
separate errors. A license lapse or registry outage must not stop existing
Cells or prevent export/recovery; it only affects new managed-Cell operations
according to the Host license contract.

## First production proof and remaining release gate

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
   passed. The run is
   [29663211815](https://github.com/orionfold/relay/actions/runs/29663211815).
5. No registry credential, signing key or paid/mirror dependency was added.

The release receipt records amd64 digest
`sha256:c269278e16218cbe92b0a48c336799cb2e267421bfb7e9160791f28aa5e49e4d`
at 131,021,904 compressed-layer bytes and arm64 digest
`sha256:61afeafcac77f78dcaa32313a1ec515fcfa983dba5f498ed1c77c6d651c1640b`
at 130,138,470 bytes. The public index is an acquisition artifact, not a paid
entitlement or a Host release. `stable` remains unmoved until the R3
customer-identical staging gate passes; exact `v0.44.3` and digest references
are the current discovery and authority surfaces.

Primary references: [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry),
[GitHub artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations),
[Cosign keyless containers](https://docs.sigstore.dev/cosign/signing/signing_with_containers/),
and [ORAS copy](https://oras.land/docs/commands/oras_cp/).
