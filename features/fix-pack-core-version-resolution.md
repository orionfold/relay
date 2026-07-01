---
title: Fix pack install core-version resolution (0.0.0 in bundled CLI)
status: done
priority: P0
milestone: mvp
source: _IDEAS/backlog.md
dependencies: []
---

# Fix pack install core-version resolution (0.0.0 in bundled CLI)

## Description

The only shippable pack is un-installable on the published npx build — packs are dead-on-arrival for
real users. `npx orionfold-relay pack add relay-agency` fails with:
`Pack relay-agency@0.1.0 requires relay-core >=0.15.0, but this install is 0.0.0.`

**Root cause (mechanism corrected & verified 2026-07-01 — the original backlog wording was wrong):**
`relayCoreVersion()` (`install.ts:24-40`) resolves the app root via
`getAppRoot(import.meta.dirname, 3)` (`install.ts:31`) then reads `<root>/package.json`. The defect is
**NOT** a bundler-flattened relative path — tsup preserves the literal `import.meta.dirname` + depth-3
call (`dist/cli.js:25187`). The defect is that the **hardcoded depth `3`** is correct for the *source*
tree (`src/lib/packs/../../..` = repo root) but wrong for the flattened `dist/` layout, where
`dist/cli.js` needs depth **1** to reach the package root. Overshooting makes `getAppRoot` fall back to
`process.cwd()` (`app-root.ts:23`); under npx in an arbitrary dir with no matching `package.json`,
`readFileSync` throws → caught at `install.ts:36` → `return "0.0.0"` (`install.ts:39`). So every
npx/tarball user reports core `0.0.0` and the pack's `>=0.15.0` gate (`install.ts:104-110`) fails.

**Proof:** identical `pack add` against the local repo `dist/cli.js` (depth-3 resolves there) succeeds
fully. This is exactly the gap the CLAUDE.md pre-publish smoke rule / isolated-harness R1 would catch.

## User Story

As a solo founder, I want `npx orionfold-relay pack add relay-agency` to install successfully, so that
I get the vertical content (profiles/blueprints/customers) that makes the product useful for my domain.

## Technical Approach

- **Preferred fix — embed the version at build time.** `tsup.config.ts` already reads `./package.json`
  at build time (for the `external` list, `tsup.config.ts:4,15`) but does NOT embed the version. Add a
  tsup `define` (e.g. `define: { __RELAY_CORE_VERSION__: JSON.stringify(pkg.version) }`) and have
  `relayCoreVersion()` return the compile-time constant, eliminating the runtime `package.json` lookup
  and the fragile depth math entirely.
- **Alternative — make depth bundle-aware** (weaker; keeps runtime lookup): resolve relative to the
  executable / walk up until a `package.json` with `name === "orionfold-relay"` is found.
- **Blast radius:** the same depth-mismatch pattern appears at `dist/cli.js:5408,5583,12055` (depth-4
  callers) + `:166` (depth-3). Audit these `getAppRoot(import.meta.dirname, N)` call sites for the
  bundled layout while here.
- **CI:** add a tarball pack-install smoke to `publish.yml` (see `feat-prepublish-tarball-smoke` /
  isolated-harness R1) so this class of bug can't ship again.

## Acceptance Criteria

- [x] From a fresh isolated dir, `pack add relay-agency` (built `dist/cli.js`, `cwd != repo`) reports the
      real core version and installs — materializing the app + customers + table + profiles + blueprints.
      _(2026-07-01 smoke: from a mktemp dir with isolated RELAY_DATA_DIR →
      "Installed relay-agency@0.1.0: project created, 1 table(s) (6 rows), 6 customer(s), 7 profile(s),
      8 blueprint(s)." The >=0.15.0 gate passed; pre-fix it failed with "install is 0.0.0".)_
- [x] `relayCoreVersion()` returns the correct version from the **bundled** `dist/cli.js`, not `0.0.0`.
      _(tsup `define: { __RELAY_CORE_VERSION__ }` inlines the literal; bundle now short-circuits at
      `if (semver.valid("0.15.1")) return "0.15.1"` — no runtime lookup, identifier fully replaced.)_
- [x] The other `getAppRoot(..., N)` call sites are audited **and fixed** in the bundle.
      _(All 5 depth-3/4 sites — install.ts, apps/starters, profiles/blueprints/schedules registries —
      flatten into dist/cli.js where depth overshoots. Rather than patch 5 depths, `getAppRoot` is now
      bundle-aware: fast-path uses the passed depth (dev, byte-identical), else walks UP to the
      orionfold-relay package.json. 5 new app-root unit tests cover both layouts + the npx foreign-pkg
      case. Defense in depth: the embed alone fixes install.ts; the getAppRoot hardening fixes the
      registries too and backstops install.ts if the define is ever dropped.)_

**Follow-up (excluded per scope):** the pre-publish tarball pack-install CI smoke
(`feat-prepublish-tarball-smoke`) — so this class of bug can't ship undetected. Not built here.

## Scope Boundaries

**Included:**
- Correct core-version resolution in the bundled CLI (via build-time embed) + audit of sibling call sites.

**Excluded:**
- The pack-install **UI/discoverability** gap (`fix-pack-install-discoverability`) — separate blocker #9.
- Building the pre-publish tarball smoke harness (`feat-prepublish-tarball-smoke`) — related, separate.
- Shipping a paid/entitlement-gated pack (opportunity — separate).

## References

- Source: `_IDEAS/backlog.md` — JS1 blocker #8 (mechanism-corrected entry).
- Related features: `primitive-bundle-plugin-kind-5.md`, `app-package-format.md`, `cli-bootstrap.md`,
  `install-parity-audit.md`, `npm-publish-readiness.md`.
