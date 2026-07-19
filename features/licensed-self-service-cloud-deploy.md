---
title: Licensed self-service cloud deployment
status: planned
goal: G-078
decision: PROCEED approved 2026-07-15
amended: OpenClaw/Hermes/NemoClaw appliance perspective 2026-07-16
tdr: TDR-044 accepted 2026-07-16 by G-079
---

# Licensed self-service cloud deployment

## Product outcome

A licensed Relay customer can choose a local device or customer-owned cloud
server, size a Relay Host, authorize a supported provider when needed, and
install the same signed appliance contract in either placement. The Host can run
one or more isolated Relay cells, each representing one customer trust boundary.
The result has authenticated access and verified recovery and can be upgraded,
exported, transferred, or deleted without surrendering data to Orionfold.

“Single click” means one guided journey after unavoidable choices and provider
authorization. It does not hide region, billing, data residency, runtime cost,
credentials, destructive replacement, or recurring charges.

## Users and jobs

- A licensed small-business operator wants Relay available beyond one laptop
  without becoming a cloud engineer.
- An agency or team wants one isolated Relay instance per customer and a
  predictable single-server capacity and operations model.
- A privacy-conscious customer wants Relay in its own account with BYOK model
  credentials or a private model runtime.
- An enterprise evaluator wants to understand distributed, hybrid, database,
  recovery, and portability tradeoffs before committing.

## Plain-language model and four common setups

Think of the **Host** as the machine and the **Cell** as one complete Relay
workspace running on that machine. A Cell owns its own application process,
data directory, database, files, credentials, identity, license, logs, network
route, resource limits, and backups. Customer records, projects, and folders
inside a Cell organize work; they do not isolate one customer's data or secrets
from another customer.

The Host administrator can control and inspect every Cell on that Host. Put two
customers on the same Host only when both accept that administrator. Use a
different VM or machine when they need protection from one another or from the
Host administrator.

A **Host Supervisor** is the local control software on one Host. It controls
only Cells physically located on that machine. A **Fleet Controller** is a
different, future component that could coordinate several Hosts through their
supervisors. It would not be a Host and would never operate a remote Cell
directly.

### 1. I only want Relay on my laptop for myself

Run `npx orionfold-relay`. The npm package starts one local Relay process, which
is your one Cell. Your laptop is the machine hosting it, but you do not need the
managed-Host supervisor or an OCI registry for this simple path. Your Relay data
stays in that Cell's local data directory.

### 2. I use my laptop to manage several customers

Your laptop becomes a managed Host. Today you can isolate customers manually by
running a separate Relay process and `RELAY_DATA_DIR` for each one. The planned
G-083 path installs the Host supervisor through npm and lets it run one
digest-pinned OCI Cell container per customer, each with separate storage,
networking, identity, secrets, license, logs, and backups. A customer row,
project, or folder inside one Cell is not a substitute for this separation.

Because you administer the laptop, every customer on it must trust you. A
customer that does not accept that trust needs a separate VM or machine.

### 3. I run Relay for customers from my own server

Your server is the Relay Host. npm installs the CLI and, under G-083, the Host
supervisor. The supervisor pulls the signed Relay Cell image from the approved
OCI registry and starts a separate Cell for each customer. Customers reach only
their Cell through authenticated Host ingress; they do not receive the Host
supervisor or container-runtime access.

You remain the trusted Host administrator and can manage every resident Cell.
This is suitable for customers who accept your administration. Use a separate
server or VM for a customer that requires a different administrative boundary.

This setup means the Cells run on your server. If Server A instead coordinates
customer Cells running on Servers B, C, and D, then B, C, and D are separate
Relay Hosts and Server A is a future Fleet Controller. That multi-Host control
plane is not part of the first Host release train.

### 4. My provider gave me Relay, but I run it on my own server

Your server is your Relay Host even if it runs only one Cell. The npm-installed
Host supervisor pulls and verifies the same Relay Cell image, then stores that
Cell's data and backups under your ownership. You are the Host administrator.
Your provider may guide or automate lifecycle work only through authority you
grant; v1 does not depend on an Orionfold-hosted control plane holding permanent
provider credentials or customer content.

