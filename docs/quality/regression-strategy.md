# Relay regression strategy

This document defines how Relay decides whether behavior is protected. It is a
risk policy, not a promise that every source line deserves a test.

Adopted through G-067 on 2026-07-14.

## Quality objective

Relay aims for **complete regression protection of named load-bearing
invariants**, not blanket 100% repository line coverage. Coverage percentages
are diagnostics that reveal missing execution; they do not prove that
assertions would catch a defect.

A behavior is protected only when the test layer can observe the failure it is
supposed to prevent. A unit test that replaces the relevant production module
graph with mocks is not evidence for module-load safety. A browser screenshot
without a behavioral assertion is not evidence for a working journey.

## Risk tiers

### Tier 0 — load-bearing

Examples:

- database bootstrap, migration, foreign-key integrity, idempotency, and
  exactly-once state transitions
- task, workflow, and schedule dispatch, claims, budgets, cancellation, resume,
  and failure recovery
- runtime catalog/target resolution plus real adapter/module-load boundaries
- Chat stream finalization, abort/reconcile behavior, permissions, and context
- Pack install/update/export ownership and licensing/privacy/trust boundaries
- CLI first run, upgrade, release artifacts, and critical operator journeys

Policy:

- 100% of agreed invariants and named failure modes map to an automated guard or
  a documented deterministic smoke that runs at the real boundary.
- No Tier-0 cell may be protected only by a test that mocks away the failure
  boundary.
- Deterministic pure/business modules target at least 90% line and 80% branch
  coverage. Adapters and process/browser boundaries use contract/fake-transport
  coverage plus required real smoke instead of chasing unreachable SDK lines.
- Nil, empty, upstream-error, concurrency, retry, partial-write, and recovery
  paths are explicit members of the matrix.
- A required runtime lane that silently skips is a missing guard, not a pass.

### Tier 1 — high-risk product logic

Examples include validators, API mutations, table transformations, usage/cost
rollups, profile/blueprint resolution, settings mutations, and Pack view-model
resolution.

Policy:

- Every accepted behavior and named failure state has a deterministic test at
  the lowest reliable layer.
- The diagnostic target is at least 80% line and 70% branch coverage.
- Boundary validation and visible named failures matter more than getter/setter
  or framework plumbing coverage.

### Tier 2 — interaction and presentation

Examples include React components, hooks, navigation, responsive state, and
accessibility behavior.

Policy:

- Test user-visible behavior, accessible roles/names, keyboard interaction,
  loading/empty/error/populated states, and mutation failure recovery.
- Use jsdom component tests for deterministic DOM contracts; use a real browser
  for CSS, focus, layout, browser APIs, and critical multi-surface journeys.
- Coverage percentages are informative, not a release gate by themselves.
- Generated shadcn primitives and declarative/type-only files may be excluded
  when shared integration tests protect Relay's custom behavior.

## Test layers and ownership

| Layer | Owns | Must not be used as a substitute for |
|---|---|---|
| Pure unit | parsers, resolvers, validators, calculations, state machines | database constraints, module graphs, browser behavior |
| Integration | real SQLite/filesystem, API boundaries, Pack round trips | competing processes, real providers, customer journey |
| Contract/fake transport | SDK payloads, runtime/provider error mapping | real module loading, credentials, executable discovery |
| Runtime smoke | real Next process, task dispatch, module graph, provider lane | broad combinatorial unit coverage |
| Browser/component | user-visible interaction, focus, CSS/browser APIs | data integrity or scheduler concurrency |
| Customer-identical staging | packaged first run, install/upgrade/release journey | fast per-change feedback |

Tests live next to the source in `__tests__/`. The default Vitest matrix has
three explicit projects: Node for server, database, API, CLI, filesystem, and
pure logic; jsdom for React components, hooks, and component-level integration;
and pinned headless Chromium for a deliberately small compiled-CSS/browser-state
slice. `npm run test:projects` fails if any default test is missing or collected
by more than one project. Server-dependent E2E remains a separate command and
configuration. A test belongs in the default suite only if it can run
hermetically without an already-running Relay server or live credentials.

Use `@testing-library/user-event` with semantic role/name queries in jsdom when
the event sequence matters. Use `vitest/browser` locators, CDP-backed
interactions, and retriable `expect.element`/`expect.poll` assertions for real
browser checks; do not replace those with direct event dispatch. Browser tests
are reserved for computed CSS, focus, layout, and browser APIs, not a duplicate
of every component test.

