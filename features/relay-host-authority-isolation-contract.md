---
title: Relay Host authority and isolation contract
status: accepted
goal: G-079
workstream: Customer-owned Relay Host
increment: R0 — Isolation contract
date: 2026-07-16
tdr: TDR-044 accepted 2026-07-16
dependencies: [relay-host-cell-isolation-boundary, relay-host-fleet-manager-contract]
---

# Relay Host authority and isolation contract

## Outcome

R0 is frozen around one truthful appliance boundary: a customer-owned **Relay
Host** runs a separate local supervisor and one or more complete **Relay cells**.
Each cell is one customer-organization trust boundary with its own process or
container, data root, SQLite/WAL, files, identity, secrets, license, logs,
network, loopback port, resource budget, runtime policy and recovery lineage.

Same-Host cells provide workload and customer-data separation from sibling
cells under an explicitly trusted Host administrator. They do not protect a
customer from that administrator or from compromise of the Host. A separate VM
or machine is the required stronger boundary when any resident customer does
not accept that trust.

This contract accepts TDR-044 and supplies the authority, transfer, revocation,
hardening and provisional admission decisions consumed by G-080 through G-084.
It creates no runtime, container, public endpoint, provider resource or release.

## Accepted decisions

The operator accepted these decisions on 2026-07-16:

1. Accept TDR-044 as amended by G-058, G-060 and this goal.
2. Allow multiple cells on one Host only when every resident customer explicitly
   trusts the Host administrator and accepts the documented container/OS
   boundary. Customer market segment is not a substitute for that consent.
3. Require a baseline cell profile of non-root execution, dropped Linux
   capabilities, private per-cell networking, distinct mounts and secret roots,
   resource limits, and a read-only root filesystem wherever the supported Relay
   artifact is compatible. No cell receives the Host supervisor or container-
   runtime socket.
4. Use a separate VM/machine when Host-administrator trust is unacceptable.
   gVisor, Kata, a microVM or another sandbox may be evaluated later as defense
   in depth, but it is not advertised as an administrative boundary without its
   own conformance and security acceptance.
5. Require current-owner authorization, target-owner acceptance and a verified
   export/recovery checkpoint before ownership transfer. Revocation disables new
   automation without stopping, deleting, encrypting or stranding the cell.
6. Start admission with provisional inputs: 1 GiB memory per cell, 0.5 GiB Host
   reserve, at most 90% memory utilization, at most three cells per vCPU, and an
   explicit per-cell storage ceiling. G-080 must replace or confirm these values
   with measurements before a support or capacity claim.

## Same-Host eligibility

Eligibility is decided per Host, not inferred from a customer label.

| Situation | Same Host | Required treatment |
|---|---|---|
| One customer organization owns several cells | allowed | customer accepts Host-administrator trust and shared Host failure domain |
| Agency/operator hosts cells for several customers | allowed only with explicit acceptance from every customer | disclose administrator privilege, container/OS boundary, shared failure/capacity domain and recovery placement |
| Unrelated customers all explicitly accept one administrator | allowed only under the same recorded contract | run the full two-cell isolation and noisy-neighbor conformance suite |
| Any customer distrusts the Host administrator | prohibited | use a separate VM/machine controlled under the accepted customer authority |
| Mutually hostile tenants or regulated/compliance isolation claim | prohibited in v1 | separate Hosts plus a separately approved compliance/security contract |
| Trust acceptance is missing, stale or ambiguous | prohibited | fail preflight; do not infer consent from an owner reference or billing relationship |

The Host administrator can technically inspect or replace every resident cell.
Product authorization and audit rules constrain legitimate behavior; they do
not turn a Host administrator into an unprivileged actor.

## Minimum hardening rung

Every implementation and conformance fixture must prove these controls before
Relay describes same-Host cells as isolated:

- the supervisor is a separate Host process with its own root and registry;
- the cell process runs as a non-root identity and never in privileged mode;
- Linux capabilities are dropped by default and the default seccomp/LSM
  protection is not disabled without a separately accepted exception;
- each cell has a distinct private network and loopback-published port, with no
  wildcard-public listener or implicit inter-cell route;
