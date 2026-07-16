---
generated: 2026-07-16
mode: integration-design
goal: G-078
---

# Architect Report — Licensed self-service cloud deployment

## Decision frame

The requested product is a paid, license-gated end-customer feature: a customer
starts in Relay, chooses an understandable deployment shape, sees a current cost
and scalability estimate, authorizes their own cloud account, and receives a
working licensed Relay deployment with explicit ownership and recovery details.
It is not primarily an Orionfold operator provisioning console. Reusing the same
contracts for operator deployments is a consequence, not the design center.

“Single click” must mean one guided product path after the unavoidable customer
choices and provider authorization. It must not conceal cloud billing, region,
data residency, capacity, credentials, destructive replacement, or recurring
cost. The customer owns the target cloud account and bill by default; any future
Orionfold-hosted control plane or managed service is a separate product decision.

The relevant product-category precedents change what “cloud” should mean here.
OpenClaw, Hermes Agent, and NemoClaw do not begin by separating application,
database, queue, event, and model-runtime layers into a horizontally scalable
PaaS system. They run a durable agent stack on one local device, home/office
server, or cloud VM and add isolation, remote access, backup, and lifecycle
around that machine. Relay should follow that center of gravity.

## Current architectural constraints

- TDR-010 deliberately chose `better-sqlite3` with WAL and records the resulting
  single-machine limit. A topology with Relay on one host and its database on
  another is **not supported by the current data layer**. It needs an explicit
  persistence decision: keep one local SQLite database and volume per isolated
  instance with backups/replication, or add a tested remote database adapter and
  migration path. A shared SQLite file on network storage is not an acceptable
  shortcut.
- G-058 keeps Relay Core single-tenant and makes process/database/file/credential
  isolation explicit. “Relay clones per customer” should therefore mean an
  isolated process or container with its own data directory, volume, secrets,
  identity, and hostname—not a new implicit `tenantId` layer.
- G-060 already owns the isolated-instance fleet contract. G-078 needs its
  provisioning and lifecycle contract, but its primary authority must be the
  licensed customer operating their own deployment. Cross-customer fleet
  metadata must not become a shared customer data plane.
- TDR-006, TDR-041, TDR-042, and TDR-043 already allow Ollama, LiteLLM, and
  LM Studio endpoints to be local, LAN, remote, or cloud. Cloud deployment must
  preserve provider identity and capability semantics instead of treating every
  OpenAI-compatible endpoint as interchangeable.
- Relay currently warns that non-loopback serving has no network authentication.
  Internet exposure therefore requires a new remote-access identity/session,
  TLS, CSRF, rate-limit, and administrative bootstrap boundary before a cloud
  deploy can be called production-ready.
- The shipped offline Ed25519 entitlement verifier and file-backed license store
  are reusable. The deploy entry point, manifest generation, provisioning start,
  and lifecycle mutations should require a dedicated paid entitlement (working
  name `product:relay-cloud-deploy`) using the same signature → term → entitlement
  contract as paid Packs. Existing deployed data must never be deleted or held
  hostage when a license is missing; the exact renewal/upgrade policy is a product
  gate.

## Cross-layer architecture posture

G-078 must not assume one global answer to “local or cloud.” It should decide the
posture independently for each load-bearing layer while keeping one product-level
contract. For every layer, research and planning must compare:

- **A — Preserve:** keep the current local implementation and make cloud
  deployment an isolation/packaging/operations concern with no significant core
  change.
- **B — Dual substrate:** define one typed domain port and provide deliberate
  local and cloud adapters with a shared conformance suite. The mode is selected
  at an instance boundary, never through scattered `if (cloud)` branches.
- **C — Unified re-architecture:** replace the current substrate with one design
  that truthfully meets local and cloud requirements, including offline use,
  install footprint, portability, operations, and failure recovery.

