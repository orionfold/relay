// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const state = vi.hoisted(() => ({ settings: new Map<string, string>() }));

vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn(async (key: string) => state.settings.get(key) ?? null),
}));

import { SETTINGS_KEYS } from "@/lib/constants/settings";
import {
  buildOllamaRequest,
  DEFAULT_OLLAMA_BASE_URL,
  getOllamaRuntimeConfig,
  normalizeOllamaBaseUrl,
  OllamaConfigurationError,
} from "../ollama-config";

beforeEach(() => {
  state.settings.clear();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Ollama runtime configuration", () => {
  it("uses a normalized loopback default without authentication", async () => {
    await expect(getOllamaRuntimeConfig()).resolves.toMatchObject({
      runtimeId: "ollama",
      configured: true,
      baseUrl: DEFAULT_OLLAMA_BASE_URL,
      apiKey: null,
      apiKeySource: "unknown",
      defaultModel: null,
      allowInsecureRemote: false,
    });
  });

  it("requires consent for remote HTTP and accepts it atomically when saved", async () => {
    state.settings.set(SETTINGS_KEYS.OLLAMA_BASE_URL, "http://ollama.lan:11434/");
    await expect(getOllamaRuntimeConfig()).rejects.toBeInstanceOf(
      OllamaConfigurationError
    );
    state.settings.set(SETTINGS_KEYS.OLLAMA_ALLOW_INSECURE_REMOTE, "true");
    await expect(getOllamaRuntimeConfig()).resolves.toMatchObject({
      baseUrl: "http://ollama.lan:11434",
      allowInsecureRemote: true,
    });
  });

  it("keeps an environment key authoritative and never derives one from the URL", async () => {
    state.settings.set(SETTINGS_KEYS.OLLAMA_API_KEY, "saved-key");
    vi.stubEnv("OLLAMA_API_KEY", "environment-key");
    await expect(getOllamaRuntimeConfig()).resolves.toMatchObject({
      apiKey: "environment-key",
      apiKeySource: "env",
    });
    expect(() =>
      normalizeOllamaBaseUrl("https://key@example.test", false)
    ).toThrow(/must not contain credentials/);
  });

  it("builds authenticated requests with a manual redirect policy", async () => {
    state.settings.set(SETTINGS_KEYS.OLLAMA_BASE_URL, "https://ollama.com");
    state.settings.set(SETTINGS_KEYS.OLLAMA_API_KEY, "cloud-key");
    const config = await getOllamaRuntimeConfig();
    const request = buildOllamaRequest(config, "/api/tags");
    expect(request.url).toBe("https://ollama.com/api/tags");
    expect(request.init.redirect).toBe("manual");
    expect(new Headers(request.init.headers).get("Authorization")).toBe(
      "Bearer cloud-key"
    );
  });

  it("keeps production Ollama callers behind the shared configuration boundary", () => {
    const callers = [
      "src/lib/agents/runtime/ollama-adapter.ts",
      "src/lib/agents/runtime/execution-target.ts",
      "src/lib/chat/model-discovery.ts",
      "src/lib/chat/ollama-engine.ts",
      "src/app/api/runtimes/ollama/route.ts",
      "src/app/api/settings/providers/route.ts",
    ];
    for (const caller of callers) {
      const source = readFileSync(resolve(process.cwd(), caller), "utf8");
      expect(source, caller).toContain("ollama-config");
      expect(source, caller).not.toMatch(
        /getSetting\([^\n]*(?:OLLAMA_BASE_URL|ollama\.baseUrl)/
      );
    }
  });
});
