---
id: TDR-044
title: Customer-owned Relay Host with isolated cells
status: accepted
date: 2026-07-15
amended: 2026-07-16 (G-060 local Host supervisor contract); 2026-07-17 (Host/Cell distribution, Supervisor/Fleet boundaries, and G-095 fulfillment contract); 2026-07-18 (G-094 OCI publication authority)
accepted: 2026-07-16 (G-079 authority and isolation contract)
goal: G-078, G-060, G-079, G-094
---

# TDR-044: Customer-owned Relay Host with isolated cells

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

Follow-up research on 2026-07-16 compared the primary deployment models of
OpenClaw, Hermes Agent, and NVIDIA NemoClaw because Relay was originally modeled
around this product category. All three treat local hardware and a cloud
VPS/remote device as placements for substantially the same durable agent stack:

- OpenClaw runs one Gateway with state and workspace on a device or VPS. Its
  experimental Fleet model is explicitly a single-host supervisor with one full
  isolated cell per tenant and no shared tenant data plane or remote-host control
  plane.
- Hermes runs one durable backend on a laptop, home server, Mini, or VPS, with
  local state and optional Docker/SSH/Modal execution isolation. Remote access is
  attached to that backend rather than a horizontally scaled application tier.
- NemoClaw's standard topology is a host CLI, a host OpenShell gateway, and a
  Docker sandbox. Its remote-GPU path provisions one VM and runs the same stack
  there; Kubernetes is not the default Docker-driver topology.

This evidence changes the reference from “one cloud service per Relay instance”
to a device-or-server appliance that can host one or more isolated Relay cells.

## Decision

### Plain-language vocabulary

- A **Host** is the laptop, workstation, home server, or cloud VM that owns the
  operating-system boundary and runs Relay. In managed mode it also runs the
  Host supervisor, ingress, backup transport, and optional local model runtime.
  A Host is a machine boundary, not a Fleet Controller.
- A **Cell** is one complete Relay instance for one customer trust boundary. It
  has its own process/container, data directory, SQLite database, files,
  identity, secrets, license, logs, network route, resource limits, and backup
  history.
- A **customer, project, or folder** is an organizing record inside a Cell. It
  is useful for attribution and workflow, but it is not a security boundary.
- The **Host supervisor** is the local control program that creates, verifies,
  starts, stops, upgrades, backs up, and removes Cells physically located on
  that Host. It does not manage Cells on another Host, process customer work,
  or live inside the Cell image.
- A **Fleet Controller** would be an optional future, content-free coordinator
  for several independent Hosts. It may request desired lifecycle operations
  from each authenticated Host supervisor, but it never becomes a Host, mounts
  Cell data, talks to a Cell database, or controls a remote Cell directly.
- The **Relay Cell image** is the packaged Relay application pulled from an OCI
  registry. Starting the same image more than once with separate resources
  creates separate Cells; it never turns into the Host supervisor.

The authority chain is deliberately layered:

```text
optional future Fleet Controller
  → authenticated Relay Host supervisor A → Cells physically on Host A
  → authenticated Relay Host supervisor B → Cells physically on Host B
  → authenticated Relay Host supervisor C → Cells physically on Host C
```

Server A controlling Cells on servers B, C, and D is therefore not one Host
with remote Cells. It is a future Fleet Controller coordinating three Hosts.

Adopt a **customer-owned Relay Host with isolated cells** as the first reference
architecture. The same host contract runs on a local device, home/office server,
or cloud VM.

1. A **Relay Host** is one trusted machine or VM running a small host supervisor,
   a reverse-proxy/tailnet boundary, backup transport, and optionally customer-
   owned model runtimes. The supervisor manages local containers/processes and
   records only content-free lifecycle metadata.
2. A **Relay cell** is one complete Relay instance and one customer trust
   boundary: its own container/process, hostname or routed path, loopback-only
   host port, network, data directory/volume, SQLite database, files, identity
   realm, secrets, license, logs, resource budget, backup lineage, and runtime
   policy. Session or customer IDs do not substitute for this boundary.
