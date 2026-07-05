---
title: Bundle-at-install (flatten) — the composition model, ship first
status: built
priority: P1
milestone: post-mvp
source: _IDEAS/packs-evolution.md §5 + §2 + §8.3
dependencies: [pack-generalize-agency]
---

# Bundle-at-install (flatten) — the composition model

## Description

Today packs are **standalone**: Agency Pro re-ships every profile it names because cross-app
references are unsafe — a blueprint step resolves a `profileId` string at run time, and a KPI
binds a table by logical name and **reads 0 silently** if absent
(`features/feat-agency-pro-pack.md`). A catalog of *splitting* packs (Marketing → CRM + Social)
cannot tolerate that silent-fail. The strategy (`packs-evolution.md §5`) honestly ranks three
composition mechanisms by cost against the proven Apps engine and picks the cheapest that ships
value now:

**Bundle-at-install (flatten).** A "bundle" pack merges its children's primitives into **one
installed app** at install time. After the merge there is exactly one app, one project scope —
so there are **no live cross-pack pointers, no cross-project UUID resolution, and no silent-fail
risk**. It reuses the Apps engine *fully* (`packs-evolution.md §2`: a pack IS an app; `installPack`
already calls the same `ensureAppProject` + `writeAppManifest` seam the compose chat-tools use,
`install.ts`). The one new seam is a **bundle manifest format + an install-time merge** — no
cross-project resolution layer.

This is the composition primitive the catalog needs, shipped on the proven single-app machinery.
It is P1 and precedes `dependsOn`/foundation packs (`pack-dependson-foundation`) by design: it
delivers the Marketing = CRM + Social value immediately and only sacrifices independent child
install/update — exactly the capability `dependsOn` buys later, *when it earns its weight*.

## User Story

As a pack author, I want to declare a bundle pack that lists child packs and have Relay merge
their primitives into a single installed app at install, so that a buyer installs "Marketing"
once and gets CRM + Social composed together with no broken cross-pack references.

## Technical Approach

- **Bundle manifest format.** Add a bundle descriptor to the pack format
  (`src/lib/packs/format.ts`) — a pack that declares child pack ids to flatten rather than its
  own inner AppManifest (or in addition to it). Keep the format extending *around* the pristine
  AppManifest, not into it (`format.ts` "extends AROUND it, not INTO it").
- **Install-time merge.** In the install path (`src/lib/packs/install.ts`), when a pack is a
  bundle, resolve each child from the **local-first catalog** (never a remote index — preserves
  the no-marketplace fence), merge their primitives (profiles, blueprints, tables, schedules,
  view/KPI bindings, seed rows) into ONE AppManifest under one project scope, then run the
  existing `ensureAppProject` + `writeAppManifest` seam once. All bindings become intra-app —
  the proven, non-silent-fail path.
