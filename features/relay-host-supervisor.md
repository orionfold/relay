---
title: Entitlement-gated Relay Host supervisor and Cell contract
status: completed
priority: P1
milestone: host-r3
goal: G-083
dependencies:
  - relay-host-fleet-manager-contract
  - relay-host-authority-isolation-contract
  - oci-fulfillment
  - relay-cell-oci-publication
tdr: TDR-044
---

# Entitlement-gated Relay Host supervisor and Cell contract

## Outcome

The existing npm package supplies an explicitly invoked, local-only Relay Host
supervisor. One supervisor controls only Cells resident on one physical machine
or VM. It validates a signed `product:relay-host` grant before paid expansion,
reserves collision-free Host resources in a dedicated content-free registry,
and drives an injected OCI runtime through idempotent, receipted lifecycle
operations.

The public Relay Cell image remains free. The paid authority is the supervisor's
right to manage Cells within signed `hosts` and `managed_cells` limits. The
normal `relay` command and one direct unmanaged Cell remain free and unchanged.

## Scope challenge

- **REDUCE:** admission-only helpers would repeat G-095 and leave privileged
  effects, collision races and crash recovery undefined.
- **PROCEED — selected:** implement the Host-local registry, CLI, fake/runtime
  boundary and create/start/stop/restart/retain/export-release/purge grammar.
- **EXPAND:** G-084 browser UX, Website pricing, live VM providers, remote Fleet
  control and online activation remain separate because each adds authority or
  customer-facing state beyond this goal.

## Authority and topology

```text
Host administrator
  → relay host ... / relay-host ...
    → Host-local supervisor process
      → dedicated <host-root>/host.db
      → signed Host license inspection
      → injected OCI runtime adapter
        → Cell A resources and data root
        → Cell B resources and data root
```

- The supervisor never starts from Next.js instrumentation or a Cell process.
- There is no TCP lifecycle listener. G-084 may later expose an authenticated
  application surface backed by this domain; it cannot bypass it.
- A Cell never receives the Host registry, container-runtime socket, another
  Cell root or another Cell secret root.
- The Host administrator can inspect resident Cells. Customers that reject
  that trust require a separate machine/VM.
- A Host is not a Fleet Controller and cannot manage Cells on another Host.

## Host root and registry

`RELAY_HOST_ROOT` selects the Host root; the default is `~/.relay-host`. The
supervisor creates it with owner-only permissions and stores:

- one versioned Host record with opaque Host/licensee/license references,
  runtime kind, desired/actual state and provisional capacity;
- strict versioned Cell records containing only opaque ownership, immutable
  artifact authority, derived allocation references, lifecycle/health state and
  backup/checkpoint fingerprints;
- operation receipts containing request/plan digests, named reason codes,
  exact derived resource references and terminal/rescue state.

The Host DB is SQLite/WAL with foreign keys and schema version 1. It does not
reuse any Cell's Relay DB, settings, licenses, auth store, logs, snapshots or
files. Unknown newer schemas and corrupt registry values fail closed. The
registry never stores customer names/emails, prompts, messages, documents,
table data, model output, credentials, tokens, license envelopes or raw runtime
logs/errors.

## Cell manifest

Every managed Cell request uses strict `orionfold.relay-host-cell/v1` input:

- safe opaque `cellId` and `ownerRef`;
- artifact version, schema range and immutable
  `ghcr.io/orionfold/relay-cell@sha256:<digest>` authority;
- loopback port plus CPU, memory and storage admission amounts; and
- origin action: create, import, adopt, clone or restore-to-new.

Container name, private network, data root and secret root are derived from the
Host root and Cell ID rather than accepted as arbitrary caller paths. Canonical
JSON produces a stable plan digest. Unknown fields, mutable tags, traversal,
symlink escape, wildcard/public port intent, invalid schema ranges and content
or credential-shaped values are rejected before mutation.

## Licensing and admission

The supervisor reads exact signed envelopes from the existing canonical license
store (or an explicit license directory) and calls the G-095
`inspectHostLicense`, `selectEffectiveHostLicense` and `evaluateHostAction`
contract. It does not duplicate signature, term, limit or lapse policy.

Before creating any Cell/operation/resource row or filesystem/runtime resource:

1. the selected license must match the Host's opaque licensee claim;
2. create/import/adopt/clone/restore-new must fit `managed_cells`;
3. running, stopped and retained Cells count; exported, purged and direct
   unmanaged Cells do not;
4. requested CPU, memory and storage must fit measured/provisional Host capacity
   after its safety reserve; and
5. port, name, root, volume and network references must be collision-free.

Lapse or license removal refuses new expansion and routine feature upgrades but
never stops existing Cells or blocks receipt-bound start, stop, restart,
checkpoint/export, recovery, rollback, retain, export-and-release or purge.
A newly signed higher-capacity license is selected without mutating Cells.

## Lifecycle and idempotency

Every mutation requires an opaque operation ID. Replaying the same ID and plan
returns its existing receipt; reusing it with a different plan fails with
`HOST_OPERATION_REPLAY_CONFLICT`.

```text
create: absent → creating → stopped
start: stopped | retained → starting → running
stop: running → stopping → stopped
restart: running → restarting → running
retain: running | stopped → removing → retained       (still counts)
export-release: running | stopped | retained → exporting → exported
purge: any registered non-purged state → removing → purged
```

Export-and-release requires a G-082 verified receipt plus the exact recovery
bundle, rehashes the bundle against the receipt, and stores only its checkpoint
fingerprint. It removes Host management/runtime resources while retaining the
external recovery proof. Purge
requires a fresh confirmation equal to the Cell ID and deletes only that Cell's
derived roots/resources. Stop never deletes data. Runtime or verification
failure leaves a named partial/error state and exact rescue references; scoped
rollback never crosses another Cell boundary.

