/** @vitest-environment node */

import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { getSetting, setSetting } from "@/lib/settings/helpers";
import { GET, PUT } from "../route";

function request(body: unknown) {
  return new NextRequest("http://relay.test/api/settings/routing", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  db.delete(settings)
    .where(eq(settings.key, SETTINGS_KEYS.ROUTING_PREFERENCE))
    .run();
  db.delete(settings).where(eq(settings.key, SETTINGS_KEYS.ROUTING_POLICY)).run();
});

describe("/api/settings/routing", () => {
  it("returns the documented v1 defaults when no policy exists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      preference: "latency",
      source: "default",
      needsPersistence: true,
      repairReason: null,
      policy: {
        version: 1,
        eligibleRuntimeIds: expect.arrayContaining(["ollama", "litellm", "lmstudio"]),
        manualDefaultRuntimeId: "claude-code",
        automaticFallback: true,
      },
    });
  });

  it("atomically persists preference and the ordered policy", async () => {
    const response = await PUT(
      request({
        preference: "cost",
        policy: {
          version: 1,
          eligibleRuntimeIds: ["lmstudio", "litellm"],
          manualDefaultRuntimeId: "lmstudio",
          automaticFallback: false,
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      preference: "cost",
      source: "stored",
      policy: {
        eligibleRuntimeIds: ["lmstudio", "litellm"],
        manualDefaultRuntimeId: "lmstudio",
        automaticFallback: false,
      },
    });
    expect(await getSetting(SETTINGS_KEYS.ROUTING_PREFERENCE)).toBe("cost");
    expect(JSON.parse((await getSetting(SETTINGS_KEYS.ROUTING_POLICY)) ?? "{}")).toMatchObject({
      version: 1,
      eligibleRuntimeIds: ["lmstudio", "litellm"],
    });
  });

  it("rejects malformed, partial, duplicate, and unknown-id payloads without writes", async () => {
    const invalid = [
      "{",
      { preference: "cost" },
      {
        preference: "cost",
        policy: {
          version: 1,
          eligibleRuntimeIds: ["ollama", "ollama"],
          manualDefaultRuntimeId: "ollama",
          automaticFallback: true,
        },
      },
      {
        preference: "cost",
        policy: {
          version: 1,
          eligibleRuntimeIds: ["unknown"],
          manualDefaultRuntimeId: "ollama",
          automaticFallback: true,
        },
      },
    ];
    for (const body of invalid) {
      expect((await PUT(request(body))).status).toBe(400);
    }
    expect(await getSetting(SETTINGS_KEYS.ROUTING_PREFERENCE)).toBeNull();
    expect(await getSetting(SETTINGS_KEYS.ROUTING_POLICY)).toBeNull();
  });

  it("surfaces conservative repair state for corrupt storage", async () => {
    await setSetting(SETTINGS_KEYS.ROUTING_POLICY, "{");
    const response = await GET();
    expect(await response.json()).toMatchObject({
      source: "repaired",
      needsPersistence: true,
      policy: { eligibleRuntimeIds: [], automaticFallback: false },
      repairReason: expect.stringContaining("not valid JSON"),
    });
  });
});
