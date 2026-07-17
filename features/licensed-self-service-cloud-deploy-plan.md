# G-078 implementation program plan

Authoritative specification: `features/licensed-self-service-cloud-deploy.md`
Research: `features/licensed-self-service-cloud-deploy-research.md`
Architecture impact: `features/architect-report.md`
Threat model: `relay-threat-model.md`
Architecture decision: TDR-044 accepted by G-079 on 2026-07-16
Decision: PROCEED approved by the operator on 2026-07-15
Architecture perspective amended from OpenClaw/Hermes/NemoClaw evidence on
2026-07-16

## Scope challenge result

- **REDUCE:** research and recommend one provider/topology only. Rejected because
  it would omit the identity, persistence, entitlement, recovery and portability
  decisions that determine whether the provider recommendation is safe.
- **PROCEED (approved):** complete the provider/topology/layer decision package,
  reproducible cost model, specification, proposed TDR, threat model, wireframe,
  regression strategy and groomed child goals without provisioning paid resources.
- **EXPAND:** create live local-device, DigitalOcean, and second-provider Relay
  Hosts and reconcile actual capacity/bills. Deferred because it requires
  machines/accounts, credentials, external writes and spend.

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
- OpenClaw Fleet provides a directly relevant one-host/one-cell-per-tenant
  precedent; Hermes and NemoClaw provide remote-backend and host/sandbox
  precedents captured in the research report.
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
- Every cloud provider: the same Relay Host contract is proven locally and on
  DigitalOcean first; a second VM provider is required only before a general
  portability claim. PaaS is a later single-cell adapter.

## Specification and acceptance mapping

| Spec acceptance criterion | Implementation program slice | Protecting evidence |
|---|---|---|
| AC1 authoritative provider matrix | G-078 research, dated source catalog | provider-family coverage and source-date check |
| AC2 reference-product evidence | G-078 OpenClaw/Hermes/NemoClaw research | official Host/cell/backend/sandbox claim audit |
| AC3 Host/cell topology comparison | G-078 research/spec/wireframe | placement, Host trust, isolation, failure and cost checklist |
| AC4 A/B/C layer posture | G-078 spec + accepted TDR-044 | layer/revisit-trigger parity check |
| AC5 reproducible cost model | G-078 JSON inputs + deterministic script | exact 1/10/100-cell Host/shard assertions |
| AC6 durable architecture decision | TDR-044 accepted by G-079 | architect review plus operator acceptance receipt |
| AC7 threat coverage | G-078 threat model, then per-goal security review | Host privilege, cross-cell and trust-boundary checklist |
| AC8 complete customer journey | G-078 wireframe, G-084 deploy UX | placement/Host/cell state-machine and browser tests |
| AC9 executable slices and regression budget | this plan + G-079–G-086 | per-goal ship verification and conformance matrix |
| AC10 G-058/G-060 dependencies and child goals | strategy backlog amendments | goal-ledger audit |
| AC11 no external writes/spend | G-078 closure | git/status and provider-credential absence check |
| AC12 portfolio/release-chain agreement | dependency matrix + roadmap/backlog/connector links | cross-artifact goal/order/relation parity check |

## Dependency contract

The program uses four relationship types. A goal must not infer a hard block from
mere architectural alignment:

- **Hard prerequisite:** the predecessor's accepted contract or implementation is
  required before the successor begins.
- **Conformance prerequisite:** local/fake implementation may proceed, but a
  customer-facing topology or support claim cannot ship until the predecessor's
  evidence passes.
- **Coordination dependency:** goals may proceed independently, but they must
  reuse one named contract or record an explicit reason for divergence.
- **Trigger gate:** the goal stays outside the committed release train until its
  measured demand, capacity, package-size, or environment trigger occurs.

### Goal dependency matrix

