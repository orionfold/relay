---
generated: 2026-07-18
mode: impact
---

# Architect Report

## Change Impact Analysis — G-083 Relay Host supervisor

### Proposed change

Add an npm-delivered, Host-local privileged supervisor that manages only OCI
Cells resident on one machine. It consumes the accepted G-095 offline Host
grant, G-094 digest authority, G-081 Cell ingress boundary, and G-082 recovery
receipt vocabulary without entering a Cell's application graph or data store.

### Blast radius

| Layer | Surfaces | Impact |
|---|---|---|
| Host domain | new strict contracts, lifecycle reducer, errors and content scanner | one authority for Host/Cell state and refusal semantics |
| Persistence | dedicated Host-root SQLite/WAL registry | new database, explicitly separate from every Cell DB and application migrations |
| Licensing | existing `host-entitlement.ts` and file license store | signed limits checked before allocation; continuity survives lapse/removal |
| OCI runtime | injected adapter plus Docker argv implementation | digest-pinned, non-root, loopback-only Cell lifecycle with no shell command strings |
| Distribution/CLI | npm CLI subcommand and separate `relay-host` executable | privileged flow remains out of Next.js instrumentation and normal Cell startup |
| Documentation/tests | Host guide, contracts, fake/Docker conformance | executable evidence replaces architecture-only claims |

**Classification:** High — privileged, licensing-sensitive, persistent and
runtime-effecting across five layers. It remains local-only and does not add a
browser API, provider credential, Fleet Controller or cloud resource.

### Dependency trace

```text
signed license files
  → G-095 inspection/admission oracle
      → Host supervisor preflight
          → dedicated Host registry reservation + receipt
              → injected OCI runtime adapter
                  → one digest-pinned Cell on this Host

G-094 release identity/digest ────────────────┘
G-081 Cell ingress contract → Cell launch environment only
G-082 checkpoint receipt → export-and-release eligibility only
```

### What is reused

- `src/lib/licensing/host-entitlement.ts` remains the only commercial admission
  oracle; limits never become container-runtime policy or Website amounts.
- The canonical file license store supplies exact signed envelopes. The Host
  registry stores only license and licensee references, never license bytes.
- TDR-010's SQLite/WAL discipline applies to a new dedicated connection, not
  the application DB singleton.
- G-060/G-079 contracts supply states, collision/refusal behavior, trusted Host
  administrator semantics and the content-free registry boundary.
- G-094 supplies the production repository/signing/digest contract. Local fake
  and verified-image fixtures may prove mechanics but cannot satisfy its
  external publication gate.

### Migration and compatibility

- Application schema/bootstrap/migrations: unchanged.
- Host registry: independent schema version 1, idempotent bootstrap, fail-closed
  on newer/unknown versions, WAL and foreign keys enabled.
- Existing direct `relay` startup and one unmanaged Cell remain unchanged.
- Existing Pack licenses remain valid and cannot authorize Host effects.
- CLI surface is additive. No supervisor starts unless an administrator invokes
  a Host command.

### Primary risks and controls

| Risk | Control |
|---|---|
| allocation before entitlement | pure admission runs before registry/resource mutation |
| stale capacity/collision race | one immediate transaction reserves all resources; adapter call follows a recheck |
| customer content in control plane | strict schemas, derived allocations, opaque refs and a content scanner; raw adapter errors are not persisted |
| Cell/application graph coupling | separate package boundary and dynamic CLI import; no instrumentation/API import |
| mutable/forged image authority | production manifests require `ghcr.io/orionfold/relay-cell@sha256:...`; artifact verification is independent from licensing |
| lapse strands customer work | receipt-bound start/stop/export/recovery/rollback/purge continuity remains available |
| partial OCI mutation | non-terminal registry state plus exact resource refs, reconcile and scoped rollback |
| trusted-admin ambiguity | same-Host admin trust remains explicit; hostile tenants require separate Hosts |

### TDR implication

TDR-044 already decides this topology, authority, storage and distribution
boundary. G-083 implements it; no new TDR is needed unless implementation would
introduce remote multi-Host authority, online activation, a shared customer DB,
or a browser lifecycle API.

### Recommended approach

Proceed in dependency-neutral vertical slices: strict contracts and state
grammar; dedicated registry; licensed/physical admission; fake runtime; Docker
adapter and local CLI; then deterministic conformance and packaging. Keep G-084
UX, Website G-030 prices, live provider authorization and G-094 external GHCR
proof outside this implementation.

---

*Generated by `/architect` — Change Impact Analysis mode*