The short distribution rule is therefore: **npm supplies the direct local path
and the managed-Host control software; the OCI registry supplies the managed
Cell runtime image.** One release manifest binds the compatible versions and
exact image digest.

These are two artifacts from the same Relay release, not two copies of the
same package. The npm tarball is a compact installer/application payload that
uses Node, dependency installation, the OS, and native libraries supplied by
the destination. The Cell image is a sealed Linux runtime with those
prerequisites pinned inside it. The accepted measurements make the difference
concrete: npm is 2,782,070 bytes compressed / 9,970,829 bytes unpacked, while
the optimized Linux/arm64 Cell image is 129,934,743 bytes and its OCI archive
is 129,959,936 bytes. Comparing only those downloads is not apples-to-apples;
the npm side's complete installed runtime also includes Node, installed
dependencies, and host OS/native prerequisites.

The choice is direct versus managed, not laptop versus cloud. One personal Cell
can use npm on either a laptop or cloud VM. A managed Host uses OCI Cells on
either placement so every Cell gets a repeatable Linux runtime, signed digest,
explicit storage/network/user/resource boundaries, and atomic upgrade or
rollback. Without the paid managed multi-Cell product, Relay would not need the
OCI distribution channel.

## Approved product assumptions

1. The cloud account, resources, bill, data, and long-lived provider credentials
   are customer-owned by default.
2. One deployed Relay instance serves one customer organization. This feature
   does not add row-level multi-tenancy to Relay Core.
3. The default cloud experience uses authenticated internet ingress; a private
   or VPN-only exposure profile may be offered by capable providers.
4. V1 targets ordinary confidential business data. Regulated-data, compliance,
   data-processing, residency, SSO, and SLA claims require separate approval.
5. Orionfold receives no customer content, prompts, documents, model responses,
   provider secrets, or raw logs as telemetry.
6. V1 keeps per-instance SQLite/WAL on local block storage with encrypted,
   customer-owned off-host recovery unless a measured requirement triggers a
   different database decision.
7. Local device and cloud server are placements of the same Host/cell contract;
   v1 is not a separate distributed cloud architecture.
8. A Host administrator is trusted by every cell on that Host. Customers needing
   protection from that administrator or from mutually hostile tenants receive a
   separate VM/machine.
9. Same-Host eligibility requires explicit trust acceptance from every resident
   customer; customer type, owner reference and billing relationship do not
   imply consent.
10. Ownership transfer requires current-owner authorization, target-owner acceptance
    and a verified export/recovery checkpoint. Revocation disables automation
    without stopping, deleting, encrypting or stranding the cell.
11. Initial resource admission is provisional: 1 GiB memory per cell, 0.5 GiB
    Host reserve, 90% maximum memory utilization, three cells per vCPU and an
    explicit storage ceiling. G-080 measurements precede support claims.

## Invariants

- No managed Host lifecycle mutation starts without the placement-neutral paid
  `product:relay-host` entitlement and an explicit customer confirmation of the
  provider plan.
- Missing, expired, invalid, or wrong-product licenses do not delete, encrypt,
  corrupt, or make existing customer data unrecoverable.
- Export and recovery instructions remain available after entitlement loss.
- No Relay, model-runtime, database, backup, or provider-admin endpoint becomes
  publicly reachable without an explicit security profile.
- Cloud credentials are never returned to the browser after submission and are
  never written to logs, URLs, topology receipts, or support bundles.
- Every deployment is bound to a specific immutable Relay release digest and a
  versioned Host/cell manifest.
- Provider estimates are dated inputs, not promises; the provider bill is
  authoritative.
- A partial deployment is a named, resumable or cleanly reversible state. It is
  never reported as success merely because one resource was created.
- Destructive replacement or deletion requires a fresh confirmation describing
  retained and destroyed resources plus a pre-delete export/recovery option.
- Relay Core has no scattered `cloudMode` conditionals. Provider and substrate
  choices enter through typed instance-boundary contracts.
- One customer ID, project ID, session ID, or database column never substitutes
  for cell isolation.