- **Collision handling.** Merging two children can collide on primitive ids/table names. Define
  deterministic merge rules (namespace or refuse-on-collision with a named error — zero silent
  failures, CLAUDE.md principle #1); a colliding bundle must fail install loudly, not
  half-merge. Reuse the existing per-pack `rewriteTableRefs`/`rewriteViewRefs` logical→real
  rewrite, now applied across the merged manifest.
- **Install state.** The bundle installs as one app id (bundle id = app id = project id, the
  proven one-string identity from §2). Uninstall cascades the single merged app via the
  existing `deleteAppCascade` — no cross-project cascade guard needed (that is
  `pack-dependson-foundation`'s concern).
- **No cross-project resolution.** Explicitly do NOT add `dependsOn`, cross-project UUID
  resolution, or provenance — those are the deferred A/B mechanisms (§5). This spec ships C only.

**Smoke budget (CLAUDE.md):** the install path is runtime-registry-adjacent — budget an
end-to-end `npm run dev` smoke that installs a real bundle pack (`pack-marketing-line` is the
first consumer) and verifies the merged app renders and its cross-child bindings resolve.

## Acceptance Criteria

- [ ] The pack format accepts a bundle descriptor listing child pack ids; a non-bundle pack is
      unaffected (back-compat, existing packs install unchanged).
- [ ] Installing a bundle merges all children into ONE app under one project scope; after
      install `getApp`/`listApps` see a single app indistinguishable from a hand-composed one.
- [ ] A cross-child binding (e.g. a Social blueprint step referencing a CRM profile, a KPI
      reading a CRM table) resolves correctly post-merge — no silent 0-reads.
- [ ] A bundle whose children collide on a primitive id/table name fails install with a named
      error (no half-merge, no silent overwrite).
- [ ] Children resolve only against the local-first catalog; no remote index is contacted
      (no-marketplace fence intact).
- [ ] Uninstalling a bundle cascades its single merged app cleanly.
- [ ] An end-to-end dev-server smoke installs a real bundle and renders the merged app.

## Scope Boundaries

**Included:**
- Bundle manifest format + install-time flatten/merge into one app.
- Deterministic collision handling with loud failure.
- Local-first child resolution; single-app uninstall cascade.

**Excluded:**
- `dependsOn`, independent child install/update, cross-project UUID resolution, foundation-pack
  provenance, cascade-delete guards (all `pack-dependson-foundation`).
- Authoring the Marketing children themselves (`pack-marketing-line`).
- Bundle pricing mechanics (`pack-entitlement-per-line` + Website coordination).

## References

- **Authoring a bundle child? Read `features/pack-taxonomy.md` first** — the shared registry of
  logical table/schedule ids and the one-owner-per-primitive rule. A bundle child that redeclares a
  table a sibling owns fails the flatten with `BundleCollisionError` (by design).
- Source: `_IDEAS/packs-evolution.md` §5 (mechanism table, C-first recommendation), §2 (Apps
  engine = composition engine), §8.3.
- Anchors: `src/lib/packs/format.ts` (pack = superset of AppManifest, extends around),
  `src/lib/packs/install.ts` (`ensureAppProject`/`writeAppManifest` seam, `rewriteTableRefs`),
  `src/lib/apps/pack-of.ts` (per-project UUID isolation — why cross-project is the hard part
  deferred to A/B).
- Enables: `pack-marketing-line` (first bundle), `pack-entitlement-per-line` (bundle price →
  parent). Depends on: `pack-generalize-agency` (persona+industry is the miniature bundle case).

## Verification run — 2026-07-05 (BUILT)

Shipped **compose-then-install**: a bundle pack declares `bundle: [childIds]` (no
`base/manifest.yaml`); `installPack` resolves each child local-first, `mergeBundle` flattens them
into ONE synthetic pack, and the existing single-app install flow runs unchanged — so the single
logical→real UUID rewrite spans the merged manifest and every cross-child binding resolves
intra-app.

- **New:** `src/lib/packs/bundle.ts` (`mergeBundle`, pure). **Changed:** `format.ts`
  (`bundle` field, `isBundle`, `BundleCollisionError`, bundle packs skip the `base/manifest.yaml`
  requirement + get a derived placeholder manifest), `install.ts` (bundle branch after
  `parsePack`; `readCustomerSeed` aggregates all children's `seed/customers.yaml` + dedupes by
  slug). Bundle's OWN `entitlement` gates install (one license per bundle); git-URL children
  refused (no-marketplace fence).
- **View merge rule (locked):** first-hero + concat-rest — `hero`/`kit` from the FIRST child that
  declares a view; `secondary` + `kpis` concatenated in `bundle:` order.
- **Collision rule:** refuse-on-collision with `BundleCollisionError` naming the id + both child
  packs, for any shared logical id (table/profile/blueprint/schedule) or droppable-file relPath.
  No half-merge (validated pre-write, so a colliding bundle writes nothing).
- **Tests:** `bundle.test.ts` (8, merge unit), `install.test.ts` (+3: one-app flatten,
  cross-child trigger+KPI resolve to real UUID, collision refusal writes nothing),
  `format.test.ts` (+bundle field / no-base-manifest / back-compat), `catalog.test.ts` (+bundle
  template lists cleanly, fixtures excluded from the real catalog). 147 packs+install-route tests
  green; full suite = only the 8 documented pre-existing failures (0 regressions).
- **E2E smoke (runtime-registry-adjacent, CLAUDE.md):** installed the `relay-bundle-smoke` fixture
  through the REAL non-mocked module graph — one merged app, cross-child trigger + KPI both
  resolved to the real `leads` UUID (no silent 0-read), no module-load-cycle `ReferenceError`.
  Live `npm run dev` server healthy after the change (`/packs` 200, install route responds
  through the Next runtime).
- **Fixtures:** test-only under `src/lib/packs/__tests__/fixtures/` (invisible to `/packs`), NOT
  the shipped `templates/`. The real Marketing children are `pack-marketing-line` (out of scope).
- **NOT released:** ships behind the next release cut (version bump + annotated tag pending).