3. Multiple cells may share one host only when their tenants trust the host
   operator and explicitly accept the agreed container/OS boundary. Eligibility
   is decided per Host and is never inferred from customer segment, owner ID or
   billing relationship. Mutually hostile tenants or customers requiring an
   administrative boundary receive a separate VM/machine. A compromised host
   can read or replace its cells; host resistance is not a v1 security claim.
4. Cell endpoints publish only to host loopback or a private network. An
   approved reverse proxy, VPN/tailnet, or authenticated Relay ingress exposes
   them remotely. No cell or model-runtime port is wildcard-public by default.
5. The local-device and cloud-server products use the same release manifest,
   Cell image, lifecycle operations, backup/export format, and verification.
   The direct local npm path may run one Relay process as one Cell without the
   Host supervisor. The managed Host path installs the Host bootstrap and
   supervisor through the Relay npm package, then pulls the digest-pinned Cell
   image from the approved OCI registry. Cloud deployment provisions a Host and
   applies this same contract; it does not require Relay to become a distributed
   PaaS application.
6. The customer owns the host/provider account, bill, resources, data, and
   long-lived provider credentials. A deployment authorization is short-lived
   and scoped; v1 has no Orionfold-hosted control plane retaining credentials.
7. Internet exposure is impossible until first-admin bootstrap, authenticated
   sessions, TLS, CSRF, rate limits, recovery, device/client authorization, and
   audit boundaries exist. Provider TLS alone does not replace Relay auth.
8. Preserve SQLite/WAL, live files, and one scheduler per cell. Store them on
   host-local block storage and copy versioned encrypted recovery artifacts to
   customer-owned off-host storage. Never place SQLite WAL on shared network
   storage and never share one SQLite database between cells.
9. The host supervisor is not a customer data plane. Its minimum registry is
   cell identity, opaque owning-customer reference, artifact/version, desired/actual
   state, local port/network, resource limits, health, backup status, and
   lifecycle receipt pointers. It does not proxy tenant messages, prompts,
   documents, table rows, credentials, or raw logs.
10. BYOK hosted inference is the smallest host profile. Ollama, LM Studio
    headless, or LiteLLM may run on the same host/private network. Sharing a
    runtime across cells is allowed only inside one customer trust boundary or
    behind per-cell credentials, quotas, log isolation, and an explicit operator
    decision; public unauthenticated runtime ports are prohibited.
11. Publish one signed immutable **Relay Cell OCI image** derived from the same
    locked source and version as the npm release. Continue to deliver the Relay
    CLI, direct local single-Cell runtime, and future Host bootstrap/supervisor
    through npm; the npm package contains an immutable Cell-image reference and
    verification contract, not the image bytes. A versioned Host/Cell manifest
    supplies local lifecycle and provider-bootstrap inputs without leaking
    provider branches into Relay Core. The Cell image never contains or starts
    the Host supervisor and has no Host/Cell mode switch. “Same release” binds
    source, version, schema/runtime compatibility and manifest authority; it
    does not mean byte-identical artifacts. npm is a host-resolved package that
    relies on destination Node, dependency installation, OS and native
    libraries. OCI is the closed, pinned Linux Cell runtime. Artifact-size
    reporting must compare complete installed runtime closures rather than the
    npm tarball alone with the OCI image.
12. Gate paid Host expansion and routine forward upgrades with the accepted
    placement-neutral `product:relay-host` grant. The launch contract signs one
    Host, ten managed Cells, a 12-month term, a distinct update boundary, and
    same-licensee replacement. Running, stopped, and retained managed Cells
    count; direct unmanaged, exported-and-released, and purged Cells do not.
    Lapse never stops or strands existing Cells and never blocks start/stop,
    verified export, recovery, rollback, purge, or compatible critical security
    updates. Pack rights remain a separate entitlement. Commercial license,
    OCI signature, and registry access are independent authorities.
