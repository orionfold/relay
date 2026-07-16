---
id: TDR-044
title: Customer-owned isolated cloud deployment
status: proposed
date: 2026-07-15
goal: G-078
---

# TDR-044: Customer-owned isolated cloud deployment

## Context

Relay is distributed as a local-first, single-customer Next.js process with a
local `RELAY_DATA_DIR`, synchronous SQLite/WAL access, local files, a
single-process scheduler, and file-backed offline licensing. The CLI can bind to
non-loopback addresses, but it explicitly warns that Relay has no application
network authentication. Packaging the current process onto an internet-facing
host would therefore expose an auth-light administrative application and would
not meet the product promise of safe self-service cloud deployment.

G-078 asks for a paid, license-gated end-customer capability that compares cost
and scalability and deploys Relay into the customer's cloud account. It must
support BYOK model APIs, optional private Ollama/LM Studio/LiteLLM services, and
later distributed topologies without turning Relay Core into a row-level
multi-tenant service. The operator approved the PROCEED scope and these v1
assumptions on 2026-07-15: customer ownership of resources and credentials;
one customer/organization per deployment; authenticated internet ingress;
ordinary confidential business data rather than regulated-data claims; no
customer-content telemetry to Orionfold; and isolated SQLite plus off-host
recovery unless a measured scale trigger justifies a remote database.

## Decision

Adopt a **sealed customer-owned deployment stack** as the first reference
architecture.

1. Each Relay instance is one security and failure boundary: one process or
   container, hostname, data directory, local block volume, identity realm,
   secrets set, logs, and runtime policy for one customer organization.
2. The customer owns the provider account, bill, resources, data, and long-lived
   provider credentials. A deployment authorization is short-lived and scoped;
   v1 has no Orionfold-hosted control plane that retains cloud credentials.
3. Internet exposure is impossible until a dedicated first-admin bootstrap,
   authenticated session, TLS, CSRF, rate-limit, recovery, and audit boundary is
   present. Provider TLS alone does not replace Relay authorization.
4. Preserve local SQLite/WAL and the single scheduler per instance for v1.
   Attach a local persistent block volume and continuously or periodically copy
   a versioned, encrypted recovery artifact to customer-owned object storage.
   Never place SQLite WAL on a shared network filesystem.
5. Make storage choices per layer, not through one global `cloudMode` flag:
   preserve operational SQLite and scheduler initially; introduce typed local
   and cloud adapters for backup transport, secrets root of trust, identity
   exposure profile, distribution, and redacted observability when implemented.
6. Publish one signed, immutable OCI artifact derived from the same Relay release
   and data contract as the npm distribution. A topology manifest selects
   provider capabilities at the instance boundary.
7. Gate deploy planning, provider authorization, provisioning, upgrade, and
   destructive lifecycle actions with a dedicated paid entitlement, working name
   `product:relay-cloud-deploy`, using the existing signature → term → entitlement
   verifier. License loss never deletes or encrypts existing customer data and
   never blocks verified export/recovery.
8. Prove the provider adapter contract against Railway as the first
   template-oriented candidate and DigitalOcean as the first VM-oriented
   portability candidate. This is a conformance order, not approval to ship
   either provider. Live provider writes and spend remain operator-gated.
9. BYOK external model APIs are the default cost baseline. Optional Ollama,
   LM Studio headless, or LiteLLM services run on the same private provider
   network or behind an outbound-established authenticated hybrid tunnel. No
   unauthenticated Ollama port is publicly exposed.

### Architecture posture by layer

