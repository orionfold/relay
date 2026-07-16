---
title: G-078 cloud deployment research
captured: 2026-07-16
currency: USD unless noted
status: complete-for-planning
---

# Cloud deployment research and decision matrix

## Method

This report uses current official product documentation retrieved through
2026-07-16.
Marketing comparisons and third-party price calculators were not used as evidence.
Prices are dated inputs, vary by region and taxes, and must be refreshed before a
customer-facing estimate. “Full host” means the platform can run Relay's current
long-lived Node process with persistent local storage; “component” means it can
contribute ingress, identity, database, storage, or control-plane capability but
cannot host unchanged Relay safely.

No provider account was connected and no billable resource was created.

## Current Relay constraints that drive provider fit

| Constraint | Repository evidence | Consequence |
|---|---|---|
| Long-lived Next.js process | `bin/cli.ts`, `src/instrumentation-node.ts` | bounded edge functions are not an unchanged host |
| Local `RELAY_DATA_DIR` | `src/lib/config/env.ts`, `src/lib/utils/ainative-paths.ts` | live DB/files require persistent local volume or an explicit data redesign |
| Synchronous SQLite/WAL | `src/lib/db/index.ts` | one writable host/volume; no network-mounted SQLite |
| Process-owned scheduling/services | `src/instrumentation-node.ts` | scale-to-zero and multiple replicas require lifecycle/ownership proof |
| Local snapshots/restore | `src/lib/snapshots/*` | cloud needs off-host transport, integrity, key, and restore drills |
| Auth-light non-loopback serving | `bin/cli.ts` | authenticated ingress is a hard dependency, not provider polish |
| Local secret root | `src/lib/utils/crypto.ts` | cloud needs a recoverable customer-owned root of trust |
| Offline entitlement | `src/lib/licensing/*` | cloud gate can reuse verifier but must add lifecycle policy |

## Reference products: how local and cloud actually work

Relay was originally modeled around the OpenClaw/Hermes/NemoClaw product class.
Their current primary documentation is more directly relevant than generic PaaS
comparisons because it shows how always-on local-first agents cross from a device
to a server.

| System | Local deployment | Cloud/remote deployment | Isolation/security model | What it does not require |
|---|---|---|---|---|
| OpenClaw | one Gateway owns state/workspace on a local device; daemon/systemd or Docker are options | run the same Gateway on a Linux VPS; keep it loopback and use SSH/Tailscale, or require token/password/trusted-proxy auth | one trusted operator boundary per Gateway; experimental Fleet runs one full hardened container “cell” per tenant with separate state, credentials, workspace, token, network and loopback port | no shared remote database, distributed queue, app replicas or cross-tenant data plane |
| Hermes Agent | one backend/data directory on laptop; optional Docker terminal sandbox | one `hermes serve` backend on VPS/home server/Mini, kept alive by systemd; desktop/messaging connects remotely; OAuth for public access or VPN for shared-password access | explicit user allowlists/pairing, dangerous-command approval, hardened Docker/Modal/Daytona execution, cross-session isolation | no horizontally scaled Hermes application or mandatory managed database |
| NVIDIA NemoClaw | host CLI + host OpenShell gateway + Docker sandbox; local or hosted inference | remote-GPU path provisions one VM, installs Docker/OpenShell/NemoClaw and runs the same sandbox stack | gateway holds credentials outside sandbox, L7 egress injection/policy, read-only system paths, restricted network/filesystem/process; versioned digest-verified blueprint | default Docker-driver topology is not Kubernetes and does not split the agent into PaaS services |

### Shared architecture pattern

All three converge on:

`local device or cloud VM → trusted host supervisor/gateway → isolated agent`
`cell/sandbox → local persistent state/workspace → local or hosted inference`

OpenClaw is the strongest direct tenant precedent. Its Fleet documentation says
mutually untrusted organizations require separate complete cells, that each cell
is local to one Docker/Podman host, and that Fleet does not proxy tenant messages
or create a shared application data path. The host administrator remains trusted
by every tenant; stronger administrative separation means a separate VM/machine.

Hermes reinforces the device/server equivalence: a remote backend is simply a
long-running Hermes server on another machine, with authentication engaged when
it binds beyond loopback. NemoClaw reinforces the host/sandbox split and shows
that credentials, egress policy, artifact digests and lifecycle can be hardened
without turning the application into a distributed system.

