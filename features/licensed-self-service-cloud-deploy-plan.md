# G-078 implementation program plan

Authoritative specification: `features/licensed-self-service-cloud-deploy.md`
Research: `features/licensed-self-service-cloud-deploy-research.md`
Architecture impact: `features/architect-report.md`
Threat model: `relay-threat-model.md`
Proposed decision: TDR-044
Decision: PROCEED approved by the operator on 2026-07-15

## Scope challenge result

- **REDUCE:** research and recommend one provider/topology only. Rejected because
  it would omit the identity, persistence, entitlement, recovery and portability
  decisions that determine whether the provider recommendation is safe.
- **PROCEED (approved):** complete the provider/topology/layer decision package,
  reproducible cost model, specification, proposed TDR, threat model, wireframe,
  regression strategy and groomed child goals without provisioning paid resources.
- **EXPAND:** create live Railway/DigitalOcean deployments and reconcile actual
  bills. Deferred because it requires customer/provider accounts, credentials,
  external writes and spend; it belongs to separately authorized conformance goals.

The plan is intentionally a program of bounded goals, not one giant feature
branch. G-078 ends after the durable decisions and decomposition are verified.

## What already exists

- `bin/cli.ts` already owns host/port binding, data-dir propagation, first-run
  behavior and graceful child-process signal forwarding.
- `src/lib/config/env.ts` and `src/lib/utils/ainative-paths.ts` define a portable
  per-instance data-root contract.
- `src/lib/db/index.ts` supplies SQLite/WAL/bootstrap and Drizzle; TDR-010 records
  the single-machine boundary.
- `src/lib/snapshots/snapshot-manager.ts` uses SQLite's backup API and packages
  database/files with a manifest; `auto-backup.ts` supplies scheduling.
- `src/lib/utils/crypto.ts` supplies authenticated local encryption; it can inform
  a portable envelope but is not a cloud KMS/recovery contract.
- `src/lib/licensing/verify.ts`, `store.ts` and `gate.ts` provide the offline
  signature → term → entitlement pattern required for cloud-deploy licensing.
- `src/lib/instance/*` and TDR-029/TDR-030 provide instance bootstrap, update and
  hybrid-license patterns; G-060 must decide which contracts are reusable.
- `src/lib/agents/runtime/provider-endpoint.ts` provides URL normalization,
  insecure-remote consent, redirect refusal, bounded timeouts/errors and secret
  redaction for model endpoints.
- Ollama, LM Studio and LiteLLM already have explicit runtime identities and
  model discovery/setup from G-069–G-077; cloud work should add provisioning and
  private-service lifecycle, not collapse their semantics.
- Existing settings/license-gate patterns, critical-route inventory, runtime
  graph smoke, snapshot tests and browser runbook can anchor regression coverage.

## NOT in scope

- Live provider provisioning or spend in G-078: deterministic plans precede
  externally billed conformance.
- Accepting TDR-044 or selecting a shippable provider: those are operator gates
  after proof, not consequences of research.
- Managed Orionfold hosting/control plane: it changes credential custody,
  cross-customer blast radius, privacy and commercial operations.
- Row-level multi-tenancy: G-058 preserves process-per-customer isolation.
- Postgres/Turso/LiteFS implementation: no current v1 scale/RPO requirement
  justifies their migration and semantic cost.
- Kubernetes, active-active, distributed scheduler or multi-region writes: later
  trigger-gated enterprise work.
- Compliance, residency, SSO or SLA claims: ordinary confidential business data
  is the approved baseline.
- Every cloud provider: Railway and DigitalOcean prove two adapter families;
  subsequent providers must pass the same contract.

## Specification and acceptance mapping

| Spec acceptance criterion | Implementation program slice | Protecting evidence |
|---|---|---|
| AC1 authoritative provider matrix | G-078 research, dated source catalog | URL/source-date audit and provider-family coverage check |
| AC2 topology comparison | G-078 research/spec/wireframe | topology ownership/failure/cost checklist |
| AC3 A/B/C layer posture | G-078 spec + proposed TDR-044 | layer/revisit-trigger parity check |
| AC4 reproducible cost model | G-078 JSON inputs + deterministic script | script assertions for 1/10/100 scenarios |
| AC5 durable architecture decision | proposed TDR-044, accepted in first implementation gate | architect review plus operator acceptance |
| AC6 threat coverage | G-078 threat model, then per-goal security review | focus-path and trust-boundary checklist |
| AC7 complete customer journey | G-078 wireframe, G-084 deploy UX | state-machine/component/browser journey tests |
| AC8 executable slices and regression budget | this plan + G-079–G-086 | per-goal ship verification and conformance matrix |
| AC9 G-058/G-060 dependencies and child goals | strategy backlog amendments | goal-ledger audit |
| AC10 no external writes/spend | G-078 closure | git/status and provider-credential absence check |

