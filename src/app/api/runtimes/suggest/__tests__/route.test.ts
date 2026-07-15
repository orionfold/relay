/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getRoutingSettings,
  getRuntimeSetupStates,
  listConfiguredRuntimeIds,
  getComparableRuntimeCost,
} = vi.hoisted(() => ({
  getRoutingSettings: vi.fn(),
  getRuntimeSetupStates: vi.fn(),
  listConfiguredRuntimeIds: vi.fn(),
  getComparableRuntimeCost: vi.fn(),
}));

vi.mock("@/lib/settings/routing", () => ({ getRoutingSettings }));
vi.mock("@/lib/settings/runtime-setup", () => ({
  getRuntimeSetupStates,
  listConfiguredRuntimeIds,
}));
vi.mock("@/lib/settings/runtime-routing-evidence", () => ({
  getComparableRuntimeCost,
}));
vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: vi.fn(),
  resumeTaskExecution: vi.fn(),
}));

import { POST } from "../route";

function request(body: unknown) {
  return new NextRequest("http://relay.test/api/runtimes/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function policy(overrides?: Record<string, unknown>) {
  return {
    preference: "cost",
    policy: {
      version: 1,
      eligibleRuntimeIds: ["ollama", "openai-direct", "lmstudio"],
      manualDefaultRuntimeId: "claude-code",
      automaticFallback: true,
    },
    source: "stored",
    needsPersistence: false,
    repairReason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getRoutingSettings.mockResolvedValue(policy());
  getRuntimeSetupStates.mockResolvedValue({});
  listConfiguredRuntimeIds.mockReturnValue([
    "ollama",
    "openai-direct",
    "anthropic-direct",
  ]);
  getComparableRuntimeCost.mockImplementation(
    async ({ runtimeId }: { runtimeId: string }) =>
      runtimeId === "openai-direct" ? 2_000_000 : null,
  );
});

describe("POST /api/runtimes/suggest", () => {
  it("ranks only configured members of the saved pool", async () => {
    const response = await POST(request({ title: "Summarize this report" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      runtimeId: "openai-direct",
      orderedRuntimeIds: ["openai-direct", "ollama"],
      evidence: "known-cost",
      advisory: true,
    });
    expect(getComparableRuntimeCost).toHaveBeenCalledTimes(2);
  });

  it("uses the strict Manual default without consulting the automatic pool", async () => {
    getRoutingSettings.mockResolvedValue(
      policy({
        preference: "manual",
        policy: {
          version: 1,
          eligibleRuntimeIds: [],
          manualDefaultRuntimeId: "lmstudio",
          automaticFallback: true,
        },
      }),
    );
    const response = await POST(request({ title: "Manual task" }));
    expect(await response.json()).toMatchObject({
      runtimeId: "lmstudio",
      orderedRuntimeIds: ["lmstudio"],
      advisory: true,
    });
    expect(getRuntimeSetupStates).not.toHaveBeenCalled();
  });

  it("fails visibly when no configured runtime is eligible", async () => {
    listConfiguredRuntimeIds.mockReturnValue(["anthropic-direct"]);
    const response = await POST(request({ title: "No candidate" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "No configured runtime is currently eligible for automatic routing",
    });
  });

  it("rejects malformed and empty requests", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request({ title: "   " }))).status).toBe(400);
    expect(
      (await POST(request({ title: "Task", unexpected: true }))).status,
    ).toBe(400);
  });
});
