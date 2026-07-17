---
title: Relay Host fleet manager implementation plan
status: accepted
goal: G-060 planning deliverable; implementation target G-083 after prerequisites
date: 2026-07-16
specification: features/relay-host-fleet-manager-contract.md
tdr: TDR-044 accepted by G-079 on 2026-07-16
---

# Relay Host fleet manager implementation plan

## Scope challenge result

**PROCEED as approved.** A read-only inventory alone cannot prove lifecycle
idempotency or rollback. A full browser/cloud deployment stack would mix G-081
through G-085 into one unsafe release. The right-sized first implementation is
pure Host contracts plus a local fake/synthetic OCI harness, followed by a real
adapter only after the signed G-080 artifact exists.

## What already exists

| Existing seam | Reuse | Boundary |
|---|---|---|
| `src/lib/config/env.ts` and `src/lib/instance/cell-boundary.ts` | canonical cell data root, DB path, launch cwd and vocabulary | do not turn these into a Host registry |
| `src/lib/instance/bootstrap.ts` | idempotent steps, named per-step outcomes, argv-safe git pattern | do not start the supervisor from cell instrumentation |
| `src/lib/db/index.ts` and TDR-010 | better-sqlite3/WAL behavior | create a separate Host DB connection and schema |
| Zod route/config patterns | versioned manifest validation | validate before canonical hashing or mutation |
| `src/lib/licensing/verify.ts`, `gate.ts`, `store.ts` | signed entitlement primitives | G-083 adds the lifecycle-specific gate; G-060 does not |
| `src/lib/snapshots/snapshot-manager.ts` | manifest, receipt-like metadata, atomic SQLite backup precedent | G-082 owns portable encrypted recovery |
| `src/lib/utils/crypto.ts` | current per-cell key root evidence | do not reuse one keyfile across cells or copy key material into registry |
| `scripts/lib/harness.mjs` | isolated temp roots/process cleanup | extend for synthetic two-cell Host fixtures |
| `src/lib/agents/runtime/provider-endpoint.ts` | named network failures and safe endpoint policy | Host supervisor does not manage model requests |
| TDR-044 and G-078 artifacts | accepted Host/cell appliance, customer ownership and release train | G-079 final architecture disposition is complete |

## Specification and acceptance mapping

| Spec acceptance | Implementation slice | Evidence |
|---|---|---|
| AC1–AC2 vocabulary and separate authority | Slice 1 contracts/package boundary | import-boundary test; no `src/lib/db` or cell instrumentation imports |
| AC3 content-free registry | Slice 2 registry/receipts | schema tests plus seeded secret/content scanner |
| AC4 state machines/rescue | Slice 1 domain reducer + Slice 2 transactions | legal/illegal transition matrix and crash-reconcile tests |
| AC5 approved topology/slice | Slices 1–5 | local-only CLI and fake/real OCI fixtures |
| AC6 two-cell isolation | Slice 5 conformance | resource/mount/network/secret/license/log/runtime-policy matrix |
| AC7 negative cases | Slices 2–5 | collision, traversal, replay, capacity, partial and rollback tests |
| AC8 artifact parity | Slice 6 review/docs | TDR/threat/backlog/spec parity checks |
| AC9 no premature scope | every slice | dependency and external-write gates |

## Proposed package boundary

Use a separate top-level Host domain and executable/process so privileged code
cannot be imported or started accidentally through normal Relay application
modules:

```text
src/host/
  contracts.ts
  errors.ts
  state-machine.ts
  canonical-plan.ts
  registry-schema.ts
  registry.ts
  receipts.ts
  preflight.ts
  reconcile.ts
  runtime-adapter.ts
  adapters/fake.ts
  adapters/oci-cli.ts       # after G-080
  local-authority.ts
bin/relay-host.ts
scripts/host-conformance.mjs
```

`src/host/*` must not import `@/lib/db`, cell settings, application routes,
runtime catalog, workflows, chat tools, or cell secrets. A shared pure type may
move to a dependency-neutral package only when both sides need it.

## Vertical slices

### Slice 1 — Pure contracts and lifecycle grammar

1. Add Zod schemas and inferred types for versioned Host, cell, manifest,
   allocation, operation, receipt, and owner-reference contracts.
