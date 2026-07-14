---
title: Workflow Status View Pattern Router
status: completed
priority: P2
milestone: post-mvp
source: legacy PR #6 + .claude/skills/architect/references/tdr-031-workflow-status-response-contract.md + features/architect-report.md
dependencies: [workflow-engine, autonomous-loop-execution, bulk-row-enrichment]
---

# Workflow Status View Pattern Router

## Description

The `GET /api/workflows/[id]/status` endpoint returns structurally different payloads depending on the workflow's pattern. Loop-pattern responses (used by table enrichment) return raw step definitions with no `state` wrapping plus a top-level `loopState` field. Sequence, parallel, and swarm responses wrap each step with computed `.state` from `WorkflowState.stepStates[i]` and expose `workflowState` and `resumeAt` instead. This has been true for as long as loop-pattern workflows have existed, but the contract was never codified. The consumer type in `workflow-status-view.tsx` declared a single flat `StepWithState` interface with `state` marked required — a type that has been silently lying to TypeScript since the day the loop branch was added.

On 2026-04-09 that lie caught up with us. `completedStepOutputs` at `workflow-status-view.tsx:404-406` dereferenced `s.state.result` unconditionally and threw a `TypeError` on every loop-pattern workflow, crashing the detail page into the React error boundary. Legacy PR #6 landed a 2-line optional-chaining hotfix the same day. The hotfix stops the crash but leaves the contract violation in place: the type still lies, any future consumer that reads `data.steps[i].state` without branching will crash again, and — worse, `completedStepOutputs` now silently returns `[]` for loop workflows so the Full Output sheet shows empty for every table enrichment run, even though `loopState.iterations[].result` holds the real per-iteration outputs.

This feature implements the durable fix as codified by [TDR-031](../.agents/skills/architect/references/tdr-031-workflow-status-response-contract.md): export a discriminated-union response type from `src/lib/workflows/types.ts`, normalize the route handler to return that union, and refactor the 895-line `workflow-status-view.tsx` god component into a thin router (<80 lines) that dispatches to pattern-specific subviews under `src/components/workflows/views/`. Shared polling moves into a new `use-workflow-status` hook. The final acceptance criterion removes the optional chaining PR #6 added, because by then the TypeScript compiler enforces the invariant. Adding a new workflow pattern (e.g., DAG) becomes a four-step commit with compile-time exhaustiveness checking instead of a trap waiting for the next unconditional `.state` access.

## User Story

As a developer adding a new workflow pattern to ainative, I want pattern-specific rendering to live in pattern-specific components with a type-enforced response contract, so that I cannot accidentally introduce crashes by adding fields to a shared `data.steps[]` shape and forgetting that one pattern's arm of the union does not have them.

## Technical Approach

**1. Discriminated union response type.** Add a new export to `src/lib/workflows/types.ts`:

```ts
export type WorkflowStatusResponse =
  | {
      pattern: "loop";
      id: string;
      name: string;
      status: string;
      projectId?: string | null;
      definition?: string;
      loopConfig?: LoopConfig;
      loopState: LoopState | null;
      steps: WorkflowStep[];          // raw step definitions, no state wrapping
      stepDocuments?: Record<string, DocumentInfo[]>;
      parentDocuments?: DocumentInfo[];
      runNumber?: number;
      runHistory?: RunHistoryEntry[];
      swarmConfig?: SwarmConfig;
    }
  | {
      pattern: "sequence" | "parallel" | "swarm";
      id: string;
      name: string;
      status: string;
      resumeAt: number | null;
      projectId?: string | null;
      definition?: string;
      swarmConfig?: SwarmConfig;
      steps: StepWithState[];         // wrapped with .state, always present
      workflowState: WorkflowState | null;
      stepDocuments?: Record<string, DocumentInfo[]>;
      parentDocuments?: DocumentInfo[];
      runNumber?: number;
      runHistory?: RunHistoryEntry[];
    };
```

`StepWithState` moves from `workflow-status-view.tsx:43-58` into `types.ts` alongside the union so it is importable by any consumer. `RunHistoryEntry` and `DocumentInfo` are also promoted to shared types. No other types change.

**2. Route handler returns the union.** `src/app/api/workflows/[id]/status/route.ts` keeps its two-branch shape but annotates each branch with `satisfies WorkflowStatusResponse` so the compiler verifies every field is on the corresponding arm. The loop branch (currently lines 101-118) is explicitly not allowed to emit `workflowState` or `resumeAt`; the default branch (120-138) is explicitly not allowed to emit `loopState`. Runtime behavior is unchanged — this is a type-only tightening that catches future drift at build time.

