---
title: Implementation plan for exact-SHA release authority
status: completed
specification: features/release-train-hardening.md
goal: G-131
---

# Exact-SHA release authority implementation plan

## Scope challenge

**REDUCE scope:** Keep the current tag-only workflows and add a human checklist.
This would preserve the failure mode G-131 exists to remove: a release can still
create an immutable tag before Windows, npm-line, dependency-policy, or package
closure evidence is terminal.

**PROCEED as-is:** Add one reusable candidate workflow, a versioned receipt
contract, one local driver, and fail-closed consumers in both publication
workflows. Reuse the existing quality gate, fresh-clone smoke, public-boundary,
knowledge, Host/Cell authority, and OCI publication validators.

**EXPAND scope:** Add a release service, paid artifact store, long-lived signing
key, or general deployment orchestrator. These add operational and security
surface without improving the exact-SHA decision.

**Decision:** Proceed as-is. The user explicitly selected this contract under
its temporarily reused G-114 ID; durable reconciliation assigns it G-131
because npm customer install integrity already owns historical G-114.

## NOT in scope

- Changing protected GitHub environment settings. The workflow topology is
  implemented and tested locally; applying environment configuration remains an
  operator gate.
- Pushing, tagging, publishing npm/GitHub/GHCR artifacts, or performing the
  first live release proof. Those external writes remain separately gated.
- Pre-building the native OCI archives in the candidate workflow. Architecture
  build, reproducibility, conformance, registry signing, SBOM attestation, and
  digest verification remain publication-time checks because their final
  identity is the immutable Cell tag and registry subject.
- Removing, moving, or hiding failed immutable tags. They remain audit evidence.
- Automatic stable promotion. One explicit production approval gates the exact
  platform fan-out and index fan-in; the separate stable promotion operation
  remains manual and digest-authoritative.

## What already exists

- `.github/workflows/quality-gate.yml` is reusable with `workflow_call` and owns
  the full release quality contract.
- `.github/workflows/fresh-clone-dev.yml` owns the supported macOS/Windows,
  Node 22/24, npm 11/12 matrix and literal fresh-clone smoke.
- `scripts/check-relay-cell-publication.mjs` and
  `scripts/lib/relay-cell-publication.mjs` own OCI policy/workflow validation.
- `scripts/check-host-cell-release-authority.mjs`, knowledge checks,
  public-boundary checks, `npm pack`, and production dependency audit already
  expose deterministic command boundaries.
- The Cell workflow already stages audited native archives by digest and copies
  rather than rebuilds them for production.
- The npm workflow already performs the customer-identical production build and
  npx smoke before its public write.

## Receipt design

`release-candidate.yml` accepts `scope=cell|host` and an exact semantic version.
It only runs from `main` and asserts that the requested source SHA equals the
workflow run SHA. Its final artifact is:

- schema and policy version;
- scope, repository, source commit, git-tree identity, content-addressed receipt
  digest, package version, created/expiry timestamps;
- exact supported fresh-clone lanes and terminal status;
- release-quality, dependency-policy, package/lock/changelog, knowledge,
  public-boundary, npm-pack, and scope-specific authority checks;
- workflow-policy digest covering the receipt producer, validators, publication
  consumers, quality gate, fresh-clone workflow, dependency lock, and OCI policy.

The receipt is valid for 24 hours. The Cell tag workflow accepts only a `cell`
receipt; the npm/GitHub tag workflow accepts only a `host` receipt. Each
consumer locates a successful candidate workflow run with the tag commit as its
exact `head_sha`, downloads the matching artifact, and revalidates its content
against the tagged checkout before any registry or npm write.

## Implementation slices

1. Add the receipt library and CLI with named failures for dirty source,
   mismatched commit/tree/version/scope/policy, expiry, missing/skipped/red
   lanes, failed dependency policy, and content-digest substitution.
2. Make the fresh-clone workflow reusable and emit one lane receipt per matrix
   member, while preserving pull-request, main-push, and manual behavior.
3. Add the candidate workflow. Reuse the release quality workflow; run the
   supported fresh-clone workflow; execute deterministic release-surface checks;
   aggregate only terminal evidence into a content-addressed receipt.
4. Add the local driver. It validates a clean checkout and exact main SHA, can
   run a no-network local receipt dry run, and otherwise dispatches/waits for
   the exact candidate workflow before printing (not executing) the eligible tag
   command.
