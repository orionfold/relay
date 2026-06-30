import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Scope the DB to a per-file temp dir BEFORE importing the route module.
const tmp = mkdtempSync(join(tmpdir(), "ainative-route-branching-"));
process.env.RELAY_DATA_DIR = tmp;

// Stub auto-scan to avoid filesystem side effects in unit tests.
vi.mock("@/lib/environment/auto-scan", () => ({
  ensureFreshScan: vi.fn(),
}));

// eslint-disable-next-line import/first
import { POST } from "../route";
// eslint-disable-next-line import/first
import { createConversation, addMessage } from "@/lib/data/chat";
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

describe("POST /api/chat/conversations — branching", () => {
  afterEach(async () => {
    await db.delete(chatMessages);
    await db.delete(conversations);
  });

  it("creates a branch when parent + branchedFrom are valid", async () => {
    const root = await createConversation({ runtimeId: "claude-code" });
    const msg = await addMessage({
      conversationId: root.id,
      role: "assistant",
      content: "fork here",
    });

    const res = await POST(
      makePostRequest({
        runtimeId: "claude-code",
        parentConversationId: root.id,
        branchedFromMessageId: msg.id,
      }) as never
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.parentConversationId).toBe(root.id);
    expect(body.branchedFromMessageId).toBe(msg.id);
  });

  it("rejects with 400 when parent is provided without branchedFrom", async () => {
    const root = await createConversation({ runtimeId: "claude-code" });

    const res = await POST(
      makePostRequest({
        runtimeId: "claude-code",
        parentConversationId: root.id,
      }) as never
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/both/);
  });

  it("rejects with 400 when branchedFrom is provided without parent", async () => {
    const res = await POST(
      makePostRequest({
        runtimeId: "claude-code",
        branchedFromMessageId: "some-message-id",
      }) as never
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/both/);
  });

  it("rejects with 404 when parent conversation does not exist", async () => {
    const res = await POST(
      makePostRequest({
        runtimeId: "claude-code",
        parentConversationId: "nonexistent",
        branchedFromMessageId: "also-nonexistent",
      }) as never
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Parent conversation/);
  });

  it("rejects with 400 when branchedFrom belongs to a different conversation", async () => {
    const a = await createConversation({ runtimeId: "claude-code" });
    const b = await createConversation({ runtimeId: "claude-code" });
    // The message belongs to conversation A, but we'll claim it as a branch
    // point of conversation B — should reject.
    const msgInA = await addMessage({
      conversationId: a.id,
      role: "assistant",
      content: "in A",
    });

    const res = await POST(
      makePostRequest({
        runtimeId: "claude-code",
        parentConversationId: b.id,
        branchedFromMessageId: msgInA.id,
      }) as never
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/does not belong/);
  });

  it("creates a linear conversation unchanged (parent fields stay null)", async () => {
    const res = await POST(
      makePostRequest({
        runtimeId: "claude-code",
        title: "linear",
      }) as never
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.parentConversationId).toBeNull();
    expect(body.branchedFromMessageId).toBeNull();
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