2. Add named errors such as `HostPlanValidationError`,
   `HostTransitionConflictError`, `HostResourceCollisionError`,
   `HostCapacityError`, and `HostAuthorityError`.
3. Implement pure legal-transition functions for Host, cell, operation, and
   ownership states.
4. Canonicalize redacted plans and compute a stable digest; secret values are
   rejected before hashing.
5. Add an import-boundary test proving the Host package does not load Relay's
   application DB/runtime graph.

Checkpoint: all pure tests pass with no filesystem, OCI, browser, or database.

### Slice 2 — Dedicated registry and receipts

1. Create a dedicated temporary Host root and `host.db`; enable WAL and foreign
   keys without importing the cell DB singleton.
2. Add migrations/bootstrap for Host, cell, operation, receipt, allocation, and
   lock records with text IDs and epoch timestamps.
3. Make every state transition conditional and atomic; stale expected state
   returns a named conflict.
4. Persist a receipt before and after each effect step so restart/reconcile can
   distinguish intent, applied work, verification, and rollback.
5. Add a seeded content scanner that fails if registry/receipt values match
   prompt, document, credential, token, secret, or raw-log fixtures.

Checkpoint: crash/reopen and concurrent-operation tests produce one coherent
operation and exact non-terminal evidence.

### Slice 3 — Preflight allocator

1. Resolve canonical Host/cell roots and reject traversal, symlink escape,
   nested roots, and cross-cell ownership.
2. Reserve unique container names, volumes, opaque `secretRootRef` values,
   networks, loopback
   ports, CPU, memory, storage, and Host reserve inside one registry transaction.
3. Revalidate reservations immediately before an adapter effect.
4. Refuse mutable artifact authority and incompatible schema ranges.
5. Return exact resource/reason codes without customer content.

Checkpoint: two simultaneous allocations cannot claim the same resource; every
negative case leaves no invisible reservation.

### Slice 4 — Local authority and fake OCI lifecycle

1. Add a local-only CLI and, if needed, an administrator-owned Unix socket with
   peer credential checks. No TCP listener.
2. Implement an injected `HostRuntimeAdapter` and deterministic fake adapter.
3. Support inventory, create, start, and stop for two synthetic cells.
4. Inject failure after every create/start/stop effect; verify resume or scoped
   rollback and exact remaining-resource receipts.
5. Ensure cells never receive the Host root/socket/runtime authority.

Checkpoint: the synthetic two-cell matrix passes without Docker/Podman and
without importing the Relay runtime registry.

### Slice 5 — Digest-pinned OCI conformance after G-080

1. Add an argv-array Docker/Podman adapter; never invoke a shell command string.
2. Pull/inspect only the supported G-080 digest and verify labels/schema range.
3. Launch non-root cells on private networks with unique loopback ports,
   read-only root where supported, per-cell data/secret mounts, and resource
   limits.
4. Run real create/start/stop/restart/persistence and collision/path-escape
   tests for two cells.
5. Inspect mounts, networks, processes, ports, labels, limits, files, DBs,
   licenses, logs, backup lineage, and runtime configuration for cross-cell
   contamination.

Checkpoint: customer-isolation wording remains alpha until this real adapter
and G-025 customer-identical staging pass.

### Slice 6 — Fresh review and train handoff

1. Run architecture review against TDR-044 and the accepted G-079 contract.
2. Run the updated `relay-threat-model.md` focus paths and content/secret scans.
3. Reconcile G-080–G-084 dependencies, feature docs, `_ASSETS` claims, and
   release gates.
4. Record real task/runtime smoke only if an affected slice touches the runtime
   registry or workflow engine.

## Regression test budget

### Pure/domain tests

- `src/host/__tests__/contracts.test.ts`: valid/minimum, unknown version,
  missing/extra field, unsafe identifiers, secret/content rejection.
- `state-machine.test.ts`: every legal and illegal Host/cell/operation/ownership
  transition; duplicate, stale, terminal, nil and unknown states.
- `canonical-plan.test.ts`: field-order stability, secret rejection, digest
  mismatch and replay semantics.
- `module-boundary.test.ts`: no imports from cell DB, routes, chat, workflows,
  runtime catalog, snapshots, or cell crypto.

### Registry/preflight tests