- Host-supervisor metadata contains no prompts, documents, table rows, provider
  secrets, customer credentials, model responses, or raw cell logs.
- Cell services and model runtimes bind to loopback/private networks by default;
  remote access crosses one approved authenticated ingress/tailnet boundary.
- A same-Host isolation claim requires the accepted non-root, capability,
  network, mount/secret, read-only-root-where-compatible and resource-limit
  baseline; unsupported controls fail closed or use a separate VM/machine.

## Entitlement and lifecycle policy

The accepted entitlement is `product:relay-host`, verified by the shipped
offline Ed25519 signature → term → entitlement pipeline.

Entitlement is required for:

- opening the deploy journey past a read-only comparison;
- generating a provisionable manifest;
- initiating provider authorization or provisioning;
- adding a Host or cell, changing placement/capacity, or starting an upgrade;
- invoking paid cloud-specific lifecycle automation.

Entitlement is not required for:

- reading the instance's ownership and recovery receipt;
- exporting a complete portable data/recovery bundle;
- viewing manual provider cleanup instructions;
- recovering data into a licensed or local Relay installation;
- deleting customer-owned provider resources directly in the provider console.

The accepted G-095 contract makes lapse behavior explicit: expansion and
routine feature upgrades stop, while receipt-bound continuity and compatible
critical security updates continue. Data-hostage behavior is unconditionally
prohibited.

## Reference topology

The first implementation target is one Relay Host appliance on either a local
device or a customer-owned cloud VM:

```text
Customer browser
  → VPN/tailnet or TLS + authenticated Host ingress
    → Relay Host supervisor (content-free lifecycle metadata)
      → cell A: Relay + SQLite/files/secrets/license/logs/backup lineage
      → cell B: Relay + SQLite/files/secrets/license/logs/backup lineage
      → optional same-host private Ollama/LM Studio/LiteLLM
      → encrypted versioned recovery artifacts off-host
```

Each cell has its own process/container, loopback port, network, data
directory/volume, identity realm, resource budget, runtime policy and recovery
manifest. The Host supervisor creates, inspects, starts, stops, replaces,
upgrades, exports and removes local cells but never proxies their customer data.

DigitalOcean is the first cloud-VM conformance candidate. The local-device Host
fixture is the compatibility reference; a second clean VM provider or local
hardware proves portability before GA claims. Railway/Render may later package a
single cell but are not the reference architecture.

## Deployment profiles shown to customers

### Local Relay Host

- Existing laptop, desktop, Mini, workstation, home server or office server.
- One or more isolated cells within the accepted host trust boundary.
- BYOK hosted inference or same-device private runtime.
- No provider bill; customer owns device availability, networking and backups.

### Simple cloud-server Relay Host

- One always-on customer VM with one Host and one or more cells.
- BYOK hosted model APIs by default.
- Reverse proxy/tailnet, host firewall, encrypted off-host backups.
- Lowest cloud infrastructure complexity; one Host failure domain.
- Recommended first cloud profile.

### Relay plus private model runtime

- Relay cells and Ollama, LM Studio headless, or LiteLLM run on the same Host or
  its private network.
- CPU runtime is allowed only for explicitly compatible small models/workloads;
  GPU cost and model memory are shown separately.
- Runtime API is authenticated when supported or protected by a private gateway;
  no public Ollama port.
- A shared runtime across cells requires one customer trust boundary or per-cell
  credentials, quotas, log separation and an explicit operator decision.

### Sharded Relay Hosts

- When a Host reaches measured admission limits, provision another independent
  Host and place new cells there.
- A minimal inventory can show Host/cell identity, version, health, capacity and
  backup status but contains no customer content and is not required for a cell
  to operate.
- Inventory is not control. No current release lets one Host act as a Fleet
  Controller over other Hosts. A later controller must delegate every operation
  to the target Host supervisor, which revalidates it locally.
- One tenant is not split across application replicas or a shared remote database.

### Distributed services

- Relay, model runtime, database/storage, and optional workers run on separate
  hosts or managed services.
- Not available until the selected persistence, scheduler/lease, event, and
  service-auth contracts pass their triggers and conformance tests.
