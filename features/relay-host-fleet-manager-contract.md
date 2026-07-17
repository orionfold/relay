---
title: Local Relay Host supervisor contract
status: accepted
goal: G-060
workstream: Customer-owned Relay Host
increment: R0 — Isolation contract
date: 2026-07-16
tdr: TDR-044 accepted by G-079 on 2026-07-16
dependencies: [relay-host-cell-isolation-boundary]
---

# Local Relay Host supervisor contract

## Outcome

Relay has an implementation-ready contract for a local, privileged **Relay Host
supervisor** that can inventory and eventually create, start, stop, upgrade,
export, transfer, revoke, and remove isolated **Relay cells**. The supervisor is
not a customer data plane, does not create row-level multi-tenancy, and is not a
service inside any cell.

Despite this file's historical `fleet-manager` filename, the accepted component
is a **Host supervisor**, not a Fleet Controller. A Host is one machine or VM;
its supervisor controls only Cells located on that Host. A future Fleet
Controller would coordinate several Hosts through their supervisors and is not
part of G-060 or G-083.

The approved first topology is one customer-owned local device or VM running one
supervisor and one or more OCI-container cells. Cells may share the Host only
when every customer accepts the same trusted Host administrator. A separate VM
or machine is the stronger boundary when that trust is unacceptable.

G-060 defines what later implementation must prove. It does not install a
container runtime, launch a container, expose a remote API, or publish an image.

## Approved decisions

The operator approved these decisions on 2026-07-16:

1. Start with a **single local Relay Host supervisor** managing OCI-container
   Cells on the same Host. Remote multi-Host/Fleet Controller authority is a
   later decision.
2. Keep a **content-free Host registry** containing lifecycle and resource facts
   only.
3. Use **customer-owned per-cell secret roots**. The registry stores only an
   opaque reference and health/presence state, never secret material.
4. Make the first vertical slice **inventory plus create/start/stop for synthetic
   cells**, with collision preflight, idempotency, rollback, and two-cell
   isolation evidence.

## Scope challenge

### REDUCE

Document only a read-only inventory. This would avoid privileged mutation but
would leave creation idempotency, collision refusal, partial state, rollback,
and the real isolation contract to be invented during G-083.

### PROCEED — approved

Specify the complete authority and lifecycle grammar, while implementing later
in a bounded synthetic create/start/stop slice. This is the smallest scope that
makes G-080 through G-083 independently executable.

### EXPAND

Add a remote Fleet Controller, browser lifecycle APIs, public ingress, provider
authorization, real backup transport, entitlements, or cloud provisioning.
Those remain owned by G-081 through G-085.

## System and authority boundary

```text
Host administrator
  → local CLI / protected Unix socket
    → Relay Host supervisor (privileged, content-free)
      → dedicated Host registry + receipts
      → OCI runtime adapter
        → Relay cell A (own data/secrets/license/logs/network)
        → Relay cell B (own data/secrets/license/logs/network)
```

If a later goal introduces multi-Host coordination, it must preserve this
delegation boundary:

```text
Fleet Controller (future, content-free)
  → authenticated Host A supervisor → Host A Cells
  → authenticated Host B supervisor → Host B Cells
```

The Fleet Controller never calls a Cell lifecycle endpoint directly. Each Host
supervisor rechecks authority, plan digest, ownership, capacity, image digest,
paths, ports, networks, and current operation state before changing a local
Cell. A Host and Fleet Controller are never interchangeable terms.

- The supervisor is a separate executable and process. It MUST NOT be started
  from `src/instrumentation-node.ts` or imported into a cell's Next.js graph.
- The first control boundary is local OS authority: an administrator invokes a
  CLI directly or connects through a root/administrator-owned Unix socket whose
  peer identity is verified. There is no remote HTTP lifecycle API in this
  contract.
- The supervisor has Host-wide authority by design. Any administrator able to
  control it can inspect or replace resident cells. This is explicit trust, not
  a container-hardening claim.
- A cell never receives the supervisor socket, Host registry, another cell's
  volume, or Host-level container-runtime authority.
- The Host registry is a dedicated database under a dedicated Host root. It
  MUST NOT reuse a cell's `relay.db`, settings table, data directory, keyfile,
  license store, snapshot directory, or logs.