### Relay conclusion from the precedents

The reference architecture should be one **Relay Host** on a local device or
customer-owned VM. A Host can run one or more full isolated **Relay cells** when
all tenants accept the same host operator. Each cell owns its own process,
SQLite/data directory, files, secrets, identity, license, local port/network,
logs, resource limits and backup lineage. The Host supervisor stores only
content-free lifecycle metadata and performs local container/process lifecycle.

Capacity scales up within a Host and then out by adding independent Host shards.
It does not scale one tenant across app replicas, remote Postgres, queues and
pub/sub until a measured requirement says the single-cell boundary has failed.

## Provider comparison

| Provider | Relay host fit | Guided deploy primitives | Stateful/private primitives | Main risk | Recommended G-078 role |
|---|---|---|---|---|---|
| DigitalOcean | Strongest first Host proof | Droplet API/cloud-init, snapshots/backups, VPC/firewall, GPU options | complete VM can run Docker/Podman Host supervisor, cells, reverse proxy/tailnet and optional runtime | Relay owns OS/firewall/update/backup hardening; small API-model VM cannot run local LLMs | first customer-owned cloud-server appliance |
| Hetzner | Strong low-cost second Host proof | VM API/cloud-init, private networks, firewalls, volumes/backups | complete VM/dedicated host supports the same appliance | regional/price variation and Relay-owned operations | second-provider or cost-oriented Host adapter |
| Railway | Valid single-cell PaaS adapter | templates, OAuth/API, image deploy | volume, managed TLS, private service network | does not expose one customer VM for a local multi-cell supervisor; per-cell service floor | later convenience adapter, not reference |
| Render | Valid single-cell PaaS adapter | Blueprint IaC, Docker service | TLS, private service, persistent disk | one disk/service and no Host-level cell packing | later convenience adapter |
| Fly.io | VM-like later Host/single-cell candidate | Machines API and app manifests | local volumes/private network | volume/Machine ownership and local supervisor need explicit proof | later provider adapter |
| Cloudflare | Component fit; Containers need proof | Workers, APIs, Terraform | TLS/DNS, Tunnel, R2; Containers emerging | Workers have 128 MB and CPU constraints; container persistence/regions/GPU maturity must be proven | ingress/control-plane/storage component only for v1 |
| Vercel | Component fit | polished web/control plane, integrations | managed ingress; external data services | function filesystem is ephemeral/read-only outside `/tmp`; duration limits and no WebSocket server | optional deploy UX/front door, not current Relay host |
| Supabase | Component fit | project APIs and integrations | managed Postgres, Auth, Storage, Edge Functions | Edge Functions have 256 MB and bounded CPU/duration; Relay has no Postgres adapter | future identity/data component only after contract decision |
| Major clouds/GPU specialists | Strong but high-complexity | APIs, Terraform/marketplaces | complete VM/container/network/GPU primitives | account/IAM complexity, quotas, support surface, GPU idle cost | runtime-only or later enterprise adapter |

### Why DigitalOcean first

DigitalOcean maps directly to the reference category: the official OpenClaw
guide provisions one clean Ubuntu Droplet, installs one non-root Gateway service,
keeps its control endpoint loopback/Tailscale by default, and backs up portable
state. Relay can prove the same device-to-VM equivalence without first inventing
a remote database or service mesh. The adapter must still prove least-privilege
authorization, cloud-init/bootstrap secrecy, host firewalling, unattended
security updates, cell isolation, OCI verification, backup/restore, recovery
console escape hatch, cost admission and complete cleanup.

### Why PaaS moves later

Railway/Render remain good ways to run one stateful Relay cell, but their service
and volume primitives do not express the most relevant product feature: one
customer-owned Host managing multiple locally isolated cells and optional
same-host runtimes. Making PaaS primary would push Relay toward per-service cost,
provider-specific lifecycle and distributed components before user evidence
requires them.

## PaaS/component evidence

- Vercel Functions have read-only filesystems except `/tmp`; function duration
  and runtime limits make them unsuitable for Relay's unchanged stateful process.
  Vercel also documents that a function cannot act as a WebSocket server.
