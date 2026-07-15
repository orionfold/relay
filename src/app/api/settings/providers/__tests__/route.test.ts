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
  getRoutingPreference: vi.fn(async () => "manual"),
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
vi.mock("@/lib/agents/runtime", () => ({
  testRuntimeConnection: vi.fn(async () => ({ connected: true })),
}));

import { GET } from "../route";

describe("GET /api/settings/providers", () => {
  it("reports an empty Ollama default instead of a phantom model", async () => {
    const response = await GET();
    const body = await response.json();

    expect(body.ollama.connected).toBe(true);
    expect(body.ollama.defaultModel).toBe("");
  });
});