## Program sequence

### G-079 — Lock truthful isolation and customer-owned fleet authority

Goal: complete G-058 and amend/complete G-060's specification so one customer
instance, fleet metadata, ownership transfer and customer-authorized lifecycle
are unambiguous before provider code exists.

Primary surfaces:

- `_IDEAS/backlog.md` G-058/G-060 contracts;
- `features/` isolation/fleet specification and wireframes;
- `src/lib/config/env.ts`, `src/lib/utils/ainative-paths.ts`, `src/lib/instance/*`;
- `PRIVATE-INSTANCES.md` and customer docs after public language approval.

Tasks:

1. Inventory instance identity, data root, hostname, cwd, credential, logs and
   runtime-policy ownership.
2. Define minimal fleet metadata that contains no customer content and distinguish
   local process, OS user, container and remote-host isolation.
3. Define customer ownership/authorization/transfer/revocation state machines.
4. Add synthetic two-instance tests proving no cross-instance database, file,
   secret, log or runtime-policy access.
5. Obtain operator approval for public trust language, first fleet topology and
   minimum fleet metadata.

Checkpoint: G-058/G-060 acceptance evidence exists and no later goal needs to
invent customer/instance semantics.

### G-080 — Produce a signed cloud-safe Relay artifact

Goal: create an immutable OCI artifact and launch/data contract from the same
release manifest as npm Relay.

Expected new/changed surfaces:

- `Dockerfile` or a dedicated release container file;
- `.dockerignore`;
- `bin/cli.ts` and health/readiness API;
- `scripts/` release/provenance/SBOM tooling;
- `.github/workflows/` OCI build/sign workflow;
- versioned topology/artifact schema under `src/lib/cloud/`;
- tests for signals, health, data paths, schema compatibility and provenance.

Tasks:

1. Specify immutable image inputs, non-root user, native `better-sqlite3` target,
   writable data mount, temp paths, read-only root compatibility and resource
   minimums.
2. Add startup/readiness/liveness and SIGTERM drain contracts that cover scheduler,
   tasks, SQLite checkpoint and backup boundaries.
3. Generate a release manifest tying npm version, OCI digest, schema range,
   migrations, SBOM, signatures and rollback artifact.
4. Add container fixture smoke using a temporary isolated data directory; prove
   first-run, restart persistence, graceful stop and prior-version rollback.
5. Add CI provenance/signature checks. Publication remains separately authorized.

Checkpoint: a locally built image runs customer-identically and a mutable tag or
digest mismatch cannot pass verification.

### G-081 — Add internet-safe identity and administrative bootstrap

Goal: implement the remote-authenticated exposure profile required before public
cloud smoke.

Expected surfaces:

- new `src/lib/auth/*` session, password/identity, bootstrap and authorization;
- `src/middleware.ts` or equivalent request boundary consistent with Next 16;
- critical `src/app/api/**` routes and server actions;
- Settings/security/recovery UI;
- database schema/migration for identities, sessions and audit receipts;
- docs for reverse proxy/forwarded-header trust.

Tasks:

1. Freeze a generated inventory of routes/actions into public, authenticated-read,
   authenticated-mutation and bootstrap/recovery classes.
2. Add single-use, expiring, atomically consumed first-admin bootstrap with no
   query/log/browser-storage token exposure.
3. Add secure sessions, reauthentication, logout/revocation and one-customer-org
   authorization at every mutation boundary.
4. Add CSRF/origin enforcement, login/bootstrap/recovery rate limits, forwarded-
   header trust rules and visible named failures.
5. Prove trusted-local behavior remains usable while public bind without the
   authenticated profile fails closed.
6. Run an independent security review before enabling any provider smoke.

Checkpoint: unauthenticated critical-route inventory is empty except explicitly
public health/bootstrap initiation endpoints, and browser tests cover first admin,
sessions, CSRF, recovery, expiry and takeover attempts.

