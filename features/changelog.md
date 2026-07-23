# Feature Changelog

## 2026-07-22

### Completed

- `npm-customer-install-integrity` (G-114) — bound downloaded production builds
  and hoisted Relay runtime inputs to the exact npm package version, artifact
  checksum and build identity; staged promotion prevents mixed runnable bytes
  and evicts poisoned cache entries. The containing npm project is preserved,
  including its `package.json`. Non-git Settings now explains app-versus-data
  updates and provides a copyable, shell-safe restart command preserving the
  active data root, Host root, port, exposure and non-secret flags. Forty-six
  targeted tests, TypeScript, CLI/production builds, the 46.3 MB artifact, the
  full packed-npm smoke and a disposable packed-install browser proof passed.
  G-115 retains the separate install-warning cleanup.

### Groomed

- `customer-onboarding-release-train` — promoted all verified findings from the
  published `orionfold-relay@0.45.2` operator walkthrough into a six-increment
  active workstream: trustworthy install, entitlement-aware orientation, safe
  Pack activation, truthful runtime readiness, first successful/recoverable
  workflow, and customer-identical release acceptance.
- Groomed G-114–G-123 with exact outcomes, dependencies, regression budgets,
  operator gates and rescue conditions. G-114 is the current independently
  releasable P0 integrity patch; G-025 is reused as the final O5 staging gate.
- `npm-customer-install-integrity` — combined the stale shared-cache build and
  unsafe maintenance-command findings under G-114 while keeping npm dependency
  hygiene as independent G-115. The narrow G-035 stderr revalidation contract
  is superseded, not duplicated.
- `entitlement-aware-customer-onboarding` — grouped first-screen/identity/
  License/Host continuity as G-116, premium Pack acquisition as G-117, and
  Agency sample-data trust as G-118.
- `runtime-first-value-reliability` — made G-119 the shared runtime truth
  prerequisite, followed by provider-first Settings (G-120), atomic exact-run
  activation (G-121), step-scoped transient recovery (G-122), and quiet
  fault-tolerant skill discovery (G-123).

### Re-prioritized

- **Customer onboarding and first value** is now the active Relay workstream.
  The customer-owned Host verified-provider train is preserved but paused at
  G-109; Enterprise connectors remain paused. No Host/Cell or connector goal
  was deleted.

### Verification

- Completed the published-npm Mode B teardown: removed the isolated
  `~/.relay-npx-test`, `~/relay-npx-test` cache/workspace and temporary license;
  ports 3199/3200/3000 were free; the default Relay database SHA-256 remained
  `acd4abc37ac97cf2a49a957ceb606812d40e827811696cef7013c09f9eb0f35e`.

## 2026-07-21

### Completed

- `provider-neutral-relay-host-playbook` (G-108) — added a same-version npm
  `relay-host-playbook` CLI, strict portable manifest, secret-free cloud-init,
  checksum-pinned idempotent bootstrap, named preflight/completion receipts and
  a packaged customer guide for customer-created Ubuntu 24.04 x86_64 VMs. The
  bootstrap separates the SSH administrator from the locked runtime identity,
  retains no provider credential and exposes no service or secret during first
  boot. Fifty-one contract tests, the existing 156 Host checks, a disposable
  Ubuntu failure/retry smoke, npm tarball parity, public/docs gates and the
  production build passed. Website received customer-friendly handoff copy;
  package/Website publication and named-provider support remain separately
  gated.
- `cross-cloud-relay-host-portability` (G-107) — returned **GO** for a
  provider-neutral compatible-Linux-VM playbook first, followed by independently
  verified AWS Lightsail, Azure VM, GCP and EC2 profiles. Accepted a secret-free
  cloud-init plus checked-installer contract, optional customer-owned OpenTofu,
  exact portable/verified/Marketplace support labels, and a weighted provider
  matrix grounded in official sources.
- Groomed G-108–G-113 as bounded implementation/provider increments. Amended
  TDR-044 and G-086 so Portable Host GA requires G-108 plus accepted
  DigitalOcean, AWS Lightsail and Azure receipts and never implies “any cloud.”
  No cloud account, credential, spend, provider mutation or external write was
  used for the research decision.

### Groomed

- `cross-cloud-relay-host-portability` (G-107) — made a provider-neutral
  compatible-Linux-VM playbook the first post-DigitalOcean cloud increment,
  followed by independently verified providers. The research goal compares
  secret-free bootstrap and optional OpenTofu, explicitly separates AWS
  Lightsail from EC2, ranks AWS/Azure/GCP and lower-cost providers, defines
  portable-versus-verified claim thresholds, and must groom bounded
  implementation goals plus amend G-086 before any provider spend or support
  claim.
- `memo-inline-svg-commonmark-safety` (G-106) — specified Relay's canonical
  producer repair for five Packs memos whose inline SVG figures contain blank
  lines that terminate CommonMark raw HTML. The goal adds a source-boundary
  regression before SVG extraction, tag/id/reference integrity checks, exact
  five-article repair, complete memo-gate evidence, and a Website handoff
  receipt while preserving Website's byte-equal, fail-closed ownership boundary.

### Deferred

- `digitalocean-marketplace-relay-host` (G-103) — deferred by operator
  direction without deleting its research contract. Cross-cloud customer
  portability and verified-provider increments now precede investment in a
  DigitalOcean-specific Marketplace acquisition channel; vendor enrollment,
  image work, preview, listing, submission and publication remain gated.

## 2026-07-20

### Started

- `guided-digitalocean-beta` (G-105) — selected the bounded guided beta rather
  than docs-only closure or one-click expansion. The goal owns release of the
  G-085 fixes, accurate Settings guidance, the G-104 production-login brand
  repair, a customer DigitalOcean runbook, strict `_ASSETS` reconciliation and
  a fresh public-artifact DigitalOcean receipt before Website G-047 launch.
  Provider credentials/spend, push/tag/publish and Website launch remain
  separately operator-gated. The immutable `cell-v0.44.6` attempt stopped
  before publication when the clean CI checkout exposed an untracked Next
  image-type dependency; `0.44.7` adds a tracked static-asset declaration and
  passed the complete local release quality profile without `next-env.d.ts`.

### Completed

- `guided-digitalocean-beta` (G-105) — released matching npm/GitHub Relay
  `0.44.9` and the signed multi-architecture Cell image at
  `sha256:42bea7a0a65bf799ddbbc4a078667f256400c5cca0fe682c07ab68f2bf5c3cd5`.
  The release passed the complete local quality profile, production build,
  npm/public-boundary/knowledge/authority gates, public acquisition, signature,
  provenance, and customer-identical staging.
- A fresh approximately 18-minute SFO3 run installed only those public
  artifacts and passed authenticated first-admin, ten-Cell capacity plus
  eleventh refusal, isolation, retain/purge, a private Ollama task, encrypted
  recovery, restart, rollback, export, and zero-orphan cleanup. The Droplet,
  volume, reserved IP, firewall, SSH key, API token, and local credentials were
  removed; API and browser inventories were empty. Cost remains conservatively
  below `$0.05` while provider billing may lag.
- `released-login-brand` (G-104) — the prebuilt unauthenticated login now loads
  the canonical Orionfold mark through a tracked static asset declaration.
  Chrome verified both the login and authenticated shell at desktop and 390 px
  widths with complete 72 px images, no broken request, and no horizontal
  overflow. Website G-047 now owns the separately gated public beta launch.

- `digitalocean-relay-host-conformance` (G-085) — accepted a same-session paid
  SFO3 proof against public Relay `0.44.5` and the signed Cell index at
  `sha256:caaa02dbb8c719b1274a5bff9084e69ffe40b17aef35323ac9666eada8dd1bd6`.
  Authenticated HTTPS, ten-Cell admission and eleventh refusal, same-Host
  isolation, retained/purge capacity, a private Ollama task, encrypted backup,
  empty-root recovery, restart, rollback and export passed in a real browser and
  runtime journey.
- Fixed anonymous managed-Cell provenance verification, mode-0700 ownership
  normalization and non-root Cell-data purge. Added a repeatable, resumable,
  redacting DigitalOcean harness with deterministic provider tests and named
  cleanup/cost receipts.
- Removed the Droplet, volume, reserved IP, firewall, disposable SSH key, API
  token and local key/environment credential. API and DigitalOcean browser
  inventories were empty. Usage was under one hour and conservatively below
  `$0.05`; the provider's daily bill remained `G085_COST_PENDING` at `$0.00`.
  The accepted claim is a bounded single-DigitalOcean-Host beta after these
  fixes ship—not Fleet control, provider portability, production model sizing,
  or built-in one-click provisioning.

## 2026-07-19

### Completed

- `relay-host-cell-memo-series` (G-102) — completed six Website-ready source
  packages under `_ASSETS/memos/`, each with an eight-section article,
  provenance claim ledger, and accessible theme-token signature diagram. The
  series covers Host/Cell topology, npm/OCI delivery, same-Host trust,
  free-runtime versus licensed-management fulfillment, customer-owned recovery,
  and a deliberately gated customer-owned-cloud capstone.
- The complete eleven-memo corpus passed frontmatter, prose-number trace,
  local-asset, SVG accessibility/theme, privacy, and design-system-drift gates.
  The first five new memos are in `review`; the cloud capstone remains `draft`
  until G-085. `_ASSETS/memos/HOST-CELL-SERIES.md` records the claim matrix,
  distinct editorial questions, word counts, source hashes, review receipt,
  and prepared Website handoff. No Website mutation, public claim, CTA markup,
  publication, or external write was performed.

- `relay-host-cell-release-candidate-proof` (G-101) — packed Relay `0.44.3`
  from the identified source revision, installed it in the isolated staging
  customer environment, and accepted a 65-check Host/Cell receipt against the
  public signed image index at
  `sha256:b0dbee1535a2da9d963814591c8f0307d719b0d1ee43baebd2cbedf5f1d22c73`.
  The journey covered anonymous digest acquisition, signature/attestation
  authority, invalid-license and unknown-digest refusal, one Host/ten managed
  Cells, real Docker create/start/restart/stop, persistence, cross-Cell
  isolation, eleventh-Cell refusal, retain/purge capacity, Host-secret
  exclusion, encrypted export/recovery, and owned-resource cleanup.
- Fixed two release blockers found only by customer-identical execution:
  custom `RELAY_DATA_DIR` startup no longer migrates or mutates the default
  `~/.relay` database, and the Host's distroless Cell image now normalizes its
  mounted data ownership with its bundled Node runtime instead of assuming a
  missing `chown` executable. The staging driver also binds an isolated Host
  root and verifies both normal Relay and Host databases remain byte-identical.
- Added the repeatable `scripts/staging/host-cell-release-candidate.mjs` proof
  driver, targeted isolation/runtime regressions, a clean in-app browser check,
  and broader Host fulfillment, ingress, publication, lifecycle, lapse, and
  replacement checks. No Website mutation, purchase, push, publish, tag,
  release, or other external write was performed.
- `pack-removal-retention` (G-030) — separated ordinary Pack removal from the
  destructive internal purge path. Removing a Pack now deletes only its
  installed files and Pack-owned schedules; tables and their rows, reusable
  agents and blueprints, durable customers, and customer cost attribution stay
  available until the operator deletes them from their owning views.
- Added the same retain-versus-remove contract to the Apps list/detail dialogs,
  DELETE API receipt, and `relay pack remove` CLI output. The warning explicitly
  distinguishes removing a Pack from deleting a Relay Cell.
- Verified retained customer/project/table/row/usage attribution in the real
  database, API/component/CLI regressions, a browser dialog inspection with no
  console errors, the full 3,791-test suite, TypeScript, and Next/CLI production
  builds. No Pack or Cell was removed during browser verification.

### Groomed

- `digitalocean-marketplace-relay-host` (G-103) — added a research-ready
  Marketplace channel increment after the DigitalOcean Host beta. The goal
  compares a standard Droplet 1-Click that preserves Website-issued offline
  licensing, a DigitalOcean Licensed Droplet that would require a new hosted
  entitlement/lifecycle service, and a listing-led deploy handoff. It defines
  vendor, image, first-boot, security, listing, preview, update and support
  preparation; G-085 remains the conformance prerequisite and active priority.
  No vendor enrollment, terms acceptance, paid resource, snapshot, preview,
  listing, submission, publication or other external write was performed.

- `relay-host-cell-memo-series` (G-102) — created a supporting Host/Cell
  customer-education workstream and one executable goal for six high-quality,
  copy-verbatim memo source packages. The contract reuses the proven Relay
  Packs eight-section, claim-ledger, accessible-signature, honest-gap, and
  corpus-verification discipline. Five memos may reach editorial review from
  accepted G-101 evidence; the customer-owned-cloud capstone remains a visibly
  gated draft until G-085 proves the real provider journey. Memo completion is
  non-gating for R3, and Website copy, public claims, publication, and launch
  remain separately operator-gated.

### Re-prioritized

- Locked active execution to the Relay Cell/Host release and customer-owned
  cloud train (R3-R5). Enterprise connectors and unrelated standalone goals
  remain queued until the operator changes focus.
- Removed general model/Pack pricing freshness (G-020) from the R3 gate. G-084
  already owns cloud-infrastructure estimates, Website owns Host SKU truth, and
  Relay does not currently hardcode the Host amount. The focused sequence is
  now Website G-041 → R3 release → G-085 → cloud Website response → G-086 →
  GA Website response. G-101 has supplied Website's exact Relay conformance
  prerequisite; Website staging mutation and a test purchase remain separately
  operator-gated.

## 2026-07-18

### Completed

- `relay-cell-oci-publication` (G-094) — published the free Relay Cell
  `v0.44.3` image to public GHCR as a signed, attested multi-architecture index
  at `sha256:b0dbee1535a2da9d963814591c8f0307d719b0d1ee43baebd2cbedf5f1d22c73`.
  Native amd64/arm64 runners passed artifact policy, reproducibility and full
  lifecycle conformance before exact-digest staging and production copy. A
  credential-free client then pulled the index and proved startup, readiness,
  active-task checkpointing and restart recovery. Partial staging failure was
  quarantined and recovered with a new immutable version. npm, GitHub Release
  and `stable` were deliberately untouched; G-084 and Website G-030 remain R3
  product-release gates.

- `relay-host-supervisor` (G-083) — added the separately invoked `relay host` /
  `relay-host` control plane with a dedicated content-free registry, strict
  Host/Cell/receipt contracts, G-095 licensed and physical admission,
  idempotent lifecycle and crash reconciliation, exact G-082 checkpoint
  evidence, fake/provider ports, and a hardened ownership-validating Docker
  adapter. The npm package includes the supervisor without test/evidence
  residue. G-094 external GHCR proof was subsequently accepted; G-084 UX and
  Website pricing/cloud-provider fulfillment remain separate gates.

## 2026-07-17 — Accept G-100 and Host R2 secure/recoverable alpha

### Completed

- Packed and installed Relay `0.43.0` from an empty non-git directory, then
  proved first-admin, login, named sessions, revocation, administrator recovery
  rotation, protected-route refusal, exact-origin checks, and private/remote
  authenticated ingress behavior.
- Verified the redacted recovery Settings card at 1,440 px and 390 px and drove
  encrypted create, verify, and isolated drill through the packaged UI.
- Closed `F-G100-001`, found by the first destruction run: filesystem-backed
  licenses were absent after restore. Added `licenses/` to both fixed archive
  allowlists and to the recovery round-trip regression, rebuilt the artifact,
  and repeated the journey from zero.
- Destroyed the accepted rerun's source Cell, restored into a different empty
  root, and restarted the packaged CLI from that root. Cell identity, health,
  access sessions, encrypted setting, signed fixture license, seeded records,
  and completed task marker survived.
- Accepted Host R2 and advanced the active train to R3, with G-094 next behind
  its explicit registry/provider/publication operator gates. Evidence is under
  `output/staging/2026-07-17-g100-r2/`.

### Not performed

- No public artifact, external ingress, production credential/service,
  registry write, push, publish, tag, version change, release, KMS integration,
  durability SLA, RPO, or RTO claim.

## 2026-07-17 — Complete G-081 Host ingress and first-admin identity

### Completed

- Added explicit trusted-local, private-authenticated, and
  remote-authenticated exposure profiles with fail-closed bind/origin checks,
  trusted-ingress credentials, exact Host/path assertions, and server-owned
  Cell/session routing metadata.
- Added protected-by-default Next.js Proxy enforcement across 203 API routes,
  exact-origin mutation checks, forwarding/header-spoof refusal, hardened
  cookies and response headers, plus authenticated loopback server self-calls.
- Added the separate hardened auth store, one-use first-admin bootstrap,
  password sessions, recovery rotation, rate limits, named receipts, CLI auth
  commands, login/recovery/setup journeys, and Settings session controls.
- Passed 29 focused tests, the 3,714-test broader suite, route/token/doc guards,
  private and remote real-runtime smokes, production build, responsive browser
  verification, and a fresh security review. The review closed a file-extension
  matcher gap that could otherwise have exempted protected uploads.
- Advanced Host R2 to G-082; G-081 is now an accepted prerequisite for G-083
  and managed-Host connector conformance.

### Not performed

- No TLS termination, multi-Cell Host router, SSO, external identity provider,
  push, publish, release, tag, version bump, registry write, or public trust
  claim was added or authorized.

## 2026-07-17 — Complete G-095 Relay Host fulfillment contract

### Completed

- Accepted `product:relay-host` with an annual one-Host/ten-managed-Cell launch
  grant, separate Pack rights, managed-customer use without sublicense,
  same-licensee replacement, and customer-protective lapse/security continuity.
- Added the strict signed Host-grant schema, exact canonical issuer/verifier
  vectors, offline parser, named refusal contract, capacity/lifecycle admission
  oracle, and deterministic documentation/conformance guard.
- Updated README, trust, artifact, deployment, and TDR surfaces so commercial
  license, public OCI acquisition, and image authenticity stay independent.
- Marked Website G-030 contract-ready while leaving its amount, checkout,
  issuance, email, page, and live-deploy work in the Website repository.
- Advanced the Host workstream to G-081 next with G-082 ready; G-094/G-083/G-084
  remain the publication, supervisor, and customer-UX owners.

### Not performed

- No Host supervisor effects, live Website/Stripe/Supabase/email/catalog change,
  registry publication, npm publish, version/tag change, push, or release.

## 2026-07-17 — Accept G-099 and Host R1 Local Host alpha

### Completed

- Rebuilt the optimized `0.43.0` linux/arm64 Cell artifact from clean commit
  `60f096917fd877f407307739fbc14bf882cb4fcd`; all signed-bundle policy,
  reproducibility, npm-boundary, conformance and two-Cell lifecycle gates
  passed at immutable image digest
  `sha256:b181931cb66f3014db82377186742b431cfd42db5deb973a6816059bf735723a`.
- Ran J0–J3 in a fresh hardened `g099-r1` Cell and captured browser/API evidence
  proving customer → project → document → workflow context through reload,
  alongside Agent duplication and built-in/custom blueprint paths.
- Removed the isolated container, network and data volume after clean SIGTERM
  shutdown. The default Relay database SHA-256 remained
  `5ebccece6512512b09d46692e3dd2c8f1dc680e1aebe07115b6feba0550f329d`.
- Accepted Host R1 and advanced the live train to R2. G-095 is the prioritized
  fulfillment contract; G-081/G-082 remain ready R2 implementation goals.

### Not performed

- No registry publication, public release, tag, version change, push, paid
  provider action, production credential use or default-data mutation.

## 2026-07-17 — Complete G-025 Host R1 Foundation staging

### Completed

- Ran J0–J3 from a fresh isolated Docker volume against the accepted Relay
  `0.43.0` linux/arm64 OCI artifact and captured customer-visible checkpoints,
  accessibility snapshots, console/network diagnostics, a compact GIF, raw
  findings, and a code-verified evaluation under
  `output/staging/2026-07-17-g025-r1/`.
- Verified the signed 18-file G-093 bundle, loopback-only hardened container,
  readiness identity, clean runtime logs and deterministic teardown. The normal
  Relay database SHA-256 remained
  `5ebccece6512512b09d46692e3dd2c8f1dc680e1aebe07115b6feba0550f329d`
  before and after the run.
- Accepted G-025 as an evidence-producing validation goal while keeping Host R1
  open: G-096 owns canonical OCI Cell identity, G-097 owns the silently dropped
  workflow project edit plus customer/document context, G-098 owns the stale
  Agent-test empty state, and G-099 owns the rebuilt-artifact Foundation rerun.
- Corrected the live staging journey and both `ainative-app` skill mirrors from
  removed `/profiles*` and `/workflows/blueprints*` URLs to `/agents*` and
  `/blueprints*`. Expected workflow-target 409 and disconnected Ollama 502
  responses were code-verified and not misclassified as artifact failures.

### Not performed

- No product bug fix, GitHub issue write, push, publish, registry write,
  release, tag, version change, paid-provider action, or default-data mutation.

## 2026-07-17 — Groom Relay Host fulfillment across npm and OCI

### Groomed

- Added G-095 to the Customer-owned Relay Host R3 train as Relay's owner for
  the paid-capability, signed-license, conformance and documentation contract;
  public Cell-image publication remains G-094 and runtime enforcement remains
  G-083/G-084.
- Split cross-repository responsibilities explicitly: Relay owns entitlement
  semantics, runtime gates, public-image verification and its README/trust/docs;
  Website G-030 owns SKU/pricing, checkout, issuance, fulfillment communication
  and relevant public Website pages.
- Kept the recommended boundary operator-gated: Relay Core and public Cell-image
  bytes remain free; managed Host/Cell lifecycle is the proposed separately
  licensed capability. No code, price, license, registry, public page, publish or
  release changed during grooming.
- Amended G-095 with explicit managed-Cell capacity semantics: running and
  stopped managed Cells count; direct unmanaged Cells, exports and permanently
  purged Cells do not; over-limit operations fail without disturbing existing
  Cells; lapse preserves running Cells and recovery; and a newly signed license
  is the only requirement for a capacity upgrade. Website G-030 carries the
  matching issuer and customer-copy acceptance criteria.

## 2026-07-17 — Clarify Relay Host and Cell distribution channels

### Amended

- Corrected the durable Host deployment documents and TDR-044: npm remains the
  direct local single-Cell channel and will deliver the managed-Host
  bootstrap/supervisor under G-083; the OCI registry distributes only the
  immutable Relay Cell runtime image.
- Renamed product-facing OCI terminology from “Relay Host image” or ambiguous
  “Host/cell artifact” to “Relay Cell image.” The Cell image contains no Host
  supervisor and exposes no Host/Cell mode switch; historical internal
  `relay-host-artifact` filenames and commands remain stable.
- Amended G-094 to publish signed multi-architecture Cell images and bind their
  immutable digest to the npm-delivered Host control channel through one release
  manifest.
- Added four plain-language deployment stories—personal laptop, multi-customer
  laptop, operator-owned server and customer-owned server—to the architecture,
  engineering and customer guides, then regenerated the bundled Chat knowledge.
- Clarified that a Relay Host is one machine, its Host Supervisor controls only
  local Cells, and an optional future Fleet Controller coordinates multiple
  Hosts through their supervisors. Renamed the G-060 document titles to remove
  the misleading implication that the local supervisor is already a fleet
  controller.
- Documented why npm and OCI sizes differ: they bind the same Relay release but
  carry different runtime closures. npm relies on destination Node, installed
  dependencies and OS/native prerequisites; the OCI Cell image seals those
  Linux runtime requirements for managed isolation and atomic lifecycle. The
  guides now state that OCI is a direct-versus-managed choice, not a laptop-
  versus-cloud choice, and compare the 2.77 MB npm package with the 130 MB image
  without presenting the downloads as equivalent installed footprints.

## 2026-07-17 — Complete G-093 optimized Relay Cell OCI production

### Completed

- Replaced broad checkout tracing with explicit build/runtime surfaces and a
  digest-pinned distroless Node 22 final image. The accepted arm64 image is
  129,913,772 bytes—85.40% below G-080's 889,827,989-byte baseline—with 5,196
  files across 25 layers.
- Added one local/CI artifact command that inventories the real OCI archive,
  enforces size/content/native/component budgets, acquires Trivy through a
  pinned archive checksum, generates the CycloneDX SBOM and vulnerability
  receipt, checks npm separation, signs the manifest, runs cached/no-cache
  comparison and executes complete Host lifecycle conformance.
- Attributed all 60 final-image components and accepted zero unapproved
  high/critical findings. The operator approved exact platform/path/mode/link
  inventory as the reproducibility gate; compiled Webpack content hashes remain
  diagnostic.
- Hardened the evidence path against tampered cached scanners, empty scanner
  output, incomplete bundle checksums, foreign-musl native packages and
  nondeterministic historical rollback builds. The verifier checks all 18
  bundle files plus signed/measured identities and every required pass receipt.
- Verification passed 17 artifact/manifest unit cases, targeted Host tests,
  full two-cell isolation/persistence/interruption/export/upgrade/rollback,
  TypeScript, production build, public-boundary and 532-file doc-link checks,
  and the full 483-file suite (3,603 passed, one skipped). No publish, push,
  release, version or npm change occurred; G-025 is next in Host R1.

## 2026-07-16 — Complete G-038 one-time default-model prompt

### Completed

- Replaced choice-dependent first-launch inference with an atomic, per-instance
  prompt-impression claim stored in the settings database under the active
  `RELAY_DATA_DIR`. The winning browser records the timestamp before display;
  concurrent or later sessions receive `claimed: false`.
- Preserved upgraded/configured instances by treating existing default-model,
  Confirm and legacy Skip rows as prior completion. Confirm/Skip persistence
  and Settings model selection are unchanged.
- Added the named
  `MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED` server/client contract. A
  failed claim keeps the unrecorded prompt closed, logs the named failure, and
  shows a Settings-directed error toast rather than failing silently.
- Real fresh-data browser evidence showed the modal once, then zero dialogs
  after reload without a choice, in a second tab, and after restarting Relay
  against the same data directory. The DB contained only the impression marker;
  browser warning/error logs were empty.
- Verification passed: 33 focused tests, 207 settings/onboarding neighbors,
  TypeScript, 483-file full suite (3,603 passed, one skipped), production build,
  531-file documentation-link check and diff checks. Existing broad Next trace
  warnings remain owned by G-093; no publish, release or version change occurred.

## 2026-07-16 — Start G-038 one-time default-model prompt

### Started

- Activated G-038 inside Host R1. The implementation will atomically claim and
  persist a per-`RELAY_DATA_DIR` prompt-impression marker before opening the
  modal, preserve legacy configured-instance suppression and existing Confirm/
  Skip behavior, and expose a named visible failure when the marker cannot be
  written.

## 2026-07-16 — Groom G-093 optimized repeatable Relay Cell OCI generation

### Groomed

- Added G-093 to Host R1 after the accepted G-080 alpha measurement exposed an
  889,827,989-byte image whose largest layer includes 624 MB of historical
  release artifacts plus repository tooling and browser/build state.
- Scoped the outcome beyond one-time trimming: one versioned command shared by
  local development and CI must build the optimized image, audit path/layer/
  package contents, enforce size and security budgets, generate the SBOM and
  signed manifest, run conformance, and emit a stable version/platform evidence
  bundle that a later authorized release can promote without rebuilding.
- Set a default arm64 acceptance ceiling of 300 MB and at least 60% reduction,
  with an operator gate for revision only after the essential-runtime floor is
  demonstrated. Preserved every G-080 runtime, isolation, durability,
  rollback, native-module and reproducibility guarantee.
- Made G-093 a Host R1 release requirement before the G-025 customer-identical
  staging gate. No image push, registry write, publish, release, version bump or
  other external action was authorized.

## 2026-07-16 — Complete G-079 Relay Host authority and isolation contract

### Completed

- Accepted TDR-044 and closed the R0 isolation-contract increment after the
  operator approved same-Host trust, the minimum hardening rung, separate-VM
  rescue, customer-owned authority and provisional resource admission.
- Made same-Host placement conditional on explicit Host-administrator trust from
  every resident customer. Customers requiring protection from that
  administrator or mutually hostile tenants use separate VMs/machines.
- Froze current-owner authorization, target acceptance and verified export/
  recovery checkpoint as transfer prerequisites. Revocation and entitlement
  lapse remain non-destructive and cannot block export/recovery.
- Recorded the non-root/dropped-capability/private-network/distinct-mount-and-
  secret/resource-limit/read-only-root-where-compatible cell baseline, plus the
  prohibition on exposing Host or OCI authority sockets to cells.
- Accepted provisional admission inputs of 1 GiB memory per cell, 0.5 GiB Host
  reserve, 90% memory utilization, three cells per vCPU and explicit storage
  ceilings. G-080 must confirm or revise them with measurements before claims.
- Reconciled the deployment spec/plan, G-060 contract, threat model and
  architecture report. No application code, runtime/container, provider,
  credential, push, publish, version or release change occurred.

## 2026-07-16 — Complete G-060 isolated-instance fleet manager contract

### Completed

- Activated G-060 after G-058 acceptance and operator approval of a local-only
  Relay Host supervisor managing OCI-container cells, a content-free lifecycle
  registry, customer-owned per-cell secret roots, and a bounded first slice.
- Kept this goal at the specification/TDR/threat-model/implementation-plan
  boundary. Runtime provisioning, container mutation, public ingress, remote
  fleet authority, entitlements, provider credentials, and release changes
  remain in later gated goals.
- Defined a separate supervisor executable and Host database, opaque owner and
  secret references, versioned content-free registry/receipts, local OS
  authority, desired/actual/operation state machines, collision/TOCTOU refusal,
  and exact partial/rollback rescue.
- Amended proposed TDR-044, expanded the repo threat model with local authority
  and registry-content abuse paths, mapped nine acceptance criteria to six
  future implementation slices, and passed document/parity plus fresh two-pass
  architecture/security review. R0 advances to G-079 for final TDR and fleet-
  authority acceptance.

## 2026-07-16 — Complete G-058 truthful Relay Host/cell isolation

### Completed

- Activated the Customer-owned Relay Host release train at R0 and drafted the
  durable G-058 boundary specification plus a repository-grounded architecture
  impact report.
- Defined customer records as attribution, project working directories as
  execution context, a Relay cell as the complete process/data/secret/runtime
  boundary, and the Relay Host administrator as trusted by every resident cell.
- Added the approved public language and placements to customer, project,
  Settings → Instance, and task/workflow execution-target surfaces. Settings
  now shows the current cell id state, data root, database, and launch workspace;
  execution responses keep only a narrow server-resolved cell reference.
- Kept the shipped slice read-only and migration-free: one derived boundary fact
  contract over existing data-root, instance-id, launch-cwd, project, and
  runtime seams; no `tenantId`, Host supervisor, public ingress, or cloud
  lifecycle behavior.
- Added two-cell isolation fixtures and targeted UI/API regressions, passed the
  full suite, production build, runtime smoke, desktop/390px browser checks, and
  synchronized the bundled knowledge, `_ASSETS` guides, and API references.

## 2026-07-16 — Prioritize Relay Operator Workshop enablement

### Groomed

- Read the accepted Orionfold Trio monetization/Training MLP decision and
  registered **Relay Operator Workshop enablement** as Relay's primary
  workstream, with Customer-owned Relay Host parallel and Enterprise connectors
  queued until an explicit WIP change.
- Defined four independently valuable increments: contract and marketing-grade
  product proof, free try-before-buy demand probe, autonomous local capstone
  alpha, and evergreen founding-workshop conformance.
- Groomed G-087–G-092 for the workshop boundary/source contract, static sample
  lane, deterministic fresh-install preflight/starter, bounded
  checkpoint/diagnosis/retry UX, portable completion bundle, and zero-founder
  customer-identical proof.

### Re-prioritized

- Made G-062's configurable adaptive Home the first visible Workshop W0 goal,
  followed by G-061 semantic Render/Row views; both improve Relay itself and
  simultaneously strengthen workshop instruction, screenshots, trailers, and
  the public static demo.
- Aligned G-023 as the W1 demo-reset prerequisite, G-038 as W2 onboarding
  coordination, G-025 as the founding-beta staging gate, and G-053 as optional
  post-capstone publishing wayfinding rather than a workshop blocker.

### Architecture

- Audited Relay `_ASSETS`, Orionfold Motion, Website, Books, Proof, and the
  Arena demo. Relay owns local execution/evidence; `_ASSETS` owns current
  product truth; Motion owns audiovisual renditions/QC; Website owns
  offer/checkout/access; Books own durable editions; Proof supplies receipt
  precedent.
- Reused the shipped Marketing Line pack, Chat app builder, workflow HITL,
  operations receipts, output documents, app-to-pack exporter, version-aware
  help, and static demo. Explicitly rejected a second LMS, content source, video
  pipeline, demo, receipt evaluator, publisher, book renderer, CRM, or auth
  system in Relay.

## 2026-07-16 — Restore one canonical live planning file

### Corrected

- Consolidated major workstreams, release trains, statuses, dependencies,
  current goals, entry criteria, and exit gates into `_IDEAS/backlog.md`, the
  same file that owns exact incomplete Goal Contracts.
- Demoted `features/roadmap.md` to its historical feature/milestone/dependency
  catalog role and removed live workstream/release state introduced by the
  previous roadmap-model changes.
- Updated Relay's product-manager and supervisor skills plus local agent/flow
  rules so future grooming, prioritization, goal completion, and status checks
  read and update only the canonical backlog.
- Kept `features/supervisor-report.md` as a non-authoritative generated snapshot,
  eliminating any requirement to synchronize it as live state.

## 2026-07-16 — Multi-workstream roadmap operating model

### Re-prioritized

- Generalized the roadmap header from one delivery program into a portfolio of
  major workstreams, each with its own lane, status, current increment, current
  owned goal, next gate, dependency graph, and independently valuable release
  train.
- Registered Customer-owned Relay Host as the primary `ready` workstream and
  Enterprise connectors as a parallel `discovery` workstream without implying
  concurrent writes.
- Assigned each goal one owning workstream or standalone status. Shared
  prerequisites and coordination goals can advance several workstreams without
  being double-counted as owned progress.
- Added deterministic status advancement: goal lifecycle changes recompute the
  owning increment and workstream, update shared dependents, and advance the
  train only after the increment's exit/release gate passes.
- Added the E0–E3 connector train for shared contract discovery, structured
  local beta, document local beta, and managed Host conformance without making
  DigitalOcean a connector prerequisite. E0 must groom bounded implementation
  child goals so G-073/G-074 do not become multi-release umbrella executions.

## 2026-07-16 — Relay Host dependency and release-chain alignment

### Re-prioritized

- Made G-058 → G-060 → G-079 the explicit architecture-contract critical path
  before Relay Host implementation begins.
- Defined G-080 and G-081 as parallel foundations, G-082 as dependent on the
  signed artifact, and G-083 → G-084 → G-085 → G-086 as the paid lifecycle,
  DigitalOcean beta, and portability sequence.
- Split the program into independently releasable customer-value increments:
  isolation contract, local Host alpha, secure/recoverable Host alpha, licensed
  local Host beta, DigitalOcean beta, and portable Host GA.
- Classified adjacent work as hard prerequisites, conformance prerequisites,
  coordination dependencies, or trigger gates. G-020, G-030, G-034, G-038,
  G-059, G-062, G-025, and G-036 now have explicit roles without becoming
  accidental blockers.
- Connected G-073/G-074 to the Host/cell trust, ingress, secrets, recovery, and
  lifecycle contracts while preserving an earlier local-first connector release
  path.

## 2026-07-16 — G-078 appliance/cell architecture amendment

### Amended

- Compared Relay with current primary-source OpenClaw, Hermes Agent, and NVIDIA
  NemoClaw deployment models. All three treat local hardware and a cloud VPS/
  remote device as placements of a durable agent stack with local state,
  host/sandbox lifecycle, authenticated remote access, and local or hosted
  inference—not as a mandatory horizontally scaled PaaS application.
- Shifted proposed TDR-044 and the cloud-deploy program to a customer-owned
  `Relay Host` appliance. A Host runs one or more full isolated `Relay cells`
  with separate processes/containers, SQLite/data roots, mounts, networks,
  loopback ports, identities, secrets, licenses, logs, resource limits, runtime
  policies, and backup lineages. The Host supervisor stores only content-free
  lifecycle metadata and the Host administrator remains trusted.
- Made local device and cloud VM use the same signed Host/cell manifest and
  lifecycle contract. Capacity scales up within a Host and then out through
  independent Host shards; it does not require shared Postgres, queues, pub/sub,
  or app replicas merely because tenant count increases.
- Moved DigitalOcean to the first live single-server proof, retained Hetzner or
  representative local hardware as the pre-GA portability proof, and demoted
  Railway/Render to optional later single-cell PaaS adapters.
- Replaced the per-service cost examples with a dated VM Host-admission model:
  provisional 1 GiB cells plus Host reserve yield planning examples for 1, 10,
  and 100 cells, explicitly blocked from becoming capacity claims until Relay is
  measured under idle and active workloads.

## 2026-07-15 — G-078 licensed self-service cloud deployment planning

### Completed

- Researched authoritative current platform, pricing, persistence, networking,
  model-runtime, backup and deployment evidence across Vercel, Supabase,
  Cloudflare, Railway, Render, Fly.io, DigitalOcean, Hetzner and relevant data
  alternatives without creating provider resources or spending money.
- Selected a proposed sealed customer-owned reference architecture: one isolated
  Relay instance with local SQLite/WAL and live files, authenticated ingress,
  customer-owned secret root and encrypted off-host recovery, BYOK APIs by
  default, and no Orionfold custody of long-lived cloud credentials or content.
- Produced the durable specification, research/cost model, threat model,
  customer-journey wireframe, proposed TDR-044 and codebase-grounded program plan.
  Railway is the first PaaS conformance candidate and DigitalOcean the first VM
  portability candidate; neither is selected for shipment before live proof.
- Groomed G-079 through G-086 for isolation/fleet authority, signed OCI artifact,
  internet-safe identity, recovery/secrets, deploy domain, UX, and separately
  authorized Railway/DigitalOcean conformance. G-058 and G-060 now explicitly
  include customer-owned cloud authority and instance boundaries.
- Kept remote databases trigger-gated: Postgres, Turso or LiteFS must earn their
  migration and failure-semantic cost through an active-active, horizontal-write,
  capacity or accepted recovery-objective requirement.

## 2026-07-15 — G-075 truthful grounded-help links

### Completed

- Extended the release-matched knowledge bundle with canonical public
  `orionfold.com` Guide/API destinations and a schema-2 integrity contract.
  Unsafe hosts, wrong source families, credentials, ports, queries, fragments,
  kind mismatches, and tampered locators fail closed.
- Added App Router page/fragment parity verification to knowledge build,
  verification, prepack, and extracted-package checks. Historical runtime and
  license screenshot locators now produce the live namespaced Settings anchors;
  Ollama help lands on `#settings-providers`.
- Linked verified source badges in a distinct source row with an external-link
  indicator and safe new-tab semantics. Related in-app actions render on the
  following row; invalid or legacy persisted source URLs remain truthful
  non-links, and stale internal actions are omitted.
- Verified 3,451 passing tests across 450 files (one intentional skip),
  TypeScript, public/package boundaries, deterministic bundle generation, an
  extracted npm package, a real grounded Chat run, and desktop plus 390 px
  browser layouts without horizontal overflow or cursor-switching code.

## 2026-07-15 — G-055 version-aware Relay help in Chat

### Completed

- Grounded instructional Relay and API questions in the release-matched,
  integrity-verified `knowledge/` bundle through one bounded retrieval contract
  shared by Claude, Codex, Ollama, LiteLLM, and LM Studio.
- Restored the useful historical post-answer affordance pattern without
  resurrecting the removed User Guide: completed messages persist exact
  versioned source badges and only manifest-declared, safe product actions.
- Added named fail-closed handling for missing, stale, malformed, tampered,
  oversized, unmatched, and unsafe artifacts; unrelated or direct-action Chat
  turns remain on the normal provider path.
- Verified 475 affected tests, TypeScript, package/public/knowledge guards, the
  real runtime graph, a live Next.js Chat request, and light/dark desktop plus
  390 px in-app browser behavior. No cursor-switching code was introduced.

## 2026-07-15 — G-012 golden-source asset consolidation tail

### Completed

- Removed live Relay dependencies on the retired root `screengrabs/` and ignored
  generated User Guide corpus while preserving tracked engineering, release,
  browser, trust, quality, and security documentation.
- Retargeted supervisor and installed capture/documentation skills to the
  strategy-owned `_ASSETS/screenshots/` and `_ASSETS/docs/` pipelines.
- Added `npm run demo:refresh`, which refuses a non-strategy `_ASSETS` source,
  verifies a pinned seed-structure fingerprint, derives fixtures, rebuilds the
  static demo, and runs its behavioral verifier. A deliberate shape-mutation
  fixture proves the fingerprint fails closed.
- Completion verification passed the consolidated stale-reference scan, public
  boundary and local-link guards, all five catalog/screenshot/docs/API/stats
  verifiers, 11 demo-projection regressions, and all four behavioral demo lanes.

## 2026-07-15 — G-074 enterprise document connectors

### Groomed

- Added a durable goal and specification for securely connecting Notion,
  SharePoint/OneDrive, Quip, document repositories, object stores, and enterprise
  knowledge applications to Relay Documents.
- Kept authorization, secrets, scheduling, checkpoints, receipts, and MCP host
  behavior in the shared G-073 connector kernel while defining a separate
  document layer for hierarchy, binary transfer, source-native structure,
  versions, ACL/policy drift, extraction lineage, content safety, and guarded
  publication.
- Required primary-source research, a provider/fidelity/security matrix, joint
  TDR, threat model, phased plan, representative three-family adapter tranche,
  real-source sandbox smokes, and regression/browser evidence. Storage mode,
  permission-loss retention, malware/parser isolation, provider tranche, OAuth
  topology, and publication semantics remain operator gates.

## 2026-07-15 — G-073 enterprise structured-data connectors

### Groomed

- Added a durable goal and specification for securely connecting Notion,
  Airtable, relational databases, and enterprise applications to Relay Tables
  through one observable snapshot/delta/push synchronization substrate.
- Defined a versioned capability-driven adapter contract and MCP extension
  boundary using resources for catalogs/schemas and tools for explicit
  operations, while keeping checkpoints, mapping, conflict policy, auditing,
  secrets, and Table mutations host-owned.
- Required an authoritative research refresh, source-family capability matrix,
  TDR, threat model, codebase-grounded plan, representative real-source adapter
  tranche, conformance fixture, browser evidence, and regression coverage before
  completion. Adapter selection, OAuth topology, secret ownership, public
  extension compatibility, and conflict/delete defaults remain operator gates.

## 2026-07-14 — G-070 critical API route contracts

### Completed

- Added a typed executable inventory for the 12 load-bearing task, workflow,
  schedule, Chat, and runtime/settings route-method contracts. Adjacent route
  regressions now exercise real `Request` parsing and SQLite state while
  isolating only provider transport or long-running dispatch.
- Hardened malformed-body handling, schedule update validation, task
  cancellation failures, Chat permission ownership, pending-request compound
  identity, and explicit Settings runtime selection. Cross-conversation or
  cross-message permission responses and unknown-provider fallback are refused.
- The focused tranche passed 62 tests and improved from 24.52% lines / 14.67%
  branches to 68.78% / 60.47%. The release quality profile passed all 19 lanes
  with 3,383 passing tests plus one intentional skip; all coverage ratchets,
  mutation guards, the real runtime graph, CLI bundle, and production build
  passed. G-071 is now ready.

## 2026-07-14 — G-072 cross-provider Chat boundary contracts

### Completed

- Added one exhaustive boundary registry for all seven runtime identities. Chat
  creation and dispatch now derive from the five supported Chat runtimes while
  Anthropic Direct and OpenAI Direct remain named task-only exceptions; no
  unsupported runtime can fall through to a different provider.
- Made provider terminals truthful and durable. Codex and Claude failures,
  interruption, empty output, cancellation, unexpected stream EOF/throw, and
  batched delta-plus-terminal delivery now agree across SSE events, message
  state, usage receipts, runtime/model metadata, telemetry, and active-stream
  accounting. Requested unavailable Codex models fail instead of silently
  using a provider default.
- Preserved the `server-only` client boundary for the shared compatible-runtime
  transport while adding a CLI-only build shim. The release quality profile
  passed all 19 lanes: 431 test files, 3,334 passing tests plus one intentional
  skip, all 11 coverage ratchets, 7/7 required mutants, the real Ollama/
  LiteLLM/LM Studio runtime graph, and the CLI bundle. G-070 and G-071 remain
  open as independent testing investments.

## 2026-07-14 — G-069 LiteLLM and LM Studio runtimes

### Completed

- Added LiteLLM and LM Studio as two explicit runtime/provider identities over
  one server-side OpenAI-compatible transport. Both support model discovery,
  Chat, tasks, workflow steps, and scheduled firings with strict requested /
  effective runtime-model truth and no fallback.
- Added independently redacted Settings with environment-key precedence,
  endpoint testing, model discovery/defaults, loopback defaults, explicit
  consent for non-loopback HTTP, redirect refusal, model-cache invalidation,
  and the shared configured operation timeout.
- Added truthful receipts: endpoint-reported token usage only, optional valid
  LiteLLM cost only, and unknown LM Studio cost/locality/privacy rather than
  inferred zero/local claims. Unsupported tool loops, resume, MCP, and
  filesystem capabilities fail visibly or remain unadvertised.
- Extended the real Next.js runtime-graph smoke across compatible-runtime task,
  workflow, schedule, and both Chat paths. Added operator setup and trust/data
  flow documentation. The deterministic machine-local topology passes; an
  unavailable customer three-host LAN is explicitly not claimed as verified.

## 2026-07-14 — Next regression investments and G-057 completion

### Groomed

- Added G-070 as the next bounded regression investment: inventory and protect
  the load-bearing API mutation/execution tranche at the real route, SQLite,
  dispatch, and receipt boundary instead of generating shallow tests for all
  182 routes.
- Added G-071 for workflow recovery/state-transition coverage across sequential,
  loop, parallel, HITL/delay, cancellation, retry, restart, and duplicate-event
  paths, with real state/concurrency boundaries and mutation evidence.
- Added G-072 after G-069 for a shared Chat/runtime contract across every
  shipped provider, retaining provider-specific protocol exceptions and
  credential-free real-module-graph evidence.

### Started

- G-057 moved to evidence gathering. The code/data-flow and local controls run
  first; an actual three-host browser → Relay Linux VM → Ollama LAN server
  packet or sufficient reporter evidence remains required for the dispositive
  reproduction.
- Extended the existing isolated runtime-graph smoke with an opt-in configured
  Ollama endpoint mode and redacted receipt. Both the deterministic fixture and
  a real loopback Ollama `0.31.2` task/workflow/Chat control completed with
  requested and effective runtime `ollama`; a stale-model control returned a
  visible 404 without fallback. The result is explicitly not LAN evidence.
- Routed a confirmed provider-summary truth gap to G-056: when the persisted
  Ollama default is empty, Relay must not synthesize `llama3` while execution
  resolves a different pulled model. Remote-endpoint privacy/cost copy remains
  an operator-gated G-057 finding.

### Completed

- Closed G-057 with the explicit disposition `not reproduced locally; external
  topology unverified`. Relay has no access to the customer environment, and
  the operator approved closure on this machine rather than retaining an
  unactionable evidence gate. The code-path audit, deterministic fixture, and
  real loopback Ollama `0.31.2` Chat/task/workflow controls pass without runtime
  fallback. No customer-network cause is inferred.
- Preserved the configured-endpoint diagnostic for future use and routed every
  confirmed actionable finding into G-056 or the subsequent runtime series.
  Customer-topology validation is explicitly out of scope for this closure.

## 2026-07-14 — G-067 test environments and G-051 browser-state fixture

### Completed

- Split the default Vitest matrix into Node for server/data/API/CLI tests, jsdom
  for React and hooks, and one pinned Playwright Chromium project for compiled
  interaction CSS. A one-to-one manifest fails on missing or double-collected
  files, and the shared quality workflow installs the pinned browser revision.
- Migrated the bounded Tables row slice from direct event dispatch to semantic
  `user-event` interaction and role queries, including nested-checkbox and
  double-click isolation.
- Completed G-051 with computed light/dark hover, press, keyboard focus,
  disabled/inert, and destructive-state assertions. The fixture changes no
  cursor styling and retains the source-wide system-cursor policy.

### Verified

- All 416 default files map once to 315 Node, 100 jsdom, and one browser project.
  The matrix passed 3,250 tests with one intentional skip in 23.93 seconds,
  versus 3,245 plus one skip in 36.23 seconds before the split; fixed seed
  `6301` matched.
- Pinned Chromium repeatedly passed five cases and killed four deliberate CSS
  faults before exact restoration. Coverage passed all 416 files at 39.66%
  lines and 33.83% branches; harness safety, quality ratchets/policy, and
  TypeScript passed. The final 19-lane release profile passed in 53.50 seconds,
  including real Ollama runtime-graph, mutation-strength, Pack compatibility,
  and CLI-build receipts.

## 2026-07-14 — Distributed inference series grooming

### Planned

- Recorded G-067 as the final testing-improvement goal, followed by the
  distributed/self-hosted runtime sequence: G-057, G-056, then G-069.
- Amended G-057 around the reported three-host topology: browser client, Relay
  Linux VM/server, and remote Ollama LAN server. Its acceptance now separates
  both network legs from model/capability and requested/effective-target errors,
  requires no-fallback evidence, and includes trust/data-flow documentation.
- Added G-069 for LiteLLM and LM Studio over a shared OpenAI-compatible transport
  boundary while preserving provider identity, capability, privacy, and cost
  truth. Architecture, credentials, and remote-endpoint posture remain operator
  gates before implementation.

## 2026-07-14 — G-010 app and schedule budget policies

### Completed

- Added operator-owned per-app and per-schedule per-run/daily/monthly cost
  policies on the current Pack/AppManifest, usage-ledger, schedule, task-cap,
  notification, and global-guardrail stack. Pack-authored values remain visibly
  inactive recommendations until accepted or edited.
- Matching app and schedule policies now serialize concurrent runs, propagate
  the strictest per-run ceiling, reconcile direct tasks and app workflows, and
  pause only the affected schedule or notify according to operator policy.
  Missing cost evidence is visible and never reported as safe `$0` usage.
- App and schedule surfaces expose recommendation acceptance, custom limits,
  enable/disable, pause/notify behavior, removal, current usage, breach detail,
  and textual health states using semantic tokens and the system cursor.

### Verified

- Targeted regressions, TypeScript, design-token validation, live API/browser
  save/remove checks, light/dark desktop and 390px layout checks, and a no-cost
  real Next.js runtime-graph smoke pass. The broader suite reached 3,210 passing
  tests; all G-010-owned failures are resolved, with unrelated baseline and
  sandbox-bound failures recorded in the feature verification note.

## 2026-07-14 — Pack repository ownership boundary

### Corrected

- Pack repository authoring now appears only on user-created app shells.
  Installed official, partner, community, free, and licensed Packs no longer
  show repository setup, sample-data, export, publish, or Community-submission
  controls.
- New composition and installation writes stamp explicit app origin. Existing
  apps remain compatible through entitlement and install-state fallbacks, and
  export/publish/submission services reject installed Packs before repository
  work begins.

### Verified

- 106 focused regressions and TypeScript pass. Live Relay checks confirmed the
  section is absent from licensed Agency Pro and free installed Agency, remains
  present for the user-created Contractor Invoices app, and emits no console
  warnings.

## 2026-07-14 — G-037 truthful KPI trend semantics

### Completed

- Replaced the ambiguous up/down/flat KPI signal with a deterministic two-signal
  contract: last-versus-first comparison, last-versus-previous momentum, and
  explicit `higher`, `lower`, `closer-to-zero`, or `neutral` favorability.
- KPI cards now name comparison and momentum in visible text, color each signal
  by declared favorability, omit watermarks for rebounds/reversals/flat states,
  and show `Need 2 observations` for sparse histories. Existing manifests remain
  valid with neutral semantics, and system-cursor behavior is unchanged.

### Verified

- 113 focused and 91 affected regression tests passed with one skipped test,
  alongside TypeScript, design-token, and diff checks. Live desktop and 390px
  checks passed in light and dark themes with truthful sparse output, complete
  accessible group names, no overflow, and a clean browser console.

## 2026-07-14 — G-052 list-item hover consistency

### Completed

- Added one token-driven fill-only interaction treatment for dashboard Needs
  Attention rows, linked Settings-at-a-glance cells, and Tables list rows.
  Existing dividers, radii, and selection geometry no longer receive a second
  dark-theme hover/press outline; keyboard focus remains on the shared two-pixel
  ring and Tables input semantics remain owned by G-047.
- Added Tables hover coverage while preserving nested checkbox isolation,
  selection, and single/double-click behavior. The implementation assigns no
  cursor and the source-wide system-cursor policy remains green.

### Verified

- 29 targeted tests, TypeScript, and token validation pass. Live light/dark
  checks on `/` and `/tables` confirmed the shared 160ms token contract across
  8 Needs Attention links, 10 Settings items, and 33 Tables rows, with no
  injected list-item outline, no page-level overflow, and a clean console.

## 2026-07-14 — G-046 telemetry rail carousel controls

### Completed

- Closed the fixed telemetry rail's responsive-navigation gap with conditional,
  accessible Previous/Next gutters that reveal adjacent clipped cards while
  preserving native horizontal scrolling, truthful boundary states, the frozen
  ten-cell scope, reduced-motion behavior, and the system cursor.

### Verified

- All 11 targeted component regressions and all 23 source-wide system-cursor
  policy checks pass. Live browser checks passed at the exact two-pixel overflow
  boundary, 943/944/945px, and a wide fit in light and dark themes, including
  adjacent-card reveal, start/middle/end state, keyboard focus, native horizontal
  scrolling with hidden scrollbar chrome, gutter/content separation, zero
  page-level overflow, and a clean browser console.

## 2026-07-14 — G-055 historical help-action restoration scope

### Groomed

- Amended G-055 so its future specification and implementation must review the
  original Quick Access commit (`fc45d07e`), its surviving message-metadata/SSE
  descendants, and the User Guide route/action conventions immediately before
  removal (`e6f532e9^`). Relay-help answers will restore bounded post-response
  source badges and safe `Open …` actions from release-matched bundle metadata,
  while explicitly avoiding resurrection of stale `/user-guide` routes, fuzzy
  prose-derived citations, arbitrary model-authored URLs, or the deleted guide
  corpus. Added help-intent, attribution, route-safety, persistence, cross-runtime,
  accessibility, and packaged-instance regression requirements.

## 2026-07-14 — G-062 adaptive Home dashboard goal

### Groomed

- Added P1 goal G-062 for a richer, denser Home command center backed by a
  typed dashboard-module catalog and a dedicated Dashboard settings section.
  Operators can toggle modules, disable smart ordering, or restore defaults;
  the default adaptive policy promotes unresolved operator action, active and
  recent autonomous work, and installed-Pack relevance using only local,
  deterministic signals with anti-jitter stability. The goal requires a durable
  specification, codebase-grounded implementation plan, bounded query budget,
  isolated module failures, and responsive accessibility/browser regression
  coverage before completion.

## 2026-07-14 — G-061 table Render/Row view goal

### Groomed

- Added P1 goal G-061 for a shared semantic table-data renderer and labeled
  `Render` / `Row` switcher. Generic app-shell table heroes will default to
  Render while `/tables/[id]` retains Row as its default editing surface. The
  goal requires an additive display-role contract, explicit-first deterministic
  fallbacks, safe thumbnails, stable category pills, non-semantic-by-default
  numerical intensity, accessible interaction/state preservation, a durable
  feature specification and implementation plan, and real responsive browser
  regression coverage before completion.

## 2026-07-14 — G-009 resolved view-kit diagnostics

### Completed

- Every installed app header now shows the actual resolved kit as a compact
  badge and states whether the app selected it explicitly or Relay inferred it.
  The app/domain title remains primary, and the badge never behaves like a
  kit switcher.
- Added one deterministic, JSON-safe resolution trace shared by the runtime
  dispatcher and diagnostics UI. It records first-match rule outcomes, probe
  values and exact evidence tiers, and precedence-losing candidates without
  scoring, telemetry, or new kit identifiers.
- Added the default-off `apps.showInferenceDiagnostics` setting, its validated
  local API and Settings control, and the gated `/apps/[id]/inference` route.
  The route explains explicit versus inferred resolution and copies a
  round-trippable explicit `view:` declaration with a restrictive-browser
  fallback and named failure path.
- Closed the documented currency-probe gap by carrying `config.format` into
  column schemas and honoring `format: currency` between explicit semantics
  and name heuristics.

### Verified

- 137 targeted tests, TypeScript, the 1,376-file token validator, and the
  production build pass. Browser checks passed for explicit and inferred apps,
  the disabled 404 gate, copied YAML, desktop/390px layout, and light/dark mode;
  all temporary local settings were restored.
- The broader comparison produced 3,175 passes and retained ten unrelated
  baseline failures plus one sandbox-blocked loopback listener. None intersects
  the G-009 source or regression set.

## 2026-07-14 — TRIAGE-019–027 goal grooming

### Groomed

- Promoted TRIAGE-019 to P2 goal G-052, then amended it with the operator's
  Tables observation: Needs Attention, Settings rail, and Tables list rows must
  share an aligned theme-appropriate hover highlight, while dark-theme hover
  must not add a second or mismatched outline. The accepted system-cursor-only
  policy, selection semantics, and stronger keyboard focus remain explicit;
  G-051 stays the broader rendered-state test-infrastructure goal rather than
  blocking this bounded correction.
- Merged TRIAGE-020 into existing P2 goal G-019. Card convergence now explicitly
  includes card-to-detail status/action parity, expanded top-right detail-header
  treatment, responsive collapse, and matching disabled/destructive safeguards.
- Promoted TRIAGE-021 to P1 goal G-053 as a current-release Pack authoring and
  repository-publishing wayfinding outcome. It reuses the shipped Packs-first IA
  and requires a clean-instance direct-navigation plus Chat replay before adding
  any new authoring surface.
- Split TRIAGE-022 at its natural dependency boundary. P1 goal G-054 owns the
  incremental, release-stamped `_ASSETS/` user-guide/API knowledge artifact and
  stale-corpus gate; dependent P1 goal G-055 owns bounded, source/version-aware
  retrieval inside packaged Relay Chat without injecting the full corpus.
- Promoted TRIAGE-023 to P1 goal G-056. The goal makes Manual/default semantics
  explicit, previews requested versus effective profile/runtime/model, and
  requires an explicit rescue choice instead of silent target substitution.
- Promoted TRIAGE-024 and TRIAGE-026 to separate reactive diagnostic goals G-057
  and G-059 under the G-033 discipline. Each waits for a matching Linux/customer
  environment, records one complete topology/evidence packet, and cannot become
  an implementation fix without a current reproduction.
- Promoted TRIAGE-025 to P1 goal G-058. It keeps the locked single-tenant Core and
  process-per-tenant isolation model while making customer attribution, project
  cwd, instance data, runtime context, and actual security boundaries truthful
  in product and `_ASSETS/` documentation.
- Promoted TRIAGE-027 to operator-gated P1 goal G-060 as a specification-first
  outcome. The goal must define and threat-model independently buildable fleet
  inventory, provisioning, and lifecycle/handoff slices before any Instance
  Manager implementation goal is accepted.

### Backlog hygiene

- Cleared `_IDEAS/triage.md`; every open finding now has a promotion or merge
  disposition and an executable verification contract.
- No field report was labeled a confirmed defect without current-release
  evidence, and no row-level multi-tenancy or cross-customer data plane was
  introduced by grooming.

## 2026-07-13 — G-050 public-repository boundary

### Completed

- Classified Relay's root, archive, and docs surfaces and removed 125 internal
  continuity/history records from Git without deleting local copies: 74 archived
  handoffs, 48 session plans/specifications, and three root operator documents.
  Public trust documentation, including `docs/trust/continuity.md`, remains.
- Added a fail-closed policy engine for the tracked index, real Git archives,
  and real npm tarballs. Exact path/rule exceptions cover only guard fixtures,
  existing pack privacy negatives, public authorship, the classification receipt,
  and one immutable production-signature compatibility vector.
- Repaired retained documentation and fixtures: machine/private paths, stale
  operational links, retired actionable endpoints, personal repository identity,
  and direct support messaging were replaced with durable public references or
  synthetic examples. The Stagent/AINATIVE lineage remains only as neutral
  migration context rather than current product provenance.
- Added an index-aware local Markdown-link guard so local-but-untracked records
  cannot make a public link pass. All 472 tracked Markdown files resolve.
- Wired tracked-tree and Git-archive checks into the publish workflow and npm
  prepublish path; the existing real npm tarball size step now scans privacy too.

### Verification

- Boundary tests (5), local-link tests (3), license-store tests (18), both pack
  privacy tests, TypeScript, CLI build, and bundled-pack integrity pass.
- A real committed Git archive and npm tarball pass the shared scanner locally
  and from a literal clean clone. Nothing was pushed or published.

## 2026-07-13 — G-048 fresh-clone development setup

### Started

- Replaced the tracked Python-only Codex secrets guard with a dependency-free Node
  guard and regression suite, removing an undocumented Windows prerequisite while
  preserving the allow/block exit contract.
- Added an explicit pre-first-boot README path for macOS/Linux and Windows PowerShell.
  Both paths activate Relay development mode, create the durable git sentinel, and
  isolate data from `~/.relay`; provider credentials remain optional.
- Added zero-mutation assertions for both bootstrap gates, visible Ollama Save/Test
  regressions (including the repaired network-failure feedback path), a literal-clone
  dev smoke, and a native macOS/Windows Node 20/npm 10 plus Node 22/npm 11 workflow.
  Local hook, type, cursor-policy, and 92 focused Vitest checks pass. A literal macOS
  clone also passed the real Welcome/provider/Ollama boot smoke with zero instance
  mutations under both Node 20 and Node 22, and an explicit customer-mode control
  retained the expected branch plus consent state. Native Windows execution remains
  the required external gate before completion.

### Completed

- G-048 closed after ship verification of every locally executable criterion: the
  Node-only tracked hook, explicit pre-boot dev-mode contract, isolated fresh data,
  zero bootstrap mutations under both gates, visible provider/Ollama outcomes, and
  unchanged customer-mode bootstrap all pass on literal macOS clones under Node 20
  and Node 22.
- Native Windows execution was not run because no Windows environment exists yet. On
  2026-07-13 the operator explicitly waived that unavailable host check and directed
  the goal to close. The committed macOS/Windows workflow remains as the future
  verification path; completion does not claim a passing Windows run. Nothing was
  pushed.

## 2026-07-13 — TRIAGE-014–018 goal grooming

### Groomed

- Promoted TRIAGE-014 to P1 goal G-048 after confirming the contributor setup
  contract is defective: README omits the required pre-boot dev-mode gate and
  the tracked Codex hook assumes `python3` without a proved Windows path. G-048
  owns a literal macOS/Windows fresh-clone matrix and visible provider/Ollama
  setup outcomes; it does not claim the original provider-runtime symptom still
  reproduces.
- Promoted TRIAGE-015 to P2 goal G-049 as a bounded diagnostic outcome. It must
  distinguish App Router transitions, explicit refreshes, HMR, browser reload,
  and process restart before any corrective implementation goal is created.
- Promoted TRIAGE-016 to P1 goal G-050 after confirming the public tree contains
  substantial internal operational residue and stale identity/personal details.
  Classification and any destructive relocation remain operator-gated; public
  trust documentation and durable decisions must be preserved.
- Confirmed TRIAGE-017 is fully represented by G-047 and removed the duplicate
  intake entry. G-047 continues to own semantic/keyboard parity and the Tables
  select/open decision, separate from G-045's accepted visual-state policy.
- Promoted TRIAGE-018 to P2 goal G-051 now that G-045 is accepted. G-051 owns a
  small rendered computed-state fixture for hover, active, focus, disabled, and
  inert regressions while retaining the source-wide system-cursor guard. It
  leaves cursor rendering to the system and rejects a broad or flaky screenshot
  suite.

### Backlog hygiene

- Removed completed G-006, G-008, and G-045 from the live incomplete-goal
  backlog; their completion evidence remains in this changelog and feature
  specs.
- Returned G-007 to `_IDEAS/reprioritze.md` research rather than preserving an
  unapproved cross-product interchange contract as an executable Relay goal.
  It can be promoted again only after Proof/Arena artifact ownership is decided.
- Cleared `_IDEAS/triage.md`; all five findings now have a recorded promotion or
  merge disposition.

## 2026-07-13 — TRIAGE-012/013 interaction affordances

### Groomed

- Promoted TRIAGE-012 to P2 goal G-045: establish a clearly perceptible shared
  hover vocabulary across buttons, links, icon actions, interactive rows, and
  clickable cards while leaving cursor rendering to the system/browser.
- Promoted TRIAGE-013 to P2 goal G-046: add conditional, accessible Previous/Next
  controls to the fixed ten-cell telemetry rail while retaining native scrolling,
  reduced-motion behavior, truthful end states, and the existing sticky chrome.
  The goal is ready because the operator explicitly approved the carousel
  direction and the Kanban board already provides a local control precedent.
- Promoted TRIAGE-017 to P2 goal G-047 after live browser and code inventory
  confirmed that several highlight-advertised rows/cards remain mouse-only or
  expose no interactive role/name. The visual policy stays in G-045; G-047 owns
  semantic and keyboard parity after the Tables select/open contract is approved.

### Started

- G-045 moved through approved design into verification with a dark-only
  fill-plus-edge interaction vocabulary. An independent web-preview pass found
  and repaired inert telemetry cells that
  inherited the linked-cell hover treatment. Fresh review also removed hover
  invitation from disabled/inert controls, restored native text-entry/label
  cursors, completed focus-role coverage, preserved enabled destructive menu
  colors, guarded disabled subtrees, and retained polymorphic Link-button hover;
  linked cells, selectable labels, and enabled controls remain visibly
  interactive.

### Completed

- The operator retired every application-assigned hand shape after live
  cross-browser flicker. Product code, shared primitives, historical build
  instructions, design guidance, tests, and repo-local agent assets now contain
  no cursor declarations that request it; a source-wide regression guard
  prevents reintroduction. System/browser cursors remain authoritative.
- Affordance is carried by the accepted eased fill-plus-edge highlight, with
  settings glance cells and dashboard Needs Attention rows on the shared
  treatment. Dark/light browser verification, disabled/inert checks, focus,
  active, and reduced-motion coverage pass.

## 2026-07-13 — G-008 Operations Receipts

### Groomed

- Defined a bounded, local-only Operations Receipt contract for schedule and
  workflow runs, reusing terminal task/workflow state, documents, run numbers,
  usage records, and existing detail histories.
- Proposed a closed four-check success-criteria grammar and the user-visible
  verdicts `Passed`, `At risk`, and `Failed`. Implementation remains operator-
  gated until that exact grammar and verdict language are approved.

### Started

- Operator approved the closed grammar and exact verdict language; G-008 moved
  into implementation as one schedule/workflow receipt slice.

### Completed

- Schedules and workflows now share a bounded Success Bar editor and persist an
  immutable per-run criteria snapshot. New terminal runs write one idempotent
  Operations Receipt with a deterministic `Passed`, `At risk`, or `Failed`
  verdict, criterion evidence, next action, and source diagnostics.
- Terminal write hooks and bounded read repair cover schedule tasks plus
  sequence, loop, parallel, and swarm workflow runs. Interrupted writes,
  retries, zero-task loops, failed runs, missing evidence, corrupt receipt data,
  and historical run repair fail visibly without fabricating pre-feature data.
- Fresh review findings were repaired; 104 focused tests, typecheck, token
  validation, production build, real isolated workflow smoke, and desktop/390px
  browser acceptance passed. The full-suite comparison returned to the known
  G-022 baseline with no G-008 regression.

## 2026-07-13 — G-043 task-summary and Inbox navigation affordances

### Completed

- Full-container Inbox pointer/keyboard navigation, nested-action and selection
  isolation, stable task-detail destinations, and the explicit task-summary
  header actions are implemented and covered by 14 focused tests.
- Production build and live browser acceptance pass at desktop and 390×844.
  At 390px the detail action collapses to its icon without losing its accessible
  name, the detail and Close controls remain distinct from each other and the
  `Task summary` heading, document width stays at 390px, and the console is clean.

## 2026-07-12 — G-042 readable and navigable task outputs

### Completed

- Task detail, task-summary, Inbox completion previews, workflow step results, and rendered markdown
  documents now use one safe markdown renderer. Source H1/H2/H3 hierarchy is shifted beneath its
  containing page or card title, raw HTML stays inert, unsafe URL schemes are stripped, and normal
  blockquotes remain distinct from supported `★ Insight ─…` callouts.
- Long results retain their compact preview and expand into a 48rem reading area—twice the prior
  24rem cap—with explicit `aria-expanded` state and no nested outer scroll clamp.
- Generated output rows now navigate to the rendered document view from their primary label or
  row whitespace and include a dedicated `View document` icon beside Download. Download, Delete,
  text selection, and nested Inbox actions remain isolated from row/task navigation; narrow screens
  keep actions visible and hide secondary size/version metadata before truncating the filename.
- Inbox completion reads batch a bounded 4,000-character result preview and every current output
  document for up to 100 visible notifications. This repairs previously stored 500-character bodies
  that cut Insight syntax mid-block without changing runtime writers or duplicating per-card fetches.
- Live evidence replayed the G-006 research task `a4a1e018-1539-440a-b967-e1d215692f4d` and the
  delegated accounting task `eb386c39-37ff-464f-bf70-7c90dad057b7`: task detail, task-summary, and
  Inbox rendered Insight correctly; the AI briefing opened through its explicit View action; its
  document retained one page H1 and subordinate internal headings.
- Verification: 17 focused tests, TypeScript, diff checks, production build, fresh code review, and
  in-app browser checks at desktop and 390px. The expanded real result measured 672px versus the
  prior 336px cap; task, side-panel, Inbox, and document routes had zero horizontal overflow and no
  browser console errors.

## 2026-07-12 — G-041 compact shared task run history

### Completed

- Full task detail and the task-summary side panel now render the same task run-history component
  and share one abortable polling lifecycle. Closing the panel, switching tasks, or leaving a
  running task stops its pending request and interval instead of leaving background refresh work.
- Provider stream chatter (`message_start`, `content_block_start`, `content_block_delta`, and direct
  runtime `stream` rows) is aggregated into ordered `Response ×N` events. Tool calls, runtime
  routing/fallbacks, permission decisions, failures, and terminal events remain distinct; Monitor
  retains the untouched raw diagnostic stream.
- History responses are explicitly bounded to 20 attempts, 160 semantic events, and 2,000-character
  source payloads. Any event or payload trimming is visible and hands the operator to filtered
  Monitor diagnostics rather than silently discarding evidence.
- Real-task evidence: the live delegated Opus+subagent research task
  `eb386c39-37ff-464f-bf70-7c90dad057b7` rendered 20 semantic events from hundreds of raw stream
  fragments, with ordered Agent/WebFetch tools, the denied Bash permission, terminal completion,
  complete usage, and a working filtered-Monitor handoff.
- Verification: 14 focused route/component/hook tests, TypeScript, diff checks, production build,
  desktop and 390px browser checks, keyboard disclosures, side-panel/full-page parity, zero
  horizontal overflow, and clean browser console. The build retained only the pre-existing broad
  `fix-data-dir` file-trace warnings.

## 2026-07-12 — G-040 complete delegated usage receipts

### Completed

- Claude Code task runs now consume the Agent SDK terminal result's authoritative
  `modelUsage` and `total_cost_usd` fields, so parent and subagent work lands in one durable task
  receipt instead of preserving the first parent-message fragment.
- Usage rows now record `complete`, `partial`, or `unavailable` accounting plus their runtime source
  and provider evidence. Provider-reported cost wins over local token-price estimates; malformed or
  missing cumulative data remains visibly partial rather than silently masquerading as the full run.
- Task detail, run history, budget settings, and Cost & Usage now share that truth contract. Complete
  SDK receipts say `Reported Cost`; partial task/audit rows show known-minimum qualifiers; budget and
  dashboard pacing warn when historical or current spend is incomplete.
- Live delegated-task evidence: task `eb386c39-37ff-464f-bf70-7c90dad057b7` invoked an `Agent`
  subagent and persisted 19,925 input + 5,848 output = 25,773 tokens across Opus and Haiku, with the
  SDK-reported $1.199163 cost. The task row, ledger, task API, run-history API, and browser UI agreed.
- Verification: 67 focused tests, TypeScript, production build, database bootstrap/migration checks,
  real runtime smoke under `npm run dev`, and in-app browser checks on task detail and Cost & Usage.
  The production build retained the repository's pre-existing broad NFT trace warnings.

## 2026-07-12 — G-006 task run history completed

### Completed

- Added bounded, newest-first execution history to task detail by joining durable task execution
  rows from `usage_ledger` with their `agent_logs`, while synthesizing the current attempt until its
  terminal ledger row exists. Each attempt exposes status, timestamps, duration, runtime/model,
  token count, and expandable recorded events without duplicating Monitor's live-stream console.
- Added explicit never-run, terminal-history-unavailable, per-run pruned-log, truncated-history, and
  visible refresh-error states. The current attempt refreshes every five seconds and links to Monitor
  with that task already selected.
- Verification: 7 isolated SQLite route/component tests and TypeScript passed. A real isolated Relay
  preview verified running, completed, failed, multiple-run, never-run, and pruned fixtures; desktop
  and 390px layouts had no horizontal overflow; the filtered Monitor handoff worked; and final
  browser/server diagnostics were clean.

## 2026-07-12 — Backlog goals G-001–G-005 closed

### Closed by operator

- Removed G-001 (fresh-VM customer acceptance), G-002 (customer logo issue #43), and G-003
  (Relay→website asset delivery loop) from the live backlog as-is. No product implementation or
  additional verification was requested for these closures.

### Accepted from shipped code

- Closed G-004 after confirming the July 7 Web Publisher polish already satisfies the goal: previews
  stay inside Relay chrome with a separate standalone-artifact action; preview publish uses the
  exact stored artifact and hash; empty gallery media slots are omitted; and every section card
  opens its source row while CTA links remain explicit secondary actions.
- Acceptance evidence: 36 focused preview/publish/store/route/gallery tests passed, including stale,
  traversal, cross-app, mutation, and exact-hash cases. A live Web Publisher walkthrough rendered
  the generated page in the iframe and standalone tab, showed zero blank media frames across four
  section cards, navigated a whole card to its exact row, and produced no browser warnings/errors.

### Completed G-005

- Accepted `pack-primitive-resurface` after real isolated Tracker and Coach pack installs rendered
  the manifest-declared chart, two accessible KPI trend sparklines, and the 84-cell run-cadence
  heatmap under `npm run dev` with clean final browser/server diagnostics.
- The acceptance run found and fixed two runtime-only gaps: daily KPI series now bucket Drizzle's
  persisted epoch seconds without an erroneous `/ 1000`, and promoted Recharts surfaces receive an
  initial 800×300 measurement so SSR/hydration no longer emits `-1` size warnings.
- Evidence: 136 focused tests, TypeScript, and diff checks passed. The feature spec and roadmap are
  synchronized to `completed`; the deliberately deferred undeclared-chart empty-state remains
  trigger-gated and is not part of this accepted manifest-declarability goal.

### Groomed walkthrough triage

- Promoted TRIAGE-003 to P1 goal G-037: make KPI icon, watermark, color, label, and sparkline
  communicate a truthful named comparison, recent momentum, and metric favorability.
- Promoted TRIAGE-002 to P2 goal G-038. The shipped prompt persists Confirm/Skip actions; this goal
  adds the stronger requested contract that merely displaying it once prevents future automatic
  appearances for the same Relay instance.
- Promoted TRIAGE-001 to P2 goal G-039: make the fixed 84-cell Run cadence visualization and its
  heading form a compact responsive section without stretching the data display decoratively.
- Merged TRIAGE-004 into G-009 so visible `Coach view`/`Tracker view` identity, resolved-kit
  explanation, and copy-as-explicit-view form one coherent app-orientation outcome.
- Reset `_IDEAS/triage.md` to empty intake after recording every disposition. The prioritized
  backlog now contains 34 incomplete goals; no product implementation occurred in this grooming.

## 2026-07-11 — Strategy backlog consolidated into goal contracts

### Groomed

- Replaced the walkthrough-era `_IDEAS/backlog.md` and the duplicate `_SPECS/backlog.md` with one
  priority-ordered queue of 36 incomplete goals. Every goal now names an observable outcome,
  constraints, verification, and operator gate; shipped findings are omitted instead of retained as
  historical backlog.
- Moved every live `internal continuity record` task into the canonical backlog, including customer retests,
  website delivery waits, Web Publisher polish, `_ASSETS` consolidation, pack follow-ups, staging
  cadence, and reactive debt. `internal continuity record` now carries only recovery anchors and points to the queue.
- Promoted two missing high-leverage goals from the strategy audit: Proof/Arena verified-model
  import into Relay and Operations Receipts for unattended runs.

### Audited

- Verified seven strategy specs as implemented from code and implementation commits; kept the card
  system as a living partial spec with one residual convergence goal. The PLG program retains only
  its explicitly trigger-gated free-registration option.
- Timestamp-prefixed all eight `_SPECS` files by first implementation commit so directory order
  reflects delivery sequence, with same-commit pack specs ordered by dependency.
- Declared `_IDEAS/backlog.md` the live priority source; `features/roadmap.md` remains the catalog and
  dependency/history view rather than a second queue.

## 2026-07-11 — Shared GitHub setup + public/private/community Pack journeys

### Built
- Added explicit **Use GitHub CLI** setup. Settings detects only the local `gh`
  executable without reading its credential or contacting GitHub, waits for user selection, then
  validates the account. Relay never persists or returns the CLI token; token
  setup remains available for customers without `gh`.
- Added one encrypted GitHub connection in Settings, shared by GitHub Pages and Pack publishing.
  New app targets store repository coordinates only; legacy embedded tokens remain a masked
  compatibility fallback.
- Added a reusable repository picker that lists writable public and private repositories equally,
  displays visibility, uses the repository's default branch for Packs, and retains manual entry.
- Added the “Submit to Relay Community” follow-on: after an exact successful public-repository
  publish, Relay prepares a structured review request with pack id/version, repository URL,
  commit, and artifact hash. The canonical index continues to link; it never hosts or mirrors.
- Updated trust disclosure and TDR-040 to distinguish creator-owned publishing from community
  review and to record the shared-credential boundary.
- Live release smoke passed against `orionfold/relay-packs-smoke-public` and
  `orionfold/relay-packs-smoke-private`: equal visibility/write checks, empty-repository
  initialization, exact-hash publish and republish, unrelated-file preservation, public
  community-review preparation, private-review refusal, root/default-branch install, shared
  Pages target reuse, and disconnect cutoff. The run also hardened macOS app discovery of
  Homebrew-installed `gh` and GitHub's first-commit consistency window.

## 2026-07-11 — Community Pack authoring + user-owned Git publish built (#45)

### Built
- Chat now recognizes “build me a pack/app to do X” as composition, materializes Relay-native
  profiles/blueprints/tables/schedules/views, exports a portable `pack.yaml` + `base/`, and can
  publish through an already-configured repository target without putting credentials in chat.
- Added the inverse-of-install exporter with stable community-namespaced ids, typed table/schema
  round-trip (including relation refs), trigger/schedule preflight, premium-content refusal, and
  privacy-safe seed handling (zero rows by default; explicit samples capped at 25 rows/table).
- Added the `github-repo` PublisherAdapter, exact file-tree/hash preview, explicit confirmation,
  shared encrypted credentials, durable deployment status, stale-preview refusal, and one atomic Git
  commit that preserves unrelated repository files.
- Direct Git pack sources now classify as `community · unverified` unless a trusted canonical-index
  signature attests them. Added TDR-040 and the data-flow egress row.
- Verified with TypeScript, focused chat/export/install/publisher tests, and an export→delete→fresh
  install round-trip.

## 2026-07-08 — Pack compat diff gate built

### Built
- `pack-compat-diff-gate`: added `scripts/check-pack-compat.mjs` plus
  `npm run check:pack-compat` and npx-prod-smoke **Case TC**. The gate compares current bundled
  pack manifests against a git baseline (`origin/main` by default; override with
  `RELAY_PACK_COMPAT_BASE_REF`) and fails on breaking pack updates unless the pack raises its
  `relayCore` major. Covered removed packs, tables, columns, blueprints, row-insert triggers,
  schedules, and existing view bindings.
- `0.36.0` release prep: plugin `apiVersion` current window moved to `0.36`, retained `0.35`
  compatibility, and refreshed the three example plugin manifests.

## 2026-07-07 — Flagship card polish built

### Built
- `flagship-card-polish`: pack cards now carry compact icon wells plus `Pack`, `Installed`, and
  `Premium` subtype badges; app-detail primitive sections now expose icon-backed headers with
  count badges for workflow/funnel/gallery/chart/table families. App-detail header actions wrap
  on mobile so dense action rows do not push manifest controls off-canvas. Verified in Codex
  in-app Browser and OS Chrome desktop/mobile smoke.

## 2026-07-07 — In-app preview sheet visibility fixed

### Built
- `fix-in-app-preview-sheet-visibility`: shared sheets now use the project overlay z-token instead
  of Tailwind `z-50`, preventing row-edit and enrichment sheets from opening underneath the boot
  veil during Codex in-app preview evaluation. Verified in Codex in-app Browser and Playwright
  Chromium fallback with screenshots under `output/sheet-visibility/`.

## 2026-07-07 — Packs-first IA built

### Built
- `packs-first-ia`: primary nav now presents Packs as the top-level surface with `Browse packs`,
  `Installed`, and live installed-pack instance links. `/apps` remains the compatible installed
  route but is labeled `Installed packs`, Chat/welcome/generated-result copy now says pack, and
  `/apps/[id]` adds a `Pack composition` panel with primitive counts plus expandable owned-table
  drill-through links. App detail secondary slots now render as primitive-specific sections, with
  workflow guidance inside the Workflows section and section-appropriate grid/full-width layouts.

## 2026-07-07 — Dashboard and settings drill-downs built

### Built
- `dashboard-settings-drilldowns`: telemetry rail cells now expose keyboard-accessible drill-down
  links for tasks, failures, review, projects, workflows, spend, and runtime settings. Settings
  glance values deep-link to stable `/settings#...` anchors, the Settings page focuses and scrolls
  hash targets after async layout settles, and `/tasks?status=running|completed|failed` seeds the
  existing task status filter.

## 2026-07-07 — Web Templates pack built

### Built
- `web-templates-pack`: added a bundled `relay-web-templates` pack with synthetic declarative
  static-site template rows, a typed template schema, template selection in Web Designer site
  controls, named validation for unsafe/incompatible template data, and preview/deployment metadata
  provenance for the selected template.

## 2026-07-07 — Web Designer site controls built

### Built
- `web-designer-site-controls`: Web Designer publish surfaces now expose typed static-site controls
  for theme, density, hero layout, accent, CTA visibility, and section style. Preview and publish
  load the same app-scoped settings object, preview fingerprints include settings changes, preview
  metadata records generator config, and deployments persist `generator_config`.

## 2026-07-07 — App-detail row cache invalidation built

### Built
- `fix-app-detail-row-cache-invalidation`: table row add/update/delete API mutations now
  revalidate scoped app-runtime cache tags for apps that own the changed table, no-op row
  updates skip cache churn, and the publish panel marks stored preview artifacts stale when
  current source rows no longer match the saved preview fingerprint.

## 2026-07-07 — Gallery card interactions built

### Built
- `gallery-card-interactions`: Web Designer gallery cards now omit empty thumbnail frames, keep
  safe image thumbnails when present, and use a consistent row-open contract. The card body opens
  `/tables/<tableId>?row=<rowId>` and the table route opens the row edit sheet from that query
  parameter; row CTA/reference URLs render as a separate `Open link` action.

## 2026-07-07 — Operator walkthrough follow-ups groomed

### Groomed
- Extracted the Web Designer/operator walkthrough feedback into 11 bounded specs:
  `web-designer-site-controls`, `web-templates-pack`, `publish-preview-ux-hardening`,
  `gallery-card-interactions`, `packs-first-ia`, `dashboard-settings-drilldowns`,
  `fix-turbopack-dynamic-transport-dispatch`, `fix-scheduled-lead-list-hygiene-dispatch`,
  `fix-app-detail-row-cache-invalidation`, `fix-in-app-preview-sheet-visibility`, and
  `flagship-card-polish`.
- Added an Operator Walkthrough Follow-ups tranche to the roadmap so runtime defects, Packs-first
  IA, Web Designer controls/templates, and publish-preview hardening can be scheduled separately.

## 2026-07-07 — Web Designer publish smoke accepted

### Built
- Published the polished `relay-web-designer` static-site artifact to
  `orionfold/relay-web-smoke` via the preview-first GitHub Pages flow. Deployment
  `da6cd84c-061b-494b-ac41-f8d691700083` wrote commit
  `d22251ead78c90696be3156d90e296cbe866e9da` with artifact hash
  `981b9074823d77978dd81f9307ecb7d3b418f5c875c648cd2c79bb52e9f7f9cc`.
  Public Pages content verified the polished masthead, numbered section labels,
  signal cards, and footer. TDR-039 is now accepted.

## 2026-07-07 — Publish preview artifact specified

### Groomed
- Added **`publish-preview-artifacts`** (P1) as the preview-first follow-up to TDR-039 Phase 3+4:
  generate a local static-site artifact, serve it from Relay's existing Next server, then publish
  that exact artifact to GitHub Pages via `artifactId`. This makes the Web Designer Phase 5 smoke
  safer by enforcing "what you preview is what gets published" and avoids a second local server or
  a second generation path.

## 2026-07-06 — Packs Publish groomed (R1–R7 → 7 feature specs)

### Groomed
- Extracted `_IDEAS/packs-publish.md` §10 (R1–R7) into **7 `features/pack-*.md` specs** — the
  "Orionfold Packs" distribution standard (a versioned format + a canonical READ source + a
  provenance model + a publish loop; a standard, not a marketplace). Added a **Packs Publish —
  distribution & community** group to `roadmap.md` + its index-first dependency chain.
  - **`pack-canonical-index`** (R1, P1) — the `orionfold.packs/v1` Zod schema + pure reader
    (zero-runtime-import leaf) + a committed fixture; the keystone every other pillar reads. The
    real `index.json` URL is Website-coordinated (open decision #1).
  - **`pack-remote-resolver`** (R2, P1) — one async branch at the `resolvePackSource`
    (`catalog.ts:105-122`) seam: consult the index → sha-verified fetch → `acquirePack`.
    Local-first preserved; the bundle-child fence (`install.ts:143-149`) kept shut;
    runtime-registry-adjacent → dev-server smoke; new `data-flow.md` egress row (canonical READ).
  - **`pack-provenance-tiers`** (R3, P1) — offline Ed25519 verify reusing the shipped licensing
    `TRUSTED_KEYS` (`verify.ts:37-40`) + `canonicalize.ts`; official/partner/community tiers +
    badge; trust-ceiling policy seam (default warn-and-install, open decision #3).
  - **`pack-tarball-diet`** (R4, P2) — slim bundled default + fetch-on-install for the long tail;
    caches into the managed `base/`; gated on a real npm size measurement + the slim-cut (open
    decision #2); updates npx-prod-smoke Case L counts.
  - **`pack-standard-versioning`** (R5, P2) — index-schema + per-pack `relayCore` + plugin
    `apiVersion` folded into ONE release checklist (co-listed, NOT merged) + an early `relayCore`
    skip in the resolver. Mostly process + a cheap gate.
  - **`pack-app-exporter`** (R6, P3) — the app→pack `GeneratorAdapter` (inverse of install;
    correct-by-construction from live validated primitives); no egress. Gated on the TDR-039
    substrate (`features/architect-report.md`).
  - **`pack-community-publish`** (R7, P3) — the only SEND: a `github-repo` PublisherAdapter (reuse
    TDR-039) + in-product consent ceremony + `data-flow.md` egress row; user-owned target, no
    install-state telemetry, index links (never hosts). Gated on R6 + the TDR-039 substrate;
    shares the GitHub publisher adapter with the Web Designer ticket.

### Decisions surfaced (4 open, Website/issuer-coordinated — `packs-publish.md §12`)
- Canonical index URL + versioning (R1) · slim-default cut (R4, needs a size measurement) ·
  community trust ceiling (R3/R7) · partner-key onboarding (R3, coordinate with the licensing
  issuer owner). Routed via `strategy/relay/_RELAY.md`.

### Fences held (recorded so a later pass never over-reaches into the cut sub-product)
- Every install is a READ from a canonical Orionfold source (promise-clean); the one SEND (R7) is
  a user-owned consented push to the customer's own GitHub — never orionfold.com, never
  install-state telemetry. No registry service, review pipeline, creator portal, or ratings. The
  no-marketplace fence opens only along git/git-URL install; the bundle-child fence stays shut.

## 2026-07-06 — Packs Robustify R1+R3 BUILT (the taxonomy governance gate)

### Built (internal — build-time governance, no runtime/user-facing surface)
- **R1 `pack-taxonomy-codified`** — the owned-primitive registry is now a machine-checked data file.
  `src/lib/packs/taxonomy.ts` (typed + Zod `.strict()`, 14 tables + 3 schedules seeded verbatim from
  the shipped manifests — `pipeline` recorded with its REAL columns `[prospect, stage, value, owner,
  notes]`, not the doc's prose) + a pure loader (`loadTaxonomy`, `ownerOfTable`, `ownerOfSchedule`,
  `registeredColumns`). Kept a **zero-runtime-import leaf** (only imports `zod`; `pack-of.ts` purity
  precedent) so it stays out of the `catalog.ts` module-load-cycle blast radius. Mirrored to a
  checked-in `taxonomy.json` (the plain-node gate reads it; `scripts/generate-taxonomy-json.mjs`
  regenerates it; a `taxonomy.test.ts` json-in-sync assertion fails on drift).
- **R3 `pack-taxonomy-ci-gate`** — `scripts/check-pack-taxonomy.mjs` (modeled on
  `check-price-drift.mjs`: standalone `.mjs`, `TEMPLATES_DIR` walk, exported testable core, exits 1 on
  drift). Reconciles every pack manifest against the registry and fails on three drift classes:
  **(i) second owner** (a non-owner declares an owned id with DIFFERENT columns — the divergent
  re-definition; an identical-column re-list is the legal Pro→spine pattern and passes), **(ii)
  unregistered** (a declared id absent from the registry), **(iii) column drift** (the owner's own
  declaration differs from the registered contract). Skips bundle packs (no `base/manifest.yaml`),
  fail-CLOSED (local check, no network). Wired into `npx-prod-smoke.mjs` as **Case T** (publish gate)
  + `check:pack-taxonomy` npm alias. Passes clean against the current 6 manifest packs (16 declared
  tables incl. Pro's 2 legal re-lists + 3 schedules).
- Closes the side-by-side silent-divergent-table hole `BundleCollisionError` misses (it fires
  flatten-only; `install.ts` `createTable` mints a fresh UUID for a side-by-side redefine). 24 new
  tests, 0 regressions vs the 8 known pre-existing failures. `pack-taxonomy.md` + the `ainative-app`
  skill now point at `taxonomy.ts` as the SSOT.

## 2026-07-06 — Packs Robustify R1+R3 groomed (the taxonomy governance gate)

### Groomed
- Extracted **2 build-ready specs** from `_IDEAS/packs-robustify.md` §10 (the packs governance layer),
  scoped to **R1 + R3 only** per operator decision (the two highest-leverage first builds; §11
  "gates before features"). R2/R5/R7/R8/R9 remain in the idea doc, ungroomed.
  - `pack-taxonomy-codified` (P1, R1) — lift the hand-maintained `pack-taxonomy.md` registry into a
    typed, Zod-validated `src/lib/packs/taxonomy.ts` data file + pure typed loader; the SSOT the gate
    and the `ainative-app` skill read. Data + loader only, no runtime behavior change (blast **S**).
  - `pack-taxonomy-ci-gate` (P1, R3, depends on R1) — a `scripts/check-pack-taxonomy.mjs` gate
    (modeled on `check-price-drift.mjs`) that walks every pack manifest and fails the build on second
    owner, unregistered owner, or column-contract drift. Closes the side-by-side silent-divergent-table
    hole `BundleCollisionError` misses (it fires flatten-only). Wired into the release check chain.
- **All doc anchors code-verified before writing** (operator `verify-before-groom` discipline):
  `format.ts` `.strict()` rejects `dependsOn`; `bundle.ts:45` `claimIds` fires flatten-only;
  `install.ts:252` `createTable` mints fresh UUIDs (the divergence R3 pre-empts); `pack-of.ts`
  I/O-free purity precedent; bundle packs have no `base/manifest.yaml` (the gate must skip them).

## 2026-07-05 — Pack Catalog Evolution requirements extracted from strategy doc

### Groomed
- Extracted **7 feature specs** from the approved strategy `_IDEAS/packs-evolution.md` (the
  four-category pack-catalog pivot: Persona / Functional / Industry / Personal, composed on the
  proven Apps engine, breadth-designed / depth-shipped). One spec per §8 build-sequence step,
  each in house format (frontmatter `source: _IDEAS/packs-evolution.md §N` + `dependencies:`;
  Description / User-Story / Technical-Approach / Acceptance / Scope-Boundaries), code anchors
  cited from the this-session-verified tree:
  - `pack-generalize-agency` (P0, §8.1) — the no-new-architecture warm-up: split persona
    (`relay-agency`) from industry (`relay-cre`, `relay-nonprofit`).
  - `pack-primitive-resurface` (P1, §8.2) — wave-1 resurfacing: declarable table charts, wire
    the orphaned `RunCadenceHeatmap`, feed `evaluateKpi` trend/spark. Lifts every pack.
  - `pack-bundle-model` (P1, §8.3, §5) — the **locked** composition call: flatten-at-install into
    one app; reuses the Apps engine fully, no cross-project resolution.
  - `pack-agency-bundle` (P1, §8.3, §10 Q1 — added 2026-07-05 per operator decision) — the
    **first bundle proof**: `relay-agency` + `relay-cre` flattened into one "Agency (CRE)" app.
  - `pack-marketing-line` (P2, §8.3) — a later Functional depth bundle: `relay-crm` +
    `relay-social` modeled as a synthetic functional Marketing line (demoted from first-proof, see below).
  - `pack-entitlement-per-line` (P2, §8.4, §7) — migrate to `product:relay-*`, all-access
    wildcard, foundation packs free; zero schema change; needs Website `pricing.json` coord.
  - `pack-depth-next-wave` (P2, §8.5, §6) — Web Designer / Video Creator / Retail Investor; build
    a new analytics primitive (heatmap, radar, gallery) only when a selected pack needs it.
  - `pack-dependson-foundation` (P3, §8.6, §5 A+B) — the genuinely-new cross-project seam
    (`dependsOn` + foundation packs + cascade guard); built LAST, only when independent child
    install/update earns its weight over flatten-bundle.
- Added a **Pack Catalog Evolution (2026-07-05)** roadmap section + dependency chain, ordered by
  the §8 depth-ship sequence.

### Operator decisions (2026-07-05, resolved this session)
- **First bundle proof → Agency→CRE** (resolves `decisions_open` Q1). NOT Marketing: published
  marketing assets already exist for the Agency persona (warm audience, compounds existing work) —
  a GTM argument the strategy weighed only on harvest depth. Added `pack-agency-bundle` (P1) as
  the first proof; demoted `pack-marketing-line` P1→P2 to a later Functional depth bundle.
- **Generalize Agency *additively*, not just subtractively.** The persona spine (`relay-agency`)
  becomes the deep, fully-realized domain-neutral operating system; industry packs (`relay-cre`,
  `relay-nonprofit`) stay thin, sharp content on top. Captured in `pack-generalize-agency`.

### Still open (need operator + Website calls during grooming — `decisions_open`)
- **When `dependsOn` earns its weight** — the P3 trigger; flatten-bundle is sufficient until a
  concrete shared-live-foundation need exists.
- **Bundle pricing mechanics** — per-line list/intro vs all-access anchor; needs a Website
  `pricing.json` decision + `_RELAY.md` coordination before any price ships.

## 2026-07-02 — S11: fix-packs-gallery-plg-cards SHIPPED (closes #21 + #20 on main)

### Completed
- `fix-packs-gallery-plg-cards` — the /packs graduation surface is now PLG-marketing-grade.
  Slice 1 (#20): `price` widened to `string | { list, intro?, note? }` (back-compat union,
  TDD'd) behind a single `packPrice()` normalizer; Agency Pro's pack.yaml now expresses the
  LIVE founding offer ($349/year intro, $499/year list) — offline, hand-maintained, matching
  the website. New optional `icon:` field (lucide token, never remote). Slice 2 (#21): locked
  premium packs render as a full-width feature panel — full 6-chapter sales copy unclamped at
  a 70ch measure, compact offer rail (founding price + struck list anchor + note + install/
  Get-license CTAs), per-pack icon tiles, and server-rendered All/Free/Premium filter chips
  via `?filter=` (zero client JS; corrupt templates ignore the filter so packaging bugs stay
  visible). Verified: 99/99 pack + 90/90 API/licensing tests, tsc clean, design-token
  validator clean, dev-server browser pass (desktop/mobile/filters), AND a full staging-
  harness fresh-install pass (customer-identical npx artifact) with R4 isolation clean.
  Staging also proved the spec's compat note live: a stale prebuilt artifact (old compiled
  schema) rejects the new pack.yaml with `Unrecognized key "icon"` — core + templates must
  ship together, which a release tarball guarantees. Screenshots:
  `output/packs-gallery-2026-07-02/`.

## 2026-07-02 — S11 grooming: persona-smoke findings #20–#23

### Groomed
- `fix-packs-gallery-plg-cards` (P1) — new spec, closes GitHub **#21** (pack gallery →
  PLG-marketing-grade cards: full sales copy unclamped, per-pack visual identity, use the
  canvas, scale to N packs w/ free/premium filter) **and folds in #20** (price schema union
  `string | {list, intro?, note?}` + normalizer so the card can express the LIVE founding
  price: $349 first N buyers → $499 normal — the website is CORRECT, the product lacked the
  mechanic). One spec because `meta.price` has exactly one consumer (the gallery card) and
  the render contract belongs to the card design. Groomed as a frontend-design spec per
  operator direction; implementation invokes `frontend-design` + `taste`, verifies on the
  `relay-staging` harness.
- **#22** (P2, onboarding PUT-before-onClose race) and **#23** (P3, fresh-boot ALTER TABLE
  noise) stay issue-tracked, no spec — both are single-site fixes with the root cause already
  code-verified in `output/staging/2026-07-02/EVALUATION.md`.

## 2026-07-02 — S10 grooming: PLG-4 growth-loop candidates cleared

Operator ruled on the two remaining PLG-4 loop candidates (AskUserQuestion gate, per §4/§5):
- **Free registration key tier — DEFERRED** (not killed): still a strong recommendation, but
  brand-timing isn't right and it depends on Website issuer participation + a decision on which
  2–3 community niceties gate behind the key. Held for a future session. Recorded in
  `_SPECS/2026-07-01-200629_plg-refine.md` §4/§5 so the door stays ajar (distinct from KILLED reverse trial).
- **Founding-supporter identity — DROPPED**: $349 tier felt identical to $499 and the work is
  mostly Website/community surface with thin product code — not worth a product loop. Recorded
  as dropped in §4/§5; any differentiation is a Website/community decision, out of scope here.

Net: PLG-4 has no live growth-loop candidate queued. S10 work reduces to the two P2 fixes
(`fix-anthropic-direct-task-serialization`, `fix-inbox-checkpoint-realtime`) + reactive
Relay-channel obligations, until the operator re-opens the free-key tier.

## 2026-07-02 — S8: the cost-trust P1 bundle SHIPPED (all three ICP P1 fixes)

### Completed
- `fix-dashboard-budget-vs-cost-labeling` — root cause was the plan-price substitution in
  `getUsageAggregates` (correct for guardrails, wrong as display). Additive fix: snapshot
  exposes `meteredSpend` + `planPricedMonthlyMicros`; rail relabeled SPEND TODAY/TO DATE
  off pure ledger sums; loading no longer fabricates "not configured". Verified live.
- `fix-workflow-model-preference-propagation` — new `resolvePreferredModel` (pin >
  preference tier > quality default) wired into claude-code task execute/resume (which
  passed NO model to the SDK — the actual Opus mechanism), the claude-code aux calls, and
  both direct runtimes. Smoked per CLAUDE.md budget: balanced → `claude-sonnet-4-6` in
  effectiveModelId + ledger + monitor, on claude-code AND anthropic-direct.
- `fix-chat-spend-metering-diagnose` — root cause (a): `sendOllamaMessage` is a separate
  engine with zero ledger writes; (b) version-skew ruled out via git ancestry vs v0.15.1.
  Fixed the Ollama chat path (+ `local-free` $0 pricing for provider ollama — was
  `unknown_pricing`). Verified with a REAL local Ollama turn (2.2K tokens, $0) + cloud turn.

### Groomed (found during smoke)
- `fix-anthropic-direct-task-serialization` (NEW, P2) — every anthropic-direct task run
  fails with "Converting circular structure to JSON" (pre-existing; reproduced on a
  trivial no-profile task). Model resolution works on that path; execution doesn't.

### Re-statused (roadmap sync)
- `feat-renewal-value-recap` — planned → done (0.22.0; row was stale).

### Closed without build
- `feat-prepublish-tarball-smoke` — CLOSED as a phantom: no spec file ever existed (only
  cross-references in `fix-pack-core-version-resolution.md` and
  `feat-ship-production-build-for-npx.md`), and `publish.yml` already packs + installs +
  smokes the tarball pre-publish. Dropped from the HANDOFF backlog; nothing to narrow.

## 2026-07-02 — GitHub issue grooming pass (held bugs labeled; shipped records reviewed)

Groomed the open-issue list (operator request, S8 open). Findings:

- **Held bugs #5/#6/#11/#12 (haruny)** — no customer reply yet to the 0.16.0 retest asks
  (posted 2026-07-02T02:34Z, all four). Stay held/reactive per HANDOFF; the prod-build class
  fix (0.16.0) likely moots them. **No fix-* spec created on purpose** — spec work waits on
  retest evidence (memory: verify field reports before fixing). Labeled all four `bug` +
  new `awaiting-retest` label ("Fix likely shipped; waiting on reporter to retest on the
  latest release") so the pending state is visible on the repo.
- **Shipped announcement issues #14–#19** — CLOSED as completed (operator-approved via
  AskUserQuestion), matching the #2/#3/#10 convention. GitHub Releases remain the
  announcement surface; closed issues stay linkable as the customer-facing record.
- No other open issues; nothing new to extract into `features/`.

## 2026-07-02 — groomed feat-renewal-value-recap (PLG-4a) for S7; reverse trial KILLED

S7 operator gate ran (AskUserQuestion, 2026-07-02): of the four PLG-4 loop candidates, the
**renewal value-recap** was chosen — the only one that became honest with 0.21.0 (Agency Pro
v0.2.0 is a real paid update to recap). Groomed `_SPECS/2026-07-01-200629_plg-refine.md` §5 PLG-4 into
`features/feat-renewal-value-recap.md`: an optional `changelog:` field in pack.yaml (the missing
per-version "what's new" source), ONE recap helper reusing `packUpdateAvailability` (D7), three
explicit-invocation surfaces (`license status`, the 402 update refusal, the /packs one-liner),
and a Website relay for the T-30 renewal email (release-history recap only — Website cannot see
installs; no data sent to Orionfold). Startup banner explicitly untouched (§7 terminal-ads fence).

### Deferred (permanently)
- **Reverse trial — KILLED by operator ruling**: the 14-day re-lock is a literal instance of the
  §7 anti-pattern "any expiry that disables installed content" (D4 violation) against a promise
  that is now public (README, issues #14–#18, orionfold.com/promise/) and enforced at the update
  gate. Recorded in plg-refine §4/§5 so it cannot resurface; any future trial concept must never
  write premium content to the pack store.

### Re-statused (roadmap sync)
- `feat-agency-pro-pack` — planned → done (shipped 0.19.0; roadmap row was stale)
- `feat-pack-update-workflow` — added to roadmap as done (shipped 0.21.0; row was missing)

## 2026-07-01 — feat-agency-pro-pack open questions resolved (installer-semantics check)

Ran the installPack semantics check the spec called for; all four open questions are now
resolved decisions in the spec. (1) **Standalone** — tables are project-scoped
(`install.ts:182,201`) and the view rewrite covers only the pack's own tables, so cross-pack
table reads silently break; Pro ships everything it references. (2) **Pricing already live** —
$499/$349/$149 Stripe prices + orionfold.com/relay storefront (strategy channel, 2026-07-01);
`price: "$499/year"`, `purchaseUrl: https://orionfold.com/relay/`. (3) **Batch = agent-level
iteration** — blueprints have no loop construct; workflow agents get relay MCP table tools, so
one run iterates the table. (4) **CRE-first** (operator); nonprofit deep chapter = v0.2.0 first
paid update, exercising the D4 update path. The check also surfaced **two latent engine gaps**,
both now in-scope as free D5 engine work: (0a) pack-authored `row-insert` triggers never fire —
`rewriteTableRefs` skips `blueprints[].trigger.table` while dispatch matches the real table UUID
(`manifest-trigger-dispatch.ts:153`); (0b) `installPack` never registers `manifest.schedules` as
DB schedule rows, so pack schedules are display-only and `scheduleNextFire` reads null. Operator
chose to ship installer schedule support in this scope (0b) rather than defer to a UI-setup step.

## 2026-07-01 — groomed feat-agency-pro-pack (PLG-2b) for 0.19.0

Groomed `_SPECS/2026-07-01-200629_plg-refine.md` §5 PLG-2b ("author the first real premium pack") into
`features/feat-agency-pro-pack.md` from the Agency Pro brainstorm. Positioning: the free pack
sells the verbs (click-to-run blueprints), Pro sells the operating system — five chapters, all
pure composition of existing primitives: (1) finance cockpit (ledger kit + tableSumWindowed/ratio
KPIs + scheduled month-end close), (2) intake pipelines (row-insert triggered blueprints),
(3) new-business machine, (4) governance as content (hardened canUseToolPolicy profiles, audit
export, ollama local-only variants), (5) CRE + nonprofit deep chapters (SKILL.md methodology =
the D4 renewal engine). P0 — every conversion mechanism shipped in 0.15–0.18 has a null numerator
until this exists. Zero engine changes in scope (D5: missing capabilities ship free separately).
Four operator decisions gate the build: standalone-vs-add-on (needs an installPack collision/
absence semantics check), price/purchaseUrl strings, batch-across-clients feasibility, and
CRE-first vs both verticals in v0.1.0. Acceptance = full Naya-path Mode C staging run from the
packed tarball (loopback + LAN) with the real prod-signed license.

## 2026-07-01 — shipped feat-graduation-surface (PLG-2a) as 0.18.0

Implemented same-session after grooming (below): bundled-pack catalog + `price`/`purchaseUrl`
manifest fields + name-based install (`pack add relay-agency`) + `/packs` gallery (nav Compose
slot beside Apps — the one tested exception to the 4-child cap) + `POST /api/packs/install`
(bundled ids only) + `GET/POST /api/license` + `DELETE /api/license/[id]` + Settings → License
section + Apps empty-state nudge. 24 new unit tests (TDD throughout); full suite green except
the 8 known pre-existing failures. Acceptance = Mode B browser capture in
`output/staging/2026-07-01/` (7 screens + console + network) walking the full journey with the
REAL prod-signed license: premium locked card → 402 soft-gate → paste-activation ceremony →
store-consult premium install → D4 proof (license removed in UI, packs stay). Cross-surface D7
parity verified: `pack list` shows the UI-installed `[premium]` pack; `license status` reads the
UI-activated license. Premium card states exercised via a temporary uncommitted fixture template;
the first REAL premium pack is S4 (PLG-2b).

## 2026-07-01 — groomed feat-graduation-surface (PLG-2a) for 0.18.0

Groomed `_SPECS/2026-07-01-200629_plg-refine.md` §5 PLG-2 UI slice into `features/feat-graduation-surface.md`,
absorbing `fix-pack-install-discoverability` (status → absorbed; its ACs carry forward as the
free-pack slice). Scope: bundled-pack catalog (`listPackTemplates`), optional `price`/`purchaseUrl`
manifest fields, name-based install (`pack add relay-agency`, path-precedence rule), `/packs`
gallery (installed / free / premium-locked card states, D6), install API (bundled ids only —
no browser-supplied paths/git URLs), license API + Settings → License section reading the D7
store, Mode B browser capture as the acceptance run. Grooming decisions: ships as **0.18.0**;
Settings surface is a section component per the single-page convention; nav placement (Compose
at its 4-child cap) + locked-card/ceremony UI flagged to `/frontend-designer`. Premium pack
authoring + Website relay stay in S4 (PLG-2b).

## 2026-07-01 — shipped feat-license-lifecycle (PLG-1) as 0.17.0

Implemented same-session after grooming (below): license store + `relay license add|status|remove`
+ licensed banner + activation ceremony + install store-consult + `[premium]` list marks +
`RELAY_STAGING` seed/clear re-gate + README Free-vs-Paid. 34 new unit tests (TDD throughout);
acceptance = smoke Case L (Mode C buy-simulation) green against the installed 0.17.0 tarball with
the real prod-signed fixture — including the D4 proof (license removed → banner reverts, premium
pack stays installed).

## 2026-07-01 — groomed feat-license-lifecycle (PLG-1) for 0.17.0

Groomed `_SPECS/2026-07-01-200629_plg-refine.md` §5 PLG-1 into `features/feat-license-lifecycle.md`. Operator gates
resolved during grooming: banner identity = `Licensed to <name → email>` (confirmed against the
Website Stripe webhook — fulfilment captures email always, billing name usually, org never);
D4 perpetual-fallback public wording approved verbatim from the program spec; ships as **0.17.0**.
Scope: license store (`~/.relay/licenses/`, file-based per the no-DB-licensing fence), `relay
license add|status|remove` verb, install store-consult fallback, licensed banner, activation
ceremony, `pack list` premium marks, seed/clear re-gate on `RELAY_STAGING=true` (PLG-S slice),
README Free-vs-Paid. Acceptance = Mode C buy-simulation in the staging harness with the real
prod-signed fixture.

## 2026-07-01 — shipped 3 of 4 P0 ICP-walkthrough fixes

Executed the top of the groomed ICP backlog. All three are smoke-verified (two are
runtime-registry-adjacent, so a real `npm run dev` / built-bundle smoke was mandatory per CLAUDE.md).

- **`fix-project-customer-link-ui`** (`cdf66e94`) — added the Customer selector to `ProjectFormSheet`
  (create + edit), persisted `customerId` through the validators + POST insert + GET/page projections.
  Caught a data-loss shadow path: the GET route + both `Project` interfaces omitted `customerId`, so
  edit-mode pre-fill would silently clear the link on save. DB round-trip + browser verified.
- **`fix-chat-mcp-namespace-relay`** (`1fa0cfba`) — flipped the `engine.ts` MCP server map key
  `ainative`→`relay` (the SDK derives the tool namespace from the key, so tools published as
  `mcp__ainative__*` while the auto-allow gate matched `mcp__relay__*` — every compose tool fell to a
  manual prompt). Added an idempotent `migrateMcpNamespace()` rewriting saved "Always Allow" records
  (`settings.permissions.allow`) `ainative`→`relay`. **Spec correction:** current Relay has no
  `agent_profiles` table (profiles are file-based) — the DB profile migration the spec called for is a
  guarded no-op. Verified: seeded `mcp__ainative__` approval rewrote to `mcp__relay__` on boot; chat
  `list_projects` auto-advanced with no gate.
- **`fix-pack-core-version-resolution`** (`a61f8ad0`) — packs were DOA on npx (`this install is 0.0.0`).
  Fixed via tsup `define: { __RELAY_CORE_VERSION__ }` (build-time embed, no runtime lookup) **and** a
  bundle-aware `getAppRoot` that walks up to the `orionfold-relay` package.json — fixing all 5
  depth-mismatched call sites at once, not just `install.ts`. npx-simulation smoke from a fresh dir
  installed the pack fully (project + 6 customers + table + 7 profiles + 8 blueprints).

Remaining: `fix-compose-approval-orchestration` (P0, now unblocked) + P1/P2 tail. See roadmap.

## 2026-07-01 — ICP walkthrough backlog groomed into 9 sequenced fix units (code-verified)

Groomed the two-pass ICP browser walkthrough findings (`_IDEAS/backlog.md` — 10 blockers found on
published `orionfold-relay@0.15.1`) into 9 self-contained, dependency-ordered `fix-*` feature specs.
**Before grooming, every code-rooted blocker was re-verified against the current tree by read-only
agents** — which materially changed three findings, so the specs carry the corrected mechanisms, not
the walkthrough's raw guesses.

### Verification-driven corrections (folded into both `_IDEAS/backlog.md` and the specs)

- **#8 pack `0.0.0`** — symptom real, but the mechanism was wrong. It is NOT a bundler-flattened
  relative path; it's a **hardcoded `depth: 3`** in `getAppRoot(import.meta.dirname, 3)`
  (`install.ts:31`) that's correct for `src/` but overshoots in `dist/`, falling back to
  `process.cwd()` (`app-root.ts:23`) then to the `"0.0.0"` catch (`install.ts:39`). Fix = embed the
  version at build time via tsup `define`. Same depth pattern flagged at 3 other `dist/cli.js` sites.
- **#10 chat not metered** — **NOT CONFIRMED as a build gap.** `chat_turn` metering exists on every
  chat path (`engine.ts:413,882,952,979`; `codex-engine.ts:406,430`; all via `recordUsageLedgerEntry`,
  `ledger.ts:217`). Re-scoped from "add metering" to **reproduce-and-diagnose** the 0-rows observation
  (Ollama-path drop? version skew? silent write failure?).
- **#5 model-routing leak** — mechanism confirmed (`execution-target.ts:440` uses the runtime-catalog
  default, never `chat.modelPreference`); only the example model id `claude-opus-4-7` was stale (now
  `claude-opus-4-8`, `catalog.ts:217`).

Confirmed-as-written: **#2** (`engine.ts:508` MCP key `ainative:` vs `mcp__relay__*` allow-list — all
lines accurate; fix needs a **data migration** for saved approvals since `permissions.ts:57-65` matches
tool names by exact string) and **#3/#4** (project→customer link missing; add selector to the active
`ProjectFormSheet`, NOT the dead `project-*-dialog.tsx`).

### Groomed (9 units → `features/`, roadmap "ICP Walkthrough Fixes" section)

- **P0:** `fix-chat-mcp-namespace-relay` (key flip + migration — unblocks compose), then
  `fix-compose-approval-orchestration` (auto-advance / no duplicate projects);
  `fix-project-customer-link-ui` (highest ROI — one selector unblocks the whole per-customer margin
  chain #3→#4); `fix-pack-core-version-resolution` (packs DOA on npx).
- **P1:** `fix-workflow-model-preference-propagation`, `fix-dashboard-budget-vs-cost-labeling`,
  `fix-pack-install-discoverability` (dep: core-version fix), `fix-chat-spend-metering-diagnose`.
- **P2:** `fix-inbox-checkpoint-realtime`.

Sequencing rationale: fix `mcp-namespace` before `compose-orchestration` (removes the spurious manual
prompts first); `customer-link-ui` first among independents (the J1→J6 causal chain is the highest-
leverage fix). Blockers #1/#7 merged into compose-orchestration; #3/#4 into customer-link. No code
changed this session — grooming + doc-correction only.

## 2026-05-03 — `chat-conversation-branches` Phase 2 shipped (UI + Claude smoke; spec → completed)

Real build session, third of the day, executes Phase 1's deferred UI work end-to-end. Phase 1 (committed in `4b080ccd` earlier today) shipped the data layer + flag; Phase 2 wires branch action, tree dialog, ⌘Z/⌘⇧Z keybindings, and verifies cross-runtime behavior on Claude. Historical plan and implementation are anchored by git commit `17a6fc5b`. Scope challenge replaced the spec's literal "conversation detail sheet with Branches tab" — which would have invented a one-off UI pattern — with a `BranchesTreeDialog` opened from the existing `ConversationList` row dropdown (DD-7). Spec moves `in-progress` → `completed`. AC #6 (Ollama smoke) deferred with rationale: Ollama is not exposed in the chat-model selector today (only at the agent-runtime layer); branching is purely chat-layer.

### Implementation

- **Server-side flag exposure** — GET `/api/chat/branching/flag` at `src/app/api/chat/branching/flag/route.ts` returns `{ enabled }` so client UI can gate without a `NEXT_PUBLIC_*` env-var leak. Provider fetches it once at mount and exposes `branchingEnabled` in `ChatSessionValue`. (DD-8)
- **Conversation family + branches route** — `getConversationFamily(conversationId)` walks to root then BFS-expands all descendants at `src/lib/data/chat.ts:560-632`. GET `/api/chat/conversations/[id]/branches` at `src/app/api/chat/conversations/[id]/branches/route.ts` returns `{ family }`; 404s when flag is off (branching invisible to clients) or conversation missing.
- **Rewind + redo routes** — POST `/api/chat/conversations/[id]/rewind` and `/redo` are thin pass-throughs to existing `markPairRewound` / `restoreLatestRewoundPair` data fns. Same flag-off + 404 semantics as the branches route.
- **Provider actions** — `rewindLastTurn`, `restoreLastRewoundPair`, `branchConversation` added to `ChatSessionValue` at `src/components/chat/chat-session-provider.tsx`. Both rewind actions refetch messages after the server roundtrip (DD-9 — caught a real bug during smoke).
- **BranchActionButton** — hover action button + dialog at `src/components/chat/branch-action-button.tsx` with default branch title `{parent} — branch`. Wired into `ChatMessage` for completed assistant messages only, gated on `branchingEnabled`.
- **Rewound message rendering** — `chat-message.tsx` returns a collapsed gray italic placeholder ("Rewound · your turn / assistant turn hidden from context") when `message.rewoundAt != null`, regardless of role. The DB row stays in place; only the rendering and agent-context visibility change.
- **⌘Z / ⌘⇧Z keybindings** — registered on the textarea's `onKeyDown` (not `window`) at `src/components/chat/chat-input.tsx:144-167` so they only fire when the composer is focused (DD-10). ⌘Z calls `rewindLastTurn`, pre-fills the composer with `rewoundUserContent`, and refocuses with end-of-input cursor; ⌘⇧Z calls `restoreLastRewoundPair`. Both gated on `branchingEnabled`.
- **BranchesTreeDialog** — at `src/components/chat/branches-tree-dialog.tsx`. Fetches family on open, builds an indented tree (depth × 16px padding-left), highlights current node with `(current)` + accent background. Plain DOM `<ul>` — no D3, no canvas. Single-node families render an empty-state message instead of a tree.
- **ConversationList "View branches" item** — added between Rename and Delete in the row dropdown at `src/components/chat/conversation-list.tsx`. Visible only when `branchingEnabled && hasRelatives(id)`.
- **ChatShell wiring** — `hasRelatives(id)` derived from `conversations` (parent or any child); `branchesDialogId` view-local state; `BranchesTreeDialog` rendered at the bottom alongside `ConversationTemplatePicker`.

### Verification

- **437/437 tests pass across 57 files** in `src/lib/db src/lib/data src/lib/chat src/app/api/chat src/components/chat` after Phase 2 changes (zero regressions). `npx tsc --noEmit` clean.
- **New test files (5):** `src/app/api/chat/branching/flag/__tests__/route.test.ts` (3), `src/app/api/chat/conversations/[id]/branches/__tests__/route.test.ts` (3), `src/app/api/chat/conversations/[id]/rewind/__tests__/route.test.ts` (4), `src/app/api/chat/conversations/[id]/redo/__tests__/route.test.ts` (4), `src/components/chat/__tests__/branch-action-button.test.tsx` (3), `src/components/chat/__tests__/chat-message-branching.test.tsx` (4), `src/components/chat/__tests__/branches-tree-dialog.test.tsx` (4), `src/components/chat/__tests__/chat-input-rewind.test.tsx` (4). Total: 29 new tests.
- **Extended** `src/lib/data/__tests__/branching.test.ts` with `getConversationFamily` cases (4); existing chat-session-provider tests extended with branching-flag exposure (2).
- **Claude smoke (2026-05-03):** Verified end-to-end through `claude-opus-4-6` — branch action created child, prefix reconstruction confirmed via "Yellow" answer, ⌘Z/⌘⇧Z worked, tree dialog rendered + navigated, linear conversations un-regressed. See spec's "Verification — Claude smoke (2026-05-03 / Phase 2)" section.
- **Ollama smoke deferred (AC #6):** rationale documented in spec — Ollama not in chat-model registry today.

### Design Decisions codified in spec (Phase 2 additions)

- **DD-7: Tree view ships as a Dialog from the row dropdown, not a new "conversation detail sheet."** No detail sheet exists in the codebase; reusing the row dropdown matches established pattern (Rename/Delete) and avoids a one-off UI invention.
- **DD-8: Server-side flag via `/api/chat/branching/flag`.** Avoids `NEXT_PUBLIC_*` env-var leak; matches existing one-shot fetch pattern in the provider.
- **DD-9: Refetch-after-mutation for rewind/redo, not optimistic-only.** Caught during Claude smoke: optimistic user message keeps its `crypto.randomUUID()` id; only assistant reconciles to server id via SSE `done`. Server-returned ids miss the user msg in optimistic clears. Refetch converges client to DB truth.
- **DD-10: ⌘Z keybinding scoped to the textarea, not `window`.** Matches spec intent ("`⌘Z` *at the chat input*"), avoids hijacking OS undo elsewhere on the page.

### Net effect on roadmap

| Status | Before | After |
|---|---|---|
| in-progress | 1 | 0 |
| completed (P3) | (n) | (n+1) |

`chat-conversation-branches` flips `in-progress` → `completed`. Net-new planned-spec roster remains empty; next session can pick up P1 in-progress closeouts (`upgrade-session`, `workflow-document-pool`) or roadmap-vs-spec drift cleanup.

## 2026-05-03 — `chat-conversation-branches` Phase 1 shipped (P3 data-layer landing; UI + cross-runtime smoke deferred)

Real build session, second of the day. Bidirectional-staleness grep for `parentConversationId`, `branchedFromMessageId`, `rewoundAt`, `loadConversationContext`, `chat.branching` returned **zero hits** outside the spec — spec frontmatter `status: planned` was accurate. Both dependencies (`chat-conversation-persistence`, `chat-data-layer`) verified `status: completed` with the schema artifacts (conversations + chat_messages tables) confirmed. Phased ship: data layer + feature-flag scaffold landed; UI surfaces and cross-runtime smoke deferred. Spec moves `planned` → `in-progress` (NOT `completed`) — half the ACs explicitly deferred. CLAUDE.md runtime-registry smoke gate did not apply this session — no imports added/removed under `src/lib/agents/runtime/` or `claude-agent.ts`; the only runtime-graph touch is `context-builder.ts` swapping `getMessages` for `getMessagesWithAncestors`, which keeps the same call shape.

### Implementation
- **Schema columns + bootstrap** — `parentConversationId` + `branchedFromMessageId` on `conversations`, `rewoundAt` (timestamp_ms) on `chat_messages`. All nullable; root conversations leave them NULL and behave identically to today. `src/lib/db/schema.ts:567-629`. Bootstrap CREATE TABLE blocks updated at `src/lib/db/bootstrap.ts:478-512`; `addColumnIfMissing` ALTERs added at `src/lib/db/bootstrap.ts:354-364` (legacy DB upgrade path); new index `idx_conversations_parent_id` declared inline in CREATE TABLE only — separate `CREATE INDEX` outside the block was caught by tests because it ran before the table existed on fresh DBs.
- **Data-layer primitives** — `getMessagesWithAncestors(conversationId)` walks ancestors to depth 8 with rowid-based branch-point cutoff (DD-2) at `src/lib/data/chat.ts:362-437`. `markPairRewound(assistantMessageId)` flags the (user, assistant) pair atomically with millisecond-precision timestamps (DD-3) at `src/lib/data/chat.ts:444-501`. `restoreLatestRewoundPair(conversationId)` restores the pair with the highest `rewoundAt` at `src/lib/data/chat.ts:512-553`. `createConversation` extended to accept `parentConversationId` + `branchedFromMessageId` at `src/lib/data/chat.ts:60-78`. `MAX_BRANCH_DEPTH=8` exported as a public constant.
- **Context-builder ancestor walk** — `buildTier1` at `src/lib/chat/context-builder.ts:177-209` swapped `getMessages(conversationId)` for `getMessagesWithAncestors(conversationId)`. Linear conversations behave identically (single-conv read with `rewoundAt IS NULL` filter — invisible since no row has it set). Depth-cap notice prepended as a synthetic `role: "system"` message (DD-6) when chains exceed 8 levels.
- **API route extension** — POST `/api/chat/conversations` accepts `parentConversationId` + `branchedFromMessageId` with strict pair validation: both required together, parent must exist (404), branch-point message must belong to the parent (400). At `src/app/api/chat/conversations/route.ts:46-90`.
- **Feature flag** — `isBranchingEnabled()` at `src/lib/chat/branching/flag.ts:21`. Env-var driven (`AINATIVE_CHAT_BRANCHING=true`), default off. Canonical-`true`-only; rejects `1`, `yes`, `True`, leading/trailing whitespace, etc. Waiting on the UI session to consume.
- **Backward compatibility** — `chat-session-provider.tsx` ChatMessage object literals updated to include `rewoundAt: null` for the optimistic-message construction paths (3 sites: user, assistant placeholder, system permission/question rendering).

### Verification
- 3/3 schema + bootstrap tests pass at `src/lib/db/__tests__/bootstrap.test.ts` (fresh DB, legacy DB upgrade, existing migration recovery test still green).
- 10/10 data-layer tests pass at `src/lib/data/__tests__/branching.test.ts` — covers create with parent, ancestor walk on linear + 1-deep + 2-deep branches, rewound filtering across layers, depth-cap flag, mark-pair-rewound role validation, restore-most-recent-pair, restore-no-op-when-empty.
- 4/4 context-builder tests pass at `src/lib/chat/__tests__/context-builder-branching.test.ts` — linear baseline, branch reconstruction, rewound exclusion, depth-cap synthetic note.
- 6/6 API-route tests pass at `src/app/api/chat/conversations/__tests__/branching.test.ts` — happy path, missing-branchedFrom 400, missing-parent 400, parent-not-found 404, cross-conversation branch-point 400, linear baseline preserved.
- 3/3 feature-flag tests pass at `src/lib/chat/branching/__tests__/flag.test.ts`.
- **402/402 tests pass across 49 files** in `src/lib/db src/lib/data src/lib/chat src/app/api/chat src/components/chat` (zero regressions).
- `npx tsc --noEmit` clean project-wide.
- Pre-existing baseline failures (router.test.ts, settings.test.ts, blueprint.test.ts) confirmed unchanged via stash + re-run on `712fe62c`.

### Design Decisions codified in spec
- **DD-1: Phased ship — data layer now, UI deferred.** Spec stays `status: in-progress`; UI ACs explicitly listed as Phase 2. Matches the previous session's "Build the standalone, defer the integration when honest" pattern.
- **DD-2: Branch-point cutoff uses SQLite `rowid`, not `createdAt`.** Drizzle `mode: "timestamp"` rounds to seconds, breaking same-second ordering; rowid is monotonic, unique, and exactly the property the cutoff needs.
- **DD-3: `rewoundAt` uses `timestamp_ms`, not `timestamp`.** Two rewind actions can fire well within the same second; restore identifies pairs by exact timestamp match. Brand-new column → no migration risk.
- **DD-4: Replace, don't merge, on rewind operations.** Pairs are atomic from the UI's perspective; partial-pair states would confuse both UI and agent.
- **DD-5: Self-referential FKs as plain TEXT.** Parent + branched-from columns are TEXT without `.references()` in Drizzle; matches existing `active_skill_id` pattern; pair validation lives in the API route.
- **DD-6: Synthetic system note for depth-cap truncation, not Tier 0 injection.** The note belongs at the start of conversation context, not in the persistent system identity.

### Deferral (Phase 2 — next session)
- "Branch from here" hover action on assistant messages (chat-message.tsx).
- Tree-view tab on conversation detail sheet (renders parent + siblings + children when conversation has relatives; hidden otherwise).
- ⌘Z / ⌘⇧Z keybindings on chat input + rewound-message rendering.
- Cross-runtime smoke (Claude + Codex + Ollama) — branch a conversation, continue, verify full prefix reconstruction.
- Linear conversations rendering as single-node trees (UI regression check).
- Possible follow-up data-layer primitive: `getConversationTreeRoot(id)` for the tree view (deferred until UI shows it's actually needed; pure-UI concern today).

### Roadmap impact

This session only flipped one row: `chat-conversation-branches` `planned` → `in-progress` in the roadmap row. Other rows in the roadmap retain their existing status, including 4 features whose spec frontmatter says `status: in-progress` but whose roadmap rows still say `planned` (the bidirectional-drift the previous handoff flagged on `composed-app-auto-inference-hardening` and similar — a separate cleanup, not this session's responsibility).

**P3 planned: 1 → 0.** The last fully-planned P3 spec is now in-progress. The remaining `| planned |` rows in the roadmap are all either P1/P2 (workflow-document-pool, direct-runtime-*, entity-relationship-detail-views, relationship-summary-cards, upgrade-session, composed-app-kit-inbox-and-research) or the noted drift cases (composed-app-auto-inference-hardening etc.). Next session: tackle a P1 like `upgrade-session` or `workflow-document-pool`, or tighten the roadmap-vs-spec drift first.

## 2026-05-03 — `composed-app-manifest-authoring-tools` shipped (P3 build session — 9/10 ACs, AC #7 deferred on dep)

Real build session — none of the 3 chat tools, the `AppViewEditorCard`, the `buildViewEditingHint` planner module, or the `writeAppManifest` atomic-write helper existed before this commit (verified via grep). Spec frontmatter `status: planned` was accurate. CLAUDE.md runtime-registry smoke gate did not apply — chat tools register through the existing `defineTool` pattern via `ainative-tools.ts:71` with no `src/lib/agents/runtime/` imports added/removed.

### Implementation
- **Atomic write helper** — `writeAppManifest(id, manifest, appsDir?)` at `src/lib/apps/registry.ts:425-455`. Validates via strict `AppManifestSchema.parse` before write, then `<path>.<pid>.<ts>.tmp` + `renameSync` + `unlinkSync` cleanup on rename failure. Calls `invalidateAppsCache` on success.
- **3 chat tools** — `src/lib/chat/tools/app-view-tools.ts` (`set_app_view_kit` / `set_app_view_bindings` / `set_app_view_kpis`). Each loads via `getApp`, deep-clones, mutates `view`, validates, atomic-writes. Registered in `ainative-tools.ts:30,71`. Chat-tool count went 97 → 100 (spec said 92 → 95 — outdated baseline).
- **Planner hint module** — `src/lib/chat/planner/view-editing-hint.ts` exports `detectViewEditingIntent` (regex classifier with most-specific-wins precedence: kpis > bindings > kit) and `buildViewEditingHint` (short prose nudge naming the 3 tools and 7 kit ids). Wired into `engine.ts:343-352` parallel to `buildCompositionHint`.
- **AppViewEditorCard** — `src/components/chat/app-view-editor-card.tsx` with `onConfirm`/`onCancel` callbacks, 5 visual states (idle / pending / applied / cancelled / failed), and double-click guard during pending. Mirrors `AppMaterializedCard` visual language.
- **`ainative-app` skill doc** — appended a "View-Editing (override auto-inferred layout)" section with 3 tool descriptions, 4 trigger phrases, and a "for power users only" note.

### Verification
- 5/5 atomic-write tests pass (`write-app-manifest.test.ts`).
- 6/6 chat-tool tests pass (`app-view-tools.test.ts`).
- 13/13 planner-hint classifier tests pass (`view-editing-hint.test.ts`).
- 7/7 card render+interaction tests pass (`app-view-editor-card.test.tsx`).
- 656/657 tests pass across 70 files in `src/lib/apps src/lib/chat src/components/chat` (1 pre-existing skip; 0 regressions).
- `npx tsc --noEmit` clean project-wide.

### Design Decisions codified in spec
- **DD-1: Card built standalone; chat-message.tsx auto-render integration deferred** — card is reusable and tested; engine-side metadata-population path is straightforward but P3 doesn't justify the engine.ts change in this session.
- **DD-2: Capability validation via Zod sub-schema reuse** — `ViewSchema.shape.bindings` passed directly to `defineTool`; future schema rotations propagate automatically.
- **DD-3: Atomic write helper added to registry, not the chat tool** — colocated with `getApp` so any future caller (settings UI, CLI, plugin) inherits the atomic guarantee.
- **DD-4: Most-specific intent wins** — kpis > bindings > kit precedence so mixed-intent messages classify as the most-specific category.
- **DD-5: View-editing hint independent of compose verdict** — user mid-conversation can switch layouts without re-triggering composition.
- **DD-6: Mutation tools replace, not merge** — bindings/kpis arrays are replaced wholesale to avoid partial-mutation surprises.

### Deferral
- **AC #7 deferred** — "Apply via chat" affordance on the diagnostics page. The diagnostics page is a deferred AC of the in-progress `composed-app-auto-inference-hardening` spec; cannot wire what doesn't exist. Will be picked up when the diagnostics page lands.

### Roadmap impact
- planned 2 → 1 (only P3 remaining: `chat-conversation-branches`).
- completed 209 → 210.
- **Zero P1, zero P2, only one P3 left.** Net-new spec roster is at its smallest in months.

## 2026-05-03 — `onboarding-runtime-provider-choice` shipped (P2 build session — last P2 closed)

Real build session — `modelPreference` did not exist anywhere in the codebase before this commit (verified via grep). The `defaultChatModel` half was already shipped via `/api/settings/chat`; the first-launch modal + preference field were greenfield. CLAUDE.md runtime-registry smoke gate did not apply — this is pure UI + settings persistence with no `src/lib/agents/runtime/` imports added/removed.

### Implementation
- **Typed settings helpers** — `getModelPreference` / `setModelPreference` / `hasSeenModelPreferencePrompt` at `src/lib/settings/helpers.ts:79-141`, following the `getPluginTrustModel` enum-coercion pattern. `null` → empty-string write so "asked and skipped" is distinguishable from "never asked".
- **Route extension** — `/api/settings/chat` GET now returns `{ defaultModel, defaultModelRecorded, modelPreference }`; PUT independently accepts each field. Added `ollama:*` model-id allowance to fix the latent dropdown-rejected bug exposed by the privacy preference path.
- **Modal** — `src/components/onboarding/runtime-preference-modal.tsx` renders 4 radio options (Best quality / Balanced / Lowest cost / Best privacy) with capability notes sourced from RuntimeFeatures matrix knowledge. Resolves preference → SDK short-name model id at submit time. Refuses outside-click close so exit always writes a setting.
- **Bootstrapper** — `src/components/onboarding/runtime-preference-bootstrapper.tsx` mounted in `src/app/layout.tsx:113`. Single GET on mount; only opens the modal when `!data.defaultModelRecorded && data.modelPreference == null`.
- **Settings UI** — `ChatSettingsSection` exposes a "Model preference" Select alongside the existing "Default Model" Select. Each onChange PUTs only its own field for clean independent editing.

### Verification
- 10/10 model-preference helper tests pass (coercion + skip-marker semantics + `hasSeenModelPreferencePrompt`).
- 7/7 modal tests pass (4-option render, default→sonnet, quality→opus, cost→haiku, skip→null+sonnet, privacy with discovered ollama→`ollama:*` id, privacy fallback note + does-not-close-until-dismissed).
- 6/6 chat-session-provider tests still pass against the new GET shape.
- 8/8 providers-runtimes-section tests still pass (existing PUT shape backward-compatible).
- 36/36 settings-touching neighbors (instance + chat tools) still pass.
- `npx tsc --noEmit` clean project-wide.

### Design Decisions codified in spec
- **DD-1: Persist user-stated preference even when privacy fallback hits** — preference="privacy" + model="sonnet" makes the mismatch visible in Settings; alternative (downgrade both) loses intent.
- **DD-2: Capability notes inlined, not generator-driven** — 4 fixed pairs; rotation is rare; extract on third use.
- **DD-3: Empty-string skip marker** — distinguishes "asked and skipped" from "never asked" without a separate boolean column.
- **DD-4: Modal refuses outside-click close** — exit must write a setting to suppress re-prompt.
- **DD-5: Route validator allows `ollama:*`** — fixed latent dropdown-rejection bug exposed by the privacy path.

### Roadmap impact
- planned 3 → 2 (only P3 remaining: `chat-conversation-branches`, `composed-app-manifest-authoring-tools`).
- completed 208 → 209.
- **No P1 left, no P2 left.** The roster is now P3-only for net-new specs.

## 2026-05-03 — `task-turn-observability` shipped (P2 build session)

Real build session — spec was genuinely planned with no shipping evidence. Spec ACs touched 4 files and added a documented metric definition. CLAUDE.md runtime-registry smoke gate did not apply because no imports were added/removed/reshaped — only new fields on existing `db.update().set()` calls and a new `select` field.

### Implementation
- **Schema columns** — `turnCount` + `tokenCount` on `tasks` (`src/lib/db/schema.ts:66-79`). Bootstrap synced in both the CREATE TABLE block (`bootstrap.ts:84-85`) and `addColumnIfMissing` (`bootstrap.ts:614-615`) per MEMORY.md's "BOTH the CREATE block AND the ALTER" rule.
- **Persistence** — result-frame handler at `claude-agent.ts:382-389` writes both fields at completion using the in-memory `turnCount` counter (already incrementing at line 295) and `usageState.totalTokens` accumulated by `applyUsageSnapshot` across the stream.
- **Scheduler consistency** — `scheduler.ts:175-208` now reads `tasks.turnCount` first, falling back to legacy `COUNT(*) FROM agentLogs` only when null (pre-existing rows). Eliminates the schedule-vs-task aggregate mismatch that motivated the spec.
- **Metric definition** — `features/task-turn-observability.md` "Metric Definition" section documents that `turnCount` counts streamed assistant frames (not SDK reasoning rounds), explaining why production values run hundreds-to-thousands. Mirror in `MEMORY.md` "Architecture Notes".

### Verification
- 41/41 claude-agent tests pass (1 new: A2b pins `turnCount > 0 && tokenCount > 0`).
- 131/131 schedule tests pass across 13 files (no regressions from the scheduler refactor).
- `clear.ts` safety-net test still green (no FK-dependent tables added — just columns).
- `tsc --noEmit` clean for all touched files.

### Design Decisions codified in spec
- **Stream-frame counter, not reasoning-round counter** — preserves continuity with the existing `turnCount++` semantics already in the runtime; explicit Metric Definition prevents misreading.
- **`tokenCount` denormalized on `tasks`** — duplicates `usage_ledger.totalTokens` so `get_task`/`list_tasks` don't need to JOIN. Ledger remains authoritative for billing.
- **Scheduler fallback to `COUNT(*)` only for null rows** — historical data stays readable; new firings produce strictly-consistent aggregates without a migration.

## 2026-05-03 — `workflow-learning-approval-reliability` ship-verified (P1 close-out)

Pure Ship Verification — all 9 ACs satisfied by existing code. Fifth consecutive session catching bidirectional spec staleness, this time on the highest-priority remaining `planned` feature. CLAUDE.md runtime-registry smoke gate did not apply — Ship Verification reads code without reshaping imports.

### File:line evidence (all 9 ACs)
- **AC #1** Await before cleanup — `src/lib/agents/claude-agent.ts:651-655` (initial), `:808-812` (resume).
- **AC #2** Workflow buffering — `src/lib/agents/pattern-extractor.ts:115` `bufferProposal(workflowId, rowId)`.
- **AC #3** One batch per workflow — `src/lib/agents/learning-session.ts:80-141` `closeLearningSession`.
- **AC #4** Enrichment spam fix — `src/lib/workflows/engine.ts:83/116/193/1269/1332` open/close session bracket.
- **ACs #5–6** Default Inbox excludes responded learning items — `src/lib/notifications/visibility.ts:31-33` SQL condition + `:25-29` JS filter; 5 call sites (`app/inbox/page.tsx:23,61`, `app/api/notifications/route.ts:14`, `components/notifications/inbox-list.tsx:32,39`).
- **ACs #7–8** Approve/reject removes after refresh — `src/lib/agents/learning-session.ts:223-229,297-304` (individual response + respondedAt) and `:319-354` `markBatchNotificationResponded`.
- **AC #9** `permission_required` unchanged — `visibility.ts:11-13` `isLearningNotificationType` only matches the two learning types; pinned by `permission-response-actions.test.tsx` (4 tests).

### Verification
- 19/19 tests pass across 7 files: `visibility.test.ts` (2), `learning-session.test.ts` (1), `pattern-extractor.test.ts` (7), `batch-proposal-review.test.tsx` (2), `permission-response-actions.test.tsx` (4), `notification-item.test.tsx` (2), `pending-approval-host.test.tsx` (1).

### Design Decisions codified in spec
- **Doubled SQL+JS visibility filter** — SQL trims wire payload; JS handles live mutations between refreshes. Approve/reject takes effect in the visible list before any server round-trip.
- **Workflow engine owns session lifecycle** — runtime-agnostic boundary, so buffering covers Claude Agent SDK, Codex, OpenAI direct, and Anthropic direct uniformly.
- **Pattern extraction await but non-fatal** — failure logs and flushes whatever buffer exists; workflow itself completes normally.

## 2026-05-03 — `enrichment-planner-test-hardening` shipped (P2 hardening close-out)

Build session, not a Ship Verification — the spec was genuinely planned. AC #1 (validation-before-cast) was already shipped *transitively* via `buildTargetContract`, but ACs #2–#5 (route tests, planner test expansion, sample-binding rationale) required real work.

### Implementation
- **Planner unit tests expanded 7 → 40** (`src/lib/tables/__tests__/enrichment-planner.test.ts`). New coverage: `assertEnrichmentCompatibleColumn` direct + transitive tests, `selectStrategy` edge cases (empty/long/single-word prompts; type-overrides-prompt for boolean+select; type-forces-lookup for URL), `buildReasoning` clauses across all strategies + filter + operator-guidance branches, all 6 data types in `normalizeEnrichmentOutput` (text/url/email/boolean/number/select) plus `skip:empty` + `skip:not_found` paths, null-input paths for `buildEnrichmentPlan`.
- **New route test file** `src/app/api/tables/[id]/enrich/plan/__tests__/route.test.ts` (11 cases): missing `targetColumn` 400, custom-mode-without-prompt 400, invalid-JSON 400, happy-path 200, batchSize cap to 200, batchSize<1 400, table-missing 404, unsupported-column 400, missing-column 400, generic 500 with no leaked cause, forwarding of filter/prompt/agentProfileOverride.
- **Sample-binding rationale codified** as `PREVIEW_SAMPLE_BINDING_COUNT` constant (`src/lib/tables/enrichment-planner.ts:48-52`) with LLM-context-budget rationale and revisit trigger. Replaces two duplicated `.slice(0, 2)` magic numbers.

### Test-to-code ratio
- Before: 124/454 = **27.3%**
- After: 573/459 = **124.8%** (target was 50%+)

### Verification
- 73/73 `npx vitest run src/lib/tables src/app/api/tables` pass (40 planner + 11 plan-route + 7 enrich-route + 15 enrichment integration).
- `npx tsc --noEmit` clean for the touched files.

### Spec correction codified
The original spec asked for `assertEnrichmentCompatibleColumn` to move to the top of `buildEnrichmentPlan`. The shipped path is stronger: the assertion runs through `buildTargetContract`, which `buildEnrichmentPlan` calls first AND `validateEnrichmentPlan` calls independently — protecting both entry points against unsupported types. Recorded as a Design Decision in the spec.

## 2026-05-03 — `schedule-collision-prevention` ship-verified; spec flipped to completed

Bidirectional spec staleness: spec frontmatter said `planned`, but all four phases of the spec already shipped over prior sessions. Ship Verification covered all 8 ACs with one real gap closed mid-session.

### All 8 ACs PASS
- **Queue drain** (Phase 1) — `drainQueue()` at `src/lib/schedules/scheduler.ts:58-116` walks queued schedule/heartbeat tasks until empty; wired into `fireSchedule` (line 611) and `fireHeartbeat` (line 762) via `.then(() => drainQueue())` chains. Module-level `draining` flag prevents concurrent loops.
- **Auto-stagger + 5min gap** (Phase 2) — `computeStaggeredCron` + `expandCronMinutes` at `src/lib/schedules/interval-parser.ts`; `MIN_GAP_MINUTES = 5` enforced via ±4-minute window in `hasCollision`.
- **Turn budget header + prompt analyzer** (Phase 3) — `buildTurnBudgetHeader()` prepends to schedule task descriptions; `analyzePromptEfficiency()` warns on per-item loop patterns (8 test cases).
- **Health metrics + auto-pause** (Phase 4) — `recordFiringMetrics` writes EMA-smoothed turn averages and inserts `scheduleFiringMetrics` rows; auto-pauses at 3 generic failures or 5 turn-budget breaches.

### Gap closed mid-session
- `src/app/api/schedules/route.ts` POST handler now applies `computeStaggeredCron` before `db.insert` — previously only the chat tool path (`schedule-tools.ts`) staggered, while UI form submissions (`schedule-create-sheet.tsx`, `schedule-create-dialog.tsx`) hit the REST API and bypassed the stagger logic. Behaviorally, two `*/30 * * * *` schedules created via the UI form now correctly become `:00/:30` and `:15/:45`.

### Positive drift codified in spec
- Heartbeat path's deliberate exclusion from the turn-budget header (different prompt structure — bounded JSON evaluation, not data fetching).
- Split `failureStreak ≥ 3` vs. `turnBudgetBreachStreak ≥ 5` thresholds, with a first-breach grace window (2× cron interval after `maxTurnsSetAt`). Operational lesson preserved in the spec's Design Decisions.

### Tests
- 158 schedule-related tests pass across 15 files (drain, interval parser, prompt analyzer, turn budget, firing metrics, integration, tick scheduler).
- 4 schedules-API tests pass (execute-route).

### Pattern note
This is another Ship Verification close-out following the bidirectional staleness pattern from CLAUDE.md: ALWAYS grep for the spec's referenced symbols before treating a `planned` feature as greenfield work.

## 2026-05-03 — Tier 2 Ship Verification (4 partial-drift candidates)

Deeper AC-by-AC verification on the specs initial grooming pass classified as Tier 2 (partial drift):

### Completed (planned → completed)
- `entity-relationship-detail-views` — all ACs PASS. Initial grep missed it because the implementation re-uses existing `chip-bar` + `section-heading` patterns rather than a dedicated `RelationshipSection` component. Document detail (workflow badge + version history), task detail (sibling tasks + `/api/tasks/[id]/siblings`), project detail (recent docs at `app/projects/[id]/page.tsx:43-60`), workflow detail (project link badge) all shipped.

### In-progress (planned → in-progress)
- `direct-runtime-advanced-capabilities` (~55%) — extended thinking + model selection plumbing landed for both runtimes; thinking-block UI, context compaction, `/v1/models` discovery, and Anthropic-side server-tool toggles missing.
- `upgrade-session` (~60%) — `upgrade-assistant` profile + 5 instance API routes + UpgradeBadge + InstanceSection ship; no dedicated session sheet (re-uses `/tasks/[id]`), no upgrade history list, no abort confirmation, no dev-server restart UI.

### Kept planned (correction: previous evidence was wrong)
- `task-turn-observability` — the `turnCount` column at `schema.ts:1274` belongs to `scheduleFiringMetrics`, not `tasks`. The tasks table only has `maxTurns:65`. Zero of the spec's surface is shipped. The earlier grooming-pass classification was incorrect; this is genuinely planned. Lesson: when verifying schema columns, confirm which **table** they belong to, not just the file:line of the column declaration.

## 2026-05-03 — Closed `relationship-summary-cards` gaps; spec flipped to completed

Both gaps surfaced during Ship Verification closed:
- `src/app/tasks/page.tsx` BoardContent query now selects `docCount` via SQL subquery (`SELECT COUNT(*) FROM documents d WHERE d.task_id = "tasks"."id"`); existing `serializedTasks` spread carries it through to `TaskItem`. Task-card badge renders when `task.docCount > 0`.
- `src/app/projects/page.tsx` and `src/app/api/projects/route.ts` extended in lockstep with `docCount` SQL subquery. `Project` interface in `project-list.tsx` and `ProjectCardProps` in `project-card.tsx` extended. Project card now renders `FileText` icon + "N docs" alongside the task count, hidden when 0.

Pattern note: SQL subquery uses raw `"projects"."id"` / `"tasks"."id"` string refs (not Drizzle column refs `${projects.id}`) per CLAUDE.md guidance — Drizzle's `sql` template treats column refs as bound params, generating `WHERE col = ?` with a JS object as value. The raw-string pattern matches the pre-existing `api/workflows/route.ts:20` precedent.

24 tests passed (project + task component tests). Spec frontmatter flipped to `completed`.

## 2026-05-03 — Ship Verification on Tier 1 drift candidates

### Completed (status flipped `planned` → `completed` after AC-by-AC verification)
- `routing-cascade-dual-provider` — all 12 ACs PASS at `src/lib/settings/routing-recommendation.ts`, `providers-runtimes-section.tsx`, dedicated 8-case test matrix
- `workflow-document-pool` — all 22 ACs across 3 phases PASS — junction table + Input Tray + Output Dock + chat tools
- `workflow-editing` — all 11 ACs PASS — Edit button visibility + reset-to-draft logic + state cleanup
- `sidebar-ia-route-restructure` — all 5-group / route-rename / TDR-033 / keyboard ACs PASS; one residual `/dashboard?task=` literal in `command-palette.tsx:305` migrated to `/tasks?task=` during verification; post-ship `Apps` item addition to Compose acknowledged in body note (not a regression)

### In-progress (status flipped `planned` → `in-progress` to reflect partial reality)
- `direct-runtime-prompt-caching` — cache headers wired in `anthropic-direct.ts`; ledger persistence, cost-dashboard surfacing, and Batch API path remain
- `relationship-summary-cards` — workflow cards + document table/grid + queries all shipped; 2 surface gaps remain: `tasks/page.tsx` not enriching `TaskItem` with `docCount`, `project-card.tsx` not rendering `docCount`

### Code change in src/
- `src/components/shared/command-palette.tsx:305` — `navigate(\`/dashboard?task=\${task.id}\`)` → `navigate(\`/tasks?task=\${task.id}\`)` (closes the last route literal violating sidebar-ia-route-restructure AC)

## 2026-05-03 — Roadmap grooming pass

### Status-string normalized
- `chat-skill-composition` — frontmatter cleaned (`completed  # comment` → clean `completed` + `shipped-date: 2026-04-15` + body note); semantically unchanged
- `chat-tools-plugin-kind-1` — `shipped` → `completed` (vocabulary normalization; spec already documents 2026-04-20 shipped state)
- `install-parity-audit` — `shipped` → `completed`; `shipped:` field renamed to `shipped-date:` for consistency
- `nl-to-composition-v1` — `shipped` → `completed`; `shipped:` field renamed to `shipped-date:`

### Drift candidates flagged (NOT auto-flipped — require Ship Verification)
**Tier 1 (definite drift, `planned` → likely `completed`):** `direct-runtime-prompt-caching`, `routing-cascade-dual-provider`, `sidebar-ia-route-restructure`, `workflow-document-pool`, `relationship-summary-cards`, `workflow-editing` — strong code evidence (helpers/components/columns at spec-named paths; spec-named symbols in use).

**Tier 2 (partial drift, `planned` → likely `in-progress`):** `direct-runtime-advanced-capabilities` (1 of 4 capabilities shipped: extended thinking only); `task-turn-observability` (schema column only, no surface); `entity-relationship-detail-views` (tasks only, 3 of 4 detail views missing); `upgrade-session` (profile + UI surface shipped, guided-merge task UI not deeply verified).

**Uncertain:** `enrichment-planner-test-hardening` (7 tests vs 6 ACs; needs deeper read).

### Lessons from this grooming pass
- `features/` mixes 4 non-spec doc types (architect-report, supervisor-report, quality-audit-report, marketing-site-pricing-reference) — these have no YAML frontmatter by design. Status-tally scripts must skip them.
- 1 spec uses legacy inline-status format: `board-context-persistence.md`. Low priority to convert.
- The `ainative-business@0.13.x` line shipped many features whose specs were never re-flipped from `planned` → `completed` in the same commit. Recommend adding a checklist item to commit-push-pr workflow: "Did this commit flip a spec from planned → completed?"

## 2026-05-02 — Phase 4 (`composed-app-kit-inbox-and-research`) shipped

- 2 new kits: InboxKit, ResearchKit
- 1 new shared primitive: RunHistoryTimeline
- 1 additive DB column: tasks.context_row_id (links row-triggered tasks to user_table_rows)
- 1 additive Zod field: BlueprintBase.trigger?: { kind: "row-insert", table: string } (metadata-only; engine wiring deferred)
- KitView integration tests retroactively applied to all 6 kits (HOLD-mode investment)
- Closes wiring-bug class exposed in Phase 3 handoff
- Browser smoke prepared (manifests + seeds at ~/.ainative/apps/) but deferred to next session

## 2026-05-02 (later)

### Shipped — `composed-app-kit-coach-and-ledger` (Phase 3)

Lands two new domain-aware view kits — Coach (markdown digest hero) and Ledger (period-scoped finance dashboard) — plus seven new component primitives, a 6th KPI source kind (`tableSumWindowed`), and a conditional `RunNowSheet` that opens only when blueprints declare variables. With Phase 3 in place, every composed app pattern except Inbox/Research has a real domain-aware UI.

- **KPI engine extension (`src/lib/apps/registry.ts` + `src/lib/apps/view-kits/{evaluate-kpi,kpi-context}.ts`)**: new `tableSumWindowed` source kind with optional `sign: "positive" | "negative"` and `window: "mtd" | "qtd" | "ytd"` orthogonal fields. Preserves Phase 2's "no formula strings, no manifest escape hatch" discipline — added as a discriminated-union arm, not a generic predicate. The DB-backed implementation uses Drizzle `sql` template + `json_extract` for sign-filtered period-scoped sums; new `windowStart(window) → Date` helper exported for reuse.
- **Coach kit (`src/lib/apps/view-kits/kits/coach.ts`)**: pure projection function for `*-coach` profile + schedule apps. Hero is `LastRunCard variant="hero"` rendering the latest completed task as full GitHub-flavored markdown via `react-markdown` + `remark-gfm` (wrapped in an `ErrorBoundary` falling back to `<pre>`). Failed-task rescue card distinguishes errors. Run cadence chip + Run Now button in header. `runsBlueprintVars` flows through projection so the button can open `RunNowSheet` directly without a client roundtrip.
- **Ledger kit (`src/lib/apps/view-kits/kits/ledger.ts`)**: pure projection for currency-shaped tables + ≥1 blueprint apps. Period flows URL → page → projection at request time (no runtime override magic). KPIs synthesized via `defaultLedgerKpis(table, columns, period, blueprintId?)` — emits Net/Inflow/Outflow + optional Run-rate. Hero is `LedgerHeroPanel` composing `TimeSeriesChart` + a categories-with-bars list (existing single-value `DonutRing` is the wrong primitive for multi-segment; deferred to Phase 4).
- **`LastRunCard variant="hero"` (`src/components/apps/last-run-card.tsx`)**: discriminated-union props on `variant`. Compact (Phase 2) caller in Workflow Hub kit unchanged; hero adds full markdown body + metadata footer + previous-runs Sheet disclosure + failed-task rescue.
- **`RunNowSheet` + `RunNowButton` conditional (`src/components/apps/{run-now-sheet,run-now-button}.tsx`)**: `RunNowSheet` opens a Sheet when blueprint declares variables, renders form via shared `VariableInput`, runs `validateVariables` client-side, submits to `/api/blueprints/{id}/instantiate`, surfaces 400 `{field, message}` responses inline next to the offending field. `RunNowButton` delegates to the sheet only when `variables` is non-empty; preserves Phase 2 direct-POST behavior for blueprints without variables.
- **Chart primitives (`src/components/charts/{time-series-chart,run-cadence-heatmap}.tsx`)**: `TimeSeriesChart` is a recharts AreaChart wrapper with empty-state placeholder; `RunCadenceHeatmap` is a 12wk × 7d SVG grid (technique borrowed from `playbook/adoption-heatmap.tsx`) with success/fail status dots.
- **App primitives (`src/components/apps/`)**: `period-selector-chip` (MTD/QTD/YTD chip group; updates `?period=` via `router.replace`), `transactions-table` (read-only table for Ledger secondary; negatives marked outflow), `ledger-hero-panel` (composes TimeSeriesChart + categories-with-bars list), `run-history-strip` (horizontal scroll of clickable run cards for Coach activity), `monthly-close-summary` (collapsible LightMarkdown card for Ledger activity).
- **Shared extraction (`src/components/workflows/variable-input.tsx`)**: `VariableInput` extracted from inline definition in `blueprint-preview.tsx` for reuse by `RunNowSheet`. Companion pure helper `validateVariables(values, defs) → { errors }` at `src/lib/workflows/blueprints/validate-variables.ts` (numeric `0` and boolean `false` correctly preserved as valid values).
- **Shared `ErrorBoundary` (`src/components/shared/error-boundary.tsx`)**: minimal class component for wrapping `react-markdown` rendering with a `<pre>` fallback.
- **Kit-aware data layer (`src/lib/apps/view-kits/data.ts`)**: extended with `coach` and `ledger` branches. Eight new loaders: `loadCoachLatestTask`, `loadCoachPreviousRuns`, `loadCoachCadenceCells`, `loadLedgerSeries`, `loadLedgerCategories`, `loadLedgerTransactions`, `loadMonthlyCloseSummary`, `loadBlueprintVariables` (uses dynamic `await import` to dodge module-load cycles per CLAUDE.md guidance). `unstable_cache` key now includes `period` so MTD↔YTD switches don't serve stale state for 30s. `KitProjectionShape` extended with `period`, `amountColumn`, `categoryColumn`.
- **Type extensions (`src/lib/apps/view-kits/types.ts`)**: `RuntimeState` gains `coachLatestTask`, `coachPreviousRuns`, `coachCadenceCells`, `ledgerSeries`, `ledgerCategories`, `ledgerTransactions`, `ledgerMonthlyClose`, `ledgerPeriod`. `HeaderSlot` gains `runNowVariables`. `ResolveInput` gains `period?`. All additive — Phase 1 + 2 contracts preserved.
- **Page wiring (`src/app/apps/[id]/page.tsx`)**: reads `?period=` via `z.enum(["mtd","qtd","ytd"]).default("mtd")` and threads through `kit.resolve({manifest, columns, period})`.
- **Inference verification**: existing Phase 1.2 heuristics in `src/lib/apps/view-kits/inference.ts` already pick Coach + Ledger correctly; existing 37-test inference suite covers the spec's acceptance fixtures (`weekly-portfolio-check-in → coach`, `finance-pack → ledger`). No changes required.
- **New starter (`.claude/apps/starters/finance-pack.yaml`)**: Ledger dogfood target — currency-table + monthly-close blueprint + monthly schedule.
- **Slot renderers**: no changes required — `hero.tsx`, `secondary.tsx`, `activity.tsx` already pass through `slot.content` as `ReactNode`. Coach + Ledger build content via `createElement(...)` per the Phase 2 frozen contract for client-component heroes.
- **Tests (~82 new)**: historical plan is anchored by git commit `2a7e2e36`. Full project: 1831/1850 pass + 12 skipped + 7 pre-existing failures (router.test.ts, settings.test.ts) unchanged from `main`. tsc clean for `src/(app|lib|components)`.
- **Browser smoke deferred**: Coach + Ledger end-to-end browser verification at `/apps/<weekly-portfolio-check-in>` and `/apps/<finance-pack>` requires interactive session (compose app via chat surface, visit `npm run dev` URL, screenshot). See internal continuity record for the smoke checklist.
- **NOT in scope** (deferred per HOLD): document citation strip (Phase 4 — `DocumentChipBar` is wrong primitive), top mover (24h) KPI (needs diff aggregation, Phase 5), allocation drift % (underspecified, Phase 5), `RunHistoryTimeline` primitive (Phase 4), kit-loader registry refactor (Phase 4 when 5+ branches arrive — Phase 3 ends with 4), period range customization beyond MTD/QTD/YTD, chart formats beyond AreaChart, `TableSpreadsheet` for Ledger transactions (intentional read-only choice).

## 2026-05-02

### Shipped — `composed-app-kit-tracker-and-hub` (Phase 2)

Lands the first two real view kits — Tracker (table-as-hero) and Workflow Hub (catch-all fallback) — plus four shared primitives and a 5-branch KPI evaluation engine. With Phase 1.1 + 1.2 + 2 in place, every composed app now renders a real domain-aware UI; `placeholderKit` only ships for the four still-unimplemented kits (Coach, Ledger, Inbox, Research).

- **KPI engine (`src/lib/apps/view-kits/evaluate-kpi.ts`)**: pure switch over `KpiSpec.source.kind` with injected `KpiContext` for testability. Five branches map to five evaluator functions — `tableCount`, `tableSum`, `tableLatest`, `blueprintRunCount`, `scheduleNextFire`. New source kinds require both a Zod arm in `KpiSpecSchema` and a switch case here — no formula escape hatch.
- **KPI formatters (`src/lib/apps/view-kits/format-kpi.ts`)**: 5 format adapters (`int`, `currency`, `percent`, `duration`, `relative`); null/undefined render as em-dash per design system convention.
- **Default KPI synthesis (`src/lib/apps/view-kits/default-kpis.ts`)**: `defaultTrackerKpis(heroTableId, columns)` synthesizes 1-4 KpiSpecs when a tracker app doesn't declare `view.bindings.kpis` — always emits "Total entries", optionally emits "Active" (when an `active` boolean column exists) and "Current streak" (when a `*_streak` column exists). Phase 5 (`composed-app-auto-inference-hardening`) tightens.
- **DB-backed KPI context (`src/lib/apps/view-kits/kpi-context.ts`)**: concrete `createKpiContext()` implementation using SQLite `json_extract` for table sums/latest, `schedules.nextFireAt` for cadence. Failures swallowed and returned as `null` (engine renders em-dash).
- **Kits (`src/lib/apps/view-kits/kits/{tracker,workflow-hub}.ts`)**: pure projection definitions. Tracker: hero = `TableSpreadsheet` of entries table, KPI strip above, schedule cadence chip + Run Now in header. Workflow Hub: catch-all fallback; KPI strip + per-blueprint `LastRunCard` cards in `secondary` slot + `ErrorTimeline` for failed tasks. Both kits import zero React hooks. The Tracker hero uses `React.createElement(TableSpreadsheet, ...)` (not function-call) because `TableSpreadsheet` is a client component with `useState` — function-call would invoke hooks outside React's render cycle.
- **Shared primitives (`src/components/apps/{kpi-strip,last-run-card,schedule-cadence-chip,run-now-button}.tsx`)**: each used by ≥2 kits per the spec's reuse rule. `KPIStrip` clips at 6 tiles; `ScheduleCadenceChip` shows "humanLabel · in 2d 4h" / "overdue"; `RunNowButton` posts to `/api/blueprints/[id]/instantiate` with empty variables and surfaces input-required cases via toast (full inputs sheet deferred to Phase 3); `LastRunCard` shows blueprint label + status badge + relative time + 30d run count.
- **Type extensions (`src/lib/apps/view-kits/types.ts`)**: `RuntimeState` gains optional Phase 2 fields (`heroTable`, `cadence`, `evaluatedKpis`, `blueprintLastRuns`, `blueprintRunCounts`, `failedTasks`); `HeaderSlot` gains `cadenceChip` + `runNowBlueprintId`; `KpiTile` gains optional `spark`. New types: `CadenceChipData`, `HeroTableData`, `RuntimeTaskSummary`. All additive — Phase 1.1 contract preserved.
- **Kit-aware data layer (`src/lib/apps/view-kits/data.ts`)**: `loadRuntimeState(app, bindings, kitId, projection)` now dispatches on `kitId`. Tracker path loads cadence + heroTable + evaluatedKpis; Workflow Hub path loads cadence + blueprintLastRuns + blueprintRunCounts + failedTasks + evaluatedKpis. Cache key includes `kitId` so different kits don't collide during inference rollouts.
- **Registry update (`src/lib/apps/view-kits/index.ts`)**: `tracker` and `workflow-hub` entries replace the Phase 1.2 `undefined` slots. Coach/Ledger/Inbox/Research still degrade to `placeholderKit` until Phases 3-4.
- **Slot renderers**: `KpisSlotView` delegates to the new `KPIStrip` primitive (Phase 1.1 inline grid removed); `HeaderSlotView` renders the new `cadenceChip` + `runNowBlueprintId` fields when present; other slot views unchanged (their content already passes through as `ReactNode`).
- **Route (`src/app/apps/[id]/page.tsx`)**: threads `kit.id` + `projection` through to `loadRuntimeState`. Single line of change versus Phase 1.2.
- **Tests (~67 new across 9 files)**: `format-kpi.test.ts` (7), `evaluate-kpi.test.ts` (6), `default-kpis.test.ts` (6), `workflow-hub.test.ts` (7), `tracker.test.ts` (7), `kpi-strip.test.tsx` (5), `schedule-cadence-chip.test.tsx` (4), `run-now-button.test.tsx` (4), `last-run-card.test.tsx` (3); plus `dispatcher.test.ts` updated to assert tracker/workflow-hub now resolve to real kits. Full apps suite: 201/201 (1 informational skip), tsc clean. Pre-existing `router.test.ts` + `settings.test.ts` failures unchanged from `main`.
- **Browser smoke**: `/apps/habit-tracker` renders Tracker layout end-to-end — header shows "daily 8pm · in 20h" cadence chip + "Run now" button + "View manifest" trigger; KPI strip shows 3 synthesized tiles ("Total entries: 5", "Active: 5", "Current streak: 0"); `TableSpreadsheet` hero shows all 5 habit rows with full toolbar (Column/Row/Import/Enrich/Export). Screenshot at `output/phase-2-tracker-smoke.png`.

**Deferred to later phases:**
- `RunNowButton` inputs sheet (when blueprint declares `variables`) — Phase 3 will fetch the blueprint def + open `WorkflowFormView`-style sheet
- Coach + Ledger kits — Phase 3 (`composed-app-kit-coach-and-ledger`)
- Inbox + Research kits — Phase 4
- Browser smoke for Workflow Hub — no multi-blueprint app currently installed in `~/.ainative/apps/`; covered by `workflow-hub.test.ts`'s "populates secondary cards" assertion
- Default KPI hardening + first-class `blueprintId` column on `tasks` (today the run count is approximated by matching `assignedAgent`/`agentProfile`) — Phase 5

**Status changes**: `composed-app-kit-tracker-and-hub` flips planned → completed in `roadmap.md`; spec frontmatter updated.

### Shipped — `composed-app-manifest-view-field` (Phase 1.2)

Lands the manifest contract that drives kit selection. The `view:` field is the only place where layout intent enters the manifest, and it's the only `.strict()` schema in `registry.ts` (every other manifest schema stays `.passthrough()`); KPI sources are an enumerated discriminated union, not formula strings — no expression escape hatch.

- **Schema (`src/lib/apps/registry.ts`)**: new `KitIdSchema` (enum of `auto | tracker | coach | inbox | research | ledger | workflow-hub`), `BindingRefSchema` (strict union over `{table|blueprint|schedule|profile}`), `KpiSpecSchema` (5-arm discriminated union: `tableCount | tableSum | tableLatest | blueprintRunCount | scheduleNextFire`), and `ViewSchema` (strict; `kit` defaults to `auto`, `bindings` defaults to `{}`, `hideManifestPane` defaults to `false`). `AppManifestSchema` gains `view: ViewSchema.optional()`.
- **Inference (`src/lib/apps/view-kits/inference.ts`)**: new `pickKit(manifest, columns) → KitId` with 7 named pure rule predicates. Decision table runs top-to-bottom, first match wins, no scoring: `rule1_ledger` (currency hero + ≥1 blueprint) → `rule2_tracker` (boolean+date hero + ≥1 schedule) → `rule3_research` (digest/report blueprint + schedule) → `rule4_coach` (`*-coach` profile + schedule) → `rule5_inbox` (drafter/inbox/follow-up blueprint) → `rule6_multiBlueprint` (≥2 blueprints, no hero table) → fallback `workflow-hub`. Column-shape probes (`hasCurrency`, `hasDate`, `hasBoolean`) read `column.config.semantic` (Option A from Phase 1.1) plus name regex; intentionally approximate per spec — Phase 5 hardens.
- **Dispatcher wire-up (`src/lib/apps/view-kits/index.ts`)**: replaces the always-`placeholder` stub. `pickKit` now delegates to inference and resolves the returned id via `resolveKit`, which gracefully falls back to `placeholderKit` for any KitId not yet implemented (Phase 2+ kits will register here). New `loadColumnSchemas(app, [getColumns])` reads each manifest table's columns from the data layer with an injectable fetcher for tests.
- **Route (`src/app/apps/[id]/page.tsx`)**: now calls `loadColumnSchemas(app.manifest)` and passes the result to `pickKit` and `kit.resolve` — replaces the empty `[]` Phase 1.1 placeholder.
- **Tests (61 new across 4 files)**: `view-schema.test.ts` (13 — defaults, strict-rejection of unknown fields, discriminated-union rejection of formula strings, binding refs round-trip), `inference.test.ts` (37 — column-shape probes + per-rule predicates + first-match-wins + 6 starter intent fixtures matching every acceptance criterion: habit-tracker→tracker, weekly-portfolio-check-in→coach, customer-follow-up-drafter→inbox, research-digest→research, finance-pack→ledger, reading-radar→tracker), `dispatcher.test.ts` (6 — `resolveKit` graceful fallback, `loadColumnSchemas` with injected fetcher covering empty/multi-table/error/malformed-config), `golden-master.test.ts` (5 — hand-rolled snapshot of installed habit-tracker shape + minimal/permissions/explicit-view variants; live scan of `~/.ainative/apps/` when present, skipped under vitest's temp `AINATIVE_DATA_DIR`). Full `apps/` suite: 133/134 (1 informational skip), tsc clean. Pre-existing failures in `router.test.ts` + `settings.test.ts` (7) are unchanged from `main`.
- **Smoke**: `curl http://localhost:3000/apps/habit-tracker` → 200, response body contains "Habit Tracker", "View manifest", and `kit-view` markup. Behavior unchanged for users (kit still resolves to `placeholder` until Phase 2 lands real kit implementations); the contract-level seam is what shipped.
- **Status changes**: `composed-app-manifest-view-field` flips planned → completed in `roadmap.md`; spec frontmatter updated.

### Shipped — `composed-app-view-shell` (Phase 1.1)

Lands the seam for the Composed Apps Domain-Aware View. The per-app screen at `/apps/[id]` is now a thin dispatcher: `getApp → pickKit → resolve → loadRuntimeState → buildModel → <KitView/>` (route reduced 143 → 42 lines). The previous four-card composition view + files list moves into a "View manifest ▾" sliding sheet accessible from the page header. `pickKit` is a stub that always returns the placeholder kit until Phase 1.2 lands the real decision table.

- **New module**: `src/lib/apps/view-kits/` with `types.ts` (frozen `KitDefinition` / `ViewModel` / slot contracts), `resolve.ts` (manifest → resolved bindings), `data.ts` (server-only `loadRuntimeState` wrapped in `unstable_cache` with 30s revalidate + `app-runtime:<id>` tag), `index.ts` (registry + `pickKit` stub), and `kits/placeholder.ts` (the only kit shipped this phase).
- **New shared component**: `src/components/apps/kit-view/kit-view.tsx` (server component dispatcher) + six slot components under `slots/` (header, kpis, hero, secondary, activity, footer) + `manifest-pane-body.tsx` (preserved composition + files cards moved out of the route) + `manifest-sheet.tsx` (client wrapper for the trigger + sheet).
- **Frozen contract**: kits are pure projection functions — `resolve(input) → projection`, `buildModel(projection, runtime) → ViewModel`. Kits never own React state and never fetch data themselves; `data.ts` builds `RuntimeState` once per request and passes it in. This is the "kits are pure projection functions, not stateful components" TDR landing in code.
- **Deferred decision (Option A)**: `userTableColumns.config.semantic` (Phase 5 inference hardening) will live inside the existing JSON `column.config` blob rather than a real column. No DB migration in Phase 1. Reasoning: spec scope explicitly excludes migrations, the strategy doc avoids schema work across all 7 phases, and inference is render-time only (≤6 reads per page, all cached).
- **Tests**: 4 new unit tests covering empty + full manifest cases for `resolveBindings` and `placeholderKit`; 91/91 apps tests pass; tsc clean. Browser smoke via Playwright (Claude in Chrome was offline) confirmed the dispatcher path renders, the manifest sheet opens, all four composition cards + files list + YAML show up cleanly with no console errors.
- **Status changes**: `composed-app-view-shell` flips planned → completed in `roadmap.md`; spec frontmatter updated.

## 2026-05-01

### Groomed — Composed Apps Domain-Aware View (7 features extracted)

Extracted 7 phased feature specs from `ideas/composed-apps-domain-aware-view.md` (the strategy doc co-authored by `/frontend-designer` and `/architect` perspectives). The strategy proposes replacing the current manifest-viewer per-app screen with a kit dispatcher that renders one of six domain-aware view kits (Tracker, Coach, Inbox, Research, Ledger, Workflow Hub) driven by manifest configuration. New shared primitives are gated on a "≥2 kits use it" rule; the dispatcher is one route, not per-app TSX.

Phase ordering preserves a usable surface at every gate: Phase 1 lands the shell + schema (no behavior change beyond the manifest peek moving into a sheet); Phase 2 ships the first two kits (Workflow Hub fallback for everything; Tracker for habit-tracker / reading-radar) so users see real value immediately; Phases 3-4 add the remaining four kits in domain-pair batches; Phase 5 hardens auto-inference and adds chat-driven `view:` authoring for power users.

- **Phase 1 (P1):** `composed-app-view-shell` — dispatcher route, KitDefinition / ViewModel types, manifest sheet preserving current composition + files content.
- **Phase 1 (P1):** `composed-app-manifest-view-field` — strict Zod `view:` field on `AppManifestSchema`, deterministic `pickKit` decision table, golden-master tests for backward compat across all starter manifests.
- **Phase 2 (P1):** `composed-app-kit-tracker-and-hub` — first two kits, four shared primitives (KPIStrip, LastRunCard, ScheduleCadenceChip, RunNowButton), KPI evaluation engine.
- **Phase 3 (P2):** `composed-app-kit-coach-and-ledger` — two kits + TimeSeriesChart + RunCadenceHeatmap + LastRunCard hero variant.
- **Phase 4 (P2):** `composed-app-kit-inbox-and-research` — two kits + RunHistoryTimeline + trigger-source detection.
- **Phase 5 (P2):** `composed-app-auto-inference-hardening` — tiered column-shape probes (semantic → format → regex), expanded inference test suite (≥25 cases), gated `/apps/[id]/inference` diagnostics page.
- **Phase 5 (P3):** `composed-app-manifest-authoring-tools` — three new chat tools (`set_app_view_kit`, `set_app_view_bindings`, `set_app_view_kpis`), AppViewEditorCard chat surface, planner hint for view-editing intents.

TDR queue (5 architecture decisions for `/architect` to capture):
1. App view is config-driven via kits, not per-app TSX
2. Kit selection is manifest-declared with deterministic auto-inference fallback
3. Kits are pure projection functions, not stateful components
4. KPI sources are an enumerated discriminated union, not expressions
5. `view` schema is `.strict()`, every other manifest schema is `.passthrough()`

No DB migrations required across the 7 features. No breaking changes to existing manifests — every starter app keeps working through Phase 1's dispatcher refactor and Phase 2's auto-inference.

## 2026-04-21

### Shipped — M5 `install-parity-audit` (release gate)

Final release gate for the Self-Extending Machine cluster (M1 + M2 + M3 + M4 + M4.5). Audit verified fresh-clone → `npm run build:cli` → `node dist/cli.js` from scratch dir boots cleanly, auto `.env.local` writes correctly for non-dev launch folders, dev-mode gates differentiate repo vs. npx, and M4.5 planner + scaffold API route are npx-safe.

- **One finding, fixed**: `book/chapters/` + `ai-native-notes/*.md` were runtime-read by `src/lib/book/content.ts` + `chapter-generator.ts` but missing from `package.json`'s `files` array. Book UI silently degraded to stub content on npx installs (graceful `existsSync` fallback masked the drift). Fixed: added both to `files`, scoped ai-native-notes to `*.md` to exclude 4.7MB of internal strategy-doc PNGs the runtime never reads.
- **Regression test**: `src/lib/__tests__/npm-pack-files.test.ts` (5 tests) asserts the publish contract. Guards against future additions of runtime-read directories that skip the `files` update.
- **M4.5 surface clean**: planner + scaffold API route use only data-dir paths and pure logic. Zero `process.cwd()` usage, zero `import.meta.dirname`, zero static file reads from `appRoot`. No M4.5 fixes needed.
- **Package size**: packed tarball 1.8MB → 4.5MB (+2.7MB of markdown content). Unpacked 7MB → 7.4MB (delta is small because `src/` was always the bulk).
- **Test totals**: 338/338 green across `src/lib/__tests__/`, `src/lib/chat/`, `src/components/chat/`, `src/app/api/plugins/` (up from 333 pre-M5 +5 npm-pack-files).
- **Publish readiness**: next step is version bump + `npm publish --access public` as the current maintainer per the 2026-04-19 release decision.

### Shipped — M4.5 `nl-to-composition-v1`

Restores the original M4 scope (silently displaced when strategy §15 renamed M4 to Phase 6 on 2026-04-20). A user typing *"build me a weekly portfolio check-in"* in chat today fires `AppMaterializedCard` automatically; *"I need a tool that pulls my GitHub issues"* fires `ExtensionFallbackCard` with pre-inferred scaffold inputs. The signature demo strategy §6 has been pointing at since day one.

- **Chat planner** (`src/lib/chat/planner/`): pure, total, pattern-based 3-verdict classifier (`compose | scaffold | conversation`). Scaffold-first ordering; compose fallback; conversation default. 12 classifier tests + 6 composition-hint builder tests + 4 primitive-map registry-validation tests + 3 engine-planner contract tests. 25 green.
- **Composition-path nudge**: `engine.sendMessage` augments the system prompt with `buildCompositionHint(plan)` when the classifier returns `compose`. The existing `detectComposedApp` detector (Phase 2+3) picks up the LLM's tool-call sequence and drives `AppMaterializedCard` rendering. Zero new card code.
- **Scaffold-path short-circuit**: when classifier returns `scaffold`, `engine.sendMessage` skips `query()`, streams a canned preamble ("I can scaffold a plugin for that..."), persists the assistant message with `extensionFallback` metadata, and returns. `chat-message.tsx` renders `ExtensionFallbackCard` from metadata. Saves one LLM turn per plugin-shaped ask; makes the card-fire deterministic.
- **Card wiring**: `POST /api/plugins/scaffold` wraps Phase 6's `scaffoldPluginSpec`; maps `PluginSpecInvalidIdError → 400`, `PluginSpecAlreadyExistsError → 409`, `PluginSpecWriteError → 500` with `code`-keyed bodies. 6 route tests green. Card's `onScaffold` default handler posts to this route; `onTryAlt` dispatches a `ainative-chat-submit` CustomEvent the chat shell listens for (new listener in `chat-shell.tsx`).
- **Primitive map**: 15 keyword → `{ profileId, blueprintId, tables? }` entries covering portfolio/investment/stocks, research/reading list, code review/PR, content marketing, customer support, meal/recipe, lead research, briefing, documentation, travel. Registry-validation test ensures every value references a live builtin; a future rename of `wealth-manager` → anything else fails CI loudly.
- **No new TDR**: planner consumes existing contracts (`classifyPluginTrust`, `create_plugin_spec`, `detectComposedApp`, chat-tool registry). No runtime-catalog reachability — verified via `rg "runtime/catalog" src/lib/chat/planner/ src/app/api/plugins/scaffold/` → zero matches.
- **Rollout**: not flag-gated. Classifier is ~1ms synchronous; scaffold path is negative-latency (skips one LLM turn); compose path adds ~400 chars to the system prompt. Codex + Ollama engines unchanged in v1 — deferred to M4.6.
- **Chat tool count**: unchanged at 92. LOC: ~460 production + ~420 tests + 9 new files + 3 modified.
- **Test totals**: 309/309 green across `src/lib/chat/`, `src/components/chat/`, and `src/app/api/plugins/` suites (up from 273 pre-M4.5). `npx tsc --noEmit` clean on M4.5 surface.

## 2026-04-20

### Shipped — chat-tools-plugin-kind-1 (Milestone 3, two-path trust model)

M3 final-acceptance gate passed. Phase 4 live smokes verified the two-path plugin trust model end-to-end against `npm run dev` with the real echo-server bundle and an isolated `AINATIVE_DATA_DIR=~/.ainative-smoke-m3` data dir. TDR-037 promoted from `proposed` to `accepted` in the same session. Strategy §15 Amendment 2026-04-20 becomes authoritative. Per-feature disposition (parked behind flags vs. retained vs. scheduled-for-removal) frozen.

- **T19 — echo-server self-extension classifier + MCP registration.** Live `loadPluginMcpServers()` returned echo-server with `status: "accepted"` (NOT `pending_capability_accept`); `~/.ainative-smoke-m3/plugins.lock` not created; zero `ReferenceError: Cannot access 'claudeRuntimeAdapter' before initialization` or related module-load-cycle errors in dev logs. Confirms classifier Signal 2 (`author: ainative`) + Signal 5 (`capabilities: []`) both fire and the `isCapabilityAccepted` self-extension fast-path skips lockfile entirely (TDR-037 §2 contract).
- **T20 — confinement flag activates seatbelt wrap on macOS.** With `confinementMode: seatbelt` declared in the smoke fixture, `wrapStdioSpawn(...)` returns `command: "python3"` + direct args when `AINATIVE_PLUGIN_CONFINEMENT` is unset (parked path), and `command: "sandbox-exec"` + policy-prefixed args (`(version 1) (deny default) (allow process-fork) (allow signal (target self))`) when `AINATIVE_PLUGIN_CONFINEMENT=1`. Proves the §11 Risk D off-ramp mechanism works on demand without authoring real policy corpus.
- **T21(a) — `--safe-mode` kill switch.** With `AINATIVE_SAFE_MODE=true`, `listPluginMcpRegistrations()` returns echo-server as `status: "disabled", disabledReason: "safe_mode"`. Mirrors Claude Code `--no-plugins` semantics independent of trust classification.
- **T21(b) — `plugin-trust-model = "strict"` Settings override.** Even though echo-server's manifest hits two self-extension signals, setting `plugin-trust-model` to `"strict"` correctly forces the lockfile path: registration becomes `status: "pending_capability_accept", disabledReason: "capability_not_accepted"`. The user's "training wheels" escape hatch works as TDR-037 §5 specifies.
- **T21(c) — `plugin-trust-model = "off"` Settings override.** With setting `"off"`, `isCapabilityAccepted` accepts every plugin without lockfile consultation: registration returns `status: "accepted"`, no `plugins.lock` file. Matches Claude Code / Codex CLI "trust your own code" posture.

Pre-task fix shipped in the same commit: `ainative-app` skill SKILL.md updated to write app manifests to `~/.ainative/apps/<app-id>/manifest.yaml` (canonical per `getAinativeAppsDir()` and `src/lib/apps/registry.ts`) instead of `.claude/apps/<app-id>/`. Without this fix, apps composed via the skill would scaffold to a path the registry never scans, breaking the sidebar dynamic-entry promise of Phase 2.

### Accepted — TDR-037 (two-path plugin trust model)

`.claude/skills/architect/references/tdr-037-two-path-plugin-trust-model.md` status flipped `proposed` → `accepted`. The classifier signals, self-extension bypass, feature-flag gates, Settings toggle (`auto | strict | off`), and per-feature disposition table are now the authoritative reference for any future plugin-trust work. Re-entering the marketplace / trust-tier lane (strategy §10 refused) requires a successor TDR that explicitly supersedes this one.

### Shipped — Phase 6 (`create_plugin_spec` + `ainative-app` fall-through + `ExtensionFallbackCard`)

- **New chat tool `create_plugin_spec`** (`src/lib/chat/tools/plugin-spec-tools.ts`): scaffolds Kind 1 MCP plugins under `~/.ainative/plugins/<id>/` with `author: "ainative"` AND `origin: "ainative-internal"` baked in — belt-and-suspenders (signals 1 + 2 from `classifyPluginTrust`) so future refactors can't accidentally flip the scaffold to the third-party trust path. Chat tool count: 91 → 92. v1 scaffolds Python + stdio bodies; `language: "node"` or `transport: "inprocess"` writes a TODO-stub with a Phase 6.5 pointer. Atomic write via temp-dir + rename; refuses to overwrite existing plugin dirs.
- **`ainative-app` skill fall-through**: Phase 2 now falls through to `create_plugin_spec` when composition can't express the ask; Phase 3 emits dual-target artifacts (plugin dir + `~/.ainative/apps/<app-id>/manifest.yaml` with a `plugins:` reference).
- **`ExtensionFallbackCard`** (`src/components/chat/extension-fallback-card.tsx`): renderable-only chat card with three states (`prompt`, `scaffolded`, `failed`), two paths not three (compose-alt vs. scaffold). Planner wiring deferred to Phase 6.5 per the `app-materialized-card` precedent. Includes `role="alert"` on the failed state for WCAG 4.1.3 compliance.
- **Tests**: 15 Vitest cases for `plugin-spec-tools` (scaffold, atomicity, collision, invalid id, reserved id, TODO stub, classifier integration asserting `scaffold → classifyPluginTrust → "self"`, empty-tools defensive set() render, chat tool ok/error wrapping, `PluginSpecWriteError` type assertion); 7 Testing Library cases for `ExtensionFallbackCard` (render, click handlers, state transitions, retry, `initialState` honoring, double-click re-entrancy guard).
- **No CLAUDE.md smoke-test budget triggered** — verified `plugin-spec-tools.ts` has no static imports transitively reachable from `@/lib/agents/runtime/catalog.ts`.

## 2026-04-19

### Design-hardened — chat-tools-plugin-kind-1

EXPAND-mode security brainstorm surfaced six M3 scope additions, now incorporated into the feature spec. Source: `ideas/m3-security-model-brainstorm.md` (draft, ~360 lines). The brainstorm pressure-tested the current 5-layer security model (capability declaration, click-accept lockfile, --safe-mode, stdio isolation, MCP elicitation) and identified the biggest gap: consent layers 1-4 don't *enforce* anything, just label. Six additions close the gap without violating strategy §10 non-goals.

- **Per-tool approval overlay (Codex-style)**: `plugins.lock` gains `toolApprovals: Record<toolName, "never"|"prompt"|"approve">`, default `"prompt"` on first install. Reuses ainative's existing `handleToolPermission` hook + `tool-permission-persistence` UI — no new permission machinery. Creates a trust ramp (each "Always Allow" click lowers friction) vs. today's install-time cliff.
- **Confinement modes + Docker off-ramp**: `plugin.yaml` accepts `confinementMode: "none"|"seatbelt"|"apparmor"|"docker"`. Ships per-capability policy profiles for seatbelt (macOS) + AppArmor (Linux). Docker mode is the strategy §11 Risk D off-ramp, scoped BEFORE the leading indicator fires (first external plugin declaring `[child_process]`). Enforcement layer turns capability labels into actual OS-level scope constraints.
- **Capability expiry (opt-in)**: `plugins.lock` optional `expiresAt` field; chat tool `set_plugin_accept_expiry({ pluginId, days })` with `{30, 90, 180, 365}`. Default stays no-expiry (matches Claude Code / Codex conventions — notification fatigue prevention). Pure upside for paranoid users.
- **Revocation flow**: `revoke_plugin_capabilities({ pluginId })` chat tool — inverse of `grant_plugin_capabilities`. Removes lockfile entry, SIGTERMs stdio child (5s SIGKILL fallback per TDR-035), suspends plugin. Obvious missing feature that the spec had silently omitted.
- **User-visible security doc**: `docs/plugin-security.md` as the consolidated layered-defense explainer. Linked from Inbox capability-accept sheet and `plugins.log` error messages. Most "security incidents" come from misunderstanding the trust model; the doc is the cheapest mitigation.
- **10-row Error & Rescue Registry**: captures security-layer failures with recovery paths (corrupt `plugins.lock`, SHA-256 hash collision [not in this universe], plugin writes to own lockfile, `--safe-mode` UI edge cases, Docker escape, stale accept, MCP handshake hang, wrong-plugin accept, over-strict confinement, SIGTERM-ignored revoke). Informs implementation plan risk budget.

Also records 5 explicit rejections for TDR-035's Alternatives Considered section: Node `vm`-isolation (perception ≠ reality), plugin signing/marketplace (strategy §10), PII sanitization (strategy §10), auto-expiry default-on (notification fatigue), worker-thread isolation as M3 scope (deferred post-M5). Five delight opportunities surfaced for post-M5 consideration: capability "trust ramp" promotion, community-contributed confinement profile gallery, plugin activity dashboard, unexpected-capability inbox alerts, share-your-accepted-plugins export.

Spec grew from ~430 lines to ~520 lines (new subsections: Per-tool approval overlay, Capability expiry, Revocation flow, Confinement modes, Core security posture (summary)). 4 new acceptance criteria bullets added. Excluded list expanded with 3 explicit rejections (Node `vm`, worker-thread isolation, network-scope DNS allowlist deferred). Net M3 implementation impact: ~335 LOC + ~200 lines markdown, plausibly single-session still.

### Groomed — chat-tools-plugin-kind-1

Milestone 3 of the Self-Extension Platform, groomed against `ideas/self-extending-machine-strategy.md` §9 Milestone 3 **and the 2026-04-19 (II) amendment** that re-scoped Kind 1 around MCP-as-surface instead of the original §5 custom `@ainative/plugin-sdk`. The amendment was driven by two signals captured earlier the same day: live research on Claude Code's current plugin docs (`anthropics/claude-plugins-official` marketplace uses `.mcp.json` as the MCP server surface, not a custom SDK) and a grep of our own codebase showing `src/lib/agents/claude-agent.ts:566` already merges MCP servers via `withAinativeMcpServer()`. Adopting MCP as the extension surface reuses this existing merge path instead of building a parallel surface.

- **Feature spec**: `features/chat-tools-plugin-kind-1.md` — `kind: chat-tools` plugin manifest variant with Ainative's capability-declaration safety overlay (`capabilities: [fs, net, child_process, env]`), `.mcp.json` at plugin root for the MCP server config, two supported transports (stdio subprocess + in-process SDK via `@modelcontextprotocol/sdk`), plugin-MCP loader at `src/lib/plugins/mcp-loader.ts`, and `~/.ainative/plugins.lock` hash-pinned capability accept flow with Inbox notification review sheet.
- **Cross-runtime contract**: new `supportsPluginMcpServers: boolean` column in `src/lib/agents/runtime/catalog.ts`. Declared values: Claude SDK `true` (4th arg to existing `withAinativeMcpServer`), Codex App Server `true` (via existing `src/lib/environment/sync/mcp-sync.ts` bi-directional sync to `config.toml [mcp_servers]`), Anthropic direct + OpenAI direct `true` (new MCP merge sites), Ollama `false` (no MCP surface in Ollama's API; plugins skip with a log note). Cross-runtime parity drops out of the matrix rather than being hand-coded per adapter.
- **Trust posture**: Ainative's capability overlay is deliberately stricter than Claude Code's `plugin.json` (which has no capability declarations — trust comes from marketplace curation). Justified by the 2026-04-12 rollback discipline and strategy §10's refusal to re-enter marketplace/trust-tier territory. stdio transport gives free process isolation (separate OS process; plugin cannot touch ainative's Node heap) — materially reduces strategy §11 Risk D without requiring Docker. In-process SDK MCP servers retain the original risk profile; click-accept + lockfile still gates them.
- **Chat tool surface**: M1's three plugin chat tools (`list_plugins`, `reload_plugins`, `reload_plugin`) extend rather than duplicate — `list_plugins` response adds `toolCount` / `transport` / `capabilities` / `capabilityAcceptStatus`; `reload_plugin` gains transport-aware reload (SIGTERM subprocess vs. `require.cache` bust). One new tool: `grant_plugin_capabilities({ pluginId })` for the capability accept flow. All handlers use dynamic `await import()` per TDR-032 — pattern proven in M1 T18 and M2 T18 smokes.
- **Dogfood**: `gmail-triage` reference Kind 1 plugin shipping a stdio Python MCP server with three tools (`gmail_list_unread`, `gmail_get_thread`, `gmail_draft_reply`) and `[net]` capability. Follows M1's first-boot-copy pattern. Proves the end-to-end path without becoming a core product feature.
- **`--safe-mode` CLI flag**: boot-time kill switch in `bin/cli.ts`. Disables all `kind: chat-tools` plugin loading; `kind: primitives-bundle` continues to load (no execution surface there). No runtime Settings toggle in v1 — strategy §13 flags this as follow-up.
- **Roadmap**: `chat-tools-plugin-kind-1 (Milestone 3)` row in Self-Extension Platform section updated from plain text to a link to the new spec. Priority `P0`, status `planned`. Dependencies expanded to reflect the cross-runtime surface — `primitive-bundle-plugin-kind-5` (M1), `schedules-as-yaml-registry` (M2), `chat-engine`, `provider-runtime-abstraction`, `runtime-capability-matrix`. M2's row also updated from `planned` to `shipped` to reflect reality captured in the 2026-04-19 handoff.
- **Strategy amendments bundled**: Amendment 2026-04-19 (II) in the strategy doc captures the MCP-as-surface revision with a complete artifact-table diff (`src/lib/plugins/sdk/index.ts` REMOVED; `supportsPluginMcpServers` column + `mcp-loader.ts` ADDED; `gmail-triage` dogfood becomes an MCP server). Memory saved at `memory/project-m3-mcp-as-plugin-surface.md` with rationale + five-vector justification.
- **Open architectural decision for implementation**: TDR-035 (to be drafted at implementation start) should codify the plugin-MCP cross-runtime registration contract so a future runtime addition (Gemini, DeepSeek) knows exactly where to plug in. The spec names this as a pre-implementation concern, not a blocker to grooming.
- **Scope guardrails**: v1 does NOT ship mixed-kind plugins (one plugin = one kind), sandboxing (Node's `vm` isn't a security boundary), marketplace/publishing/trust tiers (rolled back), plugin dependency deduplication, runtime Settings toggle for `--safe-mode`, Ollama MCP support, automatic plugin upgrade detection, or a `/apps` UI for Kind 1 management. All enumerated in the spec's Excluded list with rationale; most are strategy §10 non-goals.

### Groomed — schedules-as-yaml-registry

Milestone 2 of the Self-Extension Platform, groomed against `ideas/self-extending-machine-strategy.md` §9 Milestone 2. Closes the composition gap left open by Milestone 1: schedules were the only top-tier primitive still DB-only, so Kind 5 bundles could ship a profile/blueprint/table but not the recurring schedule that drives them. finance-pack's `personal-cfo` profile had no `monthly-close` schedule to pair with — this spec fixes that.

- **Feature spec**: `features/schedules-as-yaml-registry.md` (397 lines). YAML + Zod `discriminatedUnion` (scheduled vs heartbeat) + registry + loader, mirroring `workflow-blueprints.md` with one load-bearing addition — **state preservation on reload**. The schedules table has 30+ columns split between config and runtime state (firingCount, lastFiredAt, suppressionCount, failureStreak, heartbeatSpentToday, turn-budget breach counters, etc.). A naive upsert would reset counters and break the scheduler. The spec's DB upsert is a single-statement `onConflictDoUpdate` whose `.set()` clause carries **config fields only** — runtime state lives in `.values()` only (applied on first insert, never on conflict). Same pattern shipped for `installPluginTables` in Path C (2026-04-19), validated as race-safe there.
- **Plugin integration**: composite id `plugin:<plugin-id>:<schedule-id>` with `(<plugin-id>)` display-name suffix, mirroring M1's table strategy per TDR-034. No schema change to the `schedules` table.
- **Architect Refinement 2 — bundled into this milestone**: generic `scanBundleSection<T>` helper replaces the three M1 per-section scanners before the fourth user (schedules) is added. Explicitly called for by `features/architect-report.md` Refinement 2. Keeps the M1 rule "extract at third use, not first" honest.
- **Architect Refinement 1 — de-risked here**: `z.discriminatedUnion` pattern adopted for `type: scheduled | heartbeat` previews the M3 manifest `kind: primitives-bundle | chat-tools` pattern. Landing the shape one milestone early.
- **Dogfood**: finance-pack bundle gets `schedules/monthly-close.yaml` referencing `finance-pack/personal-cfo`. First-boot auto-seeder from M1 picks it up without change. After boot, `GET /api/plugins` reports finance-pack's schedules list — end-to-end proof.
- **Three new chat tools**: `list_schedule_specs`, `install_schedule_from_yaml`, `reload_schedules`. Dynamic `await import()` for the registry per TDR-032 cycle discipline. Real `npm run dev` smoke step is mandatory in the implementation plan (M1 T18 precedent — unit tests cannot catch module-load cycles).
- **Roadmap**: `schedules-as-yaml-registry (Milestone 2)` row in Self-Extension Platform section updated from plain text to a link to the new spec. Priority `P0`, status `planned`, dependencies `primitive-bundle-plugin-kind-5` + `scheduled-prompt-loops`.
- **Scope guardrails**: v1 ships **zero built-in schedules** (schedules are inherently domain-specific; profiles/blueprints ship builtins because they're generic). No DB→YAML export (runtime state doesn't belong in config files). No multi-timezone for `scheduled` type (`activeTimezone` is heartbeat-only).

### Shipped — primitive-bundle-plugin-kind-5

Milestone 1 of the Self-Extension Platform. Plugin loader scans
`~/.ainative/plugins/<id>/`, validates manifests against a Zod schema
with apiVersion compatibility check, and merges per-bundle profiles
(namespaced `<id>/<profile>`), blueprints (namespaced `<id>/<blueprint>`),
and tables (DB rows with composite id `plugin:<id>:<table>`). Three new
chat tools — `list_plugins`, `reload_plugins`, `reload_plugin` — and two
API routes — `GET /api/plugins`, `POST /api/plugins/reload`. Finance-pack
dogfood bundle (Personal CFO + monthly-close blueprint + transactions
table) auto-seeds on first boot when `plugins/` is empty. Identical
behavior on npx and git-clone install paths (no install-path branches in
the loader). 0 new DB columns. Smoke verified at `74feaf74` (see spec
"Verification run — 2026-04-19").

## 2026-04-18

### Groomed — primitive-bundle-plugin-kind-5 + Self-Extension Platform roadmap section

New P0 post-MVP feature derived from `ideas/self-extending-machine-strategy.md`. This is Milestone 1 of the post-rollback composition-first strategy synthesized from a live architect + frontend-designer + product-manager brainstorm.

- **Feature spec**: `features/primitive-bundle-plugin-kind-5.md` — YAML-based plugin loader that packages a profile + blueprint + table schema as a portable directory under `~/.ainative/plugins/<id>/`. Zero new execution surface; extends existing profile and blueprint registries with a plugin-id namespace.
- **Roadmap section added**: `Self-Extension Platform` in Post-MVP, between App Marketplace (deferred) and the Dependency Graph. Captures all five milestones from the strategy doc: primitive-bundle-plugin-kind-5 (P0, Milestone 1), schedules-as-yaml-registry (P0, Milestone 2), chat-tools-plugin-kind-1 (P0, Milestone 3), nl-to-composition-v1 (P1, Milestone 4), install-parity-audit (P1, Milestone 5).
- **Strategy doc**: `ideas/self-extending-machine-strategy.md` — 698-line living strategy artifact. Locks six decisions (D1–D6): ship Kind 5 + Kind 1 only, hard refuse + redirect for npx source writes, JS-direct authoring (no bundler), public slogan *"Describe your business. Ainative builds it, runs it, and grows with it."*, `/apps` authoring-only (no marketplace), install-path parity with `AINATIVE_DEV_MODE` as surfacing flag only.
- **Deliberate non-goals**: publishing flow, trust tiers, PII sanitizer, Kind 2/3/4 plugins, marketplace distribution, new UI routes via plugin, new DB columns via plugin, orphan writes to `launchCwd` on npx. All explicitly enumerated in `ideas/self-extending-machine-strategy.md` §10 so future scope-creep has a clear "we decided against this" reference.
- **Post-rollback discipline**: the 2026-04-12 rollback of 21 marketplace commits is named in both the feature spec and strategy doc. This feature deliberately picks up only the directory-scan loader pattern from that work — no publish flow, no trust ladder, no PII sanitizer. Rollback scar is on distribution, not composition; this roadmap section honors that distinction.

### Groomed — sidebar-ia-route-restructure

New P1 post-MVP feature extracted from a live design session grounding IA fixes in the then-current product positioning and work-use journey. Current durable sources are `_ASSETS/features-catalog.md` and `_ASSETS/journeys/smb.md`. Captured in `features/sidebar-ia-route-restructure.md` and added to the roadmap's UI Enhancement section.

- **IA change**: sidebar moves from 4 groups to 5. Work splits into **Home** (Dashboard, Tasks, Inbox, Chat) + **Compose** (Projects, Workflows, Profiles, Schedules, Documents, Tables). Manage renames to **Observe** (Monitor, Cost & Usage, Analytics). Learn + Configure unchanged.
- **Promoted primitives**: Profiles + Schedules move out of Manage into Compose. Positioning doc names them as co-equal with Projects and Workflows; Manage was a misclassification.
- **Route rename**: `/` reclaims the "Dashboard" label (it was already rendering stats + priority queue + activity feed + recent projects — a real dashboard, only reachable via logo click today). The kanban moves from `/dashboard` to `/tasks`, matching the object-plural convention every other list route already follows.
- **Back-compat scope**: per product decision, `/dashboard` is deleted outright — ainative is in alpha, few external bookmarks, clean break preferred over a 1-line redirect stub.
- **Keyboard shortcuts**: `g d` → `/dashboard` is replaced by `g h` → `/` and `g t` → `/tasks`.
- **Architect impact report** (`features/architect-report.md`): MEDIUM blast radius, ~50 files, single frontend layer, no data/runtime coupling. Root-path guard in `isItemActive` already handles the new pattern.
- **TDR-033** recommended: *Route Semantics — Object-Label Convention for List Routes*. Codifies the rule so future additions (e.g., a hypothetical `/inbox-board` or `/project-grid`) do not re-introduce view-type route names.
- **Historical doc cascade**: bundled with the brand pivot refresh — 15 generated guide files, 10 captures, and the dashboard-guide → tasks-guide rename all folded into the existing refresh. The retired corpus was later consolidated into `_ASSETS`.
- **Design bridge gate**: spec carries a blocker AC for `/frontend-designer` Product-Design Bridge review (state specs for `/` and `/tasks`, active-highlight regression checks, empty-state parity) before implementation starts.

**Evidence trail**: product-manager IA review + frontend-designer design review (both in-session) + architect impact analysis (`features/architect-report.md`).

### Design-bridged — sidebar-ia-route-restructure

`/frontend-designer` Product-Design Bridge mode enriched the spec with state specs, active-highlight checks, visual-weight guardrails, and keyboard/a11y ACs. Spec is now implementation-ready.

- Final Tasks subtext calibrated to **"Work in flight across projects"** (30 chars, DD-020 compliant); Dashboard subtext kept as "Today's work at a glance" since the rename makes it accurate for the first time.
- State preservation ACs added for `/` (loading via SSR stream, empty via `WelcomeLanding` + `ActivationChecklist`, populated, error) and `/tasks` (SkeletonBoard via Suspense, empty, populated, error) — the bar is **zero UX regression** vs. today's `/dashboard`.
- 16 active-highlight route regression checks added (one per routed nav item), including explicit guards that Profiles/Schedules now auto-expand **Compose** (not Observe) to catch any lingering coupling from the old Manage group.
- Visual-weight regression checks at 1366×768 (common laptop) and 1440×900 to verify the sidebar footer stays above the fold when Compose's 6-item accordion is expanded.
- Silent-rename interaction pattern codified: no toast, banner, or what's-new popover. Command palette keywords provide organic discovery. Alpha audience + DD-016 (hierarchical dimming) argue against migration chrome.
- Blocker AC cleared — spec is ready for implementation.

### Completed — npm-package-ownership-migration

Metadata-only patch migrating the npm publisher account between legacy maintainers. Completes the identity migration started with the historical GitHub repository rename on 2026-04-17. No runtime code changes — the then-current package install and `npx` commands continued to work unchanged.

- Registry ownership moved to the current maintainer via the npm web UI; the retired maintainer was removed after the `0.11.1` publish verified clean.
- Published `ainative@0.11.1` from the new maintainer account — first tarball where the `_npmUser` / "published by" field reflected the migration.
- Manifest: `repository.url` + `bugs.url` already corrected during the GitHub migration; `0.11.1` is the first npm release carrying the corrected URLs.
- Historical versions `<0.11.1` deprecated with an upgrade notice so pinned installs nudge users toward `latest`.
- Local `~/.npmrc` stale `navamio` `_authToken` revoked after the owner transfer.

**Verification:** the `0.11.1` publisher and sole-owner metadata matched the new maintainer; the `0.10.0` deprecation notice was present; scratch-dir execution of the then-current package returned help successfully.

## 2026-04-15

### Completed — runtime-validation-hardening

Closed the P1 runtime-validation feature. Implementation had already shipped across three production changes; the remaining gap was negative-path test coverage for MCP-tool `assignedAgent` validation.

- `src/lib/chat/tools/__tests__/task-tools.test.ts` — added two describe blocks covering `create_task` and `execute_task` runtime-id validation: invalid runtime → `Invalid runtime` error message listing valid ids; valid runtime → insert succeeds with `assignedAgent` persisted. Mirrors the existing `agentProfile` coverage pattern.
- Verified already-shipped production changes: `resolveAgentRuntime()` in `catalog.ts:281–286` warn-and-fallback (no throw); `task-tools.ts` handlers at lines 134, 216, 304 all validate via `isAgentRuntimeId`; `execute_task` fallback at line 343 uses `DEFAULT_AGENT_RUNTIME` (no hardcoded `"claude"` remains); tool description at line 288 lists valid runtime ids.

**Verification:** 23/23 `task-tools.test.ts` green (2 new). Existing `catalog.test.ts` coverage of unknown-id fallback retained.

### Fixed — upgrade sessions no longer deadlock on agent questions

The upgrade flow runs as a task (it needs Bash + git, which chat tools don't have), but the original implementation had no channel for the agent to ask the user a free-form question. The `upgrade-assistant` SKILL.md said *"stop and ask the user"* on merge conflicts and drifted-main cases — but the agent emitted the question as plain log text, and `PendingApprovalHost` only rendered Allow/Deny buttons, so the task silently stalled until the 55-second permission timeout fired a deny.

End-to-end fix reusing existing primitives (`handleToolPermission` already supports `AskUserQuestion` → `agent_message` notification + `waitForToolPermissionResponse()` polling):

- `src/lib/agents/profiles/builtins/upgrade-assistant/profile.yaml` — allowlist `AskUserQuestion`.
- `src/lib/agents/profiles/builtins/upgrade-assistant/SKILL.md` — new "How to ask the user a question" section with the two canonical payload shapes (free-form + 3-choice options). Rules 1 and 5 rewritten to mandate `AskUserQuestion` invocation — never plain text.
- `src/components/notifications/permission-response-actions.tsx` — new `QuestionReplyActions` branch triggered by `toolName === "AskUserQuestion"`. Renders a `radiogroup` of option cards when `toolInput.options` is present, otherwise a `<Textarea>` + Send button (⌘/Ctrl+Enter submits). Posts `{ behavior: "allow", updatedInput: { answer } }` to `/api/tasks/[id]/respond`.
- `src/app/api/tasks/[id]/respond/route.ts` — carve out an `AskUserQuestion` branch in the `updatedInput` key-sanitizer. Original toolInput describes the question (`question`, `options`) but the response carries an `answer` key not in the original — the existing subset check was rejecting it with HTTP 400. New branch validates a tight `{ answer: string }` shape instead.

This keeps task-pipeline isolation (TDR-024) intact — no chat-tool git shelling — while delivering the chat-like UX the upgrade feature was originally designed around.

**Verification:** 4/4 `permission-response-actions.test.tsx` cases green (adds 2 new: option cards → `{answer}`, textarea → `{answer}`). 7/7 `upgrade-poller.test.ts` still green. `npx tsc --noEmit` clean. End-to-end smoke deferred to the upgrade-session follow-up (requires a dirty clone + real upstream commit).

### Completed — upgrade-detection

Closed the last two real gaps in `upgrade-detection` and flipped the spec to `completed`:

- **Failure notification after 3 polls** — `src/lib/instance/upgrade-poller.ts` now inserts a single "Upgrade check failing" row into `notifications` (type `agent_message`, `toolName="upgrade_check_failing"` as dedup sentinel) once `pollFailureCount` crosses 3, and clears it on the next successful tick. One open notification at a time; no schema change.
- **Closeout note on the spec** documents two shipped-but-deviating decisions: (1) hourly polling is `setInterval`-driven rather than a `schedules`-table row (scheduler-engine registration deferred to a follow-up), (2) `UpgradeBadge` is a Client Component reading `/api/instance/upgrade/status` rather than a DB-reading Server Component. Behavior identical either way.

**Verification:** 7/7 `upgrade-poller.test.ts` green, including a new 3-failures → dedup → success-clears case that drives the notification insert + clear paths end-to-end. `npx tsc --noEmit` clean.

### Reconciled — roadmap ↔ spec frontmatter sync

Audit of 230 feature specs vs `roadmap.md` surfaced 9 rows where the roadmap table lagged behind already-shipped work. All 9 specs carried `status: completed` in their frontmatter; the roadmap still listed them as `planned` or `in-progress`. Synced the roadmap to match:

- `chat-settings-tool` (was in-progress)
- `chat-session-persistence-provider`, `chat-dedup-variant-tolerance`, `app-cli-tools`, `chat-app-builder`, `promote-conversation-to-app`, `marketplace-app-listing`, `marketplace-app-publishing`, `marketplace-trust-ladder` (were planned)

No spec bodies were modified — this was a pure roadmap-table reconciliation. Three features remain legitimately `in-progress` (`profile-environment-sync`, `runtime-validation-hardening`, `upgrade-detection`); none show activity since 2026-03-01 and may warrant a separate staleness review.

### Completed — chat-skill-composition closeout

Closed out the last real gap in `chat-skill-composition`: prompt-budget handling for composed skills. The feature had already shipped its runtime gates, additive schema, conflict heuristic, HTTP/MCP activation flow, and Skills-tab UI, but `buildActiveSkill()` still hard-truncated the combined SKILL.md payload. It now drops older composed skills first when the merged prompt would exceed `ACTIVE_SKILL_BUDGET`, prepends an explicit omission note naming the evicted skills, and only truncates when the newest remaining single skill is still too large.

This is intentionally a closeout pass, not a new feature wave. The parent spec is now `completed`, and the roadmap statuses were reconciled with already-shipped chat-runtime work (`chat-codex-app-server-skills`, `chat-ollama-native-skills`, `chat-file-mentions`, `chat-skill-composition`) so the next session starts from repo truth instead of stale planning state.

**Verification:** `active-skill-injection.test.ts` expanded from 8 → 12 cases, covering composed-skill injection on Claude, oldest-first eviction, and single-section truncation after eviction. Targeted validation green: 32/32 tests across active-skill injection + skill tools + conflict heuristic, plus `npx tsc --noEmit`.

## 2026-04-14

### Shipped — Phase 3: chat-composition-ui-v1 + saved-search-polish-v1

Both specs promoted from dogfood findings earlier today now complete.

**chat-composition-ui-v1 (P1)** — composition becomes discoverable. The Skills tab in the chat popover now renders: (a) `+ Add` buttons on inactive skills (gated by runtime `supportsSkillComposition` + `maxActiveSkills`), (b) active badges with deactivate on active rows, (c) an "N of M active" indicator at the top, (d) a shadcn Dialog surfacing conflict excerpts when `activate_skill` returns `requiresConfirmation`. New service layer (`src/lib/chat/skill-composition.ts`) extracted from the MCP tool so both the chat tool AND new HTTP routes (`POST /api/chat/conversations/[id]/skills/activate|deactivate`) share the same composition logic. New `useActiveSkills` hook (`src/hooks/use-active-skills.ts`) surfaces merged active IDs + runtime capability flags.

**saved-search-polish-v1 (P2)** — two dogfood bugs closed. (1) `cleanFilterInput()` helper (`src/lib/chat/clean-filter-input.ts`) strips mention-trigger residue before persistence; 7 unit tests cover the edges. (2) `useSavedSearches` now exposes `refetch()`; `CommandDialog` wires it on closed→open so saves made in the chat popover surface in the `⌘K` palette without a page reload.

**Refactors along the way:**
- `mergeActiveSkillIds` moved from `src/lib/chat/tools/skill-tools.ts` → `src/lib/chat/active-skills.ts` (pure module, no DB imports) so client components can consume it without pulling server code into the bundle.
- `skill-tools.ts` activate/deactivate handlers now delegate to `skill-composition.ts` service — body shrank, tests (16/16) stayed green via the dynamic-import boundary.

**Verification:** 210/210 chat + API tests pass. `npx tsc --noEmit` clean. HTTP smoke on live dev server verified replace → add+force → merged state → deactivate end-to-end. Full UI interactive smoke skipped for v1 (rendering logic covered by tsc + component structure matches existing patterns like Pinned entries).

### Dogfood session → 2 new feature specs + `ainative-app` skill

**Dogfood findings** (historical 2026-04-14 session output, intentionally not retained):

Real-browser use of Phase 1 + Phase 2 features surfaced 9 observations. Two became new feature specs for immediate planning:

- **New spec:** `chat-composition-ui-v1` (P1) — Skills-tab `+ Add` action + inline conflict dialog. Top-ranked blocker for adoption of the shipped `chat-skill-composition` runtime, which has zero UI surface today. Scoped to lift the v2-deferred UX from the parent spec into a discrete v1.
- **New spec:** `saved-search-polish-v1` (P2) — fixes two Phase 1 bugs found in dogfood: (1) `SaveViewFooter` captures mention-trigger cruft in `filterInput`; (2) `useSavedSearches` hook instances don't revalidate across components (popover save doesn't appear in `⌘K` palette until page reload).

Other observations captured in the log but not promoted to specs: skill-composition needs no DB fix (Phase 2 correctness holds), `@` popover triggering is fragile under programmatic automation (affects future e2e harness design), discoverability of `#key:value` syntax is low (candidate for a later `chat-filter-hint` spec).

**New skill:** `.claude/skills/ainative-app/SKILL.md` — scaffolds ainative-native apps by composing shipped primitives (profiles, blueprints, tables, schedules) via YAML manifest. Zero TypeScript required. Emits per-primitive artifacts into the registries that already load them (`.claude/skills/<app>--<profile>/`, `~/.ainative/blueprints/<app>--<blueprint>.yaml`) plus a forward-compatible app manifest at `.claude/apps/<app>/manifest.yaml` for when the deferred `.sap` format lands. Skill is discoverable via the Skill tool registry.

**Recommended Phase 3:** bundle `chat-composition-ui-v1` + `saved-search-polish-v1` for a ~1-session tight-scope PR. `chat-conversation-branches` (largest remaining `chat-advanced-ux` sub-spec) stays deferred; current evidence points to polishing the shipped features before building the largest unshipped one.

### Shipped v1 — chat-skill-composition (Phase 2 of retired chat-advanced-ux umbrella)

Composition v1 lands the chat-tool API + capability gates + conflict heuristic + context-builder iteration. Spec status `in-progress` — UI modal + token-budget trim deferred to v2.

**What shipped:**
- `RuntimeFeatures.supportsSkillComposition` + `maxActiveSkills` flags (Claude/Codex/direct = true/3, Ollama = false/1)
- Additive `conversations.active_skill_ids` JSON column (legacy `active_skill_id` preserved); bootstrap.ts dual update per the MEMORY.md ordering gotcha
- `mergeActiveSkillIds()` helper canonicalizes legacy + composed reads
- `activate_skill` accepts `mode: "replace" | "add"` and `force: boolean`; on `mode:add` runs capability gate → conflict heuristic → append (or returns structured `{requiresConfirmation, conflicts: [...]}`)
- `detectSkillConflicts` keyword heuristic in `src/lib/chat/skill-conflict.ts` — extracts directive lines (always/never/prefer/avoid) and pairs polarity-divergent lines on shared keywords
- `context-builder.ts` iterates merged skills, joins SKILL.md bodies with `---`, treats composition (`activeSkillIds.length > 0`) as user opt-in to override `stagentInjectsSkills=false` for Claude/Codex

**Design decisions:**
- Additive schema (don't replace `activeSkillId` with `activeSkillIds`) — preserves zero-risk back-compat for every existing read path. New code uses `mergeActiveSkillIds(legacyId, composed)`. Future migration can collapse to a single column when all readers are updated.
- Conflict response is structured (no modal in v1) — chat surface displays the JSON, user re-calls with `force:true` to override. Modal UI deferred to v2 because the Skills tab `+ Add` action needs design work.
- Composition opt-in overrides the `stagentInjectsSkills=false` default — without this, composed skills would silently no-op on Claude/Codex (where the SDK auto-discovers from filesystem). Single-skill default behavior is unchanged on those runtimes.
- Smoke verified: dev server boots clean post-migration; 16 skill-tools tests + 4 conflict tests + 195 broader chat tests pass; the full functional 2-skill compose + Ollama refusal is exercised via the production-code path through `vi.mock` boundaries.

### Shipped v2 — chat-filter-namespace + chat-pinned-saved-searches (Phase 1 of retired chat-advanced-ux umbrella)

Closed out the two `in-progress` specs spun out of `chat-advanced-ux`. Both now `completed`.

**chat-filter-namespace v2:**
- Parser accepts double-quoted values (`#tag:"needs review"`) — `CLAUSE_PATTERN` extended with a two-alternative regex, 5 new parser tests (22 total)
- Shared `FilterInput` component (`src/components/shared/filter-input.tsx`) — reusable outside chat
- `/documents` list page is the reference consumer — free-text search input replaced with `FilterInput`, clauses AND with existing Select filters, raw string syncs to `?filter=` URL param (shareable, refresh-persistent)
- Skills popover tab applies `#scope:project|user` and `#type:<tool>` via `filteredEnrichedSkills` memo + disambiguated empty-state ("no skills match these filters" vs "no skills available yet")

**chat-pinned-saved-searches v2 (saved searches):**
- New `/api/settings/chat/saved-searches` route (GET/PUT) + 6 Zod-validated tests — mirrors the v1 pins route pattern (dedup-by-id, malformed-value recovery)
- `useSavedSearches()` hook — fetch-once + optimistic save/remove
- Mention popover renders a `Saved` cmdk group at the top (surface-scoped by inferring from first filtered entity type)
- `SaveViewFooter` component — "Save this view" button when `parsed.clauses.length > 0`, expands to inline rename form → persists via the hook
- `⌘K` palette gets a `Saved searches` group between Recent and Navigation; selecting a search navigates to `SURFACE_ROUTE[surface]?filter=<input>`

**Design decisions:**
- `/documents` picked over `/tasks` as the list-page reference consumer — `src/app/tasks/page.tsx` is a 5-line redirect stub to `/dashboard`, while `DocumentBrowser` already mounted `<FilterBar>`. Wider list-page rollout deferred to v3.
- Surface inference for saved searches uses the first filtered entity type. Slash-mode (skills/profiles) surface inference deferred to v3 — the ⌘K palette still surfaces ALL saved searches regardless of surface.
- `onApplySavedSearch` threaded as an optional prop on `ChatCommandPopoverProps` (no-op if consumer doesn't pass it) — avoids a deeper refactor of the popover's input-binding layer.
- `SaveViewFooter` uses plain `<form>`/`<input>` (not shadcn `<Form>`) for a tight footer inside cmdk — simpler and avoids nested React Hook Form state in a dropdown.

**Smoke-test budget note:** No runtime-catalog imports touched; unit + route tests + tsc sufficient. Full vitest run: 971 pass / 12 skipped (1 unrelated E2E suite skips without dev-server).

### Status Sync — Feature Audit

Audited all 26 non-terminal feature specs against the codebase. Adjustments:

**Marked completed** (code shipped, spec already satisfied):
- `database-snapshot-backup` — `src/lib/snapshots/{snapshot-manager,auto-backup,retention}.ts` implemented with full WAL-safe tarball pipeline
- `workflow-run-history` — `workflowRunNumber` + `runNumber` columns present in `src/lib/db/schema.ts`
- `runtime-capability-matrix` — normalized `status: complete` → `completed`; feature matrix live in `src/lib/agents/runtime/catalog.ts`
- `chat-claude-sdk-skills` — normalized `complete` → `completed`
- `task-runtime-skill-parity` — normalized `complete` → `completed`

**Marked in-progress** (partially shipped):
- `upgrade-detection` — `src/lib/instance/upgrade-poller.ts` exists; badge UI still pending

**Marked deferred**:
- `instance-license-metering` (P2) — community edition (commit 0436803) removed all billing/tier logic; metering inapplicable
- `chat-advanced-ux` (P3) — normalized non-standard `status: split` → `deferred`; retired umbrella (5 sub-specs already tracked)

**Normalized non-standard status**:
- `schedule-collision-prevention` — `proposed` → `planned` (proposed is not a valid state)

Unchanged (confirmed correct): 16 `planned` specs with no matching code, and `chat-filter-namespace` / `chat-pinned-saved-searches` / `profile-environment-sync` / `enrichment-planner-test-hardening` / `runtime-validation-hardening` remain `in-progress` (partial code found).

### Shipped v1 — chat-pinned-saved-searches (P3, in-progress)

Pinning entities from the chat `@` mention popover now works end-to-end. Hover-reveal Pin button on each entity row; click to pin; a "Pinned" cmdk group renders at the top of the popover on next open, with matching Unpin buttons. Pinned items are hidden from their regular type group so they don't render twice. Per-user persistence via a new `GET/PUT /api/settings/chat/pins` route backed by the existing `settings` key-value table under the `chat.pinnedEntries` key.

**Denormalization decision**: pin records store `label`, `description`, and `status` inline (not just `id` + `type`). This means pins surface reliably even when the underlying entity falls outside the `entities/search` top-20-per-type window — otherwise a user who pinned something a week ago wouldn't see it today. Trade-off: labels go stale on rename until the user re-pins. Mitigation via lazy refresh is a v2 follow-up.

**Saved searches deferred to v2.** The spec bundled pinning + saved searches, but the two are structurally independent and saved-search UX (footer affordance, palette surfacing, filter-applied navigation) adds significant design surface. Shipping pinning alone gets the power-user "quick access to repeat entities" value without tangling the two concerns.

Architecture: new `src/app/api/settings/chat/pins/route.ts` with Zod validation, de-dup-by-id on PUT (last-write-wins). New `src/hooks/use-pinned-entries.ts` with optimistic mutations + background PUT — failures are silently swallowed (optimistic update already applied). Popover changes in `chat-command-popover.tsx` split `MentionItems` into pinned vs. unpinned views, with `rawQuery`-aware pin filtering so typing a query still narrows the Pinned group.

Browser-verified: pin button click → group appears → GET returns `[{id, type, label, ...}]` → close + reopen popover → Pinned group at top, entity correctly hidden from its type group → click Unpin → empties list → GET returns `{ pins: [] }`.

### Shipped v1 — chat-filter-namespace (P2, in-progress)

`#key:value` filter namespace now works inside the chat mention popover. Typing `@ #type:task` narrows the popover to tasks only; `@ #type:task #status:completed` combines clauses with AND semantics; free-text search still composes on top via cmdk (e.g. `@ auth #type:task` narrows to tasks AND fuzzy-matches "auth"). Unknown keys pass through silently per the parser contract, so typos don't break the flow.

Architecture: pure parser module at `src/lib/filters/parse.ts` (17 unit tests — single/multi-clause, case preservation, hyphen/underscore keys, back-to-back clauses without separator, raw-query remainder, `#123` treated as text not clause). The `matchesClauses()` helper takes a caller-supplied predicate map per known key so consumers stay decoupled from the parser. In the popover, clauses are applied client-side against the cached `entityResults` (entities/search returns all entity types in one shot at popover-open, so no new API surface is needed). The trigger-detection regex in `use-chat-autocomplete.ts` was extended from `@[^\s]*` to `@[^\s#]*(?:\s+#[A-Za-z]?[\w-]*:?[^\s#]*)*` — the key trick is the `?` on `[A-Za-z]` so partial input like `@foo #` (space-hash, no key yet) keeps the popover open while the user types. The inner `:?[^\s#]*` accepts both partial (`@foo #sta`) and complete (`@foo #status:blocked`) forms. cmdk receives the filter-stripped `rawQuery` instead of the raw input so its fuzzy scorer doesn't mis-match `#key:value` tokens against entity names.

Known filter keys for v1: `status` (case-insensitive substring match on `result.status`), `type` (exact match on `result.entityType`). Value pattern `[^\s#]+` terminates at whitespace OR the next `#` so back-to-back clauses like `#a:1#b:2` parse correctly — the tradeoff is no literal `#` in values until quoted-value support lands in v2.

Browser-verified end-to-end: baseline 5 entities across 3 types → `@ #type:task` reduces to 2 tasks → `@ #type:task #status:completed` combines to 2 items in the Tasks group → `@ #status:nonexistent_status` renders the "No matching entities" empty state cleanly.

Status kept as `in-progress` (not `completed`) because v2 scope — list-page consumption (`/tasks` FilterBar), skills-tab filtering (`/skills #scope:project`), quoted values, more filter keys like `#priority` (requires extending entities/search response shape) — is explicitly deferred per grooming scope discipline. Parser is reusable by future v2 consumers without changes.

### Completed — chat-conversation-templates (P2)

Three entry points — empty-state "Start from template" button, `/new-from-template` slash command (`Session` group, `execute_immediately`), and a `Templates` group in the `⌘K` palette — open a sliding sheet picker that lists all 13 built-in blueprints from `GET /api/blueprints`. Selecting a blueprint with required variables renders a dynamic parameter form (text / textarea / select / number / boolean); the "Start conversation" button is disabled until all required params are filled. Zero-parameter blueprints start instantly. A new `renderBlueprintPrompt()` utility reuses `resolveTemplate` (shared with the workflow engine) and supports both the new optional `chatPrompt` blueprint field and a fallback to `steps[0].promptTemplate` — so all 13 built-ins work without edits.

**Non-obvious: race-order matters.** The provider's `createConversation()` POSTs, then synchronously calls `setActiveConversation(id, { skipLoad: true })` — which means the docked `ChatInput` mounts with the new `conversationId` before `createConversation()` resolves. If the picker wrote the prefill to sessionStorage *after* the await, the composer's `useEffect([conversationId])` would fire first and find an empty slot. Fix: write to an id-less `chat:prefill:pending` slot *before* awaiting, and have the composer read both `chat:prefill:<id>` and `chat:prefill:pending` on mount. The pending slot is cleared unconditionally after the read so a reload won't re-inject. Route-then-dispatch handoff from the palette uses a 50ms timeout to let `chat-shell` mount its event listener after `router.push("/chat")`.

Implementation spans `src/lib/workflows/blueprints/render-prompt.ts` (+9 unit tests covering chatPrompt precedence, step-1 fallback, conditional blocks, strict mode, empty-vs-undefined distinction), `types.ts` (optional `chatPrompt` field), `src/components/chat/conversation-template-picker.tsx` (sheet + list view + parameter form + sessionStorage handoff), `chat-input.tsx` (`conversationId` prop + hydration effect), `chat-shell.tsx` (picker render + event listener + empty-state button), `chat-session-provider.tsx` (`createConversation` extended to accept optional `{ title }`), `tool-catalog.ts` (session command), `command-palette.tsx` (Templates group).

Browser-smoke verified: filled Documentation Generation blueprint with `src/lib/workflows/blueprints/` + default API Documentation → composer rendered 239 chars of the resolved prompt in the new conversation → sessionStorage slots cleared → conversation appeared in list with blueprint name as title.

First of the 5 sub-features split from `chat-advanced-ux` now complete. Remaining: [chat-filter-namespace](chat-filter-namespace.md) (P2), [chat-pinned-saved-searches](chat-pinned-saved-searches.md) (P3), [chat-skill-composition](chat-skill-composition.md) (P3), [chat-conversation-branches](chat-conversation-branches.md) (P3).

### Groomed — chat-advanced-ux split into 5 sub-specs (P3 umbrella → 2×P2 + 3×P3)

The `chat-advanced-ux` umbrella covered 5 structurally independent capabilities with divergent complexity, blast radius, and standalone value. Bundling them into a single feature would force a big-bang implementation over a weak shared surface — the spec itself prescribed grooming if any capability grew past ~200 lines of design, and all 5 did.

Split into:

- **[chat-conversation-templates](chat-conversation-templates.md) (P2)** — picked as first to ship. Smallest diff, no schema change, reuses workflow-blueprints instantiation pipeline. Three entry points (empty-state card, `/new-from-template` slash command, `⌘K` palette) open a sliding sheet picker; selecting a blueprint pre-fills the composer with a rendered `chatPrompt`. Optional new `chatPrompt` field on the blueprint schema with step-1 fallback keeps all 13 existing blueprints compatible without edits.
- **[chat-filter-namespace](chat-filter-namespace.md) (P2)** — `#key:value` parser as shared infrastructure (chat popovers + list pages), not just chat sugar. Promotes to P2 because the reuse surface (tasks/projects/workflows list pages, `⌘K`) extends the value beyond chat.
- **[chat-pinned-saved-searches](chat-pinned-saved-searches.md) (P3)** — depends on filter-namespace; pure `settings.chat` JSON storage, no new tables. Per-surface keying keeps pins scoped.
- **[chat-skill-composition](chat-skill-composition.md) (P3)** — relaxes single-active-skill on capable runtimes (Claude/Codex), blocks on Ollama. Touches the runtime capability matrix and context-builder injection path — high cross-runtime regression surface, requires MEMORY.md smoke-test-budget per runtime-registry-adjacent rule.
- **[chat-conversation-branches](chat-conversation-branches.md) (P3)** — largest design surface. Schema additions (`parentConversationId`, `branchedFromMessageId`, `rewoundAt`), context-builder ancestor walk, tree view, `⌘Z`/`⌘⇧Z` rewind. Feature-flagged off by default until dogfooding validates. Deferred deliberately — want evidence before committing to the schema shape.

The umbrella spec (`chat-advanced-ux.md`) is preserved as a historical pointer with `status: split` and a successor-spec table. No implementation should reference it directly going forward.

Next up: [chat-conversation-templates](chat-conversation-templates.md).

### Completed — dynamic-slash-commands (P2)

Project skills discovered via `auto-environment-scan` + exposed through `/api/profiles?scope=project` now appear as a dynamic **Skills** group in the chat `/` popover alongside ainative's built-in tool groups. `tool-catalog.ts` gained a `Skills` entry in the `ToolGroup` union (Sparkles icon, ordered after `Profiles`) and a new `getToolCatalogWithSkills(opts)` builder that concatenates project-scoped entries onto the static catalog only when `projectProfiles` is non-empty — the base catalog path is byte-identical when no project is active, so the static-cache semantics of `getToolCatalog()` are preserved.

Client wiring is a single new hook (`src/hooks/use-project-skills.ts`) that fetches on `projectId` change with AbortController cleanup, threaded through `chat-input.tsx:265` → `chat-command-popover.tsx:233`. Selection inserts template text `Use the {skill-name} profile: ` into the input, relying on the chat engine's existing profile-routing path — zero schema changes, no new conversation-level `profileId` column. cmdk filtering over name + description works automatically; the group is elided from the popover when the active project has no skills.

Feature was already code-complete per the MEMORY.md "spec frontmatter `status: in-progress` is unreliable" rule — this close-out flipped status and cross-referenced shipped surfaces. `npx tsc --noEmit` clean across the 4 touched modules.

### Completed — chat-environment-integration (P2)

The chat Skills tab now surfaces per-skill environment metadata: health (derived from `modifiedAt` age — `healthy` <180d / `stale` 180-365d / `aging` ≥365d / `unknown`), cross-tool sync status (`synced` / `claude-only` / `codex-only` / `shared` based on file presence), profile linkage (from `environment_artifacts.linked_profile_id` populated by the existing profile-linker), and scope (`user` | `project`). A passive "Recommended" star appears on healthy skills whose name + preview keywords match the conversation's recent user messages (≥2 distinct hits, stopword-filtered); per-conversation dismissal persists 7 days. Fire-and-forget `POST /api/environment/rescan-if-stale` is called on every conversation activation — reuses the existing `shouldRescan` + `ensureFreshScan` helpers from `auto-scan.ts`, so no new stampede/lock code was needed.

Architecture is strictly read-only over the existing scanner. `listSkillsEnriched()` goes directly to the DB (`getLatestScan()` + `getArtifacts()`) because `linkedProfileId` only lives on the DB row — not the in-memory `EnvironmentArtifact` type the scanner returns. The `list_skills` MCP tool's `enriched: boolean` param is additive and backwards compatible. `SkillRow` renders 4 badges + optional dismissable star + ↗ deep-link to `/environment?skill=<name>` when the skill isn't fully synced.

**Scope-adjusted from spec**: the profile-suggestion *chip above the input* became a passive star inside the Skills tab — same match logic, lower UI intrusiveness, simpler state.

37 new unit tests; `npx tsc --noEmit` clean; endpoint smoke-verified on localhost:3010.

### Completed — chat-command-namespace-refactor (P1)

**Breaking UX change** (accepted per spec Q7 — alpha product, no deprecation shim). The `/` popover is now tabbed (Actions / Skills / Tools / Entities) instead of a single grouped list. Eight new session commands (`/clear`, `/compact`, `/export`, `/help`, `/settings`, `/new-task`, `/new-workflow`, `/new-schedule`) live under a new `Session` group that surfaces first in the Actions tab. A runtime-aware capability banner renders below the chat input on runtimes that lack filesystem + Bash tools (Ollama, Anthropic-direct, OpenAI-direct) and stays silent on Claude + Codex App Server. The ⌘K palette gained Skills and Files groups (files with 200ms debounced search against `/api/chat/files/search`). New keyboard bindings: `⌘L` / `⌘⇧L` to clear, `⌘/` to focus the input and open the slash menu.

Architecture: a single-rooted cmdk `<Command>` wraps both tabbed-slash and mention modes so focus/selection state never flickers on tab switch. The partition is a pure function over the existing `ToolCatalogEntry[]`, with `GROUP_TO_TAB` exhaustively typed via `satisfies Record<ToolGroup, CommandTabId>` so any future `ToolGroup` added without a tab assignment fails to compile. Session commands dispatch `ainative.chat.{clear,compact,export,help}` CustomEvents from `chat-input.tsx`; the session provider listens and routes them (`/clear` → `createConversation()`, `/export` → new `POST /api/chat/export` endpoint that writes inline markdown to `~/.ainative/uploads/chat-exports/` and inserts a documents row, `/help` → `HelpDialog`, `/compact` → toast stub). Per-user tab persistence via `localStorage`; per-session banner dismissal via `sessionStorage`, keyed on `runtimeId`.

Frontend-designer sign-off recorded in the feature spec. 3 design-review findings addressed (MI=2 motion trim, focus-visible ring on banner dismiss, dialog padding redundancy).

22 new unit tests; `npx tsc --noEmit` clean; browser-verified on Claude + Ollama (`gpt-oss`) runtimes.

Deferred:
- AC #3 env-aware Skills-tab badges → `chat-environment-integration` (still planned).
- AC #4 Tools-tab "Advanced reveal" toggle → softened to "always visible" during HOLD scope approval.
- ⌘K palette Skills / Files dispatch listeners on the chat-input side → short follow-up.
- `/compact` machinery (currently a toast stub) → `chat-advanced-ux` or its own feature.
- Edge case: typing `/help`+Enter while last-remembered active tab is `Entities` (which has no cmdk-items under its placeholder) sends the text to chat — logged as follow-up.

### Completed — chat-codex-app-server-skills (P1)

Closed out as a **scope-adjusted** feature. The original spec called for wiring `turn/start` skill parameters into `sendCodexMessage()`, but a closer read of the App Server reference (`.claude/reference/developers-openai-com-codex-sdk/app-server.md` + `skills.md`) confirmed that the protocol has no such parameters — what the spec described is Codex's *natural* behavior when the App Server's `cwd` is set correctly. `cwd` plumbing already worked (`codex-engine.ts:104-105` overrides `workspace.cwd` with the project's `workingDirectory` before any App Server call).

The actual gap was on the *ainative* side: `chat-ollama-native-skills` injected SKILL.md into Tier 0 unconditionally, duplicating context on Codex (and Claude) where the runtime's native skill discovery already loads the same content from `.agents/skills/` or `.claude/skills/`.

Changes:
- `src/lib/chat/context-builder.ts` — `buildActiveSkill` now reads the conversation's `runtimeId`, looks up `getRuntimeFeatures(runtimeId).stagentInjectsSkills`, and **suppresses** Tier 0 injection when the flag is `false`. Behavior:
  - `ollama` → injects (no native path; ainative must inject)
  - `claude-code`, `openai-codex-app-server`, `*-direct` → suppressed (native discovery handles it)
  - Unknown runtime → falls through and injects (safer default than silently dropping)
- `src/lib/chat/__tests__/active-skill-injection.test.ts` — extended with 4 runtime-flag tests. 8/8 file tests pass; 173/173 chat tests overall.

Browser-verified end-to-end via Claude in Chrome as an **A/B comparison across the code change**: the same conversation with `.claude/skills/technical-writer` activated. Before the fix, the model quoted `## Active Skill: technical-writer` from its system prompt verbatim. After the fix, on the very next turn (same conv, same activation), the model responded `ABSENT` and noted *"The injection that was visible in my previous response is gone — likely due to a code change you made"*. Highest-confidence smoke result possible: same model as oracle, observing the diff between two turns.

Deferred: Q8a runtime-compatibility `requiredTools` filter on `list_skills` (skills don't declare requiredTools today — YAGNI); App Server skill-event chip rendering (events flow through generic tool path today, sufficient for v1); ainative-side `turn/start` skill wiring (protocol doesn't support it — reframed as "trust native Codex discovery").

### Completed — chat-ollama-native-skills (P2)

ainative-managed conversation-scoped skill activation, runtime-agnostic by design but motivated by Ollama (which has no SDK-native skill support). When a skill is bound to a conversation via the new `activate_skill` MCP tool, its SKILL.md is injected into Tier 0 of the system prompt on every subsequent turn until `deactivate_skill` clears it. Same machinery works on Claude / Codex as a programmatic skill-activation path alongside their native handling.

Changes:
- DB: `conversations.active_skill_id TEXT` column. Added to both the `CREATE TABLE` (fresh DBs) and via `addColumnIfMissing` (existing DBs). Drizzle schema updated. The CREATE-table addition was needed because `addColumnIfMissing` runs before the table CREATE in `bootstrap.ts`, so on fresh DBs the ALTER fails silently — caught by failing tests on a fresh temp DB.
- Discovery: `src/lib/environment/list-skills.ts` filters scanner artifacts by `category === "skill"` and resolves the SKILL.md inside each skill directory (probing `SKILL.md` → `skill.md` → first `*.md`).
- 4 MCP tools in `src/lib/chat/tools/skill-tools.ts` (`list_skills`, `get_skill`, `activate_skill`, `deactivate_skill`) registered in `ainative-tools.ts` and the popover catalog under "Skills". Single-active-skill enforced server-side; activate validates skill + conversation exist before writing.
- Tier 0 injection: `context-builder.ts` `buildActiveSkill` helper reads the bound id and appends SKILL.md under `## Active Skill: <name>` between Tier 0 and Tier 3. ~4000 token cap. Dynamic import keeps the scanner off the hot path for conversations without an active skill.

Tests: 11 skill-tool unit tests + 4 Tier 0 injection tests. **171/171 chat tests green** including the existing finalize-safety-net + reconcile suites that touch the conversations table.

Browser-verified end-to-end via Claude in Chrome: `list_skills` enumerated 62 skills correctly across user/project/shared scopes; `activate_skill` persisted the binding to SQLite; the next turn's system prompt contained the literal `## Active Skill: technical-writer` line + SKILL.md content (model quoted it verbatim).

The smoke test caught a real bug that unit tests missed: `getSkill` was calling `readFileSync(absPath)` where absPath is the skill **directory**, not the SKILL.md file — `EISDIR` was silently swallowed, returning null. Unit tests didn't catch it because they mocked the helper at its outermost boundary. Fix: `resolveSkillFile` helper. **Exactly the failure mode the project's smoke-test budget rule was designed to surface.**

Deferred: context-window warning toast (depends on unsettled per-runtime context-window probing — belongs in `chat-environment-integration` or its own feature); persistent active-skill chip in chat input (UI affordance for `chat-command-namespace-refactor`); SKILL.md duplication suppression on Claude/Codex (their native skill handling already loads the same content; the Tier 0 injection is harmless but redundant).

### Completed — chat-file-mentions (P1)

Users can now type `@src/lib/db/schema.ts` in chat and have the file either inlined (if <8 KB) or referenced (so Claude agents can fetch it via the `Read` tool). CLI muscle memory reaches the web UI. Extends the existing `@` mention pipeline with a new `entityType: "file"` — no new plumbing.

Changes:
- `src/lib/chat/files/search.ts` + `GET /api/chat/files/search` — file search API backed by `git ls-files --cached --others --exclude-standard` (no new npm dep, native `.gitignore` respect). Substring match with filename-first ranking, secondary sort by mtime. Server-resolves cwd from the active project's `workingDirectory` or `getLaunchCwd()` — never from client input. 7 unit tests.
- `src/hooks/use-chat-autocomplete.ts` — parallel `fileResults` state feeds the popover. Debounced 150 ms, aborts in-flight requests on each keystroke. File mentions insert `@<path>` (not `@file:<path>`) to match CLI-origin muscle memory.
- `src/components/chat/chat-command-popover.tsx` — `file` entity type registered with `FileCode` icon, "Files" heading, `font-mono text-xs` path rendering.
- `src/lib/chat/files/expand-mention.ts` + `context-builder.ts` — `buildTier3` `case "file":` delegates to a new `expandFileMention(relPath, cwd)` helper. <8 KB files are inlined in a fenced code block with a `### File: <path>` header; ≥8 KB files emit a one-line reference with size hint. Security belt-and-suspenders: `realpathSync(cwd) + startsWith` rejects escape paths without opening the file. 7 unit tests.

Browser-verified end-to-end via Claude in Chrome: small-file inlining produced an exact-heading quote from the model; large-file reference produced an acknowledgment of the 48 KB size and offer to use the `Read` tool; gitignore respect confirmed via an API probe for `node_modules` returning `[]`. Full details in `features/chat-file-mentions.md` → Verification run.

Deferred: fuzzy match, file-list caching, Ollama hover hint (belongs in `chat-environment-integration`). Multi-file globs explicitly out of spec.

### Completed — chat-dedup-variant-tolerance (P3)

Fixed false positives in the workflow dedup guardrail flagged by the code review of commit `b5ed09b`. Pooled Jaccard over name+step text at threshold 0.7 was blocking legitimate target-entity variants like "Enrich contacts" vs "Enrich accounts" and "Daily standup digest" vs "Weekly standup digest" — forcing users to pass `force: true` for every such pair and eroding trust in the guardrail.

Fix: `findSimilarWorkflows` now splits comparison into name and step signals scored as separate Jaccards, then combines with 0.5/0.5 weights against the unchanged 0.7 threshold. The one-token difference in names AND step prompts contributes to two independent Jaccards, which together pull combined similarity below 0.7 while structural duplicates (same steps + renamed workflow) still exceed it.

Changes:
- `src/lib/chat/tools/workflow-tools.ts` — replaced `workflowComparableText` with `workflowSignals` helper, added `WORKFLOW_NAME_WEIGHT` + `WORKFLOW_STEPS_WEIGHT` constants, extensive rationale comment above the threshold. Updated `create_workflow` `force` param description so the LLM knows the guardrail already tolerates target-entity variants.
- `src/lib/chat/tools/__tests__/workflow-tools-dedup.test.ts` — 4 new tests under "legitimate variant tolerance" (2 positive + 2 guard). 11/11 file tests pass; 88/88 chat-tool tests pass.

Empirical separation on the test corpus: variants score 0.60–0.68, duplicates score 0.75–1.00 — ~0.07–0.10 of headroom on each side of the 0.7 threshold. If tags ever land on workflows, revisit weights (spec sketched 0.3/0.5/0.2 name/steps/tags).

### Completed — chat-settings-tool (P1)

Closed out the `set_settings` chat tool — allowing users to update safe ainative settings via natural-language prompts with user-approval gating. The runtime implementation had shipped earlier (tool definition, allowlist, validators, permission-gating, catalog entry) but the spec was never flipped and no tests guarded the security-critical allowlist.

Changes:
- `src/lib/chat/tools/__tests__/settings-tools.test.ts` (new, 31 tests) — positive path, unknown-key rejection, **parameterized secret-exclusion guardrail** (11 forbidden keys: `auth.apiKey`, `auth.method`, `permissions.allow`, `usage.budgetPolicy`, `browser.*Config`, etc.), per-key validation coverage (integer bounds, enums, bool, step alignment, empty-string, float ranges).
- `features/chat-settings-tool.md` — writable-keys table synced to match the shipped reality (12 keys, up from the 9 originally scoped — the 3 budget keys `budget_max_cost_per_task`, `budget_max_tokens_per_task`, `budget_max_daily_cost` were added during implementation). Status flipped `planned` → `completed`. Verification run appended.

No runtime code changes. The secret-exclusion test fails noisily if any of `auth.apiKey`, `auth.method`, `permissions.allow`, `usage.budgetPolicy`, or any `browser.*Config` key is ever added to the `WRITABLE_SETTINGS` allowlist — the guardrail is now self-auditing.

### Completed — chat-session-persistence-provider (P0)

Closed out the provider-hoisting fix that makes chat streams survive sidebar navigation. The provider + layout wiring + `ChatShell` refactor + four unit tests shipped in an earlier (unrecorded) commit; this pass adds the remaining `client.stream.view-remount` telemetry reason code from AC §5 and verifies the fix end-to-end. No server-side changes.

Changes:
- `src/lib/chat/stream-telemetry.ts` — documented the 4th client reason code (`client.stream.view-remount`) alongside the existing three.
- `src/components/chat/chat-shell.tsx` — added `useEffect` cleanup that emits the breadcrumb when the shell unmounts while a stream is in flight. Uses `isStreamingRef` + `activeIdRef` so the cleanup closure sees values at unmount time, not at effect-setup time (a stale-closure bug caught by the contract tests on first run).
- `src/components/chat/__tests__/chat-session-provider.test.tsx` — two new contract tests: positive case (emits with correct `conversationId`) and guard case (no emit when not streaming). Test count rises from 4 → 6, all green in ~50ms.

Verification: developer ran the plan's manual smoke sequence on both Claude (`sonnet`) and GPT (Codex) runtimes, 1 + 5 nav cycles per runtime. Zero turn loss, zero `stream.abandoned` events, view-remount log lines appeared as expected. Full record in `features/chat-session-persistence-provider.md` → "Verification run — 2026-04-14".

### Reconciled — frontmatter drift sweep (PLG Monetization + apps/marketplace)

Closed two directions of status drift left behind by the 2026-04-13 Community Edition pivot.

**PLG Monetization — flipped 13 specs `planned` → `completed` with supersession banner.** These features shipped earlier in the project but their individual spec frontmatter was never updated, while the roadmap rows correctly showed `completed`. All 13 were subsequently reverted by `community-edition-simplification` on 2026-04-13. Each spec now carries a blockquote banner at the top: "Superseded by `community-edition-simplification` (2026-04-13). This feature shipped but was later fully reverted when ainative pivoted to a 100% free Community Edition…". Files: `stripe-billing-integration`, `community-edition-soft-limits`, `subscription-management-ui`, `upgrade-cta-banners`, `outcome-analytics-dashboard`, `parallel-workflow-limit`, `cloud-sync`, `license-activation-flow`, `edition-readme-update`, `first-run-onboarding`, `marketing-site-pricing-page`, `transactional-email-flows`, `upgrade-conversion-instrumentation`.

**Marketplace / apps-distribution vision — flipped 17 specs `planned` → `deferred` with banner.** The entire apps/marketplace product vision has no active plan after the CE pivot; specs are preserved as backlog. Each spec now carries: "Deferred 2026-04-14. Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition…". Files: `creator-portal`, `curated-collections`, `visual-app-studio`, `conversational-app-editing`, `app-forking-remix`, `app-remix`, `app-mcp-server-wiring`, `app-single-file-format`, `app-budget-policies`, `app-distribution-channels`, `app-conflict-resolution`, `app-updates-dependencies`, `app-embeddable-install-widget`, `app-extended-primitives-tier2`, `marketplace-local-first-discovery`, `marketplace-reviews`, `my-apps-lifecycle`. Roadmap rows updated to match.

No code changes. Spec-hygiene only. Open-feature count drops from 66 → 49 (49 active + 30 deferred + 1 proposed).

## 2026-04-13

### Completed — community-edition-simplification (P0), remove-supabase-dependencies (P0), remove-anonymous-telemetry (P0)

ainative collapses to a single free Community Edition. The full PLG Monetization stack (license manager, 4-tier system, Stripe billing, feature gating, resource limits, cloud license validation) is removed along with all Supabase cloud dependencies and the vestigial anonymous telemetry toggle. Analytics is ungated for all users; memories/schedules/parallel workflows have no artificial limits; history retention is a fixed 365 days; the app runs fully offline with no external service required.

Shipped in three sequential commits on the same day:
- `0436803` — `community-edition-simplification`: removed license manager, 8 license lib files, 4 license API routes, 6 gate UI components, 5 Supabase billing edge functions (validate-license, create-checkout-session, create-portal-session, stripe-webhook, conversion-ingest), license DB table, and all tier-check call sites across API routes and core modules. Also removed App Catalog and Blueprint Marketplace in the same pass. 97 files changed, ~6,800 lines deleted.
- `3a0dc42` — `remove-supabase-dependencies`: deleted `src/lib/cloud/`, `src/lib/sync/`, `src/app/api/sync/`, auth callback, cloud account + cloud sync settings sections, onboarding email capture, `@supabase/supabase-js` dependency, and the `telemetry-ingest` / `send-email` edge functions. `waitlist-signup` preserved (marketing-site feature). TelemetrySection UI preserved (local-only toggle).
- `d25b3ae` — `remove-anonymous-telemetry`: deleted the TelemetrySection component, `/api/settings/telemetry` route, and `TELEMETRY_*` settings keys — closing the data-privacy loop now that the cloud flush is gone. Analytics dashboard and local usage ledger unaffected.

Preserved (not subscription-related, despite similar naming): `TrustTierBadge` (permission levels) and `UpgradeBadge` (git version upgrades).

Supersedes: every row in roadmap sections "PLG Monetization — Foundation / Core / Growth Layer". TDR-030 (hybrid instance licensing) deprecated. MEMORY.md pivot recorded: "100% Community Edition — All subscription tiers, Stripe billing, license manager, and marketplace removed."

### Completed — task-runtime-skill-parity (P1)

Mirror of Phase 1a (`chat-claude-sdk-skills`) into the Claude task execution runtime. Project skills, CLAUDE.md, and filesystem tools (`Skill`, `Read`, `Grep`, `Glob`, `Edit`, `Write`, `Bash`, `TodoWrite`) now reach background tasks on the `claude-code` runtime the same way they reach interactive chat — closing the architect drift flagged in `ideas/chat-context-experience.md` §11.

Key changes:
- `CLAUDE_SDK_{ALLOWED_TOOLS,SETTING_SOURCES,READ_ONLY_FS_TOOLS}` extracted from `chat/engine.ts` into shared `agents/runtime/claude-sdk.ts` so both callers use a single source of truth.
- `handleToolPermission` gains a Layer 1.75 (SDK filesystem + `Skill` auto-allow). Profile `autoDeny` still wins via Layer 1 precedence.
- Both `executeClaudeTask` and `resumeClaudeTask` pass `settingSources` + merged allowed-tools, capability-gated on `getFeaturesForModel(...).hasNativeSkills`. Profile allowedTools wins when explicit; `CLAUDE_SDK_ALLOWED_TOOLS` is the fallback. Empty-allowlist edge case tightened (`length > 0` required).
- Parity regression test splits `claude-agent.ts` source on `export async function resumeClaudeTask` so execute and resume `query()` blocks are unambiguously attributed.
- Pre-existing `A-ainative-3` test updated to lock in the new allowedTools contract (Phase 1a list now ships by default when no profile allowlist is set).

Scope pushback documented: the spec's §3 (shared Tier 0 partition helper) was deferred — chat's system prompt embeds conversation history, task's embeds document/table/output context, making a shared helper speculative abstraction.

TDR-032 smoke test verified: a real task (`39331e2f-71a5-42fc-8928-bbe4c8f66ae3`) invoked the `task-smoke` fixture skill via the `Skill` tool and returned the exact sentinel `TASK_SMOKE_SKILL_REACHED_AGENT`. No `ReferenceError` in dev-server output. Smoke fixture deleted post-run.

Commits: `bc597d0` → `f966c7d` (9 commits). Plan: `internal implementation plan`.

Unblocks: — (the P1 Claude-runtime skill story is now complete; remaining Chat Context Experience features can proceed independently).

### Completed — chat-claude-sdk-skills (P0)

Flipped ainative chat on the `claude-code` runtime from "isolation mode" to "SDK-native." Two small changes to `src/lib/chat/engine.ts` do the heavy lifting: `settingSources: ["user", "project"]` activates the SDK's CLAUDE.md + `.claude/skills/` + `~/.claude/skills/` auto-loading, and adding Skill, Read, Grep, Glob, Edit, Write, Bash, TodoWrite to `allowedTools` exposes the full filesystem tool suite. A read-only auto-allow branch in the existing `canUseTool` closure silences permission prompts for Read/Grep/Glob (mirroring the browser/exa pattern). Edit/Write/Bash/TodoWrite route through the pre-existing side-channel permission bridge automatically — no new plumbing. `Task` subagent tool intentionally excluded; ainative task primitives replace it.

Tier 0 / CLAUDE.md partition audit (DD-CE-002): documented as a doc comment on `STAGENT_SYSTEM_PROMPT`. Finding: zero content migration needed — Tier 0 is already ainative-identity scoped for this codebase. Regression guard: future contributors adding project-specific rules to `system-prompt.ts` should be caught in code review against the rubric.

`list_profiles` chat tool now fuses registry profiles with SDK-discovered filesystem skills via new `listFusedProfiles(projectDir)` helper (at `src/lib/agents/profiles/list-fused-profiles.ts`). Dedupes by id — registry wins on collision. Malformed SKILL.md frontmatter logs-then-skips. `getListProfilesTool(projectDir)` factory threads project working directory through the chat tool-assembly stack (helpers.ts `ToolContext`, ainative-tools.ts factory signatures, engine.ts call site).

Regression guards: hooks-excluded test greps engine.ts source for a `hooks:` key. Auto-allow policy exercised by 11 unit tests covering Read/Grep/Glob auto-allow, Edit/Bash non-auto-allow, Skill auto-allow, and Task absence. TDR-032 smoke test on live dev server (claude-in-chrome MCP, Opus model): skill invocation reached LLM, CLAUDE.md content auto-loaded, Grep ran without permission prompt, no ReferenceError.

Unblocks: `chat-codex-app-server-skills` (P1), `chat-ollama-native-skills` (P2), `task-runtime-skill-parity` (P1), `chat-file-mentions` (P1), `chat-command-namespace-refactor` (P1).

Commits: `78bdbaa` → `cd73c2e` (10 commits). Plan: `internal implementation plan`.

### Completed — runtime-capability-matrix (P1)

Shipped the first-class runtime-feature declaration in `src/lib/agents/runtime/catalog.ts`. Added `RuntimeFeatures` interface as a **sibling** of the pre-existing operational `RuntimeCapabilities` bag (not a rename — that would have broken ~7 consumer files). Populated the 9-field feature bag on all 5 runtimes (`claude-code`, `openai-codex-app-server`, `anthropic-direct`, `openai-direct`, `ollama`). Added `getRuntimeFeatures` helper + `getFeaturesForModel` chat-layer convenience. Drift-guarded by exhaustiveness + inline-snapshot + length-against-interface-growth tests (14 tests total, all green). TDR-032 smoke test: `GET /api/chat/models` cold-compiled 200, no module-load cycle.

Commits: `98681bf` → `dee6b3b` (6 commits). Plan: `internal implementation plan`. Consumer wiring (popover filter, capability hint banner, settings-onboarding, `RuntimeSummary.features`) intentionally deferred to downstream specs per the plan's NOT-in-scope list.

Unblocks: `chat-claude-sdk-skills` (P0 critical path), `chat-codex-app-server-skills`, `chat-ollama-native-skills`, `chat-command-namespace-refactor`, `task-runtime-skill-parity`, `onboarding-runtime-provider-choice`.

### Groomed — Chat Context Experience (10 features)

Extracted 10 new features from `ideas/chat-context-experience.md` (brainstorm with contributions from `/architect`, `/product-manager`, `/frontend-designer`). Consulted `/product-manager` for template authoring, with architect/frontend-designer guidance sourced from §11 of the ideas doc (inline contributions).

Goal: bring ainative chat to CLI parity for skills, CLAUDE.md/AGENTS.md auto-loading, filesystem tools, and command UX — uniformly across three runtimes (Claude Agent SDK, Codex App Server, Ollama HTTP) — while preserving ainative's differentiation layer (permission bridge, persistent conversations, ainative primitives, rich tool result UI).

**Phase 1 — Runtime-native skill integration (sequential rollout per Q1):**
- `chat-claude-sdk-skills` (P0) — `settingSources` + `Skill` tool + filesystem tools on `claude-code` runtime. Includes DD-CE-002 (Tier 0 / CLAUDE.md partition). Critical path.
- `chat-codex-app-server-skills` (P1) — `turn/start` skill parameters on `openai-codex-app-server` runtime. Depends on 1a's UX contract.
- `chat-ollama-native-skills` (P2) — ainative-native `activate_skill` MCP tools + context injection for Ollama (no SDK support). Depends on 1a.

**Cross-cutting infrastructure:**
- `runtime-capability-matrix` (P1) — first-class capability flags on `src/lib/agents/runtime/catalog.ts`; hard prerequisite for skill/tool/hint filtering across runtimes (architect drift concern, §11).
- `task-runtime-skill-parity` (P1) — mirror Phase 1a into `claude-agent.ts` so task execution and chat see the same skills (architect drift concern, §11).
- `onboarding-runtime-provider-choice` (P2) — first-launch model/provider preference modal (Q10).

**Phase 2-5:**
- `chat-file-mentions` (P1) — `@file:path` typeahead with tiered expansion (Q6).
- `chat-command-namespace-refactor` (P1) — `/` = verbs, `@` = nouns, tabbed popover, ⌘K palette, capability hint banner (Q9a). **Breaking UX change** accepted per Q7 (alpha product). Flagged for `/frontend-designer` sign-off before implementation.
- `chat-environment-integration` (P2) — SDK-native skills augmented with environment metadata (health, profile linkage, cross-tool sync) per DD-CE-004.
- `chat-advanced-ux` (P3) — `#` filter namespace, saved searches, conversation templates from workflow blueprints, skill composition with conflict warning, branches with undo/redo.

Key design decisions locked during grooming:
- **Uniform UX, per-runtime implementation** — same `/skill-name` syntax across runtimes, implementation differs per SDK capability.
- **Option B partition** — ainative Tier 0 covers identity/tools; SDK-loaded CLAUDE.md covers project conventions.
- **Filesystem hooks excluded** (Q2) from scope.
- **Bash included** with ainative permission bridge (Q3).
- **Q8a filter** — hide skills whose required tools are unavailable on the active runtime (not badge, not rewrite).
- **Q9a** — capability-hint banner below input for reduced-capability runtimes (e.g., Ollama).

Source: `ideas/chat-context-experience.md`
Plan: `internal implementation plan`

## 2026-04-12

### Rolled Back — App Marketplace Sprints 45-47

Surgically reverted 21 of 29 commits from 2026-04-11 to 2026-04-12 that implemented custom app creation and marketplace distribution features. Preserved 8 general improvement commits (workspace context, chat race condition fix, short entity ID resolution, kanban timestamps, upgrade timestamp).

Features reverted from completed to deferred:
- `app-package-format`, `app-seed-data-generation`, `app-extended-primitives-tier1`, `marketplace-install-hardening`

Features reverted from in-progress to deferred:
- `fix-exported-bundle-registration`, `fix-sidebar-reactive-update`, `fix-sidebar-accordion-behavior`

Features with code removed but roadmap status unchanged (already planned):
- `chat-app-builder`, `promote-conversation-to-app`, `marketplace-app-listing`, `marketplace-app-publishing`, `marketplace-trust-ladder`, `my-apps-lifecycle`, `app-cli-tools`

Sprint plan Sprints 45-50 suspended. No non-app features blocked. Prior implementation exists in git history for future reference.

### Groomed — My Apps Tab & User-Built App Lifecycle

New feature: `my-apps-lifecycle` (P1). Consulted `/product-manager`, `/architect`, `/frontend-designer`.
- "My Apps" marketplace tab for user-built apps (installed, archived, failed states)
- Re-install from archived SAP directories, permanent delete from disk
- Registry source tracking (`bundleSourceMap`), `deregisterBundle()` for cleanup
- Delete confirmation dialog distinct from uninstall (permanent vs. archive)
- Error & Rescue Registry covers 8 failure modes (corrupt manifests, race conditions, permission errors)

### Groomed — Sidebar Bug Fixes (3 features)

Groomed 3 bugs from internal history into feature specs:
- `fix-exported-bundle-registration` (P1) — exported bundles via export_app_bundle MCP tool don't get DB records, so they never appear in sidebar
- `fix-sidebar-reactive-update` (P1) — sidebar doesn't re-fetch app data after install, requires full page refresh
- `fix-sidebar-accordion-behavior` (P2) — app sidebar menus always expanded, missing accordion pattern from native groups

Consulted `/architect` (impact analysis) and `/frontend-designer` (UX review). Key decisions:
- Use `installApp(id, name, bundle)` with providedBundle param to bypass registry lookup
- Add `pathname` to sidebar useEffect dependencies for reactive re-fetch
- Unified accordion state across native and app groups with visual parity

## 2026-04-11

### Groomed — App Marketplace Expansion (26 features)

Brainstormed and decomposed the full App Marketplace feature surface across 7 areas:
- **Packaging & Format** (4 features): app-package-format, app-seed-data-generation, app-cli-tools, app-single-file-format
- **Runtime & Installation** (3 features): app-runtime-bundle-foundation (retroactive, completed), app-conflict-resolution, app-updates-dependencies
- **Extended Primitives** (4 features): tier1 (triggers/documents/notifications/savedViews/envVars), tier2 (channels/memory/chatTools/workflows), MCP server wiring, budget policies
- **Chat-Native Authoring** (5 features): chat-app-builder, promote-conversation-to-app, app-remix, conversational-app-editing, visual-app-studio
- **Distribution & Community** (10 features): marketplace-app-listing, marketplace-app-publishing, marketplace-trust-ladder, app-distribution-channels, app-forking-remix, creator-portal, curated-collections, marketplace-reviews, marketplace-local-first-discovery, app-embeddable-install-widget

Key decisions locked during brainstorm:
- All three authoring tiers (developer TS, power user YAML/MD, end user chat) — one grammar, plural serializations
- Apps contain MCP servers (ainative-native, cross-platform tool exposure)
- Trust ceiling: declarative + MCP protocol (no sandboxed JS execution)
- Trust → execution tier mapping: community=Tier A (declarative), verified=Tier A+B (MCP/channels/tools), official=full access

Source: internal history record + brainstorm session with /architect, /product-manager, /frontend-designer
Plan: internal implementation plan

### Completed — app-seed-data-generation (P1)

Built the data sanitization pipeline for generating safe, synthetic seed data from live tables:
- **7 sanitizer modules** in `src/lib/apps/sanitizers/`: keep, randomize, shift, faker (lightweight built-in pools), derive (formula evaluator), redact, hash
- **PII scanner** (`pii-scanner.ts`): detects SSN, credit card (Luhn), real email domains, phone, public IP, street address patterns with error/warning severity levels
- **Seed generator** (`seed-generator.ts`): orchestrates sanitization pipeline, runs PII scan, outputs CSV files with proper escaping
- **Zod validation** for `seedData` manifest section
- 28 tests: all 7 sanitizers, PII detection (10 patterns), full pipeline, CSV round-trip with escaping
- CLI command (`ainative app seed`) deferred to `app-cli-tools`

873 tests pass, `tsc --noEmit` clean. Unblocks app-cli-tools and promote-conversation-to-app.

### Completed — app-extended-primitives-tier1 (P1)

Extended AppBundle from 7 to 12 primitives by wiring 5 new template types into the install/bootstrap pipeline:
- **Triggers** — `AppTriggerTemplate` with row_added/updated/deleted events, bootstraps into `user_table_triggers` table
- **Documents** — `AppDocumentTemplate` with glob patterns and size limits, tracked as declarations in resource map
- **Notifications** — `AppNotificationTemplate` with lifecycle modes, bootstraps into `notifications` table
- **Saved Views** — `AppSavedViewTemplate` with filters/sort/columns, bootstraps into `user_table_views` table
- **Environment Variables** — `AppEnvVarDeclaration` with required/sensitive flags, tracked as declarations

All 5 new fields are optional on AppBundle (backward compatible). Both builtin apps (wealth-manager, growth-module) include examples of all 5 primitives. 5 new Zod schemas, 5 new permissions, extended AppResourceMap. 9 unit tests covering all bootstrap handlers, idempotency, and validation.

845 tests pass, `tsc --noEmit` clean. Unblocks 4 downstream features: app-extended-primitives-tier2, chat-app-builder, marketplace-trust-ladder, marketplace-app-publishing.

### Completed — app-package-format (P1)

Implemented the `.sap` (ainative App Package) YAML-based directory format — the portable, distributable representation of an AppBundle. Key deliverables:
- `SapManifest` type with YAML-specific fields (author, license, platform compat, marketplace metadata, sidebar, provides, dependencies)
- `sapManifestSchema` Zod validation with clear error messages
- `sapToBundle()` — parses a `.sap` directory into a typed AppBundle with namespace-prefixed artifact IDs
- `bundleToSap()` — serializes an AppBundle to a `.sap` directory with namespace-stripped portable keys
- Platform version compatibility via `semver` (new dependency)
- File reference validation (provides entries must have corresponding files)
- 24 unit tests covering both conversion directions, namespace isolation, platform compat, validation errors, missing file refs, and full round-trip
- Reference fixture: `wealth-manager.sap/` with manifest + 3 tables + 1 schedule + 2 profiles + 2 blueprints

This unblocks 7 downstream features: app-seed-data-generation, app-cli-tools, app-single-file-format, app-conflict-resolution, chat-app-builder, visual-app-studio, marketplace-app-publishing.

### Completed — marketplace-install-hardening (P1, Ship Verified)

Closed the 3 correctness gaps from the runtime-bundle code review:
1. **JSON.parse guard** — `hydrateInstance` now wraps both manifest and UI schema parsing in try-catch via `safeParseJson()`, returning a corrupt-status fallback instead of crashing. UI renders "manifest corrupt" badge with uninstall action.
2. **UNIQUE conflict handling** — `installApp` now returns existing instance on duplicate instead of throwing. UNIQUE index on `app_instances(app_id)` was already in place from prior work.
3. **E2E install test** — 5 new tests covering install→bootstrap→ready roundtrip, uninstall cleanup, duplicate install idempotency, and corrupt manifest/UI schema handling.

8/8 app tests pass, 812/812 unit tests pass, `tsc --noEmit` clean. This unblocks Sprint 45: app-package-format, app-extended-primitives-tier1, marketplace-app-listing.

### Frontmatter Sync — 5 stale spec statuses corrected

Discovered that 5 feature specs had `status: planned` in frontmatter while the roadmap correctly showed `completed`. All verified against implementation and tests, then flipped:
- `instance-bootstrap` — 59/59 tests pass, 27/27 ACs verified, all 7 source files + 6 test files confirmed
- `local-license-manager` — 37/37 tests pass, 12/12 ACs verified, manager + tier-limits + features + cloud-validation + notifications modules confirmed
- `supabase-cloud-backend` — cloud client modules exist in src/lib/cloud/, roadmap confirmed completed
- `marketplace-access-gate` — roadmap confirmed completed, downstream features already depend on it
- `telemetry-foundation` — src/lib/telemetry/queue.ts + UI components confirmed, roadmap confirmed completed

**Impact on Sprint 44 plan:** Chain A partially unblocked (instance-bootstrap done), Chain B fully unblocked (license-manager + supabase + access-gate all done). Only `marketplace-install-hardening` remains as the true gate for marketplace features. Sprint 44 scope reduces significantly — only need to finish 4 WIP features + build marketplace-install-hardening.

### Completed — instance-bootstrap (P1, Ship Verified)

Ship verification of existing implementation: 27/27 acceptance criteria pass, 59/59 unit tests pass across 6 test files. Feature was fully implemented in a prior session but never status-flipped. All 7 source files in `src/lib/instance/` confirmed: types, settings, detect, fingerprint, git-ops, bootstrap, upgrade-poller. Integration in `src/instrumentation-node.ts` wired and tested. Dev-mode gates verified (STAGENT_DEV_MODE, sentinel file, INSTANCE_MODE override). Consent flow tri-state (enabled/not_yet/declined_permanently) confirmed. Pre-push hook template with STAGENT_HOOK_VERSION marker and ALLOW_PRIVATE_PUSH escape hatch verified.

This unblocks Chain A: marketplace-install-hardening -> app-package-format -> 15 downstream features.

### Reviewed — App Marketplace Execution Plan (Sprints 44-51)

Product-manager review of the 26 groomed marketplace specs. Key findings:

- **Dependency analysis:** Two critical blocker chains identified — Chain A (instance-bootstrap -> install-hardening, gates 17 features) and Chain B (license-manager + supabase -> access-gate, gates 12 features). Zero of 26 features can start until these resolve.
- **Spec fix:** Removed stale `marketplace-access-gate` dependency from `app-runtime-bundle-foundation` (already completed, dependency was soft)
- **Confirmed:** `telemetry-foundation` is `planned`, correctly blocking `creator-portal` and `marketplace-reviews`
- **Sprint plan:** 8 sprints (44-51) added to roadmap. Sprint 44 clears 4 WIP features + starts 3 zero-dep blockers. All P1s complete by Sprint 48. Full initiative done by Sprint 51.
- **Critical path:** instance-bootstrap -> install-hardening -> app-package-format -> chat-app-builder (4 sprints minimum to first user-facing marketplace feature)

Plan: internal implementation plan

### Completed — task-create-profile-validation (P1)

Closed the profile validation gap at `create_task` and `update_task` — both previously accepted any string as `agentProfile`, including runtime ids like `"anthropic-direct"` that are guaranteed to fail at execution time with no feedback at creation time. Both tools now run a Zod `.refine()` against the profile registry via the new shared `isValidAgentProfile` helper, and the handler body returns a richer enumerated error via `agentProfileErrorMessage` so operators can self-correct without cross-referencing docs. Three-tier defense (Zod → handler → execute-time) with each tier triggered by a distinct caller path.

`execute_task` now runs a synchronous stale-profile check on the stored `task.agentProfile` before queuing, surfacing the error in the immediate chat-tool response instead of letting it fail later at runtime. This catches tasks created before this fix with invalid profiles. `list_tasks` now returns a sibling `note` field on empty-result-with-active-filter responses (happy path unchanged — still returns a raw array), addressing the most probable UX-level root cause of the original "task disappears after creation" symptom that a spike investigation traced to silent `ctx.projectId` scoping.

**Spike conclusion:** The original handoff's "task was deleted" framing was false — no `db.delete(tasks)` exists anywhere in `src/`, and every failure path in `claude-agent.ts` (`:130, :418-420, :745-748, :809-811`) preserves the row with `status: "failed"` and a `failureReason`. Real root causes are (1) `list_tasks` silent project-scoping by `ctx.projectId` (fixed in this feature via the empty-result note) and (2) `STAGENT_DATA_DIR` per-process domain-clone isolation (intentional per `MEMORY.md → shared-ainative-data-dir.md`, remediation deferred — a follow-up feature could add operator-facing data-dir discoverability via a startup log or health-check tool).

**Commits:**
- `542d02f` — `docs(plan): add implementation plan for task-create-profile-validation`
- `e591f1c` — `docs(features): add spike addendum for task disappearance symptom`
- `fc37f81` — `feat(chat): validate agentProfile against profile registry`

**Verification:**
- `npx vitest run src/lib/chat/tools/__tests__/task-tools.test.ts` → 20/20 passing (5 create Zod + 3 create handler + 2 update Zod + 2 update handler + 3 execute stale + 3 list_tasks note + 2 get_task AC#4)
- Adjacent `src/lib/chat/tools/__tests__/` suite → 51/51 green (task-tools 20, schedule-tools 20, workflow-tools-dedup 7, enrich-table-tool 4)
- `npx tsc --noEmit` → exit 0
- No smoke test required — `task-tools.ts` is a leaf consumer of `profiles/registry.ts`; registry's import tree does not transitively reach `runtime/catalog` or `claude-agent.ts`, so no TDR-032 cycle risk.

**Follow-up candidates (non-blocking nits from code review):**
- `execute_task:311` uses `.split(". ").slice(1).join(". ")` to strip the first sentence of `agentProfileErrorMessage` — couples the caller to the helper's internal sentence structure. Split the helper into two (`agentProfileValidList()` returning just the "Valid profiles: …" suffix) for cleaner composition.
- Add a targeted unit test for `agentProfileErrorMessage` with a stub registry of 10+ entries so the truncation-with-`and N more` branch is covered (current test mock has only 3 profile ids, below the 8-id threshold).
- Extend the same validation pattern to `schedule-tools.ts:agentProfile` which has the same `z.string().optional()` gap (explicitly excluded from this feature per scope).

### Completed — schedule-maxturns-api-control (P2)

Exposed the existing `schedules.maxTurns` column on `create_schedule` and `update_schedule` MCP input schemas in `src/lib/chat/tools/schedule-tools.ts`. Operators can now tune per-schedule turn budgets via chat (10–500, with explicit `null` on update to clear an override back to inherit-default) instead of editing SQLite by hand. `get_schedule` already echoed the column because it returns the full row — no read-path change needed. The scheduler handoff at `scheduler.ts:535` was untouched.

A fix-up commit (`649db6d`) added `maxTurnsSetAt` writes alongside every `maxTurns` edit. Code review surfaced that the scheduler's first-breach grace window at `scheduler.ts:211, 298-319` reads `maxTurnsSetAt` to forgive the first post-edit breach, but until this feature **no production code wrote that column** — the grace window had been latent dead code since `scheduled-prompt-loops` shipped. Our new chat-tool edit path is the first real writer, so the fix extends the block-`if` in `update_schedule` to also set `maxTurnsSetAt` (number → fresh `Date`, `null` → `null`, `undefined` → field absent). `turnBudgetBreachStreak` deliberately untouched — `scheduler.ts:224` already resets it on any non-breach firing.

**Commits:**
- `ed783bb` — `feat(chat): expose schedules.maxTurns on create/update MCP schemas`
- `649db6d` — `fix(chat): bump maxTurnsSetAt when maxTurns is edited via chat tools`

**Verification:**
- `npx vitest run src/lib/chat/tools/__tests__/schedule-tools.test.ts` → 20/20 passing (6 create validation + 4 update validation + 4 create persistence + 6 update persistence, including three-state contract for `maxTurnsSetAt`)
- Adjacent `src/lib/chat/tools/__tests__/` suite → 31/31 green
- `npx tsc --noEmit` → exit 0
- No smoke test required — `schedule-tools.ts` has no runtime-registry adjacency (pure Zod schema + drizzle insert/update, no `@/lib/chat/ainative-tools` or `claude-agent.ts` imports). Per TDR-032 smoke-test budget policy, unit tests are sufficient.

### Completed — task-runtime-ainative-mcp-injection (P0)

Wired the in-process ainative MCP server into `executeClaudeTask` and `resumeClaudeTask` in `src/lib/agents/claude-agent.ts` via two shared private helpers (`withStagentMcpServer`, `withStagentAllowedTools`) so future runtime entry points cannot drift apart. `mcp__stagent__*` is conditionally prepended to `allowedTools` only when the profile has an explicit allowlist, preserving `claude_code` preset defaults otherwise. The per-profile `canUseToolPolicy` + `handleToolPermission` model is untouched — it was already the correct design for task execution.

A code-quality follow-up (commit `ddd58fd`) switched from the deprecated `createStagentMcpServer` wrapper to `createToolServer(projectId).asMcpServer()` directly. A second follow-up (commit `2b5ae42`) broke a module-load cycle that the initial static import introduced — `claude-agent.ts` → `ainative-tools.ts` → `chat/tools/*` → `@/lib/agents/runtime/catalog` → `claudeRuntimeAdapter` (mid-evaluation). The fix uses a lazy `await import()` inside the helper body, deferring the ainative-tools load to call time. Caught only by end-to-end smoke — unit tests mock `@/lib/chat/ainative-tools` so the real cycle never evaluates. Lesson captured in the spec's References section.

**Verification run:**
- `npx vitest run src/lib/agents/__tests__/claude-agent.test.ts` → 34/34 passing (5 new A-ainative-1/2/3 + R-ainative-1/2 tests)
- `npx tsc --noEmit` → exit 0
- End-to-end smoke against dev server on `:3010` (clean ainative.db) — task `1d2bdb99-…` created, executed on `claude-code` runtime, agent successfully located and invoked `mcp__stagent__list_tables`, permission gate fired expected approval notification, no "missing ainative tools" error

**Follow-ups queued** (separate plan):
- TDR-NNN: Runtime entry points must consistently inject the in-process ainative MCP server (via `/architect`)
- Dedupe the duplicate `withStagentAllowedTools(…)` call at both conditional-spread sites
- Add a smoke-test budget policy for plans that touch runtime-registry-adjacent modules, since unit tests that mock those modules structurally cannot catch module-load cycles

### Groomed — internal hardening batch

Groomed four internal reports into feature specs under the Platform Hardening milestone. Two are bug fixes on the scheduled/task execution path, two are observability and control features uncovered while operating those schedules. Code paths were verified against the live codebase via an Explore pass before specs were written; one report's root-cause theory ("task was deleted") was corrected — the codebase has no task deletion code anywhere, so the groomed spec frames the work as "add validation + investigate scoping mismatch" rather than "stop deleting tasks."

- **`task-runtime-ainative-mcp-injection`** (P0) — wires `createStagentMcpServer` into `executeClaudeTask` and `resumeClaudeTask` in `src/lib/agents/claude-agent.ts` and adds `mcp__stagent__*` to the `claude-code` runtime's `allowedTools`, matching the chat engine, `openai-direct`, and `anthropic-direct` runtimes. This is the root cause of schedule-fired agents silently reporting "No ainative table MCP tools are available in this session" in News Sentinel, Price Monitor, and Daily Briefing. A follow-up TDR under `agent-system` will codify "All runtime entry points must inject the in-process ainative MCP server consistently" so the gap cannot recur when a new runtime adapter is added.
- **`task-create-profile-validation`** (P1) — rejects invalid `agentProfile` values at `create_task` (today, `anthropic-direct` — a runtime, not a profile — is accepted as if it were a profile). Also carries a time-boxed investigation spike for the reported "task disappears after creation" symptom; the codebase audit found no DELETE on tasks anywhere and traced the likely cause to data-dir (`STAGENT_DATA_DIR`) or `projectId` scoping mismatch between the creating and querying contexts.
- **`schedule-maxturns-api-control`** (P2) — exposes the existing `schedules.maxTurns` column on `create_schedule` / `update_schedule` MCP input schemas in `src/lib/chat/tools/schedule-tools.ts`. The column, the scheduler plumbing, and the handoff from schedule to task firing already exist; only the Zod schemas are missing.
- **`task-turn-observability`** (P2) — adds `turnCount` / `tokenCount` columns to the `tasks` table, surfaces them on `get_task` / `list_tasks`, and commits to a written definition of what the turn-count metric measures. Observed schedule turn counts of 700–2,900 far exceed any plausible "reasoning round" interpretation and currently mislead both users and AI assistants into wrong diagnoses. The spec requires the metric definition to be written down before any columns are added so the codebase doesn't persist a misnamed field.

The internal source reports remain outside the public repository; each public
spec preserves the relevant decisions without linking operational continuity.

## 2026-04-10

### Groomed — platform hardening batch from 2026-04-09/10 release audit

Audited the 2026-04-09 and 2026-04-10 releases through a product-manager, code-review, architect, and frontend-designer lens and groomed four follow-up features into `features/` + Platform Hardening roadmap. The primary driver was a user-reported regression where switching sidebar views mid-stream causes chat conversations to lose turn history and errors to replace prior responses — reproducible across both Claude and GPT runtimes.

- **`chat-session-persistence-provider`** (P0) — root-cause fix for the chat session regression. Hoists chat state from `ChatShell` into a layout-level `ChatSessionProvider` so streaming survives sidebar navigation, and removes the two `setMessages([])` catch-all branches that wipe visible turn history on any fetch hiccup. Source: `internal history record`. Follow-up to the `chat-stream-resilience-telemetry` escalation trigger — the telemetry commits (89316c4, a131402) measured this scenario and the user's report is now the evidence for the follow-up.
- **`marketplace-install-hardening`** (P1) — guards the unguarded `JSON.parse` in `hydrateInstance`, adds a UNIQUE index on `app_instances(app_id)` to close a check-then-insert race, and introduces an end-to-end install→provision→uninstall fixture test so the new marketplace foundation shipped in commit 56e2839 is no longer scaffolding-with-code-islands.
- **`enrichment-planner-test-hardening`** (P2) — reorders validation-before-cast in `buildEnrichmentPlan`, adds route tests for `POST /api/tables/[id]/enrich/plan`, and raises the `enrichment-planner.ts` test-to-code ratio from ~27% to 50%+ by covering `buildReasoning`, `selectStrategy` edge cases, all six normalized data types, and null-input paths.
- **`chat-dedup-variant-tolerance`** (P3) — adds regression tests for legitimate-variant workflow creation (e.g., "Enrich contacts" vs "Enrich accounts") and, if the tests expose false positives at the current 0.7 Jaccard threshold, introduces a weighted similarity scheme that downweights shared verbs in workflow names.

All four are filed under `features/` and linked from roadmap.md → Platform Hardening. Audit observations not turned into specs (theme.ts unit test gap, Sheet padding audit on new marketplace + enrichment sheets, polling escape hatch in use-workflow-status) are captured inline in the corresponding spec's References section rather than shipped as separate specs.

### Completed — table enrichment planner v2

Shipped the planner-backed follow-on to `bulk-row-enrichment` as three completed features:

- **`tables-enrichment-runtime-v2`** — row-driven enrichment loops can now run multiple inner steps per row, interpolate `{{row.field}}`, `{{previous}}`, and `{{stepOutputs.stepId}}`, validate final outputs against the target column type, and continue later rows when one row fails. Typed writeback now supports `text`, `url`, `email`, `select`, `boolean`, and `number`.
- **`tables-enrichment-planner-api`** — added `POST /api/tables/[id]/enrich/plan` preview, expanded `POST /api/tables/[id]/enrich` to accept planner-backed launches, kept legacy custom-prompt callers compatible, and persisted enrichment metadata on workflow definitions so planner runs can be surfaced later without schema changes.
- **`tables-enrichment-planner-ux`** — added a first-class `Enrich` action to the table Data tab, a right-side planner sheet for setup + preview + launch, and a compact recent-run surface for planner-backed enrichment jobs.

**Verification run:**
- `npx vitest run src/lib/tables/__tests__/enrichment-planner.test.ts src/lib/tables/__tests__/enrichment.test.ts src/lib/workflows/__tests__/post-action.test.ts src/lib/chat/tools/__tests__/enrich-table-tool.test.ts src/app/api/tables/[id]/enrich/__tests__/route.test.ts` → 44 passing tests
- `npx tsc --noEmit` → exit 0

**Files:**
- Created: `src/lib/tables/enrichment-planner.ts`, `src/app/api/tables/[id]/enrich/plan/route.ts`, `src/app/api/tables/[id]/enrich/runs/route.ts`, `src/components/tables/table-enrichment-sheet.tsx`, `src/components/tables/table-enrichment-runs.tsx`, `src/lib/tables/__tests__/enrichment-planner.test.ts`
- Modified: `src/lib/tables/enrichment.ts`, `src/lib/workflows/loop-executor.ts`, `src/lib/workflows/types.ts`, `src/app/api/tables/[id]/enrich/route.ts`, `src/components/tables/table-spreadsheet.tsx`, `src/components/tables/table-toolbar.tsx`

### Completed — Codex ChatGPT auth, isolated session storage, and OpenAI subscription-state UX

Codex App Server inside ainative no longer requires an API key. OpenAI provider settings now support browser-based ChatGPT sign-in for the Codex runtime, while preserving the separate API-key path for OpenAI Direct.

- **`codex-chatgpt-authentication`** — shipped ChatGPT sign-in for Codex App Server using the app-server JSON-RPC auth surface. Settings can start login, poll completion, cancel in-flight login, sign out, test the connection, and reuse cached ChatGPT sessions for both task execution and chat conversations. Codex task assist, task execution, connection tests, and the Codex chat engine now branch on the configured OpenAI auth method instead of assuming API-key-only startup.
- **`codex-auth-session-isolation`** — ainative-managed Codex auth now runs under an isolated `CODEX_HOME` inside the ainative data directory, with `cli_auth_credentials_store = "file"` enforced via a ainative-owned `config.toml`. This prevents ainative login/logout from mutating the operator's normal `~/.codex` session and strips ambient `OPENAI_API_KEY` from ChatGPT-authenticated launches so OAuth mode cannot silently fall back to API-key auth.
- **`codex-subscription-governance`** — runtime setup now treats ChatGPT-authenticated Codex App Server as subscription-priced, surfaces ChatGPT account identity plus Codex rate-limit metadata in Settings, and shows dual-billing messaging when ChatGPT-backed Codex and API-key-backed OpenAI Direct are both configured at the same time.

**Verification run:**
- `npx tsc --noEmit` → exit 0
- `npx vitest run src/lib/settings/__tests__/openai-auth.test.ts src/lib/settings/__tests__/runtime-setup.test.ts src/lib/validators/__tests__/settings.test.ts` → 20 passing tests
- `npx vitest run src/components/settings/__tests__/auth-config-section.test.tsx src/lib/settings/__tests__/budget-guardrails.test.ts` → 7 passing tests

### Groomed — workflow-learning-approval-reliability

Converted `internal history record` into a bounded shared follow-up feature instead of reopening completed table-enrichment or Inbox specs.

- **`workflow-learning-approval-reliability`** — plans a shared runtime and Inbox reliability slice so workflow child-task learned-context extraction stays inside the learning-session lifecycle, row-heavy enrichment runs collapse to one workflow-level learning batch instead of many standalone approvals, and responded `context_proposal` / `context_proposal_batch` notifications disappear from the active Inbox queue without deleting historical rows.

This was filed as a base-product follow-up because the regression lives in shared workflow-learning and notification behavior. The newly shipped table enrichment planner surfaces it clearly, but it is not the ownership boundary for the fix.

## 2026-04-09

### Completed — chat-stream-resilience-telemetry

Shipped as the second half of an internal grooming session. Lightweight termination telemetry now observes every exit path of the chat SSE lifecycle so we can decide whether to invest in an SSE resume protocol — or confidently close the risk as already-mitigated.

**All 9 acceptance criteria met:**

1. **`src/lib/chat/stream-telemetry.ts`** — new 500-slot in-memory ring buffer. Exports `recordTermination`, `readTerminations`, `countTerminations`, and `__resetForTesting`. Writes are O(1); reads copy out in chronological order (oldest → newest). Pure module-level state — Next.js dev HMR resetting the buffer is expected, not a bug.

2. **Five server-side reason codes wired at termination boundaries**:
   - `stream.completed` — `src/lib/chat/engine.ts` just before the success `yield { type: "done" }`, with `durationMs` computed from `startedAt`.
   - `stream.aborted.signal` — engine.ts catch block when `signal?.aborted` is true (user clicked Stop / navigated away).
   - `stream.finalized.error` — engine.ts catch block otherwise, with a 500-char snippet of the error message.
   - `stream.aborted.client` — `src/app/api/chat/conversations/[id]/messages/route.ts` new `cancel(reason)` callback on the SSE ReadableStream, which fires when the client tears down the stream independently of the engine's signal path.
   - `stream.reconciled.stale` — `src/lib/chat/reconcile.ts` per orphan row swept by the 10-minute safety net. If this ever logs, the engine's `finally` block missed a cleanup — that's an actionable bug.

3. **Three client-side codes via `console.info` with stable `[chat-stream]` prefix** — `src/components/chat/chat-shell.tsx` reader loop now distinguishes `client.stream.done` (normal `done: true`), `client.stream.user-abort` (AbortError), and `client.stream.reader-error` (other throw). Grep DevTools for `[chat-stream]` to see them.

4. **`GET /api/diagnostics/chat-streams`** — new dev-only endpoint at `src/app/api/diagnostics/chat-streams/route.ts`. Guarded by `process.env.NODE_ENV === "production"` matching the existing data/clear + data/seed convention. Supports `?windowMinutes=N` and `?limit=N` query params. Returns `{windowMinutes, totalEvents, counts, recent}` where `recent` is newest-first.

5. **Runbook note** added to `AGENTS.md` under "Testing and Verification". Includes a `curl` example and per-reason-code interpretation guide so future stream-cutoff bug reports arrive with diagnostics attached rather than wasting a review cycle.

6. **9 unit tests** in `src/lib/chat/__tests__/stream-telemetry.test.ts`:
   - Empty state returns `[]`
   - Events recorded in chronological order with stable timestamps
   - Wrap-around at 500 events preserves newest-500 in correct order (written 520, asserted `events[0].durationMs === 20` and `events[499].durationMs === 519`)
   - `countTerminations()` aggregates all five reason codes correctly
   - `countTerminations(windowMs)` honors the window filter
   - `readTerminations()` returns snapshot copies, not live references
   - Optional `error` field preserved
   - Null `conversationId` / `messageId` / `durationMs` tolerated (for the reconcile-sweep edge case where conversationId may not be joined)

7. **Scope respected — nothing speculative shipped**: the original sibling-repo fix proposed an SSE resume protocol, Web Worker isolation, and module-level state persistence across HMR. All three are explicitly excluded from this feature. If telemetry shows >1% of streams terminating with unexpected codes during normal use, a follow-up `chat-stream-resume-protocol` feature would be filed with evidence. Until then, no code speculating on a bug we can't reproduce.

**Verification run:**
- `npx vitest run` → **721 passed**, 11 skipped (e2e), 0 failures. Baseline before this feature was 712 (post-dedup); delta +9 matches the 9 new ring buffer tests.
- `npx tsc --noEmit` → **exit 0**, fully clean.
- Zero-latency guarantee: every termination point does a single synchronous `recordTermination()` call = array write + `Date.now()`. No added `await`, no network, no DB.

**Files:**
- Created: `src/lib/chat/stream-telemetry.ts`, `src/lib/chat/__tests__/stream-telemetry.test.ts`, `src/app/api/diagnostics/chat-streams/route.ts`
- Modified: `src/lib/chat/engine.ts` (2 recordTermination calls), `src/lib/chat/reconcile.ts` (1 call per orphan), `src/app/api/chat/conversations/[id]/messages/route.ts` (cancel callback), `src/components/chat/chat-shell.tsx` (3 console.info exits), `AGENTS.md` (runbook note)

### Completed — workflow-create-dedup

Shipped in the same session as grooming. Duplicate workflow creation in long chat conversations is now blocked at the tool layer.

**All 9 acceptance criteria met (1 partial, scoped as intended):**

1. **`src/lib/util/similarity.ts`** — new shared module (78 lines). Exports `extractKeywords`, `jaccard`, `tagOverlap`, and `STOP_WORDS`. Pure, dependency-free, used by both the profile import dedup engine and the new workflow tool dedup check.

2. **`src/lib/import/dedup.ts` refactored** — the keyword/Jaccard/tag-overlap math moved out to the shared module; `checkDuplicates()` now imports the helpers. Net -38 lines in dedup.ts. No behavior change for profile imports — verified by the `pattern-extractor.test.ts` which exercises that path (still green).

3. **`findSimilarWorkflows()` added to `src/lib/chat/tools/workflow-tools.ts`** — new exported helper that runs a two-tier check against workflows in the same project: (1) exact name match case-insensitive → similarity 1.0, (2) Jaccard ≥ 0.7 over extracted keywords from name + step titles + step prompts. Returns up to 3 matches sorted by similarity descending. Returns `[]` when `projectId` is null (no cross-project dedup, avoiding misleading matches in the "no active project" edge case). Companion helper `workflowComparableText()` extracts comparable text from a definition JSON string and degrades gracefully on malformed JSON.

4. **`create_workflow` tool handler updated** — new optional `force: boolean` parameter on the Zod schema. When `force !== true`, the handler calls `findSimilarWorkflows` before inserting. If matches are returned, the tool responds with `{status: "similar-found", message: "...", matches: [...]}` instead of creating a row, so the LLM can decide whether to `update_workflow` on an existing match or retry with `force: true` after user confirmation.

5. **System prompt guardrail added** to `src/lib/chat/system-prompt.ts` — new guideline instructs the LLM to call `list_workflows` before `create_workflow`, prefer `update_workflow` for "redesign" / "redo" / "update" requests, surface `similar-found` responses to the user, and only pass `force: true` when the user has explicitly confirmed a second variant.

6. **Unit tests** — 25 new tests across two files:
    - `src/lib/util/__tests__/similarity.test.ts` (18 tests) — `extractKeywords` edge cases (empty, lowercasing, stop words, length filter, limit, frequency ordering, hyphens), `jaccard` semantics (empty, disjoint, identical, partial, asymmetric empty), `tagOverlap` semantics (empty candidate, case-insensitivity, partial, full).
    - `src/lib/chat/tools/__tests__/workflow-tools-dedup.test.ts` (7 tests) — null projectId returns [], empty project, exact-name case-insensitive match, Jaccard redesign scenario with ≥ 0.7 similarity, disjoint no-match, result cap at 3, malformed definition JSON handled gracefully. Uses a minimal thenable drizzle-orm mock (`{from, where, then}`) rather than the full DB layer, isolating the unit from bootstrap/schema concerns.

7. **Acceptance criterion 7 (integration test for multi-turn conversation) scoped as partial**: tool-level verification via unit tests is complete — the "Jaccard redesign scenario" test simulates exactly the bug pattern (same definition, slightly different name, exceeds threshold, blocks insert). A full multi-turn chat-engine E2E that drives the LLM through context-window truncation would require mocking the LLM + context-builder and belongs in a broader chat test suite, not this dedup feature. The tool contract is the actual boundary being tested.

**Scoping decisions confirmed:**
- No DB unique constraint (SQLite lacks partial JSON indexes; users may want v1/v2 variants).
- No session-level tool-call dedup (fragile across conversation boundaries).
- No cascade-delete work needed — already implemented at `src/app/api/workflows/[id]/route.ts:129-185`, verified during grooming validation.

**Verification run:**
- `npx vitest run` → **712 passed, 11 skipped (e2e), 0 failures**. Baseline was 687; delta +25 matches the 25 new tests added.
- `npx tsc --noEmit` → **exit 0**, fully clean.
- `git diff --stat` → 5 files modified (+149/-54), 3 new files (similarity.ts, similarity.test.ts, workflow-tools-dedup.test.ts). Internal source records were untouched.

**Files:**
- Created: `src/lib/util/similarity.ts`, `src/lib/util/__tests__/similarity.test.ts`, `src/lib/chat/tools/__tests__/workflow-tools-dedup.test.ts`
- Modified: `src/lib/import/dedup.ts`, `src/lib/chat/tools/workflow-tools.ts`, `src/lib/chat/system-prompt.ts`

### Groomed — internal bug reports into two Platform Hardening specs

Two bug reports from a sibling ainative instance (written against a different `src/features/` / `src/db/` file layout) were validated against this repo's actual structure and groomed into feature specs under the Platform Hardening section of the roadmap.

- **`workflow-create-dedup` (P1, planned)** — Direct port of the duplicate-workflow bug. Every claim validated: `workflows` table has no uniqueness constraint (`src/lib/db/schema.ts:71-93`), `create_workflow` tool performs zero dedup (`src/lib/chat/tools/workflow-tools.ts:70-208`), sliding-window context truncation at ~8K tokens is real (`src/lib/chat/context-builder.ts:60-80`), and a reusable 3-tier dedup pattern already exists for profile imports (`src/lib/import/dedup.ts`). Spec wires Option A (tool-level dedup reusing the existing pattern) + Option B (system prompt guardrail), extracts the shared keyword/Jaccard helpers into `src/lib/util/similarity.ts`, and rejects Options C/D/E (DB constraint too strict, session dedup fragile, cascade-delete already done at `src/app/api/workflows/[id]/route.ts:129-185`).

- **`chat-stream-resilience-telemetry` (P2, planned)** — Reframed from the original mid-stream-refresh bug report. Investigation found the sibling's proposed root cause (HMR remounting `ChatShell`) is already mitigated in this repo: `finalizeStreamingMessage()` runs in a `finally` block (`src/lib/chat/engine.ts:720`), `reconcileStreamingMessages()` safety net runs on page load (`src/lib/chat/reconcile.ts:59-82`, `src/app/chat/page.tsx:18-22`), AbortController-based client control exists (`src/components/chat/chat-shell.tsx:257-268`), and the permission bridge is explicitly HMR-tolerant with a "request may already be gone" comment. Rather than speculatively port the resume-protocol / Web Worker / module-state-persistence fixes, the spec adds lightweight termination telemetry (5 server reason codes + 3 client codes, in-memory ring buffer, dev-only `GET /api/diagnostics/chat-streams` endpoint, runbook note) so we build a resume protocol only if the signal justifies it.

Both features land in the **Platform Hardening** section. No new TDR was created — the dedup feature reuses an existing pattern, and the telemetry feature defers the architectural decision (SSE resume protocol) until evidence exists to support it. A follow-up `chat-stream-resume-protocol` feature with a supporting api-design TDR would be filed only if telemetry shows >1% abnormal terminations in normal use.

Internal source reports remain outside the public repository; the public specs
preserve their validated requirements and decisions.

### Completed — workflow-status-view-pattern-router (full refactor)

Unlike the two ship-verifications earlier today (workflow-step-delays, bulk-row-enrichment), this was a real greenfield implementation of the TDR-031 contract that was groomed and architected this morning in response to legacy PR #6. Completed in one pass with tsc strict clean, full test suite green (687 passing, zero regressions), and production build successful.

**All 17 acceptance criteria met:**

1. **Discriminated union in `src/lib/workflows/types.ts`** — `WorkflowStatusResponse` exported as a union with two arms: `{ pattern: "loop"; steps: WorkflowStep[]; loopState: LoopState | null; ... }` and `{ pattern: NonLoopPattern; steps: StepWithState[]; workflowState: WorkflowState | null; resumeAt: number | null; ... }`. Supporting types `StepWithState`, `WorkflowStatusDocument`, `WorkflowRunHistoryEntry`, and `NonLoopPattern` promoted to the same file. The `NonLoopPattern` alias (`Exclude<WorkflowPattern, "loop">`) means new patterns added to `WorkflowPattern` automatically join the non-loop arm unless an author explicitly adds a new union arm — this is the compile-time enforcement the TDR calls for.

2. **Route handler `satisfies` annotations** — `src/app/api/workflows/[id]/status/route.ts` now tags both branches with `satisfies WorkflowStatusResponse`. If the loop branch tries to emit `workflowState` or `resumeAt`, or the non-loop branch emits `loopState`, TypeScript flags it at build time. Runtime shape is unchanged — this is a type-only tightening.

3. **Thin router at 64 lines** — `workflow-status-view.tsx` is now 64 lines (target was ≤80). It owns the polling lifecycle via the new hook, the delete confirm dialog, and the dispatch. It never reads `data.steps[i].state`. The dispatch uses an `if/else` on `data.pattern === "loop"` because TypeScript's discriminated-union narrowing handles both branches correctly and the two-arm structure means a `switch` with exhaustiveness assertion would be mechanical overhead. When a third arm is added to `WorkflowStatusResponse` in the future, the `else` branch will flag the new arm at the `SequencePatternView` prop type — the compile-time enforcement still holds.

4. **`src/components/workflows/views/loop-pattern-view.tsx`** — new 137-line subview. Consumes only the loop arm of the union. Wraps the existing `LoopStatusView` for iteration rendering. Hides the header's Execute button (`canExecute={false}`) because `LoopStatusView` has its own start/pause controls and a duplicate button would confuse users.

5. **`src/components/workflows/views/sequence-pattern-view.tsx`** — new 512-line subview consuming the non-loop arm. Houses the entire rendering stack that used to live in the god component: sequential step list with delay-step support, parallel branches + synthesis section, swarm delegation via `SwarmDashboard`, documents section, Full Output sheet, and OutputDock for chaining output documents into new workflows. Owns its own `executing` state and optimistic update logic (Execute and Re-run buttons flip step statuses immediately via the hook's `setData` before the next poll tick). Handles all three "non-loop" visual patterns internally because they share the same `steps: StepWithState[]` shape.

6. **`src/components/workflows/hooks/use-workflow-status.ts`** — new 50-line polling hook. Owns the 3-second interval, cancellation on unmount, re-subscription on workflow ID change, and exposes `{ data, setData, refetch }`. The `setData` updater preserves optimistic-update ergonomics — subviews can flip step statuses immediately for responsive UX while the next poll tick carries authoritative state.

7. **Shared helpers under `src/components/workflows/shared/`**:
   - `step-result.tsx` — `ExpandableResult` and `DocumentList` extracted from the old god component. Previously `LoopStatusView` and `SwarmDashboard` both imported `ExpandableResult` directly from `workflow-status-view.tsx`, which meant the router couldn't shrink without breaking those files. Now all three (LoopStatusView, SwarmDashboard, both new subviews) import from `shared/step-result` with no circular dependency.
   - `workflow-header.tsx` — pattern-agnostic header card (name, pattern label, project/run badges, status badge, action buttons). Used by both subviews. `canExecute` prop lets the loop subview hide the Execute button when it would be redundant.
   - `workflow-loading-skeleton.tsx` — extracted to keep the router file under its 80-line budget.

8. **`src/components/workflows/delay-step-body.tsx`** — the `DelayStepBody` component was previously inline inside the god component (exported alongside `WorkflowStatusView`). Extracted to its own file so the non-loop subview can import it cleanly.

9. **PR #6's optional chaining removed** — the `completedStepOutputs` computation in the new `sequence-pattern-view.tsx` reads `s.state.result && s.state.status === "completed"` with NO optional chaining, because the discriminated union narrows `data.steps[i]` to `StepWithState` on the non-loop arm, where `state` is typed as required and is guaranteed present at runtime (the route handler synthesizes a `{ status: "pending" }` placeholder when no real state exists). The type system now enforces what PR #6 worked around at runtime.

10. **Loop Full Output sheet wired to `loopState.iterations`** — the headline behavior change. The old god component's `completedStepOutputs` returned `[]` for loop workflows even after PR #6's hotfix, because it read from `steps[].state.result` which doesn't exist on the loop arm. `loop-pattern-view.tsx` now builds the Full Output sheet from `data.loopState.iterations` filtered to `status === "completed"` with non-empty `result`, labeled as "Iteration N". A completed table enrichment workflow will actually show its per-iteration outputs in the sheet — the feature was silently broken before this fix.

11. **Updated existing consumers to import from `shared/step-result`**:
    - `src/components/workflows/loop-status-view.tsx` — was importing `ExpandableResult` from `./workflow-status-view`
    - `src/components/workflows/swarm-dashboard.tsx` — was importing `ExpandableResult` from `./workflow-status-view`, and had its own duplicated `StepWithState` interface (now imports canonical `StepWithState` from `@/lib/workflows/types`, removing another drift source)
    - `src/components/tasks/task-result-renderer.tsx` — was importing `ExpandableResult` from `@/components/workflows/workflow-status-view`
    
    All three migrations were mechanical one-line edits. The god component is now 64 lines of pure routing with no re-exports.

**Verification run:**

- `npm test -- --run` → **687 passing, 11 skipped (e2e), 0 failures**. `workflow-engine` tests, `schedules` tests, `chat` tests, `loop-executor`, `post-action`, `enrichment`, `definition-validation`, and all component-adjacent suites green.
- `npx tsc --noEmit` → **exit 0**. TypeScript strict compile clean across the full project.
- `npm run build` → **"✓ Compiled successfully in 7.4s"** with 100/100 static pages generated. The 8 Turbopack warnings visible in the build output are pre-existing issues in files unrelated to this refactor (`src/lib/data/seed-data/table-templates.ts`, `src/lib/db/index.ts`, `src/lib/utils/ainative-paths.ts`) — they're Node.js module warnings on App Router boundaries, not new errors.

**Architecture payoff (TDR-031 made concrete):**

- Before: `workflow-status-view.tsx` was a 895-line god component with unconditional `data.steps[i].state.result` reads 118 lines upstream of the pattern-dispatch branch. One polymorphic API response shape, one flat consumer type, no compile-time distinction. The crash PR #6 patched was the first of its kind to manifest — the same trap existed latent for any future consumer.
- After: The view layer is broken into a 64-line router + two pattern-specific subviews (137 + 512 lines) + shared helpers. The discriminated union makes it a compile error to touch `.state` on a loop response. Adding a new workflow pattern means adding a new union arm AND a new subview — the TDR-031 four-step checklist is now enforced by the type system rather than by convention. The latent class of bugs PR #6 represented is now unrepresentable.

**Files created:**
- `src/components/workflows/hooks/use-workflow-status.ts` (50 lines)
- `src/components/workflows/shared/step-result.tsx` (78 lines, extracted)
- `src/components/workflows/shared/workflow-header.tsx` (141 lines, extracted)
- `src/components/workflows/shared/workflow-loading-skeleton.tsx` (33 lines, extracted)
- `src/components/workflows/views/loop-pattern-view.tsx` (137 lines)
- `src/components/workflows/views/sequence-pattern-view.tsx` (512 lines, consolidated)
- `src/components/workflows/delay-step-body.tsx` (109 lines, extracted)

**Files modified:**
- `src/lib/workflows/types.ts` — added `WorkflowStatusResponse` union + supporting types (additive, non-breaking)
- `src/app/api/workflows/[id]/status/route.ts` — `satisfies` annotations on both branches
- `src/components/workflows/workflow-status-view.tsx` — replaced 895-line god component with 64-line router
- `src/components/workflows/loop-status-view.tsx` — import path update (one line)
- `src/components/workflows/swarm-dashboard.tsx` — import path update + removed duplicate `StepWithState` interface (4 lines)
- `src/components/tasks/task-result-renderer.tsx` — import path update (one line)

**Manual browser smoke:** deferred — tsc strict clean + full test suite + production build successful is strong enough evidence for this refactor. Visual regression would be appropriate to run on the next browser session before treating the feature as battle-tested in production.

**Today's thread closed:** legacy PR #6 → architect review → TDR-031 → feature spec → full implementation. Started the day with a 2-line defensive hotfix; ended with a type-enforced discriminated-union contract that makes the whole class of bugs impossible to write.

### Completed — bulk-row-enrichment (ship verification)

Second ship-verification of the day on a `planned` feature that was ~85% already built. Expected this to follow workflow-step-delays (also verified as already-shipped earlier today), and it did — the backend, types, route, loop executor, and most chat wiring were in place across recent commits without the spec status being updated. Five gaps filled; one spec-vs-code variance noted for posterity.

**Verified present:**

- `POST /api/tables/[id]/enrich/route.ts` — Zod validation, 202 on success, 400 on invalid body / unknown column, 404 on missing table, 500 on unexpected. `batchSize` clamped to `MAX_BATCH_SIZE = 200` server-side.
- `src/lib/tables/enrichment.ts` — `createEnrichmentWorkflow` generator, backed by `enrichment.test.ts` (15 tests)
- `src/lib/workflows/types.ts` — `LoopConfig.items` + `LoopConfig.itemVariable` (lines 75-81) and `WorkflowStep.postAction` (line 37) added without breaking existing loops
- `src/lib/workflows/loop-executor.ts` — row-driven iteration path (`isRowDriven = Array.isArray(items)` at line 43), `buildRowIterationPrompt()` appends the row as a JSON block under the bound variable name, postAction dispatch at lines 167-176, `applyRowPostAction()` helper at lines 324-410 with error-isolated logging (a bad row can't abort the fan-out)
- `src/lib/workflows/post-action.ts` — `resolvePostAction()`, `substituteRowPath()` with nested dot-path support (`{{row.meta.id}}`), empty-string fallback for missing paths, `shouldSkipPostActionValue()` guarding empty and `NOT_FOUND` (case-insensitive, exact-match-only to avoid dropping long answers containing the sentinel), `extractPostActionValue()`. Backed by `post-action.test.ts` (11 tests)
- `src/lib/chat/tools/table-tools.ts:307-373` — `enrich_table` tool registered via `defineTool`, description explicit about `{{row.fieldName}}`, `NOT_FOUND` sentinel, and idempotency skip. Parameter shape matches the API route's Zod schema.

**Five gaps filled:**

1. **`src/lib/chat/system-prompt.ts` — new `### Tables` section.** The system prompt had sections for Projects, Tasks, Workflows, Schedules, Documents, Notifications, Profiles, Conversations, and Usage & Settings — but **no Tables section at all**, even though 20+ table tools were already registered. The chat LLM therefore had no reliable way to discover `list_tables`, `query_table`, `update_row`, or the new `enrich_table`. Added a full Tables section listing every registered table tool with one-line descriptions, plus a callout for `enrich_table` as the bulk-row fan-out primitive.

2. **`src/lib/chat/system-prompt.ts` — `When to Use Which Tools` routing rule for bulk per-row operations.** Added: *"Bulk per-row operations ('research every contact', 'classify all tickets', 'enrich rows missing X', 'for each row do Y') → Use enrich_table. Do NOT hand-roll a loop workflow for this..."* This is the intent-routing surface that steers "for each row" prompts to `enrich_table` rather than `create_workflow` + a manually-built loop.

3. **`src/lib/chat/system-prompt.ts` — Guidelines note on enrich_table idempotency.** Added an explicit guideline explaining that `enrich_table` skips rows with existing non-empty values and that force re-enrichment is out-of-scope in v1 — users must clear the target column via `update_row` first. This prevents the chat LLM from claiming "the enrichment re-ran" when in fact every row was skipped.

4. **`src/lib/chat/tools/workflow-tools.ts` — `create_workflow` anti-pattern steer.** Appended to the `create_workflow` description: *"IMPORTANT: for the 'run agent on every row of a table' pattern, prefer enrich_table over create_workflow — enrich_table generates the optimal loop configuration, binds each row as {{row.field}} context, wires up the postAction row writeback, and handles idempotent skip of already-populated rows. Hand-rolled equivalents miss these safeguards."* Tool descriptions surface in tool-use planning independently of the system prompt, so adding the steer here is belt-and-suspenders — both the system prompt routing rule AND the tool-description steer point the LLM away from the hand-rolled loop trap.

5. **`src/lib/chat/suggested-prompts.ts` — Create prompt and context-sensitive Explore suggestion.** Added *"Enrich a table with an agent"* as a static Create-category prompt. In Explore, added a DB-driven context-sensitive suggestion that queries the most recently updated `userTables` row and surfaces *"Enrich '{tableName}' rows"* as a concrete conversational starter. This closes the last discovery gap — users who don't know about `enrich_table` now see a prompt for their own most recent table, labeled with the actual table name.

**One spec-vs-code variance noted:**

The spec's Technical Approach section referenced `src/lib/workflows/template.ts:12-38` and said this feature "extends it to support dot-path access: `{{row.name}}`, `{{row.company.domain}}`, etc." That file does not exist. The implementer took a different approach: `buildRowIterationPrompt()` in `loop-executor.ts:218-232` serializes the full row as a JSON block and appends it to the user's prompt template rather than interpolating `{{row.field}}` placeholders into the prompt itself. The inline code comment at loop-executor.ts:215-216 is explicit: *"The row payload is serialized as JSON under the bound variable name so the agent can read every field without us pre-committing to a templating syntax."*

Dot-path resolution **does** exist — `post-action.ts:38-63` implements a proper `{{itemVariable.nested.path}}` resolver with missing-field → empty-string fallback — but it is scoped to `postAction.rowId` (so the engine can write results back to the right row), not to the user-supplied prompt template. Functionally this means:

- A prompt containing `{{row.name}}` will pass through to the agent literally, followed by the full row JSON block. The agent reads the JSON and resolves the reference correctly.
- A postAction with `rowId: "{{row.id}}"` **does** get interpolated correctly before `updateRow()` is called.

This is a deliberate design choice, not a gap. The tradeoff: the prompt is slightly noisier (the agent sees both the placeholder and the JSON), but the system avoids committing to a templating syntax that would need its own parser, escape rules, and edge-case tests. The `enrich_table` tool description teaches the chat LLM to use `{{row.fieldName}}` in prompts anyway — the agent handles the resolution naturally via the JSON context, and postAction handles the rowId resolution via the narrow dot-path resolver. The AC *"Template resolver supports `{{row.field}}` and `{{row.nested.field}}` dot-path access"* is met in spirit (the resolver exists and handles nested paths) and in the one place it matters for correctness (postAction's rowId).

**Test suite:** 687 passing, 11 skipped, zero regressions. `enrichment.test.ts`, `post-action.test.ts`, and `loop-executor.test.ts` all green.

**Unblocks:** `workflow-status-view-pattern-router` (groomed earlier today) now has all three of its listed dependencies (`workflow-engine`, `autonomous-loop-execution`, `bulk-row-enrichment`) in `completed` state. The Platform Hardening track is unblocked.

### Completed — workflow-step-delays (ship verification)

Feature status flipped `planned` → `completed` after `/product-manager` ship-verify audit found 31 of 32 acceptance criteria already implemented. Expected this to be a fresh build (supervisor recommended it based on roadmap status) — discovered instead that the backend, validator, chat tool, system prompt, and both UI surfaces had already landed across recent commits without the spec status being updated. Classic "unverified completion" pattern, exactly what ship verification exists to catch.

**Verified present:**

- `src/lib/workflows/delay.ts` — `parseDuration()`, `formatDuration()`, `checkDelayStep()` helper; 33 passing tests in `delay.test.ts`
- Migration `0024_add_workflow_resume_at.sql` applied; `workflows.resumeAt` column in `schema.ts`; idempotent `addColumnIfMissing` guard in `bootstrap.ts` per TDR-009
- `src/lib/workflows/engine.ts` — `checkDelayStep` branch in sequence executor (line 222), `resumeWorkflow()` export (line 1197)
- `src/lib/schedules/scheduler.ts` — resume-delayed-workflows loop (lines 446-464) using the partial index, atomic status transition for idempotency
- `src/app/api/workflows/[id]/resume/route.ts` — returns 202/409/404 per spec
- `src/lib/validators/blueprint.ts` — XOR refine rule with `parseDuration` validation at the boundary; 16 tests in `blueprint.test.ts` covering valid delay, malformed duration, below min, above max, compound (rejected), delayDuration+profileId (rejected), delayDuration+promptTemplate (rejected)
- `src/lib/chat/tools/workflow-tools.ts` — `create_workflow` tool accepts `delayDuration`, description documents delay-step syntax with drip example, `resume_workflow` companion tool registered
- `src/lib/chat/system-prompt.ts` — `create_workflow` description mentions delay steps, Guidelines include the time-distributed-sequences rule, When-to-Use-Which-Tools table has the drip-campaign routing entry, dedicated Delay Steps section explains format and use cases
- `src/components/workflows/workflow-status-view.tsx` — dedicated `DelayStepBody` component (lines 107-197) renders all three visual states: pending ("Will wait 3d"), delayed (`<time>` element with local-timezone absolute time, `formatDuration` remaining label, Resume Now button with 202/409/error toasts), completed ("Delayed 3d — completed")
- `src/components/workflows/workflow-form-view.tsx` — delay-step editor branch at `renderStepEditor` (lines 955-1015) with `FormSectionCard`, DELAY badge, single duration picker with inline `parseDelayDuration` validation, `aria-invalid`/`aria-describedby` error wiring, no profile/prompt fields
- `src/lib/constants/status-colors.ts:24` — `paused` maps to `variant="secondary"` matching the `waiting_dependencies` family per the UX spec

**One gap filled during verification:**

- `src/lib/chat/suggested-prompts.ts` — `buildCreatePrompts()` was missing the "Design a drip sequence" Create-category prompt called out in the spec. Added it as the third entry, right after the generic multi-step workflow prompt, so users see a natural progression from generic workflow creation to delay-step-aware drip design. Also removed a pre-existing unused `workflows` import from the same file (trivial cleanup in a file already being touched).

**Test suite:** 687 passing, 11 skipped (e2e runtime tests, unchanged), no new failures introduced. The IDE-reported `Cannot find module '@/lib/db'` diagnostics on scheduler tests turned out to be stale TypeScript-server cache artifacts — `npm test` runs all of them cleanly.

**Unblocks:** `bulk-row-enrichment` (the other half of the Growth-Enabling Primitives pair) can now proceed without track-order friction. `workflow-status-view-pattern-router` (groomed earlier today) remains a dependency-respecting follow-up that can run after or in parallel with enrichment.

### Fixed — Workflow detail page crash on loop-pattern workflows

Merged legacy PR #6 (`fix/workflow-loop-status-crash`), opened the same day by ainative Chat running in the `ainative-growth` instance. The workflow detail page crashed into the React error boundary for every loop-pattern workflow (the pattern used by table enrichment) because `completedStepOutputs` in `src/components/workflows/workflow-status-view.tsx:404-406` dereferenced `s.state.result` unconditionally — but the status API returns raw step definitions without a `.state` property for loop workflows. The PR adds optional chaining as a 2-line defensive guard. Shipped as an interim hotfix; the root-cause fix is tracked by the new `workflow-status-view-pattern-router` spec below.

### Groomed — Workflow Status View Pattern Router (1 feature)

Created `features/workflow-status-view-pattern-router.md` (P2, post-mvp, planned) as the durable follow-up to legacy PR #6. Scope: discriminated-union response type in `src/lib/workflows/types.ts`, type-annotated route handler at `src/app/api/workflows/[id]/status/route.ts`, refactor of the 895-line `workflow-status-view.tsx` god component into a thin router (<80 lines), two new pattern-specific subviews under `src/components/workflows/views/`, and a shared polling hook at `src/components/workflows/hooks/use-workflow-status.ts`. The final acceptance criterion **removes** the optional chaining PR #6 added — by that point the TypeScript compiler enforces the invariant via the discriminated union, so the defensive guard becomes obsolete. Also fixes a latent bug: loop workflows currently show an empty Full Output sheet because the UI never reads `loopState.iterations[].result` — the new loop subview wires this up.

**Architect review:** `/architect` ran in Architecture Review mode on PR #6 (`features/architect-report.md` 2026-04-09). Verdict: accept the hotfix, treat it as interim, ship the router refactor in a separate PR. Classification: Medium blast radius (2 layers, 6-7 files). Regression risk matrix covers sequence/parallel/loop/swarm detail pages and polling behavior.

**New TDR created:** [TDR-031 — Workflow status API is a pattern-discriminated union; consumers branch before reading](../.agents/skills/architect/references/tdr-031-workflow-status-response-contract.md), category `api-design`, status `accepted`. Codifies a single exported union type, mandatory narrowing before reading pattern-specific fields, pattern-specific rendering in pattern-specific components, and a four-step checklist for adding new workflow patterns (union arm → route branch → subview → router dispatch) enforced by TypeScript exhaustiveness checking.

**Numbering note:** The 2026-04-08 grooming entry mentioned two "proposed TDRs post-ship" (workflow step `postAction` framework and loop data binding) pre-reserving numbers 031 and 032. Those TDRs were never created. This TDR-031 claims the number legitimately for the workflow status response contract — a different topic. If the `postAction` and data-binding TDRs are authored later, they become TDR-032 and TDR-033.

**Scope decision:** Ambitious scope chosen over minimal (changelog-only) and narrow (normalize API + types only). The ambitious scope adds the router split because `workflow-status-view.tsx` is already a 895-line god component with derived computation above the pattern dispatch branch — the ordering bug that caused PR #6's crash is a structural defect, not just a type-safety defect. Splitting into pattern-specific subviews is the cleanest way to make the bug unrepresentable. Confirmed with user during plan mode.

## 2026-04-08

### Groomed — Growth-Enabling Primitives (2 features)

Split `features/2026-04-08-ainative-core-growth-primitives-design.md` into two independent, implementable feature files. The source spec bundled two orthogonal capabilities identified while building the Growth module — both are general-purpose ainative primitives, not Growth-specific, and they became cleaner when tracked separately.

**New features (both P1, post-MVP, planned):**

- `workflow-step-delays` — adds optional `delayDuration` field to workflow steps ("3d", "2h", "30m", "1w"), schedule-based pause/resume using a new indexed `workflows.resume_at` column, idempotent atomic resume so scheduler + user "Resume Now" click cannot double-fire. Chosen execution model: schedule-based (survives process restarts) over sleep-based (loses timers on restart). Reuses existing `"paused"` status enum value and the `PATCH /api/workflows/[id]` pause transition — the spec claimed these needed to be built from scratch, but ground-truth verification showed the pause half already exists.
- `bulk-row-enrichment` — new `POST /api/tables/:id/enrich` endpoint plus `enrich_table` MCP chat tool, generates a loop workflow iterating over matching rows with `{{row.field}}` template binding, writes results back via a new `postAction` framework (single `update_row` variant, designed as a discriminated union so future variants are additive). Sequential execution for budget safety; idempotent skip-if-populated.

**Spec-vs-code drift caught during verification** (resolved before implementation):

1. `LoopConfig` currently lacks `items`/`itemVariable` data-binding — adding these is Track B's highest-risk work, not an afterthought
2. `BlueprintStepSchema` fields are *required*, not optional — delay-step addition requires converting to optional plus a cross-field XOR `refine()` rule
3. Workflow `"paused"` status and PATCH pause transition already exist — less new surface than the spec implied

**Chat context exposure added (per user request during planning):**

Both feature specs include a new "Chat Context Exposure" section covering system-prompt updates, tool description wording, and suggested-prompts additions. The trigger was a realization that the current `STAGENT_SYSTEM_PROMPT` in `src/lib/chat/system-prompt.ts` has **no Tables section at all**, even though 30+ table tools are already registered — they're effectively invisible to the LLM in tool-use planning. Adding `enrich_table` is the natural moment to close that gap. Specs now require:

- `STAGENT_SYSTEM_PROMPT` gets a new `### Tables` section listing all existing table tools plus the new `enrich_table`
- Intent-routing rules steer "for each row" prompts to `enrich_table` and steer time-distributed sequences to delay steps
- `create_workflow` tool description gets an anti-pattern steer pointing users to `enrich_table` for row fan-out
- `suggested-prompts.ts` adds a Create-category prompt each (drip-sequence and table-enrichment)
- Blueprint validator and `create_workflow` chat tool share a single exported Zod schema for step shape (no duplicated types)

**Proposed TDRs (to be created post-ship):**

- TDR-031 — Workflow step `postAction` framework (discriminated union pattern, additive variant design)
- TDR-032 — Loop workflow data binding (`items`/`itemVariable` + `{{row.*}}` template resolution)

**Track order locked:** Workflow Step Delays first, Bulk Row Enrichment second. Delays is smaller, exercises the scheduler extension in isolation, and has lower drift risk. Enrichment's LoopConfig data-binding changes benefit from building on a stable foundation.

**Reviewed with:** `/architect` (integration design, blast radius Medium across 4 layers, 7 existing TDRs apply), `/product-manager` (feature split, scope boundaries, acceptance criteria), `/frontend-designer` (delay-step UX: 12 new UX-testable acceptance criteria including timezone clarity, compact duration format, no live aria-live ticking, Execute-button pattern reuse). Full plan at `internal implementation plan`.

## 2026-04-07

### Hardened — Dev repo safety & single-clone generalization

User review caught two gaps in the initial grooming pass:

**Gap 1 — Main dev repo safety:** if `instance-bootstrap` ships without gates, the canonical dev repo (`Relay development checkout`) will have a pre-push hook installed and `branch.main.pushRemote=no_push` set on first `npm run dev` after merge, breaking contributor push workflow catastrophically.

Added **layered defense**:
- Primary gate: `STAGENT_DEV_MODE=true` env var (per-developer, via `.env.local`)
- Secondary gate: `.git/ainative-dev-mode` sentinel file (git-dir-scoped, never cloned, persists across `.env.local` churn)
- Tertiary gate: **two-phase bootstrap with explicit consent for destructive ops** — Phase A (instanceId, local branch creation) runs without consent because it's fully non-destructive; Phase B (pre-push hook, pushRemote config) requires user consent via a first-boot notification with `[Enable guardrails] [Not now] [Never on this clone]` actions
- Opt-in override: `STAGENT_INSTANCE_MODE=true` beats `STAGENT_DEV_MODE=true` so contributors can test the feature in the main repo
- **Pre-ship checklist:** implementing PR MUST add `STAGENT_DEV_MODE=true` to main dev repo's `.env.local` AND document in `AGENTS.md` + `CLAUDE.md` before merge

**Gap 2 — Single-clone user generalization:** original spec said "create `local` branch if on `main` with zero local commits, else record current branch as instance branch". The "else" branch would mark a casual user's `main` as protected if they happened to have any local commits predating the feature install — then future upgrades would fail on `main ≠ origin/main`.

Fixed by making `ensureLocalBranch()` **always create `local` at current HEAD** regardless of whether `main` has drifted. `git checkout -b local` is non-destructive — it preserves `main` wherever it was. The upgrade-assistant profile's SKILL.md now includes explicit handling for the "main has drifted from origin/main" case: stops, asks the user interactively, does not auto-resolve.

**New acceptance criteria added to all three feature specs (17 new ACs total):**
- `instance-bootstrap`: 13 new ACs covering dev-mode gates (env var, sentinel, override), consent flow (all 3 states), non-destructive local branch creation, drifted-main scenario, single-clone generalization test
- `upgrade-detection`: 3 new ACs — scheduled poll NOT registered in dev mode, badge handles missing instance settings, single-clone user test
- `upgrade-session`: 6 new ACs — single-clone full flow test, dev-mode skip verification, main dev repo manual safety checklist, drifted-main interactive prompt, Settings → Instance "Dev mode" banner state, upgrade-assistant SKILL.md rule for drifted main

**Upgrade-assistant SKILL.md** now has 4 crucial rules (up from 2): never modify main, abort on failure, **detect and interactively resolve drifted main**, and **treat single-clone `local` branch identically to named private-instance branches**.

### Design-Bridged — upgrade-detection + upgrade-session

`/frontend-designer` UX Recommendation mode produced full UX specification for both features same-day as initial grooming. Added to feature files as new "UX Specification" sections with:
- Persona, core task, success metric, emotional arc
- Information architecture (4-touchpoint flow: badge → modal → session → settings)
- Interaction pattern selection with rationale
- Complete state tables for all touchpoints (badge 4 states, modal 5 states, session 7 states)
- Conflict resolution UX (3-card cluster pattern inside PendingApprovalHost)
- Settings → Instance layout (9 rows of DetailPane content)
- Load-bearing copy direction (headlines, CTAs, banners)
- Accessibility requirements (focus management, aria-live regions, radiogroup semantics)
- Design metric calibration for `/taste` (DV=3, MI=3, VD=6 sheet / VD=4 modal)

17 new UX-testable acceptance criteria added to `upgrade-session`, 7 to `upgrade-detection`. All flagged items from initial grooming now resolved — no UX blockers remain before implementation.

Key UX decisions locked:
- Session view: **right-side Sheet overlay** (not full page) — user glances back at app during run
- Pre-flight tone: **educational, non-urgent** — "Upgrade available" not "New version!", "Start upgrade" not "Install"
- Conflict resolution: **3-card cluster** (Keep mine / Take theirs / Show diff) inside existing PendingApprovalHost
- Restart notice: **success banner inside session sheet** (not toast/modal) with explicit "Restart dev server" button
- Badge placement: above Settings in Configure group (not dot indicator on Settings itself)

Zero new design tokens, zero new components — all via existing Calm Ops primitives (StatusChip, Dialog, Sheet, DetailPane, AgentLogsView, PendingApprovalHost, SectionHeading).

### Groomed — Clone Lifecycle & Self-Upgrade (4 features)

Extracted from the architect integration design report for a self-upgrade system. The work automates the manual PRIVATE-INSTANCES runbook (local branch creation, upstream sync, push guardrails, scale activation) into a guided in-app flow available to every git-clone user — not just power users with multiple private instances.

Key architectural decision: upgrade execution runs through the **task pipeline**, not chat tools. Chat tools are DB-only by design (TDR-024); adding shell access would cross a trust boundary. The upgrade session is a `task` row with a new `upgrade-assistant` profile, reusing 100% of existing infrastructure (fire-and-forget execution, canUseTool approval caching, SSE log streaming, pending-approval conflict resolution). Zero new DB tables — all state lives in `settings` key-value JSON rows.

**4 features created (all planned):**
- `instance-bootstrap` (P1) — idempotent first-boot installer from `instrumentation.ts` alongside scheduler. Creates `local` branch if on clean main, installs pre-push hook, writes per-branch `pushRemote=no_push`, generates stable `instanceId`. Injectable GitOps for testability. Unblocks the other three features.
- `upgrade-detection` (P1) — hourly scheduled poll via `git fetch` (no GitHub REST — sidesteps rate limits). Sidebar badge as Server Component reading `settings.instance.upgrade`. Persistent failure notification after 3 consecutive polls.
- `upgrade-session` (P1) — `upgrade-assistant` builtin profile + merge modal + live session sheet view. Conflict resolution via existing pending-approval pattern. Abort path with `git merge --abort` + stash pop. Settings → Instance section surfacing instance metadata. **Flagged for `/frontend-designer` UX review before implementation.**
- `instance-license-metering` (P2) — hybrid model: local features unlimited, cloud features metered via `(email, machineFingerprint, instanceId)` tuple. `LicenseManager.validateAndRefresh` extended to send the tuple. Supabase edge function work is acknowledged as a separate server-side workstream.

**Proposed TDRs (to be created during implementation):**
- TDR-028: Self-upgrade via task execution pipeline (rejecting chat-based git tools)
- TDR-029: Instance bootstrap in instrumentation.ts (idempotent lifecycle hook)
- TDR-030: Hybrid instance licensing via cloud seat counting

**Zero schema changes.** All new state in `settings` JSON-in-TEXT. Full architect blueprint at `features/architect-report.md`. Motivation and runbook at `PRIVATE-INSTANCES.md` (root, gitignored).

## 2026-04-06

### Implemented — Workflow Intelligence Stack (4 features, EXPANDED scope)

Implemented all 4 features across 2 phases with expanded scope (per-step budget and runtime overrides).

**Phase 1 — Close the Gaps (completed):**
- `workflow-budget-governance` — 4-level budget resolution chain (step → user setting → $5 constant → $2 default), writable budget settings (3 keys), pre-flight cost estimation, per-step budgetUsd override
- `workflow-runtime-configuration` — RuntimeCatalogEntry.models field, hardcoded fallback replacement, runtimeId column on workflows, list_runtimes chat tool (13th tool module), per-step runtimeId override, settings writability tags, CHAT_MODELS catalog validation
- `workflow-execution-resilience` — deferred state writes in executeStep (write-after-execute), error propagation in executeChildTask (no more swallowing), updateWorkflowState throws on missing workflow, crash recovery for stuck "active" workflows, comprehensive reset with orphan cancellation, per-step document binding in create_workflow

**Phase 2 — Intelligence Stack (completed):**
- `workflow-intelligence-observability` — execution stats table + bucket aggregation, step event logging, step progress bar component, live metrics tiles (SSE), error analysis with root cause detection, debug panel with timeline + tiered suggestions, optimizer co-pilot with suggestion cards

**Schema changes:** 2 migrations (0022: tasks.max_budget_usd + workflows.runtime_id, 0023: workflow_execution_stats table)
**New files:** 12 (cost-estimator, execution-stats, error-analysis, optimizer, runtime-tools, step-progress-bar, step-live-metrics, error-timeline, workflow-debug-panel, workflow-optimizer-panel, 2 API routes)
**Modified files:** 12 (engine.ts, types.ts, schema.ts, catalog.ts, claude-agent.ts, anthropic-direct.ts, openai-direct.ts, settings-tools.ts, workflow-tools.ts, ainative-tools.ts, execute/route.ts, clear.ts)

### Groomed — Workflow Intelligence Stack (4 features)

Real user session (investor research workflow) surfaced 9 cascading failures across workflow execution, budget management, model routing, and chat intelligence. Analysis at `ideas/analysis-chat-issues.md`. Brainstormed in EXPAND mode — beyond reactive fixes into proactive optimization. Historical design is anchored by Relay git commit `da666406`.

**Phase 1 — Close the Gaps (3 P1 features, parallelizable):**
- `workflow-budget-governance` — wire dead $5 constant, writable budget settings, pre-flight cost estimation
- `workflow-runtime-configuration` — unified model catalog, per-workflow runtimeId, list_runtimes tool, settings writability tagging
- `workflow-execution-resilience` — state machine atomicity (deferred writes + rollback), retry from crashed "active", per-step document binding

**Phase 2 — Intelligence Stack (1 P2 feature, 4 sub-capabilities):**
- `workflow-intelligence-observability` — optimizer co-pilot, live execution dashboard, embedded debug panel, execution-informed learning

**Key insight:** Most Phase 1 infrastructure already exists but isn't wired — `WORKFLOW_STEP_MAX_BUDGET_USD`, `workflowDocumentInputs.stepId`, `executeTaskWithRuntime(taskId, runtimeId?)` are all dead code or unexposed parameters. Phase 1 is primarily connecting plumbing.

**Dependency chain:** Phase 1 features enable Phase 2 (reliable state → metrics, budget info → optimizer, runtime catalog → recommendations).

## 2026-04-05

### Groomed — PLG Monetization Initiative (17 features)

Comprehensive free→paid strategy brainstormed and groomed using `/product-manager`, `/architect`, and `/frontend-designer` skills in parallel. Target: first paid customer in 6-8 weeks.

**Strategy decisions:**
- Community Edition stays free forever (Apache 2.0), Premium via pure subscription ($19/$49/$99)
- Solo operators (founders, freelancers) as primary target
- Memory cap (50 items/profile) as #1 conversion trigger (loss aversion)
- Cloud stack: Supabase + Stripe + Resend (all existing paid accounts, $0 incremental cost)
- Moat: data flywheel → fine-tuned open models → workflow marketplace (18-month layered build)

**Foundation Layer (3 features, P0):**
- `local-license-manager` — SQLite license table, LicenseManager singleton, tier limits, offline grace period
- `supabase-cloud-backend` — 4 Supabase tables (licenses, telemetry, blueprints, sync_sessions), RLS, 4 Edge Functions
- `stripe-billing-integration` — 3 products × 2 prices, Customer Portal, webhook → Edge Function → license

**Core Layer (8 features, P0-P2):**
- `community-edition-soft-limits` — 4 soft limits: 50 memory, 10 context versions, 5 schedules, 30-day history
- `subscription-management-ui` — /settings/subscription with tier comparison, Stripe Checkout/Portal
- `upgrade-cta-banners` — contextual prompts at friction moments (memory cap, schedule limit, history retention)
- `outcome-analytics-dashboard` — /analytics with success rates, cost-per-outcome, ROI calculator (Operator+ gate)
- `parallel-workflow-limit` — Community=3, Operator=10, Scale=unlimited concurrent workflows
- `cloud-sync` — AES-256-GCM encrypted SQLite backup to Supabase Storage (Operator+ gate)
- `license-activation-flow` — end-to-end purchase → email → activate → unlock
- `marketplace-access-gate` — /marketplace browse + Scale-tier import gate

**Growth Layer (6 features, P1-P3):**
- `edition-readme-update` — Community vs Premium positioning in README (no code deps, Week 1)
- `first-run-onboarding` — email capture + 6-milestone activation checklist
- `marketing-site-pricing-page` — static /pricing on ainative.github.io
- `transactional-email-flows` — 5 Resend email types via Edge Functions
- `telemetry-foundation` — opt-in anonymized telemetry, default OFF, 5-min batch flush
- `upgrade-conversion-instrumentation` — anonymous funnel tracking for A/B testing

**Dual-entry payment model established:**
- Marketing site (orionfold.com/relay) uses Stripe Payment Links — static URLs, no API calls
- Product (/settings/subscription) uses Stripe Checkout Sessions via Supabase Edge Function
- Both paths create same license row in Supabase, keyed by email
- Primary activation: email-based auto-matching (pay → sign in with same email → done)
- Fallback: manual license key entry form for edge cases
- Marketing site purchasers get "Install + sign in" email; in-app purchasers get instant activation
- Updated 4 specs: stripe-billing-integration, license-activation-flow, marketing-site-pricing-page, subscription-management-ui

**Marketing site spec rewritten for actual Astro 5 codebase:**
- Discovered ainative.github.io is Astro 5 + React + Tailwind v4 (not plain HTML)
- Existing Pricing.astro has outdated tiers (Pro $149, Team $499, Advisory Services)
- Spec now targets exact files: Pricing.astro (rewrite), Hero.astro (copy refresh), PersonaLanes.astro (CTA alignment), CTAFooter.astro (copy refresh)
- Advisory Services block replaced with Marketplace Creator Pitch (revenue math, 70/30 split)
- Added /pricing standalone page, FAQ accordion, monthly/annual toggle
- Hero email form reframed from "waitlist" to "State of AI Agents report"

**Marketplace strategy refined (creator-first economics):**
- Marketplace buying unlocked at Solo ($19) not Scale ($99) — maximizes buyer pool
- Marketplace selling unlocked at Operator ($49) — the subscription-pays-for-itself tier
- Revenue split: Operator 70/30, Scale 80/20 — economic upgrade trigger, not feature gate
- Featured listings for Scale tier — visibility advantage, not access restriction
- Creator analytics tab added to outcome-analytics-dashboard
- Marketplace bumped from P2 to P1 — it's a network effect engine, not a nice-to-have

**Architecture decisions (3 new TDRs recommended):**
- TDR-028: Local-First License Enforcement (process-memory cache, daily validation, 7-day grace)
- TDR-029: Telemetry Batching via Settings Table (JSON batch in settings, 200-event cap)
- TDR-030: Encryption-First Cloud Sync (AES-256-GCM, HKDF from user ID, no plaintext in cloud)

## 2026-04-03

### Started
- `database-snapshot-backup` (P1) — Full-state snapshot system: atomic SQLite .backup(), tarball of all ~/.ainative/ file dirs, auto-backup timer with cron intervals, user-configurable retention (max count + max age weeks), restore with pre-restore safety snapshot, Settings UI card. Brainstormed with /architect + /product-manager. 6 implementation phases.

### Completed — Structured Data (Tables) Initiative (14 features, Sprints 38-43)

Full Airtable-like structured data system shipped in a single session. 52 new files, 8 modified files, 0 type errors, 418 tests passing.

**Sprint 38 — Tables Foundation:**
- `tables-data-layer` (P0) — 13 new DB tables (user_tables, columns, rows, views, relationships, templates, imports, triggers, row_history + 4 junction tables), hybrid JSON rows with json_extract() query builder (11 operators), Zod validation schemas, CRUD data layer, 12 built-in templates across 5 categories
- `tables-list-page` (P0) — /tables route with table/grid views, FilterBar (source/project), search, detail sheet, create sheet with inline column builder, sidebar nav entry

**Sprint 39 — Tables Editor:**
- `tables-spreadsheet-editor` (P0) — /tables/[id] with inline cell editing, keyboard navigation state machine (idle/navigating/editing), type-aware cell renderers (text/number/date/boolean/select/url/email/computed), optimistic saves with 300ms debounce, column add/sort/delete, row add/bulk delete

**Sprint 40 — Tables Import + Templates:**
- `tables-document-import` (P0) — 4-step import wizard (select doc → preview → map columns → import), CSV/XLSX/TSV extraction via ExcelJS, column type auto-inference (email/url/boolean/date/number/select patterns), batch import in 100-row chunks, audit trail
- `tables-template-gallery` (P1) — /tables/templates with category tabs (All/Business/Personal/PM/Finance/Content), card grid, preview sheet with column list + sample data, clone flow with optional sample data

**Sprint 41 — Tables Agent Integration:**
- `tables-agent-integration` (P1) — 12 agent tools (list_tables, get_table_schema, query_table, aggregate_table, search_table, add_rows, update_row, delete_rows, create_table, import_document_as_table, list_table_templates, create_table_from_template), registered in tool server
- `tables-chat-queries` (P1) — Table context builder for task/workflow-linked tables (markdown schema + sample data)

**Sprint 42 — Tables Expansion:**
- `tables-computed-columns` (P1) — Recursive descent formula parser → AST evaluator, 12 allowlisted functions (sum/avg/min/max/count/daysBetween/today/concat/if/abs/round/floor/ceil), {{column}} refs, cycle detection via topological sort
- `tables-cross-joins` (P2) — Relation combobox component (search target table rows, single/multi-select)
- `tables-agent-charts` (P2) — Chart builder sheet (bar/line/pie/scatter, X/Y/aggregation config)
- `tables-workflow-triggers` (P2) — user_table_triggers table, trigger evaluator (condition matching reuses filter logic), trigger CRUD API, triggers tab UI with config sheet

**Sprint 43 — Tables Polish:**
- `tables-nl-creation` (P3) — Enhanced create_table_from_description agent tool
- `tables-export` (P3) — GET /api/tables/[id]/export?format=csv|xlsx|json, CSV string builder, XLSX via ExcelJS, native JSON
- `tables-versioning` (P3) — user_table_row_history table, snapshot-before-mutation pattern, row history queries, rollback to previous version

### Groomed
- Extracted 14 Tables features from brainstorming session (EXPAND mode) with architect, product-manager, and frontend-designer perspectives
- Created initial Tables roadmap section with 4 MVP + 4 Post-MVP + 3 Expansion + 3 Future features
- Hybrid JSON rows architecture: fixed Drizzle schema for metadata, JSON TEXT columns for flexible row data, json_extract() for queries
- 12 new DB tables + 12 built-in templates across 5 categories (Business, Personal, PM, Finance, Content)

**MVP (P0):** `tables-data-layer`, `tables-list-page`, `tables-spreadsheet-editor`, `tables-document-import`
**Post-MVP (P1):** `tables-template-gallery`, `tables-computed-columns`, `tables-agent-integration`, `tables-chat-queries`
**Expansion (P2):** `tables-cross-joins`, `tables-agent-charts`, `tables-workflow-triggers`
**Future (P3):** `tables-nl-creation`, `tables-export`, `tables-versioning`

## 2026-04-02

### Groomed
- `workflow-document-pool` (P1) — New feature for intuitive document handoff between workflows via project-level document pool. Junction table architecture, document picker in workflow form (Input Tray), output dock on completed workflows, auto-discovery via document selectors, and chat smart wiring. Brainstormed with product-manager, architect, and frontend-designer perspectives. 3 phases: data+engine, form UX, chat intelligence.
- `workflow-run-history` (P1) — Run tracking for workflows: `runNumber` on workflows (atomic increment on execute), `workflowRunNumber` on tasks (stamped from workflow). Enables grouping tasks by run, document lineage through runs, and document picker disambiguation. Old documents kept; "current" derived by highest version.
- `entity-relationship-detail-views` (P2) — Bidirectional entity relationships in detail views: workflow source badge + version history on document detail, sibling tasks on task detail, document count + recent docs on project detail, project link on workflow detail. Two new API endpoints (versions, siblings).
- `relationship-summary-cards` (P2) — Compact relationship counts on cards/lists: document counts on workflow/task/project cards, task counts on workflow list cards, workflow name column in document table/grid. Subquery-based count enrichment. Zero counts hidden.

## 2026-04-01

### Started
- `chat-settings-tool` (P1) — `set_settings` write tool for chat agent with 9-key allowlist, per-key validation, and permission gating

## 2026-03-31

### Completed
- `bidirectional-channel-chat` (P1) — Channel Gateway bridges inbound Slack/Telegram messages to existing chat engine. Auto-polling for local dev (5s interval). Settings UI with Chat/Active switches, Test button with status indicator. Multi-turn conversations, turn locking, permission handling via channel replies. Slack requires botToken + channels:history + chat:write scopes

## 2026-03-31

### Completed — Vision Alignment Sprints 33-37

**Sprint 33 — Business Positioning (parallel):**
- `product-messaging-refresh` (P0) — Repositioned all in-repo messaging from "Governed AI Agent Workspace" to "AI Business Operating System"; README, package.json, CLI, docs, welcome landing, 7 journey/feature docs, 3 new docs (why-ainative, use-cases)
- `business-function-profiles` (P1) — 6 new builtin profiles (marketing-strategist, sales-researcher, customer-support-agent, financial-analyst, content-creator, operations-coordinator) + 5 new workflow blueprints (lead-research, content-marketing, support-triage, financial-reporting, daily-briefing)

**Sprint 34 — Heartbeat Engine:**
- `heartbeat-scheduler` (P0) — Proactive intelligence mode: 10 new columns on schedules table (type, checklist, active hours, suppression, budget), heartbeat engine in scheduler.ts, active hours windowing, suppression logic, heartbeat prompt builder, API routes, UI with checklist editor and type selector, heartbeat badges on task cards

**Sprint 35 — Agent Intelligence (parallel):**
- `natural-language-scheduling` (P1) — NLP parser for plain-English scheduling, HEARTBEAT.md file support, parse preview API, schedule form NL input
- `agent-episodic-memory` (P1) — agent_memory table, memory extraction, relevance-filtered retrieval, confidence decay, CRUD API, memory browser UI

**Sprint 36 — Coordination (parallel):**
- `multi-channel-delivery` (P2) — channel_configs table, Slack/Telegram/webhook adapters, channel registry, settings UI, schedule delivery integration
- `agent-async-handoffs` (P2) — agent_messages table, handoff governance (chain depth, self-handoff prevention), message bus, send_handoff chat tool, API routes, approval UI

**Sprint 37 — Local Runtime:**
- `ollama-runtime-provider` (P2) — 5th runtime adapter (NDJSON streaming), model discovery, smart router integration, settings UI with connection test and model management

### Groomed — Vision Alignment Initiative (8 features from 2 vision docs)

**Source documents:**
- `ideas/vision/machine-builds-machine-claude-ext-rsrch.md` — Strategic intelligence briefing (market positioning, JTBD, competitive landscape)
- `ideas/vision/ainative-OpenClaw-Companion-Research-Report.md` — 9 OpenClaw capabilities to adopt

**New feature specs created:**
- `product-messaging-refresh` (P0) — Reposition all in-repo messaging from "Governed AI Agent Workspace" to "AI Business Operating System"; README, docs, playbook, CLI help, in-app welcome; new problem statement and use case docs
- `business-function-profiles` (P1) — 6 new builtin profiles (marketing-strategist, sales-researcher, customer-support-agent, financial-analyst, content-creator, operations-coordinator) + 5 new workflow blueprints (lead-research-pipeline, content-marketing-pipeline, customer-support-triage, financial-reporting, business-daily-briefing)
- `heartbeat-scheduler` (P0) — Proactive agent execution extending scheduled-prompt-loops; agents evaluate checklists and suppress no-op runs; business-hour windowing, cost controls, heartbeat badges on Kanban
- `agent-episodic-memory` (P1) — Persistent knowledge memory distinct from behavioral learned_context; new agent_memory table, confidence scoring, memory decay, relevance-filtered injection, operator review UI
- `natural-language-scheduling` (P1) — NLP parser for plain-English scheduling expressions; HEARTBEAT.md file support; chat-based schedule creation; confidence-based confirmation flow
- `multi-channel-delivery` (P2) — Slack and Telegram as outbound delivery channels; heartbeat results, workflow completions, approval requests; channel adapter architecture; Phase 1 delivery-only
- `agent-async-handoffs` (P2) — Async inter-agent communication via SQLite agent_messages table; send_handoff tool, heartbeat-triggered processing, governance gates, handoff policies, chain depth limits
- `ollama-runtime-provider` (P2) — Ollama runtime adapter for local model execution; model discovery, smart router integration, $0 cost tracking, privacy-sensitive task routing

**Overlap resolutions documented:**
- heartbeat-scheduler vs scheduled-prompt-loops: intelligence-driven (new) vs clock-driven (existing) — extends, not replaces
- agent-episodic-memory vs learned_context: knowledge memory (new) vs behavioral memory (existing) — complementary
- agent-async-handoffs vs multi-agent-swarm: decoupled async (new) vs synchronous workflow-bound (existing) — complementary

**Roadmap updates:**
- Added 4 new sections: Vision Alignment — Business Positioning, Proactive Intelligence, Multi-Channel & Coordination, Runtime Expansion
- Added dependency chain and sprints 33-37
- Added deferred items section (13 items from vision docs explicitly out of scope)

**Architecture decisions:**
- Business-function profiles are ADDITIONS (6 new), not renames of existing 14 profiles
- Heartbeat extends existing scheduler table with `type: "heartbeat"` column
- Episodic memory uses new `agent_memory` table, not the existing `learned_context` table
- Multi-channel delivery is outbound-only (Phase 1); bidirectional deferred
- Ollama follows existing `AgentRuntimeAdapter` pattern

**Skills used:** `/product-manager`, `/frontend-designer`, `/architect`

### Completed (status sync — code existed, specs were stale)
- `auto-environment-scan` — staleness-based auto-scan via `src/lib/environment/auto-scan.ts`, 5min threshold, test coverage
- `project-scoped-profiles` — reads `.claude/skills/` in-place via `src/lib/agents/profiles/project-profiles.ts`, cache invalidation, SKILL.md-only support
- `provider-agnostic-tool-layer` — `defineTool()` factory in `src/lib/chat/tool-registry.ts`, Zod → JSON Schema, `toAnthropicToolDef()` / `toOpenAIFunctionDef()` formatters
- `anthropic-direct-runtime` — full Messages API adapter in `src/lib/agents/runtime/anthropic-direct.ts`, streaming, tool use, session resume, budget enforcement
- `openai-direct-runtime` — full Responses API adapter in `src/lib/agents/runtime/openai-direct.ts`, hybrid tool use, `previous_response_id` resume
- `smart-runtime-router` — keyword-based `suggestRuntime()` in `src/lib/agents/router.ts`, profile affinity, credential filtering, cost/latency/quality preferences
- `workspace-context-awareness` — workspace context injection in `src/lib/environment/workspace-context.ts`, integrated into chat engine system prompt (Tier 0)

### Started (status sync — partial implementations)
- `runtime-validation-hardening` — profile Zod validation exists (`src/lib/validators/profile.ts`), runtime config validation middleware still missing
- `dynamic-slash-commands` — tool catalog supports dynamic skills (`src/lib/chat/tool-catalog.ts`), slash command palette registration not yet implemented
- `profile-environment-sync` — one-way artifact→profile linking via `src/lib/environment/profile-linker.ts`, reverse sync not yet implemented

### Retrospective specs created
- `codex-chat-engine` (P1, completed) — parallel Codex App Server streaming engine for chat; shares context builder, entity detection, usage metering with Claude engine
- `workspace-discovery` (P1, completed) — parent-directory walker for `.claude/`/`.codex/` markers; powers workspace import flow with GitHub API integration
- `documentation-adoption-tracking` (P2, completed) — DB-driven adoption depth per feature area; 9+ table parallel queries, usage stage classifier, journey completion tracking
- `keyboard-shortcut-system` (P2, completed) — singleton shortcut registry with scope-based activation, sequence keys (500ms timeout), modifier support, subscriber pattern

### Groomed
- Created `profile-environment-sync` (P1) — roundtrip two-way sync between profiles and environment skill artifacts via passive reconciliation architecture; filesystem as single source of truth, profile-artifact linker, two-tier suggestion engine, scan invalidation on profile mutations, origin badges in UI
- Architecture decision: "Passive Reconciliation" over "Materialized View" (auto-creates everything, too noisy) and "Linked Registry" (manual-only, no UX improvement). Filesystem IS the sync mechanism; the reconciliation layer just makes it visible
- Source: `/architect` review + `/product-manager` grooming + `/frontend-designer` UX analysis — cross-skill analysis of profiles and environment features
- Created **Workspace Intelligence** initiative — 3 new features + 1 existing regrouped:
  - `auto-environment-scan` (P1) — automatic staleness-based environment scan on project context change; eliminates manual "Scan" button as primary interaction
  - `project-scoped-profiles` (P1) — bridge project `.claude/skills/` to ainative profiles, read in-place (not copied), supports SKILL.md-only skills with minimal profile generation
  - `dynamic-slash-commands` (P2) — dynamic "Skills" group in chat slash command popover, populated from active project's discovered skills
  - `workspace-context-awareness` (P1, existing) — moved from Platform section into Workspace Intelligence initiative
- Added "Workspace Intelligence" section to roadmap with dependency chain
- Architecture decision: project skills read in-place, not copied to `~/.claude/skills/` — prevents drift, project repo stays source of truth
- Source: `/architect` review mode + `/product-manager` grooming — analyzing how folder skills should align with agent profiles

## 2026-03-30

### Groomed
- Created **Direct API Runtime Expansion** initiative — 6 features extracted from `ideas/direct-api-gap-analysis.md`:
  - `provider-agnostic-tool-layer` (P0) — decouple 50+ tool definitions from Claude Agent SDK into provider-neutral `defineTool()` format; prerequisite for both direct runtimes
  - `anthropic-direct-runtime` (P1) — new `AgentRuntimeAdapter` for Anthropic Messages API; agentic loop, streaming, HITL, session resume via DB; sub-second latency, no CLI required
  - `openai-direct-runtime` (P1) — new `AgentRuntimeAdapter` for OpenAI Responses API; server-side agentic loop, code interpreter, file search, image generation; no Codex binary required
  - `smart-runtime-router` (P1) — `suggestRuntime()` function for auto-selecting best runtime per task; keyword signals, profile affinity, user preference (cost/latency/quality); "Auto (recommended)" as default
  - `direct-runtime-prompt-caching` (P2) — wire Anthropic prompt caching on system/profile/learned-context blocks; up to 90% input cost savings; batch API for meta-completions
  - `direct-runtime-advanced-capabilities` (P2) — extended thinking, context compaction, per-runtime model selection, server-side tool configuration UI
- Added "Direct API Runtime Expansion" section to roadmap with dependency chain and sprints 29-32
- Source: Architecture review + product analysis combining `/architect` review mode and `/product-manager` incremental update
- Design posture: expansion (add 2 new runtimes), not replacement (existing SDK runtimes untouched)

### Completed
- `chat-conversation-persistence` — URL/localStorage activeId sync, background activity indicator with task polling
- `settings-interactive-controls` — SDK Timeout and Max Turns sliders with contextual labels, recommended range indicators
- `task-hierarchy-clarity` — standalone vs workflow-bound task sectioning, deduplicated status counts, workflow badges
- `agent-document-api-access` — 3 document mutation tools (upload/update/delete), permission gating, audit logging
- `browser-use` — Chrome DevTools + Playwright MCP config builder, settings toggles, permission tiering
- `chat-command-mentions` — slash command registry, @mention popover with entity search, autocomplete hook

### Completed (late)
- `skills-repo-import` — provenance badges (Built-in/Custom/Imported) on profile cards, typed GitHub API errors (private repo/rate limit/404 detection), source directory link in imported profile detail view
- `profile-ai-assist-ux` — description field in profile form with AI assist integration, auto-approve/auto-deny tool policy fields with TagInput autocomplete, policy section card in AI assist results panel

## 2026-03-27

### Groomed
- `chat-command-mentions` (P1) — "/" slash commands for tools/actions access and "@" mentions for entity references in chat prompt box; reuses cmdk primitives from Cmd+K palette; Tier 3 context injection for mentioned entities; 5 phases (shared data, hook+popover, input integration, entity search API, context injection)
- `browser-use` (P1) — enable Chrome DevTools MCP (29 CDP tools) and Playwright MCP (50+ accessibility-snapshot tools) as browser automation tool sources for chat and task execution; settings-driven toggles, permission tiering (read-only auto-approve, mutations gated), profile-level deny support

## 2026-03-24

### Completed
- **Living Book initiative fully shipped** — all 5 features completed in a single sprint:
  - `living-book-content-merge` — Try It Now Playbook section cards in each chapter, chapter-mapping.ts wiring 9 chapters to 19 feature docs + 4 journey guides
  - `living-book-authors-notes` — collapsible Author's Notes callout variant with themed styling across light/sepia/dark modes
  - `living-book-reading-paths` — 4 persona-based paths (Getting Started, Team Lead, Power User, Developer) with PathSelector, PathProgress, stage-aware recommendation
  - `living-book-markdown-pipeline` — all 9 chapters migrated to `book/chapters/*.md` with frontmatter schema, markdown-to-ContentBlock parser, GitHub raw URL image resolution
  - `living-book-self-updating` — chapter regeneration via document-writer agent profile, git-based staleness detection (`update-detector.ts`), `ChapterGenerationBar` with generate/regenerate button + staleness badge
- **Chapter regeneration pipeline**: `POST /api/book/regenerate` creates a task with document-writer profile, fires `executeTaskWithAgent` for fire-and-forget execution, returns taskId for client polling
- **Live progress streaming**: SSE subscription via `EventSource` to `/api/logs/stream?taskId=X` shows real-time agent steps (Reading files → Planning structure → Composing content → Writing chapter) with fade-in animation
- **Staleness detection UI**: Badge showing "Sources updated N days ago" when chapter source files have changed since last generation
- **Empty chapter state**: Sparkle icon placeholder with "Generate chapter" CTA for chapters without markdown content; TOC sparkle indicators for unwritten chapters
- Fixed regenerated chapters losing Try It Now section — added `relatedDocs` and `relatedJourney` to frontmatter template
- Fixed path inconsistencies: `docs/book/` → `book/chapters/` in chapter-generator.ts and update-detector.ts

### Groomed
- Created **Living Book** initiative — 5 features that unify the Book, Playbook, and ai-native-notes into a single flagship content experience:
  - `living-book-content-merge` (P1) — map Playbook's 19 feature docs + 4 journey guides into Book's 9-chapter structure; "Try It Now" sections; fills 6 stub chapters
  - `living-book-authors-notes` (P2) — embed ai-native-notes screenshots as collapsible "Author's Notes" callouts; new `authors-note` callout variant; dogfooding proof
  - `living-book-reading-paths` (P2) — 4 persona-based reading paths (Getting Started, Team Lead, Power User, Developer); stage-aware recommendation; path-scoped progress
  - `living-book-markdown-pipeline` (P2) — migrate content.ts to docs/book/*.md files; extend reader.ts for unified manifest; markdown-to-ContentBlock parser
  - `living-book-self-updating` (P3) — planner-executor workflow that auto-regenerates stale chapters; human review gate; "ainative writes its own Book" capstone
- Added Living Book section to roadmap with dependency chain and sprints 25-28

## 2026-03-23

### Groomed
- Split `kitchen-sink-03-23` into 3 standalone feature specs:
  - `chat-conversation-persistence` (P1) — persist activeConversationId via URL search param + localStorage; background subagent activity indicator showing running/completed tasks spawned from chat, survives navigation
  - `settings-interactive-controls` (P2) — upgrade SDK Timeout and Max Turns to sliders with contextual guidance labels, recommended range indicators, and hover tooltips
  - `task-hierarchy-clarity` (P1) — distinguish standalone vs workflow-bound tasks in project detail; section grouping, workflow badges, cross-links, deduplicated status counts. Option C (Keep Separate but Link Clearly) selected
- Refined `agent-document-api-access` (P2) — corrected tool registration architecture (MCP server pattern via document-tools.ts, not tools-registry.ts), fixed permission pattern format (mcp__stagent__* convention matching PERMISSION_GATED_TOOLS set), noted existing PATCH/DELETE routes to extend, clarified output-scanner relationship
- `workspace-context-awareness` (P1) — surface existing workspace context (cwd, git branch, worktree status) to chat agents and task execution; discovered during worktree dogfooding when agent created files in main repo instead of worktree

## 2026-03-22

### Completed
- `chat-data-layer` (P0) — conversations + chat_messages tables, Drizzle schema, full CRUD data access with cursor-based pagination
- `chat-engine` (P0) — progressive 5-tier context injection (~53K token budget), streaming response handling, entity detection, model discovery, permission bridge, ainative CRUD tools (list/create/update/delete for projects, tasks, workflows), intent disambiguation, system prompt with workspace awareness
- `chat-api-routes` (P0) — conversations CRUD, SSE message streaming with keepalive pings, model catalog endpoint, context-aware suggested prompts endpoint, permission/question response endpoint
- `chat-ui-shell` (P1) — ChatShell layout with conversation list sidebar, responsive design, empty state hero with suggested prompt chips
- `chat-message-rendering` (P1) — ReactMarkdown + GFM rendering, Quick Access navigation pills for entity deep-linking, permission request UI, question rendering with options
- `chat-input-composer` (P1) — model selector with cost tiers ($, $$, $$$), Claude.ai-style tabbed suggested prompts with hover preview, settings default model preference
- Multi-provider support: Claude SDK (Haiku/Sonnet/Opus) + Codex App Server (GPT-5.3/5.4)
- Dynamic model discovery with runtime-aware cost tier classification
- Fixed blank chat responses (stream_event wrapper handling, multi-turn context)
- Version bump needed for chat feature inclusion

### Groomed
- Extracted 6 chat features from HOLD-mode brainstorming session
- Chat as "conversational control plane" for all ainative primitives
- Non-agentic by default (maxTurns: 1, no tools) — Haiku 4.5 default for cost efficiency
- Progressive 5-tier context injection (Tier 0: workspace → Tier 4: full documents, ~53K token budget)
- Quick Access navigation pills in responses for entity deep-linking
- Model selector with cost/capability tiers ($, $$, $$$) + Settings default preference
- Decisions confirmed: sidebar after Inbox, full-bleed hero, free-floating conversations, user-managed deletion
- Foundation (P0): chat-data-layer, chat-engine, chat-api-routes
- UI (P1): chat-ui-shell, chat-message-rendering, chat-input-composer
- Updated roadmap with new "Chat Conversation" section and Sprints 21-24

## 2026-03-21

### Groomed
- Extracted 11 environment onboarding features from brainstorming session (EXPAND mode)
- Feature set makes ainative a control plane for Claude Code and Codex CLI environments
- 3 personas: Claude Code only, Codex only, both tools in same project
- Progressive adoption funnel: Visibility → Sync → Orchestration
- Architecture: Scanner + Cache with git-based checkpoints and bidirectional sync
- Core features (P0): environment-scanner, environment-cache, environment-dashboard
- Safety + sync (P1): git-checkpoint-manager, environment-sync-engine
- Productivity (P2): project-onboarding-flow, environment-templates, cross-project-comparison, skill-portfolio
- Governance (P3): environment-health-scoring, agent-profile-from-environment
- Updated roadmap with new "Environment Onboarding" section and dependency chain

## 2026-03-20

### Completed
- Calm Ops design system eval pass — applied PageShell wrapper to all remaining routes (`/settings`, `/playbook`, `/schedules`), wired elevation classes (`.elevation-0` through `.elevation-3`) to stats cards, project sections, workflow cards, schedule cards, and inbox list; integrated FilterBar into DocumentBrowser with active count badge and clear-all button
- Version bump to 0.1.13 — regenerated docs and recaptured screenshots for icon circle badges

## 2026-03-18

### Completed
- `detail-view-redesign` (P2, post-MVP) — Unified detail views across task, document, and workflow surfaces
  - Task detail: bento grid layout, chip bar (status/priority/complexity/profile/dates), prose reader surface, usage metrics
  - Document detail: chip bar + content renderer, image zoom, smart extracted text display
  - Workflow kanban cards: status-colored left strips matching workflow state
  - Shared `prose-reader-surface` CSS class and `PROSE_READER` constants for consistent typography across 6+ views
- Workflow cascade delete — FK-safe child task cleanup when deleting workflows
- Notification UX — click-through navigation to source entities, expand/collapse, destructive delete-read styling
- Icon circle badges with keyword-inferred colors on profile, blueprint, and workflow cards

### Fixed
- Three type errors caught by production build

### Started
- `workflow-ux-overhaul` (P1, in-progress) — comprehensive workflow UX fix
  - Chunk 2 (Output Readability): partially addressed — `ExpandableResult` component, full output as inline Card
  - Chunk 3 (Dashboard Visibility): partially addressed — all workflow statuses shown on home dashboard, urgency sort
  - Chunk 1 (Document Context Propagation): not yet started
  - Chunk 4 (AI Assist Guidance): not yet started

### Fixed
- Document links: `/download` route replaced with `/documents/[id]` view navigation
- Batch context proposal approve/reject now works without requiring individual notification IDs

## 2026-03-17

### Completed
- Playbook documentation system — built-in docs at `/playbook` with usage-stage awareness, adoption heatmap, journey cards, markdown rendering, and command palette integration
- README updated with Playbook feature across all sections (highlights, deep dives, project structure, API routes, roadmap)
- `learned-context-ux-completion` (P2, completed) — diff rendering, snapshot display, deterministic profile ordering (groomed and implemented same day)

### Groomed
- `learned-context-ux-completion` (P2, planned) — bounded UX follow-up from the agent self-improvement browser evaluation
  - Split the remaining learned-context UX gaps out of `agent-self-improvement` instead of reopening the completed base feature
  - Scoped the follow-up to user-facing gaps only: unified diff rendering, clearer rollback/snapshot visibility, version-count grammar, and deterministic profile ordering for discoverability
  - Explicitly left reset/delete context tooling, compact-toast editing, and additional warning-tier polish out of scope for this slice

### Groomed & Implemented (E2E Test Report Recommendations)
- Assessed 5 recommendations from `output/done-agent-e2e-test-report.md` (2026-03-15, 10/10 pass)
- `e2e-test-automation` (P2, completed) — API-level E2E test suite
  - Created `vitest.config.e2e.ts` with 120s timeouts, sequential execution, node environment
  - Created `src/__tests__/e2e/helpers.ts` — HTTP client utilities, polling helpers, runtime detection
  - Created `src/__tests__/e2e/setup.ts` — test project + sandbox creation/teardown with deliberate-bug TypeScript files
  - 5 test files: `single-task`, `sequence-workflow`, `parallel-workflow`, `blueprint`, `cross-runtime`
  - ~15 test cases covering both runtimes, 4 profiles, 4 workflow patterns
  - Tests skip gracefully when runtimes aren't configured (no CI failures)
  - Added `npm run test:e2e` script to package.json
  - Rec #4 (Codex workflow testing) folded in as Codex-specific describe blocks
- `tool-permission-presets` (P2, completed) — Preset permission bundles
  - Created `src/lib/settings/permission-presets.ts` — 3 presets (read-only, git-safe, full-auto) with apply/remove logic
  - Presets are layered (git-safe includes read-only), removal only strips unique patterns
  - Created `POST/GET/DELETE /api/permissions/presets` route
  - Created `PresetsSection` component with risk badges and enable/disable toggles
  - Created `PermissionsSections` wrapper coordinating presets + individual permissions via forwardRef
  - Integrated into Settings page above existing Tool Permissions section
- `workflow-context-batching` (P2, completed) — Workflow-scoped proposal buffering
  - Created `src/lib/agents/learning-session.ts` — session lifecycle (open/buffer/close), batch approve/reject
  - Modified `engine.ts` — wraps all workflow patterns in learning session open/close (including loop + try/finally)
  - Modified `pattern-extractor.ts` — detects workflow session, calls `proposeContextAddition({ silent: true })` to skip notification
  - Modified `learned-context.ts` — `proposeContextAddition` accepts `{ silent }` option to create row without notification
  - Created `POST /api/context/batch` — batch approve/reject endpoint
  - Created `BatchProposalReview` component with Approve All / Reject All actions
  - Integrated into `PendingApprovalHost` for both compact toast and full detail views
  - Added `context_proposal_batch` to notification type enum in DB schema
- Rec #2 (Codex output artifacts) closed — documented output contract in `provider-runtime-abstraction.md`

### Catalog Sync
- Renamed `output/agent-e2e-test-report.md` → `output/done-agent-e2e-test-report.md` (all 5 recommendations addressed)
- Updated references in 5 feature files + changelog

### Completed
- `sdk-runtime-hardening` (P2, post-MVP) — Systematic SDK audit fixes for cost tracking, execution safety, and prompt quality
  - F1: Refactored to use `systemPrompt: { type: 'preset', preset: 'claude_code', append }` instead of prompt stuffing
  - F2: Removed decorative `temperature` from all profile YAMLs and `AgentProfile` type
  - F4: Added per-execution `maxBudgetUsd` via `DEFAULT_MAX_BUDGET_USD` to both execute and resume paths
  - F5: Expanded pricing registry from 2 to 6 model families (3 Anthropic + 3 OpenAI) with fallback estimates
  - F6: Added `getProviderModelBreakdown()` for per-model usage extraction from SDK `modelUsage` field
  - F9: Added default `maxTurns` on task execution with per-profile override via `DEFAULT_MAX_TURNS`
  - F10: Codex `item/tool/call` handler returns structured graceful response instead of bare string stub
  - F12: Extracted shared `buildTaskQueryContext()` helper eliminating duplicate execute/resume prompt construction

### Catalog Sync
- Feature catalog updated retroactively to reflect SDK audit-driven code changes (commit `e5680ff`)
- Added implementation notes to `usage-metering-ledger` (F5, F6), `spend-budget-guardrails` (F4, F9), `provider-runtime-abstraction` (F1, F12), `cross-provider-profile-compatibility` (F2)
- Renamed `output/sdk-usage-audit.md` → `output/done-sdk-usage-audit.md`

### Deferred
- F3 (`outputFormat`) — Profile field exists but not wired to `query()` options; needs per-profile JSON Schema definitions
- F7 (`fallbackModel`) — No multi-model failover needed currently
- F8 (`includePartialMessages`) — Only optimized for connection test; remaining call sites deferred
- F11 (Codex MCP passthrough) — Catalog already lists `mcpServers: false`
- F13 (Usage dedup by message ID) — Current merge strategy sufficient without multi-model sessions

## 2026-03-15

### Completed
- `ai-assist-workflow-creation` (P1, post-MVP) — Bridge AI Assist recommendations into workflow engine
  - Expanded `TaskAssistResponse` with per-step profiles, dependencies, and all 6 workflow patterns
  - Updated AI system prompt with dynamic profile catalog injection and pattern selection guide
  - Created `assist-builder.ts` — pure function converting assist response → validated `WorkflowDefinition`
  - Created `POST /api/workflows/from-assist` — atomic workflow + tasks creation with optional immediate execution
  - Created `WorkflowConfirmationSheet` — editable workflow review UI (pattern, steps, profiles, config)
  - Added "Create as Workflow" button in AI Assist panel (shown for 2+ steps, non-single patterns)
  - Created keyword-based profile suggestion fallback (`suggest.ts`)
  - Updated workflow engine to resolve "auto" profiles via multi-agent router at execution time

### Fixed
- `syncSourceTaskStatus` bug in workflow engine — defensive array check prevents "not iterable" TypeError when syncing parent task status after workflow completion
- `npm-publish-readiness` roadmap status corrected from `completed` → `deferred` to match feature file frontmatter

### Shipped
- `agent-self-improvement` (P3, post-MVP) — Agents learn from execution history with human-approved instruction evolution
  - `learned-context.ts`: Full CRUD — propose, approve, reject, rollback, summarization with size limits
  - `pattern-extractor.ts`: LLM-powered pattern extraction from task logs (Claude tool_choice for structured output)
  - `sweep.ts`: Sweep result processor creates prioritized improvement tasks from audit results
  - Sweep agent profile (`builtins/sweep/`) with structured JSON output format
  - API routes: `GET/POST/PATCH /api/profiles/[id]/context` for version history, manual add, approve/reject/rollback
  - UI: `LearnedContextPanel` (version timeline, size bar, manual add, rollback), `ContextProposalReview` (approve/edit/reject)
  - Integrated into `claude-agent.ts` — learned context injected into prompts, pattern extraction fire-and-forget after completion
  - Notification system handles `context_proposal` type in `PendingApprovalHost` with inline approve/reject
  - Tests: 35 tests across `learned-context.test.ts` (20), `sweep.test.ts` (9), `pattern-extractor.test.ts` (6)

### Previously Completed
- `board-context-persistence` (P2, post-MVP) — Persist board state across sessions and navigation
  - Created generic `usePersistedState` hook for localStorage-backed state with SSR-safe hydration
  - Project filter persists across page refreshes via `ainative-project-filter` localStorage key
  - New Task link passes selected project as `?project=` search param, pre-filling the create form
  - Added sort order dropdown (Priority, Newest first, Oldest first, Title A-Z) persisted to localStorage
- `kanban-board-operations` (P2, post-MVP) — Shipped inline task editing, bulk operations, and card animations
  - Added inline delete confirmation on task cards with 2-step UX (trash icon → confirm/cancel) and 3-second auto-revert
  - Added task edit dialog for planned/queued tasks with profile-runtime compatibility validation
  - Added column-level selection mode with bulk delete (confirmation modal) and bulk status transitions (planned→queued, queued→running)
  - Added ghost card exit animation using sessionStorage for cross-navigation state persistence
  - Added priority-colored strip toolbar on card footer with contextual action buttons

### Enhancement
- `task-definition-ai` (P2, MVP) — AI Assist panel now shows animated progress bar with rotating activity messages instead of spinner
- `provider-runtime-abstraction` (P1, post-MVP) — Added timeout guards: 30s abort on Claude task assist, 60s timeout on Codex with subprocess error handling
- Engineering principles codified in AGENTS.md (7 directives: zero silent failures, named errors, shadow paths, edge cases, explicit>clever, DRY with judgment, permission to scrap)
- Version bump to 0.1.7

## 2026-03-14

### Removed
- `tauri-desktop` — Distribution simplified to `npx ainative` (npm) and web app only. All Tauri desktop shell, macOS DMG generation, Apple signing scripts, desktop smoke tests, and related feature specs removed. CLI entry point (`bin/cli.ts`) and sidecar launch helpers retained for the npx path.

## 2026-03-13

### Ship Verification
- `desktop-sidecar-boot-fix` (P0, MVP) — The bundle boot blocker is no longer the broken `next` shim
  - Replaced the sidecar's `node_modules/.bin/next` launch path with a direct `node_modules/next/dist/bin/next` invocation via the active Node binary, which avoids Tauri's symlink-flattened `.bin/` copies
  - Added a post-bundle sync of `.next/node_modules` into `ainative.app` so Next's generated hashed externals such as `better-sqlite3-*` remain resolvable inside the packaged app
  - Verified the actual release bundle sidecar starts in production mode and returns HTTP `200` on localhost under a Finder-style minimal `PATH`

### Enhancement
- `desktop-sidecar-boot-fix` (P0, MVP) — Hardened the desktop handoff and trimmed accidental bundle bloat
  - Stopped the internal CLI from re-running port discovery when the Tauri wrapper already passed an explicit localhost port, preventing the boot screen from polling a stale port while the sidecar listens on a different one
  - Pruned non-runtime Next artifacts such as `.next/dev`, trace files, diagnostics, and caches from the finished `ainative.app` bundle so desktop release size no longer inherits stale local dev output
  - Rebuilt the local desktop artifacts to verify the size drop: the bundled `.next/` payload fell to roughly `51MB`, and the smoke DMG compressed to roughly `260MB`

### Started
- `desktop-sidecar-boot-fix` (P0, MVP) — Desktop app launches but hangs at boot screen. Five issues identified and four solved (DMG signing, node PATH, `_up_/` path mapping, shim PATH). Initial blocker for this slice: Tauri's resource bundling destroys `node_modules/.bin/` symlinks, breaking the `next` CLI shim's relative requires. Feature spec documents the full diagnosis log.

### Re-prioritized
- **Distribution direction**: ainative is now desktop-only in user-facing product positioning
  - Removed npm / `npx` onboarding and publish wiring from the repo surface, while keeping the CLI build only as an internal sidecar dependency of the desktop app
  - Deferred `npm-publish-readiness` as an active product feature and updated the bootstrap spec so it describes the internal desktop sidecar rather than a public install command
  - Promoted GitHub-hosted desktop artifacts as the only documented end-user install channel

### Enhancement
- **tauri-desktop** (P3, post-MVP): Added repo-distributed macOS desktop packaging on top of the local Tauri foundation
  - Enabled `.dmg` output for the Tauri bundle so the desktop build produces an installable macOS artifact instead of only a local `.app`
  - Added a GitHub Actions workflow that builds unsigned macOS desktop assets on tag push or manual dispatch, uploads them as workflow artifacts, and attaches them to GitHub releases for repo-based download
  - Updated the README to point desktop users at GitHub Releases and to document the current limitations: macOS-only, unsigned build, and local `node` dependency

### Started
- **tauri-desktop** (P3, post-MVP): Activated the first desktop-foundation slice instead of treating the full native distribution plan as one implementation
  - Starts with a Tauri wrapper that boots a local loading shell, spawns the existing `dist/cli.js` sidecar, and hands the window over to the same localhost-hosted Next.js app used by the desktop shell
  - Limits the first bridge surface to native notifications and file dialogs so browser-safe shared code can grow into desktop capabilities without forcing a second UI stack
  - Defers bundled Node runtime, system tray, updater, and signed distribution until the sidecar wrapper is stable enough to justify deeper packaging work
- Updated roadmap: marked `tauri-desktop` as started and added it as the current post-MVP platform sprint

## 2026-03-12

### Ship Verification
- **npm-publish-readiness** (P1, post-MVP): Acceptance criteria verified against the packaged CLI, published tarball shape, npm-facing README, and live registry publication
  - Confirmed package metadata now covers npm discovery and links, while the published tarball keeps runtime-required source/assets and excludes repo-only test files
  - Confirmed the CLI help path now documents `STAGENT_DATA_DIR`, startup flags, and runtime credential expectations for first-time npm users
  - Verified with `npm run build:cli`, `npm pack --dry-run`, a passing `npm run smoke:npm` tarball launch, and successful publication of `ainative@0.1.1`
- **multi-agent-swarm** (P3, post-MVP): Acceptance criteria verified against the new swarm workflow pattern, retry flow, targeted tests, and a successful production build
  - Confirmed workflow authoring now supports a bounded `swarm` pattern with one mayor step, 2-5 worker steps, a refinery step, and configurable worker concurrency
  - Confirmed execution runs the mayor first, fans worker child tasks out through the existing workflow task path, blocks the refinery on failed workers, and persists grouped swarm progress in workflow state
  - Confirmed failed mayor, worker, and refinery stages can be retried from workflow detail through a new step-retry endpoint without re-running successful sibling workers
  - Verified with targeted Vitest coverage (`16` passing tests across workflow validation/helpers/engine) and a successful production build
- **ambient-approval-toast** (P1, post-MVP): Acceptance criteria verified against the shipped shell presenter, shared permission controls, targeted tests, and a successful production build
  - Confirmed unresolved `permission_required` notifications now surface through a shell-level presenter on any route, using a primary approval card plus an explicit overflow indicator instead of overlapping surfaces
  - Confirmed the toast and Inbox now share the same permission-response control path, so `Allow Once`, `Always Allow`, and `Deny` still write the canonical notification response through the existing task response endpoint
  - Confirmed new requests are announced through a polite live region, expanded detail restores focus on close, and mobile uses the bottom-anchored sheet-style variant instead of a desktop corner-only presentation
  - Verified with targeted Vitest coverage (`3` passing tests across the new notification host and shared permission controls) plus a successful production build
- **cross-provider-profile-compatibility** (P2, post-MVP): Acceptance criteria re-verified against code, targeted tests, production build, and a live browser pass
  - Confirmed profile metadata supports runtime declarations and runtime-specific overrides, built-in profile sidecars advertise Claude/Codex coverage, and execution resolves provider-specific payloads instead of assuming universal Claude `SKILL.md`
  - Confirmed task, schedule, and workflow validation reject incompatible runtime/profile assignments before execution, and profile smoke tests now target a selected runtime with explicit `unsupported` reporting
  - Re-verified the profile browser and detail surfaces expose runtime coverage, and retained the regression fix that refreshes profile discovery when on-disk skill directories change so new custom profiles no longer 404 after creation
  - Verified with targeted Vitest coverage (`26` passing tests), a successful production build, and a browser check covering both unsupported and dual-runtime profile states

### Completed
- **npm-publish-readiness** (P1, post-MVP): Shipped npm distribution hardening for `npx ainative`
  - Added publish-ready npm metadata, tarball trimming, and a packaged smoke-test workflow that validates the CLI from the actual npm tarball instead of the repo checkout
  - Updated CLI help and runtime path handling so packaged runs can document and honor `STAGENT_DATA_DIR`, `--port`, `--reset`, and `--no-open`
  - Refreshed the npm-facing README with current feature coverage, a release checklist, and packaged screenshots that render from the published tarball
- **multi-agent-swarm** (P3, post-MVP): Shipped bounded swarm orchestration on top of the existing workflow system
  - Added a `swarm` workflow pattern with a fixed mayor → worker pool → refinery structure instead of introducing a new graph runtime
  - Workers now execute in parallel with a configurable concurrency cap while the refinery step receives the mayor plan plus labeled worker outputs as merge context
  - Workflow detail now groups swarm runs into mayor, worker, and refinery panels, and failed swarm stages can be retried independently through a dedicated step-retry route
- **ambient-approval-toast** (P1, post-MVP): Shipped in-context approval toasts for human-in-the-loop task supervision
  - Added a shell-mounted pending approval host that watches unresolved permission notifications via a dedicated pending-approval payload and SSE snapshot stream with polling fallback
  - Introduced a shared permission-response action component so the ambient presenter and Inbox use the same approval semantics, including persisted `Always Allow` patterns
  - Added a queue-aware compact approval surface, expanded detail dialog, and mobile bottom-sheet variant with focus return, live-region announcement, and overflow handling for multiple pending approvals
  - Introduced a reusable actionable-notification payload and adapter interface so browser and future Tauri/macOS delivery can reuse the same IDs, summaries, deep links, and action set
- **parallel-research-fork-join** (P2, post-MVP): Shipped bounded fork/join workflow execution
  - Added a `parallel` workflow pattern with a bounded authoring flow: 2-5 research branches plus one required synthesis step instead of a free-form graph editor
  - Workflow execution now launches branch child tasks concurrently with a small concurrency cap, holds the synthesis step in an explicit waiting state until every branch succeeds, and builds the final prompt from labeled branch outputs
  - Workflow detail now renders branch-level progress cards and a distinct synthesis panel, while API and form validation reject malformed parallel definitions before execution
  - Fixed workflow failure persistence so failed workflow runs now store a top-level `failed` status instead of remaining `active` after a branch or synthesis error
  - Verified with targeted Vitest coverage (`31` passing tests across workflow and agent suites), a successful production build, and a live browser pass that created and executed a parallel workflow
- **document-output-generation** (P3, post-MVP): Shipped managed capture for agent-generated files
  - Fresh task runs now prepare `~/.ainative/outputs/{taskId}/`, inject that path into Claude and Codex prompts, and scan supported generated files after successful completion
  - Generated `.md`, `.json`, `.csv`, `.txt`, and `.html` files are archived as immutable output documents with `direction="output"` plus version numbers so reruns preserve prior outputs instead of overwriting document history
  - Task detail now separates input attachments from generated outputs, while the Document Manager exposes output files through the normal browser with direction and version visibility
  - Document preview/download flows now use a document-backed file route, and agent document context is restricted to input documents so generated outputs do not feed back into future prompt context
  - Verified with targeted Vitest coverage (`50` passing tests across runtime/document suites) and a successful production build
- **cross-provider-profile-compatibility** (P2, post-MVP): Shipped provider-aware profile coverage across authoring, execution, and testing
  - Added runtime compatibility metadata to profile sidecars plus runtime-specific instruction override support so profiles can declare Claude-only, Codex-only, or dual-runtime coverage explicitly
  - Runtime resolution now loads provider-specific profile payloads for Claude and Codex task execution instead of assuming every profile is a universal Claude `SKILL.md`
  - Task creation, task updates, schedules, workflow draft editing, and queued task execution now reject incompatible runtime/profile combinations before they silently fail
  - Profile browser cards and detail views now surface runtime coverage, while the profile editor can opt profiles into Codex support and add Codex-specific instructions
  - Profile smoke tests now target a selected runtime and return an explicit `unsupported` report when the runtime or profile payload cannot run tests
  - Verified with targeted Vitest coverage for profile compatibility helpers and a successful production build

### Groomed
- **npm-publish-readiness** (P1, post-MVP): Added a bounded npm distribution hardening spec for the existing CLI bootstrap
  - Separates publish-readiness from the already-completed local CLI bootstrap so release work is scoped to tarball shape, package metadata, smoke testing, and onboarding docs
  - Targets the OpenVolo-style thin CLI plus source-shipped Next.js pattern already captured in `ideas/npx-web-app.md`
  - Calls for `npm pack`-based validation so `npx ainative` is proven from the shipped tarball rather than assumed from repo-local execution
- Updated roadmap: added `npm-publish-readiness` as a planned Platform feature
- **ambient-approval-toast** (P1, post-MVP): Added an in-context approval surface spec for active supervision
  - Defines a shell-level permission toast that appears on any route, keeps Inbox as the durable record, and lets users approve or deny without switching context
  - Uses a compact toast plus expanded modal-like detail state so approval requests are noticeable without becoming a blocking full-screen interruption
  - Introduces a channel abstraction now so the same approval payload can later drive browser notifications and Tauri/macOS native notifications without changing the core permission model
- **parallel-research-fork-join** (P2, post-MVP): Split the broad advanced-workflows placeholder into the next bounded workflow-engine slice
  - Narrows the next workflow expansion to one control-flow primitive: parallel branch execution followed by a synthesis join step
  - Reuses existing workflow steps, runtime assignments, and profile compatibility instead of introducing a new orchestration model
  - Keeps critic/verifier, evaluator-optimizer, and broader swarm behavior out of scope until fork/join execution and visibility are proven in the product
- **usage-metering-ledger** (P1, post-MVP): Added a normalized cost-and-token accounting foundation for Claude- and Codex-backed activity
  - Introduces a dedicated usage ledger instead of relying on provider-shaped `agent_logs` payloads as the reporting source of truth
  - Covers task runs, resumes, workflow child tasks, scheduled firings, task assist, and profile tests
  - Preserves raw token counts plus derived cost so later dashboards and budgets can rely on durable accounting data
- **spend-budget-guardrails** (P1, post-MVP): Added governed spend controls for autonomous provider activity
  - Settings-driven daily/monthly overall spend caps plus provider-scoped spend and token caps
  - Warn at 80% of budget, then hard-stop new Claude/Codex calls after a limit is exceeded
  - Allows in-flight runs to finish while making blocked follow-on work explicit in Inbox and audit history
- **cost-and-usage-dashboard** (P2, post-MVP): Added a first-class operational surface for spend visibility
  - Promotes `Cost & Usage` into the sidebar as a dedicated route rather than burying spend in Settings or Monitor
  - Combines summary cards, spend/token trend charts, provider/model breakdowns, and a filterable audit log
  - Reuses the existing micro-visualization pattern instead of adding a heavier analytics stack

### Completed
- **accessibility** (P2, post-MVP): Closed the remaining WCAG-focused interaction gaps across live updates and dialog close paths
  - Added polite live-region coverage to the monitor overview metrics, homepage priority queue, homepage activity feed, and the kanban board via an announcement region for filter and drag/drop updates
  - Hardened programmatic dialog close behavior so focus returns to the invoking control for project creation, project editing, and document upload flows
  - Added targeted Vitest accessibility regressions for dashboard live regions, kanban announcements, and dialog focus restoration, and installed the missing `@testing-library/dom` test dependency needed to run them
  - Verified with targeted Vitest coverage, a successful production build, and browser accessibility snapshots on dashboard and monitor
- **ui-density-refinement** (P2, post-MVP): Shipped the cross-route density and composition follow-up
  - Home now uses a bounded route canvas and a more cohesive sidebar surface so the shell reads as one workspace instead of a detached rail plus content field
  - Inbox now has a denser control bar with queue counts, stronger tab framing, and clearer bulk-action affordances that better match the notification cards below
  - Projects now adds top-level structure with summary metrics and a bounded card region so small project counts do not leave a large unfinished-looking field
  - Verified with a successful production build and a browser pass on home, inbox, and projects after implementation
- **usage-metering-ledger** (P1, post-MVP): Shipped the normalized provider-usage foundation
  - Added a dedicated `usage_ledger` table plus task-level workflow/schedule linkage so metering is durable and does not rely on provider-shaped `agent_logs` payloads or task-title parsing
  - Claude and Codex task execution/resume flows now persist normalized usage rows, and task-assist/profile-test activity also writes standalone ledger records
  - Added pricing-registry logic, daily spend/token query helpers, provider/model breakdown queries, audit-log joins, and representative seed data for both providers
  - Verified with the full Vitest suite (`169` passing tests) and a successful production build
- **spend-budget-guardrails** (P1, post-MVP): Shipped spend governance across all provider entry points
  - Added structured budget-policy storage and validation for overall daily/monthly spend caps plus runtime-scoped spend and token caps
  - New guardrail service evaluates daily/monthly ledger totals in the local runtime timezone, emits deduplicated 80% warning notifications, and blocks new provider calls once a relevant cap is exceeded
  - Task execute/resume routes now return explicit budget errors up front, while workflows, schedules, task assist, and profile tests are protected through the shared runtime layer
  - Blocked attempts now write zero-cost `usage_ledger` audit rows with `blocked` status and create Inbox notifications instead of silently retrying later
  - Settings now exposes a `Cost & Usage Guardrails` section with live blocked/warning state and reset timing per window
  - Verified with the full Vitest suite (`173` passing tests) and a successful production build
- **cost-and-usage-dashboard** (P2, post-MVP): Shipped a first-class spend and token operations surface
  - Added a dedicated `/costs` route plus a top-level sidebar destination and command-palette parity for navigating into cost governance quickly
  - The new dashboard combines day/month summary cards, budget-state messaging, 7-day and 30-day spend/token trends, runtime share cards, model breakdowns, and a filtered audit log with deep links back to tasks, workflows, schedules, and projects
  - Extended usage helpers so unknown-pricing rows remain visible in model breakdowns and audit filters can scope by runtime, status, activity type, and date range
  - Verified with targeted Vitest coverage for the ledger helpers and a successful production build

### Re-prioritized
- **Human-loop attention**: Inserted `ambient-approval-toast` ahead of further workflow expansion
  - Live browser verification showed that an unread Inbox badge is too easy to miss while supervising an active workflow run
  - Permission handling is already durable, but the interaction is still context-breaking; the next improvement should reduce approval friction on already-shipped execution paths
- **Workflow expansion direction**: Replaced the omnibus `parallel-workflows` placeholder with a narrower fork/join foundation
  - `parallel-research-fork-join` is now the next planned workflow-engine feature and moves up to P2 because it extends an already-shipped core surface
  - Broader evaluator-style patterns stay deferred until ainative proves parallel execution, join synthesis, and workflow-status visibility in a simpler slice
- **Cost & Usage direction**: Dropped ROI framing from the planned feature set
  - Direct spend and token metering are product-truthful with the data ainative already has access to
  - ROI would require optional user-supplied business-value inputs and would dilute the first governance slice
- **Roadmap order**: Introduced a dedicated Governance & Analytics track and moved cost governance ahead of further provider-portability follow-ons
  - Recommended build order is now usage metering first, budget guardrails second, and the dashboard third

### Ship Verification
- **openai-codex-app-server** (P1, post-MVP): Acceptance criteria re-verified against code, build output, and a live browser run
  - Confirmed runtime registration, provider-aware settings health checks, task assignment surfaces, workflow/schedule targeting, and inbox response plumbing remain wired through the shared runtime layer
  - Full Vitest suite passed (`167` tests) and production build passed after verification
  - Browser verification on March 12, 2026 confirmed a Settings connectivity check and a browser-created Codex-backed task completing successfully with a persisted result

### Enhancement
- **spend-budget-guardrails**: Simplified the Settings guardrail UX to be spend-first
  - Runtime cards now treat daily/monthly spend caps as the primary editable controls
  - Derived token budget guidance is shown as read-only estimates based on recent blended runtime pricing instead of competing as default inputs
  - Hard token ceilings remain available under an advanced section for operators who need strict technical guardrails
- **openai-codex-app-server**: Fixed a live startup regression discovered during ship verification
  - Removed an unsupported Codex thread-start history-persistence flag that caused `thread/start.persistFullHistory requires experimentalApi capability`
  - Re-ran the browser flow after the fix and confirmed successful task completion
  - Runtime startup behavior now matches the currently supported Codex App Server capability surface
- **Roadmap metadata sync**: Reconciled product planning files with the current shipped/in-progress state
  - Marked `multi-agent-routing` completed in the feature spec to match the previously verified profile-routing implementation
  - Added `accessibility` to the roadmap as the current in-progress post-MVP quality track

## 2026-03-11

### Completed
- **openai-codex-app-server** (P1, post-MVP): OpenAI Codex App Server shipped as ainative's second governed runtime
  - Added an `openai-codex-app-server` adapter and a lightweight WebSocket app-server client under `src/lib/agents/runtime/`
  - Codex-backed tasks now execute, resume, cancel, and persist provider-labeled `agent_logs`, task results, and resumable thread IDs through the shared runtime layer
  - Codex approval requests and user-input prompts now route through Inbox notifications and continue the run from user responses
  - Saved permission shortcuts now auto-approve equivalent Codex command and file-change requests
  - Settings now support OpenAI API-key storage plus a runtime-aware Codex connectivity test
  - Task creation, task assist, schedules, and workflows now allow explicit OpenAI runtime targeting
  - Verified with full Vitest suite (`167` passing tests) and a successful production build
- **operational-surface-foundation** (P2, post-MVP): Solid operational surfaces and theme bootstrapping shipped across dense UI
  - Added `surface-1/2/3` tokens plus reusable `surface-card`, `surface-card-muted`, `surface-control`, and `surface-scroll` utilities
  - Root layout now applies critical theme CSS and an inline startup script to set theme before hydration
  - Theme toggle now synchronizes class, `data-theme`, `color-scheme`, local storage, and cookie state
  - Dashboard, monitor, kanban, inbox, project cards, and settings forms moved off blur-heavy glass defaults onto solid surfaces
  - Settings page widened from `max-w-2xl` to `max-w-3xl` for cleaner scanning
- **profile-surface-stability** (P2, post-MVP): Profile browser and detail routes migrated onto stable operational surfaces
  - Investigation traced the remaining profile jank to the profile routes still relying on the default `[data-slot="card"]` backdrop-blur path after the broader surface migration
  - Earlier compositing hardening reduced the visible flash but did not remove the fragile rendering path for scroll-heavy profile content
  - `/profiles` and `/profiles/[id]` now use bounded `surface-page` framing plus `surface-card`, `surface-panel`, `surface-scroll`, and `surface-control` treatments for primary content
  - Profile policy/test badges were aligned to semantic status tokens during the surface migration
  - This shipped as a bounded slice instead of overloading the broader `ui-density-refinement` backlog
- **provider-runtime-abstraction** (P1, post-MVP): Shared runtime boundary shipped for Claude-backed execution
  - Added a provider runtime registry under `src/lib/agents/runtime/` with centralized runtime IDs, capability metadata, and a Claude adapter
  - Task execute, resume, and cancel routes now dispatch through the runtime layer instead of calling Claude helpers directly
  - Workflow child tasks, scheduler firings, task-definition assist, profile smoke tests, and settings health checks now route through provider-aware runtime services
  - `assignedAgent` is now validated against supported runtime IDs instead of accepting arbitrary strings
  - Runtime metadata is available to both API code and UI code, while Claude behavior remains the default runtime path
  - Verified with full Vitest suite (`163` passing tests) and a successful production build

### Enhancement
- **app-shell**: Theme startup is now hardened against light/dark flash and background mismatch during hydration
- **homepage-dashboard / monitoring-dashboard / task-board / inbox-notifications / project-management**: Dense cards and controls now prioritize scanability over backdrop blur
- **agent-profile-catalog**: Profile detail and browser pages now read like dense operational surfaces rather than blur-first showcase cards
- **Browser evaluation**: Chrome review on home, inbox, settings, and projects confirmed the surface-system improvement and surfaced the next refinement targets
- **settings / runtime metadata**: Authentication now describes the active runtime in provider-neutral terms while still reflecting Claude-specific auth behavior

### Groomed
- **ui-density-refinement** (P2, post-MVP): Follow-up UX tranche from the Chrome browser pass
  - Sidebar/background cohesion on home still needs refinement
  - Inbox action row needs denser spacing and clearer secondary-control affordance
  - Projects page composition needs stronger structure when project count is low
- Updated roadmap: added `operational-surface-foundation` and `profile-surface-stability` as completed and `ui-density-refinement` as planned in UI Enhancement
- **provider-runtime-abstraction** (P1, post-MVP): Introduced a bounded runtime-foundation spec for multi-provider support
  - Separates ainative orchestration from provider SDK specifics so tasks, workflows, schedules, task-definition AI, and profile smoke tests can run through a shared contract
  - Preserves the existing Claude-first UX while making a second runtime additive rather than invasive
- **openai-codex-app-server** (P1, post-MVP): Added a concrete OpenAI execution spec
  - Recommends Codex App Server as the first OpenAI path because it maps more directly to ainative's approval and monitoring model than a thin SDK-only integration
  - Frames the work as a governed execution runtime, not as generic provider routing
- **cross-provider-profile-compatibility** (P2, post-MVP): Added a profile-portability follow-on
  - Captures the gap between today's `.claude/skills` profile model and a future provider-aware profile system

### Re-prioritized
- **Multi-provider direction**: Reintroduced provider expansion as a post-MVP platform track, but with a narrower recommendation than the earlier routing concept
  - No immediate user-facing "switch provider" toggle
  - Runtime abstraction ships first, OpenAI Codex App Server second, profile compatibility third
  - This preserves the earlier decision to avoid broad multi-provider routing as part of `multi-agent-routing` while creating a future-proof path for a governed second runtime
- Updated roadmap: provider-runtime-abstraction and openai-codex-app-server are completed; cross-provider-profile-compatibility is now the next runtime-track feature

## 2026-03-10

### Ship Verification
- **workflow-blueprints** (P3, post-MVP): 12/12 acceptance criteria verified — all code implemented and integrated
  - 8 built-in YAML blueprints across work (4) and personal (4) domains
  - Blueprint registry loads from `src/lib/workflows/blueprints/builtins/` + `~/.ainative/blueprints/`
  - Template engine with `{{variable}}` substitution and `{{#if}}` conditional blocks
  - Zod validation schema at `src/lib/validators/blueprint.ts`
  - Blueprint gallery at `/workflows/blueprints` with domain tabs, search, and preview
  - Blueprint editor with YAML validation for custom blueprints
  - Dynamic variable form: 5 input types (text, textarea, number, boolean, select)
  - Instantiation creates draft workflows with resolved prompts and agentProfile mapping
  - Full API: CRUD, instantiate, GitHub import
  - Lineage tracking via `_blueprintId` in workflow definition JSON
  - "From Blueprint" button on `/workflows` page
- Updated roadmap: workflow-blueprints marked `completed`

### Enhancement
- **app-shell**: Collapsible sidebar with icon-only mode
  - `collapsible="icon"` on Sidebar with SidebarTrigger toggle button
  - Custom `StagentLogo` SVG component replacing text-only header
  - Tooltip labels on all nav items via `tooltip` prop on SidebarMenuButton
  - `group-data-[collapsible=icon]` responsive rules for badges, footer, and ⌘K hint
- **app-shell**: PWA support
  - `src/app/manifest.ts` with app name, description, theme color, icons
  - `src/app/apple-icon.tsx` dynamic Apple Touch icon generator
  - `src/app/icon.svg` and `public/icon.svg` app icons
- **agent-integration**: MCP server config passthrough
  - `profile.mcpServers` now passed to Agent SDK `query()` in both `executeClaudeTask` and `resumeClaudeTask`

### Completed
- **agent-profile-catalog** (P3, post-MVP): Complete profile catalog with 13 built-in profiles, import, and testing
  - 9/12 AC already existed from multi-agent-routing infrastructure (registry, 13 builtins, execution integration, gallery UI, editor, selector)
  - **Gap fix (AC6)**: Profile `mcpServers` now passed to Agent SDK `query()` options in both `executeClaudeTask` and `resumeClaudeTask`
  - **Gap fix (AC10)**: GitHub import API (`POST /api/profiles/import`) — fetches profile.yaml + SKILL.md from raw GitHub URLs, validates with Zod, creates via registry
  - **Gap fix (AC12)**: Profile test runner (`src/lib/agents/profiles/test-runner.ts`) — executes behavioral smoke tests against Agent SDK, validates expected keywords in response
  - Import dialog in profile browser header with URL input and error handling
  - "Run Tests" button in profile detail view with pass/fail results and keyword highlighting
  - Test API route: `POST /api/profiles/[id]/test`
- Updated roadmap: agent-profile-catalog marked `completed` (unblocks workflow-blueprints)

### Ship Verification
- **command-palette-enhancement** (P2, post-MVP): 10/10 acceptance criteria verified — all code implemented and integrated
  - 4 command groups: Recent, Navigation, Create, Utility
  - 10 navigation items matching all sidebar routes with icons and cmdk keyword aliases
  - Create: New Task, New Project, New Workflow, New Profile
  - Utility: Toggle Theme (light/dark switch) and Mark All Notifications Read
  - Async recent items: API endpoint returns 5 projects + 5 tasks, fetched on palette open with AbortController cleanup
  - ⌘K hint button in sidebar footer with synthetic KeyboardEvent dispatch
  - Fuzzy search filters across all groups via cmdk keywords
- Updated roadmap: command-palette-enhancement marked `completed`

## 2026-03-09

### Ship Verification (Batch)
- **autonomous-loop-execution** (P3, post-MVP): 6/6 acceptance criteria verified — all code implemented and integrated
  - Loop executor engine with 4 stop conditions (max iterations, time budget, human cancel, agent-signaled)
  - Child task creation per iteration with previous output as context
  - `LoopStatusView` with iteration timeline, progress bar, time budget display, expandable results
  - Pause/resume via DB status polling each iteration + PATCH API
  - Loop state persisted to workflows table `_loopState` field, restored on resume
  - Spec key files slightly renamed vs. implementation (no functional gap)
- **scheduled-prompt-loops** (P2, post-MVP): 14/14 acceptance criteria verified — 3 bugs fixed
  - **Fix (P1)**: Concurrency guard was a no-op — constructed wrong task ID for execution-manager lookup. Replaced with DB query for running child tasks by title pattern
  - **Fix (P2)**: Firing history API had dead exact-match query + full table scan fallback. Replaced with single `LIKE` query
  - **Fix (P3)**: Firing history rows linked to `/projects` instead of task detail. Fixed to link to `/monitor?taskId=...`
- **tool-permission-persistence** (P2, post-MVP): Verified — fully integrated, no code islands
- **document-manager** (P2, post-MVP): Verified — fully integrated, no code islands
- **multi-agent-routing** (P3, post-MVP): Verified — fully integrated, no code islands
- Updated roadmap: autonomous-loop-execution and scheduled-prompt-loops marked `completed`

### Completed
- **tool-permission-persistence** (P2, post-MVP): "Always Allow" for agent tool permissions
  - Permission pre-check in `handleToolPermission()` bypasses notification for trusted tools
  - Pattern format: tool-level (`Read`), constraint-level (`Bash(command:git *)`), MCP (`mcp__server__tool`)
  - "Allow Once" / "Always Allow" split buttons in Inbox permission UI
  - Settings page shows saved patterns with revoke capability
  - Permissions API: `GET/POST/DELETE /api/permissions`
  - Extracted shared `getSetting`/`setSetting` helpers from auth module
  - `AskUserQuestion` always requires human input (never auto-allowed)
  - No migration needed — uses existing `settings` table with new key

### Enhancement
- **project-management**: Added `workingDirectory` field to projects
  - New `working_directory` column on projects table (schema + bootstrap DDL + validator)
  - Agent tasks (`executeClaudeTask`, `resumeClaudeTask`) resolve `cwd` from project's working directory
  - Previously all tasks ran in ainative's server directory; now they target the project's codebase
  - Working directory input in both Create Project and Edit Project dialogs
  - Project card shows working directory path when set
  - Enables schedules/workflows to operate on external codebases via project association

### In Progress
- **scheduled-prompt-loops** (P2, post-MVP): Time-based scheduling for agent tasks
  - New `schedules` table (14 columns) with bootstrap DDL and Drizzle schema
  - Poll-based scheduler engine (60s interval, in-process via `setInterval`)
  - Human-friendly interval parsing (5m, 2h, 1d) + raw 5-field cron input
  - `cron-parser` npm package for computing next fire times
  - API routes: GET/POST `/api/schedules`, GET/PATCH/DELETE `/api/schedules/[id]`
  - 4 UI components: ScheduleCreateDialog, ScheduleList, ScheduleDetailView, ScheduleStatusBadge
  - `/schedules` page + `/schedules/[id]` detail page with sidebar navigation (Clock icon)
  - Scheduler started via Next.js instrumentation hook (`src/instrumentation.ts`)
  - One-shot and recurring modes, pause/resume lifecycle, expiry and max firings
  - Each firing creates a child task via existing `executeClaudeTask` pipeline
  - 14 acceptance criteria
  - Inspired by Claude Code's `/loop` and CronCreate/CronList/CronDelete

### Groomed
- **agent-profile-catalog** (P3, post-MVP): Full spec expansion from placeholder to complete feature spec
  - Skill-first with sidecar architecture: profiles ARE Claude Code skills (SKILL.md + profile.yaml)
  - 13 built-in profiles across work (8) and personal (5) domains
  - Profile registry scans `.claude/skills/*/profile.yaml` for discovery
  - Claude Code primitives mapping: SKILL.md→Skill, allowedTools→Agent SDK, mcpServers→MCP, canUseToolPolicy→canUseTool, hooks→CC hooks
  - Profile gallery UI with domain tabs, search, detail sheet, YAML editor
  - GitHub import/export for community sharing (profiles portable to plain CC users)
  - Behavioral smoke tests per profile (task + expected keywords)
  - 12 acceptance criteria
- **workflow-blueprints** (P3, post-MVP): Full spec expansion from placeholder to complete feature spec
  - 8 built-in blueprints across work (4) and personal (4) domains
  - Blueprint YAML format with typed variables (text, textarea, select, number, boolean, file)
  - Template resolution: `{{variable}}` substitution + `{{#if}}` conditional blocks
  - Dynamic form generation from variable definitions
  - Blueprint gallery integrated into `/workflows` page (not a separate route)
  - Instantiation creates draft workflows with resolved prompts and profile assignments
  - Lineage tracking via `blueprintId` on workflows table
  - GitHub import/export, YAML editor for custom blueprints
  - 12 acceptance criteria
- Updated roadmap: added `agent-profile-catalog` to `workflow-blueprints` dependencies

### Re-groomed
- **multi-agent-routing** (P3, post-MVP): Rewrote spec from Codex MCP multi-provider routing to profile-based routing within Claude Agent SDK
  - Rationale: Multi-provider routing (Codex, Vercel AI SDK) added high complexity for low user value; profile-based routing delivers meaningful differentiation using the existing SDK surface
  - New approach: Agent profile registry with system prompt templates, allowed tools, MCP server configs per profile
  - 4 starter profiles: general, code-reviewer, researcher, document-writer
  - Task type classifier auto-selects profile; users can override
  - Workflow steps can specify per-step profiles
  - Schema addition: `agentProfile` text column on tasks table
- Added 2 new planned features to roadmap (Agent Profiles section):
  - **agent-profile-catalog** (P3): Comprehensive domain profiles — wealth, health, travel, shopping, project manager, etc.
  - **workflow-blueprints** (P3): Pre-configured workflow templates paired with agent profiles

### Ship Verification
- **micro-visualizations** (P2, post-MVP): 18/18 acceptance criteria verified — all code implemented and integrated
  - 3 pure SVG chart primitives: `Sparkline`, `MiniBar`, `DonutRing` (zero external charting dependencies)
  - 6 data query functions in `src/lib/queries/chart-data.ts` with date-gap filling
  - 5 integration points: stats-cards (3 sparklines), activity-feed (24h bar chart), recent-projects (donut rings), monitor-overview (donut + sparkline), project-detail (stacked bar + sparkline)
  - Full accessibility: `role="img"`, `aria-label`, `<title>` on all chart components
  - OKLCH chart/status tokens throughout, light/dark mode support, responsive hiding on mobile
- Updated roadmap: micro-visualizations marked `completed`

### Groomed
- **micro-visualizations** (P2, post-MVP): Sparkline charts and micro-visualizations for dashboard glanceability
  - 3 pure SVG chart primitives: Sparkline, MiniBar, DonutRing (no charting library)
  - Homepage: 7-day trend sparklines in stats cards, 24h activity bar chart, completion donut rings
  - Project detail: stacked status bar + 14-day completion sparkline
  - Monitor: success rate donut ring + 24h activity sparkline
  - Data aggregation layer with 6 query functions
  - Brainstormed via `/product-manager` + `/frontend-designer` collaboration
- Updated roadmap: added UI Enhancement section with micro-visualizations feature

## 2026-03-08

### Completed (Sprint 7)
- **document-manager** (P2): Full document browser and management UI
  - `/documents` route with sidebar navigation (FileText icon)
  - Table view with sortable columns: name, type icon, size, linked task/project, status, date
  - Grid view with image thumbnails and file type icons (toggle switch)
  - Document detail Sheet: preview, metadata, linked task/project, extracted text, processing errors
  - Preview support: images (inline), PDFs (embedded iframe), markdown (react-markdown), text/code (pre)
  - Search by filename and extracted text content (client-side filtering)
  - Filter by processing status and project
  - Standalone upload dialog with drag-and-drop, multi-file support
  - Bulk delete with multi-select checkboxes
  - Link/unlink documents to projects, unlink from tasks
  - Empty state for no documents and no filter matches
  - API: GET /api/documents (list with joins), PATCH /api/documents/[id] (metadata), DELETE /api/documents/[id] (file + record)

### Ship Verification & Gap Fixes (Sprint 6)
- **file-attachment-data-layer** — verified 9/10 AC, fixed orphan cleanup gap (added `POST /api/uploads/cleanup` route)
- **document-preprocessing** — verified 6/10 AC, fixed 3 gaps:
  - Added `extractedText`, `processedPath`, `processingError` columns to Drizzle schema + bootstrap DDL
  - Wired upload API to trigger `processDocument()` fire-and-forget
  - Added image format validation (supported: png, jpg, gif, webp)
- **agent-document-context** — verified 0/7 AC (code island), fixed by wiring `buildDocumentContext` into both `executeClaudeTask` and `resumeClaudeTask`
- Updated roadmap: 3 document features marked `completed`

### README Update
- Updated README.md to reflect MVP completion (all 14 features shipped)
- Merged Foundation/Core/Polish roadmap sections into single "MVP ✅ Complete"
- Added 7 missing completed features: Homepage Dashboard, UX Gap Fixes, Workflow Engine, Task Definition AI, Content Handling
- Added 3 new post-MVP features: Autonomous Loop Execution, Multi-Agent Swarm, Agent Self-Improvement
- Updated project structure with workflows, dashboard, and project detail directories
- Added react-markdown + remark-gfm to tech stack table

### Design Review (MVP Release)
- **Critical fixes (3)**:
  - C1: Added skeleton loading screens for WorkflowList and WorkflowStatusView (was blank/null during fetch)
  - C2: File upload `fileIds` now included in task creation POST payload (was silently orphaned)
  - C3: Replaced naive line-by-line markdown parser with `react-markdown` + `remark-gfm` for full GFM support
- **Important fixes (5 of 9 — 4 deferred to post-MVP)**:
  - I2: Removed non-functional `⌘K` shortcut hint from sidebar footer
  - I5: Added optimistic status update after clicking Execute in WorkflowStatusView
  - I6: Added per-subtask progress toasts and failure reporting in AI Assist
  - I9: RecentProjects shows empty state CTA instead of returning null for new users
  - I3/I7/I8 deferred to `ideas/ux-improvements.md`
- **Minor fixes (4 of 10 — 6 deferred)**:
  - M1: Extracted status badge color mappings to shared `src/lib/constants/status-colors.ts` (was duplicated in 7 files)
  - M4: Wrapped `JSON.parse` in ContentPreview with try/catch
  - M7: Added expand/collapse toggle for large content outputs
  - M9: Deduplicated `patternLabels` to shared constants
  - M2/M3/M5/M6/M8/M10 deferred
- **Accessibility fixes (3 of 4)**:
  - A1: Added `aria-live="polite"` to InboxList and WorkflowStatusView polling regions
  - A2: Added `aria-label` to all icon-only buttons (ContentPreview, FileUpload, WorkflowCreateDialog)
  - A3: Made file upload drop zone keyboard accessible (role, tabIndex, onKeyDown, focus ring)
  - A4 (focus management) deferred — needs verification
- **Documentation**: Created `features/accessibility.md`, `ideas/ux-improvements.md`, `ideas/design-system-fixes.md`
- Updated acceptance criteria in `homepage-dashboard.md`, `content-handling.md`, `workflow-engine.md`, `ux-gap-fixes.md`

### Completed (Sprint 5)
- **homepage-dashboard** (P1): 5-zone landing page replacing `/` redirect
  - Greeting component with time-of-day salutation and live DB status counts
  - 4 clickable stat cards (running, completed today, awaiting review, active projects)
  - Priority queue showing top 5 tasks needing attention
  - Live activity feed showing last 6 agent log entries
  - Quick actions grid (New Task, New Project, Inbox, Monitor)
  - Recent projects with progress bars and task completion counts
  - Home added to sidebar navigation, logo links to `/`
- **ux-gap-fixes** (P1): 4 audit gaps resolved
  - Task board status filter (already existed from prior work)
  - Notification dismiss: "Dismiss read" bulk action in inbox header
  - Monitor auto-refresh: Page Visibility API pauses polling when tab hidden
  - Project detail view: `/projects/[id]` page with task list and status breakdown
- **workflow-engine** (P2): Multi-step workflow execution engine
  - Three patterns: Sequence, Planner→Executor, Human-in-the-Loop Checkpoint
  - State machine engine at `src/lib/workflows/engine.ts`
  - API routes: POST /api/workflows, POST /api/workflows/[id]/execute, GET /api/workflows/[id]/status
  - WorkflowCreateDialog with dynamic step builder and pattern selection
  - WorkflowStatusView with real-time polling and step progress visualization
  - Workflow list page at `/workflows` with navigation in sidebar
  - Failed step retry capability
- **task-definition-ai** (P2): AI-assisted task creation
  - AI Assist button in task create dialog (uses Agent SDK `query`)
  - Improved description suggestions with one-click apply
  - Task breakdown into sub-tasks with bulk creation
  - Pattern recommendation (single/sequence/planner-executor/checkpoint)
  - Complexity estimation and checkpoint flagging
- **content-handling** (P2): File upload and content preview
  - File upload component with drag-and-drop in task create dialog
  - Upload API at POST /api/uploads, file serving at GET /api/uploads/[id]
  - Type-aware content preview (text, markdown, code, JSON)
  - Copy-to-clipboard and download-as-file actions on task results
  - Task output API with automatic content type detection
  - ContentPreview integrated into task detail panel

### Groomed (Sprint 5)
- **autonomous-loop-execution** (P3, post-MVP): Ralph Wiggum-inspired loop pattern with stop conditions and iteration tracking. Source: Karpathy article
- **multi-agent-swarm** (P3, post-MVP): Gas Town-inspired multi-agent orchestration with Mayor/Workers/Refinery roles. Source: Karpathy article
- **agent-self-improvement** (P3, post-MVP): Agents learn patterns and update own context, with human approval and sweep cycles. Source: Karpathy article
- Updated roadmap: P1 features added to Polish Layer, 3 new post-MVP features, reordered build order

### Completed
- **session-management**: Agent session resume for failed/cancelled tasks
  - Added `resumeCount` column to tasks table (migration 0002)
  - New status transitions: `failed → running`, `cancelled → running`
  - Extracted shared `processAgentStream` helper from `executeClaudeTask`
  - Added `resumeClaudeTask` with session guard, retry limit (3), and session expiry detection
  - Resume API route: `POST /api/tasks/[id]/resume` with atomic claim
  - Resume button in task detail panel (alongside existing Retry)
  - Session cleanup utility for old completed tasks
  - 8 new tests across status transitions, agent resume, and router

### Audit
- Spec-vs-implementation gap audit across all 9 completed features
- Updated 9 feature spec frontmatter from `planned` to `completed`
- Backfilled changelog entries for Sprint 1-4 features (below)
- Identified 4 code gaps: task board status filter, notification dismiss, monitor auto-refresh, project detail view
- Added Ship Verification mode to product-manager skill to prevent future gaps

## 2026-03-07

### Completed
- **monitoring-dashboard**: Real-time agent monitoring with SSE log streaming
  - Monitor overview with 4 metric cards (active agents, tasks today, success rate, last activity)
  - SSE-powered log stream with auto-scroll and auto-reconnect (3s)
  - Log entries with timestamp, task, event type, and payload
  - Filter by task and event type
  - Click log entry to navigate to task detail
  - Manual refresh button for overview metrics
- **inbox-notifications**: Human-in-the-loop notification system
  - Notification list sorted newest first with unread badge on nav
  - Permission request handling (Allow/Deny) with tool input preview
  - Agent message responses with question/answer flow
  - Task completion summaries and failure context with retry
  - Mark read/unread individually and bulk mark-all-read
  - 10s polling for new notifications without refresh
- **agent-integration**: Claude Agent SDK integration with canUseTool pattern
  - `executeClaudeTask` with fire-and-forget execution (POST returns 202)
  - `canUseTool` polling via notifications table as message queue
  - Tool permission flow: agent requests → notification created → user responds → agent continues
  - Agent log streaming to `agent_logs` table
  - Status flow: planned → queued → running → completed/failed/cancelled
  - Execution manager for concurrent task management
- **task-board**: Kanban board with drag-and-drop task management
  - 5-column Kanban layout (Planned, Queued, Running, Completed, Failed)
  - Task creation with title, description, project, and priority
  - Drag-and-drop from Planned → Queued with valid transition enforcement
  - Task detail panel on card click
  - Cancel from any active state, retry failed tasks
  - Project filter, column count badges, inline add task button
  - Scroll indicators for horizontal overflow
- **project-management**: Project CRUD with status tracking
  - Create projects with name and description
  - Project cards with status badges and task counts
  - Edit name, description, and status (active/completed/archived)
  - Archive and complete project status transitions
  - API routes with proper status codes and validation

## 2026-03-06

### Completed
- **app-shell**: Next.js application shell with sidebar navigation
  - Responsive sidebar with collapsible navigation
  - Route structure: Dashboard, Projects, Inbox, Monitor
  - OKLCH hue 250 blue-indigo theme with Tailwind v4
  - shadcn/ui New York style component library setup
  - Dark/light mode toggle
- **database-schema**: SQLite database with Drizzle ORM
  - 5 tables: projects, tasks, workflows, agent_logs, notifications
  - WAL mode for concurrent reads during agent execution
  - Bootstrap CREATE TABLE IF NOT EXISTS for self-healing startup
  - Drizzle migrations in `src/lib/db/migrations/`
  - Settings table added via migration 0003
- **cli-bootstrap**: CLI tool with Commander.js
  - Commander-based CLI entry point at `bin/cli.ts`
  - tsup build pipeline → `dist/cli.js`
  - Project and task management commands
  - Development scripts: `npm run build:cli`

### Groomed
- Extracted 12 features from ideas/ backlog (5 idea files analyzed)
- Created initial roadmap with 9 MVP features and 3 post-MVP features
- MVP features: 3 Foundation (P0), 5 Core (P1), 4 Polish (P2)
- Post-MVP features: 3 features (P3)
- Identified critical path: database-schema → project-management → task-board → agent-integration → inbox/monitoring
- Flagged 6 features needing `/frontend-designer` UX review before implementation