- The chooser may explain this architecture but must label it planned or
  enterprise, not deployable.

### Hybrid private runtime

- Cloud Relay reaches a customer LAN/VPC runtime through an
  outbound-established authenticated tunnel or agent.
- The UI explains dependency on the customer's runtime/network availability and
  never requests that an unauthenticated LAN runtime be exposed to the internet.
- This is a later adapter following G-057/G-070/G-071/G-072 runtime groundwork.

## Customer journey and state model

### 1. Discover

The customer sees Local Device and Cloud Server as the primary choices, plus
paid-license status, Host/cell trust boundary, supported providers, portability
promise, and a dated capacity/cost-methodology link.
Read-only comparison remains useful without an entitlement.

### 2. Configure

The customer selects:

- placement: this device, another device/server, or cloud VM;
- provider/account and region when cloud is selected;
- exposure profile: local, VPN/tailnet, or authenticated public ingress;
- number of cells and Host size/safety reserve;
- BYOK hosted model, private runtime, or hybrid runtime;
- storage/backup retention and recovery destination;
- expected concurrency, uptime, storage, and egress.

Unsupported combinations are disabled with a concrete reason and alternative.

### 3. Estimate

Relay shows Host count/size, provisional cells-per-Host admission, safety reserve,
expected/upper monthly ranges, source date, currency, region, exclusions and
separate model/API charges. It labels density unmeasured until Relay capacity
evidence exists and never promises that cell count alone determines capacity.

### 4. Preflight

Before provider authorization or local installation, Relay verifies entitlement,
release/host compatibility, Host capacity assumptions, cell ownership/isolation,
required choices, provider capability/scopes when relevant, port/network/mount
availability, and recovery destination. It produces a redacted plan digest.

### 5. Authorize

For a local/remote customer device, show the signed install/bootstrap command and
its exact host changes. For cloud, use provider OAuth/device authorization where
available, otherwise a least-
privilege short-lived token supplied directly to a local deployment coordinator.
The UI lists exact scopes and when the authorization is discarded. Long-lived
provider credentials are not retained by Orionfold in v1.

### 6. Provision

The state machine is:

`draft → estimated → preflight-passed → host-authorized → host-provisioning →`
`host-ready → cell-provisioning → verifying → ready`

Named non-success states are:

`preflight-failed`, `authorization-expired`, `host-partial`, `cell-partial`,
`capacity-refused`, `verification-failed`, `rollback-running`,
`rollback-partial`, and `cancelled`.

Every state has a durable redacted receipt, next safe action, Host/cell identity,
and provider resource identifiers when applicable. Retry is idempotent against
the plan digest.

### 7. First login and handoff

The deployment is not ready until:

- TLS hostname validation succeeds;
- first-admin bootstrap is single-use, expires, and is not present in logs;
- authentication/session/CSRF/rate-limit checks pass;
- Relay reports the expected immutable version and instance identity;
- Host reports expected cell isolation, port/network/mount/resource limits;
- runtime reachability is tested without exposing secrets;
- a recovery artifact is created and restore-validated or clearly pending.

The customer receives an ownership receipt: Host/cell inventory, trust boundary,
provider resources/region when relevant, hostname, artifact digest, cell data/
backup locations, resource admission, estimated cost, recovery steps, and how
to revoke deployment authorization.

### 8. Operate

Supported lifecycle actions are health/status, restart, backup, restore drill,
upgrade preview, upgrade, rollback, export, ownership transfer, and delete. Each
is capability-gated and produces a receipt. Provider-console escape hatches are
always linked.

## Layer decisions

