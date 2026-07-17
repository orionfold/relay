import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agents/runtime/openai-codex-auth", () => ({
  readCodexAuthState: vi.fn(),
}));
vi.mock("@/lib/settings/runtime-setup", () => ({
  getRuntimeSetupStates: vi.fn(async () => ({
    "claude-code": { runtimeId: "claude-code", configured: true },
    "anthropic-direct": { runtimeId: "anthropic-direct", configured: false },
    "openai-codex-app-server": {
      runtimeId: "openai-codex-app-server",
      configured: false,
    },
    "openai-direct": { runtimeId: "openai-direct", configured: false },
    ollama: { runtimeId: "ollama", configured: true },
    litellm: { runtimeId: "litellm", configured: false },
    lmstudio: { runtimeId: "lmstudio", configured: false },
  })),
}));
vi.mock("@/lib/settings/routing", () => ({
  getRoutingSettings: vi.fn(async () => ({
    preference: "manual",
    policy: {
      version: 1,
      eligibleRuntimeIds: ["claude-code", "ollama"],
      manualDefaultRuntimeId: "claude-code",
      automaticFallback: true,
    },
    source: "stored",
    needsPersistence: false,
    repairReason: null,
  })),
}));
vi.mock("@/lib/settings/auth", () => ({
  getAuthSettings: vi.fn(async () => ({
    method: "api_key",
    hasKey: false,
    apiKeySource: "none",
  })),
}));
vi.mock("@/lib/settings/openai-auth", () => ({
  getOpenAIAuthSettings: vi.fn(async () => ({
    method: "api_key",
    hasKey: false,
    apiKeySource: "none",
    oauthConnected: false,
    account: null,
    rateLimits: null,
  })),
}));
vi.mock("@/lib/settings/openai-login-manager", () => ({
  getOpenAILoginState: vi.fn(() => null),
}));
vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn(async () => null),
}));
vi.mock("@/lib/settings/runtime-routing-status", () => ({
  getRuntimeRoutingStatuses: vi.fn(async () => [
    {
      runtimeId: "claude-code",
      label: "Claude Code",
      configured: true,
      health: "healthy",
      healthReason: null,
      checkedAt: "2026-07-15T00:00:00.000Z",
      modelId: "sonnet",
      capabilitySummary: ["Filesystem"],
      capabilityLimits: [],
    },
    {
      runtimeId: "ollama",
      label: "Ollama",
      configured: true,
      health: "healthy",
      healthReason: null,
      checkedAt: "2026-07-15T00:00:00.000Z",
      modelId: null,
      capabilitySummary: [],
      capabilityLimits: ["No filesystem tools"],
    },
  ]),
}));
vi.mock("@/lib/agents/runtime/ollama-config", () => ({
  getOllamaRuntimeConfig: vi.fn(async () => ({
    baseUrl: "https://ollama.example",
    defaultModel: null,
    apiKey: "never-return-this-secret",
    apiKeySource: "env",
    allowInsecureRemote: false,
  })),
}));

import { GET } from "../route";

describe("GET /api/settings/providers", () => {
  it("reports an empty Ollama default instead of a phantom model", async () => {
    const response = await GET(new Request("http://relay.test/api/settings/providers"));
    const body = await response.json();

    expect(body.ollama.connected).toBe(true);
    expect(body.ollama.defaultModel).toBe("");
    expect(body.ollama.baseUrl).toBe("https://ollama.example");
    expect(body.ollama.hasApiKey).toBe(true);
    expect(body.ollama.apiKeySource).toBe("env");
    expect(body.routing).toMatchObject({
      preference: "manual",
      policy: { eligibleRuntimeIds: ["claude-code", "ollama"] },
    });
    expect(body.runtimeRoutingStatuses).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain("never-return-this-secret");
  });
});
