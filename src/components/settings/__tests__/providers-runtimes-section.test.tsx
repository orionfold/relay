import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProvidersAndRuntimesSection } from "@/components/settings/providers-runtimes-section";

const runtimeIds = [
  "claude-code",
  "openai-codex-app-server",
  "anthropic-direct",
  "openai-direct",
  "ollama",
  "litellm",
  "lmstudio",
] as const;

function routingStatuses() {
  return runtimeIds.map((runtimeId) => ({
    runtimeId,
    label:
      runtimeId === "claude-code"
        ? "Claude Code"
        : runtimeId === "openai-codex-app-server"
          ? "OpenAI Codex App Server"
          : runtimeId === "anthropic-direct"
            ? "Anthropic Direct API"
            : runtimeId === "openai-direct"
              ? "OpenAI Direct API"
              : runtimeId === "lmstudio"
                ? "LM Studio"
                : runtimeId === "litellm"
                  ? "LiteLLM"
                  : "Ollama",
    configured: runtimeId !== "litellm" && runtimeId !== "lmstudio",
    health:
      runtimeId === "litellm" || runtimeId === "lmstudio"
        ? "unconfigured"
        : "healthy",
    healthReason:
      runtimeId === "litellm" || runtimeId === "lmstudio"
        ? "Not configured"
        : null,
    checkedAt: "2026-07-15T12:00:00.000Z",
    modelId: runtimeId === "ollama" ? "qwen3:8b" : `${runtimeId}-model`,
    comparableCostPerMillionMicros:
      runtimeId === "anthropic-direct" ? 18_000_000 : null,
    capabilitySummary:
      runtimeId === "claude-code" ? ["Filesystem", "Bash"] : [],
    capabilityLimits:
      runtimeId === "claude-code" ? [] : ["No filesystem tools", "No Bash"],
  }));
}

function providersPayload() {
  return {
    providers: {
      anthropic: {
        configured: false,
        authMethod: "api_key",
        hasKey: false,
        apiKeySource: "unknown",
        dualBilling: false,
        runtimes: [
          {
            runtimeId: "claude-code",
            label: "Claude Code",
            providerId: "anthropic",
            configured: false,
            authMethod: "none",
            apiKeySource: "unknown",
            billingMode: "usage",
          },
          {
            runtimeId: "anthropic-direct",
            label: "Anthropic Direct API",
            providerId: "anthropic",
            configured: false,
            authMethod: "none",
            apiKeySource: "unknown",
            billingMode: "usage",
          },
        ],
      },
      openai: {
        configured: true,
        authMethod: "oauth",
        hasKey: true,
        apiKeySource: "env",
        oauthConnected: false,
        account: null,
        rateLimits: null,
        login: {
          phase: "idle",
          loginId: null,
          authUrl: null,
          account: null,
          rateLimits: null,
          error: null,
          startedAt: null,
          updatedAt: "2026-07-15T12:00:00.000Z",
        },
        dualBilling: false,
        runtimes: [
          {
            runtimeId: "openai-codex-app-server",
            label: "OpenAI Codex App Server",
            providerId: "openai",
            configured: false,
            authMethod: "oauth",
            apiKeySource: "oauth",
            billingMode: "usage",
          },
          {
            runtimeId: "openai-direct",
            label: "OpenAI Direct API",
            providerId: "openai",
            configured: true,
            authMethod: "api_key",
            apiKeySource: "env",
            billingMode: "usage",
          },
        ],
      },
    },
    ollama: {
      configured: true,
      connected: true,
      baseUrl: "http://localhost:11434",
      defaultModel: "qwen3:8b",
      hasApiKey: false,
      apiKeySource: "unknown",
      allowInsecureRemote: false,
    },
    routingPreference: "quality",
    routing: {
      preference: "quality",
      policy: {
        version: 1,
        eligibleRuntimeIds: [...runtimeIds],
        manualDefaultRuntimeId: "claude-code",
        automaticFallback: true,
      },
      source: "stored",
      needsPersistence: false,
      repairReason: null,
    },
    runtimeRoutingStatuses: routingStatuses(),
    configuredProviderCount: 1,
  };
}

describe("providers and runtimes section", () => {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];

  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    vi.stubGlobal("open", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, method, body });

        if (url === "/api/settings/providers" && method === "GET") {
          return { ok: true, json: async () => providersPayload() };
        }
        if (url === "/api/settings/openai/login" && method === "POST") {
          return {
            ok: true,
            json: async () => ({
              phase: "pending",
              loginId: "login-1",
              authUrl: "https://auth.openai.com/log-in",
              account: null,
              rateLimits: null,
              error: null,
              startedAt: "2026-07-15T12:01:00.000Z",
              updatedAt: "2026-07-15T12:01:00.000Z",
            }),
          };
        }
        if (url === "/api/settings/routing" && method === "PUT") {
          return {
            ok: true,
            json: async () => ({
              ...(body as object),
              source: "stored",
              needsPersistence: false,
              repairReason: null,
            }),
          };
        }
        throw new Error(`Unexpected fetch: ${method} ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows partial OpenAI setup state when ChatGPT auth is selected but not connected", async () => {
    render(<ProvidersAndRuntimesSection />);

    await waitFor(() => {
      expect(screen.getByText("Direct API only")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Codex App Server needs ChatGPT sign-in. OpenAI Direct API remains active.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Sign in with ChatGPT")).toHaveLength(2);
  });

  it("updates the provider row immediately when ChatGPT sign-in starts", async () => {
    render(<ProvidersAndRuntimesSection />);
    const signInButton = await screen.findByRole("button", {
      name: "Sign in with ChatGPT",
    });
    signInButton.click();
    await waitFor(() => {
      expect(
        screen.getByText(
          "Waiting for ChatGPT sign-in. OpenAI Direct API remains active.",
        ),
      ).toBeInTheDocument();
    });
  });

  it("shows an actionable error instead of an endless spinner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    render(<ProvidersAndRuntimesSection />);
    expect(await screen.findByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(
      screen.getByText(/Failed to load provider configuration \(HTTP 500\)/),
    ).toBeInTheDocument();
  });

  it("saves routing policy without mutating provider or Chat configuration", async () => {
    const user = userEvent.setup();
    render(<ProvidersAndRuntimesSection />);
    await user.click(await screen.findByRole("radio", { name: "Cost" }));
    const save = screen.getByRole("button", { name: "Save routing" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => {
      expect(
        calls.find(
          (call) =>
            call.url === "/api/settings/routing" && call.method === "PUT",
        )?.body,
      ).toMatchObject({
        preference: "cost",
        policy: { version: 1, automaticFallback: true },
      });
    });
    expect(
      calls.some(
        (call) =>
          [
            "/api/settings",
            "/api/settings/openai",
            "/api/settings/ollama",
            "/api/settings/chat",
          ].includes(call.url) && call.method !== "GET",
      ),
    ).toBe(false);
  });
});
