---
title: Pack standard versioning — index-schema + relayCore + apiVersion in one release checklist (R5)
status: built
priority: P2
milestone: post-mvp
source: _IDEAS/packs-publish.md §8 (Pillar E) / §10 R5
dependencies: [pack-canonical-index]
built: 2026-07-06 (unreleased — the early relayCore skip in resolvePackSourceAsync +
  the docs/RELEASING.md three-axis checklist fold; forward-incompat + local defense-in-depth
  already covered by R1/install tests. Live CLI smoke: incompat skips before fetch, compat installs.)
---

# Pack standard versioning — the release-checklist fold + the early relayCore skip (R5)

## Description

A standard lives or dies on forward compatibility. The "Orionfold Packs" standard has **three
versioning axes** — the index schema (`orionfold.packs/v1`), each pack's `relayCore` semver
range, and the plugin `apiVersion` window — and they must move together at release time or the
standard silently drifts. This feature folds all three into **one release-time bump checklist**
(extending the checklist `packs-robustify.md R6` already proposes) and adds one cheap runtime
improvement: an **early `relayCore` skip in the resolver** so an incompatible pack is filtered
*before* it is fetched, not after a wasted clone.

This is mostly **process + a small gate**, so blast radius is **S**. It has no new user-facing
surface — it is the discipline that keeps R1–R4 forward-compatible as the catalog and the core
both evolve. The three mechanisms it unifies already exist individually: the schema-string
version (mirrors `orionfold.pricing/v1` / `orionfold.license/v1`), the `relayCore` check
(`install.ts:163-170`), and the apiVersion window (the HANDOFF caveat — bump on every MINOR). R5
makes sure a release never bumps one and forgets the others, the exact class of near-miss the
apiVersion caveat documents (S38→S39: a handoff once wrongly said "no bump needed").

## User Story

As the release engineer (and as a future Relay reading a future index), I want index-schema,
per-pack `relayCore`, and plugin `apiVersion` versioning to move as one checklist and to be
enforced, so that a newer index never breaks an older Relay silently and an incompatible pack is
skipped early — the standard stays forward-compatible by construction, not by hope.

## Technical Approach

### Fold the three axes into one release checklist

Extend the R6 release-bump checklist (`packs-robustify.md`) to a single ordered list a release
must satisfy, so no axis is bumped in isolation:

1. **Index schema** (`orionfold.packs/v1`) — additive fields only within a version; a breaking
   index change majors the schema string (`v1` → `v2`) and the old Relay refuses the new index
   loudly (the `.strict()` + literal `schema` discriminant from R1 already gives this — a v1 Relay
   rejects a `v2` index rather than misreading it). Document the additive-vs-breaking rule.
2. **Per-pack `relayCore`** (`format.ts:38`, checked at `install.ts:163-170`) — a pack adopting a
   new manifest field must raise its `relayCore`, exactly as the `price`-object shape did (older
   cores reject the unknown key via `.strict()`, HANDOFF caveat). The R5 compat-diff gate
   (`packs-robustify.md §6`) still guards each pack's own version-to-version compat.
3. **Plugin `apiVersion` window** (`sdk/types.ts` `CURRENT_PLUGIN_API_VERSION` + `registry.ts`
   previous-MINOR literal + the 3 example `plugin.yaml`s) — bump on **every MINOR** (HANDOFF
   caveat; the window test derives its expected window from `package.json` and fails loudly until
   every site bumps). **Do NOT unify** packs' `relayCore` with plugins' `apiVersion` — they are
   separate mechanisms for separate artifact kinds; R5 *co-lists* them in one checklist, it does
   not merge them.

Land the unified checklist where release discipline already lives (`docs/RELEASING.md` and/or the
`commit-push-pr` auto-bump heuristic), so a release consults one list.

### The early `relayCore` skip in the resolver (the one code change)

Today `relayCore` is checked at install, *after* the pack is acquired (`install.ts:163-170`). The
R1 index carries `entry.relayCore`, so the R2 resolver can skip an incompatible pack **before
fetching it** — a cheaper, earlier gate:

```ts
// in resolvePackSourceAsync (R2), after findIndexEntry, before fetchPackDir:
if (entry.relayCore && !semver.satisfies(coreVersion, entry.relayCore)) {
  throw new PackValidationError(
    `Pack "${entry.id}"@${entry.version} requires relay-core ${entry.relayCore}, ` +
      `but this install is ${coreVersion}. Skipped before fetch.`
  );
}
```

The post-acquire check at `install.ts:163-170` **stays** (defense in depth — a locally-pointed
pack or a stale index must still be caught); the early skip is an optimization + a clearer error,
not a replacement.

### A cheap conformance test

Add a test asserting: (a) a `v2` index string is rejected by the `v1` schema (forward-incompat is
loud); (b) the early skip fires for an `entry.relayCore` the running core does not satisfy, before
any fetch; (c) the release-checklist doc names all three axes. No heavy machinery — this is the
gate that makes the discipline real.

## Acceptance Criteria

- [x] `docs/RELEASING.md` (or the release checklist surface) lists all three versioning axes —
      index schema, per-pack `relayCore`, plugin `apiVersion` — as one ordered bump checklist,
      with the additive-vs-breaking rule for the index documented. → "Versioning axes" section.
- [x] The R1 `.strict()` + literal `schema` discriminant is confirmed to make a `v1` Relay reject
      a `v2` index loudly (test). → `index-schema.test.ts` "rejects an unknown top-level schema
      string (R5 forward-incompat is LOUD)".
- [x] The R2 resolver skips a pack whose `entry.relayCore` the running core does not satisfy
      **before** fetching it, with a clear named error (test asserts no fetch on incompat). →
      `catalog.ts resolvePackSourceAsync` early skip; `catalog.test.ts` asserts the skip beats a
      missing-artifact fetch error; live CLI smoke confirms "Skipped before fetch".
- [x] The post-acquire `relayCore` check (`install.ts`) is unchanged — a test proves a
      locally-pointed incompatible pack is still refused (defense in depth). →
      `install.test.ts` "throws PackValidationError before any write when relayCore compat is unmet".
- [x] `relayCore` and `apiVersion` are **not** merged — they remain distinct; the checklist
      co-lists them. → the "Do NOT unify" note in `docs/RELEASING.md`.
- [x] `npm test` green (0 new regressions). → packs (231) + licensing/plugins (324) all green.

## Scope Boundaries

**Included:**
- The unified release-bump checklist (three axes, one list) + the additive-vs-breaking index rule.
- The early `relayCore` skip in the R2 resolver + its test.
- A conformance test for forward-incompat index rejection.

**Excluded (separate requirements):**
- **The compat-diff CI gate** (per-pack version-to-version compat) → `packs-robustify.md` R5 (a
  different R5 — that governance gate; this R5 is versioning-of-the-standard). Co-listed in the
  checklist, not built here.
- **The apiVersion window bump machinery** — already shipped; R5 only *co-lists* it so a release
  never forgets it.
- **Any merge of `relayCore` and `apiVersion`** — explicitly NOT done.
- Index-schema `v2` itself — R5 ships the *rule* for how v2 would land, not v2.

## References

- Source: `_IDEAS/packs-publish.md` §8 (Pillar E — the three axes, the reconcile-don't-unify rule)
  + §10 R5 + §9 (R5 sequencing — folds into the R6 checklist).
- Code anchors (verified 2026-07-06): `format.ts:38` (`relayCore` field),
  `install.ts:163-170` (the post-acquire relayCore check to keep), the R1 `PackIndexSchema`
  literal `schema` discriminant (forward-incompat rejection).
- Versioning precedents: `orionfold.pricing/v1`, `orionfold.license/v1` schema strings; the
  `price`-object `.strict()` rollout (HANDOFF caveat — raise `relayCore` when adopting a new field).
- Depends on: `pack-canonical-index.md` (R1 — the schema-string discipline + `entry.relayCore`).
  Relates to: `pack-remote-resolver.md` (R2 — where the early skip lands).
- Memory: `apiversion-window-bump-at-version-bump` (the every-MINOR bump + the S38→S39 near-miss),
  `pack-taxonomy-codified-and-gate-built` (cheap-gate discipline), `release-and-issue-conventions`.
