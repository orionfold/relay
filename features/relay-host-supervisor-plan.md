---
title: G-083 Relay Host supervisor implementation plan
status: completed
goal: G-083
date: 2026-07-18
specification: features/relay-host-supervisor.md
tdr: TDR-044
---

# G-083 Relay Host supervisor implementation plan

## Scope challenge result

**PROCEED as selected.** Implement the Host-local control plane and its fake plus
Docker boundaries. Do not absorb G-084 UI, Website commerce, live cloud
provisioning, Fleet control or G-094's separately gated registry publication.

## What already exists

| Existing surface | Reuse |
|---|---|
| `src/lib/licensing/host-entitlement.ts` | exact signed grant, capacity, lapse, update and replacement oracle |
| file license store | exact offline envelopes; supervisor reads but never copies them into Host DB |
| G-060/G-079 contracts and TDR-044 | topology, states, content boundary, collisions and rescue |
| G-093/G-094 artifact contracts | immutable image repository/digest and production verification authority |
| G-081 ingress and G-082 recovery | Cell-side route/auth inputs and checkpoint fingerprint vocabulary |
| better-sqlite3/WAL precedent | dedicated Host registry connection, never application DB singleton |
| `scripts/lib/harness.mjs` | isolated temp roots and deterministic process cleanup for smoke |

## Specification and acceptance mapping

| Acceptance | Slice | Protecting evidence |
|---|---|---|
| separate supervisor/registry | contracts + packaging | module-boundary and CLI build tests |
| strict content-free records | contracts + registry | schema/content scanner fixtures |
| license before allocation | supervisor preflight | denied-action zero-residue integration tests |
| collision/capacity atomicity | registry reservation | competing DB connection tests |
| lifecycle/idempotency/rescue | supervisor + fake runtime | transition/replay/effect/rollback matrix |
| retention/release/purge | lifecycle | counting, checkpoint and sibling containment tests |
| OCI policy | Docker adapter | exact argv and artifact-reference tests |
| two-Cell isolation | conformance fixture | distinct derived-resource inventory assertions |
| npm delivery | CLI/tsup/package | build, help, packed-file and public-boundary checks |

## Vertical slices

1. **Contracts:** strict Zod schemas, named errors, canonical plan digests,
   content-free scanner and legal transition helpers.
2. **Registry:** owner-only Host root, independent SQLite/WAL schema v1,
   conditional operations, cells, reservations and receipts.
3. **Admission:** load exact license envelopes, select G-095 grant, enforce
   commercial plus provisional physical capacity before reserving anything.
4. **Lifecycle:** injected runtime create/start/stop/restart/retain/
   export-release/purge with idempotent operation IDs, durable partial state and
   reconcile/rollback behavior.
5. **Adapters/CLI:** deterministic fake adapter, argv-only Docker adapter,
   provider bootstrap interface, `relay host` and `relay-host` entry points.
6. **Conformance/docs:** targeted and affected regressions, two-Cell local
   fixture, package/build checks, security review and documentation receipts.

## Regression test budget

- `contracts.test.ts`: strict/minimum records, mutable artifacts, identifier,
  secret/content, canonical ordering and all legal/illegal transitions.
- `registry.test.ts`: bootstrap/reopen/version/corruption, conditional writes,
  operation replay conflict, content scan and two-connection reservation races.
- `supervisor.test.ts`: license absent/invalid/lapsed/upgraded, zero-residue
  denial, create/start/stop/restart, injected partial/rollback, retain/release/
  purge, exact verified checkpoint evidence, sibling containment and capacity reserve.
- `runtime.test.ts`: fake observations and exact Docker executable/argv policy,
  no shell, loopback port, non-root/read-only, mount/network/limit and cleanup.
- `cli.test.ts`: parse/usage/named errors and no default Relay server startup.
- Affected suites: Host entitlement, recovery, ingress and existing Cell
  shutdown/artifact contracts.
- Static/package: TypeScript, CLI build, npm closure/public boundary, docs and
  `git diff --check`.
- Runtime: deterministic Host CLI smoke in a temporary root. Docker lifecycle
  smoke uses the locally verified G-093 image only as mechanics evidence and
  records that it cannot close G-094 publication.
- Browser: explicitly not applicable; no UI/API route is introduced.

## Error & Rescue Registry

| Failure | Evidence | Rescue |
|---|---|---|
| license/grant/lapse/capacity denial | named refusal, no rows/paths/runtime calls | install valid/higher signed envelope or reduce request |
| registry unavailable/newer/corrupt | named Host registry error, no runtime call | restore Host DB or run read-only runtime inventory/reconcile |
| collision or reserve breach | exact safe resource ref | choose another Cell/port or resize Host; retry new operation ID |
| replay with changed plan | original receipt plus conflict | reuse original plan or create a new operation ID |
| partial runtime effect | non-terminal Cell and exact resource refs | reconcile then resume or scoped rollback |
| rollback partial | remaining refs in content-free receipt | administrator cleanup followed by reconcile |
| artifact unavailable/unverified | artifact-specific refusal | retain existing Cells; wait for accepted digest/evidence |
| purge confirmation mismatch | destructive refusal | reissue with exact Cell ID after reviewing checkpoint/retention |
| module-load coupling | CLI/Next build failure | remove application import; keep Host contracts dependency-neutral |

## Verification order

1. closest contract/registry/supervisor/adapter/CLI tests;
2. existing Host entitlement, ingress, recovery, shutdown and artifact suites;
3. TypeScript and CLI build;
4. temporary-root Host CLI/fake conformance and optional local Docker mechanics;
5. npm/public-boundary/document checks;
6. broader tests and production build;
7. fresh two-pass security/code review and product-manager ship verification.

## Rescue and rollback

All application behavior is unchanged unless a Host command is invoked. Host DB
v1 is additive and independent. A failed supervisor upgrade retains the prior
binary-readable registry and never purges Cell roots. Removing the new CLI/bin
leaves direct Relay startup untouched. No external state is created by this
plan.

## NOT in scope

- browser/settings lifecycle UX (G-084);
- live Website prices/issuer/checkout (Website G-030);
- GHCR push, signing, visibility or promotion (G-094 external gate);
- live provider credentials/resources (G-085);
- remote Fleet Controller or cross-Host commands;
- online activation/global Host counting; and
- automatic or implicit data deletion.

## References

- `features/relay-host-supervisor.md`
- `features/relay-host-fleet-manager-contract.md`
- `features/relay-host-authority-isolation-contract.md`
- `features/oci-fulfillment.md`
- `.agents/skills/architect/references/tdr-044-customer-owned-cloud-deployment.md`