- fresh bootstrap, idempotent reopen, migration version mismatch, corrupt DB,
  busy/locked DB and conditional transition conflict;
- two operations racing for one cell and two cells racing for each resource;
- absolute/relative/traversal/symlink/nested path cases;
- loopback/wildcard/occupied port, overlapping networks, reused volume/secret
  root, container-name collision and capacity/reserve exhaustion;
- crash after each durable receipt/effect boundary and rollback-partial state;
- content scanner with customer text, API keys, authorization codes, secret
  values, prompts, documents, model responses and raw logs.

### Adapter/conformance tests

- fake adapter: success plus injected create/start/stop/inspect/remove failures;
- real OCI: missing runtime, permission denied, digest/signature mismatch,
  read-only root, missing/wrong volume, unhealthy readiness and SIGTERM;
- two-cell: distinct roots/DB/files/mounts/networks/ports/secrets/identity/license/
  logs/limits/backup/runtime policy plus explicit Host-admin visibility;
- restart/reconcile: running, stopped, missing, extra/orphaned and mislabeled OCI
  resources.

### Verification order

1. closest pure tests;
2. registry/preflight integration suite in a temp Host root;
3. typecheck, lint/design/parity and migration/bootstrap checks;
4. fake-adapter conformance;
5. real OCI two-cell conformance after G-080;
6. real `npm run dev` smoke inside both cells, including task execution if any
   runtime-registry-adjacent module changed;
7. browser/staging only after G-081/G-084 introduce customer UI;
8. broader suite, build, package/OCI, security review, and G-025 staging.

No browser test is budgeted for the contract-only Host CLI slices because no UI
changes. Browser verification becomes mandatory when lifecycle is exposed in
G-084.

## Error & Rescue Registry

| Failure | Required evidence | Rescue |
|---|---|---|
| Host DB cannot open/migrate | named Host registry error; no adapter call | restore/repair registry or reconstruct read-only inventory |
| stale transition/replay conflict | original receipt and conflicting digest | reconcile or submit a new explicit plan |
| path/symlink escape | rejected canonical path and reason | choose an allowed Host-owned root |
| resource collision/capacity loss | exact conflicting resource/owner ref | repair allocation or resize/add Host |
| adapter missing/permission denied | Host unavailable; cells untouched | install/configure supported OCI runtime |
| partial create/start/stop | durable resource refs and `partial` state | resume missing effect or scoped rollback |
| rollback partial | retained resources enumerated | Host-admin manual cleanup then reconcile |
| supervisor crash | non-terminal receipt survives | restart; inspect before next mutation |
| registry content/secret match | hard test/runtime refusal | remove payload, retain opaque reference only |
| hostile tenant rejects Host admin | same-Host placement invalid | use a separate VM/machine |
| module-load cycle via cell imports | Host process or Relay boot fails | remove cross-boundary import; keep contracts dependency-neutral |
| G-080 artifact unavailable | real OCI gate remains blocked | continue fake-adapter proof; make no deployment claim |

## Rollback and rescue

- Contract/fake-adapter work is additive and disabled by absence of a Host CLI
  entry point in normal Relay startup.
- The real adapter remains opt-in and local-only until G-080 acceptance.
- Registry migrations require a pre-migration registry copy and supported
  downgrade/export reader.
- Cell stop/remove never purges data by default. Purge follows G-030's separate
  confirmation semantics.
- A failed Host upgrade leaves cell artifacts/data untouched and retains the
  prior supervisor binary/registry schema reader.

## NOT in scope

- implementing G-060 itself beyond documents;
- starting the supervisor from Relay instrumentation;
- remote HTTP/browser control or multi-Host authority;
- ingress, identity, CSRF, sessions, SSO, or public routing;
- cloud provider adapters, OAuth, DNS, billing, or VM resources;
- OCI publication before G-080 approval;
- backup/KMS implementation before G-082;
- paid lifecycle UI/entitlement before G-083/G-084; and
- shared customer data, shared SQLite, or row-level multi-tenancy.

## References

- `features/relay-host-fleet-manager-contract.md`
- `features/relay-host-cell-isolation-boundary.md`
- `features/licensed-self-service-cloud-deploy-plan.md`
- `.agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md`
- `relay-threat-model.md`
