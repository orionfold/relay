import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  executeTaskWithAgent,
  resumeTaskWithAgent,
  suggestRuntime,
} from "@/lib/agents/router";

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

  it("leaves the runtime unset for automatic routing when no agent type is specified", async () => {
    await executeTaskWithAgent("task-2");
    expect(mockStartTaskExecution).toHaveBeenCalledWith("task-2", {
      requestedRuntimeId: null,
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

  it("leaves the runtime unset for automatic routing when no agent type is specified", async () => {
    await resumeTaskWithAgent("task-2");
    expect(mockResumeTaskExecution).toHaveBeenCalledWith("task-2", {
      requestedRuntimeId: null,
    });
  });

  it("forwards unknown runtime ids to dispatch for resolution", async () => {
    await resumeTaskWithAgent("task-1", "unknown-agent");
    expect(mockResumeTaskExecution).toHaveBeenCalledWith("task-1", {
      requestedRuntimeId: "unknown-agent",
    });
  });
});

describe("suggestRuntime evidence-aware ordering", () => {
  it("preserves eligible pool order when latency evidence is unknown", () => {
    expect(
      suggestRuntime(
        "Summarize this",
        null,
        null,
        ["lmstudio", "anthropic-direct", "ollama"],
        "latency",
      ),
    ).toMatchObject({
      runtimeId: "lmstudio",
      orderedRuntimeIds: ["lmstudio", "anthropic-direct", "ollama"],
      evidence: "pool-order",
      reason: expect.stringContaining("No comparable generation-latency evidence"),
    });
  });

  it("places known comparable costs before unknown and chooses the lowest", () => {
    const suggestion = suggestRuntime(
      "Summarize this",
      null,
      null,
      [
        { runtimeId: "ollama", comparableCostPerMillionMicros: null },
        { runtimeId: "openai-direct", comparableCostPerMillionMicros: 40_000_000 },
        { runtimeId: "anthropic-direct", comparableCostPerMillionMicros: 18_000_000 },
        { runtimeId: "lmstudio", comparableCostPerMillionMicros: null },
      ],
      "cost",
    );
    expect(suggestion.runtimeId).toBe("anthropic-direct");
    expect(suggestion.orderedRuntimeIds).toEqual([
      "anthropic-direct",
      "openai-direct",
      "ollama",
      "lmstudio",
    ]);
    expect(suggestion.evidence).toBe("known-cost");
  });

  it("does not treat unknown-cost provider identities as free", () => {
    const suggestion = suggestRuntime(
      "General task",
      null,
      null,
      [
        { runtimeId: "ollama", comparableCostPerMillionMicros: null },
        { runtimeId: "litellm", comparableCostPerMillionMicros: null },
        { runtimeId: "openai-direct", comparableCostPerMillionMicros: 40_000_000 },
      ],
      "cost",
    );
    expect(suggestion.runtimeId).toBe("openai-direct");
    expect(suggestion.orderedRuntimeIds.slice(1)).toEqual(["ollama", "litellm"]);
  });

  it("honors an eligible profile preference ahead of optimization evidence", async () => {
    const { getProfile } = await import("@/lib/agents/profiles/registry");
    const profile = getProfile("general");
    if (!profile) throw new Error("general profile fixture is missing");
    const original = profile.preferredRuntime;
    profile.preferredRuntime = "ollama";
    try {
      const suggestion = suggestRuntime(
        "General task",
        null,
        "general",
        [
          { runtimeId: "openai-direct", comparableCostPerMillionMicros: 1 },
          { runtimeId: "ollama", comparableCostPerMillionMicros: null },
        ],
        "cost",
      );
      expect(suggestion).toMatchObject({ runtimeId: "ollama", evidence: "profile" });
    } finally {
      profile.preferredRuntime = original;
    }
  });

  it("honors an exact runtime-name signal without broad provider inference", () => {
    const suggestion = suggestRuntime(
      "Run this with LM Studio",
      null,
      null,
      ["ollama", "lmstudio", "openai-direct"],
      "quality",
    );
    expect(suggestion).toMatchObject({
      runtimeId: "lmstudio",
      evidence: "runtime-name",
      reason: "Task text names LM Studio",
    });
  });

  it("keeps quality ties in pool order instead of assigning provider quality", () => {
    const suggestion = suggestRuntime(
      "General task",
      null,
      null,
      ["litellm", "claude-code", "openai-codex-app-server"],
      "quality",
    );
    expect(suggestion.runtimeId).toBe("litellm");
    expect(suggestion.reason).toContain("No comparable quality evidence");
  });
});