**3. Thin router for `workflow-status-view.tsx`.** The top-level view becomes a ≤80-line component whose sole job is: (a) call `useWorkflowStatus(workflowId)` to get `{ data, error, isLoading }`, (b) render loading/error states, (c) branch on `data.pattern` and dispatch to the correct subview with the narrowed arm of the union. All derived computation (`completedStepOutputs`, parallel root detection, synthesis step detection) moves into the relevant subview — nothing above the dispatch touches pattern-specific fields. The file keeps its current name and default export so existing imports (`import { WorkflowStatusView }` in the detail page) work unchanged.

**4. Pattern-specific subviews.** Two new files under `src/components/workflows/views/`:

- `loop-pattern-view.tsx` — consumes the loop arm of the union. Wraps existing `LoopStatusView` for iteration rendering. Owns loop-only affordances (stop, iteration count, loop-config surface). **Reads `loopState.iterations[].result` to populate the Full Output sheet** — this is the fix for the silently-broken output display.
- `sequence-pattern-view.tsx` — consumes the sequence/parallel/swarm arm. Houses today's step list rendering, `completedStepOutputs`, the Full Output sheet, per-step sheets, approval prompts, parallel fan-out visualization, and delegates to `SwarmDashboard` for swarm. The pattern field still discriminates parallel vs swarm rendering inside this subview, but all three patterns share the `steps: StepWithState[]` shape so the union arm is shared.

**5. Shared polling hook.** Extract the polling `useEffect` from `workflow-status-view.tsx` into `src/components/workflows/hooks/use-workflow-status.ts`:

```ts
export function useWorkflowStatus(workflowId: string): {
  data: WorkflowStatusResponse | null;
  error: Error | null;
  isLoading: boolean;
  refetch: () => void;
};
```

The hook owns the fetch, the polling interval, cancellation on unmount, and re-subscription on `workflowId` change. Both subviews consume it via the router. This eliminates the possibility of one subview accidentally implementing different polling semantics than another.

**6. Narrowing discipline.** The router's branch pattern:

```tsx
switch (data.pattern) {
  case "loop":
    return <LoopPatternView data={data} />;       // data is narrowed to the loop arm
  case "sequence":
  case "parallel":
  case "swarm":
    return <SequencePatternView data={data} />;    // data is narrowed to the sequence arm
  default:
    // TypeScript exhaustiveness check — new pattern added to union forces this file to compile-error
    return assertNever(data);
}
```

The `assertNever` pattern ensures a new pattern added to `WorkflowStatusResponse` without a corresponding router case fails the TypeScript build. This is the "new-pattern checklist" enforcement mechanism from TDR-031.

**UX considerations.** No user-visible changes for sequence/parallel/swarm workflows — visual regression must be zero. Loop workflows (table enrichment) gain a populated Full Output sheet where today's optional-chaining version shows empty. No new UI chrome, no new loading states, no layout changes. The refactor is invisible to users except that table enrichment finally shows its outputs. Flag for `/frontend-designer` only if the new loop Full Output sheet needs per-iteration styling decisions beyond the existing `WorkflowFullOutput` component's current shape.

## Acceptance Criteria

