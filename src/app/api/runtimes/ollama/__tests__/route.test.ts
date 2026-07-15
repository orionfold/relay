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
});

describe("/api/runtimes/ollama boundary contract", () => {
  it("discovers models from the configured server-side endpoint", async () => {
    await setSetting(SETTINGS_KEYS.OLLAMA_BASE_URL, "http://ollama.lan:11434");
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ models: [{ name: "qwen3:8b" }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ models: [{ name: "qwen3:8b" }] });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ollama.lan:11434/api/tags",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("names upstream status and transport failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));
    const upstream = await GET();
    expect(upstream.status).toBe(502);
    expect(await upstream.json()).toEqual({ error: "Ollama responded with status 503" });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("host unreachable")));
    const transport = await GET();
    expect(transport.status).toBe(502);
    expect(await transport.json()).toEqual({
      error: "host unreachable",
      hint: "Make sure Ollama is running (ollama serve).",
    });
  });

  it("rejects malformed pull requests before network access", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const malformed = await post("{");
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Invalid JSON body" });

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
        body: JSON.stringify({ name: "qwen3:8b", stream: false }),
      })
    );

    const refused = await post({ action: "pull", model: "missing" });
    expect(refused.status).toBe(502);
    expect(await refused.json()).toEqual({
      error: "Ollama pull failed (404): model missing",
    });
  });
});