This is a decision framework, not a requirement that all layers choose the same
letter. A single unified product contract with selective substrate adapters is
the likely shape; pervasive global “cloud mode” branching would multiply
behavioral states and make failures difficult to reproduce.

| Layer | Current posture | A: preserve | B: dual substrate | C: unified replacement |
|---|---|---|---|---|
| Operational data | synchronous Drizzle + local SQLite/WAL | isolated SQLite volume per Relay instance plus verified backup/restore | shared repository/domain contract with SQLite and remote-DB adapters | one database technology for local and cloud, only if it remains genuinely zero-config/offline locally |
| Files/documents/model artifacts | instance-local filesystem | persistent per-instance volume | filesystem and object-storage adapters with content/atomicity parity | one content-addressed store available in both environments |
| Secrets | server-local settings/files and provider-specific handling | customer-provisioned encrypted files/volume | local keychain/file and cloud secret-manager adapters behind references | one portable encrypted secret envelope with a separate root-of-trust provider |
| Identity and public access | trusted local/loopback, auth-light LAN serving | cloud reverse proxy supplies a separately verified access boundary | explicit local-trusted and remote-authenticated exposure profiles behind one authorization contract | one identity/session system everywhere, including a safe offline-local bootstrap |
| Scheduling/execution/leases | one long-lived Relay process and SQLite coordination | one scheduler/executor per isolated instance | local in-process and distributed queue/lease adapters | one durable execution substrate that does not add mandatory cloud infrastructure locally |
| Live logs/events | process-local state, DB polling, SSE | sticky/single-instance routing | local event source and distributed pub/sub adapter | one durable event log usable offline and across replicas |
| Model runtimes | capability-driven endpoint registry | retain endpoint contract and deploy runtime beside Relay when selected | local-process and remote/private-service lifecycle adapters | one remote-first gateway only if it does not erase direct local runtime value |
| Backup/restore | SQLite/file snapshots | copy instance snapshots to customer-selected durable storage | local archive and object-storage adapters with the same manifest | one content-addressed snapshot format and pluggable storage transport |
| Observability | local logs/Monitor/diagnostics | customer downloads support evidence | local and cloud telemetry sinks behind a redacted event contract | one local-first observability store with optional export |
| Configuration/distribution | npm/npx, data directory, instance bootstrap | add a signed OCI wrapper and cloud manifest | npm/local and OCI/cloud launch adapters from one versioned config schema | one artifact format only if it preserves the current low-friction local install |

Each row needs an evidence-backed decision record that scores implementation and
migration effort, semantic mismatch, steady-state operating cost, local-first
regression risk, cloud scalability benefit, portability/exit cost, security and
privacy, failure/recovery behavior, performance/footprint, test-matrix growth,
rollback, and the measurable trigger for revisiting the choice. “One abstraction”
is not automatically a benefit: SQLite and Postgres, filesystem and object
storage, or in-process and distributed queues have different concurrency and
failure semantics. A shared interface is acceptable only when its contract does
not pretend those differences are absent.

G-078's amended recommendation is a **Relay Host appliance with isolated cells**:
the same signed host/cell stack runs on a local device or customer-owned cloud
VM. One host supervisor manages local containers/processes; each cell has its own
Relay process, loopback port/network, data directory, SQLite database, files,
identity, secrets, license, logs, resource budget, backup lineage, and runtime
policy. The supervisor stores only content-free lifecycle metadata. A shared
host is acceptable only when every tenant trusts the host operator; hostile
tenants receive separate hosts/VMs.

This preserves SQLite, live files, and one scheduler per cell while introducing
deliberate boundaries for host lifecycle, backup transport, secrets root of
trust, authenticated ingress, distribution, and optional redacted observability.
It is recorded in proposed TDR-044. The database/distributed-system revisit
triggers remain active-active writers inside one cell, a distributed worker
requirement, measured single-cell capacity failure, accepted RPO/RTO failure, or
paying demand for a multi-host shared control plane.

## Reference-system deployment evidence

