---
title: Clean up deprecated transitive dependencies (npm install warnings)
status: accepted
priority: P3
milestone: post-mvp
source: customer install log (issue #1 npx output)
dependencies: []
---

# Clean up deprecated transitive dependencies (npm install warnings)

## Description

`npx orionfold-relay` / `npm install` prints a wall of `npm warn deprecated`
lines (surfaced in customer issue #1's install log). They are cosmetically
alarming for new users — the first thing Harun saw before the crash — and one
(`glob@7`) is flagged for known security vulnerabilities.

The original nine were all transitive. G-115 revalidated the *packed customer
tree* rather than only the checkout lockfile and removed the six owned by
ExcelJS. One production warning now remains; two additional warnings are
development-only.

Deprecated packages observed:

| Package | Note |
|---|---|
| `prebuild-install@7.1.3` | **Retained production path:** `better-sqlite3@12`; removal requires its Node 22+ v13 line and native-platform proof |
| `@esbuild-kit/esm-loader@2.6.5` | **Retained development-only:** Drizzle Kit loader, merged into `tsx` |
| `@esbuild-kit/core-utils@3.3.2` | **Retained development-only:** Drizzle Kit helper, merged into `tsx` |
| `glob`, `rimraf`, `inflight`, `uuid`, `lodash.isequal`, `fstream` | **Removed:** left with ExcelJS's stale dependency closure |

## Technical Approach

1. Attribute warnings in the packed npx tree.
2. Prefer maintained direct dependencies over root-only overrides, because npm
   ignores an installed package's `overrides`.
3. Protect XLSX import/export and SQLite native behavior with consumer tests.
4. Freeze every retained warning and its owner in a fail-closed guard.

## Acceptance Criteria

- [x] Every remaining deprecated package is attributed to an upstream owner;
      unsafe major overrides are rejected and guarded as bounded debt.
- [x] `npm install` on a clean checkout prints exactly the accepted deprecation
      warnings (one in the packed production tree; three in development).
- [x] `npm run build:cli` + full test suite green after the safe updates.
- [x] `better-sqlite3` native Linux load and real PDF parse succeed in the G-080
      artifact; `pdfjs-dist` stays owned by `pdf-parse` and explicitly external.

## Scope Boundaries

**Included:** attribute and safely reduce the packed deprecation set through
maintained dependency replacement.

**Excluded:** a full dependency-freshness audit / major-version upgrade sweep of
all direct deps (separate, larger effort). Only the deprecation warnings here.

## Notes

- Low risk, low urgency (P3) — no functional bug, purely install-time hygiene +
  one security-flagged transitive. Good "clean checkout" or first-impression
  polish item. See memory [[cli-startup-robustness]] for the issue #1 context
  where these first surfaced.

## Acceptance receipt — 2026-07-16

G-034 was absorbed and accepted by G-080. Safe upstream updates reduced the
initial clean-install advisory set from 25 (including 3 critical) to 8 moderate
overall / 4 moderate in production. The remaining production paths are the
Next-owned PostCSS advisory and ExcelJS-owned UUID advisory; npm's forced fixes
would install breaking historical Next/ExcelJS versions and were rejected.

At that point, `config/install-dependency-debt.json` froze the exact nine
deprecations and owners. `npm ci`, `npm ls --depth=0`, the debt guard,
native/PDF artifact tests, TypeScript, CLI build, the 3,590-test suite, and the
full G-080 Docker smoke passed.

## G-115 acceptance receipt — 2026-07-23

The earlier bounded debt was revisited for first-install polish. A clean-room
pack proved that npm root `overrides` and a dependency-local shrinkwrap do not
change npx's resolved tree, so both apparent fixes were rejected. Relay instead
replaced ExcelJS with maintained XLSX reader/writer packages for the basic
surface it actually uses. That removed six customer warnings and the stale
UUID advisory path.

The customer tarball now installs with exactly one warning:
`better-sqlite3@12.11.1 > prebuild-install@7.1.3`. The warning-free
better-sqlite3 13 line requires Node 22; Relay keeps Node 20 support until that
policy change receives its own native/platform proof. The exact retained set,
spreadsheet dependencies and Recharts runtime peer are guarded. The packed
SQLite/XLSX proof, production build, CLI/public boundary, Host regressions and
3,910-test suite passed.
