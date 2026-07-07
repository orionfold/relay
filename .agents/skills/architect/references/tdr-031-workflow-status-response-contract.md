---
id: TDR-031
title: Workflow status API is a pattern-discriminated union; consumers branch before reading
status: accepted
date: 2026-04-09
category: api-design
---

# TDR-031: Workflow status API is a pattern-discriminated union; consumers branch before reading

## Context

`GET /api/workflows/[id]/status` powers the workflow detail page and any future consumer that needs live workflow progress. The route already returns structurally different payloads depending on `definition.pattern`:

- **loop** (`src/app/api/workflows/[id]/status/route.ts:101-118`) returns raw step definitions (`steps: definition.steps`) with no wrapping `state` field, plus a top-level `loopState` carrying the real iteration progress from `LoopState.iterations[]`.
- **sequence / parallel / swarm** (`route.ts:120-138`) wraps every step with `.state` synthesized from `WorkflowState.stepStates[i]`, and exposes a top-level `workflowState` but no `loopState`.

The default branch additionally includes `resumeAt` (for delay-pattern pauses); the loop branch does not. This is an implicit polymorphic response. It was never codified, and the consumer type in `src/components/workflows/workflow-status-view.tsx:43-58` declares `StepWithState.state` as **required** — a single flat shape that silently lies about loop responses.

PR manavsehgal/ainative#6 was filed on 2026-04-09 after a production crash: `completedStepOutputs` in `workflow-status-view.tsx:404-406` dereferenced `s.state.result` unconditionally, and the React error boundary caught the resulting `TypeError` on every loop-pattern workflow (the entry point table enrichment uses today). The hotfix added optional chaining. The root cause — the unwritten rule that consumers must branch on `pattern` before reading step state — was never documented, so neither the original author nor PR #6 had a contract to enforce.

This pattern (one route, multiple shapes keyed on a discriminator) will recur. The workflow engine already has four patterns (sequence, parallel, loop, swarm), a DAG pattern is plausible, and the heartbeat and schedule engines may add their own. Without a codified contract, the next pattern added will repeat the same trap.

## Decision

The workflow status API response is a **TypeScript discriminated union keyed on `pattern`**. The contract has four parts, all mandatory:

1. **Single exported union type.** `src/lib/workflows/types.ts` exports `WorkflowStatusResponse` as a discriminated union. One arm per supported pattern. Pattern-specific fields (`loopState`, `workflowState`, `resumeAt`, wrapped-vs-raw `steps`) live only on the arms that actually produce them. The route handler's return type is this union; the consumer's prop/state type is this union; no intermediate type widening is permitted.

2. **Branch before read.** Any consumer that reads pattern-specific data **must** narrow on `response.pattern` first. This includes derived computations (e.g., `completedStepOutputs`), memoized selectors, effect dependencies, and render branches. No consumer may touch `response.steps[i].state` without having already confirmed it is on a non-loop arm of the union. The TypeScript compiler enforces this — if the consumer can dereference without narrowing, the type is wrong, not the consumer.

3. **Pattern-specific rendering lives in pattern-specific components.** The top-level `WorkflowStatusView` is a thin router: it owns data fetching and error handling, and dispatches to a pattern-specific subview based on `data.pattern`. Cross-pattern derived computation above the dispatch is banned. Each subview is free to assume its arm of the union and read pattern-specific fields without further narrowing.

4. **New-pattern checklist.** Adding a new workflow pattern (e.g., DAG) is a four-step commit, in order:
   - Add a new arm to `WorkflowStatusResponse` in `src/lib/workflows/types.ts` with the pattern's actual fields. No reuse of another arm's shape unless the fields are truly identical.
   - Add a new branch in `src/app/api/workflows/[id]/status/route.ts` that returns a payload whose type satisfies the new arm. Do not emit fields that are not on the arm.
   - Add a pattern-specific subview under `src/components/workflows/views/` that consumes only the new arm.
   - Add the new arm's discriminator value to the router's dispatch in `workflow-status-view.tsx`. TypeScript's exhaustiveness check on the discriminator flags any pattern the router forgot.

This TDR does not cover WebSocket or SSE variants of the status API. If a streaming status endpoint is added in the future, it inherits the same discriminated-union contract for its payload shape.

## Consequences