Primary documentation checked on 2026-07-16 shows a convergent appliance model:

| System | Local/cloud placement | Isolation and lifecycle | Architectural implication for Relay |
|---|---|---|---|
| OpenClaw | one Gateway owns state/workspace on a device or VPS | experimental Fleet is a local Docker/Podman supervisor; one complete cell per tenant with separate state, credentials, network, token and loopback port; no shared tenant data plane or remote cell hosts | strongest direct precedent for one Relay Host with one cell per tenant |
| Hermes Agent | one backend lives on laptop, home server, Mini or VPS; execution can use local, Docker, SSH, Daytona or Modal | one durable data directory; non-loopback dashboard engages auth; production guidance favors container/remote execution and explicit user allowlists | device choice changes placement and execution isolation, not the core database/application architecture |
| NVIDIA NemoClaw | same agent stack can run locally, on-prem or on a remote GPU VM | host CLI + host OpenShell gateway + Docker sandbox; gateway holds credentials and enforces egress; default Docker driver is not Kubernetes | supports host control plus isolated sandbox, versioned blueprint, digest and policy as the cloud/local parity layer |

Common pattern:

`device or VM → host lifecycle/security boundary → isolated agent cell/sandbox →`
`local state and workspace → hosted or host-local inference → portable backup`

None of these precedents proves Relay can safely co-host hostile customers. They
all keep the host/operator privileged and strengthen isolation by moving a trust
boundary to a separate container, OS user, VM, or machine.

## Provider capability comparison

Research checked primary vendor documentation on 2026-07-16. Prices are inputs
to a dated estimator, not durable product constants.

| Provider family | Complete Relay fit | Best role | Important constraint |
|---|---:|---|---|
| DigitalOcean | strongest first appliance proof | one clean Droplet runs the Relay Host, cells, reverse proxy/tailnet, local volume, optional runtime and backup agent | Relay owns host hardening/upgrades; local LLMs require a larger or GPU host |
| Hetzner | strong low-cost appliance/second-provider candidate | one VM or dedicated host with Docker, firewalls, volumes and backups | more regional/plan variation and the same Relay-owned host operations |
| Railway | valid later single-cell adapter | one Relay cell with volume/TLS/template | cannot express Relay's local multi-cell host supervisor without changing the product boundary; per-service cost scales linearly |
| Render | valid later single-cell adapter | Docker service, TLS and disk | one disk per service; host-level cell packing/runtime composition is not exposed |
| Fly.io | VM-like later adapter | Machines, private networking and local volumes | local volumes remain single-host; Fleet-style local supervisor needs explicit Machine/runtime design |
| Cloudflare | component fit; Containers candidate | front door, DNS/TLS, tunnel, R2 artifacts/backups, control plane | Workers are not a native fit for Relay's long-lived Node/SQLite process; Containers maturity, persistence, regions, and GPU fit need proof |
| Vercel | component fit | polished web/control-plane surface and provider handoff | Functions have ephemeral/read-only storage outside `/tmp`, duration limits, and no WebSocket server; unchanged Relay and local model runtimes do not fit |
| Supabase | component fit | managed Postgres/Auth/Storage if Relay adopts that contract | Edge Functions are bounded and do not host the current Relay process; current Relay has no Postgres adapter |
| GPU specialists / major clouds | runtime-only candidate | dedicated Ollama/LM Studio/vLLM model serving or managed inference | GPU idle cost, model cache, cold start, regions, quotas, and licensing dominate economics |

Useful primary sources:

- Vercel runtime and function limits:
  https://vercel.com/docs/functions/runtimes and https://vercel.com/docs/limits
- Supabase Edge limits and compute pricing:
  https://supabase.com/docs/guides/functions/limits and
  https://supabase.com/docs/guides/platform/manage-your-usage/compute
- Cloudflare Workers and Containers pricing:
  https://developers.cloudflare.com/workers/platform/pricing/
