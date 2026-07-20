# Guided DigitalOcean Relay Host beta implementation plan

Authoritative specification: `features/guided-digitalocean-beta.md`

## Scope challenge

- **REDUCE — documentation-only beta:** rejected. Public `0.44.5` lacks the
  three G-085 fixes and a guide cannot make those runtime defects safe.
- **PROCEED — guided beta:** selected by the operator. Ship the fixes, honest
  Settings guidance, login-brand repair, customer runbook, synchronized assets
  and a fresh public-artifact DigitalOcean receipt.
- **EXPAND — one-click provisioning:** deferred. Provider credential custody,
  resource lifecycle UI and Marketplace fulfillment are independent product and
  security decisions owned by G-103 and follow-on goals.

## What already exists

- G-085's tested, resumable provider/live harness and accepted SFO3 receipt.
- G-081 authenticated ingress, G-082 recovery, G-083 supervisor and G-084
  Local Device/Cloud Server Preview UI.
- Coupled Cell-first/npm-second release workflows and authority guards.
- Generic Host, Cell, ingress, OCI and recovery documentation.
- `HostDeploymentSection`, its component tests and current preview contract.
- `AccessCard` and shared brand components; the defect is specific to production
  asset delivery and must be reproduced against the prebuilt path.
- Permanent customer-identical staging and strict `_ASSETS` pipeline.

## Affected surfaces

- `src/components/settings/host-deployment-section.tsx` and tests.
- `src/components/auth/access-card.tsx`, shared brand asset delivery and tests.
- Prebuilt-artifact creation/customer smoke if the reproduction confirms the
  public brand directory is absent at runtime.
- `docs/digitalocean-relay-host.md`, README and existing Host/Cell docs.
- `_ASSETS` catalog, journeys, capture targets, screenshots, guides, trackers,
  API/demo outputs and flow receipt.
- Release version/Cell authority, staging evidence and canonical handoff.

## Vertical slices

### 1. Reproduce and protect the customer entry defects

- Build the current production artifact and run the customer-identical staging
  server from an empty non-git directory.
- Record the login mark request/status and stale Settings language before fixing.
- Add the lowest reliable regression for the selected brand-delivery repair and
  component assertions for the three distinct deployment states.

### 2. Implement the guided customer path

- Add a prominent, external-link-indicated DigitalOcean guide action without
  converting Preview into a provider mutation.
- Replace stale G-085 future-tense copy with bounded validated-beta language.
- Author the version-neutral guide using immutable release placeholders where
  commands read current package authority, not copied mutable tags.
- Link the guide from README and relevant Host documentation.

### 3. Release-candidate closure

- Run targeted component/auth/prebuilt/Host tests, TypeScript, public-boundary,
  docs, npm closure, Host authority, build and production staging.
- Bump the patch version only after the working tree is coherent and the
  operator authorizes release preparation.
- Follow the Cell-first publication order; bind the accepted digest before the
  npm/GitHub tag.

### 4. Fresh real-provider staging

- Create a new disposable DigitalOcean run from the public release only.
- Run the shortened G-085 customer journey emphasizing the three repaired paths,
  production login asset, recovery and exact cleanup.
- Revoke token/key and reconcile the bounded charge.

### 5. Assets and Website handoff

- Update catalog/journey coverage first, then capture changed Settings/login
  states, sync only dirty guides, refresh API/demo trackers and run strict flow.
- Reconcile the canonical Strategy handoff and Website G-047 inputs with the
  exact public release and receipt.

## Specification and acceptance mapping

| Acceptance criterion | Slice | Evidence |
|---|---|---|
| Customer runbook | 2 | doc-link and command/source audit |
| Truthful Settings states | 1-2 | component tests plus browser evidence |
| Production login brand | 1, 4 | prebuilt HTTP/network regression and browser capture |
| Three G-085 fixes | 3-4 | Host regressions plus public-artifact live proof |
| Coupled signed release | 3 | Cell/npm/GitHub authority receipts |
| Fresh DigitalOcean run | 4 | redacted run receipt and zero inventory |
| `_ASSETS` current | 5 | strict `fullyVerified: true` report |
| Website handoff | 5 | canonical responsibility/takeover tables |

## Regression test budget

- Update `host-deployment-section.test.tsx` for validated guided-beta copy,
  guide destination, external-link semantics and unchanged preview no-token
  contract.
- Add/extend auth/prebuilt tests to fail when the production login's mark cannot
  be served from the installed package/effective Next root.
- Retain and run G-085's 24 provider tests and the full Relay Host suite.
- Run `npx tsc --noEmit`, `npm run build`, `npm run check:doc-links`,
  `npm run check:public-boundary`, `npm run check:host-cell-release-authority`,
  npm closure and release workflows' local deterministic gates.
- Run permanent staging from a packed tarball before publication, then a fresh
  public-artifact DigitalOcean browser/runtime journey after publication.
- Run strict screenshot/docs/API/demo/asset-flow gates with no skipped stage.

## Error and rescue registry

| Failure | Named outcome | Rescue |
|---|---|---|
| Login asset still 404s | `GUIDED_BETA_BRAND_FAILED` | repair artifact/root delivery; do not hide with browser cache |
| Guide command differs from source | `GUIDED_BETA_GUIDE_DRIFT` | derive from CLI/runtime source and rerun command audit |
| Release mismatch/signature failure | `GUIDED_BETA_RELEASE_BLOCKED` | publish nothing further; repair Cell authority first |
| Packed staging fails | `GUIDED_BETA_STAGING_FAILED` | fix on main, rebuild/repack, rerun from empty root |
| Provider auth/spend unavailable | `GUIDED_BETA_PROVIDER_GATED` | stop before mutation; preserve local release candidate |
| Live recovery/isolation fails | `GUIDED_BETA_CONFORMANCE_FAILED` | reject launch, teardown, repair and issue a new release |
| Cleanup residue | `GUIDED_BETA_CLEANUP_INCOMPLETE` | enumerate exact IDs, retry bounded teardown, keep launch blocked |
| Asset pipeline skips/fails | `GUIDED_BETA_ASSETS_INCOMPLETE` | repair only the failed stage and rerun strict flow |

## Rescue and rollback

- The last public `0.44.5` Host/Cell pair remains the rollback authority until
  the new pair passes public staging.
- Never move tags. A failed candidate receives a new patch version.
- Keep Website launch dark on any mismatch; the accepted local/manual Host path
  remains available and existing Cells continue running.
- Provider resources are label-scoped and destroyed before credentials are
  revoked; customer data is exported before destructive repair.