- Supabase Edge Functions document 256 MB memory, 400-second paid wall-clock,
  and 2-second CPU/request limits. Supabase compute is a dedicated Postgres
  instance per project; adopting it is a database decision, not deployment glue.
- Cloudflare Workers document 128 MB memory and CPU limits. Containers may later
  fit the stateful process, while Workers/R2/Tunnel can already serve bounded
  control, backup, or connectivity roles.
- Render Blueprints describe multiple services/databases and Docker; persistent
  disks preserve a service filesystem but attach to only one service instance.
- Fly volumes are local persistent storage attached to one Machine and are not
  automatically replicated. Suspend/start economics are attractive only after
  the scheduler and background-service contract can tolerate it.

## Model runtime evidence

| Runtime | Cloud fit | Security/cost implication |
|---|---|---|
| BYOK hosted APIs | default | no Relay GPU infrastructure; provider token cost remains outside cloud estimate |
| Ollama | Docker-supported; can bind beyond loopback | local API requires no authentication; keep private and/or add authenticated gateway |
| LM Studio | official `llmster` headless mode runs on Linux/cloud/GPU/CI | suitable private runtime candidate; licensing/model compatibility still customer responsibility |
| LiteLLM Proxy | official Docker; virtual keys, authentication and cost tracking | good customer-owned model gateway; upstream secrets and admin authority stay customer-side |

The customer chooser must not equate OpenAI-compatible transport with identical
provider semantics or claim every local runtime/model will run on cheap CPU.

## Database options

| Option | Local fit | Cloud scale benefit | Semantic/operational cost | G-078 disposition |
|---|---|---|---|---|
| Current SQLite/WAL + volume + encrypted off-host recovery | exact current behavior | one writable instance; portable | host/volume recovery interval, no active-active | select for v1 |
| Litestream directory replication | keeps SQLite files; supports multiple DBs to S3/GCS/Azure/SFTP/local | continuous off-host replication/restore | separate file directories and restore/key/runbook proof; not multi-writer HA | candidate recovery transport spike |
| LiteFS | local SQLite reads with replicated nodes | read replicas and primary failover | FUSE, single primary, async replication/data-loss window, write routing, pre-1.0; Fly warns against autostop combination | not v1 default; later conformance spike |
| Turso Sync | local reads/writes with explicit cloud push/pull | managed sync and local-first operation | new engine/client, conflict/sync/auth/checkpoint semantics; Drizzle support maturity to prove | later unified-substrate candidate |
| Remote Postgres | mature shared remote data | multi-replica app and stronger managed HA options | network failures, pools, async driver, dialect/schema migration, local-mode story, dual test matrix | trigger-gated, not v1 prerequisite |
| PGlite | embedded Postgres/WASM | SQL compatibility experiments | virtual filesystem/memory/browser-oriented constraints; not a proven replacement for current Node SQLite operations | reject for v1 |

SQLite's official WAL documentation says every process must be on the same host
and WAL does not work over network filesystems. This rules out “database on
another VM” unless Relay adopts a remote database protocol or synchronization
architecture. It does not rule out one local SQLite database per cloud instance.

## Architecture posture scoring

Scores are relative for G-078: 1 favorable, 5 costly/risky. “Benefit” is reversed:
5 is highest cloud benefit. The selected letter is justified by benefit versus
migration/test cost rather than architectural fashion.

| Layer | Preserve effort/risk | Dual effort/risk | Unified effort/risk | Cloud benefit of change | Selected v1 |
|---|---:|---:|---:|---:|---|
| Operational data | 2 | 5 | 5 | 3 | A |
| Live files | 2 | 4 | 5 | 3 | A live, B backup/export |
| Secrets | 3 | 3 | 5 | 5 | B |
| Identity/public access | 5 if unchanged | 4 | 5 | 5 | B; unchanged public access prohibited |
| Host/cell lifecycle | 3 | 3 | 5 | 5 | B local device/cloud VM placements, one cell contract |
| Scheduler/execution | 2 | 5 | 5 | 2 until multi-replica | A |
| Live events | 1 | 4 | 5 | 2 until multi-replica | A |
| Runtime protocol/lifecycle | 2 | 3 | 5 | 4 | A protocol, B lifecycle |
| Backup/restore | 4 if local-only | 3 | 5 | 5 | B |
| Observability | 2 | 3 | 5 | 3 | B optional redacted sink |
| Distribution | 3 | 3 | 5 | 5 | B |