| Goal | Hard prerequisites | Conformance or coordination dependencies | Enables / release role |
|---|---|---|---|
| G-058 | — | public trust copy must remain consistent with `_ASSETS/` | truthful customer/cell isolation language |
| G-060 | G-058 accepted | TDR-044, `features/relay-host-fleet-manager-contract.md`, and existing `src/lib/instance/*` seams | approved separate local Host supervisor, dedicated content-free registry and bounded lifecycle slice |
| G-079 (accepted) | G-058, G-060 | accepted Host/cell vocabulary, trust, authority, hardening and first topology | freezes the architecture contract for every implementation stream |
| G-034 | — | complete before G-080 unless G-080 independently proves the native binding, PDF pipeline and externalization debt clean in its target artifact | lowers OCI/native-package risk without becoming an unrelated modernization umbrella |
| G-038 | — | instance-local marker must be scoped by the same per-cell `RELAY_DATA_DIR` contract | immediate first-run reliability and a clean cell-isolation invariant |
| G-080 | G-079 | G-034 conditional preflight; G-036 remains trigger-only based on measured tarball/install cost | signed Relay Cell image and local two-cell Host alpha |
| G-094 | G-025 acceptance after G-093 | reuses G-080/G-093 image policy; registry, signing identity and every external write remain operator-gated | published signed multi-architecture Cell image for managed Hosts |
| G-081 | G-079 | may run in parallel with G-080; any container/Host ingress claim must be rerun against the G-080 artifact | authenticated remote Host access and server-owned cell routing |
| G-082 | G-079, G-080 | reuse existing snapshot contracts; connector secrets/backups consume this contract | recoverable, portable cells and per-cell secret roots |
| G-020 | — | G-084 must reuse its dated freshness/staleness semantics or explicitly own a separate cloud-price catalog contract | prevents duplicated or falsely-current estimate behavior |
| G-030 | — | G-083/G-084 reuse retain-by-default versus separately confirmed purge semantics | immediate removal clarity and consistent destructive-language policy |
| G-083 | G-079, G-080, G-081, G-082, G-094 | G-030 retention semantics; entitlement policy remains operator-gated | npm-delivered paid local Host supervisor beta and stable Host/Cell lifecycle API |
| G-084 | G-083 | G-020 freshness semantics; G-030 retention language | customer-visible local-device/cloud-Host lifecycle journey |
| G-085 | G-084 | provider account, credentials, spend, hostname, security review and release approval | first DigitalOcean customer beta |
| G-086 | G-085 plus demand trigger | second provider/hardware authorization; does not block a demand-validated G-085 beta | portability evidence required before GA portability claims |
| G-073 | G-079 accepted; E0 research/spec and tranche approval remain | cloud-Host support conforms to G-081/G-082; connector workers, secrets and state remain inside one cell under G-083 | structured connector kernel and local-first connector value |
| G-074 | G-073 shared kernel; G-079 accepted; research may overlap | cloud-Host support conforms to G-081/G-082; document content never enters Host registry | document connector value without a second connector platform |
| G-059 | G-080 local Host fixture or an equivalent disposable Linux multi-user environment | use the Host/cell process boundary to distinguish task cwd from executable/PATH/credential scope | closes the customer runtime report without inventing per-customer config inside one process |
| G-062 | — for specification; G-083 before implementing Host/cell health modules | Host modules are optional typed dashboard consumers, not a blocker for core dashboard improvements | exposes deployment health later without coupling Home to the supervisor |
| G-025 | each implementation release candidate | customer-identical isolated staging evidence; repeat after G-080, G-081/G-082, G-084 and G-085 | recurring release gate rather than a one-time prerequisite |
| G-036 | package-size or install-performance trigger only | G-080 records the OCI/npm size evidence that may activate it | optional distribution optimization; never blocks while under budget |

### Critical path and parallel work

```text
G-058 → G-060 → G-079
                    ├─→ G-080 ─→ G-082 ─┐
                    └─→ G-081 ──────────┼─→ G-083 → G-084 → G-085 → G-086

G-034 ── conditional artifact preflight ─→ G-080
G-038 ── independent R1 first-run quick win

After G-079:
  G-073 local connector stream → G-074 document layer
  cloud-Host connector claims additionally wait for G-081 + G-082

After G-080:
  G-059 gains a customer-representative local Host fixture
  G-036 runs only if the measured package/install trigger fires
```

## Iterative customer-value release train

Every increment remains independently releasable. Later provider work must not
hold back verified local reliability, isolation, authentication, or recovery
improvements.

