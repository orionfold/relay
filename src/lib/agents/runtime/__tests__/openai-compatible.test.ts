// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
}));

vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn(async (key: string) => state.settings.get(key) ?? null),
}));

import { SETTINGS_KEYS } from "@/lib/constants/settings";
import {
  CompatibleRuntimeCapabilityError,
  CompatibleRuntimeConfigurationError,
  CompatibleRuntimeHttpError,
  CompatibleRuntimeProtocolError,
  CompatibleRuntimeTimeoutError,
  createOpenAICompatibleCompletion,
  getOpenAICompatibleRuntimeConfig,
  listOpenAICompatibleModels,
  normalizeCompatibleBaseUrl,
  resolveOpenAICompatibleModel,
  streamOpenAICompatibleCompletion,
} from "../openai-compatible";

function configure(
  runtimeId: "litellm" | "lmstudio",
  baseUrl = runtimeId === "litellm"
    ? "http://localhost:4000/v1"
    : "http://localhost:1234/v1"
) {
  state.settings.set(
    runtimeId === "litellm"
      ? SETTINGS_KEYS.LITELLM_BASE_URL
      : SETTINGS_KEYS.LMSTUDIO_BASE_URL,
    baseUrl
  );
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function sseResponse(events: string[], headers?: HeadersInit) {
  return new Response(events.join("\n\n"), {
    status: 200,
    headers: { "Content-Type": "text/event-stream", ...headers },
  });
}

beforeEach(() => {
  state.settings.clear();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("OpenAI-compatible URL and secret configuration", () => {
  it("normalizes an origin to /v1 and preserves an explicit path", () => {
    expect(
      normalizeCompatibleBaseUrl("http://localhost:4000", {
        allowInsecureRemote: false,
        label: "LiteLLM",
      })
    ).toBe("http://localhost:4000/v1");
    expect(
      normalizeCompatibleBaseUrl("https://gateway.example/proxy/v1/", {
        allowInsecureRemote: false,
        label: "LiteLLM",
      })
    ).toBe("https://gateway.example/proxy/v1");
  });

  it.each([
    "ftp://localhost/models",
    "http://user:secret@localhost:4000/v1",
    "http://localhost:4000/v1?token=secret",
    "http://localhost:4000/v1#models",
  ])("rejects unsafe or ambiguous URL %s", (url) => {
    expect(() =>
      normalizeCompatibleBaseUrl(url, {
        allowInsecureRemote: false,
        label: "LiteLLM",
      })
    ).toThrow(CompatibleRuntimeConfigurationError);
  });

  it("requires explicit consent for remote HTTP but allows HTTPS", () => {
    expect(() =>
      normalizeCompatibleBaseUrl("http://192.168.1.20:4000/v1", {
        allowInsecureRemote: false,
        label: "LiteLLM",
      })
    ).toThrow(/explicitly allow insecure remote HTTP/);
    expect(
      normalizeCompatibleBaseUrl("http://192.168.1.20:4000/v1", {
        allowInsecureRemote: true,
        label: "LiteLLM",
      })
    ).toBe("http://192.168.1.20:4000/v1");
    expect(
      normalizeCompatibleBaseUrl("https://gateway.example/v1", {
        allowInsecureRemote: false,
        label: "LiteLLM",
      })
    ).toBe("https://gateway.example/v1");
  });

  it("keeps an environment API key authoritative without exposing its value", async () => {
    configure("litellm");
    state.settings.set(SETTINGS_KEYS.LITELLM_API_KEY, "saved-key");
    vi.stubEnv("LITELLM_API_KEY", "environment-key");
    const config = await getOpenAICompatibleRuntimeConfig("litellm");
    expect(config.apiKey).toBe("environment-key");
    expect(config.apiKeySource).toBe("env");
  });
});

describe("OpenAI-compatible model discovery", () => {
  it("sends bearer authentication and deduplicates valid model IDs", async () => {
    configure("litellm");
    state.settings.set(SETTINGS_KEYS.LITELLM_API_KEY, "proxy-key");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      jsonResponse({
        data: [
          { id: "support", owned_by: "router" },
          { id: "support", owned_by: "router" },
          { id: "analysis" },
          { id: "" },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(listOpenAICompatibleModels("litellm")).resolves.toEqual([
      { id: "support", ownedBy: "router" },
      { id: "analysis", ownedBy: null },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer proxy-key" }),
        redirect: "manual",
      })
    );
  });

  it("refuses endpoint redirects instead of forwarding credentials", async () => {
    configure("litellm");
    state.settings.set(SETTINGS_KEYS.LITELLM_API_KEY, "proxy-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, {
          status: 302,
          headers: { Location: "https://untrusted.example/v1/models" },
        })
      )
    );
    await expect(listOpenAICompatibleModels("litellm")).rejects.toMatchObject({
      name: "CompatibleRuntimeHttpError",
      status: 302,
    });
  });

  it("names malformed model lists and HTTP authentication failures", async () => {
    configure("lmstudio");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ models: [] })));
    await expect(listOpenAICompatibleModels("lmstudio")).rejects.toBeInstanceOf(
      CompatibleRuntimeProtocolError
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: { message: "invalid token" } }, { status: 401 })
      )
    );
    await expect(listOpenAICompatibleModels("lmstudio")).rejects.toMatchObject({
      name: "CompatibleRuntimeHttpError",
      status: 401,
      message: expect.stringContaining("invalid token"),
    } satisfies Partial<CompatibleRuntimeHttpError>);
  });

  it("resolves explicit aliases, configured defaults, then a deterministic discovered model", async () => {
    configure("litellm");
    expect(await resolveOpenAICompatibleModel("litellm", "litellm:alias-a")).toBe(
      "alias-a"
    );
    state.settings.set(SETTINGS_KEYS.LITELLM_DEFAULT_MODEL, "configured-alias");
    expect(await resolveOpenAICompatibleModel("litellm", null)).toBe(
      "configured-alias"
    );
    state.settings.delete(SETTINGS_KEYS.LITELLM_DEFAULT_MODEL);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ data: [{ id: "z-model" }, { id: "a-model" }] }))
    );
    expect(await resolveOpenAICompatibleModel("litellm", null)).toBe("a-model");
  });

  it("fails visibly when no configured endpoint or model exists", async () => {
    await expect(listOpenAICompatibleModels("litellm")).rejects.toBeInstanceOf(
      CompatibleRuntimeConfigurationError
    );
    configure("lmstudio");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ data: [] })));
    await expect(resolveOpenAICompatibleModel("lmstudio", null)).rejects.toThrow(
      /reported no models/
    );
  });
});

