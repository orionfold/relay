---
title: G-078 cloud deployment research
captured: 2026-07-15
currency: USD unless noted
status: complete-for-planning
---

# Cloud deployment research and decision matrix

## Method

This report uses current official product documentation retrieved on 2026-07-15.
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

## Provider comparison

| Provider | Relay host fit | Guided deploy primitives | Stateful/private primitives | Main risk | Recommended G-078 role |
|---|---|---|---|---|---|
| Railway | Strong PaaS candidate | Templates, API/OAuth, Docker/image deploy | volumes; encrypted WireGuard private mesh and internal DNS | linear always-on RAM/CPU cost; template image-update semantics and GPU path need proof | first template-oriented conformance candidate |
| Render | Strong PaaS candidate | Blueprint IaC, Docker services | private services, managed DB, persistent disk | one disk attaches to one service; stateful horizontal scale requires redesign | Railway fallback/second PaaS proof |
| Fly.io | Strong infrastructure candidate | Machines API and app manifests | private networking, local volumes, suspend/start | volumes are host-local; LiteFS is single-primary/pre-1.0 with explicit operational warnings | later scale/suspend/edge proof, not v1 durability default |
| DigitalOcean | Strong VM candidate | Droplet API/cloud-init, Marketplace 1-Click, App Platform | VPC, volumes, managed DB, GPU Droplets | VM path puts more hardening/upgrades on Relay; App Platform deploy-button limits | first VM portability conformance candidate |
| Hetzner | Strong low-cost VM candidate | API/cloud-init; deploy layer can wrap it | private networks, volumes, firewalls, backups, placement groups | more Relay-owned operations and no validated price catalog in this research | later cost-oriented VM adapter |
| Cloudflare | Component fit; Containers need proof | Workers, APIs, Terraform | TLS/DNS, Tunnel, R2; Containers emerging | Workers have 128 MB and CPU constraints; container persistence/regions/GPU maturity must be proven | ingress/control-plane/storage component only for v1 |
| Vercel | Component fit | polished web/control plane, integrations | managed ingress; external data services | function filesystem is ephemeral/read-only outside `/tmp`; duration limits and no WebSocket server | optional deploy UX/front door, not current Relay host |
| Supabase | Component fit | project APIs and integrations | managed Postgres, Auth, Storage, Edge Functions | Edge Functions have 256 MB and bounded CPU/duration; Relay has no Postgres adapter | future identity/data component only after contract decision |
| Major clouds/GPU specialists | Strong but high-complexity | APIs, Terraform/marketplaces | complete VM/container/network/GPU primitives | account/IAM complexity, quotas, support surface, GPU idle cost | runtime-only or later enterprise adapter |

### Why Railway first

Railway templates can create configured multi-service projects, its private
network uses encrypted WireGuard with internal DNS, and its resource formula is
published clearly enough to build an inspectable estimator. It tests whether a
startup-friendly PaaS can express Relay + volume + private runtime without Relay
owning a VM control plane. Caveats to prove include persistent-volume backup and
restore, immutable OCI updates, IPv4/IPv6 binding, health/graceful shutdown,
OAuth scopes, resource deletion, and actual idle memory/CPU.

### Why DigitalOcean as portability proof

Droplets expose the lower-level VM/cloud-init path and VPC/GPU primitives needed
for consolidated or distributed customer stacks. The VM proof prevents the
provider contract from becoming Railway's template schema in disguise. The
adapter must prove host firewalling, unattended security updates, volume/backup,
OCI signature verification, recovery console escape hatch, and full cleanup.

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
| Scheduler/execution | 2 | 5 | 5 | 2 until multi-replica | A |
| Live events | 1 | 4 | 5 | 2 until multi-replica | A |
| Runtime protocol/lifecycle | 2 | 3 | 5 | 4 | A protocol, B lifecycle |
| Backup/restore | 4 if local-only | 3 | 5 | 5 | B |
| Observability | 2 | 3 | 5 | 3 | B optional redacted sink |
| Distribution | 3 | 3 | 5 | 5 | B |

## Topology comparison