### G-082 — Make recovery, secrets and data portability cloud-safe

Goal: keep live per-instance SQLite/files while adding encrypted customer-owned
off-host recovery, portable export and cloud/local roots of trust.

Expected surfaces:

- `src/lib/snapshots/*` manifest/version/transport/restore drill;
- new `src/lib/storage/*` backup transport contracts and provider adapters;
- new `src/lib/secrets/*` reference/envelope/root contracts;
- lifecycle APIs/UI for backup, restore drill, export and key recovery;
- deterministic object-store fixture and failure injection tests.

Tasks:

1. Version the snapshot manifest across DB, files, settings, license references,
   checksums, encryption metadata and compatible Relay/schema range.
2. Separate live filesystem from backup transport; implement local fixture and
   one S3-compatible customer-owned destination adapter.
3. Define secret references and envelope encryption so browser/API/support output
   exposes presence/source only and loss of the local volume is recoverable.
4. Add backup scheduling with durable lock/receipt semantics and zero silent
   failures; reconcile incomplete uploads and retention.
5. Add isolated restore drills, version compatibility, destructive-restore guard,
   export-to-local and simulated host/volume loss.
6. Evaluate Litestream only as a bounded alternative spike; do not let it bypass
   the full files/settings/key recovery contract.

Checkpoint: a destroyed disposable instance is recreated from customer-owned
encrypted recovery without an Orionfold-held key.

### G-083 — Define the entitlement-gated deploy domain and provider contract

Goal: implement provider-neutral topology, price, authorization, capability,
resource, receipt and lifecycle state contracts before a live adapter.

Expected surfaces:

- new `src/lib/cloud/schema.ts`, `state-machine.ts`, `entitlement.ts`,
  `pricing.ts`, `receipts.ts`, `provider.ts`, and error taxonomy;
- settings/license-gate APIs and read-only cost comparison;
- generated provider capability fixtures;
- persistent deployment-draft/receipt schema and migrations.

Tasks:

1. Add versioned Zod schemas for topology inputs, capability declarations,
   normalized prices, redacted plans, provider resources and receipts.
2. Implement the spec state machine with legal-transition tests, plan digest,
   per-step idempotency, cancellation, resume, rollback and partial rollback.
3. Apply `product:relay-cloud-deploy` to every provisioning/lifecycle mutation;
   keep comparison/export/recovery paths usable after lapse.
4. Define authorization acquisition/use/discard/revoke interfaces that cannot
   serialize provider secrets into client payloads or receipts.
5. Load a signed or release-bound dated pricing catalog and mark stale estimates;
   enforce budgets/cost ceilings before mutation.
6. Add provider conformance harness with a deterministic fake adapter covering
   success, denial, timeout, malformed response, replay, partial state, rollback
   failure, provider drift and cleanup inventory.

Checkpoint: fake-adapter journeys prove the complete domain without network or
credentials, and the critical entitlement route matrix passes.

### G-084 — Implement customer cloud-deploy UX and lifecycle receipts

Goal: turn the approved wireframe into an accessible, persistent journey backed
by the G-083 domain, without provider-specific branching in components.

Expected surfaces:

- Settings navigation and `src/components/cloud-deploy/*`;
- read-only comparison, configuration, estimate, preflight, authorization,
  progress, rescue, handoff and lifecycle screens;
- API routes/server actions backed by cloud domain services;
- component/accessibility/browser tests.

Tasks:

1. Build the provider/topology comparison with availability, ownership, failure,
   scale and dated cost evidence.
2. Build configuration and live expected/upper estimate with raw assumptions and
   stale-source behavior.
3. Build scope/authorization explanation and callback/error states without
   provider tokens in browser storage or URLs.
4. Render durable progress from receipts, exact partial-resource/billing warnings,
   resume/rollback and provider-console external links.
5. Build first-login/handoff, license-lapse, upgrade, export, transfer and delete
   surfaces with step-up/destructive confirmations.
6. Verify at 1440/944/390 px, light/dark, keyboard/screen reader semantics,
   reload/navigation resilience, no overflow and system cursor only.

Checkpoint: deterministic fake provider completes every journey state in a real
browser before any live adapter is connected.

### G-085 — Prove Railway template/PaaS conformance

Goal: implement Railway behind the G-083 contract and prove the sealed reference
topology in a disposable customer-owned account.