13. Prove the first appliance on a clean DigitalOcean VM because the official
    OpenClaw precedent and DigitalOcean's simple VM primitives make the single-
    server contract directly observable. Prove a second VM provider or local
    hardware before a general portability claim. PaaS is a later optional
    single-cell packaging adapter, not the reference architecture.
14. Make storage choices per layer, not through one global `cloudMode` flag:
   preserve operational SQLite and scheduler initially; introduce typed local
   and cloud adapters for backup transport, secrets root of trust, identity
   exposure profile, distribution, and redacted observability when implemented.
15. Run the Host supervisor as a separate executable and process. It never runs
    from a cell's `src/instrumentation-node.ts` and never imports the cell DB,
    settings, routes, runtime registry, workflows, chat tools, keyfile or
    snapshots. A cell never receives the supervisor or container-runtime socket.
16. Give the supervisor a dedicated Host root and atomic `host.db` registry,
    separate from every cell data root. The registry uses opaque owner
    references and content-free lifecycle/resource records only. It never stores
    customer names/emails, prompts, documents, table rows, model responses,
    credentials, secret values, raw logs or backup contents.
17. Begin with local Host-administrator authority through a direct CLI or an
    administrator-owned Unix socket with peer credential checks. No TCP,
    browser, remote multi-Host, Fleet Controller, or Orionfold control-plane
    lifecycle authority is created by the first supervisor slice. If a Fleet
    Controller is later approved, each Host supervisor independently
    authenticates it, revalidates ownership/capacity/artifact/operation state,
    and remains the only component allowed to mutate its local Cells.
18. Keep secret ownership per cell and customer. The supervisor records only an
    opaque `secretRootRef` plus presence/health. Host-admin trust remains
    explicit; stronger administrative separation means another VM/machine.
19. Separate desired state, observed actual state and durable operation state.
    Every effect is bound to a canonical redacted plan digest, collision and
    capacity preflight, an applying checkpoint, observed verification and an
    exact success/partial/rollback receipt. Identical retries reconcile;
    incompatible identity/digest reuse is refused.
20. The first implementation slice is read-only inventory plus create/start/stop
    for two synthetic cells through an injected fake OCI adapter, including
    collision, path escape, capacity, crash and rollback evidence. A real OCI
    adapter and any isolation claim wait for G-080's digest-pinned artifact and
    the later release gates.
21. The minimum same-Host hardening rung is non-root, non-privileged cell
    execution; dropped Linux capabilities; default seccomp/LSM protection;
    private per-cell networking and loopback-published ports; distinct contained
    mounts, secret roots, logs and backup lineage; enforced CPU/memory/storage
    limits; and a read-only root filesystem wherever G-080 proves compatibility.
    A cell never receives the supervisor or OCI-runtime socket. Failure to prove
    a required control refuses the same-Host isolation claim.
22. Ownership transfer requires current-owner authorization and target-owner acceptance.
    A verified export/recovery checkpoint must exist before the owner reference
    changes. Revocation stops new lifecycle automation but never stops, deletes,
    encrypts or strands a cell and never blocks export/recovery. Fresh
    authorization is required to resume automation. Host-admin emergency access
    is not represented as a customer-authorized transfer.
23. Initial admission uses provisional inputs of 1 GiB memory per cell, 0.5 GiB
    Host reserve, 90% maximum memory utilization, three cells per vCPU, and an
    explicit per-cell storage ceiling. G-080 must measure and confirm or revise
    these inputs before any capacity or support claim.
24. Use GHCR as the only launch registry. The public production subject is
    `ghcr.io/orionfold/relay-cell`; private candidate validation uses
    `ghcr.io/orionfold/relay-cell-staging`. An exact release tag runs one
    protected tag-only workflow on native amd64 and arm64 runners. It copies the
    already-audited G-093 OCI layout to staging, then copies the verified digest
    to production without rebuilding. GitHub Actions OIDC is the sole launch
    signing identity; Cosign signatures and GitHub provenance, CycloneDX SBOM,
    platform-evidence and compatibility attestations bind the digest. Exact
    `vX.Y.Z` references and digest subjects are immutable. `vX.Y`, `stable`, and
    `stable-previous` are discovery pointers only; each forward promotion
    preserves the displaced digest at `stable-previous`, and rollback may only
    swap back to that digest in a separate protected, digest-verifying
    operation. Production exact releases are not
    automatically deleted. Launch adds no paid registry, mirror, runner, KMS or
    long-lived registry/signing secret. These decisions prepare a mechanism;
    they do not authorize its first external run or public visibility change.

