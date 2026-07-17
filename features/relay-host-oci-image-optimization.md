---
title: Thoroughly optimize and harden the Relay Cell OCI image
status: accepted
priority: P1
milestone: post-mvp
source: G-080 acceptance receipt and operator request 2026-07-16
dependencies: [relay-host-artifact]
---

# Thoroughly optimize and harden the Relay Cell OCI image

## Description

G-080 proved a signed, reproducible Relay Cell image and its Host lifecycle
contract, but the accepted arm64 alpha image measured 889,827,989 bytes. The
largest compressed layer contains material that is not part of the Relay
runtime: approximately 624 MB of historical `dist-artifacts`, 77 MB of
`.claude`, plus `.agents`, `.playwright-mcp`, archives, an old npm tarball, and
other repository-local inputs. Next.js standalone output tracing copied these
paths into `.next/standalone`, after which the otherwise narrow runtime stage
faithfully copied them into the final image.

This feature turns that diagnostic baseline into a minimal, auditable,
distribution-safe OCI artifact and a repeatable image-production mechanism.
Every relevant Relay update can invoke one versioned local/CI command that
builds the optimized image, audits its contents and dependencies, enforces
budgets, generates the SBOM and signed manifest, runs conformance, and emits a
machine-readable evidence bundle. Optimization is not allowed to trade away
the G-080 runtime, isolation, durability, rollback, native-module, provenance,
or reproducibility guarantees. Size is one output; the stronger contract is
that every final-image path and indexed package is justified by a runtime need.

## User Story

As a customer-owned Relay Host administrator, I want a small and auditable
Relay cell image so that installs, upgrades, rollbacks, vulnerability review,
storage planning, and recovery are fast and predictable without carrying
operator tooling or repository history into my environment.

## Baseline

- OCI image bytes: `889,827,989` on local arm64.
- OCI archive bytes: `889,843,200`.
- Largest compressed application layer: `783,608,809` bytes.
- Largest traced groups in that layer: `dist-artifacts` 624.2 MB, `.claude`
  77.0 MB, `.next` 74.8 MB, `node_modules` 54.8 MB, and `public` 28.5 MB.
- CycloneDX SBOM: 407 components: 281 npm, 125 Debian, and one GitHub-classified
  component.
- npm remains a separate channel: its accepted package baseline is 2,767,765
  compressed bytes and must not absorb the OCI runtime.

The npm baseline and OCI baseline measure different closures. npm ships a
host-resolved application package and relies on destination Node, installed
dependencies, OS and native libraries. OCI ships the closed, pinned Linux Cell
runtime. They bind the same Relay version and compatibility contract without
being byte-identical artifacts. Optimization must remove accidental OCI
content, not chase the npm tarball size by externalizing runtime prerequisites
that managed Hosts need for isolation and deterministic lifecycle.

## Technical Approach

### 1. Explain the trace closure

- Produce a machine-readable inventory of every final image layer and path,
  grouped by source stage, top-level directory, compressed bytes, unpacked
  bytes, and reason for inclusion.
- Trace the code paths and Next.js output-file-tracing decisions that cause
  repository-root or dynamic workspace paths to be included.
- Classify each path as required runtime, required native/runtime dependency,
  optional capability, duplicated platform artifact, or forbidden build input.
- Record the essential-runtime floor before selecting a final size budget.

### 2. Minimize build inputs and standalone output

- Replace broad source copying with a reviewed build-context allowlist or an
  equivalently strict generated clean context.
- Correct dynamic path handling or configure explicit tracing boundaries so
  Next standalone output includes only files reachable at runtime.
- Keep runtime-readable migrations, public assets, knowledge, Pack templates,
  native SQLite/PDF/image dependencies, and other verified capabilities.
- Remove historical release archives, tests, coverage, screenshots, browser
  sessions, agent instructions, planning/reference material, source-control
  metadata, local environment files, caches, and stale package tarballs.
- Remove architecture/libc duplicate native packages when the pinned target
  platform proves they are unnecessary; never delete them by filename alone.

### 3. Minimize and harden the runtime image

- Compare the pinned Bookworm-slim runtime with safe alternatives, including a
  pruned slim runtime and an appropriate distroless variant. Keep the current
  base unless an alternative passes native-module, diagnostics, health-check,
  UID/GID, CA-certificate, timezone, and emergency-support requirements.
- Keep build tooling and dev dependencies out of the final stage.
- Preserve non-root UID/GID 10001, read-only root, dedicated data mount,
  dropped capabilities, no-new-privileges, health checks, signal handling, and
  the exact G-080 entrypoint contract.
- Pin every base and externally acquired build input by immutable digest.

### 4. Make minimality enforceable

- Add a final-image content-policy check with an explicit runtime allowlist and
  named forbidden paths/patterns. It must scan the real OCI archive, not only
  the Git tree or npm tarball.
