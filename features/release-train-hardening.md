---
title: Make Relay releases preflight-complete before immutable tags
status: completed
priority: P0
milestone: post-mvp
source: release runs 29866340576, 29869529544, 30041426874, 30041441117, 30043285620, and 30043289388
dependencies: []
---

# Make Relay releases preflight-complete before immutable tags

## Problem

Relay's publication controls correctly stop unsafe releases, but several
failures have been discovered only after an immutable Cell or npm candidate tag
was created:

- Relay `0.45.1` and `0.45.2` shipped while their exact-main fresh-clone
  workflow remained red.
- `cell-v0.46.0` reached the image audit before newly disclosed high-severity
  Next.js, Sharp, PostCSS, and fast-uri findings were surfaced.
- `cell-v0.46.1` passed the local release contract but the Windows matrix found
  a Unix executable-mode assertion that was meaningless on Windows.
- The OCI workflow asks for staging approval, production platform approval, and
  a second production index approval even though one operator decision should
  be able to gate the exact fan-out/fan-in publication graph.

Immutable failed tags are useful audit evidence and must never be moved or
deleted. The repeated candidates nevertheless show that Relay lacks one
fail-closed pre-tag authority which proves every check that can run before
publication and records the genuinely registry-only checks that remain.

## Outcome

A release operator prepares and pushes one candidate commit, runs one
documented preflight command/workflow against that exact SHA, and receives a
machine-readable receipt. A Cell tag cannot become publication-eligible unless
the receipt proves the full local release contract, current production
dependency policy, package/knowledge/version parity, npm-pack closure, and all
supported fresh-clone Node/npm/OS lanes. Host/npm binding consumes the verified
Cell receipt and the final production sequence requires one explicit operator
promotion decision.

Every failed release check is harvested into a durable release evidence packet
and receives one disposition: product fix, test fix, workflow fix, accepted
external advisory, or non-reproducible infrastructure failure. A future release
must not silently proceed with a red exact-SHA lane.

## Technical approach

1. Inventory the last successful and failed Cell/npm workflows and map each
   failure to the earliest stage where it could have been detected.
2. Add a versioned pre-tag receipt schema keyed by source commit, source-tree
   digest, package version, supported Node/npm matrix, policy revision, and
   expiry.
3. Add a candidate workflow callable on an exact mainline SHA without creating
   a tag or writing to a public registry. Reuse the production quality,
   fresh-clone, npm-pack, knowledge, public-boundary, and vulnerability
   implementations rather than creating weaker lookalikes.
4. Add a local release driver that validates the clean tree and release
   surfaces, dispatches or discovers the exact-SHA candidate workflow, waits
   for its terminal receipt, and refuses tag creation on missing, stale,
   mismatched, skipped, or red evidence.
5. Make the publication workflow verify the receipt before any staging write.
   Keep native architecture build/reproducibility/conformance and registry
   signature/attestation verification as publication-time controls where they
   cannot be proven earlier.
6. Reshape production environment gating so one approved fan-out/fan-in graph
   covers platform publication and index assembly without weakening the
   protected environment, immutable digest, keyless signing, SBOM, provenance,
   or exact-platform checks.
7. Emit a compact release summary containing candidate attempts, failure
   dispositions, approvals, immutable digests, public npm/GitHub/GHCR
   verification, and any still-red workflow.

## Acceptance criteria

- [x] A documented command runs or locates every pre-tag check for an exact
      commit and writes a versioned, content-addressed receipt.
- [x] The receipt includes macOS and Windows on Node 22/npm 11 and Node 24/npm
      12; a failed or missing lane blocks Cell tag eligibility.
- [x] High-severity production dependency findings block before a Cell tag;
      accepted lower-severity findings are explicit and policy-versioned.
- [x] Package, lockfile, changelog, knowledge bundle, npm pack, public-boundary,
      and Cell/Host version authority mismatches fail before tagging.
- [x] Publication refuses a receipt from another commit, tree, version,
      workflow/policy revision, or expired candidate.
- [x] Exactly one explicit production promotion decision gates the platform
      publication and final multi-platform index graph.
