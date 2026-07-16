---
title: Licensed self-service cloud deployment
status: planned
goal: G-078
decision: PROCEED approved 2026-07-15
tdr: TDR-044 proposed
---

# Licensed self-service cloud deployment

## Product outcome

A licensed Relay customer can start from Relay, compare truthful deployment
shapes and dated cost ranges, authorize a supported cloud provider, and create a
working Relay instance in the customer's account. The result is owned and billed
by the customer, has authenticated access and verified recovery, and can be
upgraded, exported, transferred, or deleted without surrendering customer data
to Orionfold.

“Single click” means one guided journey after unavoidable choices and provider
authorization. It does not hide region, billing, data residency, runtime cost,
credentials, destructive replacement, or recurring charges.

## Users and jobs

- A licensed small-business operator wants Relay available beyond one laptop
  without becoming a cloud engineer.
- An agency or team wants one isolated Relay instance per customer and a
  predictable cost/operations model.
- A privacy-conscious customer wants Relay in its own account with BYOK model
  credentials or a private model runtime.
- An enterprise evaluator wants to understand distributed, hybrid, database,
  recovery, and portability tradeoffs before committing.

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

## Invariants

- No cloud lifecycle mutation starts without the dedicated paid cloud-deploy
  entitlement and an explicit customer confirmation of the provider plan.
- Missing, expired, invalid, or wrong-product licenses do not delete, encrypt,
  corrupt, or make existing customer data unrecoverable.
- Export and recovery instructions remain available after entitlement loss.
- No Relay, model-runtime, database, backup, or provider-admin endpoint becomes
  publicly reachable without an explicit security profile.
- Cloud credentials are never returned to the browser after submission and are
  never written to logs, URLs, topology receipts, or support bundles.
- Every deployment is bound to a specific immutable Relay release digest and a
  versioned topology manifest.
- Provider estimates are dated inputs, not promises; the provider bill is
  authoritative.
- A partial deployment is a named, resumable or cleanly reversible state. It is
  never reported as success merely because one resource was created.
- Destructive replacement or deletion requires a fresh confirmation describing
  retained and destroyed resources plus a pre-delete export/recovery option.
- Relay Core has no scattered `cloudMode` conditionals. Provider and substrate
  choices enter through typed instance-boundary contracts.

## Entitlement and lifecycle policy

The working entitlement is `product:relay-cloud-deploy`, verified by the shipped
offline Ed25519 signature → term → entitlement pipeline.

Entitlement is required for:

- opening the deploy journey past a read-only comparison;
- generating a provisionable manifest;
- initiating provider authorization or provisioning;
- adding an instance, changing topology, or starting an automated upgrade;
- invoking paid cloud-specific lifecycle automation.

Entitlement is not required for:

- reading the instance's ownership and recovery receipt;
- exporting a complete portable data/recovery bundle;
- viewing manual provider cleanup instructions;
- recovering data into a licensed or local Relay installation;
- deleting customer-owned provider resources directly in the provider console.

Renewal/grace behavior and whether automated security-only upgrades continue
during a lapse remain a product/operator gate. Data hostage behavior is
unconditionally prohibited.

## Reference topology

The first implementation target is a sealed single-customer stack:

```text
Customer browser
  → provider TLS and authenticated Relay ingress
    → one Relay container/process
      → one local persistent data volume (SQLite WAL + files)
      → customer secret manager or encrypted local secret root
      → BYOK model API, private runtime service, or authenticated hybrid tunnel
      → encrypted versioned recovery artifacts in customer object storage
```

Railway is the first template-oriented conformance candidate. DigitalOcean is
the first VM-oriented portability candidate. Either may fail conformance; no
provider is selected for shipment until its child goal records the proof and the
operator accepts the provider gate.

## Deployment profiles shown to customers

### Simple cloud Relay

- One always-on Relay instance, isolated volume, encrypted backups.
- BYOK hosted model APIs by default.
- Lowest infrastructure complexity; one host/volume failure domain.
- Recommended first profile for one customer organization.