| Layer | V1 decision | Compatibility and trigger |
|---|---|---|
| Host/cell lifecycle | One local supervisor controls only the Cells resident on its Host | Add a content-free Fleet Controller only for paid multi-Host demand; it delegates to authenticated Host supervisors and never controls Cells directly |
| Operational data | Preserve `better-sqlite3` and WAL per cell on Host-local block storage | Add remote DB only for horizontal replicas/active-active inside one cell or unmet RPO/RTO; never network-mounted/shared WAL |
| Files | Preserve live local data-directory paths | Add object storage as backup/export transport; direct object-backed live files need atomicity/consistency contract |
| Backup | Versioned Relay snapshot manifest copied encrypted off-host | Recovery drill must prove DB + files + settings consistency and key availability |
| Secrets | Cloud secret references/KMS root in cloud; current protected local root locally | Browser receives presence/source only; rotation and disaster recovery are required |
| Identity | Trusted-local and remote-authenticated exposure profiles | Cloud profile is a prerequisite; public ingress without it is invalid |
| Scheduling | One scheduler/executor owner per cell | Distributed leases/queue begin only when one cell requires multiple writers/workers |
| Live events | Per-cell SSE/DB polling | Pub/sub begins only with multiple Relay replicas for one cell |
| Runtime | Reuse endpoint registry; add Host-local/private lifecycle | Independent runtime fleet begins only when same-host capacity fails |
| Distribution | Common release manifest; npm supplies direct local Relay plus managed-Host bootstrap/supervisor, while the OCI registry supplies the immutable Cell image | Local device and cloud VM report identical Relay/Cell schema compatibility; npm never embeds OCI bytes |
| Observability | Local diagnostics and optional redacted operational events | No content telemetry; exported sink requires an explicit schema/privacy review |

## Database decision rule

SQLite is not described as infinitely scalable. It is selected for v1 because
the product boundary is one writable Relay process per isolated customer and the
current scheduler/files/snapshots share that same boundary.

A database architecture goal is triggered when any of these become required:

- two or more concurrently writable Relay application replicas for one cell;
- active-active regional writes;
- independent horizontal workers that cannot coordinate through one owner;
- measured SQLite write throughput or database size exceeds the supported SLO;
- volume-plus-off-host recovery cannot meet accepted RPO/RTO;
- fleet economics demonstrably favor a remote shared service after including
  connection, isolation, migration, backup, and support costs.

The triggered goal must compare preserving SQLite with replication, a truthful
SQLite/remote adapter, and one unified local/cloud database. It must not hide
transaction, concurrency, migration, or failure differences behind a nominal
repository interface.

## Cost and capacity requirements

The calculator accepts cell count, measured/provisional per-cell memory/CPU,
Host reserve and utilization, storage/backup, concurrency, runtime/GPU uptime,
provider and Host plan. It shows:

`monthly total = Host count × (server + backup + storage) +`
`runtime/GPU + egress + optional support`

Required views:

- 1, 10, and 100 isolated cells;
- Host size/count, admitted cells per Host and safety reserve;
- expected versus upper-bound compute duty;
- BYOK API, shared customer runtime, and dedicated runtime alternatives;
- sleep-capable versus always-on where the state contract allows it;
- size-up and Host-shard break points without implying app-tier horizontal scale.

Provider prices must have source URL, retrieval date, region, currency, and notes.
Stale inputs block “current estimate” language but not viewing the last captured
estimate. Model API/token charges are never folded into infrastructure cost.

## Security and privacy requirements

- First-admin bootstrap is high-entropy, single-use, short-lived, origin-bound,
  and invalidated atomically after account creation.
- Remote sessions use secure/HTTP-only/SameSite cookies, rotation, bounded
  lifetime, server-side revocation, and explicit authorization on every mutation.
- Browser mutations have CSRF/origin protection and rate limits; login,
  bootstrap, recovery, and provider authorization have stronger limits.
- Provider authorizations request the minimum documented scopes and are never
  placed in redirect query strings or support receipts.
- Internal service endpoints use provider-private networking plus service auth
  where possible; private networking alone is not treated as identity.
- Cells publish only to Host loopback/private networks; ingress routes to the
  intended cell and cannot choose another cell through a caller-supplied ID.
- Separate cell mounts, networks, ports, identities, secrets, logs and resource
  limits are mandatory. Host administrators remain trusted and this is visible.
- Cells run non-root and non-privileged with dropped capabilities, private
  networking, default sandbox controls and a read-only root filesystem wherever
  the signed Cell image proves compatibility. Supervisor/runtime sockets are
  never mounted into cells.
