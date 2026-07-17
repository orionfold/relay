---
title: G-093 Relay Cell OCI optimization implementation plan
status: completed
goal: G-093
specification: features/relay-host-oci-image-optimization.md
date: 2026-07-16
---

# G-093 implementation plan

## Scope challenge

- **REDUCE:** only add more `.dockerignore` patterns. Rejected because it would
  shrink today's checkout but would not explain or enforce future OCI contents,
  reproducibility, component drift or security policy.
- **PROCEED as-is:** constrain the build boundary and productize the accepted
  G-080 pipeline with measured policies and evidence. Selected by the operator's
  explicit instruction to complete the approved goal.
- **EXPAND:** publish multi-architecture images or add registry signing.
  Deferred because each changes external authority and is not required to
  prove the R1 local Cell image on a Relay Host. The measured implementation did select a
  digest-pinned distroless Node runtime after it passed native, health,
  non-root/read-only, TLS, SBOM and full lifecycle conformance.

## NOT in scope

- OCI push, registry/GitHub Release publication, version bump or external
  signing; all remain operator-gated downstream actions.
- Multi-architecture publication. The Dockerfile and policy are architecture
  neutral for Linux arm64/amd64, but only arm64 is accepted by this goal.
- amd64 publication, paid licensing, ingress, recovery transport, supervisor UX
  or provider provisioning; these belong to later Host increments.
- npm package optimization; npm receives only an independent sub-10-MB guard.
- Removal of runtime capabilities merely to save bytes.

## What already exists

- `Dockerfile.relay-host` supplies the pinned multi-stage build, non-root UID,
  healthcheck and explicit runtime asset copies.
- `next.config.mjs` already gates standalone output to OCI builds.
- `scripts/build-relay-host-artifact.mjs` already produces loaded and OCI
  exporters, an SBOM and a signed manifest.
- `scripts/lib/relay-host-manifest.mjs` supplies canonical JSON, SHA-256,
  Ed25519 signatures and named manifest failures.
- `scripts/relay-host-smoke.mjs` is the accepted two-cell/native/persistence/
  signal/snapshot/export/upgrade/rollback conformance fixture.
- `.github/workflows/relay-host-contract.yml` is the non-publishing CI lane.
- The root `tar` dependency can parse OCI and compressed layer archives without
  introducing another archive library.

## Specification and acceptance mapping

| Acceptance requirement | Implementation slice |
|---|---|
| No forbidden repository/tooling surfaces | explicit Docker build copies, trace exclusions and real OCI content policy |
| Explain layers/paths and enforce 300 MB/60% | OCI index/layer reader plus deterministic size, top-level, largest-file and footprint receipts |
| Attributable components and zero unapproved high/critical | CycloneDX attribution report plus checksum-pinned Trivy policy |
| Cached/no-cache semantics | second clean no-cache OCI exporter and exact platform/path inventory comparison; compiled-content digests remain diagnostic |
| One local/CI command and stable bundle | `npm run host:artifact:build` orchestrator and version/platform output layout |
| Named failure taxonomy | typed artifact-policy error codes and seeded CLI fixtures |
| Manifest/signature/checksum integrity | extend signed release inputs and emit checksum/summary receipts |
| Preserve complete Host behavior | run existing G-080 targeted suite and full Docker smoke against optimized tag |
| npm remains independent | real `npm pack` byte/content receipt with 10 MB ceiling |
| Future promotion without rebuild | summary records immutable digest and explicitly records `publication: none` |

## Vertical slices

1. **Constrain the runtime closure.** Replace broad Docker build copying with
   explicit source/config inputs, strengthen `.dockerignore`, and add OCI-only
   trace exclusions. Build once and measure the essential runtime floor.
2. **Inspect shipped bytes.** Add an OCI layout/layer reader, versioned policy,
   deterministic inventory and forbidden-fixture tests. Enforce total/layer/
   footprint/native/archive budgets against the real archive.
