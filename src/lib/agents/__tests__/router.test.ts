import { beforeEach, describe, it, expect, vi } from "vitest";
import { executeTaskWithAgent, resumeTaskWithAgent } from "@/lib/agents/router";

const { mockStartTaskExecution, mockResumeTaskExecution } = vi.hoisted(() => ({
  mockStartTaskExecution: vi.fn().mockResolvedValue(undefined),
  mockResumeTaskExecution: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: mockStartTaskExecution,
  resumeTaskExecution: mockResumeTaskExecution,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeTaskWithAgent", () => {
  it("delegates to task dispatch for a specified runtime", async () => {
    await executeTaskWithAgent("task-1", "claude-code");
    expect(mockStartTaskExecution).toHaveBeenCalledWith("task-1", {
      requestedRuntimeId: "claude-code",
    });
  });

  it("defaults to claude-code when no agent type specified", async () => {
    await executeTaskWithAgent("task-2");
    expect(mockStartTaskExecution).toHaveBeenCalledWith("task-2", {
      requestedRuntimeId: "claude-code",
    });
  });

  it("forwards unknown runtime ids to dispatch for resolution", async () => {
    await executeTaskWithAgent("task-1", "unknown-agent");
    expect(mockStartTaskExecution).toHaveBeenCalledWith("task-1", {
      requestedRuntimeId: "unknown-agent",
    });
  });
});

describe("resumeTaskWithAgent", () => {
  it("delegates to task dispatch for a specified runtime", async () => {
    await resumeTaskWithAgent("task-1", "claude-code");
    expect(mockResumeTaskExecution).toHaveBeenCalledWith("task-1", {
      requestedRuntimeId: "claude-code",
    });
  });

  it("defaults to claude-code when no agent type specified", async () => {
    await resumeTaskWithAgent("task-2");
    expect(mockResumeTaskExecution).toHaveBeenCalledWith("task-2", {
      requestedRuntimeId: "claude-code",
    });
  });

  it("forwards unknown runtime ids to dispatch for resolution", async () => {
    await resumeTaskWithAgent("task-1", "unknown-agent");
    expect(mockResumeTaskExecution).toHaveBeenCalledWith("task-1", {
      requestedRuntimeId: "unknown-agent",
    });
  });
});
