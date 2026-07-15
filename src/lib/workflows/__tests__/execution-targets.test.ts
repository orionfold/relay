import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowStep } from "../types";

const { mockResolveTaskExecutionTarget, mockToPreview } = vi.hoisted(() => ({
  mockResolveTaskExecutionTarget: vi.fn(),
  mockToPreview: vi.fn(),
}));

vi.mock("@/lib/agents/runtime/execution-target", () => ({
  resolveTaskExecutionTarget: mockResolveTaskExecutionTarget,
}));

vi.mock("@/lib/agents/runtime/execution-target-preview", () => ({
  toExecutionTargetPreviewItem: mockToPreview,
}));

import {
  getWorkflowStepRequestedRuntime,
  resolveWorkflowExecutionTargets,
} from "../execution-targets";

const step: WorkflowStep = {
  id: "step-1",
  name: "Draft",
  prompt: "Draft the report",
  runtimeId: "ollama",
  assignedAgent: "openai-direct",
};

describe("workflow execution target resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveTaskExecutionTarget.mockResolvedValue({
      effectiveRuntimeId: "ollama",
    });
    mockToPreview.mockImplementation(({ key }) => ({ key }));
  });

  it("uses step runtime, legacy step assignment, loop assignment, then workflow runtime", () => {
    expect(
      getWorkflowStepRequestedRuntime({
        step,
        loopAssignedAgent: "claude-code",
        workflowRuntimeId: "anthropic-direct",
      })
    ).toBe("ollama");
    expect(
      getWorkflowStepRequestedRuntime({
        step: { ...step, runtimeId: undefined },
        loopAssignedAgent: "claude-code",
        workflowRuntimeId: "anthropic-direct",
      })
    ).toBe("openai-direct");
    expect(
      getWorkflowStepRequestedRuntime({
        step: { ...step, runtimeId: undefined, assignedAgent: undefined },
        loopAssignedAgent: "claude-code",
        workflowRuntimeId: "anthropic-direct",
      })
    ).toBe("claude-code");
    expect(
      getWorkflowStepRequestedRuntime({
        step: { ...step, runtimeId: undefined, assignedAgent: undefined },
        workflowRuntimeId: "anthropic-direct",
      })
    ).toBe("anthropic-direct");
  });

  it("previews executable steps and skips delay-only steps", async () => {
    const targets = await resolveWorkflowExecutionTargets({
      definition: {
        pattern: "sequence",
        steps: [
          step,
          {
            id: "delay-1",
            name: "Wait",
            prompt: "",
            delayDuration: "1h",
          },
        ],
      },
      workflowRuntimeId: "claude-code",
    });

    expect(mockResolveTaskExecutionTarget).toHaveBeenCalledTimes(1);
    expect(mockResolveTaskExecutionTarget).toHaveBeenCalledWith(
      expect.objectContaining({ requestedRuntimeId: "ollama" })
    );
    expect(targets).toEqual([{ key: "step-1" }]);
  });
});
