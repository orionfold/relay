---
generated: 2026-07-16
mode: integration-and-impact
goal: G-060
---

# Architect Report — isolated Relay Host fleet manager

## Proposed capability

Define a local, privileged Relay Host supervisor that manages OCI-container
Relay cells while keeping Relay Core single-customer, SQLite/WAL, and local-
first. G-060 is a contract goal: it specifies the integration boundary,
authority, state, registry, failure, and verification model without adding the
supervisor runtime.

The operator approved one local Host supervisor, content-free lifecycle
metadata, customer-owned per-cell secret roots, and an inventory plus synthetic
create/start/stop first slice.

## Repository-grounded findings

| Existing surface | Current ownership | Architectural consequence |
|---|---|---|
| `src/lib/config/env.ts` | resolves one process-wide `RELAY_DATA_DIR`, DB path and launch cwd | one process cannot represent several cells; each cell needs its own environment/process |
| `src/lib/db/index.ts` | opens one module-global better-sqlite3 database and bootstraps it | Host registry cannot import or reuse this singleton |
| `src/instrumentation-node.ts` | runs migrations, bootstrap, plugins, pollers, scheduler and backup inside every cell | starting a Host supervisor here would grant every cell Host-wide authority |
| `src/lib/instance/*` | git-backed clone identity, guardrails and upgrade polling | instance ID is useful cell evidence, but is not Host lifecycle state |
| `src/lib/instance/cell-boundary.ts` | read-only active-cell facts | keep as cell-side truth; later expose a narrow Host-assigned cell ID through a versioned seam |
| `src/lib/utils/crypto.ts` | one keyfile below the active cell data root | correct per-cell precedent; never share the keyfile across cells |
| `src/lib/licensing/*` | signed offline file credentials and named entitlement failures | reuse verification primitives later; keep lifecycle lapse separate from data/export ownership |
| `src/lib/snapshots/*` | local cell snapshot/restore and manifest | reuse manifest/receipt concepts; G-082 owns off-Host transport and key recovery |
| `bin/cli.ts` | launches one Next process with host/port/data-root environment | Host supervisor needs a separate CLI/executable and no normal Relay startup side effect |
| `scripts/lib/harness.mjs` | isolated temp roots/process cleanup | suitable base for synthetic two-cell conformance |

No `src/lib/host`/`src/host` supervisor, Host registry, container allocator,
authenticated lifecycle socket, signed OCI artifact, or provider adapter exists.
The design must not describe planned controls as shipped.

## Critical architecture decision

The Host supervisor MUST be a separate executable/process with a dedicated Host
root and registry. It MUST NOT run inside a Relay cell or import the cell DB,
routes, runtime registry, workflows, chat tools, settings, crypto keyfile, or
snapshots.

This separation is load-bearing:

```text
bin/relay-host.ts
  → src/host contracts/registry/preflight/adapters
  → OCI runtime
      → cell process A → cell A RELAY_DATA_DIR → cell A SQLite/files/secrets
      → cell process B → cell B RELAY_DATA_DIR → cell B SQLite/files/secrets
```

If `src/instrumentation-node.ts` starts the supervisor, every cell becomes a
privileged lifecycle controller and can reach sibling resources. If the Host
registry uses `@/lib/db`, it silently writes lifecycle authority into one cell's
customer database. Both patterns are prohibited by contract and test.

## Pattern alignment

| Relay pattern | Applies | Use |
|---|---|---|
| TDR-009 idempotent bootstrap | yes | registry bootstrap and reconcile are repeatable and visible |
| TDR-010 SQLite/WAL | yes, separate DB | atomic local Host states without a service dependency |
| TDR-011/012/013 data conventions | yes | JSON-in-TEXT only where flexible; epoch timestamps; text IDs |
| TDR-029 layered dev gates | principle only | normal `npm run dev` must never install/start a privileged supervisor |
| named errors / zero silent failure | yes | exact validation, authority, collision, partial and rollback errors |
| Zod at boundaries | yes | validate versioned manifests before canonical digest/effects |
| argv-array process invocation | yes | Docker/Podman adapter uses `execFile`/spawn args, never shell strings |
| snapshot manifest | yes, concept | receipts and resource inventories; no snapshot implementation reuse across boundary |
| runtime adapter registry | no | Host OCI adapters are infrastructure adapters, not AI runtimes |
| Server Components/API mutations | not in first slice | browser lifecycle waits for G-084 and authenticated G-081 boundary |

## Blast radius

| Layer | Future affected surfaces | Impact |
|---|---|---|
| Infrastructure | new `src/host/*`, `bin/relay-host.ts`, OCI adapter, Host root/socket/service | high: privileged lifecycle authority |
| Data | dedicated Host registry schema/migrations, no Relay schema change | high integrity; intentionally separate |
| Distribution | G-080 image/digest/provenance contract | hard prerequisite for real adapter |
| Security | local OS peer authority, path/mount/network/port containment, content-free receipts | high cross-cell blast radius |
| Recovery | G-082 cell export/backup references and rescue | coordination dependency |
| Licensing | G-083 dedicated lifecycle entitlement gate | coordination dependency |
| API/frontend | G-084 lifecycle APIs/journey after G-081 auth | deferred |
| Runtime/workflow | unchanged unless later Host runtime management is added | no current import or smoke trigger |