- Railway pricing, templates, and private networking:
  https://docs.railway.com/pricing,
  https://docs.railway.com/templates/deploy, and
  https://docs.railway.com/private-networking
- Render Blueprints, disks, and private services:
  https://render.com/docs/infrastructure-as-code,
  https://render.com/docs/disks, and
  https://render.com/docs/private-services
- Fly pricing, volumes, and networking:
  https://fly.io/docs/about/pricing/,
  https://fly.io/docs/volumes/overview/, and
  https://fly.io/docs/networking/
- DigitalOcean App Platform, Marketplace, and Droplet/GPU pricing:
  https://docs.digitalocean.com/products/app-platform/details/features/,
  https://docs.digitalocean.com/products/marketplace/, and
  https://www.digitalocean.com/pricing/droplets
- Hetzner server topology primitives:
  https://docs.hetzner.com/cloud/servers/getting-started/creating-a-server/
- OpenClaw multi-tenant cells, VPS placement, and security:
  https://docs.openclaw.ai/gateway/multi-tenant-hosting,
  https://docs.openclaw.ai/vps, and
  https://docs.openclaw.ai/security
- Hermes Docker, remote backend, and production security:
  https://hermes-agent.nousresearch.com/docs/user-guide/docker/,
  https://hermes-agent.nousresearch.com/docs/user-guide/desktop, and
  https://hermes-agent.nousresearch.com/docs/user-guide/security/
- NemoClaw architecture, overview, and platform support:
  https://docs.nvidia.com/nemoclaw/latest/user-guide/openclaw/reference/architecture,
  https://docs.nvidia.com/nemoclaw/latest/about/overview.html, and
  https://docs.nvidia.com/nemoclaw/user-guide/hermes/reference/platform-support
- SQLite WAL, Litestream directory replication, LiteFS, and Turso Sync:
  https://sqlite.org/wal.html,
  https://litestream.io/guides/directory/,
  https://fly.io/docs/litefs/, and
  https://docs.turso.tech/sdk/ts/reference
- Ollama network/Docker behavior, LiteLLM Proxy, and LM Studio headless server:
  https://docs.ollama.com/faq,
  https://docs.litellm.ai/, and
  https://lmstudio.ai/docs/developer/core/headless

## Topologies the goal must compare

1. **Single-device appliance.** One laptop, desktop, Mini, home/office server,
   or workstation runs one Relay Host and one or more isolated cells. This is the
   local product and the compatibility reference for every cloud feature.
2. **Single cloud-server appliance.** One customer-owned VM runs the same Host,
   cells, local SQLite/files, reverse proxy/tailnet, backup agent, and optional
   same-host runtime. This is the first paid deployment path.
3. **Sharded host fleet.** When one host reaches measured resource capacity,
   create another independent Relay Host and place new cells there. Each host
   remains a standalone failure/data boundary; a minimal inventory may span
   hosts, but it does not proxy customer data or become required for cell use.
4. **PaaS single-cell adapter.** A provider service runs one cell with one
   persistent volume. It can be convenient for an individual customer but is not
   the reference multi-tenant architecture and does not require remote Postgres.
5. **Distributed dedicated.** Relay application hosts, model-runtime CPU/GPU
   hosts, database/storage, and control-plane services live separately on a
   private network. This is a trigger-gated enterprise path, with higher latency,
   authentication, service-discovery, egress, and failure-recovery complexity.
6. **Hybrid customer runtime.** Cloud Relay reaches a customer's LAN/VPC Ollama,
   LiteLLM, or LM Studio through an outbound-established, authenticated tunnel or
   agent. This can avoid cloud GPU cost and keep models private, but requires a
   zero-trust connectivity and availability contract.
7. **Edge control plane plus stateful instance hosts.** Vercel or Cloudflare can
   own the deploy/licensing UX and front door while Railway, Render, Fly,
   DigitalOcean, or customer VMs run stateful Relay instances. Supabase may own
   selected auth/data services only if an approved data contract justifies it.
