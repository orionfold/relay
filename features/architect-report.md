---
generated: 2026-07-16
mode: impact-analysis
goal: G-058
status: operator-gated
---

# Architect Report — truthful Relay Host/cell isolation

## Decision frame

G-058 should make Relay's existing process and data-root boundary visible; it
must not manufacture a tenant boundary inside the current application. Relay
already has the correct foundation for a cell: one Next.js process, one
`RELAY_DATA_DIR`, one SQLite/WAL database, local files and secret root, one
scheduler, one license context, and runtime configuration. Customer and project
rows are attribution and execution conveniences inside that boundary.

The smallest truthful change is a read-only boundary description shared by
customer, project, instance, and execution surfaces. It reports facts the
server already owns and explains when another process/container or VM is
required. It adds no `tenantId`, migration, Host supervisor, network allocator,
or cloud lifecycle behavior.

## Current boundary inventory

| Concern | Current authority | Current product surface | Architectural finding |
|---|---|---|---|
| Cell data root | `src/lib/config/env.ts#dataDir` | not shown consistently | strongest existing cell locator; resolves DB, files, keys, logs, uploads, outputs, backups and local settings |
| Database | `src/lib/config/env.ts#dbPath`; `src/lib/db/index.ts` | implicit | one SQLite/WAL database per data root, not per customer/project |
| Instance identity | `src/lib/instance/settings.ts#getInstanceConfig` | Settings → Instance for initialized git instances | stable when bootstrap applies; must allow an honest “not initialized” value for dev/npx instead of inventing identity |
| Launch workspace | `src/lib/config/env.ts#launchCwd` | workspace diagnostics only | process-level fallback execution context, not isolation |
| Project working directory | `projects.workingDirectory` | project cards/forms | changes task cwd; does not partition DB, files, secrets, tools, or runtime configuration |
| Customer | `customers` plus project foreign key | Customers and cost rollups | attribution/organization only; no separate process, DB, files, keys, identity, or runtime |
| Runtime target | execution-target resolver and preview API | queued task/workflow preview | runtime/model are shown, but cell and cwd context are absent |
| Secret root | `src/lib/utils/crypto.ts`; provider/license stores below the data root | redacted settings | shared by records in one cell; not customer/project scoped |
| Host placement | process environment/OS | not represented as a domain object | v1 can say “this Relay Host” without claiming a supervisor or verified container/VM identity |
| Strong isolation | separate process plus distinct `RELAY_DATA_DIR`; future container/Host contract | private-instance docs only | same-Host cells trust the Host administrator; separate VM/machine is required when that trust is unacceptable |

## Blast radius

### Directly affected

- `src/lib/instance/*` and `/api/instance/config`: add a content-safe read-only
  boundary summary that is returned in dev, npx, and initialized-instance modes.
- Settings → Instance: lead with the active Relay cell facts and Host trust
  statement, while retaining existing upgrade/bootstrap behavior.
- customer detail: state that the customer record controls attribution and cost
  rollup, not isolation.
- project detail: show the effective working directory and say that it is an
  execution context, not a data/credential boundary.
- task/workflow execution-target preview: show the effective cell/data-root and
  working-directory context beside runtime/model selection.
- product docs and private-instance guidance: use the same Host/cell vocabulary
  after the public-language gate is accepted.

### Transitively affected

- Runtime target response types and tests, because execution context becomes
  part of the preview contract.
- Mobile layout and accessible naming on the four surfaces.
- Support/comprehension guidance: customer → project → cell → Host must form a
  truthful ladder.

### Explicitly unaffected

- database schema and queries;
- runtime selection, task launch semantics, or scheduler ownership;
- authentication, network ingress, container allocation, backup transport,
  entitlements, cloud providers, or Host lifecycle;
- TDR-044 acceptance, which remains a later G-079 gate.

## Contract recommendation

Create one server-only `RelayCellBoundary` fact builder. It should return only:

- stable instance id when one already exists, otherwise `null`;
- resolved cell data directory and database path;
- launch working directory;
- whether the data root is the default or an explicit override;
- a versioned vocabulary identifier so later Host APIs can evolve without
  silently changing this response.

Do not infer a hostname, container id, OS user, network, port, customer owner,
backup status, or security strength until a Host supervisor can prove it. Do not
persist duplicate boundary data. Customer/project/task views consume the same
facts so copy and values cannot drift.

## Failure and shadow paths

- Missing instance config: show “not initialized” while still showing the real
  data root; never hide the cell boundary because git bootstrap is disabled.
- Missing project cwd: show the process launch directory as the explicit
  fallback and label it as such.
- Missing/failed runtime target: keep the existing named failure and still avoid
  implying isolation; the context response must fail visibly if it cannot be
  resolved.
- Long paths and ids: retain full values in accessible text/title, truncate only
  visually, and verify 390 px containment.
- Two processes pointed at one data root: do not call them separate cells. A
  future Host preflight must reject that collision; G-058 documentation should
  state the invariant without claiming current enforcement.
- Host administrator distrust: instruct the operator to use a separate VM or
  machine. Container/process isolation does not protect against the Host admin.

## Verification budget

1. Pure unit tests for default/overridden data roots, optional instance id, and
   launch-cwd fallback.
2. API tests proving dev, npx, and initialized-instance responses all include
   the same safe boundary facts and never expose credentials.
3. Component tests for customer, project, instance, and execution copy plus
   missing/long-value states.
4. A two-process fixture using distinct temporary `RELAY_DATA_DIR` values,
   projects, files, credentials, and task contexts; a negative fixture records
   that two customer rows inside one data root share the same cell.
5. Browser checks at desktop and 390 px in light/dark; comprehension review
   asks the reviewer to identify what a customer row, project cwd, cell, same
   Host, and separate VM do and do not isolate.
6. Targeted tests, typecheck, token validation, critical API inventory, and a
   real development-server smoke for the execution preview path.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| copy sounds like current customer data is unsafe | say records share one trusted cell, then offer the stronger cell/VM choices; do not use alarmist breach language |
| full local paths disclose host details to remote users | this is an administrative surface; keep it out of logs/support exports and revisit authorization with G-081 before public ingress |
| “instance” and “cell” become competing nouns | label the security unit “Relay cell”; reserve “instance” for legacy bootstrap/upgrade implementation until G-079 accepts migration wording |
| later supervisor duplicates facts | make this a read-only adapter over current sources; G-060/G-079 own the future Host registry contract |
| UI implies same-Host containers resist administrators | repeat that the Host administrator is trusted and name separate VM/machine as the stronger rung |

## Acceptance

The operator approved the exact public language and placements in
`features/relay-host-cell-isolation-boundary.md` on 2026-07-16. The read-only,
migration-free slice was implemented and verified. G-060/G-079 remain the
authority for Host topology, lifecycle metadata, authorization, and TDR-044.