- [x] Failed attempts remain auditable, but the normal happy path creates only
      one Cell candidate tag and one npm/GitHub release tag.
- [x] Fault-injection tests cover dirty trees, stale/missing receipts, a red
      Windows lane, vulnerability-policy failure, digest substitution, skipped
      jobs, and interrupted/resumed publication.
- [x] A dry run plus the next real release prove the end-to-end mechanism, and
      no exact-SHA release-support workflow is left red at completion.

## Scope boundaries

Included: Relay's Cell, Host/npm, GitHub Release, knowledge bundle, supported
fresh-clone matrix, GHCR evidence, and approval topology.

Excluded: removing immutable historical tags, weakening production protection,
adding a paid registry or signing service, publishing automatically without an
operator release decision, or treating transient infrastructure failure as a
green result.

## Operator gates

Approve the final workflow/environment topology before changing protected
GitHub environments. Pushes, tags, registry writes, npm publication, GitHub
Releases, and the first live proof remain separately gated.

## Stop/rescue

After two materially different implementations fail to bind preflight evidence
to the exact source commit and policy revision, preserve the smallest failing
receipt and keep the current tag-only production workflows fail-closed. Do not
solve orchestration friction by moving tags, skipping a supported OS lane,
broadening signing identity, or reducing vulnerability/reproducibility checks.

## Implementation receipt — 2026-07-23

- G-131 is the durable ID; the initial backlog entry temporarily reused the
  already-completed npm install-integrity ID G-114.
- Local implementation and fresh security review are green. The release quality
  profile passed 21/21 lanes in 76.0 seconds: 3,974 application tests plus one
  intentional skip, coverage ratchets, runtime graph smoke, harness safety,
  7/7 mutation kills, Pack compatibility, and the two new release contract
  suites.
- The production dependency audit passed the high/critical policy while
  preserving three moderate findings in the Anthropic SDK → MCP SDK → Hono
  chain for the candidate receipt.
- YAML parsing, TypeScript, workflow/policy validation, and diff hygiene pass.
- A clean detached worktree at `b62f7c184107030f6a41f1233a3d0144f5557fb0`
  produced the expected non-publication dry-run receipt
  `sha256:b1841fbffc440ad47a1068a3674e32c551437d0c7bab021ad043fe5cf055d84b`;
  the driver correctly reported `publicationEligible: false`.
- Live Cell candidate
  [30049563943](https://github.com/orionfold/relay/actions/runs/30049563943)
  produced exact-SHA receipt
  `sha256:0194b926f977913f2b3a1334178e849ca3156a749fb59c617175563dba74fc9e`.
  Cell publication
  [30050073420](https://github.com/orionfold/relay/actions/runs/30050073420)
  accepted it, requested one production approval, and published signed
  `linux/amd64` plus `linux/arm64` index
  `sha256:98aba662fc4c7bc9b79e5e384178bef2bdaac7977d1be5b490726740c4223ac1`.
- Live Host candidate
  [30051719531](https://github.com/orionfold/relay/actions/runs/30051719531)
  proved the bound Cell authority and produced exact-SHA receipt
  `sha256:1b4cbe4047a625b6a4933ee905eb32f1e503368271e0a278c895f7ff53492482`.
  npm/GitHub publication
  [30052170680](https://github.com/orionfold/relay/actions/runs/30052170680)
  accepted it, passed the customer-identical npx smoke, published
  `orionfold-relay@0.46.3`, and attached the production build, checksum, and
  CycloneDX SBOM to the public GitHub Release.
- Independent public verification resolved npm integrity
  `sha512-cdCANW4qf87UrRUhnQ/raN49XydTnovFXpUzRWmIkmYjlscl9+eiz4gXfPZ8r3paU8NVs45yvTXus6SNn8e2Ug==`,
  all three GitHub Release assets, and the exact two-platform GHCR index.
- Live proof exposed that the first driver printed a lightweight Cell tag
  command even though Relay policy requires annotated release tags. The
  published `cell-v0.46.3` ref remains immutable audit evidence; the Host tag
  was annotated, and the driver now emits only annotated Cell and Host
  commands with a protecting regression.