| Increment | Ordered goals | Customer value | Release boundary |
|---|---|---|---|
| **R0 — Isolation contract** | G-058 → G-060 → G-079 | customers and operators can tell attribution from a real security boundary and choose same-Host versus separate-VM placement truthfully | approved Host/cell contract, trust copy and TDR disposition; no provisioning claim |
| **R1 — Local Host alpha** | G-034 conditional preflight; G-038 parallel quick win; G-080 → G-025 | reproducible local-device installation, isolated Cell data roots and a signed Cell image; first-run prompts no longer recur per Cell | local one-Host/two-cell smoke, package/native checks, rollback/export and customer-identical staging |
| **R2 — Secure and recoverable Host alpha** | G-081 in parallel with G-082 → G-025 | authenticated remote use plus encrypted off-Host recovery and portable export, useful even before automated cloud provisioning | independent security review, destroyed-Host restore drill and staging journey |
| **R3 — Licensed local Host beta** | G-094; G-030 before G-083 retention contract; G-020 before G-084 estimates; G-083 → G-084 → G-025 | npm-delivered Host supervisor, registry-delivered Cell image and paid self-service Host/Cell lifecycle on a local device and fake VM | signed registry Cell image, entitlement/lifecycle acceptance, real-browser journey and staging release candidate |
| **R4 — DigitalOcean beta** | G-085 → G-025 | an end customer can provision and operate one customer-owned DigitalOcean Relay Host with verified bill, cleanup and recovery | operator-approved external conformance, spend reconciliation and beta release |
| **R5 — Portable Host GA** | G-086 | the same npm Host control surface, Host/Cell manifest and signed Cell-image digest work on a second VM provider or representative customer hardware | second-target conformance and approved portability/GA claim |

Parallel value stream after R0:

1. G-073's G-079 prerequisite is satisfied. Production code still waits for the
   E0 connector contract and operator-approved first tranche; its first local
   connector tranche can ship without waiting for DigitalOcean.
2. G-074 research can overlap G-073, while implementation waits for the accepted
   shared connector kernel. Cloud-Host connector support additionally conforms
   to G-081 identity/ingress and G-082 secret/recovery contracts.
3. G-062 may be specified independently, but Host/cell health modules wait for
   G-083's typed lifecycle API. This keeps the dashboard valuable without
   turning it into a supervisor dependency.

## Program sequence

### G-060 — Define the local Relay Host supervisor contract

Goal: define the separate local Relay Host supervisor, dedicated content-free
registry, local OS authority, customer-owned per-cell secret references,
desired/actual/operation state machines, collision preflight, partial-operation
rescue and first synthetic lifecycle slice.

The Host supervisor controls only Cells on its own Host. It is not a Fleet
Controller. Remote coordination of several Hosts is separate future scope and
must delegate through each authenticated Host supervisor.

Authoritative artifacts:

- `features/relay-host-fleet-manager-contract.md`;
- `features/relay-host-fleet-manager-plan.md`;
- `features/architect-report.md`;
- amended TDR-044 and `relay-threat-model.md`.

The supervisor never runs from cell instrumentation or shares a cell database.
The first later implementation slice is local inventory plus fake/synthetic
create/start/stop; a real OCI adapter waits for G-080. G-060 creates no runtime,
container, public endpoint, provider resource or release.

Checkpoint: the operator-approved topology, minimum metadata, secret ownership
and first slice are durable and G-079 can make the final TDR/authority decision
without inventing lifecycle semantics.

### G-079 — Lock truthful isolation and customer-owned fleet authority

Goal: consume completed G-058/G-060 contracts so Relay Host, Relay cell, trusted
Host administrator, same-host versus separate-VM isolation, content-free Host
metadata, ownership transfer and customer-authorized lifecycle are unambiguous.

Primary surfaces:

- `_IDEAS/backlog.md` G-079 contract;
- `features/relay-host-cell-isolation-boundary.md` and
  `features/relay-host-fleet-manager-contract.md`;
- `src/lib/config/env.ts`, `src/lib/utils/ainative-paths.ts`, `src/lib/instance/*`;
- `PRIVATE-INSTANCES.md` and customer docs after public language approval.

Tasks:

1. Review the completed G-058/G-060 vocabulary, Host/cell inventory, registry,
   state machines, threat priorities and first-slice boundary as one contract.
2. Select the allowed same-Host trust classes and minimum hardening/conformance
   rung while preserving separate VM/machine guidance for Host-admin distrust.
3. Accept, revise or reject TDR-044's authority, ownership transfer/revocation,
   manifest and registry decisions.
4. Freeze the R0 contract consumed by G-080 through G-084 and the connector
   conformance streams.

