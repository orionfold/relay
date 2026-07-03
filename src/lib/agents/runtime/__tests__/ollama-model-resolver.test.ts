// @vitest-environment node
/**
 * Ollama model resolution tests — guards issue #25 (fresh-install phantom
 * `llama3.2` default → 404). No app-module imports; `fetch` is stubbed.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveOllamaModel,
  listPulledOllamaModels,
  OllamaModelNotConfiguredError,
} from "../ollama-model-resolver";

const BASE = "http://localhost:11434";

function stubTags(models: string[] | { ok: false }) {
  const fetchMock = vi.fn(async () => {
    if (!Array.isArray(models)) {
      return { ok: false, status: 500 } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ models: models.map((name) => ({ name })) }),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveOllamaModel", () => {
  it("prefers an explicitly requested model over everything", async () => {
    const fetchMock = stubTags(["qwen2.5"]);
    const model = await resolveOllamaModel(BASE, "gpt-oss", "llama3.2");
    expect(model).toBe("gpt-oss");
    expect(fetchMock).not.toHaveBeenCalled(); // no /api/tags needed
  });

  it("uses the configured default when no explicit model", async () => {
    stubTags(["qwen2.5"]);
    const model = await resolveOllamaModel(BASE, null, "llama3.2");
    expect(model).toBe("llama3.2");
  });

  it("falls back to the first pulled model when default is empty (the #25 fix)", async () => {
    stubTags(["qwen2.5", "gemma3n"]);
    // Fresh install: no explicit, no default → must NOT return phantom llama3.2
    const model = await resolveOllamaModel(BASE, null, "");
    expect(model).toBe("qwen2.5");
  });

  it("treats whitespace-only settings as empty", async () => {
    stubTags(["deepseek-r1"]);
    const model = await resolveOllamaModel(BASE, "  ", "  ");
    expect(model).toBe("deepseek-r1");
  });

  it("throws a named error when nothing is configured and nothing is pulled", async () => {
    stubTags([]);
    await expect(resolveOllamaModel(BASE, null, "")).rejects.toBeInstanceOf(
      OllamaModelNotConfiguredError,
    );
  });

  it("throws the named error (not a phantom) when /api/tags is unreachable", async () => {
    stubTags({ ok: false });
    await expect(resolveOllamaModel(BASE, "", "")).rejects.toBeInstanceOf(
      OllamaModelNotConfiguredError,
    );
  });
});

describe("listPulledOllamaModels", () => {
  it("returns pulled model names", async () => {
    stubTags(["qwen2.5", "gpt-oss"]);
    expect(await listPulledOllamaModels(BASE)).toEqual(["qwen2.5", "gpt-oss"]);
  });

  it("returns [] on a non-ok response instead of throwing", async () => {
    stubTags({ ok: false });
    expect(await listPulledOllamaModels(BASE)).toEqual([]);
  });
});
