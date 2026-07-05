import { describe, expect, it, vi } from "vitest";

vi.mock("../auth", () => ({
  getAuthSettings: vi.fn(async () => ({
    method: "oauth",
    hasKey: false,
    apiKeySource: "oauth",
  })),
}));

vi.mock("../openai-auth", () => ({
  getOpenAIAuthSettings: vi.fn(async () => ({
    method: "oauth",
    hasKey: true,
    apiKeySource: "db",
    oauthConnected: true,
    account: { type: "chatgpt", email: "dev@example.com", planType: "pro" },
    rateLimits: null,
  })),
}));

describe("runtime setup states", () => {
  it("marks Codex App Server subscription-backed when ChatGPT auth is connected", async () => {
    const { getRuntimeSetupStates } = await import("../runtime-setup");
    const states = await getRuntimeSetupStates();

    expect(states["openai-codex-app-server"].configured).toBe(true);
    expect(states["openai-codex-app-server"].authMethod).toBe("oauth");
    expect(states["openai-codex-app-server"].billingMode).toBe("subscription");
    expect(states["openai-direct"].configured).toBe(true);
    expect(states["openai-direct"].billingMode).toBe("usage");
  });
});

describe("pickActiveRuntime", () => {
  function stateFor(
    runtimeId: string,
    overrides: Partial<{ configured: boolean; label: string; providerId: string }>,
  ) {
    return {
      runtimeId,
      label: overrides.label ?? runtimeId,
      providerId: overrides.providerId ?? "anthropic",
      configured: overrides.configured ?? false,
      authMethod: "none",
      apiKeySource: "unknown",
      billingMode: "usage",
    };
  }

  it("prefers the default runtime (claude-code) when it is configured", async () => {
    const { pickActiveRuntime } = await import("../runtime-setup");
    // deno-lint-ignore no-explicit-any -- minimal fixtures for the picker only
    const states = {
      "claude-code": stateFor("claude-code", { configured: true, label: "Claude Code" }),
      "openai-direct": stateFor("openai-direct", { configured: true }),
    } as never;

    const active = pickActiveRuntime(states);
    expect(active.runtimeId).toBe("claude-code");
    expect(active.runtimeLabel).toBe("Claude Code");
    expect(active.providerId).toBe("anthropic");
  });

  it("falls back to the first configured runtime in catalog order when the default is not configured", async () => {
    const { pickActiveRuntime } = await import("../runtime-setup");
    const states = {
      "claude-code": stateFor("claude-code", { configured: false }),
      "openai-direct": stateFor("openai-direct", {
        configured: true,
        label: "OpenAI Direct",
        providerId: "openai",
      }),
      ollama: stateFor("ollama", { configured: true, providerId: "ollama" }),
    } as never;

    const active = pickActiveRuntime(states);
    // openai-direct comes before ollama in SUPPORTED_AGENT_RUNTIMES order
    expect(active.runtimeId).toBe("openai-direct");
    expect(active.runtimeLabel).toBe("OpenAI Direct");
    expect(active.providerId).toBe("openai");
  });

  it("falls back to the default's identity (never null-crashing) when nothing is configured", async () => {
    const { pickActiveRuntime } = await import("../runtime-setup");
    const states = {
      "claude-code": stateFor("claude-code", { configured: false, label: "Claude Code" }),
      "openai-direct": stateFor("openai-direct", { configured: false }),
    } as never;

    const active = pickActiveRuntime(states);
    expect(active.runtimeId).toBe("claude-code");
    expect(active.runtimeLabel).toBe("Claude Code");
  });
});