- mounts, data roots, secret roots, temporary paths, logs and backup lineage are
  unique, canonicalized and contained; symlink/traversal escapes fail closed;
- the root filesystem is read-only where the G-080 artifact proves compatibility;
  only documented cell data and temporary locations are writable;
- CPU, memory and storage ceilings plus Host reserve are enforced before and at
  effect time; exhaustion refuses admission rather than degrading silently;
- OCI image authority is digest-pinned after G-080, and mutable tags never
  authorize execution; and
- neither the supervisor socket nor the Docker/Podman socket is mounted into a
  cell. Cells cannot read the Host registry or sibling resource metadata.

If the substrate cannot prove a required control, the Host reports the exact
unsupported control and refuses the same-Host claim. A separate VM/machine is
the rescue path, not a weaker hidden profile.

## Customer-owned authority

### Actors and references

- `actorRef` is an opaque verified authority reference, never a username, email,
  bearer credential or customer-content field.
- `ownerRef` binds one cell to the accepted customer authority. It does not
  grant access by appearing in a request; the caller's current authorization is
  resolved independently.
- The first supervisor accepts only a direct Host-administrator CLI or protected
  Unix-socket peer. G-081/G-083 may bind remote sessions and entitlements to this
  same domain contract without weakening it.
- Host-administrator emergency access is technically possible but is not called
  a customer-authorized transfer. Any future break-glass product action needs a
  distinct reason, receipt, notification and operator-approved policy.

### Transfer

Ownership transfer follows:

```text
owned
  → transfer-pending (current owner authorized; target invited)
  → transfer-ready (target accepted; export/recovery checkpoint verified)
  → owned (new ownerRef; prior automation revoked)
```

At every transition the supervisor rechecks cell identity, current owner,
target-owner acceptance, manifest/plan digest and checkpoint identity. Expired,
replayed or mismatched approvals fail with a named conflict. Transfer does not
move cell content through the Host registry and does not copy secret material;
secret rotation/rebinding is explicit in the final handoff receipt.

### Revocation and lapse

`automation-revoked` refuses create/start/upgrade/transfer/remove automation
that depends on the revoked authority. It does not stop a running cell, delete
resources, encrypt data, invalidate direct Host ownership, or block verified
export/recovery. Returning to `owned` requires fresh authorization. Entitlement
lapse follows the same no-hostage rule and is not ownership revocation.

## Provisional resource admission

The initial capacity model is deliberately conservative and visibly
provisional:

```text
memory cells = floor((Host GiB × 0.90 − 0.5 GiB) / 1 GiB)
CPU cells    = floor(vCPU × 3)
admitted     = min(memory cells, CPU cells, storage cells)
```

`storage cells` is derived from Host-available bytes after a declared Host
reserve and each manifest's explicit `storageBytes`; there is no universal
storage default. The supervisor also refuses when the sum of active allocations
and the requested cell exceeds any CPU, memory, storage or Host-reserve ceiling.

These values are calculator and preflight inputs, not performance promises.
G-080 records clean-install, idle, task, document/PDF, backup, upgrade and
shutdown measurements for one and two cells. Before any public density or
support claim, measured evidence must confirm or revise the defaults, workload
class, safety margin and noisy-neighbor behavior.

## Content-free Host registry

G-060's versioned `HostRecordV1`, `CellRecordV1` and `LifecycleReceiptV1` remain
the minimum registry contract. G-079 freezes these additional invariants:

- trust acceptance is a bounded status/reference, never free-form customer text;
- target-owner acceptance and checkpoint IDs are opaque references with expiry
  and state, not embedded credentials or recovery contents;
- transfer, revocation and capacity failures use stable reason codes;
- raw adapter errors, logs, prompts, documents, table rows, model responses,
  customer names/emails, credentials, secret values and backup contents are
  rejected from registry and support exports; and
- registry reconstruction from OCI labels is read-only until ownership,
  allocation and plan-digest conflicts are reconciled.

## Required negative and failure matrix