**Classification: High.** The implementation ultimately spans infrastructure,
data, distribution, security, recovery, licensing, and UI, but G-060 contains
that blast radius behind durable contracts and dependent release increments.

## Data and registry design

Use a dedicated `host.db` under a supervisor-controlled Host root. Do not add
Host tables to `src/lib/db/schema.ts` or migrations. Logical records:

- Host identity/version/runtime/capacity/desired-actual state;
- cell opaque owner reference, immutable artifact, desired-actual state and
  resource allocation;
- operation/plan digest, durable effect checkpoints and locks;
- content-free lifecycle receipts and exact remaining-resource references.

The registry contains no customer names/emails, prompts, documents, messages,
tables, model responses, credentials, secret values, raw logs, or backup data.
`secretRootRef` is opaque; Host admin trust is explicit even though application
code never reads the secret.

SQLite is appropriate here because one local supervisor owns writes. A remote
multi-Host control plane would require a separate authority/consensus decision;
it must not stretch this registry over network storage.

## Control and authorization design

V1 control is local only:

- direct administrator CLI or an administrator-owned Unix socket;
- socket mode/ownership plus peer credentials, not caller-supplied actor IDs;
- no TCP lifecycle listener, browser credential, forwarded identity, or public
  ingress;
- no supervisor socket/runtime socket mounted into cells;
- actor reference and owner reference are recorded without personal content.

Future browser/cloud orchestration sends signed/versioned plans through the
G-081/G-083 authorization boundary. It does not weaken local peer verification.
Revoking automation never deletes or encrypts data and never blocks direct Host
ownership, export, or recovery.

## State and effect design

Keep desired state, observed actual state, and operation state separate. A
mutation is:

1. validate version/schema and reject content/secrets;
2. canonicalize a redacted plan and bind a digest;
3. authorize the local peer/owner operation;
4. reserve resources atomically and run collision/capacity/path preflight;
5. persist the applying checkpoint;
6. execute exactly one adapter effect;
7. inspect observed OCI state;
8. persist verification/success or exact partial state;
9. resume or roll back from durable receipts after failure.

Preflight is rechecked at effect time to close TOCTOU. An identical retry
returns/reconciles the original operation; a different request reusing an
operation/cell identity is a named conflict.

## Migration and compatibility

- Relay application schema migration: **none** for G-060 and the future Host
  domain.
- Host registry migration: new independent version line with backup/export and
  last-known-good reader before upgrades.
- API versioning: Host manifest/registry/receipt schemas start at v1; no public
  API in the first slice.
- Runtime graph: no imports into `src/lib/agents/runtime/*` or workflows.
- Cell compatibility: G-080 manifest supplies Relay version, schema range,
  artifact digest, health contract and data-root mount contract.
- Existing npm/local launch remains the last-known-good path throughout the
  release train.

## Threat and failure implications

Highest risks are Host socket/OS authority bypass, path/symlink escape,
cross-cell volume/network/port/secret collision, replay/non-atomic lifecycle,
partial rollback, registry content leakage, OCI supply-chain substitution, and
container escape/noisy-neighbor effects. These map to TM-004, TM-008, TM-010,
TM-011, TM-012, TM-013, and TM-014 in `relay-threat-model.md`.

The Host administrator remains trusted. Container hardening reduces accidental
or cell-level crossover but does not protect customers from Host root. Separate
VMs/machines are required for that threat model.

## Recommended sequence

1. G-060: accept this contract, TDR amendment, threat model, and plan.
2. G-079: final TDR-044/authority vocabulary disposition.
3. G-080: signed digest-pinned Relay cell artifact and real health/data contract.
4. G-081/G-082: remote identity and recoverable per-cell secrets/data.
5. G-083: implement the pure Host domain, dedicated registry, fake adapter, then
   real local OCI adapter under its dependency gates.
6. G-084: expose the paid customer journey after server authorization exists.

## Verification budget

- document parity across G-060 spec, plan, TDR-044, threat model and backlog;
- future import-boundary test preventing Host → cell DB/runtime graph coupling;
- full legal/illegal state matrix, canonical plan and replay tests;
- registry crash/reopen/concurrency/content scans;
- two-cell path/mount/network/port/secret/license/log/resource negative matrix;
- fake effect failure after every durable boundary;
- real OCI conformance after G-080;
- real `npm run dev` in both cells and customer-identical G-025 staging;
- runtime-registry smoke only if later work actually touches the named modules.

## TDR implications

TDR-044 is the correct decision record and should be amended, not duplicated.
G-060 records the separate-supervisor process boundary, dedicated content-free
registry, local OS authority, opaque owner/secret references, idempotent state
machines, and bounded first slice. Status remains `proposed`; G-079 owns final
accept/revise/reject disposition.

## NOT in scope

- supervisor application code or Host DB migrations;
- Docker/Podman installation or container mutation;
- remote/browser lifecycle API;
- ingress/auth/session/CSRF/SSO;
- cloud-provider resources or credentials;
- OCI publication;
- backup/KMS implementation;
- entitlement/UI implementation; and
- row-level multi-tenancy or Host-admin-resistant same-Host claims.

---

*Generated by `/architect` — G-060 integration and impact mode*