- [ ] `WorkflowStatusResponse` discriminated union is exported from `src/lib/workflows/types.ts` with `loop` and `sequence | parallel | swarm` arms.
- [ ] `StepWithState`, `RunHistoryEntry`, and `DocumentInfo` interfaces are defined in `src/lib/workflows/types.ts` and imported (not re-declared) by view components.
- [ ] `src/app/api/workflows/[id]/status/route.ts` uses `satisfies WorkflowStatusResponse` on both return branches; TypeScript build fails if either branch emits a field not on its arm.
- [ ] `src/components/workflows/workflow-status-view.tsx` is ≤80 lines, contains no references to `data.steps[i].state`, and dispatches to pattern-specific subviews via `switch` with an exhaustiveness `assertNever` fallback.
- [ ] `src/components/workflows/views/loop-pattern-view.tsx` exists, consumes only the loop arm of the union, and wraps `LoopStatusView`.
- [ ] `src/components/workflows/views/sequence-pattern-view.tsx` exists, consumes only the sequence/parallel/swarm arm, and houses today's step rendering, Full Output sheet, and per-step sheets.
- [ ] `src/components/workflows/hooks/use-workflow-status.ts` exists, owns polling + cancellation + re-subscription, and is the only place that fetches from the status endpoint in the view layer.
- [ ] The optional chaining legacy PR #6 added at `workflow-status-view.tsx:405-406` (`s.state?.result`, `s.state?.status`) is **removed** — the compiler enforces the invariant via the discriminated union and the refactored code path never touches `.state` outside the sequence subview where it is guaranteed present.
- [ ] Loop workflows populate the Full Output sheet by reading `loopState.iterations[].result` — a table enrichment run shows per-iteration outputs in the sheet instead of empty.
- [ ] Sequence workflow detail pages render identically to pre-refactor (manual visual regression: step list, badges, approval prompts, Full Output sheet, per-step sheets, run history).
- [ ] Parallel workflow detail pages render identically to pre-refactor (manual visual regression: fan-out visualization, synthesis step, shared sequence rendering paths).
- [ ] Swarm workflow detail pages render identically to pre-refactor (manual visual regression: SwarmDashboard, swarm config surface).
- [ ] Loop workflow detail pages render without crashing and show iteration progress from `loopState.iterations[]`.
- [ ] Polling continues to work after the hook extraction: `useWorkflowStatus` cancels on unmount, re-subscribes on `workflowId` change, and uses the same interval as today's inline polling.
- [ ] Existing scheduler tests under `src/lib/schedules/__tests__/` pass unchanged.
- [ ] Existing workflow engine tests under `src/lib/workflows/__tests__/` pass unchanged.
- [ ] `npm run build` and `npm test` succeed.
- [ ] `features/changelog.md` has a "Fixed" entry citing legacy PR #6 and a "Hardened" entry for the router refactor, both under the implementation date.

## Scope Boundaries

**Included:**
- Discriminated union type in `src/lib/workflows/types.ts`.
- Response-contract tightening in `src/app/api/workflows/[id]/status/route.ts` (type annotations only, no runtime behavior change).
- Refactor of `src/components/workflows/workflow-status-view.tsx` into a thin router.
- Two new pattern-specific subviews under `src/components/workflows/views/`.
- One new polling hook at `src/components/workflows/hooks/use-workflow-status.ts`.
- Reading `loopState.iterations[].result` to populate the Full Output sheet for loop workflows.
- Removing PR #6's optional chaining guard as the final cleanup AC.
- Changelog entries for the fix and the refactor.

**Excluded:**
- Workflow engine execution semantics (`src/lib/workflows/engine.ts`, `loop-executor.ts`, `parallel-executor.ts`, `swarm-executor.ts`).
- Loop workflow creation flow (`src/app/api/tables/[id]/enrich/route.ts`, table enrichment pipeline).
- The `workflows` DB table schema (no new columns, no new indexes).
- New workflow patterns (e.g., DAG). This spec only makes adding new patterns safer — it does not add any.
- Visual design changes to any workflow detail page. Pixel-level regression is the bar, not "make it prettier."
- Changes to `LoopStatusView` or `SwarmDashboard` internals. Both are consumed as-is by the new subviews.
- Changes to the polling interval or any caching strategy. The new hook must match today's behavior.
- Runtime validation via Zod or any other schema library. The TypeScript discriminated union is the enforcement mechanism.
- Streaming (SSE) variants of the status endpoint. If added later, they inherit the same contract per TDR-031 but are out of scope here.
- Chat tools or MCP surface that reads workflow status. If any exist today and they dereference `data.steps[i].state` without narrowing, they should be audited and patched — but that audit is a follow-up, not part of this spec.

## References

- **Source:** legacy PR #6 (`fix/workflow-loop-status-crash`) — the symptom fix this spec supersedes.
- **TDR-031:** `.claude/skills/architect/references/tdr-031-workflow-status-response-contract.md` — codifies the discriminated-union contract and the four-step new-pattern checklist this spec implements.
- **Architect review:** `features/architect-report.md` (2026-04-09) — full root-cause analysis, blast radius table, regression risk matrix.
- **Crash site:** `src/components/workflows/workflow-status-view.tsx:404-406` (before PR #6), now `s.state?.result && s.state?.status === "completed"`.
- **Shape divergence:** `src/app/api/workflows/[id]/status/route.ts:101-118` (loop branch) vs `:120-138` (default branch).
- **Reference renderer:** `src/components/workflows/loop-status-view.tsx` — correct consumer of `loopState.iterations[]`, becomes the inner component of `loop-pattern-view.tsx`.
- **Reusable types:** `src/lib/workflows/types.ts:105-124` — `LoopState` and `IterationState`, reusable as-is for the loop arm of the union.
- **Related features:** `autonomous-loop-execution` (creates loop-pattern workflows today), `bulk-row-enrichment` (planned, also creates loop-pattern workflows — benefits from this hardening before landing).