## Topology comparison

| Topology | Cost shape | Scale ceiling | Failure domains | Security/operations | Decision |
|---|---|---|---|---|---|
| Local device/server Host | existing hardware or one device cost | host resources | one host affects its cells | same appliance contract and strongest local-first parity | compatibility reference |
| Cloud VM Host with N cells | one VM plus backup; cells share host floor | host CPU/RAM/disk, then another Host shard | one host affects N cells | dedicated cell containers, networks, ports, secrets and resource admission; host operator trusted | first cloud path |
| Sharded VM Hosts | roughly linear per Host, not per PaaS service | add independent Hosts | each shard independent | minimal inventory; no shared customer data plane | growth path |
| PaaS single-cell | per-service compute/volume floor | provider service/volume limits | provider service/volume | convenient for one cell but cannot express Host supervisor | later adapter |
| Distributed app/runtime/data | more services, egress, managed DB/GPU | highest with approved data/queue contracts | independent services/network | strongest IAM/service-auth/observability burden | enterprise/trigger-gated |
| Cloud Relay + LAN/VPC runtime tunnel | avoids cloud GPU when customer owns compute | tunnel/runtime availability | cloud plus customer network | outbound agent, mutual identity, rotation and SSRF controls | later hybrid adapter |
| Edge control plane + stateful hosts | control cost amortized | fleet-level | control plane plus each host | creates Orionfold custody/availability/privacy decisions | separate managed-product decision |
| Kubernetes/operator | cluster overhead; efficient at large fleet | high | cluster/nodes/namespaces | strongest complexity/support burden | later enterprise only |

## Reproducible cost model

`features/cloud-deploy-cost-inputs.json` is the dated source catalog and
`scripts/cloud-deploy-cost-model.mjs` calculates the examples. The model is for
architecture comparison, not a quote.

Baseline assumptions:

- DigitalOcean Basic regular CPU prices captured 2026-07-16;
- 1 GiB provisional memory budget per Relay cell, 0.5 GiB Host reserve, and 90%
  maximum memory admission; these are planning inputs, not measured capacity;
- external/BYOK inference, so local model memory is excluded;
- weekly provider backup at 20% of VM cost;
- cells are packed only within one accepted host-operator trust boundary;
- taxes, object-storage requests, support, labor and model/API use excluded.

| Scenario | Host plan and count | VM + weekly backup | Meaning |
|---|---|---:|---|
| 1 cell | 1 × 2 GiB / 1 vCPU Basic | $14.40/month | smallest conservative Relay Host; OpenClaw documents 1 GiB/$6 for its lighter API-model Gateway, but Relay must measure its own floor |
| 10 cells | 1 × 16 GiB / 8 vCPU Basic | $115.20/month | provisional 13-cell memory admission; CPU/task concurrency still requires measurement |
| 100 cells | 8 × 16 GiB / 8 vCPU Basic | $921.60/month | eight independent Host shards at up to 13 cells each; no shared DB/app tier |

The calculator selects the smallest listed Host plan that satisfies provisional
memory admission, then shards when a scenario exceeds one Host. This is a more
truthful comparison than multiplying one PaaS service per tenant, but actual safe
density must be derived from Relay idle/active task measurements and storage
growth. Local inference is a separate host class: DigitalOcean lists RTX 4000 at
$0.76/hour, L40s at $1.57/hour and H100 at $3.39/hour; powered-off reserved GPU
Droplets still bill.

### Scale breaks

- A 1-cell Host can use a small VM or existing device; local inference immediately
  raises memory/GPU capacity requirements.
- Before adding a second cell, Relay must prove the Host/cell trust model,
  content-free supervisor metadata, resource limits and no cross-cell mounts,
  networks, ports, secrets, logs or runtime policy.
- When one Host reaches measured admission limits, add another independent Host
  shard. Do not split one cell across replicas or add remote Postgres merely
  because tenant count grows.
- A shared customer-owned LiteLLM/runtime can amortize runtime cost, but requires
  per-instance keys, quotas, audit, and no cross-customer prompt/log leakage.
- A remote database does not automatically reduce cost; it becomes justified by
  availability/concurrency requirements, not instance count alone.
