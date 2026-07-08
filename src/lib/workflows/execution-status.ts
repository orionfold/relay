import type { LoopState, StepState, WorkflowStatusResponse } from "./types";

export type WorkflowEffectiveStatus =
  | "draft"
  | "running"
  | "waiting"
  | "paused"
  | "completed"
  | "failed"
  | "stalled";

export interface WorkflowExecutionInfo {
  status: WorkflowEffectiveStatus;
  label: string;
  isLive: boolean;
  canRun: boolean;
  canStop: boolean;
}

interface WorkflowExecutionInput {
  status: string;
  liveTaskCount?: number | null;
  stepStates?: Array<Pick<StepState, "status"> | { status: string }> | null;
  loopState?: Pick<LoopState, "status"> | null;
}

export function getWorkflowExecutionInfo(input: WorkflowExecutionInput): WorkflowExecutionInfo {
  const liveTaskCount = input.liveTaskCount ?? 0;
  const stepStates = input.stepStates ?? [];
  const hasRunningStep =
    stepStates.some((step) => step.status === "running") ||
    input.loopState?.status === "running";
  const hasWaitingStep = stepStates.some((step) => step.status === "waiting_approval");

  if (input.status === "running") {
    return {
      status: "running",
      label: "running",
      isLive: true,
      canRun: false,
      canStop: true,
    };
  }

  if (input.status === "active") {
    if (liveTaskCount > 0 || hasRunningStep) {
      return {
        status: "running",
        label: "running",
        isLive: true,
        canRun: false,
        canStop: true,
      };
    }

    if (hasWaitingStep) {
      return {
        status: "waiting",
        label: "waiting",
        isLive: false,
        canRun: true,
        canStop: false,
      };
    }

    return {
      status: "stalled",
      label: "stalled",
      isLive: false,
      canRun: true,
      canStop: false,
    };
  }

  if (input.status === "paused") {
    return {
      status: "paused",
      label: "paused",
      isLive: false,
      canRun: true,
      canStop: false,
    };
  }

  if (input.status === "completed") {
    return {
      status: "completed",
      label: "completed",
      isLive: false,
      canRun: true,
      canStop: false,
    };
  }

  if (input.status === "failed") {
    return {
      status: "failed",
      label: "failed",
      isLive: false,
      canRun: true,
      canStop: false,
    };
  }

  return {
    status: "draft",
    label: "draft",
    isLive: false,
    canRun: true,
    canStop: false,
  };
}

export function getWorkflowExecutionInfoFromStatusResponse(
  data: WorkflowStatusResponse
): WorkflowExecutionInfo {
  if (data.pattern === "loop") {
    return getWorkflowExecutionInfo({
      status: data.status,
      liveTaskCount: data.liveTaskCount,
      loopState: data.loopState,
    });
  }

  return getWorkflowExecutionInfo({
    status: data.status,
    liveTaskCount: data.liveTaskCount,
    stepStates: data.steps.map((step) => step.state),
  });
}
