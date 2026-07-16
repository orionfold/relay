---
generated: 2026-07-15
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

## Provider capability comparison

Research checked primary vendor documentation on 2026-07-15. Prices are inputs
to a dated estimator, not durable product constants.

| Provider family | Complete Relay fit | Best role | Important constraint |
|---|---:|---|---|
| Railway | strong first proof | containerized Relay, private runtime/database services, volumes, templates | usage-based RAM/CPU can make many always-on instances linear in cost; GPU/runtime support needs a separate proof |
| Render | strong first proof | Docker web/private services, persistent disks, managed Postgres, Blueprint IaC | one disk attaches to one service; horizontal stateful scaling needs a different persistence contract |
| Fly.io | strong, more infrastructure work | per-customer Machines, private networking, local volumes, suspend/start economics | volumes are single-host, one-Machine attachments and are not automatically replicated |
| DigitalOcean | strong VM and marketplace candidate | Droplet/App Platform, VPC, managed database, GPU runtime, 1-Click Marketplace | App Platform deploy buttons accept public repositories and Dev Databases only; deeper topologies likely need API/Terraform/Marketplace integration |
| Hetzner plus a deploy layer such as Coolify | strong low-cost VM candidate | consolidated host or sharded hosts with cloud-init/containers/private networks | more Relay-owned hardening, upgrades, backups, support, and one-click orchestration |
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
  https://docs.digitalocean.com/products/droplets/details/pricing/
- Hetzner server topology primitives:
  https://docs.hetzner.com/cloud/servers/getting-started/creating-a-server/
- Ollama network/Docker behavior, LiteLLM Proxy, and LM Studio headless server:
  https://docs.ollama.com/faq,
  https://docs.litellm.ai/, and
  https://lmstudio.ai/docs/developer/core/headless

## Topologies the goal must compare

1. **Consolidated customer host.** One VM or container host runs the public
   gateway, N isolated Relay containers/processes, local per-instance SQLite
   volumes, and an optional shared or dedicated Ollama/LiteLLM/LM Studio runtime.
   Object storage holds encrypted backups. This is the lowest-complexity first
   product candidate, but it has one failure domain and noisy-neighbor risk.
2. **PaaS multi-service.** Public Relay service plus private runtime service and
   one persistent volume per isolated Relay instance. A managed database is
   offered only after the persistence contract supports it. This improves guided
   deployment and operations but exposes provider service/volume limits and a
   roughly linear per-instance floor.
3. **Distributed dedicated.** Relay application hosts, model-runtime CPU/GPU
   hosts, database/storage, and control-plane services live separately on a
   private network. This is the scale/enterprise path, with higher latency,
   authentication, service-discovery, egress, and failure-recovery complexity.
4. **Hybrid customer runtime.** Cloud Relay reaches a customer's LAN/VPC Ollama,
   LiteLLM, or LM Studio through an outbound-established, authenticated tunnel or
   agent. This can avoid cloud GPU cost and keep models private, but requires a
   zero-trust connectivity and availability contract.
5. **Edge control plane plus stateful instance hosts.** Vercel or Cloudflare can
   own the deploy/licensing UX and front door while Railway, Render, Fly,
   DigitalOcean, or customer VMs run stateful Relay instances. Supabase may own
   selected auth/data services only if an approved data contract justifies it.
6. **Kubernetes/operator topology.** Container orchestration can support large
   fleets, dedicated namespaces/nodes, GPUs, and policy controls, but should be a
   later enterprise adapter rather than the startup-friendly first proof.

Every topology must state whether model capacity is BYOK external API, shared
customer-owned gateway, or dedicated runtime; whether an instance can sleep;
where its database/files/secrets live; and how it is backed up, restored,
upgraded, exported, transferred, and deleted.

## Cost and scalability contract

The customer chooser should present dated ranges for at least personal/single
instance, small fleet (10), and growing fleet (100), plus concurrent task and
storage assumptions. The calculator must expose:

`monthly total = control plane + Relay compute floor + per-instance RAM/CPU +`
`persistent storage + backups + database + runtime/GPU + egress + support`

BYOK model/API charges remain separate because the customer pays the model
provider. Example current anchors demonstrate why the model must be formula
based: Railway lists $10/GB-month RAM, $20/vCPU-month, and $0.15/GB-month volume;
Fly lists a 1 GB shared Machine around $5.92/month plus $0.15/GB-month volume;
DigitalOcean GPU rates range from $0.76/hour for an RTX 4000 to $3.39/hour for
an H100. These are not comparable without workload, uptime, and model-memory
assumptions. Estimates need source links, capture date, region/currency/tax
notes, expected/upper-bound cases, and a visible “provider bill is authoritative”
disclaimer.

## Recommended sequencing

G-078 should remain a research/specification/decision goal. It should not become
one umbrella implementation project. Its approved output should groom bounded
implementation goals in this order:

1. **Isolation and fleet contract:** finish/amend G-058 and G-060 so customer-owned
   self-service authority, per-instance identity, ownership transfer, and no
   cross-customer data plane are explicit.
2. **Cloud-safe Relay artifact:** reproducible signed OCI image; immutable release
   input; data-dir/volume contract; health/readiness; graceful shutdown; install,
   upgrade, rollback, export, and restore; no dev bootstrap side effects.
3. **Remote-access trust boundary:** first-user/admin bootstrap, TLS, sessions,
   CSRF, rate limits, password/identity recovery, audit receipts, and safe public
   binding.
4. **Persistence decision:** preserve isolated local SQLite plus verified
   backups/restore for the first slice, or approve a remote database adapter and
   migration. Do not block the first proof on Postgres unless its benefits are
   required by the selected topology.
5. **Secrets and runtime networking:** customer-owned provider credentials,
   encryption/rotation/redaction, private service discovery, TLS/auth for model
   endpoints, outbound trust/SSRF policy, and hybrid tunnel design.
6. **Provider adapter and deploy UX:** typed topology manifest, capability/cost
   schema, entitlement gate, preflight, provider authorization, plan preview,
   deploy progress/receipts, partial-failure rescue, and post-deploy handoff.
7. **Operations:** backup/restore drills, upgrades, capacity/quotas, cost alerts,
   observability without content telemetry, support bundle, deletion, and
   customer portability.

The first conformance proof should use one template-oriented PaaS (Railway or
Render) and one VM-oriented provider (DigitalOcean or Hetzner) so the provider
contract proves both managed and portable paths. Only one may ship initially.
Provider choice, exact paid entitlement/renewal semantics, remote identity model,
persistence direction, and any Orionfold-hosted control plane are operator gates.

## Verification and rescue

- Synthetic licensed/unlicensed/expired/wrong-entitlement tests prove every
  deploy/lifecycle mutation is gated while existing customer data remains
  exportable and recoverable.
- Provider-contract tests validate generated manifests without credentials;
  disposable paid-account smoke is separately authorized and records actual
  line-item cost.
- A fresh customer journey must cover entitlement discovery, topology/cost
  comparison, provider authorization, BYOK/runtime setup, successful deployment,
  first login, health check, backup/restore, upgrade/rollback, export, and delete.
- Isolation tests use at least two customer instances and prove separate data,
  files, credentials, hostnames, logs, and runtime policy.
- Failure injection covers provider rejection, quota/capacity, partial resources,
  timeout, callback loss, secret write failure, unhealthy boot, migration,
  runtime outage, backup failure, upgrade failure, and stale price data.
- Stop after two materially different provider/API approaches fail on the same
  blocker; preserve the generated plan and resources, report exact cleanup state,
  and require an operator decision before changing topology.

---

*Generated by `/architect` — integration-design mode*
