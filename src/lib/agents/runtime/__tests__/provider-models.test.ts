// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ settings: new Map<string, string>() }));

vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn(async (key: string) => state.settings.get(key) ?? null),
}));

import { SETTINGS_KEYS } from "@/lib/constants/settings";
import {
  discoverOpenAICompatibleProviderModels,
  getLMStudioModelDownloadStatus,
  startLMStudioModelDownload,
} from "../provider-models";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  state.settings.clear();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("provider model detail discovery", () => {
  it("merges safe LiteLLM detail while preserving reported zero values", async () => {
    state.settings.set(SETTINGS_KEYS.LITELLM_BASE_URL, "http://localhost:4000/v1");
    state.settings.set(SETTINGS_KEYS.LITELLM_API_KEY, "gateway-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: "support", owned_by: "router" }] }))
      .mockResolvedValueOnce(
        json({
          data: [
            {
              model_name: "support",
              litellm_params: {
                model: "openai/gpt-5-mini",
                api_key: "must-never-leak",
              },
              model_info: {
                max_input_tokens: 128_000,
                max_output_tokens: 0,
                input_cost_per_token: 0,
                output_cost_per_token: 0.000002,
                litellm_provider: "openai",
                mode: "chat",
              },
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await discoverOpenAICompatibleProviderModels("litellm");

    expect(result).toEqual({
      runtimeId: "litellm",
      models: [
        expect.objectContaining({
          id: "support",
          ownedBy: "router",
          upstreamModel: "openai/gpt-5-mini",
          maxOutputTokens: 0,
          inputCostPerToken: 0,
          publisher: "openai",
          mode: "chat",
        }),
      ],
    });
    expect(JSON.stringify(result)).not.toContain("must-never-leak");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:4000/v1/model/info",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer gateway-key" }),
        redirect: "manual",
      })
    );
  });

  it("keeps a healthy basic list when optional metadata is unavailable", async () => {
    state.settings.set(SETTINGS_KEYS.LITELLM_BASE_URL, "http://localhost:4000/v1");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ data: [{ id: "support" }] }))
        .mockResolvedValueOnce(json({ error: "not enabled" }, 404))
    );
    const result = await discoverOpenAICompatibleProviderModels("litellm");
    expect(result.models).toEqual([
      expect.objectContaining({ id: "support", name: "support" }),
    ]);
    expect(result.metadataWarning).toContain("model details unavailable");
  });

  it("filters obvious embedding models when optional metadata is unavailable", async () => {
    state.settings.set(SETTINGS_KEYS.LMSTUDIO_BASE_URL, "http://localhost:1234/v1");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ data: [{ id: "google/gemma" }, { id: "nomic-embed-text" }] }),
        )
        .mockResolvedValueOnce(json({ error: "not enabled" }, 404)),
    );

    const result = await discoverOpenAICompatibleProviderModels("lmstudio");

    expect(result.models.map((model) => model.id)).toEqual(["google/gemma"]);
    expect(result.excludedModelCount).toBe(1);
    expect(result.metadataWarning).toContain("model details unavailable");
  });

  it("normalizes LM Studio native model detail including false and zero", async () => {
    state.settings.set(SETTINGS_KEYS.LMSTUDIO_BASE_URL, "http://localhost:1234/v1");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json({ data: [{ id: "google/gemma" }] }))
        .mockResolvedValueOnce(
          json({
            models: [
              {
                key: "google/gemma",
                display_name: "Gemma",
                type: "llm",
                publisher: "google",
                architecture: "gemma",
                format: "gguf",
                params_string: "2B",
                quantization: { name: "Q4_K_M" },
                size_bytes: 0,
                max_context_length: 8192,
                loaded_instances: [],
                capabilities: { vision: false, trained_for_tool_use: true },
              },
            ],
          })
        )
    );
    const result = await discoverOpenAICompatibleProviderModels("lmstudio");
    expect(result.models).toEqual([
      expect.objectContaining({
        id: "google/gemma",
        name: "Gemma",
        sizeBytes: 0,
        loaded: false,
        loadedInstanceCount: 0,
        vision: false,
        trainedForToolUse: true,
      }),
    ]);
  });

  it("excludes embedding inventory from LM Studio generation totals", async () => {
    state.settings.set(SETTINGS_KEYS.LMSTUDIO_BASE_URL, "http://localhost:1234/v1");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ data: [{ id: "loaded-llm" }, { id: "text-embed" }] }),
        )
        .mockResolvedValueOnce(
          json({
            models: [
              {
                key: "loaded-llm",
                display_name: "Loaded LLM",
                type: "llm",
                loaded_instances: [{ config: { context_length: 4096 } }],
              },
              {
                key: "text-embed",
                display_name: "Text Embed",
                type: "embedding",
                loaded_instances: [],
              },
            ],
          }),
        ),
    );

    const result = await discoverOpenAICompatibleProviderModels("lmstudio");
    expect(result.models.map((model) => model.id)).toEqual(["loaded-llm"]);
    expect(result.excludedModelCount).toBe(1);
    expect(result.models[0]).toMatchObject({
      loaded: true,
      loadedInstanceCount: 1,
    });
  });
});

describe("LM Studio model download lifecycle", () => {
  beforeEach(() => {
    state.settings.set(SETTINGS_KEYS.LMSTUDIO_BASE_URL, "http://localhost:1234/v1");
    state.settings.set(SETTINGS_KEYS.LMSTUDIO_API_KEY, "lm-token");
  });

  it("starts a download and preserves a zero total size", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({ job_id: "job-1", status: "downloading", total_size_bytes: 0 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      startLMStudioModelDownload("ibm/granite", "Q4_K_M")
    ).resolves.toMatchObject({
      jobId: "job-1",
      status: "downloading",
      totalSizeBytes: 0,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:1234/api/v1/models/download",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: "ibm/granite", quantization: "Q4_K_M" }),
        redirect: "manual",
      })
    );
  });

  it("reads a completed status with bounded provider authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        job_id: "job-1",
        status: "completed",
        downloaded_bytes: 10,
        total_size_bytes: 10,
      })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(getLMStudioModelDownloadStatus("job-1")).resolves.toMatchObject({
      jobId: "job-1",
      status: "completed",
      downloadedBytes: 10,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:1234/api/v1/models/download/status/job-1",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer lm-token" }),
      })
    );
  });
});
