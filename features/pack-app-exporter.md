---
title: App→pack exporter — turn a running app into a pack.yaml + base/ (R6, Path 2 authoring)
status: completed
priority: P1
milestone: 0.37.0
source: _IDEAS/packs-publish.md §7 (Pillar D) / §10 R6
dependencies: [pack-provenance-tiers]
---

# App→pack exporter — the inverse of install (R6)

## Shipped implementation — 2026-07-11 (#45)

`src/lib/packs/app-exporter.ts` now turns a running Relay app into the standard
`Artifact` file set (`pack.yaml` + `base/`) and can atomically write it under
`$RELAY_DATA_DIR/exports/<app-id>`. The app detail surface downloads the same
artifact as `<app-id>.tgz`; chat exposes `export_app_as_pack` for “build me a
pack” requests.

The shipped standard names community-owned tables/schedules
`<pack-id>--<primitive>`, preserves typed table definitions and relation refs,
excludes live rows by default (explicit samples are capped at 25 rows/table),
refuses licensed premium content, and validates trigger/schedule shadow paths
before export. Direct Git installs without a trusted index signature classify
as `community · unverified`; the exporter does not invent a local signing
identity. A round-trip test exports, deletes, and reinstalls a running app and
proves the typed primitives and rewritten refs survive with zero network calls.

## Description

This is the **generator half of the community PLG loop** (Goal 5): a `GeneratorAdapter` that
turns a *running, validated* app in Relay back into a `pack.yaml` + `base/` — the **inverse of
`install.ts`'s manifest→primitives expansion**. It is the productivity layer that makes "I built
something useful for myself" collapse into "others can install it" in seconds. It has **no
egress** — it produces a pack artifact on disk; publishing that artifact is R7's job.

The value over hand-authoring (Path 1, which needs no build beyond the shipped format) is
**correctness by construction**: the exporter reads the app's *live, validated primitives*
(agents/workflows/tables/views that already pass their Zod schemas and already run), so the
emitted `pack.yaml` cannot mis-name a table id or emit a trigger var that fails install (the
row-insert-var-fillability class, HANDOFF caveat) — because it reads what the running app
*actually has*, not a from-memory re-derivation. It stamps `relayCore` and the
version automatically; community provenance is assigned at the Git/index trust boundary.

This was gated on the TDR-039 generator/publisher substrate (`features/architect-report.md`)
— the `GeneratorAdapter` type + registry must exist first. It is the genuinely *new* build in the
community loop (the publish transport + consent ceremony in R7 are recoverable from the completed
`marketplace-app-publishing.md`). Blast radius is **M**: it reads app state and writes files, but
introduces no network and no install-path change. Path 1 (hand-edit any editor + `git push`)
remains fully supported and needs *nothing* from this spec beyond the shipped format + the R3
signer — the two authoring paths produce the same on-disk format and interoperate at the file
level.

## User Story

As a Relay customer who built a useful app (agents + workflows + tables + views), I want a
one-action "export this app as a pack" that reads my live primitives and emits a correct, signed,
versioned `pack.yaml` + `base/`, so that I can share it without hand-writing YAML, computing
hashes, or risking a manifest that fails install — and so that anyone who prefers to hand-edit the
same format still can.

## Technical Approach

### Entry criterion — TDR-039 substrate exists

The exporter is a **`GeneratorAdapter`** in TDR-039's terms (`features/architect-report.md`):
"reads the app's own primitives, emits an artifact, no egress." That adapter type + its registry
must be shipped by the Web Designer substrate build (Phase 1 of the architect report) before R6
is buildable. This is an explicit dependency, not a nicety — R6 registers a `GeneratorAdapter`;
without the registry there is nowhere to register it. (Open design Q from the architect report:
does the generation half mirror the document-processor registry, TDR-017? — resolve at substrate
spec time; R6 consumes whatever shape lands.)

### The inverse-of-install transform

`install.ts` expands a `pack.yaml` + `base/` into live primitives, rewriting logical ids →
UUIDs (`rewriteViewRefs`, `install.ts:674`, recursive) and minting tables (`createTable`). The
exporter runs that **backwards**:

```
Running app (installed primitives, UUID-keyed)
   │  read agents / workflows / tables / views for this app (already-validated live state)
   ▼
Reverse the id rewrite: UUID → stable logical id  (the inverse of rewriteViewRefs)
   │  re-derive logical table/schedule/blueprint ids; strip instance-specific UUIDs
   ▼
Emit pack.yaml (manifest lists) + base/manifest.yaml + base/*.yaml  (correct-by-construction)
   │  stamp: version, relayCore range, entitlement (community packs: none / free)
   ▼
Direct Git install → community · unverified; a trusted index signature may attest provenance
```