### Relay plus private model runtime

- Relay and Ollama, LM Studio headless, or LiteLLM run as separate services on a
  provider-private network.
- CPU runtime is allowed only for explicitly compatible small models/workloads;
  GPU cost and model memory are shown separately.
- Runtime API is authenticated when supported or protected by a private gateway;
  no public Ollama port.

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

The customer sees what the feature does, paid-license status, supported and
planned providers, portability promise, and a dated cost-methodology link.
Read-only comparison remains useful without an entitlement.

### 2. Configure

The customer selects:

- provider and account/workspace/project;
- region and exposure profile;
- instance count and size assumptions;
- BYOK hosted model, private runtime, or hybrid runtime;
- storage/backup retention and recovery destination;
- expected concurrency, uptime, storage, and egress.

Unsupported combinations are disabled with a concrete reason and alternative.

### 3. Estimate

Relay shows expected and upper-bound monthly ranges with provider source date,
currency, region, taxes/exclusions, infrastructure line items, and separately
owned model/API charges. The customer can inspect raw assumptions.

### 4. Preflight

Before provider authorization, Relay verifies entitlement, release compatibility,
required customer choices, provider capability, account permissions requested,
name/region availability where possible, and a recovery destination. It produces
a redacted plan digest that can be compared with the completion receipt.

### 5. Authorize

Use provider OAuth/device authorization where available, otherwise a least-
privilege short-lived token supplied directly to a local deployment coordinator.
The UI lists exact scopes and when the authorization is discarded. Long-lived
provider credentials are not retained by Orionfold in v1.

### 6. Provision

The state machine is:

`draft → estimated → preflight-passed → authorized → provisioning →`
`verifying → ready`

Named non-success states are:

`preflight-failed`, `authorization-expired`, `partially-provisioned`,
`verification-failed`, `rollback-running`, `rollback-partial`, and `cancelled`.

Every state has a durable redacted receipt, next safe action, and provider
resource identifiers. Retry is idempotent against the plan digest.

### 7. First login and handoff

The deployment is not ready until:

- TLS hostname validation succeeds;
- first-admin bootstrap is single-use, expires, and is not present in logs;
- authentication/session/CSRF/rate-limit checks pass;
- Relay reports the expected immutable version and instance identity;
- runtime reachability is tested without exposing secrets;
- a recovery artifact is created and restore-validated or clearly pending.

The customer receives an ownership receipt: provider resources, region,
hostname, artifact digest, data/backup locations, estimated recurring cost,
support boundary, recovery steps, and how to revoke deployment authorization.

### 8. Operate

Supported lifecycle actions are health/status, restart, backup, restore drill,
upgrade preview, upgrade, rollback, export, ownership transfer, and delete. Each
is capability-gated and produces a receipt. Provider-console escape hatches are
always linked.

## Layer decisions

| Layer | V1 decision | Compatibility and trigger |
|---|---|---|
| Operational data | Preserve `better-sqlite3` and WAL on one local block volume | Add remote DB only for horizontal replicas/active-active or unmet RPO/RTO; never network-mounted WAL |
| Files | Preserve live local data-directory paths | Add object storage as backup/export transport; direct object-backed live files need atomicity/consistency contract |
| Backup | Versioned Relay snapshot manifest copied encrypted off-host | Recovery drill must prove DB + files + settings consistency and key availability |
| Secrets | Cloud secret references/KMS root in cloud; current protected local root locally | Browser receives presence/source only; rotation and disaster recovery are required |
| Identity | Trusted-local and remote-authenticated exposure profiles | Cloud profile is a prerequisite; public ingress without it is invalid |
| Scheduling | One scheduler/executor owner per instance | Distributed leases/queue begin only when multiple writers/workers are required |
| Live events | Single-instance SSE/DB polling | Pub/sub begins only with multiple Relay replicas |
| Runtime | Reuse explicit endpoint/capability registry | Provisioning adds lifecycle adapter without merging provider identities |
| Distribution | Common release manifest; npm local and signed OCI cloud | Both artifact paths must report the same Relay version/schema compatibility |
| Observability | Local diagnostics and optional redacted operational events | No content telemetry; exported sink requires an explicit schema/privacy review |