## Runtime and provider boundaries

`HostRuntimeAdapter` owns prepare/create/start/stop/remove/inspect/inventory.
The deterministic fake adapter proves state and failure behavior without a
container daemon. The Docker adapter uses executable-plus-argv calls only,
private per-Cell bridge networks with outbound provider access, loopback-only
ingress, non-root/read-only Cell runtime policy, dropped capabilities,
no-new-privileges, derived mounts and resource limits. Cleanup revalidates Host,
Cell and manifest ownership labels before removing any runtime resource.

Production artifact acceptance requires the G-094 digest/signature/attestation
contract. A locally verified G-093 image may test mechanics, but cannot become
public manifest authority or close G-094. Provider bootstrap is a separate
interface whose authorization value is consumed in memory and discarded; its
receipts can contain provider/Host resource IDs but never provider credentials.

## Named failure families

- `HOST_REGISTRY_*` — unavailable, corrupt, schema or transaction failures.
- `HOST_LICENSE_*`, `HOST_GRANT_*`, `HOST_CAPACITY_*` — G-095 commercial refusal.
- `HOST_RESOURCE_*` — path, port, network, name, root or physical-capacity conflicts.
- `HOST_OPERATION_*`, `HOST_TRANSITION_*` — replay, busy, stale or illegal lifecycle.
- `HOST_ARTIFACT_*` — mutable, wrong repository, digest, schema or verification failure.
- `HOST_RUNTIME_*` — missing runtime, permission, effect, health or reconcile failure.
- `HOST_PURGE_CONFIRMATION_REQUIRED` — destructive confirmation absent/mismatched.

## Acceptance criteria

- [x] A separately bundled/local-only supervisor initializes and inventories a
  dedicated Host registry without importing or starting the Cell application.
- [x] Strict Host/Cell/receipt schemas and transition guards reject unknown,
  unsafe, content-bearing and illegal state.
- [x] The G-095 signed grant is checked before all paid expansion, and denial
  leaves no registry/filesystem/runtime allocation.
- [x] Signed limit upgrades apply without Cell mutation; lapse/removal preserves
  receipt-bound continuity, export and recovery.
- [x] One transaction prevents duplicate Cell, port, network, container, data,
  secret and capacity reservations, including competing operations.
- [x] Create/start/stop/restart/retain/export-release/purge are idempotent by
  operation ID, emit content-free receipts and retain exact partial rescue state.
- [x] Retain still counts, export-release and purge do not, and purge requires
  fresh Cell-ID confirmation without touching sibling roots/resources.
- [x] Fake runtime conformance covers success and injected effect/rollback
  failure; Docker argv tests prove digest, loopback, mount, network, non-root,
  read-only and limit policy.
- [x] A one-Host/two-Cell fixture proves distinct roots, identities, networks,
  ports, secret/license/log boundaries and capacity refusal.
- [x] npm packaging includes the supervisor executable/contracts without
  enlarging the public surface with tests, secrets or generated evidence.
- [x] Targeted, affected, type/build, CLI-package, runtime and fresh security
  review pass; no browser test is claimed because G-083 adds no UI.

## Completion evidence — 2026-07-18

- 38 supervisor-focused regressions cover strict contracts, registry integrity,
  G-095 admission/lapse/upgrade, two-Cell isolation, collisions, path/mount
  escape, OCI ownership, verified recovery evidence, lifecycle, interrupted
  operation reconciliation, graceful removal, provider boundaries and CLI.
- The affected Host/ingress/recovery gate passed 135 tests; the full suite
  passed 3,771 tests with one intentional skip; TypeScript, CLI build and the
  production Next.js build passed.
- Both `relay host help` and the standalone `relay-host` bundle execute. A
  temporary-folder smoke proved the integrated command does not create the
  normal app's `.env.local` first-run side effect.
- The npm closure is 2,897,318 compressed bytes / 10,524,505 unpacked bytes,
  includes `dist/relay-host.js` plus the source contracts, and excludes all
  supervisor tests. Public-boundary, Host fulfillment, knowledge, guide and
  local-link gates pass after staging the new guide.
- The accepted G-093 local artifact bundle still verifies at
  `sha256:36af53a89e3a7c82d990eaf0ce967abf05e5145921750e80b7844338deba6d47`.
  This proves local mechanics only. G-094's native GHCR publication,
  signature/attestation and digest-pinned pull/run proof remains the explicit
  external release gate and is not claimed by G-083.

## Compatibility and migration

This is additive. Existing Relay data and application schema do not migrate.
The Host registry begins at v1 and refuses unsupported versions. Removing the
Host supervisor leaves every direct Cell path unchanged; managed Cell data
roots remain customer-owned and exportable.

## NOT in scope

- G-084 Settings/browser lifecycle UX or dashboard cards;
- Website G-030 amount, checkout, Stripe keys or license issuance;
- remote multi-Host/Fleet Controller authority;
- DigitalOcean or another real provider, DNS, billing or spend;
- online activation, global DRM or an Orionfold-hosted control plane;
- publishing/promoting a GHCR image or closing G-094's external gate;
- hostile-tenant protection from the trusted Host administrator; or
- automatic purge, customer-content storage or shared row-level tenancy.

## References

- `features/relay-host-fleet-manager-contract.md`
- `features/relay-host-fleet-manager-plan.md`
- `features/relay-host-authority-isolation-contract.md`
- `features/oci-fulfillment.md`
- `features/relay-cell-oci-publication.md`
- `features/host-ingress-identity.md`
- `features/host-recovery-portability.md`
- `.agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md`
- `src/lib/licensing/host-entitlement.ts`
- `contracts/relay-host-license-v1.schema.json`