`npm run test:runtime-graph` is the credential-free Tier-0 runtime control. It
copies current source into a disposable repo-local project shell, starts a local
fake Ollama transport and a real isolated Next development process, then
executes a task, one-step workflow, and Chat SSE turn through public routes. It
asserts requested/effective runtime parity, task start/completion logs, workflow
child completion, durable Chat finalization, diagnostics telemetry, and absence
of the TDR-032 initialization-cycle signature. The Next child inherits only an
allowlist of non-secret process essentials and uses fixture-owned Unix, Windows,
and XDG profile roots. The fake replaces only the remote transport; it never
replaces Relay modules. A source-wide syntax guard also rejects alias or relative
static imports, side-effect imports, and re-exports of
`@/lib/chat/ainative-tools` anywhere in production agent code while allowing the
required function-local dynamic import.

## Coverage interpretation

`npm run test:coverage` explicitly includes production TypeScript under `src`
plus the shipped `bin/cli.ts`. This is required because Vitest 4 otherwise
reports only modules imported by the run, making completely untested files
invisible. Test infrastructure/declarations and three Next shell files
(`layout.tsx`, `error.tsx`, and `global-error.tsx`) are named exclusions; shared
UI primitives are not blanket-excluded.

Coverage reviews must state:

1. included and excluded source patterns
2. line, branch, function, and statement totals
3. zero-covered files in Tier 0/1
4. whether tests were green, red, or skipped
5. whether mutation/fault injection confirms assertion strength

Run `npm run test:coverage` immediately before `npm run test:audit -- --json`.
The audit command reads `coverage/coverage-summary.json` and applies committed,
independent risk-surface prefix groups so the reported matrix is reproducible.

Do not raise a global threshold merely to make a dashboard green. Add path/risk
thresholds only after the corresponding invariant matrix is green and the
baseline suite is deterministic.

## Pull-request and release execution contract

`npm run quality:gate -- --profile pr --base <sha> --head <sha>` is the local
equivalent of the always-on `Relay quality gate` pull-request check. The
workflow has no path filter: every pull request runs TypeScript, the default
CLI build before its bundled-CLI integration tests, the Vitest matrix under
all-source coverage, the coverage ratchet, the executable test audit,
deterministic hook/privacy/docs/Pack/token guards, and the real runtime graph.
Runtime smoke is always-on because the registry's transitive imports reach
beyond a reliably maintainable static path allowlist. A committed path policy
may only add harness-safety, mutation-strength, or Pack-compatibility lanes. A
missing/invalid diff fails closed.

Merge-group and tag-release qualification use the `release` profile and run
every conditional lane. Both profiles build the CLI before default coverage so
clean checkouts satisfy the bundled-CLI integration-test prerequisite. The tag
publish workflow calls the same reusable workflow and declares the external
publication job dependent on it. Its clean publication runner then rebuilds
artifacts and retains the customer-identical production `npx` smoke before
npm/GitHub writes. The fresh-clone macOS/Windows Node/npm matrix remains
separate because portability and install topology are not substitutes for the
default regression suite.

The coverage gate compares every eligible production path against
`coverage/coverage-summary.json` and applies committed Tier-0/Tier-1
no-regression floors as exact covered/total fractions. It uses cross
multiplication, so even a one-line regression that rounds to the same displayed
percentage fails. These are ratchets from an honest all-source baseline, not
target attainment claims. Low aggregate coverage cannot bypass a named runtime,
harness, mutation, Pack, fresh-clone, or packaged boundary. A required lane that
exits zero without its semantic receipt is a gate failure.

The shared workflow uses Node 22 and npm 11, matching the trusted-publish job;
the separate fresh-clone workflow retains Node 20/22 and npm 10/11 portability.
Quality execution is sequential and unsharded. Its local release budget is a
measured 12 minutes; it is checked after each lane completes and is not a claim
of local process-tree termination. The hosted job's 15-minute timeout is the
hard execution ceiling, including runner variance and excluding dependency
installation from the local receipt. Add caching/sharding only after recorded
timing exhausts the local budget.
The workflow installs the Chromium revision pinned by Playwright before the
quality contract; browser/provider package versions are exact dev dependencies.

