---
title: Truthful Relay Host and cell isolation boundary
status: accepted
goal: G-058, G-096
workstream: Customer-owned Relay Host
increment: R0 — Isolation contract
date: 2026-07-16; amended 2026-07-17
tdr: TDR-044 accepted by G-079 on 2026-07-16
---

# Truthful Relay Host and cell isolation boundary

## Outcome

Relay makes its active security boundary legible wherever operators organize a
customer, choose a project working directory, inspect an instance, or preview a
task's execution target. A reviewer can correctly distinguish:

1. a **customer** record, which groups attribution and cost;
2. a **project**, which groups work and may choose an execution directory;
3. a **Relay cell**, which is one complete process/container and data boundary;
4. a **Relay Host**, whose administrator is trusted by every resident cell; and
5. a separate VM/machine, used when that Host trust is unacceptable.

This is a truth-and-wayfinding slice. It does not add row-level multi-tenancy or
claim that current Relay can provision, enforce, or remotely manage Host cells.

## G-096 managed-Cell identity amendment

The accepted OCI runtime supplies its Cell identity through `RELAY_CELL_ID`.
That validated environment value is authoritative for the active managed Cell
and must appear consistently in readiness, the read-only boundary contract,
Settings, and task/workflow execution-target context. A no-git OCI runtime must
not be described as `Not initialized` merely because it does not participate in
git-backed instance bootstrap.

Compatibility is deliberate: the existing read-only `instanceId` response
field carries the resolved Cell identity for now. Renaming that public field is
not required to make the value truthful and would create needless API churn.
When `RELAY_CELL_ID` is absent, dev mode and ordinary no-git npx installs retain
their unavailable boundary identity, readiness retains its bounded `local`
fallback, and an initialized git-backed instance retains its persisted UUID.
An invalid configured `RELAY_CELL_ID` is a named `CELL_ID_INVALID` failure; it
must never fall back to git state or a generated value.

## Scope challenge

### REDUCE

Add a warning only to customer detail. This leaves project cwd, execution
runtime, and Settings identity ambiguous and cannot satisfy the comprehension
or two-cell acceptance evidence.

### PROCEED — recommended

Add one read-only cell-boundary fact contract and reuse it on customer, project,
instance, and execution surfaces; update private/public guidance only after the
copy gate. This closes the current truth gap without changing storage or
execution architecture.

### EXPAND

Add Host registry, container/process provisioning, network/port/mount collision
enforcement, authentication, or lifecycle UI. These belong to G-060/G-079 and
the G-080–G-084 implementation increments.

## Vocabulary and invariant

- **Customer:** an attribution record inside one cell. It does not own separate
  tables, files, credentials, agent context, or runtime configuration.
- **Project:** a work grouping inside one cell. `workingDirectory` changes the
  filesystem context used by supported task runtimes; it is not a sandbox.
- **Relay cell:** one complete customer trust boundary: process/container,
  loopback port/network, hostname/route, data directory, volume/SQLite, files,
  identity, secret root, license, logs, resource budget, backup lineage, and
  runtime policy. Two processes sharing any authoritative data root are not two
  isolated cells.
- **Relay Host:** the trusted device or VM that runs one or more cells. Its
  administrator can inspect or replace resident cells. A Host is one machine,
  not a Fleet Controller.
- **Host supervisor:** the local control process that manages only cells
  resident on its Host.
- **Fleet Controller:** a separate future coordinator for multiple Hosts. It is
  not a Host and must delegate through each Host supervisor rather than control
  a remote cell directly.
- **Separate VM/machine:** the required placement when customers are mutually
  hostile or must be protected from the current Host administrator.

## Public language proposed for approval

### Shared Settings → Instance explanation

Heading: **Relay cell boundary**

> This Relay process and data directory form one Relay cell. Customer and
> project records organize work inside this cell; they do not isolate data,
> files, credentials, agents, or runtimes. The Relay Host administrator can
> access every cell on this Host. Use a separate cell for client isolation, or
> a separate VM or machine when the Host administrator must not have access.

Placement: the first content inside Settings → Instance, followed by factual
fields for cell id (or “not initialized”), data directory, database, and launch
workspace. Existing bootstrap/upgrade controls follow as a separate subsection.

### Customer detail explanation

Label: **Attribution, not isolation**

> This customer groups projects and cost inside the current Relay cell. It does
> not create a separate database, file store, credential store, agent boundary,
> or runtime policy.

