import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tmp = mkdtempSync(join(tmpdir(), "ainative-route-branches-"));
process.env.RELAY_DATA_DIR = tmp;

vi.mock("@/lib/environment/auto-scan", () => ({
  ensureFreshScan: vi.fn(),
}));

// eslint-disable-next-line import/first
import { GET } from "../route";
// eslint-disable-next-line import/first
import { createConversation, addMessage } from "@/lib/data/chat";
// eslint-disable-next-line import/first
import { db } from "@/lib/db";
// eslint-disable-next-line import/first
import { conversations, chatMessages } from "@/lib/db/schema";

const ORIG_FLAG = process.env.RELAY_CHAT_BRANCHING;

function makeReq(): Request {
  return new Request("http://localhost/api/chat/conversations/x/branches");
}

describe("GET /api/chat/conversations/[id]/branches", () => {
  beforeEach(() => {
    process.env.RELAY_CHAT_BRANCHING = "true";
  });
  afterEach(async () => {
    await db.delete(chatMessages);
    await db.delete(conversations);
    if (ORIG_FLAG === undefined) delete process.env.RELAY_CHAT_BRANCHING;
    else process.env.RELAY_CHAT_BRANCHING = ORIG_FLAG;
  });

  it("returns the family list for a branched conversation", async () => {
    const root = await createConversation({ runtimeId: "claude-code" });
    const m = await addMessage({
      conversationId: root.id,
      role: "assistant",
      content: "fork",
    });
    const child = await createConversation({
      runtimeId: "claude-code",
      parentConversationId: root.id,
      branchedFromMessageId: m.id,
    });

    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: child.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.family).toHaveLength(2);
    expect(
      body.family.map((c: { id: string }) => c.id).sort()
    ).toEqual([root.id, child.id].sort());
  });

  it("returns 404 when conversation does not exist", async () => {
    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when flag is off (branching invisible to clients)", async () => {
    process.env.RELAY_CHAT_BRANCHING = "false";
    const root = await createConversation({ runtimeId: "claude-code" });

    const res = await GET(makeReq() as never, {
      params: Promise.resolve({ id: root.id }),
    });
    expect(res.status).toBe(404);
  });
});