- GPU runtime dominates totals. Sleep/delete/model-cache behavior must be explicit
  and measured; the chooser cannot extrapolate CPU Relay cost to model serving.

## Conformance proof requirements

The local-device Host fixture and DigitalOcean Host must consume the same
versioned appliance/cell manifest and pass:

1. dry-run schema/capability/price validation without credentials;
2. least-privilege provider authorization and bootstrap redaction tests;
3. Host install plus cell create/resume/idempotent-retry/partial-rollback/delete;
4. TLS/authenticated first login and no public internal services;
5. immutable artifact digest/version/health/graceful-shutdown checks;
6. two same-host cells with distinct processes, SQLite/data roots, mounts,
   networks, loopback ports, identities, licenses, secrets, logs, resource
   budgets, backups and runtime policies;
7. backup, simulated host/volume loss, restore, upgrade and rollback drills;
8. host capacity refusal, noisy-neighbor pressure, cell crash/restart, host reboot,
   provider-console inventory and bill-line reconciliation;
9. export into a fresh local Relay data directory;
10. cell removal that retains data by default, explicit purge containment, and
    full Host cleanup proving no billable resource remains.

Live items require separate account/spend authorization. G-078 only designs the
contract and deterministic tests.

## Sources

### Platforms and pricing

- OpenClaw one-cell-per-tenant Fleet, VPS and security model:
  https://docs.openclaw.ai/gateway/multi-tenant-hosting,
  https://docs.openclaw.ai/vps,
  https://docs.openclaw.ai/security, and
  https://docs.openclaw.ai/install/digitalocean
- Hermes Docker, remote backend and security:
  https://hermes-agent.nousresearch.com/docs/user-guide/docker/,
  https://hermes-agent.nousresearch.com/docs/user-guide/desktop, and
  https://hermes-agent.nousresearch.com/docs/user-guide/security/
- NVIDIA NemoClaw overview, architecture and remote-GPU support:
  https://docs.nvidia.com/nemoclaw/latest/about/overview.html,
  https://docs.nvidia.com/nemoclaw/latest/user-guide/openclaw/reference/architecture,
  and https://docs.nvidia.com/nemoclaw/user-guide/hermes/reference/platform-support

- Vercel runtimes and limits: https://vercel.com/docs/functions/runtimes and
  https://vercel.com/docs/limits
- Supabase Edge Function limits and compute pricing:
  https://supabase.com/docs/guides/functions/limits and
  https://supabase.com/docs/guides/platform/manage-your-usage/compute
- Cloudflare Workers limits/pricing:
  https://developers.cloudflare.com/workers/platform/limits/ and
  https://developers.cloudflare.com/workers/platform/pricing/
- Railway pricing/templates/private networking:
  https://docs.railway.com/pricing,
  https://docs.railway.com/templates/deploy, and
  https://docs.railway.com/private-networking
- Render Blueprints/disks/private services:
  https://render.com/docs/infrastructure-as-code,
  https://render.com/docs/disks, and
  https://render.com/docs/private-services
- Fly pricing/volumes/networking:
  https://fly.io/docs/about/pricing/,
  https://fly.io/docs/volumes/overview/, and
  https://fly.io/docs/networking/
- DigitalOcean App Platform/Marketplace/Droplets:
  https://docs.digitalocean.com/products/app-platform/details/features/,
  https://docs.digitalocean.com/products/marketplace/, and
  https://www.digitalocean.com/pricing/droplets
- Hetzner server primitives:
  https://docs.hetzner.com/cloud/servers/getting-started/creating-a-server/

### Data and runtimes

- SQLite WAL: https://sqlite.org/wal.html
- Litestream directory replication: https://litestream.io/guides/directory/
- LiteFS overview/FAQ: https://fly.io/docs/litefs/ and
  https://fly.io/docs/litefs/faq/
- Turso embedded replicas/Sync:
  https://docs.turso.tech/features/embedded-replicas/introduction and
  https://docs.turso.tech/sdk/ts/reference
- PGlite filesystems: https://pglite.dev/docs/filesystems
- Ollama FAQ/auth/Docker: https://docs.ollama.com/faq,
  https://docs.ollama.com/api/authentication, and
  https://docs.ollama.com/docker
- LiteLLM Proxy: https://docs.litellm.ai/
- LM Studio headless: https://lmstudio.ai/docs/developer/core/headless