describe("non-streaming compatible completions", () => {
  it("preserves endpoint model/usage and valid LiteLLM-reported cost", async () => {
    configure("litellm");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            id: "chatcmpl-1",
            model: "upstream/model-v2",
            choices: [{ message: { role: "assistant", content: "Done" } }],
            usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
          },
          { headers: { "x-litellm-response-cost": "0.00125" } }
        )
      )
    );
    await expect(
      createOpenAICompatibleCompletion({
        runtimeId: "litellm",
        model: "alias",
        messages: [{ role: "user", content: "Hello" }],
      })
    ).resolves.toMatchObject({
      text: "Done",
      modelId: "upstream/model-v2",
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      reportedCostMicros: 1250,
      responseId: "chatcmpl-1",
    });
  });

  it("keeps LM Studio and invalid LiteLLM cost unknown", async () => {
    configure("lmstudio");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { choices: [{ message: { content: "Done" } }] },
          { headers: { "x-litellm-response-cost": "not-a-number" } }
        )
      )
    );
    const result = await createOpenAICompatibleCompletion({
      runtimeId: "lmstudio",
      model: "loaded-model",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.reportedCostMicros).toBeNull();
    expect(result.modelId).toBe("loaded-model");
  });

  it("rejects provider tool calls and empty assistant output", async () => {
    configure("litellm");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: null, tool_calls: [{ id: "call-1" }] } }],
        })
      )
    );
    await expect(
      createOpenAICompatibleCompletion({
        runtimeId: "litellm",
        model: "alias",
        messages: [{ role: "user", content: "Use a tool" }],
      })
    ).rejects.toBeInstanceOf(CompatibleRuntimeCapabilityError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ choices: [{ message: { content: "  " } }] })
      )
    );
    await expect(
      createOpenAICompatibleCompletion({
        runtimeId: "litellm",
        model: "alias",
        messages: [{ role: "user", content: "Hello" }],
      })
    ).rejects.toThrow(/empty assistant response/);
  });

  it("names configured operation timeouts", async () => {
    configure("litellm");
    state.settings.set(SETTINGS_KEYS.SDK_TIMEOUT_SECONDS, "10");
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("This operation was aborted", "AbortError"));
            });
          })
      )
    );

    const completion = createOpenAICompatibleCompletion({
      runtimeId: "litellm",
      model: "alias",
      messages: [{ role: "user", content: "Hello" }],
    });
    const assertion = expect(completion).rejects.toMatchObject({
      name: "CompatibleRuntimeTimeoutError",
      timeoutSeconds: 10,
    } satisfies Partial<CompatibleRuntimeTimeoutError>);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });
});

describe("streaming compatible completions", () => {
  it("streams text and captures terminal usage/effective model", async () => {
    configure("lmstudio");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'data: {"id":"chat-1","model":"loaded-v2","choices":[{"delta":{"content":"Hel"}}]}',
          'data: {"choices":[{"delta":{"content":"lo"}}]}',
          'data: {"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}',
          "data: [DONE]",
        ])
      )
    );
    const deltas: string[] = [];
    const result = await streamOpenAICompatibleCompletion({
      runtimeId: "lmstudio",
      model: "loaded",
      messages: [{ role: "user", content: "Hello" }],
      onDelta: (delta) => deltas.push(delta),
    });
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(result).toMatchObject({
      text: "Hello",
      modelId: "loaded-v2",
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
    });
  });

  it("rejects malformed events, missing terminal markers, and empty streams", async () => {
    configure("litellm");
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(["data: {bad-json", "data: [DONE]"])));
    await expect(
      streamOpenAICompatibleCompletion({
        runtimeId: "litellm",
        model: "alias",
        messages: [{ role: "user", content: "Hello" }],
        onDelta: () => {},
      })
    ).rejects.toThrow(/malformed streaming JSON/);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse(['data: {"choices":[{"delta":{"content":"partial"}}]}'])
      )
    );
    await expect(
      streamOpenAICompatibleCompletion({
        runtimeId: "litellm",
        model: "alias",
        messages: [{ role: "user", content: "Hello" }],
        onDelta: () => {},
      })
    ).rejects.toThrow(/before the \[DONE\] marker/);

    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(["data: [DONE]"])));
    await expect(
      streamOpenAICompatibleCompletion({
        runtimeId: "litellm",
        model: "alias",
        messages: [{ role: "user", content: "Hello" }],
        onDelta: () => {},
      })
    ).rejects.toThrow(/empty assistant stream/);
  });

  it("preserves AbortError without disguising cancellation as an HTTP failure", async () => {
    configure("lmstudio");
    const abortError = new DOMException("This operation was aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(abortError)));
    await expect(
      streamOpenAICompatibleCompletion({
        runtimeId: "lmstudio",
        model: "loaded",
        messages: [{ role: "user", content: "Hello" }],
        onDelta: () => {},
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
