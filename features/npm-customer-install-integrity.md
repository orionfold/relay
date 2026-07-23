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
- Evaluate current `exceljs`/archiver/fast-csv/unzipper and
  `better-sqlite3`/native-installer paths.
- Upgrade, replace or remove only with spreadsheet/SQLite behavior protected.
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
- [ ] G-115 records packed dependency provenance and removes or truthfully
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