The intended protected-branch check is `Relay quality gate`, with strict
up-to-date branch enforcement if the repository adopts required pull requests.
GitHub repository/ruleset changes are external operator actions. Do not claim
the check is merge-required until read-only inspection confirms the live rule.

## Isolation and reproducibility

- Test databases, homes, repositories, ports, clocks, and network/provider
  responses must be harness-owned and disposable.
- The default Vitest command replaces any inherited `RELAY_DATA_DIR` during
  global setup, before worker imports. It allocates one marked temporary root,
  gives each worker a distinct child directory, and removes only the root whose
  location, marker schema, and ownership nonce all match. Root removal runs in
  the parent process exit hook, after worker-held database handles close on
  Windows. Separately configured E2E/staging commands own any explicit
  external-data opt-in.
- `npm run test:harness-safety` executes a real-SQLite child suite with an
  inherited database sentinel, proves that directory remains byte-for-byte
  unchanged, and confirms the marked harness root is removed after workers
  exit.
- Tests must pass alone, in the normal order, and under at least one fixed
  shuffled seed before they are considered order-independent.
- Real concurrency claims require competing connections/processes or a barrier;
  two synchronous calls through one singleton are only an idempotency test.
- Schedule slot-claim coverage opens two SQLite connections in worker threads,
  releases them through one barrier beneath cap 1, and requires exactly one
  winner. This is the minimum evidence for the atomic claim invariant.
- Streaming provider controls require an explicit terminal frame. Text followed
  by EOF, malformed trailing data, or an empty/nil body is a named failed turn,
  never a completed response inferred merely from receiving a delta.
- Quarantine requires a named trigger, owner, expiry, and replacement guard. A
  blanket “known failures” exception is not a quality policy.

## Pruning policy

A test may be removed or consolidated only when all of the following are true:

1. its invariant and historical regression provenance are identified
2. a retained test protects the same boundary with equal or stronger fidelity
3. before/after coverage does not lose the relevant path
4. mutation or deliberate fault injection still fails at the retained guard
5. the change reduces maintenance, flake, or measured runtime

Prefer parameterized contract suites and shared fixture builders when scenarios
are the same across providers. Preserve distinct tests when failures need
different recovery, transport, or user-facing evidence.

`npm run test:mutation-strength` is the bounded pruning gate. It copies current
source and the test configuration into a marked disposable project, passes only
non-secret process essentials plus fixture-owned Unix, Windows, and XDG profile
roots in each child's environment, and applies the committed exact-anchor
manifest. This is a trusted-test harness, not an OS filesystem sandbox: module
resolution uses the shared dependency tree, while mutation and cache writes are
directed to the disposable project. A required mutant counts as killed only
when Vitest fails on its named assertion; timeouts, signals, collection/setup
errors, unrelated failures, and ambiguous source anchors are harness errors.
The command requires a green baseline, seven named load-bearing kills, one
reviewed survivor control, byte-for-byte source restoration, an identical green
post-restoration matrix, and verified cleanup. An unexpected survivor prohibits
related pruning.

## Required evidence at goal completion

Every behavior-changing goal records one of:

- the existing named test that protects it
- a new lowest-reliable-layer regression test
- why automation is infeasible and the stronger deterministic guard used

Verification proceeds from targeted tests to impacted suite, static/schema
checks, real runtime smoke, browser evidence, broader suite, and packaged staging
as risk warrants. A red broader baseline is reported by exact before/after
comparison and groomed; it is never described as green.

Credentialed or billable provider smokes are explicit operator gates. They
supplement rather than replace the deterministic runtime-graph command and must
record the runtime, task ID, terminal status, and log evidence without exposing
credentials.

## Authoritative references

- [Vitest 4 migration and coverage include guidance](https://vitest.dev/guide/migration)
- [Vitest coverage configuration and thresholds](https://main.vitest.dev/config/coverage)
- [Vitest test projects](https://vitest.dev/guide/projects.html)
- [Vitest sequence shuffling](https://vitest.dev/config/sequence)
- [Testing Library guiding principles](https://testing-library.com/docs/)
- [Testing Library query priority](https://testing-library.com/docs/queries/about/)
- [Testing Library user-event](https://testing-library.com/docs/user-event/intro/)
- [Playwright testing best practices](https://playwright.dev/docs/best-practices)
- [GitHub Actions Node.js testing guidance](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)
