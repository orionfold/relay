import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import { buildNoCompatibleRuntimeError } from "../execution-target";

const {
  mockGetRuntimeSetupStates,
  mockListConfiguredRuntimeIds,
  mockGetRoutingSettings,
  mockTestRuntimeConnection,
  mockGetProfile,
  mockProfileSupportsRuntime,
  mockSuggestRuntime,
} = vi.hoisted(() => ({
  mockGetRuntimeSetupStates: vi.fn(),
  mockListConfiguredRuntimeIds: vi.fn(),
  mockGetRoutingSettings: vi.fn(),
  mockTestRuntimeConnection: vi.fn(),
  mockGetProfile: vi.fn(),
  mockProfileSupportsRuntime: vi.fn(),
  mockSuggestRuntime: vi.fn(),
}));

vi.mock("@/lib/settings/runtime-setup", () => ({
  getRuntimeSetupStates: mockGetRuntimeSetupStates,
  listConfiguredRuntimeIds: mockListConfiguredRuntimeIds,
}));

vi.mock("@/lib/settings/routing", () => ({
  getRoutingSettings: mockGetRoutingSettings,
}));

vi.mock("@/lib/agents/runtime/index", () => ({
  testRuntimeConnection: mockTestRuntimeConnection,
}));

vi.mock("@/lib/agents/profiles/registry", () => ({
  getProfile: mockGetProfile,
}));

vi.mock("@/lib/agents/profiles/compatibility", () => ({
  profileSupportsRuntime: mockProfileSupportsRuntime,
}));

vi.mock("@/lib/agents/router", () => ({
  suggestRuntime: mockSuggestRuntime,
}));

import {
  RequestedModelUnavailableError,
  RuntimeCapabilityMismatchError,
  RuntimeUnavailableError,
  resolveChatExecutionTarget,
  resolveResumeExecutionTarget,
  resolveTaskExecutionTarget,
} from "../execution-target";

function runtimeIdsForTest(): AgentRuntimeId[] {
  return [
    "claude-code",
    "openai-codex-app-server",
    "anthropic-direct",
    "openai-direct",
    "ollama",
    "litellm",
    "lmstudio",
  ];
}

function makeStates(configured: AgentRuntimeId[]) {
  const all = runtimeIdsForTest();

  return Object.fromEntries(
    all.map((runtimeId) => [
      runtimeId,
      {
        runtimeId,
        configured: configured.includes(runtimeId),
      },
    ])
  );
}

function routingSettings(input?: {
  preference?: "latency" | "cost" | "quality" | "manual";
  eligibleRuntimeIds?: AgentRuntimeId[];
  manualDefaultRuntimeId?: AgentRuntimeId;
  automaticFallback?: boolean;
}) {
  return {
    preference: input?.preference ?? "latency",
    policy: {
      version: 1,
      eligibleRuntimeIds: input?.eligibleRuntimeIds ?? [
        "claude-code",
        "openai-codex-app-server",
        "anthropic-direct",
        "openai-direct",
        "ollama",
        "litellm",
        "lmstudio",
      ],
      manualDefaultRuntimeId:
        input?.manualDefaultRuntimeId ?? "claude-code",
      automaticFallback: input?.automaticFallback ?? true,
    },
    source: "stored",
    needsPersistence: false,
    repairReason: null,
  };
}