### Architecture posture by layer

| Layer | v1 posture | Revisit trigger |
|---|---|---|
| Operational data | A: isolated SQLite/WAL per cell on host-local block storage | active-active writes inside one cell, horizontal replicas, or recovery objectives fail the host-plus-replication proof |
| Files/documents | A for live files; B for backup/export transport | multi-host direct access or volume portability becomes a product requirement |
| Secrets | B: per-cell local envelope with host/device keychain or cloud secret manager/KMS root | one portable envelope can preserve distinct roots of trust without weakening either mode |
| Identity/public access | B: trusted-local and remote-authenticated exposure profiles under one authorization contract | local mode can adopt the same identity without breaking offline first-run |
| Host/cell lifecycle | B: each local device or cloud VM is one Host whose local supervisor alone controls its resident Cells | add a content-free Fleet Controller only when paid multi-Host demand justifies the new remote authority boundary |
| Scheduler/execution | A: one owner per cell | horizontal workers or failover inside one cell require leases/queue semantics |
| Live events | A: process-local/SSE per cell | multiple Relay replicas must serve one cell |
| Model runtimes | A endpoint protocol; B host-local/private lifecycle adapter | runtime capacity must scale independently of a host or span trust boundaries |
| Backup/restore | B: local archive plus object-storage transport using one manifest | recovery testing demonstrates a need for continuous database replication |
| Observability | B: local evidence plus optional redacted sink | a managed service is separately approved with telemetry policy |
| Distribution | B: npm provides the host-resolved CLI, direct local single-Cell path and managed-Host bootstrap/supervisor; the OCI registry provides the closed signed immutable Linux Cell runtime; one release manifest binds compatible but byte-distinct artifacts | revisit only if npm cannot safely deliver the Host control surface, managed multi-Cell isolation no longer needs OCI, or a non-container Cell target becomes required |

## Consequences

### Positive

- Local and cloud become placements of the same appliance instead of separate
  application architectures.
- The first slice preserves Relay's proven single-process data path and limits
  the new blast radius to host supervision, isolation, identity, recovery,
  packaging, and provider bootstrap.
- A customer can leave a provider with an exported Relay data directory and
  recovery manifest instead of depending on an Orionfold-hosted data plane.
- Provider adapters only create a machine and apply the host manifest, making
  them thinner and easier to replace than multi-service PaaS orchestration.
- G-058 and G-060 retain the process-per-customer isolation model.

### Costs and limitations

- One cell has one writable Relay process and one local data root. It is not
  active-active and inherits its host's failure/recovery interval.
- Multiple cells on one host share the host failure and administrative domain;
  capacity grows by sizing up, then adding independent host shards.
- The host supervisor and reverse-proxy/tailnet layer become new privileged
  components requiring hardening, upgrades, receipts, and recovery.
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
- A shared Relay process or database whose `tenantId` is treated as isolation.
- A PaaS-scale distributed data/control plane before single-host capacity or
  customer evidence requires it.

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

### One PaaS service per cell

PaaS services can package a single cell and automate TLS, but their per-service
compute/volume model is not the product architecture used by the closest
reference systems. It makes host-local model runtimes, cell packing, local/cloud
parity, firewalling, and portable recovery more provider-specific. Retain PaaS
as a later adapter for customers who value managed operations over the appliance
contract.

### Distributed control plane and remote database

A shared control plane, scheduler, pub/sub, remote database, and separate runtime
fleet can scale farther, but they create the exact identity, availability,
credential-custody, migration, telemetry, and cross-customer blast radius that
the local-first reference products avoid. Trigger this only after a cell cannot
meet measured workload/recovery objectives or a multi-host self-service fleet has
paying demand.