5. Add fail-closed receipt discovery/download/validation to both publication
   workflows before their first external write.
6. Replace two OCI production environment attachments with one
   `production-gate` job. Both platform publication and index assembly depend on
   that one decision; their existing permissions and evidence checks remain.
7. Update release documentation and durable evidence surfaces.

## Specification and acceptance mapping

| Acceptance criterion | Implementation slice | Protecting evidence |
|---|---|---|
| Exact commit command and content-addressed receipt | 1, 3, 4 | receipt unit tests; local dry run |
| Four supported OS/Node/npm lanes | 2, 3 | reusable workflow contract test; missing/red lane faults |
| High production vulnerabilities block pre-tag | 3 | `npm audit --omit=dev --audit-level=high`; policy-failure fixture |
| Version, lock, changelog, knowledge, pack, boundary, authority parity | 3 | existing commands plus receipt check inventory assertions |
| Wrong commit/tree/version/policy/expiry refused | 1, 5 | fault-injection tests |
| One production promotion decision | 6 | publication-workflow topology test |
| One normal candidate tag | 4 | driver never creates tags; it prints one eligible command only |
| Dirty, stale, red Windows, digest, skipped, interruption faults | 1, 5 | receipt and workflow contract tests |
| Dry run and next live release proof | 4, 7 | local receipt; live proof remains explicit operator gate |

## Regression test budget

Changed behavior:

- Candidate evidence becomes mandatory before either publication tag can write.
- Fresh-clone runs become reusable and emit exact lane receipts.
- OCI production approval becomes one graph gate.
- A local driver refuses to recommend a tag unless exact evidence is valid.

New durable tests:

- `scripts/release-preflight.test.mjs`: schema, source, version, scope, expiry,
  policy digest, lane set/status, dependency audit, content digest,
  dirty-checkout, and interruption/resume fixtures.
- Extend `scripts/relay-cell-publication.test.mjs`: candidate workflow structure,
  one-production-gate topology, and receipt guard before first staging write.
- Extend quality-control path coverage so changes to candidate/release receipt
  code trigger every conditional quality lane.

Verification order:

1. `npm run test:release-preflight`
2. `npm run test:relay-cell-publication`
3. `npm run test:quality-gate`
4. `npm run check:relay-cell-publication`
5. `npm run release:preflight:dry-run -- --scope cell --version 0.46.2 --out /tmp/relay-release-preflight.json`
6. YAML parse/static workflow checks and TypeScript check
7. `npm run quality:gate -- --profile release`
8. Separately authorized exact-SHA candidate workflow and next release proof

No browser check is required: G-131 changes operator CLI/CI behavior, not product
UI. No runtime-registry-adjacent application module is touched.

## Error & Rescue Registry

| Failure | Named response | Recovery |
|---|---|---|
| Source is dirty or not exact pushed `main` | `RELEASE_PREFLIGHT_SOURCE_*` | commit/push the intended source; never snapshot dirty files |
| Candidate receipt missing or expired | `RELEASE_PREFLIGHT_RECEIPT_*` | rerun the candidate workflow on the same exact SHA |
| Policy/workflow digest changed | `RELEASE_PREFLIGHT_POLICY_MISMATCH` | rerun candidate under current policy; never grandfather old evidence |
| Supported lane missing, skipped, cancelled, or red | `RELEASE_PREFLIGHT_LANE_*` | repair/rerun that exact lane; never treat absence as green |
| Production dependency policy fails | `RELEASE_PREFLIGHT_VULNERABILITY_BLOCKED` | update/override with an explicit policy change and new receipt |
| Receipt bytes or embedded digest substituted | `RELEASE_PREFLIGHT_DIGEST_MISMATCH` | discard and download from the exact successful run |
| Publication interrupted after staging/platform write | Existing immutable digest checks plus exact receipt | rerun the same tagged workflow; it resumes only matching digests |
| Candidate orchestration fails twice by different designs | G-131 stop/rescue | keep current tag-only workflows fail-closed and preserve evidence |

## Rescue and rollback

The implementation is additive until the publication workflows consume the
receipt. If local verification fails, remove only the new candidate/receipt
surfaces and retain the current tag-only workflows. Once enabled, rollback means
reverting the workflow commit before any new tag—not bypassing the receipt on an
existing tag. Existing staging and production digest idempotency remains the
publication recovery path.
