/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { setSetting } from "@/lib/settings/helpers";
import { GET, POST } from "../route";

function post(body: unknown) {
  return POST(
    new NextRequest("http://relay.test/api/runtimes/ollama", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  db.delete(settings).where(eq(settings.key, SETTINGS_KEYS.OLLAMA_BASE_URL)).run();
  db.delete(settings).where(eq(settings.key, SETTINGS_KEYS.OLLAMA_API_KEY)).run();
  db.delete(settings).where(eq(settings.key, SETTINGS_KEYS.OLLAMA_ALLOW_INSECURE_REMOTE)).run();
  vi.stubEnv("OLLAMA_API_KEY", "");
});

describe("/api/runtimes/ollama boundary contract", () => {
  it("discovers models from the configured server-side endpoint", async () => {
    await setSetting(SETTINGS_KEYS.OLLAMA_BASE_URL, "http://ollama.lan:11434");
    await setSetting(SETTINGS_KEYS.OLLAMA_ALLOW_INSECURE_REMOTE, "true");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ models: [{ name: "qwen3:8b" }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      runtimeId: "ollama",
      models: [
        {
          id: "qwen3:8b",
          name: "qwen3:8b",
          provider: "ollama",
          family: null,
          format: null,
          parameterSize: null,
          quantization: null,
          sizeBytes: null,
          modifiedAt: null,
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ollama.lan:11434/api/tags",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        redirect: "manual",
      })
    );
  });

  it("names upstream status and transport failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));
    const upstream = await GET();
    expect(upstream.status).toBe(502);
    expect(await upstream.json()).toEqual({
      phase: "connection",
      error: "Ollama request failed (503): down",
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("host unreachable")));
    const transport = await GET();
    expect(transport.status).toBe(502);
    expect(await transport.json()).toEqual({
      phase: "connection",
      error: "host unreachable",
      hint: "Make sure the configured Ollama server is reachable from Relay.",
    });
  });

  it("rejects malformed pull requests before network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const malformed = await post("{");
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toMatchObject({ phase: "acquisition" });

    const action = await post({ action: "delete", model: "qwen3:8b" });
    expect(action.status).toBe(400);

    const model = await post({ action: "pull" });
    expect(model.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serializes a pull request and exposes upstream refusal", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ status: "success" }))
      .mockResolvedValueOnce(new Response("model missing", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const success = await post({ action: "pull", model: "qwen3:8b" });
    expect(success.status).toBe(200);
    expect(await success.json()).toMatchObject({ status: "success", model: "qwen3:8b" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:11434/api/pull",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ model: "qwen3:8b", stream: false }),
        redirect: "manual",
      })
    );

    const refused = await post({ action: "pull", model: "missing" });
    expect(refused.status).toBe(502);
    expect(await refused.json()).toEqual({
      phase: "acquisition",
      error: "Ollama pull failed (404): model missing",
    });
  });

  it("uses a configured Bearer key without exposing it in the response", async () => {
    await setSetting(SETTINGS_KEYS.OLLAMA_API_KEY, "cloud-secret");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ models: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:11434/api/tags",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer cloud-secret" }),
      })
    );
    expect(JSON.stringify(await response.json())).not.toContain("cloud-secret");
  });
});