## Vocabulary

- **Relay Host:** one physical machine or VM and its local administrative and
  failure boundary.
- **Host supervisor:** the privileged, content-free process that controls only
  Cells resident on its Relay Host.
- **Fleet Controller:** a future remote coordinator for multiple Hosts. It owns
  no Cell data and delegates requests to Host supervisors; it is excluded from
  this contract.

- **Host root:** supervisor-owned filesystem root containing the dedicated
  registry, redacted receipts, locks, and non-secret manifest cache.
- **Cell root:** one cell's complete data boundary, including `RELAY_DATA_DIR`,
  SQLite/WAL, files, keyfile/secret references, licenses, logs, and backups.
- **Owner reference:** opaque stable identifier binding a cell to an ownership
  authority. It is not a customer name, email, prompt, project, table row, or
  authorization credential.
- **Plan digest:** hash of the canonical, redacted desired Host/cell operation.
  Retries with the same digest reconcile; incompatible reuse is rejected.
- **Lifecycle receipt:** content-free record of actor, operation, state changes,
  resource references, reason codes, and rescue status.

## Minimum registry contract

The dedicated Host registry may use SQLite/WAL for atomic state transitions,
but it is a different database from every cell. The minimum logical records are:

```ts
interface HostRecordV1 {
  schemaVersion: 1;
  hostId: string;
  supervisorVersion: string;
  runtimeKind: "docker" | "podman";
  desiredState: "ready" | "draining" | "offline";
  actualState: "initializing" | "ready" | "degraded" | "draining" | "offline" | "error";
  capacity: {
    cpuMillis: number;
    memoryBytes: number;
    storageBytes: number;
    reservePercent: number;
  };
  createdAt: number;
  updatedAt: number;
}

interface CellRecordV1 {
  schemaVersion: 1;
  cellId: string;
  ownerRef: string;
  artifact: {
    version: string;
    digest: string;
    schemaMin: number;
    schemaMax: number;
  };
  desiredState: "absent" | "stopped" | "running";
  actualState:
    | "absent" | "creating" | "stopped" | "starting" | "running"
    | "stopping" | "upgrading" | "exporting" | "removing" | "rolling_back"
    | "partial" | "error" | "orphaned";
  allocation: {
    containerName: string;
    dataVolumeRef: string;
    secretRootRef: string;
    networkName: string;
    hostLoopbackPort: number;
    cpuMillis: number;
    memoryBytes: number;
    storageBytes: number;
  };
  manifestDigest: string;
  health: "unknown" | "starting" | "healthy" | "degraded" | "unreachable";
  backupStatus: "unknown" | "pending" | "verified" | "degraded";
  lastReceiptId: string | null;
  createdAt: number;
  updatedAt: number;
}

interface LifecycleReceiptV1 {
  schemaVersion: 1;
  receiptId: string;
  operationId: string;
  planDigest: string;
  hostId: string;
  cellId: string | null;
  actorRef: string; // opaque local-authority ID; never a username or email
  action: "inventory" | "create" | "start" | "stop" | "upgrade" |
    "export" | "transfer" | "revoke" | "remove" | "rollback";
  outcome: "running" | "succeeded" | "failed" | "partial" |
    "rolled_back" | "rollback_partial" | "cancelled";
  reasonCode: string;
  resourceRefs: string[];
  startedAt: number;
  completedAt: number | null;
}
```

The physical schema may normalize fields, but the public/domain contract stays
versioned and validated. Registry and receipts MUST NOT contain customer names,
emails, prompts, messages, documents, table rows, model responses, credentials,
authorization tokens, secret values, raw cell logs, or backup contents.

## Manifest and secret ownership

- Every mutation consumes a versioned, Zod-validated Host/cell manifest and a
  canonical plan digest.
- OCI images are referenced by immutable digest. A mutable tag may be displayed
  as an alias but is never execution authority.
- `secretRootRef` identifies a cell-owned mount or secret-manager reference. It
  is unique per cell and cannot point inside another cell root or the Host
  registry.
- The supervisor may verify that a secret reference exists and can be mounted,
  but registry, receipts, API payloads, logs, and support output never serialize
  its contents.
- The Host administrator remains capable of reading resident secrets at the OS
  boundary. Customers who reject that trust use a separate VM/machine.