3. **Bind supply-chain evidence.** Generate component attribution,
   vulnerability SARIF/policy, reproducibility comparison, checksums and a
   parseable summary; bind policy/base/lock inputs into the signed manifest.
4. **Productize the entrypoint.** Add the stable version/platform wrapper and
   make CI invoke the same command without publishing.
5. **Re-prove G-080.** Run targeted tests, the optimized full Host smoke, npm
   boundary, static/build checks and broader regressions; record receipts and
   advance the R1 workstream only on acceptance.

## Regression test budget

| Behavior/risk | Protecting test or evidence |
|---|---|
| OCI parser rejects missing/invalid index, manifest and layer blobs | new `scripts/relay-host-artifact-policy.test.mjs` fixtures |
| forbidden paths and nested distributions fail closed | seeded synthetic OCI layers in the policy test |
| budgets and named errors | size, largest-layer, vulnerability, version/base, cache and digest fixtures |
| deterministic inventories/checksums | repeated fixture analysis deep-equality test |
| signed manifest input evolution | extend `scripts/relay-host-manifest.test.mjs` negative matrix |
| native SQLite/PDF and health/shutdown | existing `npm run test:relay-host` |
| real runtime/container controls and lifecycle | optimized `npm run host:artifact:build` / G-080 Docker smoke |
| npm separation | real `npm pack` measurement and public-boundary scan |
| broader application regression | TypeScript, production build and full Vitest suite |

Verification order: new Node policy tests; manifest and targeted Host tests;
artifact build and policy receipts; cached/no-cache identity; complete Docker
smoke; npm pack/public boundary; type/build/doc checks; full suite. No browser
step is budgeted because G-093 has no changed UI; the customer-identical runtime
evidence is stronger and G-025 remains the release gate.

## Error & Rescue Registry

| Failure | Named outcome | Rescue |
|---|---|---|
| forbidden shipped path/archive | `OCI_CONTENT_POLICY_FAILED` | fix build/trace boundary; never add an unexplained blanket exception |
| image/footprint/layer exceeds budget | `OCI_SIZE_BUDGET_EXCEEDED` | inspect receipt; revise ceiling only with operator-approved essential-floor evidence |
| component cannot be attributed | `SBOM_COMPONENT_UNATTRIBUTED` | add a specific runtime source classification or remove leaked package |
| critical/high vulnerability found | `VULNERABILITY_POLICY_FAILED` | update dependency/base or record a separately approved time-bounded exception |
| cached/no-cache runtime inventories differ | `BUILD_SEMANTIC_MISMATCH` | remove nondeterministic/cache-sensitive inputs and rebuild clean |
| source/version/base/policy inputs missing or inconsistent | `ARTIFACT_INPUT_*` | fail before signing; derive again from authoritative files |
| signature/checksum differs | existing manifest digest/signature errors | discard bundle and rebuild from verified inputs |
| required runtime capability fails | G-080 named smoke failure | roll back optimization; keep accepted G-080 artifact contract |
| Docker/Scout unavailable | `ARTIFACT_TOOL_UNAVAILABLE` | emit prerequisite failure; do not silently skip a release-profile gate |

## Rescue and rollback

The npm/local path is unchanged. Keep the accepted G-080 code and receipt in git
history until the optimized artifact passes the full conformance suite. If two
different trace-boundary approaches still require broad repository inclusion,
stop with the path inventory and split the dynamic runtime access contract into
a prerequisite goal. Any byte-saving change that loses a native/runtime feature,
weakens isolation, downloads silently or changes cached/no-cache runtime
semantics is reverted rather than waived.

## Completion receipt

All five vertical slices completed on 2026-07-17. The canonical arm64 image is
129,913,772 bytes (85.40% below baseline), has 5,196 runtime files and 60
attributed SBOM components, and passes the zero-high/critical policy. The
operator approved exact platform/path/mode/link inventory as the reproducibility
gate because Webpack compilation can vary content hashes without changing the
runtime surface. The final Host conformance and all broader regressions passed;
G-025 remains the next customer-identical release-train gate.
