---
generated: 2026-07-16
mode: tdr-and-contract-acceptance
goal: G-079
---

# Architect Report — Relay Host authority and isolation acceptance

## Decision

Accept TDR-044 and close the R0 isolation-contract increment. Relay's first
customer-owned deployment architecture is one local or cloud **Relay Host** with
a separate local supervisor and one or more complete **Relay cells**. This is an
appliance and Host-sharding architecture, not a shared row-level multi-tenant
Relay process or a distributed PaaS control/data plane.

Same-Host cells are valid only when every resident customer explicitly trusts
the Host administrator and accepts the container/OS boundary. The Host
administrator remains technically capable of inspecting or replacing cells.
Customers requiring protection from that administrator or mutually hostile
tenants use separate VMs/machines.

## Evidence reviewed

| Evidence | Architectural fact consumed |
|---|---|
| `features/relay-host-cell-isolation-boundary.md` | G-058 separates attribution/project context from the process/data/secret cell boundary and exposes truthful public language |
| `features/relay-host-fleet-manager-contract.md` | G-060 defines a separate supervisor, dedicated content-free registry, OCI adapter boundary, state machines and rescue grammar |
| `features/relay-host-fleet-manager-plan.md` | first implementation is fake-adapter inventory/create/start/stop; real OCI waits for G-080 |
| `features/licensed-self-service-cloud-deploy-research.md` | OpenClaw, Hermes and NemoClaw support the device/VPS durable-agent-appliance posture |
| `features/cloud-deploy-cost-inputs.json` and `scripts/cloud-deploy-cost-model.mjs` | provisional admission inputs and deterministic 1/10/100-cell sharding examples |
| `relay-threat-model.md` | current auth-light ingress, Host privilege, local authority, cross-cell, registry-content and lifecycle threats remain explicit |
| `src/lib/config/env.ts` and `src/lib/utils/ainative-paths.ts` | one process resolves one data/DB/file root; each cell therefore needs a distinct process environment |
| `src/lib/db/index.ts` | one module-global SQLite/WAL connection cannot be the Host registry or serve several cell boundaries |
| `src/instrumentation-node.ts` | cell startup owns migrations/services/scheduler/backup; Host authority must never start or import here |
| `src/lib/utils/crypto.ts`, `src/lib/licensing/`, `src/lib/snapshots/` | secrets, license and recovery are cell-owned state and cannot enter the Host registry |

## R0 acceptance matrix

| G-079 decision | Accepted contract | Evidence/consumer |
|---|---|---|
| vocabulary | one Host; one complete Relay instance per cell; one customer organization per cell | G-058 boundary spec; TDR-044 decisions 1–2 |
| Host trust | all resident customers explicitly trust the Host administrator; segment/owner/billing does not imply consent | G-079 contract same-Host matrix; TDR-044 decision 3 |
| stronger boundary | separate VM/machine for Host-admin distrust or hostile tenants | G-079 contract; threat model TM-010 |
| minimum hardening | non-root/non-privileged cell, dropped capabilities, default sandbox controls, private network, distinct contained mounts/secrets, resource limits, read-only root where compatible, no authority sockets | G-079 contract; TDR-044 decision 21; measured by G-080/G-083 |
| registry | dedicated Host DB with opaque lifecycle/resource/authority references only | G-060 registry schemas; TDR-044 decisions 9/16 |
| local authority | direct Host-admin CLI or protected Unix socket with verified peer; no first-slice TCP/browser control | G-060 system boundary; TDR-044 decision 17 |
| transfer | current-owner authorization plus target-owner acceptance plus verified export/recovery checkpoint | G-079 authority state; TDR-044 decision 22; implemented across G-081/G-082/G-083 |
| revocation/lapse | disable new automation; never stop/delete/encrypt/strand or block export/recovery | G-079 authority state; entitlement no-hostage invariant |
| resource admission | provisional 1 GiB/cell, 0.5 GiB Host reserve, 90% memory, 3 cells/vCPU, explicit storage ceiling | cost inputs; G-079 contract; TDR-044 decision 23 |
| first topology | one local supervisor plus synthetic fake-OCI two-cell lifecycle before a real adapter | G-060 plan; TDR-044 decision 20 |