Operator gates before live work: accept TDR-044, approve Railway OAuth/token
scopes, provide/authorize account and spending cap, approve target region and
temporary public hostname.

Tasks:

1. Map topology manifest to Railway project/services/volume/private networking,
   secrets, hostname and backup resources; keep mapping isolated in adapter.
2. Prove OAuth/API scope minimization, token discard/revoke and redacted receipts.
3. Run full create, reload/resume, induced partial failure, idempotent retry,
   rollback, delete and provider-inventory reconciliation.
4. Run first-admin/auth/TLS, two-instance isolation, private runtime probe, backup,
   host-loss restore, upgrade/rollback, export-to-local and actual bill checks.
5. Record deviations, line-item cost and adapter semantic differences; recommend
   ship, revise or reject. Do not ship by default.

Checkpoint: operator accepts or rejects Railway based on recorded conformance and
actual spend, not research ranking.

### G-086 — Prove DigitalOcean VM portability conformance

Goal: implement the same topology through Droplet/cloud-init/container primitives
and prove the provider contract does not depend on Railway semantics.

Operator gates before live work: approve DigitalOcean scopes/account/spending,
region/size, image distribution and temporary hostname.

Tasks:

1. Map the same manifest to VPC/firewall, Droplet, volume, DNS, secret/bootstrap
   and backup resources using an immutable signed Relay image.
2. Harden non-root container/host, automatic security maintenance, SSH/recovery
   boundaries and provider-console escape hatch.
3. Run the same state/isolation/recovery/upgrade/delete conformance as G-085.
4. Compare adapter-specific semantics, customer effort, cost, recovery and support
   burden using one normalized scorecard.
5. Choose the first shippable provider or reject both; update TDR-044 to accepted,
   superseded or rejected only with operator approval.

Checkpoint: one provider may be selected for a release goal; the other remains a
portability proof or is explicitly rejected.

## Regression test budget

### G-078 planning artifacts

- Cost model: six exact 1/10/100 assertions plus schema/date/currency guards.
- Source parity: all required providers, topology families, load-bearing layers,
  acceptance criteria and child goals appear in their authoritative artifacts.
- Link/path validation: local references and source URLs are syntactically valid;
  no unrelated legacy-project provenance appears.

### Future feature tests

- Isolation/fleet: at least two instances; DB, files, secrets, logs, hostnames,
  runtime policies, backups and receipts; nil/missing/misbound ownership cases.
- Artifact: fresh install, restart, read-only root, missing/wrong volume, SIGTERM
  under idle/task/backup/migration, digest/signature mismatch and rollback.
- Identity: route inventory plus unauthenticated/authenticated/expired/revoked,
  bootstrap race/replay/expiry, CSRF/origin, rate limit, session fixation/rotation,
  forwarded-header spoof, recovery and local-mode compatibility.
- Recovery/secrets: empty/large/changed DB and files, concurrent backup, upload
  interruption, corrupt/truncated/wrong-key/wrong-version manifest, lost volume,
  retention and browser/API redaction.
- Deploy domain: every legal/illegal transition, entitlement valid/missing/expired/
  wrong-product, stale price, authorization deny/expire, duplicate activation,
  provider timeout/malformed/partial, rollback failure and remaining-cost receipt.
- UI: every journey/state/error, reload and back navigation, duplicate clicks,
  stale edits, external links, keyboard/focus/live regions, destructive confirmation,
  mobile/desktop/light/dark/system cursor.
- Provider conformance: same suite for fake, Railway and DigitalOcean plus explicit
  provider-semantic differences; actual bill/resource inventory where authorized.

### Runtime-registry smoke budget

G-078 itself does not modify runtime code. G-085/G-086 or hybrid/runtime goals may
touch `src/lib/agents/runtime/*` or `src/lib/workflows/engine.ts`; if so they must:

1. start `PORT=3010 npm run dev` using a fresh isolated `RELAY_DATA_DIR`;
2. run a real Chat/task request through the modified runtime path;
3. confirm no `ReferenceError`, missing-tools error or static Chat-tools import
   cycle occurs;
4. record task ID, runtime and result in the feature verification section;
5. use function-local `await import()` if a Chat-tools dependency is needed.

### Ordered verification

For G-078 closure:

```bash
node scripts/cloud-deploy-cost-model.mjs
node -e 'JSON.parse(require("fs").readFileSync("features/cloud-deploy-cost-inputs.json", "utf8"))'
rg -n "Vercel|Supabase|Cloudflare|Railway|Render|Fly.io|DigitalOcean|Hetzner" \
  features/licensed-self-service-cloud-deploy-research.md
rg -n "Operational data|Files|Secrets|Identity|Scheduling|Live events|Model runtimes|Backup|Observability|Distribution" \
  features/licensed-self-service-cloud-deploy.md
rg -n "G-079|G-080|G-081|G-082|G-083|G-084|G-085|G-086" \
  features/licensed-self-service-cloud-deploy-plan.md _IDEAS/backlog.md
git diff --check
git status --short
```

Future goals run closest tests, impacted suites, schema/type/token/parity checks,
runtime smoke, real browser evidence, broader build/release checks and a fresh
security/architecture review in that order.

## Error & Rescue Registry

| Failure | Visible outcome | Rescue |
|---|---|---|
| Provider pricing source becomes stale/unavailable | Estimate marked stale; no “current” claim | Retain last dated input, refresh manually and review diff |
| TDR/provider not approved | Implementation/provider goal remains operator-gated | Continue deterministic contract work only; do not provision |
| Public identity goal incomplete | Provider public smoke blocked | Use local/private fixture; finish G-081 and security review |
| OCI/native binding fails in target image | Artifact verification fails before provider work | Repair build target or choose supported base; rerun fresh image smoke |
| Cloud authorization denied/expires | No resource mutation; named scope failure | Reauthorize same plan digest with minimum scopes |
| Provider creates partial resources | `partially-provisioned` plus exact bill risk | Resume idempotently or scoped rollback, then inventory provider |
| Backup succeeds but restore fails | Deployment cannot be called recovery-ready | Preserve source, repair manifest/key/version, rerun isolated drill |
| SQLite triggers fail under measured SLO/RPO | Scale trigger recorded with evidence | Open bounded database architecture goal; compare A/B/C honestly |
| Provider adapter leaks into Core/UI | Conformance becomes provider-specific | Move mapping to typed adapter/capability schema before second proof |
| Module-load cycle via Chat-tools import | First real task crashes before dispatch | Replace static import with function-local `await import()` and rerun real smoke |
| License lapse blocks export/recovery | Data-hostage acceptance failure | Separate automation gate from ownership/recovery paths before shipping |
| Live provider account unavailable | External conformance remains gated | Finish fake-adapter tests and evidence packet; never claim live proof |
| Actual bill exceeds approved cap | Emergency stop preserving volume/data | Stop/delete compute as policy allows, inventory charges, keep recovery artifact |

## Rollback and rescue strategy

- G-078 artifacts are documentation, a read-only estimator and proposed decisions;
  they can be superseded without data migration.
- Each implementation goal is independently revertible and must maintain the
  last known-good npm/local path until its cloud behavior is accepted.
- New schemas are additive until a provider ships; migrations need down/rescue
  instructions and pre-change snapshots.
- Provider adapters are feature/entitlement-gated and disabled by default until
  conformance/acceptance.
- Failed provider resources remain customer-owned and visible in receipts;
  automatic cleanup never destroys data-bearing volumes/backups without the
  exact confirmation policy.
- Database posture changes require their own migration/dual-read-or-cutover plan;
  no such migration is authorized by G-078.

## Operator gates

- Accept, revise or reject proposed TDR-044.
- Approve the first live provider, provider scopes, account, region and spending
  cap for G-085/G-086.
- Approve remote identity model/public trust copy and any compliance claims.
- Approve cloud-deploy entitlement issuance, renewal/grace and security-update
  behavior during lapse.
- Approve backup retention/key recovery and RPO/RTO targets.
- Approve any managed Orionfold control plane, provider credential custody,
  shared multi-customer host, remote database, or distributed scheduler.
- Separately authorize push, publish, release, public template/marketplace entry,
  DNS changes or paid resources.

## G-078 completion boundary

G-078 is complete when the spec, research, cost inputs/script, wireframe, proposed
TDR, threat model, program plan and G-079–G-086 backlog goals are internally
consistent; the deterministic cost/link/parity/diff checks pass; Relay-owned
artifacts are locally committed; and no external cloud write or provider claim is
made. Implementation begins with G-079, not within G-078.