- Add a layer and total compressed-size budget. The default acceptance ceiling
  is 300 MB for the measured arm64 OCI artifact and at least a 60% reduction
  from the G-080 baseline; revising that ceiling requires an evidence packet
  proving the essential runtime floor and operator approval.
- Add regression budgets for largest layer, unexpected file growth, duplicate
  native platform packages, SBOM component drift, and uncompressed runtime
  footprint.
- Extend the public-boundary/privacy scanner to the OCI archive and fail closed
  on secrets, local paths, session state, planning/tooling surfaces, or nested
  distributable archives.
- Generate and verify a CycloneDX SBOM from the final image. Every remaining
  Debian and npm component must be attributable; zero known critical/high
  vulnerabilities is required unless a time-bounded explicit exception is
  approved and recorded.

### 5. Re-prove the Cell image on a Host

- Rebuild twice from the same clean committed inputs and prove identical image
  configuration/content digests under the existing reproducibility contract.
- Regenerate the signed manifest so the OCI archive, image, SBOM, source,
  schema, runtime contract, and rollback digest remain bound.
- Run the complete G-080 two-cell, native dependency, persistence, shutdown,
  export, upgrade, rollback, and containment smoke against the optimized image.
- Produce cold-pull/export/import, create, start, readiness, upgrade, and
  rollback timing receipts so optimization is tied to customer operations, not
  just byte count.

### 6. Productize repeatable image generation

- Provide one documented, versioned entrypoint such as
  `npm run host:artifact:build` that works locally and is called unchanged by
  CI. It must orchestrate the optimized build, content inventory, size/layer
  budgets, OCI public-boundary scan, SBOM, vulnerability policy, manifest,
  signature verification, reproducibility check, and conformance receipt.
- Separate deterministic build identity from optional acceleration: caches may
  reduce runtime but must not change image/config/content digests. Include a
  clean no-cache control in CI and document safe cache invalidation.
- Derive Relay version, source revision/tree digest, architecture, base digest,
  lockfile digest, build-policy version, schema range, and rollback input from
  authoritative sources. Refuse missing, ambiguous, dirty, or mismatched
  publication-grade inputs with named errors; allow an explicitly labelled
  `dirty-local` evidence build without granting publication authority.
- Emit a stable `output/relay-host/<version>/<platform>/` bundle containing the
  OCI archive or registry-ready layout, checksums, signed manifest, public key
  reference, SBOM, vulnerability result, content/layer inventory, timings, and
  one summary receipt. Generated outputs remain ignored and never enter npm.
- Add CI change detection for Dockerfile, lockfile, Next configuration,
  migrations, public/runtime assets, build scripts, and transitively shipped
  application code. A pull request runs the bounded build/policy lane; the
  release profile runs clean reproducibility plus full Host conformance before
  any separately authorized publication job may consume the artifact.
- Make publication a downstream consumer of a verified immutable digest. The
  build command itself must have no registry, GitHub Release, provider, or
  network publication side effect.
- Document the operator and CI runbook: prerequisites, command, expected
  receipts, cache/no-cache modes, failure taxonomy, artifact retention, and how
  a later authorized release promotes the already verified digest without
  rebuilding different bytes.

## Acceptance Criteria

- [x] The final image contains no `dist-artifacts`, `.claude`, `.agents`,
      `.playwright-mcp`, `.git`, `output`, tests, coverage, local environment
      files, planning docs, browser/session state, or nested Relay release/npm
      archives.
- [x] A checked-in OCI content-policy test scans the real archive, explains
      every allowed top-level runtime surface, and fails on a seeded forbidden
      fixture.
- [x] The arm64 OCI artifact is no larger than 300 MB and at least 60% smaller
      than 889,827,989 bytes, or the operator accepts a revised evidence-derived
      ceiling after the essential-runtime floor is demonstrated.
- [x] Layer, uncompressed-footprint, largest-file, native-platform, and SBOM
      receipts are generated deterministically and protected by drift budgets.
- [x] The final SBOM contains only attributable runtime components and the
      vulnerability gate has no unapproved critical/high findings.
- [x] Cached and no-cache builds produce the same platform, file count and exact
      path/mode/link inventory. Compiled Next content hashes remain diagnostic,
      because the operator accepted semantic/path-inventory reproducibility over
      byte-identical Webpack output.
- [x] One checked-in local/CI command generates the optimized image and complete
      evidence bundle from authoritative inputs; CI invokes that same command
      rather than duplicating its logic in workflow YAML.
- [x] Clean, dirty-local, version-mismatch, missing-base-digest, stale-cache,
      budget-failure, content-policy-failure, vulnerability-failure, and
      signature/digest-mismatch paths produce named failures and regression
      fixtures.
- [x] A clean no-cache control and cached rebuild produce identical runtime
      platform/path semantics, and relevant source/build-input changes activate
      the image lane.
- [x] The evidence bundle uses a stable version/platform layout and contains
      checksums, manifest, signature verification, SBOM, vulnerability and
      content/layer reports, performance timings, and one parseable summary.
