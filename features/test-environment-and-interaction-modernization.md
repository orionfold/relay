# G-067 — Test environment and interaction modernization

**Status:** completed
**Date:** 2026-07-14
**Source:** G-063 audit; G-051 rendered-state fixture

## Outcome

Relay's default Vitest run assigns server/data/API tests to Node, React and hook
tests to jsdom, and one compiled-CSS interaction fixture to pinned Chromium. One
representative Tables interaction slice uses semantic user interaction and
role/name queries instead of direct event dispatch.

## Scope challenge

This goal does not migrate the broad component suite to a browser and does not
create a screenshot farm. The smallest useful slice is one project-membership
guard, two related Tables jsdom tests, and one shared compiled-CSS fixture for
hover, press, focus, disabled/inert, and destructive states in light/dark.

## Acceptance criteria

- Every default test belongs to exactly one of Node, jsdom, or browser; E2E stays
  external and no file is silently omitted or double-collected.
- Node/DB/API/CLI/filesystem tests run without a DOM; React/hook tests retain
  jsdom and real SQLite compatibility remains harness-owned.
- Tables row and nested-checkbox/double-click coverage uses `user-event` and
  semantic queries while preserving callbacks and visible behavior.
- A pinned Playwright/Chromium Vitest project loads Relay's compiled CSS and
  asserts fill-only list hover, dark structural hover/press, stronger keyboard
  focus, disabled/inert exclusion, and destructive color semantics.
- Normal and fixed-seed runs retain parity, browser repetitions are clean, and
  the quality workflow installs the pinned browser before enforcing the matrix.

## Regression budget

- One membership script and quality-gate lane.
- Two existing jsdom files modernized; no product source changes.
- One five-case browser file; no screenshots or per-route browser expansion.
- TypeScript, harness safety, default/coverage, fixed-seed, and repeated browser
  checks before completion.

## Rescue and rollback

If multi-project global setup causes cross-project database collisions, stop and
give each project an explicit harness namespace before continuing. If compiled
Tailwind CSS or browser pseudo-state assertions remain flaky after two distinct
approaches, keep the Node/jsdom split and close the browser slice as rejected
with evidence rather than weakening assertions. Rollback is removal of the
browser project/dependencies and restoration of the single jsdom config; no
production data or schema changes are involved.

## Completion evidence

- Baseline: 415 files and 3,246 tests (3,245 passed, one intentional skip) in
  36.23 seconds under the single-jsdom topology.
- Final matrix: 315 Node files, 100 jsdom files, and one browser file, all 416
  collected exactly once. The run executed 3,251 tests (3,250 passed, one skip)
  in 23.93 seconds, a 34% wall-time reduction.
- Fixed seed `6301` preserved the same 3,250/0/1 result. Two independent harness
  roots were created and removed, and `test:harness-safety` preserved its
  inherited sentinel and cleanup receipt.
- Pinned Chromium passed the five-case compiled-CSS suite repeatedly. Deliberate
  1px-focus, destructive-color, disabled/inert-hover-leak, and collapsed-hover-
  token faults each failed the intended assertion; exact restoration returned
  the suite to green.
- Coverage executed all 416 files and passed 3,250/0/1 at 39.66% lines,
  39.03% statements, 37.27% functions, and 33.83% branches. A side-by-side old
  versus new environment run proved the small risk-floor changes were paired
  V8 instrumentation decrements (covered and total), not lost behavior paths;
  only the fractionally lower floors were rebaselined.
- Project membership, quality-policy tests, quality coverage, TypeScript,
  harness safety, and diff checks passed. The final 19-lane release profile
  passed in 53.50 seconds, including the real Ollama runtime-graph receipt,
  seven-of-seven required mutation kills, Pack compatibility, and CLI build.
  No production source, cursor rule, or customer-facing behavior changed.

## Goal disposition

G-067 and its bounded source goal G-051 are complete. Broader browser migration,
composite keyboard semantics, and screenshots remain outside this slice.
