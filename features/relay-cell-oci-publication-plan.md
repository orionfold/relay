---
title: G-094 Relay Cell OCI publication implementation plan
status: implementation
specification: features/relay-cell-oci-publication.md
goal: G-094
date: 2026-07-18
---

# G-094 implementation plan

## Scope challenge

**PROCEED as-is.** Reuse G-093's audited OCI archive and manifest rather than
building a second release artifact. GHCR, keyless GitHub identity and native
GitHub runners cover the first release without a paid service. A mirror, token
broker, KMS key, self-hosted runner or automated registry janitor would add
authority and failure modes without increasing first-beta customer value.

## What already exists

- `Dockerfile.relay-host` creates the Cell-only, non-root distroless runtime.
- `scripts/relay-host-artifact.mjs` and
  `scripts/build-relay-host-artifact.mjs` implement the publication-profile
  clean-source gate, audited OCI layout, native/runtime policy, SBOM,
  vulnerability scan, npm boundary and signed compatibility manifest.
- `scripts/relay-host-smoke.mjs` proves two-Cell isolation, persistence,
  shutdown, export, upgrade and rollback.
- `scripts/lib/relay-host-manifest.mjs` owns digest-pinned release compatibility.
- `.github/workflows/publish.yml` supplies the existing exact-tag/version and
  OIDC release pattern; `.github/workflows/relay-host-contract.yml` supplies the
  current non-publishing artifact gate.
- ORAS copies the already-audited OCI layout without rebuilding it. Cosign and
  GitHub artifact attestations bind the copied digest to workload identity.
- TDR-044 and `features/oci-fulfillment.md` own the npm Host / OCI Cell / paid
  entitlement separation.

## NOT in scope

- Real GHCR write, visibility change, tag, push, release or npm publication:
  explicitly withheld by the operator until local evidence is reviewed.
- G-083 entitlement/lifecycle and G-084 UI: separate paid-product layers.
- Docker Hub mirror or private registry-token broker: deferred by G-095.
- Paid or self-hosted runners and KMS: unnecessary while the public repository
  has standard native runners and Sigstore workload identity.
- Automatic production deletion: conflicts with immutable rollback/support
  evidence; staging cleanup remains policy plus a later authorized operation.

## Specification and acceptance mapping

| Acceptance criterion | Implementation slice |
|---|---|
| Approved decisions are executable | JSON policy + strict validator |
| Release fails closed | named-error tag/source/evidence/workflow functions |
| No second artifact path | ORAS copy plan consumes G-093 OCI archive/digest |
| Two native architectures | CI matrix plus exact platform-set validator |
| Signature/SBOM/provenance identity | Cosign + `actions/attest`, then receipt verification |
| Digest-only authority | compatibility manifest, release receipt and promotion planner |
| No accidental publication | tag-only trigger, protected environments, dry-run external-write guard |
| Customer can verify/use | public OCI verification and mirror/export guide |
| npm/OCI size truth | aggregate receipt with separate closures and explanation |

## Vertical slices

1. Add the approved policy and strict library for tag, platform, signer,
   evidence, release-index and promotion contracts.
2. Add negative fixture tests and a local dry-run that emits intended commands
   without executing a registry, signing, tagging or release operation.
3. Extend the G-093 npm receipt with unpacked bytes/file count so aggregate
   release evidence can compare closures honestly.
4. Add SHA-pinned production tag workflow and separately protected stable
   promotion/rollback workflow. Both invoke the strict repository validator.
5. Add customer verification/support/mirroring documentation and deterministic
   doc/workflow parity checks.
6. Run focused tests, existing Host artifact gates, dry-run, full suite/build,
   documentation gates and fresh security review.
7. Commit the local mechanism and stop. A later operator-approved run owns
   private staging push, public visibility, exact release and stable promotion.

## Regression test budget

| Risk | Protecting evidence |
|---|---|
| Ordinary commit can publish | workflow parser requires only `push.tags: v*` and protected environment |
| Workflow gains excessive token authority | exact permissions comparison; no `contents: write` |
| Action supply-chain drift | every external `uses:` reference must be a full commit SHA |
| Wrong tag/version/source | release-input positive/negative matrix |
| Second build differs from audited artifact | workflow must ORAS-copy archive and compare resolved digest |
| One platform missing or drifted | platform-set and shared-contract tests |
| Signature/attestation missing or broad identity | receipt identity/issuer/SBOM/provenance negatives |
| `latest` or mutable tag becomes authority | tag/promotion and manifest reference negatives |
| npm size is misleading | unpacked-size/file-count regression and aggregate receipt assertion |
| Dry-run leaks or writes | spawned-command recorder; external-write count remains zero |
| Existing artifact path regresses | `npm run test:relay-host`; publication-profile dirty refusal |
| Documentation drifts | `check:relay-cell-publication` parses policy, workflows and required copy |
| Runtime registry cycle | not applicable: no agent/runtime/workflow/chat imports change |

Verification order:

1. `node --test scripts/relay-cell-publication.test.mjs`
2. `npm run check:relay-cell-publication`
3. `npm run relay-cell:publication:dry-run`
4. `npm run test:relay-host`
5. targeted G-093 artifact policy tests for npm receipt changes
6. `npm run check:doc-links && npm run knowledge:verify`
7. `npm test`
8. `npm run build`
9. fresh code/security review of every workflow, shell boundary and evidence
   parser

The real native amd64/arm64 registry and startup smoke remains visibly pending
until the operator opens the external-write gate; local emulation cannot replace
that release evidence.

## Error & Rescue Registry

| Failure | Expected behavior | Rescue |
|---|---|---|
| Dirty or non-tagged source | publication profile refuses before login/push | commit, create the matching later release tag, rerun |
| Tag/version mismatch | named refusal before build | correct package version or tag; never reuse a released version |
| One native runner unavailable | no index or aliases created | retry the native job; do not substitute final emulated evidence |
| Platform upload succeeds, sibling fails | uploaded digest stays quarantined; no index/promotion | repair and rerun missing platform; reuse only matching source evidence |
| Copied digest differs | stop before signature/index | inspect ORAS/layout/registry behavior; never sign the drifted digest |
| Signing or attestation service unavailable | exact digest may exist but remains unpublished/unpromoted | retry identity step; do not advance aliases |
| Wrong workflow identity | verification fails by name | fix protected workflow/ref; never broaden verifier to `.*` |
| Index creation/inspection fails | no minor/stable alias | repair manifest list from verified platform digests |
| Stable promotion fails | existing stable remains authority | retry exact digest-only retag; no rebuild |
| Registry unavailable with valid license | artifact-acquisition failure, not license failure | retry/mirror later; existing Cells remain unaffected |
| Visibility not yet public | customer pull gate remains closed | operator reviews evidence, then explicitly changes visibility |
| ARM preview runner removed | publication blocks visibly | approve another native runner provider or self-hosted threat model |

## Rescue and rollback

No runtime, database, license or npm behavior changes. Removing the new policy,
scripts, docs and workflows returns to the accepted local-only G-093 artifact.
Registry rollback never deletes or rebuilds a release: verify the previous
supported digest and retarget `stable`. Exact release tags and evidence remain.
