import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";

const {
  mockTestRuntimeConnection,
  mockGetRuntimeSetupStates,
  mockResolvePreferredModel,
  mockGetOllamaRuntimeConfig,
  mockGetCompatibleConfig,
  mockGetSetting,
} = vi.hoisted(() => ({
  mockTestRuntimeConnection: vi.fn(),
  mockGetRuntimeSetupStates: vi.fn(),
  mockResolvePreferredModel: vi.fn(),
  mockGetOllamaRuntimeConfig: vi.fn(),
  mockGetCompatibleConfig: vi.fn(),
  mockGetSetting: vi.fn(),
}));

vi.mock("@/lib/agents/runtime", () => ({
  testRuntimeConnection: mockTestRuntimeConnection,
}));
vi.mock("../runtime-setup", () => ({
  getRuntimeSetupStates: mockGetRuntimeSetupStates,
}));
vi.mock("@/lib/agents/runtime/model-preference", () => ({
  resolvePreferredModel: mockResolvePreferredModel,
}));
vi.mock("@/lib/agents/runtime/ollama-config", () => ({
  getOllamaRuntimeConfig: mockGetOllamaRuntimeConfig,
}));
vi.mock("@/lib/agents/runtime/openai-compatible", () => ({
  getOpenAICompatibleRuntimeConfig: mockGetCompatibleConfig,
}));
vi.mock("../helpers", () => ({ getSetting: mockGetSetting }));

import {
  clearRuntimeRoutingStatusCache,
  getRuntimeRoutingStatuses,
} from "../runtime-routing-status";

const runtimeIds: AgentRuntimeId[] = [
  "claude-code",
  "openai-codex-app-server",
  "anthropic-direct",
  "openai-direct",
  "ollama",
  "litellm",
  "lmstudio",
];

describe("runtime routing status snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRuntimeRoutingStatusCache();
    mockGetRuntimeSetupStates.mockResolvedValue(
      Object.fromEntries(
        runtimeIds.map((runtimeId) => [
          runtimeId,
          {
            runtimeId,
            configured: runtimeId !== "lmstudio",
          },
        ]),
      ),
    );
    mockResolvePreferredModel.mockImplementation(async (runtimeId) => ({
      modelId: `${runtimeId}-model`,
      source: "default",
    }));
    mockGetSetting.mockResolvedValue(null);
    mockGetOllamaRuntimeConfig.mockResolvedValue({ defaultModel: "qwen3:8b" });
    mockGetCompatibleConfig.mockImplementation(async (runtimeId) => ({
      defaultModel: runtimeId === "litellm" ? "support-alias" : "loaded-model",
    }));
    mockTestRuntimeConnection.mockImplementation(async (runtimeId) =>
      runtimeId === "litellm"
        ? { connected: false, error: "Gateway refused the connection" }
        : { connected: true },
    );
  });

  it("returns all seven runtimes with independent health, model, and capability truth", async () => {
    const statuses = await getRuntimeRoutingStatuses();
    expect(statuses.map((status) => status.runtimeId)).toEqual(runtimeIds);
    expect(statuses.find((status) => status.runtimeId === "ollama")).toMatchObject({
      health: "healthy",
      modelId: "qwen3:8b",
      capabilityLimits: expect.arrayContaining(["No filesystem tools", "No Bash"]),
    });
    expect(statuses.find((status) => status.runtimeId === "litellm")).toMatchObject({
      health: "unhealthy",
      healthReason: "Gateway refused the connection",
      modelId: "support-alias",
    });
    expect(statuses.find((status) => status.runtimeId === "lmstudio")).toMatchObject({
      health: "unconfigured",
      healthReason: "Not configured",
      checkedAt: null,
    });
    expect(mockTestRuntimeConnection).not.toHaveBeenCalledWith("lmstudio");
  });

  it("uses the TTL cache unless a force refresh is requested", async () => {
    await getRuntimeRoutingStatuses();
    const callsAfterInitial = mockTestRuntimeConnection.mock.calls.length;
    await getRuntimeRoutingStatuses();
    expect(mockTestRuntimeConnection).toHaveBeenCalledTimes(callsAfterInitial);
    await getRuntimeRoutingStatuses({ force: true });
    expect(mockTestRuntimeConnection.mock.calls.length).toBeGreaterThan(
      callsAfterInitial,
    );
  });

  it("contains one probe failure instead of rejecting the complete snapshot", async () => {
    mockTestRuntimeConnection.mockImplementation(async (runtimeId) => {
      if (runtimeId === "ollama") throw new Error("Ollama probe crashed");
      return { connected: true };
    });
    const statuses = await getRuntimeRoutingStatuses();
    expect(statuses).toHaveLength(7);
    expect(statuses.find((status) => status.runtimeId === "ollama")).toMatchObject({
      health: "unhealthy",
      healthReason: "Ollama probe crashed",
    });
  });

  it("redacts provider-returned credential fingerprints from client-visible health reasons", async () => {
    mockTestRuntimeConnection.mockImplementation(async (runtimeId) =>
      runtimeId === "openai-direct"
        ? {
            connected: false,
            error:
              "401 Incorrect API key provided: sk-proj-********************_0MA. Authorization Bearer secret-token-value failed.",
          }
        : { connected: true },
    );
    const statuses = await getRuntimeRoutingStatuses();
    const reason = statuses.find(
      (status) => status.runtimeId === "openai-direct",
    )?.healthReason;
    expect(reason).toContain("[redacted credential]");
    expect(reason).not.toContain("sk-proj-");
    expect(reason).not.toContain("_0MA");
    expect(reason).not.toContain("secret-token-value");
  });

  it("bounds a hanging provider probe and still returns the other runtimes", async () => {
    vi.useFakeTimers();
    try {
      mockTestRuntimeConnection.mockImplementation((runtimeId) =>
        runtimeId === "ollama"
          ? new Promise(() => undefined)
          : Promise.resolve({ connected: true }),
      );
      const pending = getRuntimeRoutingStatuses();
      await vi.advanceTimersByTimeAsync(8_000);
      const result = await pending;
      expect(result).toHaveLength(7);
      expect(result.find((status) => status.runtimeId === "ollama")).toMatchObject({
        health: "unhealthy",
        healthReason: "Ollama health check timed out",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