8. **Kubernetes/operator topology.** Container orchestration can support large
   fleets, dedicated namespaces/nodes, GPUs, and policy controls, but should be a
   later enterprise adapter rather than the startup-friendly first proof.

Every topology must state whether model capacity is BYOK external API, shared
customer-owned gateway, or dedicated runtime; whether an instance can sleep;
where its database/files/secrets live; and how it is backed up, restored,
upgraded, exported, transferred, and deleted.

## Cost and scalability contract

The customer chooser should present dated device/server capacity bands for one
cell, a small single-host fleet, and a sharded 100-cell fleet. It must show cell
packing as an assumption constrained by measured memory, CPU, storage, task
concurrency, local-runtime capacity, and a safety reserve—not as guaranteed tenant
density. The calculator must expose:

`monthly total = host count × (VM/server + host backup + storage) +`
`optional runtime/GPU + egress + support`

BYOK model/API charges remain separate because the customer pays the model
provider. DigitalOcean currently lists Basic VM bands from $6/month for 1 GiB,
$12 for 2 GiB, $48 for 8 GiB, and $96 for 16 GiB, with weekly backups at 20% of
Droplet cost. The official OpenClaw guide uses the $6/1 GiB host for one
API-model Gateway and recommends upgrading for memory pressure; Relay must
measure its own safe cell density. Local inference is a separate capacity class
and may require a larger/GPU server. Estimates need sources, capture date,
region/currency/tax notes, safety reserve, expected/upper-bound cases, and a
visible “provider bill is authoritative” disclaimer.

## Recommended sequencing

G-078 should remain a research/specification/decision goal. It should not become
one umbrella implementation project. Its approved output should groom bounded
implementation goals in this order:

1. **Architecture posture ledger:** complete the A/B/C comparison for every
   load-bearing layer, record the selected posture and revisit trigger, define
   shared conformance boundaries, and reject any cross-layer combination whose
   failure or migration semantics do not compose.
2. **Isolation and fleet contract:** finish/amend G-058 and G-060 so customer-owned
   self-service authority, per-instance identity, ownership transfer, and no
   cross-customer data plane are explicit.
3. **Cloud-safe Relay artifact:** reproducible signed OCI image; immutable release
   input; data-dir/volume contract; health/readiness; graceful shutdown; install,
   upgrade, rollback, export, and restore; no dev bootstrap side effects.
4. **Remote-access trust boundary:** first-user/admin bootstrap, TLS, sessions,
   CSRF, rate limits, password/identity recovery, audit receipts, and safe public
   binding.
5. **Persistence decision:** preserve isolated local SQLite plus verified
   backups/restore for the first slice, or approve a remote database adapter and
   migration. Do not block the first proof on Postgres unless its benefits are
   required by the selected topology.
6. **Secrets and runtime networking:** customer-owned provider credentials,
   encryption/rotation/redaction, private service discovery, TLS/auth for model
   endpoints, outbound trust/SSRF policy, and hybrid tunnel design.
7. **Relay Host supervisor:** local-only cell create/inspect/start/stop/replace/
   upgrade/export/delete, isolated mounts/networks/ports/resources, minimal
   metadata, and host capacity/admission control. No shared content plane.
8. **Device/cloud deploy UX:** choose local device or cloud server, size the
   host, preview cells/runtime/cost, authorize one VM provider, install the same
   host manifest, and hand off with partial-failure rescue.
9. **Operations:** backup/restore drills, upgrades, capacity/quotas, cost alerts,
   observability without content telemetry, support bundle, deletion, and
   customer portability.

The first conformance proof should install the Relay Host on a clean DigitalOcean
VM and prove one cell, multiple same-host cells, host capacity refusal, backup/
restore, upgrade, export, and full host deletion. A second clean VM provider or
local hardware proves appliance portability before GA claims. Railway becomes a
later single-cell convenience adapter rather than a prerequisite. Provider
shipment, exact entitlement/renewal semantics, remote identity, host trust
language, cell-packing limits, persistence changes, and any Orionfold-hosted
control plane remain operator gates.

