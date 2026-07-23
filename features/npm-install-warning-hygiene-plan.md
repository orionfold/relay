---
title: Npm Install Warning Hygiene Plan
status: completed
specification: features/npm-customer-install-integrity.md
goal: G-115
---

# Npm Install Warning Hygiene Plan

## Goal contract

Reduce clean customer-install deprecation warnings without hiding npm output,
weakening spreadsheet behavior, changing Relay's Node 20+ promise, or replacing
SQLite. Every retained warning must have an exact packed-tree owner, customer
reachability, upstream trigger, and regression guard.

## Current upstream decision

- ExcelJS 4.4.0 remains the latest npm release and its current main branch
  still declares Archiver 5, fast-csv 4, Unzipper 0.10 and UUID 8. npm only
  considers `overrides` in the installing root project, so an override that
  cleans the developer tree disappears when Relay is installed through npx.
  Relay instead uses the maintained `read-excel-file` and
  `write-excel-file` packages, both compatible with Node 20.
- better-sqlite3 13 moved to N-API, bundles prebuilt binaries, and removed
  deprecated `prebuild-install`, but requires Node 22. Relay retains
  better-sqlite3 12 while its public engine remains Node 20+. The adoption
  trigger is a separately accepted Node 22 minimum plus native install/load,
  migration, backup/restore and supported-platform proof.
- The UUID advisory affects buffer-writing v3/v5/v6 calls. ExcelJS uses UUID
  generation rather than caller-supplied output buffers, but the maintained
  patched version is still preferred when compatibility tests pass.
- Forced npm audit fixes, warning suppression, vendoring, a publishable
  shrinkwrap that npx does not honor transitively, and untested cross-tree
  major overrides are rejected.

## Vertical slices

1. Capture the exact current production owner graph from the lockfile and a
   packed clean install.
2. Replace ExcelJS with maintained, Node 20-compatible read/write packages
   after proving the smaller API surface Relay actually uses.
   Make Recharts' `react-is` peer direct after the clean tree proves it was
   previously present only by accident.
3. Refresh the dependency-debt guard so every retained warning is exact and
   any new warning fails CI.
4. Run XLSX and CSV import/export regressions, native SQLite load and database
   suites, CLI/build/public-boundary checks, full tests, production build, npm
   pack, and a clean isolated-cache install capture.
5. If the replacement breaks behavior or packed installation, restore ExcelJS
   and retain its exact upstream-owned warnings with a trigger.

## Sources checked 2026-07-23

- https://github.com/exceljs/exceljs/blob/master/package.json
- https://github.com/exceljs/exceljs/releases/tag/v4.4.0
- https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0
- https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.1
- https://github.com/advisories/GHSA-w5hq-g745-h8pq
- https://github.com/advisories/GHSA-qx2v-qp2m-jg93
- https://docs.npmjs.com/files/package.json#overrides
- https://www.npmjs.com/package/read-excel-file
- https://www.npmjs.com/package/write-excel-file

## Acceptance receipt — 2026-07-23

- Customer packed install: seven warnings before, exactly one after
  (`better-sqlite3 > prebuild-install`).
- Development tree: exactly three warnings, consisting of that production
  native installer plus two Drizzle Kit-only loaders.
- Packed artifact proof: SQLite opened and queried an in-memory database;
  maintained XLSX packages wrote and read a typed workbook.
- Regression proof: 3,910 tests passed with one skip; 136 Host checks,
  TypeScript, CLI build, public boundary, exact dependency-debt guard, and the
  Next production build passed.
- Rescue path exercised: npm root-only overrides and a transitive shrinkwrap
  were rejected after clean-room installs proved they did not affect npx
  customers.