- [x] Future publication can promote the verified immutable digest without
      rebuilding, while the generation command performs no external publish or
      registry write.
- [x] All G-080 manifest negative tests and the full two-cell Host smoke pass
      against the optimized artifact, including SQLite, PDF, restart, WAL,
      SIGTERM, interrupted snapshots, export, upgrade, and rollback.
- [x] G-025 is explicitly retained as the next Host R1 staging/release gate; it
      is not part of G-093's artifact-production outcome.
- [x] The npm tarball remains under its independent 10 MB release ceiling and
      does not contain the OCI image or OCI-only build output.
- [x] The durable Cell-image documentation records before/after size,
      contents, package inventory, security results, timing, retained tradeoffs,
      and the command that reproduces every receipt.

## Acceptance receipt — 2026-07-17

- The canonical Linux/arm64 artifact is `129,913,772` bytes, down 85.40% from
  the `889,827,989`-byte G-080 baseline. Its OCI archive is `129,938,944`
  bytes; the final filesystem contains 5,196 files across 25 layers.
- This remains intentionally larger than the 2,767,765-byte compressed npm
  tarball because the image contains the complete pinned Linux Cell runtime.
  The decision boundary is managed versus direct deployment, not cloud versus
  laptop, and footprint claims must compare complete installed closures.
- The final stage is the digest-pinned distroless Node 22 Debian 13 non-root
  image. Build tooling, npm, a shell, repository instructions/history, tests,
  planning artifacts, session state and nested Relay distributions are absent.
- Trivy 0.70.0 is acquired through a checksum-pinned archive. The CycloneDX
  inventory contains 60 components, all attributed to the pinned runtime base,
  Relay, the lockfile or Next's bundled runtime; the final-image scan reports
  zero unapproved high/critical vulnerabilities.
- Cached and no-cache OCI builds matched Linux/arm64, 5,196 files and the exact
  path/mode/link inventory. Webpack's compiled-content digest varied, so the
  operator accepted semantic/path-inventory equality as the reproducibility
  release gate while retaining content digests as diagnostic evidence.
- `npm run host:artifact:build` passed the content, size, component,
  vulnerability, npm-boundary, manifest, reproducibility and full two-cell
  conformance gates. `npm run host:artifact:verify` rechecked all 18 flat bundle
  files, checksums, signed identities, measured OCI/SBOM digests and required
  pass receipts.
- Regression evidence passed 17 artifact/manifest unit cases, all targeted Host
  tests, TypeScript, the production build, public-boundary and 532-file local
  documentation checks, and the complete 483-file suite (3,603 passed, one
  skipped). No browser step was required because the goal changes distribution
  rather than UI.
- The generated bundle remains local and explicitly non-publishable because it
  represents a dirty-local source tree signed by an ephemeral test key. No
  image push, registry write, release, version change or npm publication
  occurred. G-025 is the next customer-identical Host R1 gate.

## Scope Boundaries

**Included:**

- Linux Relay Cell image build context, Next standalone tracing, runtime
  stage, final-image contents, package/SBOM inventory, content/privacy policy,
  reproducibility, size/performance budgets, repeatable local/CI generation,
  evidence bundling, change detection, and G-080 regression evidence.
- Evidence-based comparison of compatible base-image strategies.
- Arm64 implementation plus architecture-neutral controls that future amd64
  builds must inherit.

**Excluded:**

- Publishing or pushing an image, creating a GitHub Release, or changing npm.
- Multi-architecture publication, registry signing/OIDC/cosign policy, paid
  entitlement enforcement, Host supervisor UX, public ingress, or provider
  provisioning; those remain in later Host goals.
- Removing Relay product capabilities merely to hit a byte target.
- Optimizing customer data volumes, model weights, Ollama images, or backup
  payloads; this goal covers the immutable Relay cell image only.

## Operator Gates

- Approve a revised size ceiling only if measured essential runtime cannot meet
  the default 300 MB/60% reduction gate.
- Approve any base-image change that materially reduces support/debuggability
  or changes the security posture.
- Push, publish, release, registry, and external signing actions remain
  separately gated and are not authorized by this goal.

## Rescue and Rollback

- If two materially different trace-boundary approaches still require broad
  repository inclusion, stop with the path-level trace evidence and split the
  offending runtime file-access contract into a prerequisite goal.
- Preserve the accepted G-080 Dockerfile/artifact receipt as the rollback
  baseline until the optimized image passes the complete conformance suite.
- Reject an optimization that saves bytes but loses a native/runtime feature,
  weakens isolation, introduces a silent dynamic download, or makes builds
  irreproducible.

## References

- `docs/relay-host-artifact.md`
- `features/relay-host-artifact.md`
- `Dockerfile.relay-host`
- `scripts/build-relay-host-artifact.mjs`
- `scripts/relay-host-smoke.mjs`
- `.dockerignore`
- `.github/workflows/publish.yml`
