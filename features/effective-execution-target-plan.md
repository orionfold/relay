# G-056 implementation plan

**Specification:** `features/effective-execution-target.md`

**Status:** completed 2026-07-14

## Scope challenge

- **REDUCE:** fix only Ollama's phantom model. Rejected because it leaves the
  reported silent runtime substitution and workflow drift intact.
- **PROCEED as-is:** one shared target contract, two preview routes, two detail
  integrations, receipt parity, and bounded shortcuts. Selected.
- **EXPAND:** add Chat, schedules, and a general provider marketplace. Deferred
  to G-072/G-069 because they add distinct contracts and operator gates.

## What already exists

Reuse `resolveTaskExecutionTarget`, task target columns, workflow child tasks,
runtime catalog labels/features, `resolveOllamaModel`, task detail surfaces, the
workflow pattern router/header, and `test:runtime-graph`.

## Specification and acceptance mapping

1. **Resolver contract:** add selection mode/reason, concrete model resolution,
   named capability failures, and explicit-runtime no-fallback behavior.
   Covers Manual, explicit override, capability, model, and resume criteria.
2. **Workflow preflight:** resolve non-delay steps using one precedence helper;
   call before workflow claim; use the same requested runtime for child task
   persistence and dispatch. Covers workflow preview/precedence/state claim.
3. **Preview APIs/UI:** add task/workflow target endpoints and a shared compact
   detail component. Covers pre-run visibility and responsive/accessibility.
4. **Receipt/settings parity:** persist effective model before dispatch, make
   Ollama honor it, and stop provider summary from inventing `llama3`.
5. **Regression and smoke:** protect the matrix and prove the real module graph.

## Vertical slices

### Slice 1 — target resolver and errors

- Update `src/lib/agents/runtime/execution-target.ts` and adjacent tests.
- Add a zero-import client/server response contract.
- Confirm explicit unavailable/incompatible targets block; automatic routing
  remains healthy-candidate selection; Manual uses only the default.

### Slice 2 — workflow parity

- Add `src/lib/workflows/execution-targets.ts` with precedence and preview.
- Preflight in `POST /api/workflows/[id]/execute` before reset/claim.
- Make `executeChildTask` persist and dispatch the same requested runtime.

### Slice 3 — preview surfaces

- Add task and workflow target GET routes.
- Add a shared target preview panel to task detail/page sheet and workflow
  header. Keep it compact and tokenized.
- Route direct workflow list/Kanban run shortcuts to detail review before run.

### Slice 4 — model and receipt truth

- Resolve the task model in the target contract.
- Persist it before adapter launch and have Ollama honor the persisted model.
- Return an empty Ollama default when none is saved.

## Regression test budget

- Extend `execution-target.test.ts`: Manual/default, explicit healthy,
  explicit unavailable, explicit incompatible, filesystem capability,
  automatic candidate filtering, model resolution, resume.
- Add workflow target helper tests: precedence, delay exclusion, named step
  failure, multi-step output.
- Add route tests for task/workflow preview and workflow execute pre-claim block.
- Add component tests for loading, ready explicit/manual/automatic, blocked, and
  multi-step rendering.
- Update provider settings route/component fixtures for empty Ollama default.
- Run focused tests, impacted workflow/task suites, TypeScript, design-token and
  cursor guards, `npm run test:runtime-graph`, and live browser checks at desktop
  and 390px in light/dark.

## Error & Rescue Registry

Use the registry in the authoritative specification. Additionally, if the real
runtime smoke exposes a module cycle, scrap any new static runtime-graph import
and move the dependency behind a dynamic `await import()` inside the resolver.

## Rescue and rollback

- Resolver/API/UI slices are independently revertible; no schema migration.
- If preview probes make status polling expensive, keep previews on dedicated
  routes and fetch only while a run-capable detail is visible.
- If concrete model resolution cannot be shared without adapter drift, persist
  the adapter-reported model and block completion until the preview explicitly
  labels model as “resolved at launch”; do not display a guessed model.

## NOT in scope

Same exclusions as the specification: Chat fallback, schedules, new providers,
new model-picker schema, public trust copy, and customer-LAN validation.