- Outbound provider/runtime URLs retain scheme validation, redirect refusal,
  bounded timeouts, secret redaction, and a separately planned DNS/SSRF defense.
- Backups are encrypted before or at the customer-owned destination, integrity
  signed, versioned, retention-bounded, and restore-tested.
- Logs and operational events use stable identifiers and reason codes without
  prompts, document contents, provider secrets, authorization codes, or model
  responses.
- Artifact provenance includes digest/signature, dependency/SBOM evidence,
  supported schema range, and rollback compatibility.

The detailed abuse paths and priorities live in `relay-threat-model.md`.

## Failure and rescue behavior

| Failure | Required visible behavior | Rescue |
|---|---|---|
| Entitlement invalid/lapses | Name exact entitlement/term failure; no provider write | Renew for automation or use export/manual provider controls |
| Cost input stale | Mark estimate stale and provider bill authoritative | Refresh signed pricing catalog before “current” claim |
| Authorization denied/expires | No provisioning; list missing/expired scope | Reauthorize with same redacted plan digest |
| Provisioning partially succeeds | Name each created/missing resource and accruing cost | Resume idempotently or run scoped rollback; link provider console |
| Cell isolation collision | Refuse creation and name conflicting port/network/mount/owner | Repair manifest/allocation; never reuse another cell's resource |
| Host capacity exhausted | Refuse admission with measured/provisional constraint | Resize Host or provision another independent Host shard |
| Verification fails | Never report ready | Preserve evidence; repair ingress/runtime/recovery then rerun verification |
| Backup upload fails | Instance may run but readiness/health names degraded recovery | Retry transport, rotate destination credentials, or export manually |
| Upgrade migration fails | Keep prior artifact/data snapshot and named failure | Stop writes, restore compatible snapshot, restart prior digest |
| Provider API changes | Adapter becomes unsupported, not silently partial | Freeze mutation, refresh capability contract, use manual escape hatch |
| Runtime unavailable | Relay remains accessible; tasks fail with named endpoint reason | Switch BYOK/runtime endpoint or repair private/hybrid service |
| Delete is partial | List retained resources and ongoing bill risk | Retry only remaining deletions or use exact provider-console links |

## Accessibility and UX requirements

- The journey is keyboard operable, preserves visible focus, and uses the system
  cursor only.
- Status is conveyed by text and icons, never color alone.
- Cost, destructive actions, credential ownership, and recovery are plain-language
  summaries with expandable technical detail.
- Progress survives navigation/reload by reading the durable deployment receipt.
- Mobile may monitor and rescue but does not compress away billing, scope, or
  deletion confirmation details.

## Non-goals

- Orionfold-hosted managed Relay or custody of customer cloud credentials.
- Row-level multi-tenancy or a shared cross-customer data plane.
- Protection from a malicious Host administrator; use a separate VM/machine.
- Kubernetes as the first customer path.
- Active-active Relay, distributed scheduling, or live multi-region writes.
- A promise that every model can run affordably on CPU.
- Formal HIPAA, SOC 2, GDPR, data-residency, SSO, or SLA claims.
- Supporting every listed provider in the first release.
- Live paid deployments during G-078 itself.

## Portfolio and release contract

The implementation program must remain a sequence of independently valuable
releases rather than one cloud-deploy launch:

1. G-058 → G-060 → G-079 freezes truthful Host/cell trust and authority.
2. G-080 and G-081 may proceed in parallel; G-082 follows the signed Cell
   image; accepted G-093 and G-025 prepare G-094 to publish it; G-083 waits for
   G-081/G-082 plus the G-094 registry release.
3. G-084 ships the licensed local/fake-VM lifecycle before G-085 adds a live
   DigitalOcean beta. G-086 proves portability before broad GA claims but does
   not block a demand-validated G-085 beta.
4. G-020, G-030, G-034, G-038, G-059, G-062, G-025, and G-036 use explicit
   coordination, conformance, or trigger relationships rather than becoming
   accidental hard prerequisites.
5. G-073/G-074 may deliver local-first connector value after G-079; cloud-Host
   support additionally conforms to G-081/G-082 without waiting for G-085.