Wayfinding: **Review Relay cell boundary →** links to
`/settings#settings-instance`.

Placement: a compact solid information panel after the customer summary cards
and before notes/projects. Do not repeat it on every customer list row.

### Project detail explanation

Label: **Execution context, not isolation**

With an explicit project directory:

> Tasks in this project use this working directory when the selected runtime
> supports it. The directory does not isolate this project's Relay data,
> credentials, agents, or runtimes from other records in the cell.

Without an explicit project directory:

> This project uses the Relay launch workspace as its task working-directory
> fallback. That execution context does not isolate Relay data, credentials,
> agents, or runtimes from other records in the cell.

Placement: one compact context panel below the project heading, showing the
effective directory and whether it is project-specific or the launch fallback.

### Task execution-target explanation

Fields added after runtime/model:

- **Relay cell:** short instance id, or “current data-root cell” when bootstrap
  identity is unavailable;
- **Working directory:** project directory or “Relay launch workspace” fallback.

Helper:

> Runtime and working directory choose where this task executes; they do not
> create a separate customer data or credential boundary.

Placement: inside the existing Execution target panel. The workflow variant
uses the same grammar for every resolved target.

## Read-only fact contract

```ts
interface RelayCellBoundary {
  vocabularyVersion: "relay-host-cell-v1";
  instanceId: string | null;
  dataDirectory: string;
  databasePath: string;
  launchWorkingDirectory: string;
  dataDirectorySource: "default" | "override";
}
```

The server computes this contract from `dataDir()`, `dbPath()`, `launchCwd()`,
`dataDirOverride()`, an authoritative validated `RELAY_CELL_ID` when present,
and otherwise the existing git-backed instance config when eligible. It is not
stored. It must not infer or return Host names, container ids, ports, networks,
credentials, customer content, raw logs, backup contents, or security-strength
claims.

Execution preview may add a derived context with a narrow cell reference
(`vocabularyVersion` and `instanceId` only), `projectId`, `projectName`,
`workingDirectory`, and `workingDirectorySource`, but the route resolves those
server-side. Data-directory and database paths remain on the administrative
Settings response. Caller-supplied customer/project/cell identifiers never
select a different data boundary.

## Interaction and failure behavior

- If cell facts fail to load, Settings shows a named boundary-loading error and
  retry; it does not silently collapse to the old ambiguous instance panel.
- Customer/project server-rendered facts fail with the existing page error
  boundary rather than guessed values.
- An unavailable unmanaged instance id is shown as “not initialized,” not a
  generated UI id. A managed no-git Cell shows its validated `RELAY_CELL_ID`.
- An invalid `RELAY_CELL_ID` fails readiness with `CELL_ID_INVALID`; Settings
  and execution-target APIs surface a named identity-resolution failure rather
  than falling back to another identity source.
- Long absolute paths wrap or truncate visually with the full value available
  to assistive technology/title text.
- The execution-target API keeps its existing target-resolution failure codes;
  a missing project uses the launch fallback, while a referenced project that
  cannot be resolved is a named context error rather than a guessed cwd.
- Navigation and task execution semantics do not change.

## Acceptance criteria

1. Customer, project, Settings, and task/workflow execution surfaces use the
   approved copy and one Host/cell vocabulary.
2. Settings shows the real resolved data directory, database path, launch cwd,
   and active managed Cell ID, existing git-backed instance id, or an honest
   unavailable state in dev and ordinary npx modes.
3. Customer UI says attribution is not isolation and links to the canonical
   boundary explanation.
4. Project UI shows its explicit cwd or launch fallback and says that cwd is not
   a sandbox or customer data/credential boundary.
5. Execution preview shows effective runtime, model, cell, and cwd together
   without changing runtime selection or launch behavior.
6. One data root with two customer-linked projects is correctly described as
   one cell. Two processes with distinct data roots produce distinct DB, file,
   secret, license/log, and execution contexts in the synthetic fixture.
7. Same-Host guidance states that the Host administrator is trusted; the
   stronger rung says separate VM/machine when that trust is unacceptable.
8. No schema migration, `tenantId`, Host provisioning, public-ingress, cloud
   adapter, entitlement, or lifecycle claim enters this goal.
9. Desktop and 390 px light/dark browser checks pass with keyboard focus,
   readable paths, no overflow, semantic tokens, and system cursor only.
