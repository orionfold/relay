---
title: Critical API mutation and execution route contracts
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md#G-070
dependencies: [e2e-test-automation, cross-provider-chat-runtime-contracts, workflow-engine, scheduled-prompt-loops]
---

# Critical API mutation and execution route contracts (G-070)

## Description

Relay has 186 API route modules, but risk is concentrated in a much smaller
set of mutation and execution boundaries. G-070 protects the first bounded
tranche at the public handler, real SQLite state, and dispatch boundary. It
does not generate a shallow test for every route or replace the deeper engine,
runtime, scheduler, and Chat suites that already protect provider protocols.

The contract is executable: a typed inventory names each selected method,
side effect, validation boundary, persistence or dispatch dependency, terminal
outcomes, and protecting tests. Tests invoke route exports with real requests,
preserve real database transitions, and stub only external provider or
long-running execution boundaries.

## User story

As an operator, I want Relay's load-bearing mutation routes to reject malformed
or conflicting requests without corrupting state, duplicating work, or hiding
dependency failures so that UI and automation clients can trust both the HTTP
outcome and the persisted receipt.

## Bounded route inventory

| Contract | Method and route | Risk | Owned effect | Required boundary evidence |
|---|---|---|---|---|
| Task create | `POST /api/tasks` | Tier 0 | task row | schema rejection, compatibility refusal, persisted happy path |
| Task execute | `POST /api/tasks/:id/execute` | Tier 0 | atomic running claim + dispatch | 404, invalid state, target refusal, duplicate claim, exact dispatch |
| Task resume | `POST /api/tasks/:id/resume` | Tier 0 | atomic resume claim + dispatch | missing/session/limit/state refusal, target rollback, happy path |
| Task cancel | `POST /api/tasks/:id/cancel` | Tier 0 | provider cancellation + cancelled row | 404, durable cancellation, named dependency refusal |
| Workflow launch | `POST /api/workflows/:id/execute` | Tier 0 | atomic active claim + run receipt | 404, target refusal, duplicate run, receipt persistence |
| Schedule fire | `POST /api/schedules/:id/execute` | Tier 0 | child task + slot + optional bypass receipt | 404, capacity cleanup, dispatch, force audit |
| Schedule control | `PATCH /api/schedules/:id` | Tier 1 | pause/resume/config update | malformed input, invalid transition, compatibility refusal, persisted update |
| Chat message stream | `POST /api/chat/conversations/:id/messages` | Tier 0 | message/usage/stream terminal | 400/404, success/error/EOF/throw, disconnect finalization |
| Chat permission response | `POST /api/chat/conversations/:id/respond` | Tier 0 | pending gate + message/permission state | malformed/invalid response, ownership, stale/active resolution |
| Ollama probe | `GET /api/runtimes/ollama` | Tier 1 | model discovery | configured endpoint, upstream status/transport error |
| Compatible-runtime probe | `GET /api/runtimes/openai-compatible/:runtimeId` | Tier 1 | model discovery | runtime allow-list, success identity, named upstream refusal |
| Runtime connection test | `POST /api/settings/test` | Tier 1 | provider health result | default/explicit dispatch, malformed request, readable dependency failure |

## Common boundary contract

1. Each inventory entry is unique by route and method, points to an exported
   handler, and names at least one existing protecting test.
2. JSON mutation bodies are validated before values are dereferenced or
   persisted. Malformed JSON and invalid shapes return a named 400 response.
3. Missing resources return 404 without dispatch or database mutation.
4. Invalid transitions, duplicate claims, incompatible profiles, and runtime
   capability refusals are visible 4xx outcomes and preserve prior state.
5. Successful task, workflow, and schedule claims are observable in SQLite
   before the route exposes success; fire-and-forget execution is stubbed only
   after that owned state boundary.
6. Duplicate task/workflow/schedule requests cannot create two authoritative
   claims, runs, or child tasks for one accepted operation.
7. Chat terminals retain the G-072 provider contract. Permission responses may
   update only messages owned by the conversation in the route path.
8. Runtime probes never call an unselected provider, never hide upstream
   status/transport failures, and retain configured endpoint identity.
9. Partial refusal leaves no orphan child task, run receipt, or unauthorized
   cross-conversation message mutation.

## Technical approach

- Add a typed test-side inventory and an executable uniqueness/completeness
  guard rather than adding production routing metadata.