G-084 was accepted on 2026-07-18. Settings now exercises the licensed Local
Device and deterministic Cloud Server Preview journey against the accepted
Host domain and public Cell digest. The preview creates no provider resource or
charge. R3 still requires Relay/Website fulfillment and pricing coordination,
retention UX consistency, and a fresh customer-identical release-candidate
staging pass before a paid Host release can be claimed.

The authoritative dependency matrix, parallel work, customer-value increments,
and recurring staging gates live in
`features/licensed-self-service-cloud-deploy-plan.md`.

## Acceptance criteria

1. A dated research matrix compares Vercel, Supabase, Cloudflare, Railway,
   Render, Fly.io, DigitalOcean, Hetzner, and runtime options using primary
   sources and separates full-host from component fit.
2. Primary-source comparison of OpenClaw, Hermes and NemoClaw documents the
   device/VPS Host pattern, one-cell-per-tenant isolation, trusted Host operator,
   local state, sandboxing, auth, and optional local/hosted inference.
3. Topology comparison covers local Host, cloud VM Host, same-host cells, Host
   sharding, PaaS single-cell, distributed, hybrid, edge and Kubernetes paths.
4. Every load-bearing layer has an A/B/C posture, selected v1 direction, and
   measurable revisit trigger.
5. The cost model reproduces dated 1/10/100-cell Host/shard examples and exposes
   provisional density, reserve, backup and exclusions.
6. TDR-044 records the customer-owned Relay Host/cell architecture and is
   accepted by G-079 with explicit same-Host trust, authority, hardening,
   transfer/revocation and provisional admission decisions.
7. The threat model covers Host privilege, cross-cell isolation, ingress,
   provider authorization, service network,
   secrets, backups, artifacts, runtime endpoints, licensing, lifecycle, and
   support/telemetry boundaries with repo evidence.
8. The wireframe describes device/cloud placement, Host sizing/cells,
   authorization, progress,
   rescue, handoff, and mobile behavior without hiding required choices.
9. The implementation plan maps each criterion to bounded vertical slices,
   regression tests, provider conformance, runtime/browser evidence, and rescue.
10. G-058 and G-060 are amended as hard prerequisite contracts, and G-078 is
   decomposed into independently completable child goals.
11. G-078 closes without provisioning cloud resources, spending money, pushing,
    publishing, releasing, or accepting the proposed TDR/provider choice.
12. The backlog, roadmap, connector specifications, architecture report, and
    implementation plan agree on hard prerequisites, parallel work, conformance
    gates, trigger gates, and the R0–R5 iterative release order.

## Verification record

- 2026-07-15: repository audit covered CLI binding/warnings, environment/data
  paths, SQLite/WAL bootstrap, startup services, snapshots/auto-backup, local
  crypto root, license verification/gating, provider endpoint controls, and
  runtime configuration.
- 2026-07-15: provider/database/runtime research refreshed from authoritative
  sources listed in the research report.
- 2026-07-15: operator approved PROCEED scope and the six product/security
  assumptions. No provider account, credential, deployment, or spend was used.
- 2026-07-16: OpenClaw, Hermes Agent and NVIDIA NemoClaw primary-source review
  shifted the reference to one local/cloud Relay Host with isolated tenant cells,
  Host sharding, and a VM-first provider proof. The operator explicitly requested
  this perspective; no provider account or resource was used.
- 2026-07-16: G-079 accepted TDR-044 and froze same-Host eligibility, the minimum
  hardening rung, separate-VM rescue, customer-authorized transfer/revocation,
  content-free authority metadata and provisional admission inputs. R0 closed
  without application/runtime/provider or release changes.
- Deterministic documentation/cost-model verification commands are recorded in
  `features/licensed-self-service-cloud-deploy-plan.md`.

## References

- `features/licensed-self-service-cloud-deploy-research.md`
- `features/licensed-self-service-cloud-deploy-plan.md`
- `features/licensed-self-service-cloud-deploy-wireframe.md`
- `features/relay-host-authority-isolation-contract.md`
- `features/architect-report.md`
- `relay-threat-model.md`
- `.agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md`