The **hardest part is the id reversal** — UUIDs must map back to stable logical ids so the
emitted pack installs cleanly elsewhere (the same logical-id discipline the taxonomy registry
enforces, memory `pack-taxonomy-shared-registry` / `pack-of-is-primitive-pack-resolver`). Reuse
`pack-of.ts` where it resolves a primitive→owning-pack; add the inverse "UUID→logical-id" mapping
the exporter needs. A community pack should declare **community-safe logical ids** (not collide
with owned taxonomy ids) — surface a collision loudly at export time, never emit a pack that would
silently shadow an owned id on install.

### Correctness-by-construction guarantees (the accuracy win)

- **Row-insert trigger vars** are emitted as optional + `{{row.col}}` default by construction (the
  exporter reads the running trigger's actual var→column mapping), so an exported pack passes
  `install.ts` block 2d `assertRowTriggerVarsFillable` (0.33.1, memory
  `pack-backward-compat-convention`) — the class of bug hand-authoring hits, structurally avoided.
- **View bindings** (funnel, charts, kpis, gallery) are emitted from the live `.strict()`-valid
  view, so a bundle merge won't silently drop them (the `mergeBundle` allowlist shadow-path,
  memory `funnel-flow-primitive-built`).
- The emitted pack **round-trips**: export → install into a fresh instance → the app matches. A
  round-trip test is the core AC.

### No egress (the fence)

The exporter writes to a local dir only. **All network is R7's** (the publish). A test asserts the
exporter makes no network call — it is a pure read-app-state + write-files transform.

## Acceptance Criteria

- [x] The exporter emits the TDR-039 `Artifact` contract and turns a running app into a
      `pack.yaml` + `base/` on disk, with **no network call** (asserted).
- [x] **Round-trip**: exporting an installed app then installing the exported pack into a fresh
      instance reproduces the app (tables, agents, workflows, views, bindings) — a test proves it.
- [x] UUIDs are reversed to stable logical ids; the emitted pack installs cleanly (no dangling
      UUID refs).
- [x] Row-insert and scheduled blueprint variables are validated before export; the exported pack
      passes the install-time fillability gates.
- [x] View bindings (funnel/charts/kpis/gallery) survive export→install (no shadow-path drop).
- [x] Community ids are namespaced and any remaining **owned taxonomy id** collision fails loudly
      at export (never emits a shadowing pack).
- [x] Direct Git sources without a trusted index signature resolve as `community · unverified`.
- [x] Targeted exporter/install/chat/publisher tests and TypeScript verification are green.

## Scope Boundaries

**Included:**
- The `GeneratorAdapter` app→pack exporter (inverse of install) + the UUID→logical-id reversal.
- Correct-by-construction emission (row-trigger vars, view bindings, provenance/version stamping).
- Honest community classification at the direct-Git/index trust boundary.
- The round-trip test.

**Excluded (separate requirements / gated):**
- **The TDR-039 `GeneratorAdapter` type + registry** — a *dependency* (Web Designer substrate
  build), not built here.
- **Publishing** the exported pack anywhere → `pack-community-publish.md` (R7 — the SEND + consent
  ceremony + `data-flow.md` row). R6 has zero egress.
- **Path 1 (hand-edit)** — needs no build; the shipped format + R3 signer already support it. R6
  is purely the Path-2 convenience layer.
- **Partner/official signing** — trusted signatures remain Orionfold/index-side (R3 / open
  decision #4); the exporter does not claim a verified identity.

## References

- Source: `_IDEAS/packs-publish.md` §7 (Pillar D — two authoring paths; the exporter as the
  accuracy/reuse win; the inverse-of-install framing) + §10 R6.
- Substrate dependency: `features/architect-report.md` (TDR-039 `GeneratorAdapter` — "reads
  primitives, emits an artifact, no egress"; open Q: mirror the document-processor registry
  TDR-017?).
- Code anchors: `install.ts:674` (`rewriteViewRefs`, recursive — the id rewrite to invert),
  `install.ts` `createTable` (`:252`), `src/lib/apps/pack-of.ts` (primitive→pack resolver; add the
  inverse), `install.ts` block 2d `assertRowTriggerVarsFillable` (the constraint the exporter
  satisfies by construction).
- Depends on: `pack-provenance-tiers.md` (R3 — community classification + trusted index signatures) + the TDR-039
  substrate.
- Enables: `pack-community-publish.md` (R7 — publishes the exported artifact).
- Memory: `pack-taxonomy-shared-registry`, `pack-of-is-primitive-pack-resolver` (logical-id
  discipline), `pack-backward-compat-convention` (row-trigger var rule),
  `funnel-flow-primitive-built` (mergeBundle binding shadow-path), `generator-publisher-substrate-tdr039`.
