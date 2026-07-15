# G-070 implementation plan — critical API route contracts

Authoritative specification: `features/critical-api-route-contracts.md`

## Scope challenge

The repository contains 186 API route modules, but G-070 is intentionally
limited to 12 route-method pairs. Existing engine and provider tests remain
authoritative below the route. No generic request harness, auth system, hosted
service, or blanket route-test generation is justified.

## Affected surfaces

- Typed quality inventory under `src/test/` and its executable API test.
- Task create/execute/resume/cancel handlers and adjacent tests.
- Workflow execute and schedule execute/control adjacent tests.
- Chat permission-response validation/ownership and existing message-stream
  guards.
- Ollama, OpenAI-compatible, and Settings runtime probe handlers/tests.
- Feature roadmap, changelog, G-070 ledger, and quality-manager guidance.

## Vertical slices

1. **Inventory and baseline** — record the 12 contracts; fail on duplicate,
   missing route export, or missing guard; retain the 24.52% line / 14.67% branch
   pre-change tranche receipt.
2. **Task lifecycle** — protect create, execute, resume, and cancel with real
   rows, atomic/invalid transitions, target refusal, durable result, and
   background dispatch isolated after the claim.
3. **Workflow and schedule** — prove one workflow run receipt, duplicate
   refusal, schedule capacity cleanup/force audit, and validated pause/resume.
4. **Chat and probes** — keep G-072 stream coverage; validate and scope
   permission responses; protect configured provider discovery and readable
   health failures.
5. **Closure** — compare tranche coverage, run shuffled/focused/full quality,
   perform two-pass review and Ship Verification, update product records, and
   commit all goal-owned Relay changes.

## Regression-test budget

- One inventory test file.
- Adjacent route tests only for the six zero-coverage surfaces plus task
  lifecycle and schedule/workflow strengthening.
- Prefer parameterized failure matrices inside a route family; do not create
  one test per implementation line.
- Retain real SQLite. Mock only provider transport, background engine dispatch,
  and nondeterministic discovery after validating call identity.

## Broader verification

- Focused tranche suite with random sequence seed and final targeted coverage.
- `npm run test:projects`, TypeScript, diff checks, and coverage policy.
- Release quality profile, including runtime-module-graph and mutation lanes.
- Production Next.js and CLI builds. No browser run is required because the
  change has no visual surface and the route contract is deterministically
  exercised below HTTP serialization.

## Rescue and rollback

- Split domain fixtures when shared cleanup or mocks leak state.
- Keep route-owned persistence real; if a provider cannot be deterministic,
  stub at its transport/dispatch boundary and cite its existing deeper test.
- Stop for operator direction if a failing regression exposes a product policy
  choice rather than an unambiguous validation or integrity defect.
- Roll back narrow handler hardening independently; preserve inventory/tests as
  evidence of the contract that would be lost.
