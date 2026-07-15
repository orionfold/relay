---
title: Risk-tiered pull-request and release quality gate
status: completed
goal: G-065
date: 2026-07-14
---

# Risk-tiered pull-request and release quality gate

## Outcome

Relay has one executable quality contract shared by local development, every
pull request, merge-queue checks, and tag-release qualification. The contract
runs the default suite with all-production-source coverage, TypeScript, static
and audit guards, and the credential-free load-bearing controls selected by a
committed changed-path policy. Tag publication cannot start until the release
profile passes. Fresh-clone portability and packaged customer simulation remain
separate required boundaries rather than being mislabeled as unit coverage.

## Goal Contract

- **Outcome:** make the accepted regression strategy executable and difficult
  to bypass before merge or publication.
- **Constraints:** no new dependency or hosted service; no live provider,
  credential, or customer data in untrusted pull-request jobs; no path filter on
  the required workflow; no low global percentage presented as Tier-0 safety;
  no sharding until timing evidence requires it; preserve the fresh-clone matrix
  and packaged `npx` smoke as distinct jobs.
- **Executable verification:** policy/unit tests, workflow contract tests,
  deliberate lane-failure/evidence-missing/coverage-regression controls, a
  clean local PR plan and full release-profile replay, the always-on real
  runtime smoke, and independent review.
- **Operator gates:** live GitHub ruleset/branch-protection mutation; any new
  service, dependency, secret, provider lane, or materially larger CI budget.
- **Stop/rescue:** if the credential-free release profile cannot finish inside
  12 minutes after two materially different repairs, preserve its receipt and
  return to the operator before adding cache/shard complexity or weakening a
  required lane.

## Profiles and required lanes

### Pull request

Every pull request runs one stable `Relay quality gate` job without workflow
path filtering. It always runs:

- TypeScript compilation
- the bundled CLI build before integration tests that execute `dist/cli.js`
- the default Vitest matrix under V8 coverage (same include/exclude contract as
  `npm test`)
- an all-source denominator check and committed per-risk-surface ratchet floors
- test-audit topology checks
- hook, public-boundary, documentation-link, Pack-taxonomy, Pack-tarball, and
  design-token deterministic guards
- the real runtime-module-graph smoke, because the runtime registry's transitive
  dependency graph is wider than a safe static path allowlist

Changed paths may only add lanes:

- test-harness safety for test configuration/global setup and harness code
- mutation strength for its manifest/runner and seven protected chokepoints
- Pack compatibility for Pack contract/manifests and compatibility policy

Unknown paths receive the always-on contract. Missing or invalid diff evidence
is a failure, never a reason to run fewer checks.

### Merge queue and release

Merge-group and release profiles conservatively run every conditional lane.
Both profiles build the bundled CLI before coverage so a clean checkout meets
the default integration suite's artifact prerequisite. The tag publish workflow
calls the same reusable workflow and declares publication dependent on it. The
publish job still rebuilds artifacts in its own clean runner and then performs
the existing production build and customer-identical `npx` smoke before its
external npm/GitHub writes.

## Coverage contract

Coverage must contain every eligible production `.ts`/`.tsx` file under `src`
and `bin`, excluding only the named test infrastructure, declaration, and three
Next shell files already approved in `vitest.config.ts`. The gate fails on any
missing eligible path.

The committed risk floors are a **no-regression ratchet**, not adequacy claims.
They preserve the fresh G-068 all-source baseline for DB, workflows, schedules,
runtime adapters, agents, Chat, Packs, licensing, instance bootstrap, desktop
artifact helpers, and API routes. Tier-0 gaps remain explicit and are protected
by named runtime/harness/mutation/customer smokes; a low repository-wide number
cannot substitute for those controls. Tier-2 component coverage remains
diagnostic under the accepted strategy.

## States and failures