Accepted 2026-07-16. `features/relay-host-authority-isolation-contract.md`
freezes explicit same-Host trust, the baseline hardening rung, separate-VM
rescue, customer-authorized transfer/revocation, content-free authority metadata
and provisional admission values. TDR-044 is accepted and no later goal needs to
invent customer/instance semantics.

### G-080 — Produce a signed Relay Cell OCI artifact

Goal: create an immutable Relay Cell OCI image and launch/data contracts from
the same release manifest as npm Relay, usable by a managed Host on a local
device or cloud VM. npm remains the direct local single-Cell path and later
delivers the Host bootstrap/supervisor; it never embeds the image bytes.

Expected new/changed surfaces:

- `Dockerfile` or a dedicated release container file;
- `.dockerignore`;
- `bin/cli.ts` and health/readiness API;
- `scripts/` release/provenance/SBOM tooling;
- `.github/workflows/` OCI build/sign workflow;
- versioned Host/cell/artifact schema under a provider-neutral module;
- tests for signals, health, data paths, schema compatibility and provenance.

Tasks:

1. Specify immutable image inputs, non-root user, native `better-sqlite3` target,
   writable data mount, temp paths, read-only root compatibility and resource
   minimums.
2. Add startup/readiness/liveness and SIGTERM drain contracts that cover scheduler,
   tasks, SQLite checkpoint and backup boundaries.
3. Generate a release manifest tying npm version, OCI digest, schema range,
   migrations, SBOM, signatures and rollback artifact.
4. Add one-Host/two-cell fixture smoke using isolated data roots, networks and
   loopback ports; prove first-run, restart persistence, graceful stop, no
   cross-cell access and prior-version rollback.
5. Add CI provenance/signature checks. Publication remains separately authorized.

Checkpoint: a locally built image runs customer-identically and a mutable tag or
digest mismatch cannot pass verification.

### G-081 — Add internet-safe Host ingress and cell identity

Goal: implement trusted-local, tailnet/VPN and remote-authenticated Host exposure
profiles, first-admin bootstrap, cell route binding and client/device identity
before public cloud smoke.

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
5. Make Host routing server-owned: hostname/path maps to one cell and a caller-
   supplied customer/cell ID cannot select another cell.
6. Prove trusted-local behavior remains usable while public bind without the
   authenticated profile fails closed.
7. Run an independent security review before enabling any provider smoke.

Checkpoint: unauthenticated critical-route inventory is empty except explicitly
public health/bootstrap initiation endpoints, and browser tests cover first admin,
sessions, CSRF, recovery, expiry and takeover attempts.

### G-082 — Make recovery, secrets and data portability cloud-safe

Goal: keep live per-cell SQLite/files while adding encrypted customer-owned
off-host recovery, portable export and local-device/cloud-Host roots of trust.

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
5. Add isolated per-cell restore drills, version compatibility, destructive-
   restore guard, export-to-local, whole-Host inventory and simulated Host loss.
6. Evaluate Litestream only as a bounded alternative spike; do not let it bypass
   the full files/settings/key recovery contract.

Checkpoint: a destroyed disposable instance is recreated from customer-owned
encrypted recovery without an Orionfold-held key.

### G-083 — Build the entitlement-gated Relay Host supervisor and cell contract

Goal: implement the local Host registry/supervisor, cell manifest, resource
admission and lifecycle state machine first; cloud providers only bootstrap a
machine and apply the same Host contract.

Expected surfaces:

- new provider-neutral `src/lib/host/*` (or equivalent) for schema, registry,
  allocator, lifecycle state machine, entitlement, pricing, receipts, container
  runtime and error taxonomy;
- settings/license-gate APIs and read-only cost comparison;
- deterministic local Host/container fixture and fake VM provider;
- persistent Host/cell/deployment receipt schema and migrations.

Tasks:

1. Add versioned schemas for Host placement/size, cell ownership, artifact,
   loopback port/network/mount allocation, resource limits, backup lineage,
   provider bootstrap and redacted receipts.
2. Implement Host and cell state machines with legal transitions, plan digest,
   idempotency, cancellation, resume, replace, rollback, retained-data removal
   and separately confirmed purge.
3. Apply the accepted `product:relay-host` grant to every paid expansion and
   routine forward-upgrade mutation; preserve receipt-bound continuity actions
   after lapse per `features/oci-fulfillment.md`;
   keep comparison/export/recovery paths usable after lapse.
