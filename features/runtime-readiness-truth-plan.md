---
title: Runtime Readiness Truth Implementation Plan
status: completed
goal: G-119
specification: features/runtime-first-value-reliability.md
---

# Runtime Readiness Truth Implementation Plan

## Goal contract

**Outcome:** Settings provider cards, runtime routing, workflow preflight, and
shell summaries use one evidence-backed distinction between setup and verified
readiness.

**Constraints:** Keep credentials encrypted/local, preserve Relay's isolated
Codex home, retain provider-specific inventory and loaded-state evidence, and
do not broaden OAuth scopes or hosted behavior.

**Verification:** Pure state-machine tests; provider API/component regressions;
auth replacement and failure-path tests; local inventory filtering fixtures;
targeted suites, TypeScript, production build, and a real task under
`npm run dev` because runtime-registry imports are in scope.

**Operator gates:** Only a credential-policy, OAuth-scope, telemetry, hosted
service, or external-write change. None is planned.

**Stop/rescue:** If shared persistence would erase provider-specific truth,
normalize only the presentation contract and retain the raw evidence per
provider.

## Vertical slices

1. Add a normalized, persisted readiness observation with named failure kinds,
   timestamps, and source evidence. Replacing connection settings invalidates
   the prior observation.
2. Extend runtime routing status with the normalized readiness fields and make
   configured-but-unverified distinct from verified, rejected, and unreachable.
3. Derive provider-card and shell summaries from the same status snapshot.
4. Filter non-generation local inventory from generation counts/defaults while
   preserving loaded/type metadata for supported models.
5. Exercise auth rejection, timeout/outage, malformed inventory, Codex absence,
   cache invalidation, and a real runtime task smoke.

## Regression budget

- One pure classifier suite plus focused runtime-status/API/component tests.
- Existing settings/auth and provider-model suites updated only where the
  public contract intentionally changes.
- Full affected suite, `tsc --noEmit`, production build.
- Development-server task creation/execution smoke using a reachable compatible
  runtime or the repository's deterministic runtime smoke harness.

## Rescue and rollback

The readiness observation is stored in ordinary settings rows and is
non-authoritative for credential retrieval. Rolling back the UI/status
consumers leaves credentials and routing policy untouched; stale observations
can be ignored or deleted without data loss.