- **Crashes become compiler errors.** The class of bug PR manavsehgal/ainative#6 fixed — blind dereference of a pattern-specific field — is caught at build time. A future engineer writing `data.steps[i].state.result` without narrowing gets a red squiggle, not a production error boundary.
- **The top-level view shrinks.** `workflow-status-view.tsx` today is 895 lines of mixed data fetching, derived computation, sequence rendering, parallel rendering, loop dispatch, swarm dispatch, and sheet dialogs. The router split (tracked in the `workflow-status-view-pattern-router` feature spec) brings it under 80 lines. Each subview is independently testable and independently rewritable.
- **Loop outputs become first-class.** Today `completedStepOutputs` returns `[]` for loop workflows — correct by accident, wrong by design, because `loopState.iterations[].result` holds the actual outputs. The loop subview is free to read iterations directly and surface them in the Full Output sheet.
- **Adding a new pattern is cheaper.** The four-step checklist is explicit and enforced by the type system. No one has to remember that "also update this computation above the branch."
- **Short-term cost.** The normalization + router split touches the status route, the view, the types, and may require new hooks for shared polling. This is a 4–6 file refactor, not a one-line change. The short-term hotfix (PR #6) buys time; the spec ships the permanent fix.
- **Constraint on ad-hoc consumers.** Any future chat tool, SSE consumer, or analytics probe that reads the status endpoint must also branch on `pattern`. This is enforced by the union type — they cannot compile otherwise. The marginal cost per consumer is a single discriminator check.

## Alternatives Considered

**A. Keep PR #6's optional chaining, add no types.** Pros: two-line diff, already written. Cons: the `StepWithState.state` type still lies, the same bug reappears the moment any other consumer reads `.state`, and `completedStepOutputs` continues returning empty arrays for loop workflows because the UI never reads `loopState.iterations`. Rejected — this is a defect incubator, not a fix.

**B. Normalize the API to a single shape.** Always wrap loop steps with synthesized state from `loopState.iterations[i]`, so all patterns share one `steps[].state` shape and consumers never need to branch. Pros: single code path in the consumer. Cons: loop iterations are not 1:1 with step definitions (a loop step runs once per item in `loopConfig.items`, so there is no `iterations[i]` for step index `i`), so the mapping is lossy and will misrepresent progress. Also erases the genuine semantic difference between "the workflow has steps whose state is these values" and "the workflow has one step template being iterated over this collection." Rejected — lossy data model to preserve a uniform shape is the wrong trade.

**C. Pattern-specific API routes.** Split into `GET /api/workflows/[id]/status/loop`, `.../sequence`, etc. Pros: no polymorphism at all. Cons: the consumer has to know the pattern before it calls the API, which means a second round-trip or prefetched metadata. Also fragments a conceptually single read operation into N routes, each needing its own test surface. Rejected — the discriminated union gives the same type safety without the routing complexity.

**D. Runtime validation with Zod on the client.** Validate the response against a Zod union at the fetch boundary, narrowing from there. Pros: runtime-verified, catches server drift. Cons: adds a dependency on Zod in the client path just for this route, and still needs the TypeScript union type underneath. The TypeScript discriminated union is sufficient as long as the route handler and the consumer share the exported type. Zod validation can be added later if server drift becomes a real problem. Rejected for now — solves a problem we don't have.

## References

- `src/app/api/workflows/[id]/status/route.ts:101-138` — current polymorphic response (loop branch vs default branch).
- `src/components/workflows/workflow-status-view.tsx:43-58` — `StepWithState` interface with required `state` (the type that lies).
- `src/components/workflows/workflow-status-view.tsx:404-406` — `completedStepOutputs` crash site, patched by PR #6.
- `src/components/workflows/workflow-status-view.tsx:513,522` — existing loop branches in the view, sitting below the unconditional computation at line 404 (ordering bug).
- `src/components/workflows/loop-status-view.tsx` — existing pattern-specific renderer that reads `loopState.iterations[]` correctly; becomes the inner component of the loop subview.
- `src/lib/workflows/types.ts:105-124` — `IterationState` and `LoopState` types; reusable as-is for the loop arm of the union.
- PR manavsehgal/ainative#6 — hotfix that surfaced the drift.
- `features/workflow-status-view-pattern-router.md` — feature spec tracking the implementation of this TDR.
- TDR-003 (API design) and TDR-004 (Server Components for reads) — adjacent API-layer decisions; this TDR does not supersede either.
