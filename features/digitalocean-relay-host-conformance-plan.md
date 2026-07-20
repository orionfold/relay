# G-085 DigitalOcean Relay Host conformance plan

Status: completed and accepted 2026-07-20. The execution receipt is recorded in
`features/digitalocean-relay-host-conformance.md`; redacted local evidence is
under `output/g085/20260720a/`.

Authoritative specification:
`features/digitalocean-relay-host-conformance.md`

Parent architecture:
`features/licensed-self-service-cloud-deploy.md` and
`features/licensed-self-service-cloud-deploy-plan.md`

## Scope challenge

- **REDUCE — one-off manual VM smoke:** rejected. It would not prove repeatable
  provisioning, deterministic cleanup, recovery or provider parity.
- **PROCEED — bounded provider conformance harness and one disposable live run:**
  selected. It reuses the released Host/Cell contracts, keeps DigitalOcean logic
  outside Relay Core and records browser-visible evidence at each mutation.
- **EXPAND — self-service DigitalOcean authorization and production deploy UI:**
  deferred. It changes credential custody, support posture and product scope.

## What already exists

- G-083 supplies the npm Host supervisor, content-free registry, entitlement and
  Docker Cell lifecycle contract.
- G-081 supplies authenticated ingress and G-082 supplies provider-neutral
  encrypted recovery/export.
- G-084 supplies the licensed Local Device and deterministic Cloud Server Preview
  journey; its fake provider intentionally creates no resource.
- G-094 supplies the public signed multi-architecture Cell image and immutable
  digest policy.
- G-100/G-101 and `scripts/staging/host-cell-release-candidate.mjs` supply the
  closest customer-identical ingress/recovery/release-candidate proof.
- `src/lib/agents/runtime/provider-endpoint.ts` supplies remote/runtime URL and
  insecure-HTTP controls.
- The operator has approved the DigitalOcean account, minimum practical token
  scopes, SFO3 target, 2 vCPU/4 GiB size, disposable hostname, $10 billing alert,
  same-session teardown and external mutations in this bounded plan.

## Affected surfaces

- New script-level DigitalOcean adapter and state/receipt schemas under
  `scripts/lib/`; no provider import enters Relay Core or the Settings preview.
- New staged CLI under `scripts/` for plan, inventory, apply stage, verify stage
  and destroy.
- Cloud-init/system-service templates under `scripts/fixtures/` or generated from
  content-free inputs.
- Targeted unit tests with a fake DigitalOcean HTTP server plus deterministic
  state/resume/cleanup fixtures.
- Operator and customer runbook under `docs/`, updated release manifest evidence,
  `_ASSETS/` only if shipped behavior or screenshots change.
- Canonical `_IDEAS/backlog.md`, workstream status and Website handoff after live
  evidence; strategy-repo changes remain a separate commit boundary.

## Vertical slices

### 1. Release and account preflight

- Verify GitHub/npm version parity, prebuilt assets, SBOM, checksum and exact
  signed Cell digest.
- Validate token scopes without printing the token, region/size availability,
  limits, billing alert and empty labelled inventory.
- Record the immutable execution manifest and estimated maximum charge.

### 2. Provider harness and deterministic tests

- Implement typed request errors, bounded retries, pagination and secret
  redaction for DigitalOcean API v2.
- Implement label-scoped SSH key, firewall, reserved IP, volume and Droplet
  stages with persisted non-secret IDs and idempotent resume.
- Implement reverse-order teardown and zero-orphan inventory.
- Test nil/empty/upstream-error paths, timeouts, 401/403/404/409/422/429/5xx,
  partial creation, replay, teardown failure and unexpected foreign resources.

### 3. Operator-visible resource creation

- Follow the browser walkthrough in the specification one stage at a time.
- Generate a disposable local key, create network/storage/compute resources and
  preserve redacted receipts after every stage.
- Abort before any resource outside the approved manifest.

### 4. Host bootstrap and artifact proof

- Bootstrap Ubuntu security updates, non-root operator, Docker, Caddy and Relay
  Host from the released npm version.
- Pull and verify the exact signed Cell digest; mount Host/Cell data outside the
  image; install a restart-safe system service.
- Verify reboot, health, immutable artifact and absence of secret-bearing
  cloud-init/provider metadata.

### 5. Product conformance

- Run first-admin/auth/TLS, one Cell, two-Cell isolation, collision/capacity
  refusal and lifecycle/idempotency checks.
- Install a tiny private Ollama model, keep it private, configure Relay and run a
  real task. Record that this proves connectivity, not production capacity.
- Run negative public-port, cross-Cell path/network/identity and noisy-neighbor
  probes.

### 6. Recovery, rollback and cleanup

- Export/backup, simulate Host/data loss, restore into an empty root and verify a
  restarted authenticated journey.
- Exercise Cell replacement plus version rollback using only approved released
  artifacts.
- Tear down in reverse order, show zero inventory in the browser and API, revoke
  the token, remove the environment entry/private key and reconcile cost.