G-078 decomposes the sequence into G-079 through G-086. The durable specification,
research report, cost model, threat model, wireframe and executable program plan
own the detailed acceptance and rescue contracts.

### Portfolio alignment and release implications

The architecture changes the ordering of adjacent goals without making every
aligned goal a hard blocker:

- G-058 must finish before G-060 is accepted, and both must finish before G-079.
  The live queue must therefore place these goals in that order.
- After G-079, G-080 and G-081 can progress in parallel. G-082 needs the signed
  artifact from G-080; G-083 waits for all three implementation foundations.
- G-034 is a conditional artifact preflight rather than an open-ended
  modernization dependency. G-036 remains trigger-gated by measured package or
  install cost.
- G-020 and G-030 deliver small standalone customer improvements before G-084
  and supply shared freshness and retain-versus-purge semantics to the Host UX.
- G-073 may start research immediately and may implement a local connector
  tranche after G-079. G-074 reuses its kernel. Any cloud-Host connector claim
  additionally conforms to G-081 ingress/identity and G-082 secret/recovery
  contracts; neither connector goal needs to wait for DigitalOcean.
- G-059 becomes executable after G-080 supplies a disposable Host/cell fixture,
  even if the original customer environment remains unavailable.
- G-062 may proceed independently for general dashboard value, but Host/cell
  health modules consume G-083's typed lifecycle API rather than scraping
  supervisor internals.
- G-025 is a recurring release gate after the local artifact, security/recovery,
  licensed Host UX, and DigitalOcean slices—not a one-time prerequisite.

The resulting customer-value train is:

1. **R0 isolation contract:** G-058 → G-060 → G-079.
2. **R1 local Host alpha:** G-034 is a conditional preflight, G-038 is a
   parallel quick win, and G-080 produces the artifact.
3. **R2 secure/recoverable Host alpha:** G-081 in parallel with G-082.
4. **R3 licensed local Host beta:** finish G-030 before G-083 locks retention,
   finish G-020 before G-084 locks estimate semantics, then G-083 → G-084.
5. **R4 DigitalOcean beta:** G-085.
6. **R5 portable Host GA:** G-086 after demand and second-target authorization.

Run G-025 after each implementation increment. The program plan owns the full
dependency matrix, conformance gates, and parallel connector stream.

## Verification and rescue

- Synthetic licensed/unlicensed/expired/wrong-entitlement tests prove every
  deploy/lifecycle mutation is gated while existing customer data remains
  exportable and recoverable.
- Host/cell contract tests validate local manifests without credentials;
  provider bootstrap tests validate generated infrastructure plans;
  disposable paid-account smoke is separately authorized and records actual
  line-item cost.
- A fresh customer journey must cover entitlement discovery, topology/cost
  comparison, provider authorization, BYOK/runtime setup, successful deployment,
  first login, health check, backup/restore, upgrade/rollback, export, and delete.
- Isolation tests use at least two customer instances and prove separate data,
  files, credentials, hostnames, logs, and runtime policy.
- Architecture-posture tests prove each selected shared contract against every
  supported adapter and exercise cross-mode export/import, migration, rollback,
  mixed-version refusal, and failure-semantic differences. The plan must state
  the exact multiplication in CI/runtime smoke cases before approving any dual
  substrate.
- Failure injection covers host capacity refusal, cell port/network/mount
  collision, wrong ownership, provider rejection, partial host provisioning,
  timeout, callback loss, secret write failure, unhealthy cell, runtime outage,
  backup failure, upgrade failure, and stale price data.
- Stop after two materially different provider/API approaches fail on the same
  blocker; preserve the generated plan and resources, report exact cleanup state,
  and require an operator decision before changing topology.

---

*Generated by `/architect` — integration-design mode*