## Status and approval

This record is **accepted**. G-078 recommended the appliance direction; G-060
received operator approval for the local OCI-cell topology, content-free
registry, customer-owned per-cell secret roots and bounded first slice; and on
2026-07-16 G-079 accepted the complete Host/cell authority, same-Host trust,
hardening, transfer/revocation and provisional admission contract. Acceptance
closes the R0 architecture gate and authorizes dependent implementation goals to
use this contract. It does not approve a provider, publication, release, paid
deployment, remote control plane, compliance claim or external write.

The 2026-07-17 terminology amendment makes the distribution boundary explicit:
npm is the Host bootstrap/control channel and remains the direct local
single-Cell channel; an OCI registry is the managed-Host Cell-runtime channel.
It also distinguishes the local Host supervisor from a possible future Fleet
Controller. It changes no accepted isolation or authority decision and grants
no remote multi-Host authority. The artifact-closure amendment records that
these channels carry the same release contract, not identical bytes: npm relies
on destination runtime prerequisites, while OCI closes over a pinned Linux Cell
runtime. The current 2,782,070-byte npm tarball and 129,934,743-byte arm64 image
therefore are not an apples-to-apples installed-footprint comparison.

The G-095 fulfillment amendment replaces the provisional cloud-specific
entitlement with `product:relay-host` and accepts an additive signed
`orionfold.relay-host/v1` grant inside the existing offline
`orionfold.license/v1` envelope. The executable parser/admission matrix lives in
`src/lib/licensing/host-entitlement.ts`; the issuer contract and vectors live in
`contracts/relay-host-license-v1.schema.json` and the licensing fixtures. No
online activation, registry token broker, live Website commerce change, or Host
supervisor effect is introduced by this architecture amendment.

The G-094 publication amendment makes the registry trust root executable while
preserving the three-authority boundary. Public Cell bytes and a valid OCI
signature prove neither a paid Host grant nor lifecycle admission. The Host
must pin the accepted multi-platform digest; tags never become manifest
authority. The initial support statement covers origin, integrity, provenance
and declared compatibility for the current and prior stable digests. It does
not claim vulnerability-free software, registry uptime, durability, RPO, RTO or
a mirrored service. The local implementation and dry-run are accepted design
evidence only; native registry pull/start/task, anonymous production pull,
partial-publication recovery and stable rollback remain operator-gated release
evidence.

## References

- `features/licensed-self-service-cloud-deploy.md`
- `features/licensed-self-service-cloud-deploy-research.md`
- `features/licensed-self-service-cloud-deploy-plan.md`
- `features/relay-host-cell-isolation-boundary.md`
- `features/relay-host-fleet-manager-contract.md`
- `features/relay-host-fleet-manager-plan.md`
- `features/relay-host-authority-isolation-contract.md`
- `features/relay-cell-oci-publication.md`
- `docs/relay-cell-oci-release.md`
- `relay-threat-model.md`
- `features/architect-report.md`
- TDR-010, TDR-029, TDR-030, TDR-041, TDR-042, and TDR-043
- https://sqlite.org/wal.html
- https://litestream.io/guides/directory/
- https://fly.io/docs/litefs/
- https://docs.turso.tech/features/embedded-replicas/introduction
- https://docs.turso.tech/sync/local-sync-server
- https://docs.openclaw.ai/gateway/multi-tenant-hosting
- https://docs.openclaw.ai/vps
- https://docs.openclaw.ai/security
- https://hermes-agent.nousresearch.com/docs/user-guide/docker/
- https://hermes-agent.nousresearch.com/docs/user-guide/desktop
- https://hermes-agent.nousresearch.com/docs/user-guide/security/
- https://docs.nvidia.com/nemoclaw/latest/user-guide/openclaw/reference/architecture
- https://docs.nvidia.com/nemoclaw/latest/about/overview.html