## State machines

### Host

```text
uninitialized → initializing → ready ↔ degraded
ready → draining → offline
initializing → error
degraded → draining | error
```

Only `ready` admits new cells. `draining` refuses creates/upgrades but permits
inventory, stop, export, rollback, and rescue. `error` never implies that cells
are absent or safe to delete.

### Cell desired versus actual state

Desired state is only `absent`, `stopped`, or `running`. Actual state records
work and failures. Legal first-slice transitions are:

```text
absent → creating → stopped → starting → running
running → stopping → stopped
creating | starting | stopping → partial | error
partial | error → rolling_back → absent | stopped | error
```

Later operations add `upgrading`, `exporting`, `removing`, and `orphaned` but use
the same operation grammar. `stop` never means delete. `remove` defaults to
retain data and secret roots; purge is a separate, freshly confirmed policy.

### Operation

```text
planned → preflight-passed → applying → verifying → succeeded
planned | preflight-passed | applying | verifying → failed | partial | cancelled
failed | partial → rolling-back → rolled-back | rollback-partial
```

Every transition is atomic in the Host registry. A crashed supervisor resumes by
reconciling observed OCI resources against the last durable operation receipt.
It never reports success from intent alone.

### Ownership and authorization

```text
unassigned → owned
owned → transfer-pending → transfer-ready → owned (new ownerRef)
owned → automation-revoked
transfer-pending | transfer-ready → owned | automation-revoked
automation-revoked → owned (fresh authorization)
```

Revocation stops new lifecycle automation; it does not delete, encrypt, stop, or
strand the cell. Export/recovery and direct Host ownership remain available.
G-079 accepted the final owner/authorization vocabulary and additionally
requires current-owner authorization, target-owner acceptance and a verified export/
recovery checkpoint before transfer. G-081/G-083 implement remote/session and
entitlement enforcement.

## Preflight and collision refusal

Before any mutation, the supervisor must reject:

- duplicate cell, container, volume, network, port, owner-binding, or operation
  identifiers with incompatible plan digests;
- data, secret, receipt, or manifest paths outside their allowed canonical root,
  including symlink and traversal escapes;
- a volume or secret root already owned by another cell;
- wildcard-public cell or model-runtime ports;
- overlapping private network allocation or an already-bound loopback port;
- mutable or unsigned artifact authority once G-080 supplies signatures;
- missing schema compatibility or an impossible desired/actual transition;
- CPU, memory, storage, or Host-reserve oversubscription;
- a request from an unverified local peer or an actor not authorized for the
  current owner reference; and
- any manifest or receipt field containing secret material or customer content.

Preflight decisions are advisory only until rechecked immediately before the OCI
mutation. TOCTOU differences produce a named collision failure, never a best-
effort reuse.

## First implementation slice

The approved slice is intentionally bounded:

1. Pure versioned contracts, state machines, named errors, and a fake OCI runtime
   adapter.
2. A dedicated temporary Host registry and content scanner.
3. Read-only Host/cell inventory.
4. Idempotent create, start, and stop for two synthetic cells with distinct
   owner refs, data roots, secret refs, ports, networks, names, and limits.
5. Collision/path-escape/capacity refusal plus injected partial-create and
   rollback evidence.
6. A real OCI adapter only after G-080 supplies the supported digest-pinned
   artifact contract. Until then, no customer isolation claim is made.

No customer browser or cell can invoke this slice. The local Host administrator
operates it from a CLI/test harness.

## Failure and rescue behavior

| Failure | Visible state | Rescue |
|---|---|---|
| registry unavailable/corrupt | Host `error`; no mutation | restore registry backup or reconstruct read-only inventory from labeled OCI resources, then reconcile |
| duplicate plan replay | existing receipt returned when identical; conflict otherwise | use the original operation or create a new explicit plan |
| port/network/volume/secret collision | preflight failure with resource and owner refs | repair allocation; never reuse another cell resource |
| OCI create partially succeeds | cell `partial`; exact resource refs retained | resume missing steps or scoped rollback |
| supervisor crashes mid-operation | last durable state remains non-terminal | restart and reconcile observed resources before accepting another mutation |
| rollback partially fails | `rollback_partial`; remaining resources named | manual Host-admin cleanup followed by inventory/reconcile |
| cell health never becomes ready | create/start fails verification | preserve cell evidence; stop or rollback without deleting data |
| Host capacity changes after preflight | mutation refused at apply-time | resize, stop work, or move the cell plan to another Host |
| secret reference missing | named secret-reference failure | repair customer-owned reference; never synthesize or copy another cell's secret |
| owner automation revoked | new mutations denied; cell/data retained | reauthorize or use direct Host/export/recovery path |

