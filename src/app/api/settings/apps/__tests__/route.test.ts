import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const store = new Map<string, string>();

vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn(async (key: string) => store.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
}));

import { GET, POST } from "../route";

describe("app diagnostics settings API", () => {
  beforeEach(() => store.clear());

  it("defaults diagnostics to off", async () => {
    const response = await GET();
    expect(await response.json()).toEqual({ showInferenceDiagnostics: false });
  });

  it("persists and returns the enabled state", async () => {
    const response = await POST(new NextRequest("http://localhost/api/settings/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showInferenceDiagnostics: true }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ showInferenceDiagnostics: true });
    expect(await (await GET()).json()).toEqual({ showInferenceDiagnostics: true });
  });

  it("rejects malformed or expanded payloads without changing the setting", async () => {
    const response = await POST(new NextRequest("http://localhost/api/settings/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ showInferenceDiagnostics: "yes", extra: true }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid app diagnostics setting");
    expect(await (await GET()).json()).toEqual({ showInferenceDiagnostics: false });
  });
});