## Database decision rule

SQLite is not described as infinitely scalable. It is selected for v1 because
the product boundary is one writable Relay process per isolated customer and the
current scheduler/files/snapshots share that same boundary.

A database architecture goal is triggered when any of these become required:

- two or more concurrently writable Relay application replicas for one instance;
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

The calculator accepts instance count, memory, CPU duty, persistent storage,
backup size/retention, egress, runtime/GPU uptime, and provider plan. It shows:

`monthly total = provider floor + Relay compute + instance storage + backups +`
`database if selected + runtime/GPU + egress + optional support`

Required views:

- 1, 10, and 100 isolated instances;
- expected versus upper-bound compute duty;
- BYOK API, shared customer runtime, and dedicated runtime alternatives;
- sleep-capable versus always-on where the state contract allows it;
- linear cost drivers and scale-break triggers.

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
- Kubernetes as the first customer path.
- Active-active Relay, distributed scheduling, or live multi-region writes.
- A promise that every model can run affordably on CPU.
- Formal HIPAA, SOC 2, GDPR, data-residency, SSO, or SLA claims.
- Supporting every listed provider in the first release.
- Live paid deployments during G-078 itself.

## Acceptance criteria

1. A dated research matrix compares Vercel, Supabase, Cloudflare, Railway,
   Render, Fly.io, DigitalOcean, Hetzner, and runtime options using primary
   sources and separates full-host from component fit.
2. Topology comparison covers consolidated, PaaS multi-service, distributed,
   hybrid runtime, edge-control-plane, and Kubernetes paths with ownership,
   security, recovery, cost, and scale tradeoffs.
3. Every load-bearing layer has an A/B/C posture, selected v1 direction, and
   measurable revisit trigger.
4. The cost model can reproduce dated 1/10/100-instance examples and exposes all
   assumptions and exclusions.
5. TDR-044 records the sealed customer-owned reference architecture and remains
   proposed until implementation approval.
6. The threat model covers ingress, provider authorization, service network,
   secrets, backups, artifacts, runtime endpoints, licensing, lifecycle, and
   support/telemetry boundaries with repo evidence.
7. The wireframe describes comparison, configuration, authorization, progress,
   rescue, handoff, and mobile behavior without hiding required choices.
8. The implementation plan maps each criterion to bounded vertical slices,
   regression tests, provider conformance, runtime/browser evidence, and rescue.
9. G-058 and G-060 are amended as hard prerequisite contracts, and G-078 is
   decomposed into independently completable child goals.
10. G-078 closes without provisioning cloud resources, spending money, pushing,
    publishing, releasing, or accepting the proposed TDR/provider choice.

## Verification record

- 2026-07-15: repository audit covered CLI binding/warnings, environment/data
  paths, SQLite/WAL bootstrap, startup services, snapshots/auto-backup, local
  crypto root, license verification/gating, provider endpoint controls, and
  runtime configuration.
- 2026-07-15: provider/database/runtime research refreshed from authoritative
  sources listed in the research report.
- 2026-07-15: operator approved PROCEED scope and the six product/security
  assumptions. No provider account, credential, deployment, or spend was used.
- Deterministic documentation/cost-model verification commands are recorded in
  `features/licensed-self-service-cloud-deploy-plan.md`.

## References

- `features/licensed-self-service-cloud-deploy-research.md`
- `features/licensed-self-service-cloud-deploy-plan.md`
- `features/licensed-self-service-cloud-deploy-wireframe.md`
- `features/architect-report.md`
- `relay-threat-model.md`
- `.agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md`