4. Verify signed artifacts and create cells with distinct process/container
   identity, data roots, networks, loopback ports, secrets, licenses, logs and
   CPU/memory/disk limits. Reject every collision and path escape.
5. Store only content-free Host registry data and prove no customer payload or
   credential enters supervisor receipts/logs.
6. Add capacity admission based on measured/provisional resource inputs and a
   safety reserve; refuse instead of oversubscribing silently.
7. Define provider authorization/use/discard/revoke and VM-bootstrap interfaces
   that cannot serialize provider secrets into browser payloads or receipts.
8. Add local Host plus fake-provider conformance for success, denial, timeout,
   replay, Host partial, cell partial, rollback failure and cleanup inventory.

Checkpoint: a local one-Host/two-cell fixture proves isolation, lifecycle,
capacity refusal, data retention/purge containment and entitlement behavior
without provider credentials.

### G-084 — Implement local-device/cloud-Host deployment UX and receipts

Goal: turn the approved wireframe into an accessible, persistent journey backed
by the G-083 domain, without provider-specific branching in components.

Expected surfaces:

- Settings navigation and `src/components/cloud-deploy/*`;
- read-only comparison, configuration, estimate, preflight, authorization,
  progress, rescue, handoff and lifecycle screens;
- API routes/server actions backed by cloud domain services;
- component/accessibility/browser tests.

Tasks:

1. Present Local Device and Cloud Server first, with Host administrator trust,
   cell isolation, separate-VM option and later PaaS/distributed profiles.
2. Configure Host size/count, cells, exposure, runtime and recovery; show
   provisional admission/safety reserve and stale-source behavior.
3. Build scope/authorization explanation and callback/error states without
   provider tokens in browser storage or URLs.
4. Render Host then cell progress, exact capacity/isolation/partial-resource
   warnings, resume/rollback and provider-console external links.
5. Build first-login/handoff, license-lapse, upgrade, export, transfer and delete
   surfaces with step-up/destructive confirmations.
6. Verify at 1440/944/390 px, light/dark, keyboard/screen reader semantics,
   reload/navigation resilience, no overflow and system cursor only.

Checkpoint: local Host and fake VM provider complete every journey state in a
real browser before any live provider is connected.

### G-085 — Prove the DigitalOcean single-server Relay Host

Goal: provision one clean DigitalOcean VM, install the npm-delivered Relay Host
supervisor, pull the signed Relay Cell image by digest, and prove local/cloud
appliance parity plus one-cell and same-host multi-cell use.

Operator gates before live work: approve DigitalOcean OAuth/token scopes,
provide/authorize account and spending cap, approve target region and temporary
public hostname. TDR-044 was accepted by G-079.

Tasks:

1. Map Host manifest to Droplet, firewall/VPC, DNS, provider backup, bootstrap
   secret and non-root Docker/Podman/system service.
2. Prove OAuth/API scope minimization, token discard/revoke and redacted receipts.
3. Run Host create/reload/resume/partial failure/idempotent retry/rollback/delete.
4. Run first-admin/auth/TLS; one-cell then two-cell isolation; port/network/mount
   collision; capacity refusal/noisy-neighbor; same-host private runtime; backup,
   Host-loss restore, upgrade/rollback and export-to-local.
5. Reconcile actual VM/backup bill and zero orphan resources; recommend beta,
   revise or reject. Do not ship by default.

Checkpoint: operator accepts or rejects the DigitalOcean Host beta based on
recorded isolation, recovery, operations and actual spend.

### G-086 — Prove Relay Host portability before GA

Goal: after DigitalOcean/customer demand, install the identical npm-delivered
Host supervisor and Host/Cell manifest on a second VM provider or representative
local server, pull the same Cell-image digest, and prove the appliance is
portable. PaaS single-cell proof is separate and trigger-gated.

Operator gates before live work: choose the second Host target (recommended
Hetzner or customer hardware), authorize machine/account/spending and approve
the portability claim.

Tasks:

1. Apply the same Host/cell manifest, signed artifacts, isolation profile,
   lifecycle and recovery format without provider-specific Core changes.
2. Run the same one/two-cell, capacity, ingress, runtime, backup, Host-loss,
   upgrade/export/delete conformance as G-085.
3. Compare bootstrap, firewall, storage, backup, recovery, cost and support
   semantics; document differences at the adapter/Host boundary.
