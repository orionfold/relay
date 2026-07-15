/** @vitest-environment node */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { getSetting, setSetting } from "@/lib/settings/helpers";
import { GET, PUT } from "../route";

const OLLAMA_KEYS = [
  SETTINGS_KEYS.OLLAMA_BASE_URL,
  SETTINGS_KEYS.OLLAMA_API_KEY,
  SETTINGS_KEYS.OLLAMA_DEFAULT_MODEL,
  SETTINGS_KEYS.OLLAMA_ALLOW_INSECURE_REMOTE,
] as const;

function request(body: unknown) {
  return new NextRequest("http://relay.test/api/settings/ollama", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("OLLAMA_API_KEY", "");
  for (const key of OLLAMA_KEYS) {
    db.delete(settings).where(eq(settings.key, key)).run();
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/settings/ollama redacted settings contract", () => {
  it("returns the normalized default and never returns an API key", async () => {
    vi.stubEnv("OLLAMA_API_KEY", "environment-secret");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      runtimeId: "ollama",
      label: "Ollama",
      configured: true,
      baseUrl: "http://localhost:11434",
      defaultModel: "",
      allowInsecureRemote: false,
      hasApiKey: true,
      apiKeySource: "env",
    });
  });

  it("saves the full validated form and preserves a blank secret by omission", async () => {
    await setSetting(SETTINGS_KEYS.OLLAMA_API_KEY, "saved-secret");
    const response = await PUT(
      request({
        baseUrl: "http://ollama.lan:11434/",
        defaultModel: "qwen3:8b",
        allowInsecureRemote: true,
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      baseUrl: "http://ollama.lan:11434",
      defaultModel: "qwen3:8b",
      allowInsecureRemote: true,
      hasApiKey: true,
      apiKeySource: "db",
    });
    expect(await getSetting(SETTINGS_KEYS.OLLAMA_API_KEY)).toBe("saved-secret");
  });

  it("rejects unsafe remote HTTP before writing any proposed field", async () => {
    const response = await PUT(
      request({
        baseUrl: "http://ollama.lan:11434",
        defaultModel: "must-not-persist",
        allowInsecureRemote: false,
      })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining("explicitly allow insecure remote HTTP"),
    });
    expect(await getSetting(SETTINGS_KEYS.OLLAMA_BASE_URL)).toBeNull();
    expect(await getSetting(SETTINGS_KEYS.OLLAMA_DEFAULT_MODEL)).toBeNull();
  });

  it("uses an explicit clear flag and refuses ambiguous key mutations", async () => {
    await setSetting(SETTINGS_KEYS.OLLAMA_API_KEY, "saved-secret");
    const cleared = await PUT(request({ clearApiKey: true }));
    expect(cleared.status).toBe(200);
    expect(await getSetting(SETTINGS_KEYS.OLLAMA_API_KEY)).toBeNull();

    const ambiguous = await PUT(
      request({ apiKey: "replacement", clearApiKey: true })
    );
    expect(ambiguous.status).toBe(400);
  });

  it("rejects malformed JSON, unknown fields, and blank API keys", async () => {
    expect((await PUT(request("{"))).status).toBe(400);
    expect((await PUT(request({ unknown: true }))).status).toBe(400);
    expect((await PUT(request({ apiKey: " " }))).status).toBe(400);
  });
});