## Specification and acceptance mapping

| Criterion | Slice | Evidence |
|---|---|---|
| Released artifact parity | 1, 4 | npm/GitHub/OCI receipt with version and digest |
| Repeatable staged provider lifecycle | 2, 3, 6 | fake-server tests, state receipts, live resume/cleanup |
| Credential secrecy | 1-3, 6 | redaction tests, ignored file mode, revoked-token receipt |
| Non-root immutable Host/Cell | 4 | service, process, mount and image inspection |
| Authenticated minimal ingress | 3-5 | firewall UI/API plus positive/negative probes |
| Same-Host isolation and capacity | 5 | two-Cell/collision/limit receipts |
| Real browser and runtime task | 5 | browser evidence, task/runtime result, server logs |
| Recovery and rollback | 6 | empty-root restore and artifact replacement receipts |
| Zero-orphan cleanup | 6 | API inventory plus DigitalOcean control-panel evidence |
| Cost and beta decision | 1, 6 | estimate/actual reconciliation and decision packet |

## Regression-test budget

- Provider client/state: approximately 25-35 focused cases covering every
  mutation, pagination/redaction and partial/rescue branch.
- Existing Host domain: run `npm run test:relay-host` and the G-101 release
  candidate checks applicable to the public artifact.
- Static/quality: typecheck, lint for touched files, public-boundary checks,
  `git diff --check` and build when runtime/bootstrap code changes.
- Runtime-registry: because the private-runtime proof exercises real routing,
  run a real task on the live Host even if no registry import changed.
- Browser: authenticated first-admin/Host/Cell journey in desktop width plus
  DigitalOcean control-panel checkpoints; no new visual UI implies no broad
  responsive screenshot sweep.
- Destructive/provider checks: two-Cell negatives, reboot, Host-loss/restore and
  zero-orphan inventory are mandatory and cannot be replaced by unit tests.

## Error and rescue registry

| Failure | Named outcome | Rescue |
|---|---|---|
| Release incomplete | `G085_RELEASE_GATE_BLOCKED` | Wait; provision nothing |
| Token missing/invalid/scope denied | `G085_PROVIDER_AUTH_FAILED` | Replace/re-authorize the same minimum-scope token |
| Label collision/foreign resource | `G085_RESOURCE_COLLISION` | Refuse mutation; use unique run ID or operator-owned cleanup |
| Rate limit/5xx | `G085_PROVIDER_RETRYABLE` | Bounded backoff then resume from state |
| Partial create | `G085_PARTIAL_PROVISION` | Inventory IDs; resume or reverse-order teardown |
| Bootstrap/package/image failure | `G085_BOOTSTRAP_FAILED` | Preserve logs, stop compute, repair without changing artifact identity |
| TLS/DNS failure | `G085_INGRESS_FAILED` | Keep services private; repair DNS/certificate or reject public profile |
| Isolation/limit negative fails | `G085_ISOLATION_FAILED` | Stop beta; preserve existing Cells; repair contract |
| Runtime task fails | `G085_RUNTIME_FAILED` | Name endpoint/model/network cause; do not claim runtime support |
| Backup/restore fails | `G085_RECOVERY_FAILED` | Preserve source/export locally; stop beta |
| Teardown leaves resources | `G085_CLEANUP_INCOMPLETE` | List exact IDs/cost, retry bounded cleanup, operator rescue if needed |
| Billing not posted | `G085_COST_PENDING` | Record zero live resources and schedule/read later reconciliation |

## Rescue and rollback

- The non-secret local state file is the source of exact provider resource IDs;
  labels are the independent recovery index.
- Every apply stage is idempotent and every destroy stage tolerates already-gone
  resources. Teardown order is Droplet, reserved IP assignment, volume, reserved
  IP, firewall and disposable SSH key unless provider dependencies require an
  explicitly recorded variation.
- Stop compute immediately on cap risk. Preserve customer-owned data by export;
  never leave a volume running merely to avoid reporting a failed recovery.
- Provider-specific code remains a script adapter. Failure cannot change the
  released local npm/OCI path or the fake Cloud Server Preview.

## Execution notes

- The fake-provider suite grew to 24 focused cases and exercises preflight,
  redaction, pagination, resume, retry, partial cleanup and exact inventory.
- The released global npm tree is root-owned on a conventional system install.
  The repeatable bootstrap therefore copies the immutable installed package to
  a service-owned application directory before first production start; data,
  license and Host state remain in their separate mounted roots.
- Relay `0.44.5` required narrow bootstrap compatibility shims for anonymous
  provenance verification and ownership traversal. The source fixes are part
  of this goal, so a future release removes those compatibility branches.
- Cell memory was increased from the provisional 128 MiB trial to 256 MiB after
  the lower limit produced a named OOM failure. The accepted result is a
  conformance floor, not a production sizing recommendation.
- The provider billed usage had not posted at teardown. The measured upper bound
  is below `$0.05`; final posted reconciliation is informational because API and
  browser inventories both prove zero remaining billable resources.
