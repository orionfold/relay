---
title: Pack taxonomy CI gate — fail the build on ownership drift (R3)
status: shipped
priority: P1
milestone: post-mvp
source: _IDEAS/packs-robustify.md §4 Pillar A / §10 R3
dependencies: [pack-taxonomy-codified]
---

# Pack taxonomy CI gate — fail the build on ownership drift (R3)

## Description

R1 (`pack-taxonomy-codified.md`) turns the owned-primitive registry into a checked data file
(`src/lib/packs/taxonomy.ts`). This feature adds the **gate that makes it bite**: a build script that
parses every bundled pack manifest, reconciles each declared logical table/schedule id against
`taxonomy.ts`, and **fails the build** on any of three drift classes. It is the single highest-leverage
build in `_IDEAS/packs-robustify.md` §11 — a one-time gate that makes *every future pack* safe **at
author time, before a single customer sees it**, instead of at a customer's first request, silently.

Today the only ownership enforcement is `BundleCollisionError` (`bundle.ts:45`), which fires **only
under a bundle flatten**. A pack that redefines an owned id but installs **side-by-side** hits no
error — `createTable` mints a divergent UUID table (`install.ts:252`). This gate closes that hole at
the cheapest possible moment (CI) by checking declarations against the registry, not install topology.

It follows the exact shape of the existing `scripts/check-price-drift.mjs` release gate: a standalone
`.mjs` that walks `src/lib/packs/templates/`, parses YAML, and exits non-zero on a real problem. Blast
radius **S** — a new script + an npm alias + a `taxonomy.ts` import; no runtime code path changes.

## User Story

As a pack author (human or LLM), I want the build to fail loudly the moment I declare a table a peer
pack already owns, or a table absent from the taxonomy, or with columns that drift from the registered
contract — so that the mistake that would silently break a customer is caught by me, at author time,
not by them, at runtime.

## Technical Approach

### The script — `scripts/check-pack-taxonomy.mjs`

Model it on `scripts/check-price-drift.mjs` (same `TEMPLATES_DIR` walk, same `js-yaml` parse, same
`process.exit(1)` on failure, same exported constants for testability).

```
node scripts/check-pack-taxonomy.mjs     # exits 0 clean, 1 on any drift
```

Algorithm:

1. **Load the taxonomy.** Import `TAXONOMY` from `src/lib/packs/taxonomy.ts` (R1). Because the script
   is `.mjs` and `taxonomy.ts` is TS, either (a) import via the same mechanism `check-price-drift.mjs`
   uses for repo modules, or (b) if TS import from a raw `.mjs` is awkward in this repo, have R1 also
   emit the data as a checked-in `taxonomy.json` the script reads — decide at build time; prefer the
   direct `.ts` import if the toolchain allows it (avoids a second SSOT). **Do not** re-transcribe the
   registry into the script — that reintroduces the drift the gate exists to kill.

2. **Walk every bundled pack manifest.** For each subdir of `TEMPLATES_DIR`, read `base/manifest.yaml`
   if present. **Skip bundle packs** — `relay-agency-cre`, `relay-agency-nonprofit`, `relay-marketing`
   have no `base/manifest.yaml` (they declare only a `bundle:` child list in `pack.yaml`); a missing
   `base/manifest.yaml` is expected for them, not a failure.

3. **Collect declared logical ids.** From each manifest, gather `tables[].id` and `schedules[].id`.
   Distinguish **declare** (an entry under `tables:` with its own `columns:`) from **reference** (an id
   named by a trigger/KPI/blueprint but not re-listed under `tables:`). Only a **declare** is subject to
   the ownership check — a reference to an owned id is legal (the Pro→spine pattern) and must pass.
   > Read `install.ts` / the manifest schema (`src/lib/apps/registry.ts`) at build time to pin exactly
   > where a declaration vs. a reference lives in the parsed manifest, so this distinction is precise.

4. **Fail on three drift classes** (fail-CLOSED — unlike price-drift, this is a local check with no
   network, so no fail-open):
   - **(i) Second owner** — two different packs each *declare* the same logical id. Name both packs +
     the id.
   - **(ii) Unregistered owner** — a pack *declares* a logical id absent from `taxonomy.ts`. Name the
     pack + the id + the fix ("add it to `taxonomy.ts` with this pack as owner").
   - **(iii) Column-contract drift** — a pack declares a table whose column set differs from the
     registered `columns` for that id. Name the id + the added/removed columns. (Additive columns are
     still drift here — the registry is the contract; update `taxonomy.ts` in the same change. A
     *loosening* vs. *breaking* distinction is R5's job, not this gate's.)