| Topology | Cost shape | Scale ceiling | Failure domains | Security/operations | Decision |
|---|---|---|---|---|---|
| One sealed Relay instance | roughly linear per customer; BYOK cheapest | one writable process per customer | host/volume plus off-host recovery | simplest identity, ownership and restore boundary | first reference |
| Consolidated customer VM with N isolated containers | shared host lowers small-fleet floor | host resources/noisy neighbors | one host affects N customers | requires G-060 fleet isolation and per-container quotas | later cost profile |
| PaaS multi-service | per-service compute/volume floor | provider volume and horizontal-state limits | provider service/volume | best guided UX/private runtime composition | first conformance path |
| Distributed app/runtime/data | more services, egress, managed DB/GPU | highest with approved data/queue contracts | independent services/network | strongest IAM/service-auth/observability burden | enterprise/trigger-gated |
| Cloud Relay + LAN/VPC runtime tunnel | avoids cloud GPU when customer owns compute | tunnel/runtime availability | cloud plus customer network | outbound agent, mutual identity, rotation and SSRF controls | later hybrid adapter |
| Edge control plane + stateful hosts | control cost amortized | fleet-level | control plane plus each host | creates Orionfold custody/availability/privacy decisions | separate managed-product decision |
| Kubernetes/operator | cluster overhead; efficient at large fleet | high | cluster/nodes/namespaces | strongest complexity/support burden | later enterprise only |

## Reproducible cost model

`features/cloud-deploy-cost-inputs.json` is the dated source catalog and
`scripts/cloud-deploy-cost-model.mjs` calculates the examples. The model is for
architecture comparison, not a quote.

Baseline assumptions:

- one isolated Relay instance;
- 1 GB RAM, 0.25 average vCPU on Railway;
- 10 GB persistent volume;
- 10 GB/month egress on Railway;
- always on;
- BYOK model/API fees, backup object requests/storage, taxes, support and labor
  excluded unless an input explicitly includes them.

| Candidate | 1 instance | 10 instances | 100 instances | Interpretation |
|---|---:|---:|---:|---|
| Railway resource formula | $20.00 plan floor | $170.00 | $1,700.00 | 1 GB RAM $10 + 0.25 vCPU $5 + 10 GB volume $1.50 + 10 GB egress $0.50 per instance; Pro floor $20 |
| Fly ord 1 GB shared Machine + 10 GB volume | $7.42 | $74.20 | $742.00 | $5.92 Machine + $1.50 volume; egress/support/backups excluded |

These figures are intentionally not a provider winner: Railway includes a
transparent CPU/RAM usage formula and deployment convenience, while the Fly
example is a region-specific Machine list price with different operational and
scaling semantics. Actual Relay memory/CPU duty must be measured before customer
sizing. DigitalOcean CPU sizes should be fetched from its `/v2/sizes` catalog at
implementation time rather than copied from an unstable marketing page. GPU is
shown separately: DigitalOcean lists RTX 4000 at $0.76/hour, L40s at $1.57/hour,
and H100 at $3.39/hour on 2026-07-15; powered-off reserved Droplets still bill.

### Scale breaks

- Around 10–100 always-on PaaS services, instance packing can materially reduce
  compute floor but introduces a G-060 shared-host failure/isolation boundary.
- A shared customer-owned LiteLLM/runtime can amortize runtime cost, but requires
  per-instance keys, quotas, audit, and no cross-customer prompt/log leakage.
- A remote database does not automatically reduce cost; it becomes justified by
  availability/concurrency requirements, not instance count alone.
- GPU runtime dominates totals. Sleep/delete/model-cache behavior must be explicit
  and measured; the chooser cannot extrapolate CPU Relay cost to model serving.

## Conformance proof requirements

Both Railway and DigitalOcean candidates must consume the same provider-neutral
topology manifest and pass:

1. dry-run schema/capability/price validation without credentials;
2. least-privilege authorization and redaction tests;
3. create/resume/idempotent-retry/partial-rollback/delete state tests;
4. TLS/authenticated first login and no public internal services;
5. immutable artifact digest/version/health/graceful-shutdown checks;
6. two isolated instances with no shared data, files, secrets, logs or runtime
   policy unless a declared customer-owned shared runtime is selected;
7. backup, simulated host/volume loss, restore, upgrade and rollback drills;
8. provider-console inventory and bill-line reconciliation;
9. export into a fresh local Relay data directory;
10. cleanup proving no billable resource remains.

Live items require separate account/spend authorization. G-078 only designs the
contract and deterministic tests.

## Sources

### Platforms and pricing

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
  https://docs.digitalocean.com/products/droplets/details/pricing/
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
