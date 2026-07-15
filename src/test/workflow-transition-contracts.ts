export interface WorkflowTransitionContract {
  id: string;
  family: "sequence" | "parallel" | "loop" | "delay" | "hitl" | "stop" | "retry";
  from: string;
  event: string;
  to: string;
  invariant: string;
  guards: readonly string[];
}

/** G-071's bounded, executable recovery transition matrix. */
export const WORKFLOW_TRANSITION_CONTRACTS = [
  {
    id: "sequence-child-failure",
    family: "sequence",
    from: "active/running",
    event: "child failure or timeout",
    to: "failed",
    invariant: "failed child and step fail parent/receipt; dependents stay pending",
    guards: ["src/lib/workflows/__tests__/recovery-contract.test.ts"],
  },
  {
    id: "parallel-partial-failure",
    family: "parallel",
    from: "active/branches",
    event: "one branch fails",
    to: "failed",
    invariant: "all started branches settle before join fails; synthesis is absent",
    guards: ["src/lib/workflows/__tests__/recovery-contract.test.ts"],
  },
  {
    id: "parallel-all-failure",
    family: "parallel",
    from: "active/branches",
    event: "all branches fail",
    to: "failed",
    invariant: "every branch error is named and no late active write follows terminal",
    guards: ["src/lib/workflows/__tests__/recovery-contract.test.ts"],
  },
  {
    id: "loop-autonomous-failure",
    family: "loop",
    from: "active/iteration",
    event: "iteration fails",
    to: "failed",
    invariant: "iteration, loop, workflow, and receipt agree on failure",
    guards: ["src/lib/workflows/__tests__/recovery-contract.test.ts"],
  },
  {
    id: "loop-row-partial-failure",
    family: "loop",
    from: "active/row fan-out",
    event: "one row fails and another completes",
    to: "failed",
    invariant: "remaining rows may settle but partial failure cannot complete parent",
    guards: ["src/lib/workflows/__tests__/recovery-contract.test.ts"],
  },
  {
    id: "delay-duplicate-resume",
    family: "delay",
    from: "paused/delayed",
    event: "competing resume attempts",
    to: "active then terminal",
    invariant: "one definition-snapshot claim creates one suffix child",
    guards: [
      "src/lib/workflows/__tests__/recovery-contract.test.ts",
      "src/app/api/workflows/[id]/resume/__tests__/route.test.ts",
    ],
  },
  {
    id: "delay-invalid-state",
    family: "delay",
    from: "paused/invalid",
    event: "resume attempt",
    to: "paused",
    invariant: "validation failure does not consume recovery state",
    guards: ["src/lib/workflows/__tests__/recovery-contract.test.ts"],
  },
  {
    id: "hitl-reentry",
    family: "hitl",
    from: "paused/waiting input",
    event: "persisted answer after re-entry",
    to: "active then terminal",
    invariant: "workflow, step, and notification identity admit one continuation",
    guards: [
      "src/lib/workflows/__tests__/recovery-contract.test.ts",
      "src/app/api/tasks/[id]/respond/__tests__/workflow-input-resume.test.ts",
    ],
  },
  {
    id: "hitl-stale-answer",
    family: "hitl",
    from: "paused or already resolved",
    event: "stale or duplicate answer",
    to: "unchanged",
    invariant: "named conflict and no second dispatch",
    guards: ["src/app/api/tasks/[id]/respond/__tests__/workflow-input-resume.test.ts"],
  },
  {
    id: "stop-cancel-refusal",
    family: "stop",
    from: "active/live children",
    event: "one cancellation refuses",
    to: "active/retryable",
    invariant: "successful cancellations settle and failed child IDs stay visible",
    guards: ["src/app/api/workflows/[id]/stop/__tests__/route.test.ts"],
  },
  {
    id: "stop-success",
    family: "stop",
    from: "active/live children",
    event: "all cancellations settle",
    to: "failed",
    invariant: "parent, active steps, children, and receipt agree",
    guards: ["src/app/api/workflows/[id]/stop/__tests__/route.test.ts"],
  },
  {
    id: "retry-duplicate-claim",
    family: "retry",
    from: "failed/failed step",
    event: "competing retry attempts",
    to: "active then terminal",
    invariant: "one snapshot claim runs selected suffix without repeating prefix",
    guards: ["src/app/api/workflows/[id]/steps/[stepId]/retry/__tests__/route.test.ts"],
  },
] as const satisfies readonly WorkflowTransitionContract[];