All decisions are explicit enough for later executable conformance. None is
represented as an implemented control.

## Architecture posture

### Process and data boundary

The supervisor remains a separate executable/process with its own Host root and
registry. It does not import cell DB/settings/routes/runtime/workflow/chat/key/
snapshot modules. Each cell keeps its own Next.js process, SQLite/WAL, files,
secrets, license, logs and scheduler. This preserves existing single-process
semantics and prevents a nominal `customerId` or row filter from becoming the
security boundary.

### Host and cell authority

The first authority is local OS authority, not a remote fleet service. Actor and
owner references are opaque identifiers; presenting an owner reference never
authorizes an action. Transfer is a multi-party, checkpoint-gated state machine.
A Host-admin override, if ever productized, must be a separately approved and
audited break-glass action rather than being mislabeled customer consent.

### Isolation posture

The accepted OCI baseline reduces accidental and compromised-cell cross-talk,
but it cannot defend against a malicious or compromised Host administrator.
Optional rootless containers, gVisor, Kata or microVMs may reduce likelihood
after conformance; they do not replace the separate-VM rule without a new
accepted claim. This keeps public language aligned with the actual boundary.

### Capacity posture

Admission is fail-closed and resource values are provisional inputs, not density
or performance claims. G-080 must measure clean install, idle, task, document/
PDF, backup, upgrade and shutdown behavior for one and two cells. A public
support claim requires the measured workload class, safety margin and noisy-
neighbor evidence to replace or confirm the provisional values.

## Blast radius

| Layer | Impact | Constraint frozen by G-079 |
|---|---|---|
| distribution | high | one signed npm-derived OCI artifact; implementation remains G-080 |
| runtime/Host | high | separate supervisor, fake adapter first, no cell/Host module graph coupling |
| data | medium | keep SQLite/WAL per cell and a separate content-free Host DB |
| identity/authorization | high | owner/actor semantics and non-destructive revocation; implementation remains G-081/G-083 |
| recovery/secrets | high | customer-owned per-cell roots and verified checkpoint prerequisite; implementation remains G-082 |
| frontend/product language | medium | disclose Host-admin trust and separate-VM rescue; lifecycle UX remains G-084 |
| connectors | medium | all connector content/secrets/state remain inside one cell, never Host registry |

**Classification: high.** The decision affects distribution, process, data,
identity, recovery, product language and connector conformance. The staged goals
keep that blast radius from becoming one implementation change.

## Security review

- Same-Host consent fails closed when missing or ambiguous.
- The accepted baseline covers mount/path, network/port, resource, runtime-
  authority and registry-content boundaries, while the threat model retains the
  absence of implementation as a gap.
- Transfer replay, stale target-owner acceptance, checkpoint mismatch, revoked
  automation, plan-digest reuse and Host-admin break-glass ambiguity have named
  refusal paths.
- Separate VM/machine is the rescue when the Host trust premise fails.
- No external credentials, customer content, provider authority or public
  endpoint was introduced by this acceptance.

No unresolved architecture/security acceptance issue remains in R0. G-080 and
later goals still require fresh implementation review before making isolation,
capacity, recovery, remote-access or paid-deployment claims.

## Downstream gates preserved

- G-080: select/prove Docker or Podman details, artifact compatibility,
  measurements, signatures and two-cell conformance; publication remains gated.
- G-081: approve and implement remote identity, recovery and public trust copy.
- G-082: approve retention, key recovery, RPO/RTO and prove checkpoint/export.
- G-083: approve entitlement renewal/lapse and implement supervisor authority.
- G-085: separately approve DigitalOcean account, scopes, spend, region,
  hostname, security review and beta/release claims.
- G-086: separately approve the second target and portability/GA claim.

## Verdict

**Accept TDR-044 and release R0.** Advance the Customer-owned Relay Host train to
R1 Local Host alpha, with G-080 ready after its explicit G-034 native/package
preflight decision and G-038 available as the independent first-run quick win.

---

*Generated by `/architect` — TDR management and contract-acceptance mode*