## Acceptance criteria

1. The contract distinguishes Host, cell, owner, local actor, registry, manifest,
   receipt, data root, and secret root without row-level tenant semantics.
2. The supervisor is a separate process/data store and is never imported or
   started by a cell.
3. The minimum registry is versioned, content-free, and sufficient to reconcile
   desired/actual lifecycle and exact partial resources.
4. Host, cell, operation, and ownership state machines list legal transitions,
   terminal/partial states, and rescue paths.
5. First topology and first slice match the operator-approved OCI/local-only
   direction.
6. The future two-cell verification budget covers distinct DB/files, mounts,
   networks, loopback
   ports, secret roots, identities, licenses, logs, limits, backup lineage, and
   runtime policy, while documenting Host-admin privilege.
7. The future regression budget names deterministic collision, path escape,
   replay, capacity exhaustion, partial operation, rollback failure, and
   registry-content leakage tests.
8. TDR-044, `relay-threat-model.md`, the architecture impact report, future
   implementation plan, and canonical backlog use the same contract.
9. No application schema migration, supervisor runtime, OCI image, ingress,
   entitlement, provider credential, cloud resource, push, publish, or release
   occurs in G-060.

## Regression disposition

G-060 changes planning contracts only. Its deterministic guards are document
parity, local-path validation, state/field vocabulary checks, and a fresh
security/architecture review. The implementation plan names the future unit,
integration, OCI, runtime, staging, and browser budgets. No behavioral test is
claimed for code that does not yet exist.

## Acceptance receipt

Accepted on 2026-07-16 after the operator approved the first topology, minimum
metadata, secret ownership, and first vertical slice. Verification established:

- repository-grounded ownership of the current cell data root, DB, bootstrap,
  process startup, local keyfile, licenses, snapshots, and runtime endpoint;
- a separate supervisor executable/Host DB boundary with explicit prohibitions
  against cell instrumentation, cell DB, runtime socket, and customer-content
  coupling;
- versioned minimum registry/receipt schemas, Host/cell/operation/ownership state
  machines, exact partial/rollback rescue, and a bounded future test matrix;
- amended TDR-044 (then proposed and later accepted by G-079) plus the updated
  repo threat model with local authority,
  TOCTOU, cross-cell, supply-chain, lifecycle, and content-leakage abuse paths;
- local-reference, separate-process, vocabulary, acceptance-to-plan, and
  `git diff --check` parity gates; and
- fresh two-pass review with no unresolved Pass 1 issue. Review repaired the
  rollback state, reauthorization path, and opaque owner-reference invariant.

No application code, migration, container, socket, provider resource,
credential, push, publish, version, or release changed in this goal.

## NOT in scope

- application code or schema changes;
- real Docker/Podman/container mutations;
- remote or browser Host lifecycle control;
- public/tailnet ingress and Relay authentication;
- provider OAuth, billing, VM creation, or retained provider credentials;
- off-Host backup transport, KMS implementation, or accepted RPO/RTO;
- signed OCI publication or registry writes;
- entitlement enforcement, UI, or lifecycle lapse behavior;
- multi-Host/Fleet Controller command authority or an Orionfold-hosted control
  plane; and
- protection from the trusted Host administrator.

## References

- `features/relay-host-cell-isolation-boundary.md`
- `features/relay-host-authority-isolation-contract.md`
- `features/licensed-self-service-cloud-deploy.md`
- `features/licensed-self-service-cloud-deploy-research.md`
- `features/licensed-self-service-cloud-deploy-plan.md`
- `.agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md`
- `relay-threat-model.md`
- `src/lib/instance/`
- `src/lib/config/env.ts`
- `src/instrumentation-node.ts`
- `src/lib/db/index.ts`
- `src/lib/utils/crypto.ts`
- `src/lib/licensing/`
- `src/lib/snapshots/`
