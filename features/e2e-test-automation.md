---
title: E2E Test Automation
status: completed
priority: P2
milestone: post-mvp
layer: Runtime Quality
dependencies:
  - provider-runtime-abstraction
  - workflow-engine
  - agent-profile-catalog
---

# E2E Test Automation

## Summary

An automated API-level E2E test suite that exercises task execution, workflow patterns, and cross-runtime behavior — replacing manual browser-based testing with repeatable, CI-ready test runs.

## Problem

ainative's current E2E testing is entirely manual — a human drives Chrome, creates tasks, executes them, and visually verifies results (see `output/done-agent-e2e-test-report.md`). This produced a solid 10/10 pass rate but:

1. **Not repeatable**: Each test run requires ~30 minutes of human attention
2. **Not in CI**: No automated regression detection — regressions are only caught when someone manually re-runs the full suite
3. **Incomplete coverage**: Codex runtime was only tested for single tasks, not workflows (sequences, parallel, blueprints)
4. **Fragile**: Results depend on the tester's browser state, active sessions, and manual observation

## User Story

As a developer shipping changes to the runtime or workflow engine, I want to run `npm run test:e2e` and get automated pass/fail results for all execution paths so that I can catch regressions before they reach production.

## Solution

### Test Architecture

API-level tests that call ainative's HTTP endpoints directly (no browser automation). Tests use a dedicated test project and sandbox directory, similar to the manual E2E report setup.

### Test Matrix

| Category | Tests | Runtimes | Coverage |
|----------|-------|----------|----------|
| Single task execution | 3 (one per profile) | Claude + Codex | Profile output differentiation |
| Sequence workflow | 1 | Claude + Codex | Step ordering, context passing |
| Parallel workflow | 1 | Claude + Codex | Branch concurrency, synthesis |
| Blueprint instantiation | 1 | Claude | Variable resolution, gallery |
| Permission flow | 1 | Claude | Tool approval persistence |
| Context proposals | 1 | Claude | Self-improvement lifecycle |
| Cross-runtime comparison | 1 | Both | Same task, both runtimes |

Total: ~10 tests × 2 runtimes where applicable = ~15 test cases.

### Test Infrastructure

- **Vitest E2E project**: Separate config (`vitest.config.e2e.ts`) with longer timeouts (120s per test), sequential execution, and environment setup/teardown
- **Test helpers**: Shared utilities for project/task creation, execution polling, result assertion
- **Sandbox management**: Auto-create and clean up test sandbox directory per run
- **Runtime availability**: Tests skip gracefully if a runtime isn't configured (e.g., no Codex API key)

### Codex Workflow Coverage (Rec 4 folded in)

The manual E2E report only tested Codex for single tasks. This suite explicitly includes:
- Codex sequence workflow (step ordering through Codex runtime)
- Codex parallel workflow (branch execution via Codex)
- Cross-runtime workflow (mixed Claude + Codex steps in one workflow)

## Acceptance Criteria

- [ ] `npm run test:e2e` runs the full suite and reports pass/fail
- [ ] Single task tests cover all 4 built-in profiles (general, code-reviewer, document-writer, researcher)
- [ ] Sequence workflow test verifies step ordering and context passing
- [ ] Parallel workflow test verifies branch concurrency and synthesis
- [ ] Blueprint test verifies variable resolution and multi-step execution
- [ ] Tests run against both Claude and Codex runtimes (skip if unconfigured)
- [ ] Codex workflow tests cover sequence and parallel patterns (Rec 4)
- [ ] Test sandbox is automatically created and cleaned up
- [ ] Tests can run in CI with appropriate API key secrets
- [ ] Execution polling has configurable timeout (default 120s)
- [ ] Test results include execution time per test for performance tracking

## Scope Boundaries

### In Scope

- API-level E2E tests (HTTP calls to `/api/*` endpoints)
- Task execution, workflow execution, blueprint instantiation
- Cross-runtime coverage (Claude + Codex)
- Test infrastructure (helpers, sandbox, config)
- CI-ready test runner (`npm run test:e2e`)

### Out of Scope

- Browser/UI E2E tests (Playwright, Cypress) — API-level is sufficient
- Performance benchmarking (execution time is logged but not asserted)
- Cost assertions (usage metering is tested separately)
- Testing third-party LLM output quality (only structure and completion)

## Technical Approach

### Key Files

| File | Action | Purpose |
|------|--------|---------|
| `vitest.config.e2e.ts` | Create | E2E-specific vitest config with long timeouts |
| `src/__tests__/e2e/setup.ts` | Create | Test project + sandbox creation/teardown |
| `src/__tests__/e2e/helpers.ts` | Create | Shared utilities: create task, poll execution, assert result |
| `src/__tests__/e2e/single-task.test.ts` | Create | Single task execution across profiles and runtimes |
| `src/__tests__/e2e/sequence-workflow.test.ts` | Create | Sequence workflow with step ordering verification |
| `src/__tests__/e2e/parallel-workflow.test.ts` | Create | Parallel workflow with branch concurrency verification |
| `src/__tests__/e2e/blueprint.test.ts` | Create | Blueprint instantiation and execution |
| `src/__tests__/e2e/cross-runtime.test.ts` | Create | Same task on both runtimes, result comparison |
| `package.json` | Modify | Add `test:e2e` script |

### Test Execution Flow

```
1. setup.ts: Create test project + sandbox directory
2. For each test:
   a. POST /api/tasks — create task with specific profile/runtime
   b. POST /api/tasks/{id}/execute — fire execution
   c. Poll GET /api/tasks/{id} until status = completed/failed (timeout: 120s)
   d. Assert: status, result content structure, expected outputs
3. teardown: Delete test project, clean sandbox
```

### Runtime Availability Detection

```typescript
const CLAUDE_AVAILABLE = await checkRuntime('claude-code');
const CODEX_AVAILABLE = await checkRuntime('codex');

// Tests use describe.skipIf(!CODEX_AVAILABLE) for Codex-specific tests
```

## References

- **Origin**: internal Agent E2E Test Report, Recommendations #3 and #4
- **Rec 3**: "This manual browser test should be automated using the ainative API directly for CI/CD"
- **Rec 4**: "Run sequence/parallel/blueprint tests on Codex runtime for cross-runtime workflow coverage" (folded into this feature)
- **Existing tests**: `src/**/__tests__/` — 30+ unit/component tests via Vitest
- **Test conventions**: `__tests__/` subdirectories adjacent to source, Vitest runner
