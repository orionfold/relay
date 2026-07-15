import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, invalidate } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn(async (key: string) => store.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteSetting: vi.fn(async (key: string) => {
    store.delete(key);
  }),
  applySettingsPatch: vi.fn(async (patch: Record<string, string | null>) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) store.delete(key);
      else store.set(key, value);
    }
  }),
}));

vi.mock("@/lib/chat/model-discovery", () => ({
  invalidateModelDiscoveryCache: invalidate,
}));

import { GET, PUT } from "../route";

const context = (runtimeId: string) => ({ params: Promise.resolve({ runtimeId }) });

function request(body: unknown) {
  return new NextRequest("http://localhost/api/settings/openai-compatible/litellm", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("compatible runtime settings route", () => {
  beforeEach(() => {
    store.clear();
    invalidate.mockClear();
    vi.unstubAllEnvs();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns only redacted credential state", async () => {
    store.set("litellm.baseUrl", "https://gateway.example/v1");
    store.set("litellm.apiKey", "saved-secret");

    const response = await GET(
      new NextRequest("http://localhost/api/settings/openai-compatible/litellm"),
      context("litellm")
    );
    const body = await response.json();

    expect(body.hasApiKey).toBe(true);
    expect(body.apiKeySource).toBe("db");
    expect(JSON.stringify(body)).not.toContain("saved-secret");
  });

  it("validates the effective remote HTTP endpoint before any write", async () => {
    store.set("litellm.baseUrl", "https://gateway.example/v1");
    store.set("litellm.defaultModel", "support");

    const response = await PUT(
      request({
        baseUrl: "http://192.168.1.20:4000/v1",
        defaultModel: "changed",
      }),
      context("litellm")
    );

    expect(response.status).toBe(400);
    expect(store.get("litellm.baseUrl")).toBe("https://gateway.example/v1");
    expect(store.get("litellm.defaultModel")).toBe("support");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("persists explicit remote HTTP consent and redacts a new key", async () => {
    const response = await PUT(
      request({
        baseUrl: "http://192.168.1.20:4000/v1",
        apiKey: "new-secret",
        defaultModel: "support",
        allowInsecureRemote: true,
      }),
      context("litellm")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hasApiKey).toBe(true);
    expect(body.apiKeySource).toBe("db");
    expect(JSON.stringify(body)).not.toContain("new-secret");
    expect(store.get("litellm.allowInsecureRemote")).toBe("true");
    expect(invalidate).toHaveBeenCalledOnce();
  });

  it("requires explicit clearApiKey and rejects unknown fields", async () => {
    store.set("lmstudio.apiKey", "keep-me");

    const blank = await PUT(
      request({ apiKey: "" }),
      context("lmstudio")
    );
    expect(blank.status).toBe(200);
    expect(store.get("lmstudio.apiKey")).toBe("keep-me");

    const cleared = await PUT(
      request({ clearApiKey: true }),
      context("lmstudio")
    );
    expect(cleared.status).toBe(200);
    expect(store.has("lmstudio.apiKey")).toBe(false);

    const unknown = await PUT(
      request({ apiKey: "x", secretEcho: true }),
      context("lmstudio")
    );
    expect(unknown.status).toBe(400);
  });
});