describe("execution target resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRuntimeSetupStates.mockResolvedValue(
      makeStates(["claude-code", "openai-codex-app-server"])
    );
    mockListConfiguredRuntimeIds.mockReturnValue([
      "claude-code",
      "openai-codex-app-server",
    ]);
    mockGetRoutingSettings.mockResolvedValue(routingSettings());
    mockProfileSupportsRuntime.mockReturnValue(true);
    mockSuggestRuntime.mockImplementation(
      (
        _title: string,
        _description: string | undefined,
        _profileId: string | undefined,
        candidates: Array<{ runtimeId: AgentRuntimeId }>
      ) => ({
        runtimeId: candidates[0].runtimeId,
        orderedRuntimeIds: candidates.map((candidate) => candidate.runtimeId),
        reason: "test",
        evidence: "pool-order",
      })
    );
    mockTestRuntimeConnection.mockImplementation((runtimeId: AgentRuntimeId) => {
      if (runtimeId === "claude-code") {
        return Promise.resolve({
          connected: false,
          error: "Claude Code process exited with code 1",
        });
      }
      return Promise.resolve({ connected: true });
    });
  });

  it("blocks an unavailable explicit task runtime without changing the target", async () => {
    mockGetProfile.mockReturnValue({
      id: "upgrade-assistant",
      allowedTools: ["Bash(git status)", "Read", "Write"],
    });

    await expect(
      resolveTaskExecutionTarget({
        title: "Upgrade local branch",
        description: "Merge upstream main safely",
        requestedRuntimeId: "claude-code",
        profileId: "upgrade-assistant",
      })
    ).rejects.toBeInstanceOf(RuntimeUnavailableError);
  });

  it("redacts provider credential fingerprints from target errors", async () => {
    mockGetRuntimeSetupStates.mockResolvedValue(makeStates(["openai-direct"]));
    mockListConfiguredRuntimeIds.mockReturnValue(["openai-direct"]);
    mockGetProfile.mockReturnValue({ id: "general", allowedTools: [] });
    mockTestRuntimeConnection.mockResolvedValue({
      connected: false,
      error: "401 Invalid API key sk-proj-****************_0MA",
    });

    const error = await resolveTaskExecutionTarget({
      title: "Provider health",
      requestedRuntimeId: "openai-direct",
      profileId: "general",
    }).then(
      () => null,
      (caught) => caught as Error,
    );

    expect(error).toBeInstanceOf(RuntimeUnavailableError);
    expect(error?.message).toContain("[redacted credential]");
    expect(error?.message).not.toContain("sk-proj-");
    expect(error?.message).not.toContain("_0MA");
  });

  it("names a capability mismatch for an explicit runtime", async () => {
    mockGetProfile.mockReturnValue({
      id: "document-writer",
      supportedRuntimes: ["claude-code", "ollama"],
      allowedTools: ["Read", "Write"],
    });
    mockProfileSupportsRuntime.mockReturnValue(true);

    await expect(
      resolveTaskExecutionTarget({
        title: "Write report",
        requestedRuntimeId: "ollama",
        profileId: "document-writer",
      })
    ).rejects.toMatchObject({
      name: "RuntimeCapabilityMismatchError",
      message: expect.stringContaining("filesystem tools"),
    });
  });

  it("honors an explicit compatible runtime and profile-pinned model", async () => {
    mockGetProfile.mockReturnValue({
      id: "general",
      allowedTools: [],
      capabilityOverrides: {
        "openai-codex-app-server": { modelId: "gpt-5.3-codex" },
      },
    });

    const target = await resolveTaskExecutionTarget({
      title: "Use the explicit target",
      requestedRuntimeId: "openai-codex-app-server",
      profileId: "general",
    });

    expect(target.requestedRuntimeId).toBe("openai-codex-app-server");
    expect(target.effectiveRuntimeId).toBe("openai-codex-app-server");
    expect(target.requestedModelId).toBe("gpt-5.3-codex");
    expect(target.effectiveModelId).toBe("gpt-5.3-codex");
    expect(target.selectionMode).toBe("explicit");
  });

  it("blocks an explicit runtime when its profile id is stale", async () => {
    mockGetProfile.mockReturnValue(undefined);

    await expect(
      resolveTaskExecutionTarget({
        title: "Run an imported task",
        requestedRuntimeId: "openai-codex-app-server",
        profileId: "removed-pack-profile",
      })
    ).rejects.toMatchObject({
      name: "NoCompatibleRuntimeError",
      message: expect.stringContaining("removed-pack-profile"),
    });
  });

  it("auto-selects a healthy runtime when no task runtime was requested", async () => {
    mockGetProfile.mockReturnValue({
      id: "general",
      allowedTools: [],
      preferredRuntime: "anthropic-direct",
    });
    mockSuggestRuntime.mockReturnValue({
      runtimeId: "openai-codex-app-server",
      orderedRuntimeIds: ["openai-codex-app-server", "claude-code"],
      reason: "test",
      evidence: "pool-order",
    });

    const target = await resolveTaskExecutionTarget({
      title: "Fix failing build",
      description: "Debug and patch the repo",
      profileId: "general",
    });

    expect(target.requestedRuntimeId).toBeNull();
    expect(target.effectiveRuntimeId).toBe("openai-codex-app-server");
    expect(target.fallbackApplied).toBe(false);
    expect(target.selectionMode).toBe("automatic");
  });

  it("uses the default runtime without auto-routing when routing is Manual", async () => {
    mockGetRoutingSettings.mockResolvedValue({
      preference: "manual",
      policy: {
        version: 1,
        eligibleRuntimeIds: ["claude-code"],
        manualDefaultRuntimeId: "openai-codex-app-server",
        automaticFallback: true,
      },
    });
    mockGetProfile.mockReturnValue({
      id: "general",
      allowedTools: [],
    });
    mockTestRuntimeConnection.mockResolvedValue({ connected: true });

    const target = await resolveTaskExecutionTarget({
      title: "Run with the manual default",
      profileId: "general",
    });

    expect(target.requestedRuntimeId).toBeNull();
    expect(target.effectiveRuntimeId).toBe("openai-codex-app-server");
    expect(target.selectionMode).toBe("manual-default");
    expect(target.selectionReason).toContain("Manual routing is strict");
    expect(mockSuggestRuntime).not.toHaveBeenCalled();
  });

  it("does not reconsider a launch-failed runtime when no automatic alternative remains", async () => {
    mockGetRuntimeSetupStates.mockResolvedValue(makeStates(["claude-code"]));
    mockListConfiguredRuntimeIds.mockReturnValue(["claude-code"]);
    mockGetProfile.mockReturnValue({
      id: "general",
      allowedTools: [],
    });

    await expect(
      resolveTaskExecutionTarget({
        title: "Retry an automatic task",
        profileId: "general",
        unavailableRuntimeIds: ["claude-code"],
        unavailableReasons: { "claude-code": "Claude Code failed to launch" },
      })
    ).rejects.toMatchObject({
      name: "NoEligibleRuntimeError",
      message: expect.stringContaining("Claude Code failed to launch"),
    });
    expect(mockSuggestRuntime).not.toHaveBeenCalled();
  });

  it.each([
    ["claude-code", "sonnet"],
    ["openai-codex-app-server", "gpt-5.3-codex"],
    ["anthropic-direct", "claude-sonnet-4-6"],
    ["openai-direct", "gpt-5.4-mini"],
    ["ollama", "qwen3:8b"],
    ["litellm", "support-alias"],
    ["lmstudio", "loaded-model"],
  ] as const)(
    "selects eligible runtime %s with its profile-pinned model",
    async (runtimeId, modelId) => {
      mockGetRuntimeSetupStates.mockResolvedValue(makeStates([...runtimeIdsForTest()]));
      mockListConfiguredRuntimeIds.mockReturnValue([...runtimeIdsForTest()]);
      mockGetRoutingSettings.mockResolvedValue(
        routingSettings({ eligibleRuntimeIds: [runtimeId] }),
      );
      mockGetProfile.mockReturnValue({
        id: "general",
        name: "General",
        allowedTools: [],
        capabilityOverrides: { [runtimeId]: { modelId } },
      });
      mockTestRuntimeConnection.mockResolvedValue({ connected: true });

      const target = await resolveTaskExecutionTarget({
        title: "Run the eligible target",
        profileId: "general",
      });
      expect(target).toMatchObject({
        effectiveRuntimeId: runtimeId,
        effectiveModelId: modelId,
        selectionMode: "automatic",
        consideredRuntimeIds: [runtimeId],
      });
    },
  );

  it("keeps an explicit target outside the automatic pool strict and unchanged", async () => {
    mockGetRoutingSettings.mockResolvedValue(
      routingSettings({ eligibleRuntimeIds: ["ollama"] }),
    );
    mockGetProfile.mockReturnValue({ id: "general", allowedTools: [] });
    mockTestRuntimeConnection.mockResolvedValue({ connected: true });
    const target = await resolveTaskExecutionTarget({
      title: "Explicit override",
      profileId: "general",
      requestedRuntimeId: "openai-codex-app-server",
    });
    expect(target).toMatchObject({
      effectiveRuntimeId: "openai-codex-app-server",
      selectionMode: "explicit",
      automaticFallbackEnabled: false,
    });
    expect(mockSuggestRuntime).not.toHaveBeenCalled();
  });

  it("fails visibly when the automatic eligible pool is empty", async () => {
    mockGetRoutingSettings.mockResolvedValue(
      routingSettings({ eligibleRuntimeIds: [] }),
    );
    mockGetProfile.mockReturnValue({ id: "general", allowedTools: [] });
    await expect(
      resolveTaskExecutionTarget({ title: "No pool", profileId: "general" }),
    ).rejects.toMatchObject({
      name: "EmptyEligibleRuntimePoolError",
      message: expect.stringContaining("no eligible runtimes"),
    });
  });

  it("does not probe the next candidate when automatic fallback is disabled", async () => {
    mockGetRoutingSettings.mockResolvedValue(
      routingSettings({
        eligibleRuntimeIds: ["claude-code", "openai-codex-app-server"],
        automaticFallback: false,
      }),
    );
    mockGetProfile.mockReturnValue({ id: "general", allowedTools: [] });
    await expect(
      resolveTaskExecutionTarget({
        title: "No fallback",
        profileId: "general",
      }),
    ).rejects.toMatchObject({
      name: "RuntimeUnavailableError",
      message: expect.stringContaining("Automatic fallback is disabled"),
    });
    expect(mockTestRuntimeConnection).toHaveBeenCalledWith("claude-code");
    expect(mockTestRuntimeConnection).not.toHaveBeenCalledWith(
      "openai-codex-app-server",
    );
  });

  it("falls through unhealthy candidates only inside the eligible pool and records every skip", async () => {
    mockGetRoutingSettings.mockResolvedValue(
      routingSettings({
        eligibleRuntimeIds: ["claude-code", "openai-codex-app-server"],
        automaticFallback: true,
      }),
    );
    mockGetProfile.mockReturnValue({ id: "general", allowedTools: [] });
    const target = await resolveTaskExecutionTarget({
      title: "Fallback",
      profileId: "general",
    });
    expect(target).toMatchObject({
      effectiveRuntimeId: "openai-codex-app-server",
      fallbackApplied: true,
      automaticFallbackEnabled: true,
      skippedRuntimes: [
        {
          runtimeId: "claude-code",
          reason: "Claude Code process exited with code 1",
        },
      ],
    });
  });

  it("reports configuration drift and capability exclusions without broadening the pool", async () => {
    mockGetRuntimeSetupStates.mockResolvedValue(makeStates(["ollama"]));
    mockListConfiguredRuntimeIds.mockReturnValue(["ollama"]);
    mockGetRoutingSettings.mockResolvedValue(
      routingSettings({
        eligibleRuntimeIds: ["lmstudio", "ollama"],
      }),
    );
    mockGetProfile.mockReturnValue({
      id: "writer",
      allowedTools: ["Read", "Write"],
    });
    await expect(
      resolveTaskExecutionTarget({ title: "Write", profileId: "writer" }),
    ).rejects.toMatchObject({
      name: "NoEligibleRuntimeError",
      message: expect.stringMatching(/LM Studio is not configured.*Ollama lacks filesystem tools/),
    });
    expect(mockTestRuntimeConnection).not.toHaveBeenCalled();
  });

  it("falls back chat turns to the mapped alternate model when the requested runtime is unavailable", async () => {
    const target = await resolveChatExecutionTarget({
      requestedRuntimeId: "claude-code",
      requestedModelId: "sonnet",
    });

    expect(target.requestedRuntimeId).toBe("claude-code");
    expect(target.effectiveRuntimeId).toBe("openai-codex-app-server");
    expect(target.effectiveModelId).toBe("gpt-5.3-codex");
    expect(target.fallbackApplied).toBe(true);
  });

  it("keeps an explicit LiteLLM model on LiteLLM without fallback", async () => {
    mockGetRuntimeSetupStates.mockResolvedValue(makeStates(["litellm"]));
    mockTestRuntimeConnection.mockImplementation((runtimeId: AgentRuntimeId) =>
      Promise.resolve({ connected: runtimeId === "litellm" })
    );

    const target = await resolveChatExecutionTarget({
      requestedRuntimeId: "litellm",
      requestedModelId: "litellm:support-alias",
    });

    expect(target).toMatchObject({
      requestedRuntimeId: "litellm",
      effectiveRuntimeId: "litellm",
      requestedModelId: "litellm:support-alias",
      effectiveModelId: "support-alias",
      fallbackApplied: false,
    });
  });

  it.each(["anthropic-direct", "openai-direct"] as const)(
    "rejects task-only runtime %s for Chat instead of falling through",
    async (runtimeId) => {
      await expect(
        resolveChatExecutionTarget({ requestedRuntimeId: runtimeId })
      ).rejects.toMatchObject({
        name: "RuntimeCapabilityMismatchError",
        message: expect.stringContaining("does not have a Relay Chat engine"),
      });
      expect(mockTestRuntimeConnection).not.toHaveBeenCalled();
    }
  );

  it("fails an unavailable LM Studio selection instead of falling back", async () => {
    mockGetRuntimeSetupStates.mockResolvedValue(makeStates(["lmstudio"]));
    mockTestRuntimeConnection.mockResolvedValue({
      connected: false,
      error: "LM Studio endpoint is offline",
    });

    await expect(
      resolveChatExecutionTarget({
        requestedRuntimeId: "lmstudio",
        requestedModelId: "lmstudio:loaded-model",
      })
    ).rejects.toMatchObject({
      name: "RequestedModelUnavailableError",
      message: expect.stringContaining("explicit target was not changed"),
    });
  });

  it("refuses a compatible model namespace that conflicts with an explicit runtime", async () => {
    await expect(
      resolveChatExecutionTarget({
        requestedRuntimeId: "claude-code",
        requestedModelId: "litellm:support-alias",
      })
    ).rejects.toMatchObject({
      name: "RequestedModelUnavailableError",
      message: expect.stringContaining("belongs to LiteLLM, not Claude Code"),
    });
    expect(mockTestRuntimeConnection).not.toHaveBeenCalled();
  });

  it("refuses resume when the last effective runtime is unavailable", async () => {
    await expect(
      resolveResumeExecutionTarget({
        requestedRuntimeId: "claude-code",
        effectiveRuntimeId: "claude-code",
      })
    ).rejects.toThrow("Claude Code process exited with code 1");
  });

  it("substitutes DEFAULT_CHAT_MODEL when the requested model is an unrecognized raw ID", async () => {
    // Make claude-code healthy so the loop returns immediately.
    mockTestRuntimeConnection.mockImplementation((runtimeId: AgentRuntimeId) => {
      if (runtimeId === "claude-code") return Promise.resolve({ connected: true });
      return Promise.resolve({ connected: true });
    });

    // Stale full model ID from deprecated SDK era — not in CHAT_MODELS.
    const target = await resolveChatExecutionTarget({
      requestedRuntimeId: "claude-code",
      requestedModelId: "claude-sonnet-4-5-20250514",
    });

    expect(target.effectiveModelId).toBe("haiku"); // DEFAULT_CHAT_MODEL alias
    expect(target.fallbackApplied).toBe(true);
    expect(target.fallbackReason).toContain("claude-sonnet-4-5-20250514");
    expect(target.fallbackReason).toContain("not a recognized model");
  });

  it("does not substitute when the requested model is a known alias", async () => {
    mockTestRuntimeConnection.mockImplementation(() =>
      Promise.resolve({ connected: true })
    );

    const target = await resolveChatExecutionTarget({
      requestedRuntimeId: "claude-code",
      requestedModelId: "sonnet",
    });

    expect(target.effectiveModelId).toBe("sonnet");
    expect(target.fallbackApplied).toBe(false);
    expect(target.fallbackReason).toBeNull();
  });

  it("throws a named error when no chat runtime is healthy", async () => {
    mockTestRuntimeConnection.mockResolvedValue({
      connected: false,
      error: "all down",
    });

    await expect(
      resolveChatExecutionTarget({
        requestedRuntimeId: "claude-code",
        requestedModelId: "sonnet",
      })
    ).rejects.toBeInstanceOf(RequestedModelUnavailableError);
  });
});