10. `_ASSETS` user/API docs and private-instance guidance use identical approved
    language before the increment is accepted.
11. A no-git process with `RELAY_CELL_ID=g025-r1` returns `g025-r1` from
    readiness, instance config, Settings, and task/workflow execution context.
12. Invalid managed Cell IDs fail closed and never expose a different fallback
    identity; absent environment state preserves current dev, npx, and
    git-backed compatibility behavior.

## Regression disposition

- Add pure boundary-contract tests for default/override roots, launch cwd, and
  optional instance identity.
- Extend `/api/instance/config` tests across dev, npx, and initialized modes and
  scan the response for forbidden secret/content fields.
- Add customer/project boundary component tests for explicit/missing cwd and
  long values.
- Extend execution-target route/component tests for cell/cwd context, fallback,
  and target failure.
- Add a two-cell temporary-data-root integration fixture and the one-cell/two-
  customer negative comparison.
- Run targeted tests, typecheck, token validation, critical API inventory, a
  real `npm run dev` task-target smoke, and browser verification.

## Rescue and rollback

- If exposing absolute paths creates an authorization conflict before G-081,
  keep full facts restricted to the local administrative Settings surface and
  show source labels—not values—elsewhere; record the changed acceptance
  contract instead of leaking paths.
- If adding cell/cwd fields to execution-target responses risks runtime graph
  cycles, derive them in the API route from config/DB modules and keep runtime
  resolution imports unchanged.
- The slice is additive and read-only. Rollback removes boundary UI/response
  fields without data migration or state repair.

## NOT in scope

- row-level multi-tenancy or customer-scoped query rewriting;
- a Host registry/supervisor, Fleet Controller, or remote multi-Host inventory;
- container, OS-user, network, port, mount, hostname, or resource allocation;
- authentication, sessions, SSO, public ingress, or cloud authorization;
- backup transport, KMS, provider adapters, signed OCI artifacts, or paid
  lifecycle automation;
- claims that two current customer rows are isolated tenants.

## Acceptance receipt

The operator approved the four public-language blocks and placements on
2026-07-16. The implementation was then accepted with:

- 22 focused regressions covering the fact contract, Settings API, shared
  notices, instance UI, execution preview, and task/workflow target routes;
- a clean full test run of 3,582 passing tests with one intentional skip;
- TypeScript, design-token, diff, production-build, knowledge-bundle, user-guide,
  API-reference, catalog, and product-stat gates passing;
- real development-server evidence for the Settings response, customer/project
  rendered copy, and a runtime-failure response that retained its narrow,
  server-resolved execution context;
- in-app Browser checks at the normal desktop viewport and 390 by 844 pixels,
  with the boundary card showing no internal overflow or console errors; and
- synchronized `_ASSETS` user/API guidance using the approved Host/cell
  vocabulary.

G-060 and the accepted G-079 authority contract retain topology, authority,
Host metadata, and TDR decisions. G-058 does not claim Host provisioning,
public ingress, or enforced multi-cell isolation.

### G-096 managed-Cell identity acceptance — 2026-07-17

The compatible resolver path was accepted without a public schema rename:

- one application resolver validates `RELAY_CELL_ID` and gives it precedence
  for managed no-git Cells; invalid values fail closed as `CELL_ID_INVALID` and
  never fall through to git-bootstrap or generated identity;
- dev, direct no-git npx, and initialized git-backed identity behavior remains
  unchanged when the managed-Cell environment value is absent;
- 23 focused regressions and 104 affected tests cover readiness, instance
  config, Settings, task/workflow execution context, precedence, invalid input,
  and compatibility fallbacks;
- the full suite passed 3,613 tests with one intentional skip, and the
  runtime-graph smoke completed real task, workflow, schedule, and Chat paths;
- the rebuilt `0.43.0` linux/arm64 artifact passed its complete content,
  vulnerability, reproducibility, manifest, rollback/export, and two-Cell
  lifecycle gates at immutable digest
  `sha256:f9e08451c1d7c39e9092e6bf84b61df47eedc2f70ac71c3ab4e02f98cf5de783`;
- a hardened disposable Cell with `RELAY_CELL_ID=g096-cell` returned the same
  identity from readiness and `/api/instance/config`, then rendered it in
  Settings and a real workflow execution-target preview; and
- the local evidence bundle is
  `output/staging/2026-07-17-g096-cell-identity/`. No registry publication,
  release, push, tag, or public schema change occurred.