- Add adjacent route tests for the uncovered boundaries. Use the real Relay
  database and existing schemas; mock only external providers and background
  dispatch after the route's persistence responsibility is complete.
- Strengthen existing task/workflow/schedule/Chat tests instead of replacing
  their deeper engine tests or introducing a universal route harness.
- Add narrow Zod request schemas where route code currently trusts untyped JSON
  and add ownership checks at the Chat permission boundary.
- Record baseline and final tranche coverage separately from the global API
  percentage. The global ratchet remains a guard, not the goal.

## Acceptance criteria

- [x] A typed, executable inventory covers exactly the 12 selected route-method
      contracts with unique IDs, risk, side effect, validation/dependency,
      terminal outcomes, and existing guard paths.
- [x] Task create/execute/resume/cancel route tests prove named validation,
      missing-resource, invalid-state, dependency-refusal, durable-state, and
      double-submit behavior without calling a live provider.
- [x] Workflow launch tests prove target refusal preserves draft state and a
      successful atomic claim creates exactly one incremented run receipt;
      duplicate launch is refused.
- [x] Schedule fire/control tests prove capacity cleanup, force audit, child
      dispatch, malformed input, legal and illegal transitions, compatibility
      refusal, and no unintended mutation.
- [x] Existing Chat stream tests plus new permission-response tests cover 400,
      404, success, provider error, unexpected EOF/throw, disconnect, stale and
      active resolution, persisted permission, and conversation ownership.
- [x] Ollama, compatible-runtime, and Settings probe tests cover explicit
      provider selection, configured endpoints, malformed input, upstream
      status/transport errors, and readable dependency failures.
- [x] The selected tranche's line and branch coverage materially improve from
      the recorded 24.52% / 14.67% baseline without weakening deeper tests.
- [x] Focused and shuffled tests, TypeScript, test-project membership, coverage
      ratchets, mutation strength, runtime-module-graph smoke, production build,
      and the release quality profile pass without live credentials.

## Scope boundaries

Included:

- The 12 route-method pairs in the inventory table.
- Boundary validation and data-integrity fixes directly exposed by the tests.
- Real SQLite assertions, deterministic dispatch stubs, and fault injection.

Excluded:

- Blanket coverage of all 186 API route modules or a global percentage target.
- Authentication or multi-tenancy behavior Relay does not currently provide.
- G-071 workflow recovery semantics beyond launch claim and run receipt.
- Live provider credentials, customer LAN topology, new CI services, or test
  pruning.

## Verification receipt — 2026-07-14

- The executable inventory guards exactly 12 unique route-method contracts and
  verifies the exported handler plus every adjacent regression file.
- The focused route suite passed 62 tests across 14 files. Targeted tranche
  coverage increased from 24.52% lines / 14.67% branches to 68.78% lines /
  60.47% branches. The original instrumented baseline omitted the unchanged
  schedule-fire handler; its 22/28 lines and 12/12 branches are included in the
  corrected baseline above.
- The fixed-seed shuffled API suite passed 237 tests across 52 files, and the
  project-membership audit reported 337 Node, 102 jsdom, and one browser file.
- The release quality profile passed all 19 lanes: 440 test files, 3,383 tests
  passed plus one intentional skip, all 11 coverage ratchets, 7/7 required
  mutants, the real Ollama/LiteLLM/LM Studio runtime graph, and the CLI bundle.
  Global API route coverage moved from the preceding 17.51% lines / 13.59%
  branches receipt to 22.30% / 19.54%.
- The production Next.js build passed. Its 40 broad dynamic-path/Turbopack NFT
  warnings pre-date this goal and did not affect the build. No live credentials,
  customer topology, provider call, browser change, or external write was used.

## Rescue and rollback

- If one shared fixture couples unrelated domains, keep the typed inventory and
  split tests by route family; do not build a universal mocked application.
- If a test requires replacing the internal integration the route exists to
  prove, move the assertion to the real SQLite boundary or retain the existing
  deeper integration test as the named guard.
- If a discovered behavior change has multiple valid product answers, stop at
  the failing regression and request operator direction rather than encoding a
  new semantic policy.
- Validation and ownership hardening are independently reversible; the
  inventory and regression evidence should remain even if behavior is rolled
  back.

## References

- Goal: `_IDEAS/backlog.md` G-070
- Provider terminal contract: `features/cross-provider-chat-runtime-contracts.md`
- Quality gate: `scripts/quality-gate.mjs`
- Audit inventory: `scripts/test-audit.mjs`
