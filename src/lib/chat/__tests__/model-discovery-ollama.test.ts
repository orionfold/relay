import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression test for #50 — "Chat doesn't work with Ollama".
 *
 * Root cause: discoverModels() merged only Anthropic + OpenAI models, so the
 * chat model dropdown never offered any Ollama model. A user whose only working
 * provider was Ollama had nothing valid to select; chat defaulted to a cloud
 * model that then silently produced no output. The fix adds discoverOllamaModels().
 *
 * We mock the SDK model list + the Ollama resolver so the test is hermetic and
 * fast; the live end-to-end path (real /api/tags → dropdown → streamed PONG) was
 * verified separately against a running instance.
 */

const mockSupportedModels = vi.fn(async () => [] as { value: string; displayName: string }[]);
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: () => ({
    supportedModels: mockSupportedModels,
  }),
}));
vi.mock("@/lib/settings/auth", () => ({ getAuthEnv: async () => ({}) }));
vi.mock("@/lib/agents/runtime/claude-sdk", () => ({ buildClaudeSdkEnv: () => ({}) }));
vi.mock("@/lib/environment/workspace-context", () => ({ getLaunchCwd: () => "/tmp" }));

const mockListPulled = vi.fn(async () => [] as string[]);
vi.mock("@/lib/agents/runtime/ollama-model-resolver", () => ({
  listPulledOllamaModels: (...args: unknown[]) => mockListPulled(...(args as [])),
}));
vi.mock("@/lib/settings/helpers", () => ({
  getSetting: async () => "http://remote-ollama:11434",
}));

describe("discoverModels — Ollama enumeration (#50)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSupportedModels.mockResolvedValue([]);
    mockListPulled.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exposes pulled Ollama models as `ollama:`-prefixed, Free chat options", async () => {
    mockListPulled.mockResolvedValue(["qwen2.5:latest", "llama3"]);
    const { discoverModels } = await import("../model-discovery");

    const models = await discoverModels();
    const ollama = models.filter((m) => m.provider === "ollama");

    expect(ollama.map((m) => m.id)).toEqual([
      "ollama:qwen2.5:latest",
      "ollama:llama3",
    ]);
    expect(ollama.every((m) => m.costLabel === "Free")).toBe(true);
    expect(ollama[0].label).toBe("qwen2.5:latest");
  });

  it("adds no Ollama options when none are pulled (cloud-only users unaffected)", async () => {
    mockListPulled.mockResolvedValue([]);
    const { discoverModels } = await import("../model-discovery");

    const models = await discoverModels();

    expect(models.some((m) => m.provider === "ollama")).toBe(false);
    // Cloud models still present.
    expect(models.some((m) => m.provider === "anthropic")).toBe(true);
    expect(models.some((m) => m.provider === "openai")).toBe(true);
  });

  it("never throws if Ollama discovery fails", async () => {
    mockListPulled.mockRejectedValue(new Error("ECONNREFUSED"));
    const { discoverModels } = await import("../model-discovery");

    await expect(discoverModels()).resolves.toBeInstanceOf(Array);
  });
});
