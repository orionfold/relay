---
title: npm Customer Install Integrity
status: in-progress
priority: P0
milestone: post-mvp
source: _IDEAS/triage.md
dependencies: []
---

# npm Customer Install Integrity

## Description

Relay's npm launcher combines package code with a downloaded production Next
build and copied/hoisted runtime inputs. The 2026-07-22 walkthrough proved that
a shared npx cache can update the npm dependency to `0.45.2` while retaining a
July 3 `.next` build and copied source. Relay then reports the current version
while executing obsolete behavior.

This feature makes version identity an enforced artifact contract and makes
Settings maintenance reopen the same Relay instance. It also owns the separate
dependency-hygiene pass for warnings that precede Relay's first useful output.

## User story

As a returning npm customer, I want `npx orionfold-relay@latest` and the
Settings upgrade command to run exactly the version they claim against my
existing data and Host configuration, so an update cannot look like data loss
or resurrect fixed behavior.

## Technical approach

### Version-bound installed inputs

- Introduce an authoritative local manifest for the effective production build
  and copied runtime inputs.
- Bind it to Relay package version, release artifact checksum, build identity
  and the input set required by the CLI.
- Treat absent, mismatched, partial and corrupt manifests as named refresh
  states.
- Download/extract/copy into a temporary versioned location, verify it, then
  atomically promote it.
- Preserve a valid matching cache for offline launch; never accept a bare
  `.next/BUILD_ID` as sufficient proof.
- Keep customer data, license, Host state and external roots outside refresh
  scope.

### Instance-safe maintenance

- Persist or derive non-secret launch provenance for the current process:
  package selector/version, data root, Host root, port, exposure and applicable
  flags.
- Render a copyable command that preserves that context.
- Explain in plain language that app bytes update while the external data root
  remains.
- Verify after restart: displayed version, effective data root and Host root.
- If launch provenance is incomplete, say which values are unknown and provide
  a conservative command rather than inventing defaults.

### Dependency hygiene

- Trace warnings from the packed install tree, not the development lockfile
  alone.
- Evaluate the packed `exceljs` and `better-sqlite3` owner paths rather than
  assuming root-only npm overrides reach npx customers.
- Replace ExcelJS's stale dependency closure with maintained Node 20-compatible
  XLSX reader/writer packages, with the three Relay consumers sharing one
  typed adapter.
- Retain `better-sqlite3` 12 while Relay supports Node 20; its sole packed
  warning can leave only with the separately reviewed Node 22+
  `better-sqlite3` 13 migration.
- If upstream blocks removal, document reachability and a trigger; never
  suppress npm warnings.

## Acceptance criteria

- [x] One shared-effective-root test installs version N, advances to N+1, and
      proves N+1 application behavior and inputs run.
- [x] CLI, package metadata, UI version, build manifest and artifact checksum
      agree.
- [x] Matching cached artifacts can start without network access.
- [x] Mismatched, incomplete and corrupt artifacts refresh atomically or fail
      with a named recovery path.
- [x] Interrupted refresh leaves the prior valid version usable and customer
      data unchanged.
- [x] Settings produces a copyable restart/upgrade command preserving explicit
      data root, Host root, port and exposure.
- [x] Default-root and missing-provenance cases remain truthful.
- [x] A non-git launch emits no raw Git stderr.
- [x] G-115 records packed dependency provenance and removes or truthfully
      dispositions every clean-install deprecation warning.
- [x] Spreadsheet import/export, SQLite native loading, production build and npm
      public-boundary checks pass.

## Regression budget

- CLI unit tests for manifest state and command rendering.
- Filesystem fixtures for atomic promotion and interrupted refresh.
- Two real npm-cache journeys: isolated new customer and shared-cache upgrade.
- Non-git current-package launch.
- Supported Node/npm/platform matrix proportionate to native dependencies.
- Browser check of version, instance identity and maintenance copy.

## Scope boundaries

**Included:** npm/npx production-build acquisition, copied inputs, cache
versioning, maintenance command, install warning provenance.

**Excluded:** npm registry publication, npm CLI implementation, customer-data
migration, Host/Cell OCI optimization, global npm cache deletion.

## References

- TRIAGE-036 — stale application bytes under current version
- TRIAGE-040 — transitive dependency deprecation warnings
- TRIAGE-042 — maintenance command loses instance context
- G-114, G-115

## G-115 acceptance receipt — 2026-07-23

A clean packed install fell from seven production deprecation warnings to one.
Relay removed ExcelJS and its stale Archiver, fast-csv, Unzipper and UUID
closure, replacing the basic XLSX read/write surface with
`read-excel-file@9.3.4` and `write-excel-file@4.1.1`. Recharts' `react-is` peer
is now direct instead of accidentally supplied by another dependency.

The remaining `prebuild-install@7.1.3` warning belongs exclusively to
`better-sqlite3@12.11.1`. Its warning-free v13 line requires Node 22, so Relay
retains it until a separate Node-minimum decision and native platform proof.
The development tree additionally retains two Drizzle Kit loader warnings.
`config/install-dependency-debt.json` and the CI guard fail on any unreviewed
change.

Verification passed: typed XLSX regressions, native SQLite and XLSX use from
the packed artifact, the exact clean-install capture, 3,910 tests plus one
skip, 136 Host regressions, TypeScript, CLI build, public-boundary checks, and
the production build.