describe("NoCompatibleRuntimeError messages", () => {
  it("names profile id, expected runtimes, and configured runtimes when profile exists", () => {
    const err = buildNoCompatibleRuntimeError({
      profileId: "cs-coach",
      profile: {
        id: "cs-coach",
        name: "CS coach",
        description: "",
        domain: "work",
        tags: [],
        systemPrompt: "",
        skillMd: "",
        supportedRuntimes: ["claude-code", "anthropic-direct"],
      } as never,
      configuredRuntimeIds: ["openai-direct"],
    });
    expect(err.message).toContain("cs-coach");
    expect(err.message).toContain("claude-code");
    expect(err.message).toContain("anthropic-direct");
    expect(err.message).toContain("openai-direct");
    expect(err.message).toMatch(/Configure one of the expected runtimes/);
  });

  it("names the unknown profile id and suggests authoring profile.yaml when profile is absent", () => {
    const err = buildNoCompatibleRuntimeError({
      profileId: "ghost-profile",
      profile: undefined,
      configuredRuntimeIds: ["claude-code"],
    });
    expect(err.message).toContain("ghost-profile");
    expect(err.message).toMatch(/profile\.yaml|app manifest/i);
  });

  it("renders empty configured-runtimes list as (none)", () => {
    const err = buildNoCompatibleRuntimeError({
      profileId: "cs-coach",
      profile: {
        id: "cs-coach",
        supportedRuntimes: ["claude-code"],
      } as never,
      configuredRuntimeIds: [],
    });
    expect(err.message).toContain("(none)");
  });
});