4. Retain TDR-044 unless portability evidence requires an operator-approved
   amendment or superseding decision.

Checkpoint: Relay may claim portable local/cloud Host deployment; a PaaS adapter
remains optional rather than a condition of GA.

## Regression test budget

### G-078 planning artifacts

- Cost model: exact 1/10/100-cell Host count/plan/capacity/backup assertions plus
  schema/date/currency guards.
- Source parity: all required providers, topology families, load-bearing layers,
  acceptance criteria and child goals appear in their authoritative artifacts.
- Link/path validation: local references and source URLs are syntactically valid;
  no unrelated legacy-project provenance appears.

### Future feature tests

- Host/cell isolation: at least two same-host cells; processes, DB/files, mounts,
  networks, loopback ports, secrets, identities, licenses, logs, resource limits,
  runtime policies, backups and receipts; collision/path escape/misbound ownership.
- Artifact: fresh install, restart, read-only root, missing/wrong volume, SIGTERM
  under idle/task/backup/migration, digest/signature mismatch and rollback.
- Identity: route inventory plus unauthenticated/authenticated/expired/revoked,
  bootstrap race/replay/expiry, CSRF/origin, rate limit, session fixation/rotation,
  forwarded-header spoof, recovery and local-mode compatibility.
- Recovery/secrets: empty/large/changed DB and files, concurrent backup, upload
  interruption, corrupt/truncated/wrong-key/wrong-version manifest, lost volume,
  retention and browser/API redaction.
- Host/deploy domain: every legal/illegal Host/cell transition, entitlement
  states, stale price/density, capacity refusal, duplicate activation, provider
  timeout/partial, Host/cell rollback failure and remaining-resource receipt.
- UI: every journey/state/error, reload and back navigation, duplicate clicks,
  stale edits, external links, keyboard/focus/live regions, destructive confirmation,
  mobile/desktop/light/dark/system cursor.
- Conformance: same Host/cell suite locally, on fake VM provider, DigitalOcean,
  and later the approved second Host; actual bill/resource inventory when authorized.

### Runtime-registry smoke budget

G-078 itself does not modify runtime code. G-083/G-085/G-086 or hybrid/runtime goals may
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
| TDR/Host trust model not approved | Implementation/provider goal remains operator-gated | Continue deterministic contract work only; do not provision |
| Public identity goal incomplete | Provider public smoke blocked | Use local/private fixture; finish G-081 and security review |
| OCI/native binding fails in target image | Artifact verification fails before provider work | Repair build target or choose supported base; rerun fresh image smoke |
| Cloud authorization denied/expires | No resource mutation; named scope failure | Reauthorize same plan digest with minimum scopes |
| Provider creates partial resources | `partially-provisioned` plus exact bill risk | Resume idempotently or scoped rollback, then inventory provider |
| Cell port/network/mount/owner collision | Cell creation refused with exact resource | Repair allocation/manifest; never reuse another cell's resource |
| Host capacity exhausted | Admission refusal with limiting resource | Resize Host or add an independent Host shard |
| Host administrator is not trusted by tenant | Same-host isolation claim invalid | Place tenant on a separate VM/machine |
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

- TDR-044, same-Host trust, minimum hardening, transfer/revocation and
  provisional admission were accepted by G-079 on 2026-07-16.
- Approve DigitalOcean scopes/account/region/spending for G-085 and choose the
  second Host target/portability claim for G-086.
- Approve remote identity model/public trust copy and any compliance claims.
- G-095 accepted `product:relay-host`, the annual launch grant, and
  customer-protective lapse/security-update behavior. Website G-030 still owns
  public amount, checkout, and issuance implementation.
- Approve backup retention/key recovery and RPO/RTO targets.
- G-060's first topology, content-free metadata, per-cell secret ownership and
  synthetic first slice were approved 2026-07-16. Separately approve any
  managed Orionfold control plane, credential custody, remote database or
  distributed scheduler.
- Separately authorize push, publish, release, public template/marketplace entry,
  DNS changes or paid resources.

## G-078 completion boundary

G-078 is complete when the spec, research, cost inputs/script, wireframe, proposed
TDR, threat model, program plan and G-079–G-086 backlog goals are internally
consistent; the deterministic cost/link/parity/diff checks pass; Relay-owned
artifacts are locally committed; and no external cloud write or provider claim is
made. Implementation begins with G-079, not within G-078.