| Family | Required evidence |
|---|---|
| mounts and paths | sibling volume/secret/log/backup attachment, traversal, symlink swap and effect-time TOCTOU all refuse |
| network and ports | duplicate port/network, wildcard listener, inter-cell reachability and caller-selected routing all refuse |
| authority | wrong owner, unverified peer, stale target-owner acceptance, replayed transfer, checkpoint mismatch and revoked automation all refuse |
| resources | memory/CPU/storage over-admission, reserve breach and noisy-neighbor pressure remain visible and bounded |
| lifecycle | duplicate plan, crash after checkpoint, partial create/start/stop, rollback and rollback-partial retain exact rescue state |
| registry privacy | seeded credentials/content/raw errors fail schema or content scan and never appear in receipts/support output |
| stronger boundary | separate-VM comparison documents which Host-admin and shared-kernel risks are removed and which customer/provider-admin risks remain |

## Downstream contract

- **G-080** supplies the signed Relay Cell image and measured resource/isolation evidence.
- **G-081** supplies authenticated remote identity and server-owned cell routing;
  it must preserve the accepted owner/actor semantics.
- **G-082** supplies checkpoint, export, secret rotation and recovery evidence
  required for a real transfer.
- **G-083** implements the supervisor and paid lifecycle against this accepted
  contract; it does not reopen TDR-044 by default.
- **G-084** exposes trust, authority, cost, transfer and rescue language without
  implying protection from the Host administrator.
- **G-073/G-074** keep connector state, secrets and content inside one cell; the
  content-free Host registry remains out of their data path.

## Acceptance criteria

1. Relay Host, Relay cell and trusted Host administrator have one meaning across
   G-058, G-060, TDR-044, the deployment spec/plan and threat model.
2. Same-Host eligibility depends on explicit trust from every resident customer;
   Host-admin distrust and hostile-tenant cases require a separate VM/machine.
3. The minimum hardening rung and refusal/rescue behavior are executable by
   future conformance tests without claiming unimplemented protection.
4. Transfer requires current-owner authorization, target-owner acceptance and a
   verified export/recovery checkpoint; revocation is non-destructive.
5. Registry and receipt additions preserve the content-free boundary.
6. Provisional CPU/memory/storage admission is reproducible and explicitly
   measurement-gated by G-080.
7. The negative matrix covers two-cell collisions, isolation, noisy-neighbor,
   authority, partial-operation and separate-VM comparison evidence.
8. TDR-044 is accepted and downstream contracts no longer carry a stale TDR
   acceptance gate.
9. R0 closes without application code, schema migration, container mutation,
   provider access, push, publish, version bump or release.

## Regression disposition

G-079 changes architecture/product/security contracts only. Protection is a
deterministic cross-document acceptance matrix, exact vocabulary/resource-value
checks, the cost-model assertion, local reference validation, a fresh threat/
architecture review and `git diff --check`. Runtime/browser tests would create
false confidence because no Host supervisor or container behavior exists yet;
the executable future budget is frozen above and in the G-060 implementation
plan.

## Acceptance receipt

Accepted on 2026-07-16 after explicit operator approval. R0 now has a truthful
Host/cell boundary (G-058), an implementation-ready supervisor contract (G-060),
and an accepted authority/isolation decision (G-079). No external system,
credential, provider account or customer environment was used.

## Non-goals

- implementing or publishing an OCI artifact or supervisor;
- selecting Docker versus Podman or a future stronger sandbox implementation;
- adding remote/browser lifecycle authority or public ingress;
- defining identity roles, recovery-key custody, RPO/RTO or cloud-provider scopes;
- provisioning or spending in a provider account; or
- claiming compliance, hostile-tenant same-Host protection, measured density or
  production readiness.

## References

- `features/relay-host-cell-isolation-boundary.md`
- `features/relay-host-fleet-manager-contract.md`
- `features/relay-host-fleet-manager-plan.md`
- `features/licensed-self-service-cloud-deploy.md`
- `features/licensed-self-service-cloud-deploy-plan.md`
- `features/cloud-deploy-cost-inputs.json`
- `.agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md`
- `relay-threat-model.md`
