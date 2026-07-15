import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Scope the DB to a per-file temp dir BEFORE importing the route module.
const tmp = mkdtempSync(join(tmpdir(), "ainative-route-runtime-allowlist-"));
process.env.RELAY_DATA_DIR = tmp;

vi.mock("@/lib/environment/auto-scan", () => ({
  ensureFreshScan: vi.fn(),
}));

// eslint-disable-next-line import/first
import { POST } from "../route";
// eslint-disable-next-line import/first
import { db } from "@/lib/db";
// eslint-disable-next-line import/first
import { conversations, chatMessages } from "@/lib/db/schema";

function makePostRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/chat/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat/conversations — runtime allow-list (#30)", () => {
  afterEach(async () => {
    await db.delete(chatMessages);
    await db.delete(conversations);
  });

  // The regression this guards: "ollama" was omitted from validRuntimes, so the
  // The privacy-focused Ollama tier 400'd on its first chat/compose. engine.ts
  // routes "ollama" to sendOllamaMessage, so the runtime is first-class — the
  // create route must accept it.
  it("accepts runtimeId=ollama (Best-privacy local tier) with 201", async () => {
    const res = await POST(
      makePostRequest({ runtimeId: "ollama", modelId: "ollama:llama3" }) as never
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.runtimeId).toBe("ollama");
  });

  it("accepts every runtime with a declared Chat engine", async () => {
    for (const runtimeId of [
      "claude-code",
      "openai-codex-app-server",
      "litellm",
      "lmstudio",
    ]) {
      const res = await POST(makePostRequest({ runtimeId }) as never);
      expect(res.status).toBe(201);
    }
  });

  it.each(["anthropic-direct", "openai-direct"])(
    "rejects task-only runtime %s instead of falling through to another Chat engine",
    async (runtimeId) => {
      const res = await POST(makePostRequest({ runtimeId }) as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("Invalid runtimeId");
    }
  );

  it("still rejects an unknown runtimeId with 400", async () => {
    const res = await POST(
      makePostRequest({ runtimeId: "totally-made-up" }) as never
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid runtimeId/);
  });

  it("still requires a runtimeId", async () => {
    const res = await POST(makePostRequest({}) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/runtimeId is required/);
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