| State | Meaning | Required behavior |
|---|---|---|
| planned | profile and changed paths resolve to an ordered lane list | print the plan before execution |
| passed | every required command exits zero and emits its positive evidence | emit a measured timing receipt |
| lane-failed | a required command exits non-zero | stop and name the lane/exit/signal |
| evidence-missing | command exits zero but its required semantic receipt is absent | fail as a silent-skip/control failure |
| coverage-regressed | eligible source is absent or a risk floor drops | fail with exact path/surface/metric |
| invalid-diff | PR base/head cannot be resolved or paths are unsafe | fail closed; do not infer a smaller plan |
| budget-exceeded | a completed local profile exceeds its committed measured budget | fail and seek rescue; never silently omit work |

The hosted workflow's 15-minute job timeout is the hard execution ceiling. The
local 10/12-minute profile budgets are measured after each lane completes; they
do not claim cross-platform process-tree containment. Runtime and mutation
controls retain their own bounded cleanup behavior.

## Acceptance criteria

- [x] `npm run quality:gate -- --profile pr --base <sha> --head <sha>` is the
      same executable contract used by the pull-request workflow.
- [x] The workflow runs for every pull request and `merge_group`, has no path
      filter, uses read-only contents permission, receives no secrets, and
      exposes one stable `Relay quality gate` check.
- [x] The publish workflow calls the release profile and cannot enter its
      publish job until that profile succeeds.
- [x] Default tests plus all-source coverage, TypeScript, static checks, and
      test-audit validation are always required.
- [x] A clean checkout builds the bundled CLI before default coverage executes
      the CLI environment integration tests.
- [x] Isolated runtime and mutation harnesses construct their projects only
      from tracked inputs and do not require ignored Next-generated files.
- [x] Path tests prove the runtime lane is always-on and harness, mutation, and
      Pack-compatibility lanes cannot be bypassed by any mapped production,
      test, policy, or workflow change; release and merge profiles include all.
- [x] Deliberate non-zero exit, signal/launch-error, missing semantic evidence,
      missing source, and lowered risk-floor controls fail with named reasons.
- [x] A fresh release-profile replay finishes within the 12-minute execution
      budget without sharding or a new cache/service and records lane timings.
- [x] Fresh-clone Node/npm portability remains a separate workflow; packaged
      `npx` production smoke remains after the shared release gate and before
      publication.
- [x] Independent review approves the policy, workflow security, failure
      semantics, coverage ratchet, release dependency, and rollback.
- [x] G-065 is removed from the strategy backlog and only goal-owned Relay
      changes are committed locally.

## Non-goals

- Raising weak surfaces to their long-term target in this goal.
- G-067's Node/jsdom/browser-project split or new browser dependencies.
- Credentialed provider execution on pull requests.
- Replacing the OS/npm fresh-clone matrix or production artifact smoke.
- Sharding, third-party coverage dashboards, or custom hosted runners.
- Applying a live GitHub ruleset without explicit external-write permission.

## Completion evidence

- The exact 18-lane release profile passed on Node 22.18.0/npm 11.6.0 in
  98,825 ms, including 415/415 default test files, 965/965 eligible coverage
  paths, runtime `stream.completed`, 7/7 mutation kills with restoration and
  cleanup, and a clean CLI build.
- Seventeen deliberate policy/workflow controls pass. They prove fail-closed
  diff handling, always-on transitive runtime coverage, exact-fraction coverage
  regression detection, positive semantic receipts, offline required scripts,
  and release dependency.
- Independent review approved the corrected lane policy, coverage ratchet,
  timeout semantics, workflow security, and rollback. Live GitHub merge
  enforcement remains pending its separate operator gate and is not claimed as
  enabled.

## Rollback

Revert the G-065 commit to remove the local runner, policy/coverage guard,
reusable workflow, publish dependency, tests, and documentation. The existing
fresh-clone and packaged publish-smoke implementations remain independently
callable. If a live required-check rule is later enabled, remove or update that
rule before reverting the workflow so merges do not remain pending.

## References

- [GitHub reusable workflow syntax](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)
- [GitHub required-check skip behavior](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks)
- [GitHub merge-group trigger requirement](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group)
