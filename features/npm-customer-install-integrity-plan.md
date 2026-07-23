---
title: G-114 Implementation Plan — npm Customer Install Integrity
status: completed
priority: P0
milestone: post-mvp
source: features/npm-customer-install-integrity.md
dependencies: []
---

# G-114 Implementation Plan

## Outcome

Bind the effective production build and hoisted runtime inputs to the exact npm
package version, then make Settings show a safe restart/upgrade command for the
active non-git instance.

## Scope challenge

- **Reduce rejected:** checking only `.next/BUILD_ID` would leave stale copied
  `src`, `public`, and config inputs and the wrong-instance maintenance command.
- **Proceed:** add one build-version manifest, one transactional hoisted-input
  synchronizer, and one sanitized launch-context contract.
- **Expand rejected:** do not redesign npm/npx caches, add an installer daemon,
  or change customer data layout.

## What already exists

- `ensurePrebuilt()` already owns version-keyed cache download, checksum,
  extraction, external-package relinking, and cache pruning.
- `bin/cli.ts` already detects hoisted Next installs and copies runtime inputs.
- The CLI already passes authoritative `RELAY_DATA_DIR`, launch cwd, port,
  exposure, route prefix and public origin to the Next child.
- `/api/instance/config` already distinguishes non-git npm installs.
- `InstanceSection` already owns the non-git maintenance card.
- Existing prebuilt, API-route and component suites provide the nearest test
  layers; `scripts/npx-prod-smoke.mjs` is the real production substrate.

## Specification and acceptance mapping

Authority: `features/npm-customer-install-integrity.md`.

| Acceptance requirement | Implementation slice |
|---|---|
| Exact version/build agreement | version manifest plus `isPrebuiltCurrent()` |
| Same-cache old→new repair | always call `ensurePrebuilt`; replace mismatched build through staged promotion |
| Hoisted runtime input agreement | transactional `syncHoistedWorkspaceInputs()` with version manifest |
| Failure leaves no mixed runnable state | stage, validate, promote/restore; current-version predicate controls production start |
| Same-instance maintenance | sanitized CLI launch context inherited by Next and rendered by Settings |
| Non-git truth | remove Git-centric npm copy and test default/explicit context |

## Vertical slices

### 1. Reproduce and protect build mismatch

- Change the existing “BUILD_ID means current” test into a failing legacy-build
  reproduction.
- Add matching, mismatched, corrupt-cache and prior-build-preservation cases.
- Stage extraction outside `.next`, write the version/checksum manifest, then
  promote with rollback.
- Make CLI production-mode selection require the current-version predicate.

### 2. Protect hoisted runtime inputs

- Extract hoisted synchronization from `bin/cli.ts`.
- Stage every shipped runtime input, validate staged `package.json.version`,
  back up current destinations, promote, write the manifest last, and restore
  on failure.
- Reuse already-current inputs without rewriting.

### 3. Preserve active launch context

- Add a typed sanitized launch-context helper with shell-safe rendering.
- CLI emits the JSON contract only to the child environment.
- Instance API returns it only for non-git mode.
- Settings explains app update versus persistent data and renders a copy action
  for the exact command.

### 4. Verify production behavior

- Run closest unit/component/API suites, TypeScript, CLI build and production
  build.
- Build the prebuilt artifact and run the npx production smoke with explicit
  data/Host roots and non-default port.
- Add/reuse a same-cache sequential package-version fixture without publishing.

## Regression test budget

- `src/lib/desktop/__tests__/prebuilt-download.test.ts`: legacy no-manifest
  build, current manifest, N→N+1, corrupt cache, extraction/promotion failure.
- New hoisted-workspace tests: initial copy, current no-op, version refresh,
  missing required input, rollback and manifest-last behavior.
- New launch-context tests: default/explicit paths, Host root, port, exposure,
  public origin, route prefix, safe mode, cache path and shell quoting.
- Instance route tests: non-git context present/absent/invalid without secret
  leakage.
- Instance component tests: exact command, copy action and truthful persistence
  explanation.
- `npm run build:cli`, TypeScript, `npm run build`.
- Customer smoke: current package from non-git cwd; shared effective root with
  seeded old manifests; assert current CLI/UI/build identity and no raw Git
  stderr.

## Error & Rescue Registry

| Failure | Required recovery |
|---|---|
| Mismatched legacy `.next` | never select production mode; stage current artifact |
| Bad cached checksum | evict bad cache; retain prior build but mark it unusable for current version |
| Extraction/promotion failure | restore prior `.next`; fail to dev mode, never run stale production bytes |
| Missing hoisted input | abort before child spawn with named input |
| Interrupted input promotion | absent/mismatched manifest forces full repair next launch |
| Invalid launch-context JSON | omit exact command and show explicit provenance-unavailable guidance |
| Shell metacharacters in paths | single-quote escaping; never evaluate stored text |
| Customer data path overlaps runtime root | reject destructive runtime sync outside the known hoisted destinations |

## NOT in scope

- Dependency-warning cleanup (G-115).
- Welcome, entitlement, Pack or Host copy (G-116+).
- npm publication/version bump/release.
- Global npm cache deletion or customer-data migration.
- Runtime registry modules; no TDR-032 real-task smoke is required for this
  slice because those imports are untouched.

## Completion receipt — 2026-07-22

- The effective `.next` build is accepted only when package version, artifact
  checksum and `BUILD_ID` agree with the promoted manifest.
- Production artifacts and Relay-owned hoisted inputs are staged before
  promotion; corrupt cache entries are evicted and prior valid builds are
  restored on handled failures.
- Hoisted synchronization never replaces the containing npm project’s
  `package.json`; regression coverage pins that customer-project boundary.
- The CLI passes a typed, secret-free launch context to the server. Settings
  renders and copies the exact non-secret restart command or names missing
  provenance without inventing defaults.
- Forty-six targeted tests, TypeScript, CLI build, production build, a 46.3 MB
  prebuilt artifact, and the full packed-npm production smoke passed. The smoke
  covered first/cached production launch, authenticated LAN assets, licensing,
  premium/bundle Pack install, loud development fallback, pricing, taxonomy,
  compatibility and tarball gates.
- Customer-identical browser proof on a disposable packed install confirmed
  v0.45.2, Community identity, exact data/Host roots, port 3214, exposure,
  rendered restart command, copy confirmation and zero browser console errors.
- Fresh two-pass review found and resolved the staged-link readiness edge and
  containing-project `package.json` overwrite risk. No critical findings
  remain; concurrent launch synchronization is a low-probability named-failure
  opportunity rather than a silent corruption path.