| Layer | v1 posture | Revisit trigger |
|---|---|---|
| Operational data | A: isolated SQLite/WAL on local block volume | active-active writes, horizontal app replicas, or recovery objectives fail the volume-plus-replication proof |
| Files/documents | A for live files; B for backup/export transport | multi-host direct access or volume portability becomes a product requirement |
| Secrets | B: local keyfile/keychain versus cloud secret manager/KMS | one portable envelope can preserve distinct roots of trust without weakening either mode |
| Identity/public access | B: trusted-local and remote-authenticated exposure profiles under one authorization contract | local mode can adopt the same identity without breaking offline first-run |
| Scheduler/execution | A: one owner per instance | horizontal workers or failover require leases/queue semantics |
| Live events | A: process-local/SSE with sticky single instance | multiple Relay replicas must serve one instance |
| Model runtimes | A endpoint protocol; B provisioning/lifecycle adapter | Relay must create or autoscale runtime capacity itself |
| Backup/restore | B: local archive plus object-storage transport using one manifest | recovery testing demonstrates a need for continuous database replication |
| Observability | B: local evidence plus optional redacted sink | a managed service is separately approved with telemetry policy |
| Distribution | B: npm/local plus signed OCI/cloud from one release manifest | one artifact can preserve both zero-friction local install and cloud operations |

## Consequences

### Positive

- The first cloud slice preserves the proven local data path and limits the
  initial blast radius to packaging, identity, recovery, secrets, provider
  orchestration, and operations.
- A customer can leave a provider with an exported Relay data directory and
  recovery manifest instead of depending on an Orionfold-hosted data plane.
- Provider adapters remain replaceable because they consume a typed topology
  manifest rather than leaking provider conditionals into Relay Core.
- G-058 and G-060 retain the process-per-customer isolation model.

### Costs and limitations

- One instance has one writable Relay process and one local volume. It is not
  active-active and has a provider/host recovery interval.
- Per-customer always-on resources scale approximately linearly until a later
  fleet packing or remote-data architecture is approved.
- Identity, recovery, OCI supply chain, and provider conformance are hard
  dependencies; “deploy now” cannot safely ship ahead of them.
- Supporting local and cloud roots of trust creates deliberate adapter and test
  matrices for several layers.

### Explicitly rejected

- Shared SQLite/WAL on NFS or other network storage.
- A global `cloudMode` flag with scattered behavior branches.
- Row-level multi-tenancy inside Relay Core for this feature.
- Vercel/Cloudflare/Supabase edge functions as an unchanged Relay host.
- Retaining customer provider credentials in an Orionfold service by default.
- Treating LiteFS, Turso Sync, or Postgres as a zero-cost drop-in abstraction.
- Public unauthenticated Ollama, LM Studio, LiteLLM, or Relay endpoints.

## Alternatives considered

### Remote Postgres for every deployment

This enables shared state and future horizontal application replicas, but Relay
currently depends on synchronous SQLite, local bootstrap/migrations, and
single-process coordination. It adds network availability, connection pooling,
two-dialect migration, and transaction-semantic work before v1 needs those
benefits. Reconsider when the operational-data revisit trigger fires.

### Turso Sync or embedded replicas

Turso now recommends Sync for local-first reads/writes, but it changes the
database engine/client and introduces explicit push/pull, conflict, credential,
and managed-service semantics. It merits a separate conformance spike, not an
assumption that current `better-sqlite3` behavior remains identical.

### LiteFS replicated SQLite

LiteFS preserves a local SQLite shape and supplies read replicas, but it is
single-primary, asynchronously replicated, FUSE-based, pre-1.0, and Fly warns
against unsupported autoscale combinations that can lose data. It is not the v1
durability mechanism; verified off-host backups have a smaller failure surface.

### One consolidated multi-customer host

Packing isolated Relay containers can reduce unit cost, but it creates a shared
host failure domain, noisy-neighbor controls, fleet authority, and cross-customer
operations. It remains a later G-060 topology after the one-instance contract is
proven.

## Status and approval

This record is **proposed**. G-078 recommends it; acceptance belongs to the first
implementation goal's operator architecture gate. No provider is approved for
publication or paid deployment by this record.

## References

- `features/licensed-self-service-cloud-deploy.md`
- `features/licensed-self-service-cloud-deploy-research.md`
- `features/licensed-self-service-cloud-deploy-plan.md`
- `relay-threat-model.md`
- `features/architect-report.md`
- TDR-010, TDR-029, TDR-030, TDR-041, TDR-042, and TDR-043
- https://sqlite.org/wal.html
- https://litestream.io/guides/directory/
- https://fly.io/docs/litefs/
- https://docs.turso.tech/features/embedded-replicas/introduction
- https://docs.turso.tech/sync/local-sync-server
