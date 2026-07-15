import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import { buildNoCompatibleRuntimeError } from "../execution-target";

const {
  mockGetRuntimeSetupStates,
  mockListConfiguredRuntimeIds,
  mockGetRoutingPreference,
  mockTestRuntimeConnection,
  mockGetProfile,
  mockProfileSupportsRuntime,
  mockSuggestRuntime,
} = vi.hoisted(() => ({
  mockGetRuntimeSetupStates: vi.fn(),
  mockListConfiguredRuntimeIds: vi.fn(),
  mockGetRoutingPreference: vi.fn(),
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
  getRoutingPreference: mockGetRoutingPreference,
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

function makeStates(configured: AgentRuntimeId[]) {
  const all: AgentRuntimeId[] = [
    "claude-code",
    "openai-codex-app-server",
    "anthropic-direct",
    "openai-direct",
    "ollama",
  ];

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
    mockGetRoutingPreference.mockResolvedValue("latency");
    mockProfileSupportsRuntime.mockReturnValue(true);
    mockSuggestRuntime.mockImplementation(
      (
        _title: string,
        _description: string | undefined,
        _profileId: string | undefined,
        availableRuntimeIds: AgentRuntimeId[]
      ) => ({
        runtimeId: availableRuntimeIds[0],
        reason: "test",
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
      reason: "test",
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
    mockGetRoutingPreference.mockResolvedValue("manual");
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
    expect(target.effectiveRuntimeId).toBe("claude-code");
    expect(target.selectionMode).toBe("manual-default");
    expect(target.selectionReason).toContain("auto-routing is off");
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
      name: "RuntimeUnavailableError",
      message: "Claude Code failed to launch",
    });
    expect(mockSuggestRuntime).not.toHaveBeenCalled();
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