5. **Report + exit.** On any failure, print each violation with pack + id + reason, then
   `process.exit(1)`. Clean → print a one-line "N packs, M logical ids, all owned + in-contract" and
   exit 0.

### Wiring it into the build

- **npm alias** in `package.json` mirroring `check:price-drift`:
  `"check:pack-taxonomy": "node scripts/check-pack-taxonomy.mjs"`.
- **Release gate.** Add it to whatever chains the release checks (the same place `check:price-drift`
  runs before publish). Confirm the exact chain at build time — `check:price-drift` is invoked from
  the release path, not `npm test`; match that so the gate runs at publish. If a `pretest`/CI step is
  the right home for author-time feedback, add it there too, but the **release gate is the required
  one**.

### A test for the gate

`scripts/__tests__/check-pack-taxonomy.test.ts` (or the repo's script-test convention) that feeds the
checker synthetic manifest fixtures:
- a clean set → exit 0;
- a second-owner collision → exit 1, message names both packs;
- an unregistered declare → exit 1;
- a column-drift declare → exit 1;
- a legal *reference* to an owned id (trigger attach, no re-declare) → exit 0.

Export the core check function (not just the CLI wrapper) so the test calls it directly, exactly as
`check-price-drift.mjs` exports its normalizers.

## Acceptance Criteria

- [ ] `scripts/check-pack-taxonomy.mjs` exists, walks `TEMPLATES_DIR`, and reads ownership from
      `taxonomy.ts` (R1) — never a transcribed copy of the registry.
- [ ] It **skips** bundle packs with no `base/manifest.yaml` without error.
- [ ] It distinguishes a **declare** (owned-id check applies) from a **reference** (always legal).
- [ ] It exits 1 and names the offenders on: (i) second owner, (ii) unregistered owner, (iii) column
      drift; exits 0 and prints a summary line when clean.
- [ ] Run against the **current** shipped packs, the gate passes (proves `taxonomy.ts` matches reality
      — if it fails, the R1 data was wrong and gets fixed as part of landing this).
- [ ] `package.json` has a `check:pack-taxonomy` script; it is wired into the release-check chain
      alongside `check:price-drift`.
- [ ] A test exercises all three failure classes + the clean case + the legal-reference case via
      synthetic fixtures, calling an exported check function directly.
- [ ] `npm test` green (0 new regressions vs. the 8 known pre-existing failures).

## Scope Boundaries

**Included:**
- The `check-pack-taxonomy.mjs` gate + its three drift classes.
- npm alias + release-chain wiring.
- A fixture-driven test of the gate.

**Excluded (separate requirements):**
- The **install-time** cross-pack collision check (runtime, refuses a live side-by-side redefine) →
  R2. This gate is CI-time only; it does not touch `install.ts`.
- The **compat-diff** gate (new version vs. last published) → R5 (`pack-taxonomy-ci-gate` checks
  ownership, not version-over-version breaking changes).
- **Column loosening/breaking taxonomy** — this gate treats any column-set difference from the
  registry as drift to reconcile; classifying additive-vs-breaking is R5.
- **`joinKeys` / integration** validation → R7.

## References

- Source: `_IDEAS/packs-robustify.md` §4 (Pillar A, three enforcement points — this is point (b), the
  CI gate) + §10 R3 + §11 (highest-leverage first build).
- Depends on: `pack-taxonomy-codified.md` (R1) — reads its `TAXONOMY`.
- Precedent to copy: `scripts/check-price-drift.mjs` (standalone `.mjs` gate, `TEMPLATES_DIR` walk,
  exported testable core, `process.exit(1)` on drift, npm alias `check:price-drift`).
- Verified anchors (2026-07-06): `bundle.ts:45` `claimIds`/`BundleCollisionError` (flatten-only);
  `install.ts:252` `createTable` mints fresh UUID (the side-by-side divergence this gate pre-empts);
  bundle packs `relay-agency-cre`/`relay-agency-nonprofit`/`relay-marketing` have no `base/manifest.yaml`.
- Memory: `pack-taxonomy-shared-registry`, `prod-smoke-encodes-contracts` (release-gate discipline),
  `never-rg-dash-r-flag` (if grepping manifests in the script, use `-n`/`-l`).
