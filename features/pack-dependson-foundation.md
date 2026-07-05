---
title: dependsOn + foundation packs — cross-project composition, only when it earns its weight
status: planned
priority: P3
milestone: post-mvp
source: _IDEAS/packs-evolution.md §5 (mechanisms A+B) + §8.6 + §10 Q2
dependencies: [pack-bundle-model]
---

# dependsOn + foundation packs

## Description

Bundle-at-install (`pack-bundle-model`) flattens children into one app — it ships composition
value immediately but **sacrifices independent child install/update**. When the catalog
concretely needs a *shared, live* foundation pack (a `relay-crm-core` several feature packs
build on and update independently), flatten is no longer enough. This spec adds the two deferred
composition mechanisms from `packs-evolution.md §5`:

- **A. `dependsOn` + validation** — child packs install independently; a pack declares
  `dependsOn: [relay-crm-core]`; install resolves + validates the referenced primitives before
  writing.
- **B. Foundation "core" packs** — shared primitives live in free foundation packs that feature
  packs build on via A, with provenance so a shared primitive resolves to its owning foundation
  pack.

This is **genuinely new infrastructure**, not a config tweak (§5): every binding resolver today
takes one manifest + one project scope; tables are per-project UUIDs minted at install; the
logical→real rewrite (`rewriteTableRefs`/`rewriteViewRefs`) is per-pack, so pack B has **no way
to name pack A's real table id** (`src/lib/apps/pack-of.ts`, `src/lib/packs/install.ts`). A
cross-project id-resolution layer + a cascade-delete guard are the new seams.

It is **P3, deliberately last** (§8.6, §10 Q2): build it **only when independent child
install/update earns its weight over flatten-bundle** — until then flatten is sufficient. This
spec is the ceiling-corollary in action: composition-across-packs is the new Core primitive the
catalog demands, built only when flatten stops being enough.

## User Story

As a pack author maintaining a shared CRM core that multiple feature packs build on, I want each
feature pack to declare `dependsOn: [relay-crm-core]` and install/update independently against a
single live foundation pack, so that a CRM-core fix reaches every dependent pack without
re-flattening and re-shipping each bundle.

## Technical Approach

Both mechanisms need the same new seams (§5 "why A/B is genuinely new"):

- **`dependsOn` field.** Add `dependsOn: [packId]` to the pack format (`src/lib/packs/format.ts`
  — today `.strict()` rejects it). Install resolves each dependency against the **local-first
  catalog** (no remote index — no-marketplace fence) and validates that every referenced
  primitive exists *before* writing (never a silent 0-read).
- **Cross-project id resolution.** Build the layer that lets pack B name pack A's real,
  per-project UUID table/primitive — the capability every current resolver lacks (each takes one
  manifest + one scope). This is the hard part; scope it against `pack-of.ts` (the pure
  primitive→pack resolver) and the per-pack `rewriteTableRefs`/`rewriteViewRefs` rewrite.
- **Foundation-pack provenance.** A shared primitive resolves to its owning foundation pack;
  `pack-of.ts` extends from "which pack owns this primitive" to cross-pack provenance.
- **Install ordering + cascade guard.** Install a dependency before its dependents. Removing a
  foundation pack a feature pack still needs must be **refused with a named error, not a silent
  break** (CLAUDE.md principle #1). This cascade-delete guard is the safety seam flatten never
  needed (a flattened bundle is one app; deleting it is unambiguous).
- **Free foundations (§7).** Foundation/core packs carry no entitlement (D5: capabilities stay
  free; a `dependsOn` on a free core never gates a buyer). Coordinate with
  `pack-entitlement-per-line`.

**Smoke budget:** the install/resolution path is runtime-registry-adjacent — budget a dev-server
smoke that installs a foundation pack, then a dependent pack, updates the foundation, and
verifies the dependent still resolves; and one that refuses to remove a still-needed foundation.

**Trigger gate (§10 Q2):** do NOT build this until a concrete need for independent child
install/update or a shared live foundation pack exists. This spec stays P3/planned until that
trigger fires.

## Acceptance Criteria

- [ ] A pack can declare `dependsOn: [packId]`; install resolves + validates every referenced
      primitive against the local-first catalog before writing, failing loudly on a missing ref.
- [ ] A dependent pack can name and correctly resolve a foundation pack's per-project primitive
      (cross-project id resolution works — no silent 0-read).
- [ ] Install ordering guarantees a dependency is installed before its dependents.
- [ ] Removing a foundation pack a feature pack still needs is refused with a named error (cascade
      guard); no silent break.
- [ ] Foundation/core packs carry no entitlement (free); the fence against a remote index holds.
- [ ] Dev-server smokes pass: independent install + foundation update + dependent-still-resolves,
      and refused-removal-of-needed-foundation.

## Scope Boundaries

**Included:**
- `dependsOn` field + cross-project id resolution + install ordering + cascade-delete guard.
- Foundation-pack provenance; marking foundation packs free.

**Excluded:**
- Any remote marketplace/index — deps resolve local-first only.
- Bundle-at-install flatten (`pack-bundle-model` — this spec is the *later* alternative, not a
  replacement; both coexist).
- Building it before the §10-Q2 trigger fires (independent child install/update earning its
  weight) — this spec stays P3/planned until then.

## References

- Source: `_IDEAS/packs-evolution.md` §5 (mechanisms A + B, "why A/B is genuinely new"), §8.6,
  §10 Q2 (when dependsOn earns its weight), §7 (free foundations).
- Anchors: `src/lib/packs/format.ts` (`.strict()` rejects `dependsOn` today),
  `src/lib/apps/pack-of.ts` (pure primitive→pack resolver to extend), `src/lib/packs/install.ts`
  (per-pack `rewriteTableRefs`/`rewriteViewRefs`, UUID minting).
- Depends on: `pack-bundle-model` (ships composition first; this is the fast-follow when flatten
  stops being enough). Relates to: `pack-entitlement-per-line` (free foundations).
