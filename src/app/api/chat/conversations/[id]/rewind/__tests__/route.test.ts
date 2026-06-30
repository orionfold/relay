import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tmp = mkdtempSync(join(tmpdir(), "ainative-route-rewind-"));
process.env.RELAY_DATA_DIR = tmp;

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
// eslint-disable-next-line import/first
import { eq } from "drizzle-orm";

const ORIG_FLAG = process.env.RELAY_CHAT_BRANCHING;

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/chat/conversations/x/rewind", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chat/conversations/[id]/rewind", () => {
  beforeEach(() => {
    process.env.RELAY_CHAT_BRANCHING = "true";
  });
  afterEach(async () => {
    await db.delete(chatMessages);
    await db.delete(conversations);
    if (ORIG_FLAG === undefined) delete process.env.RELAY_CHAT_BRANCHING;
    else process.env.RELAY_CHAT_BRANCHING = ORIG_FLAG;
  });

  it("marks (user, assistant) pair rewound and returns the user content", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    await addMessage({
      conversationId: conv.id,
      role: "user",
      content: "hello",
    });
    const asstMsg = await addMessage({
      conversationId: conv.id,
      role: "assistant",
      content: "hi",
    });

    const res = await POST(
      makeReq({ assistantMessageId: asstMsg.id }) as never,
      { params: Promise.resolve({ id: conv.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rewoundUserContent).toBe("hello");

    const fresh = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conv.id))
      .all();
    for (const m of fresh) {
      expect(m.rewoundAt).not.toBeNull();
    }
  });

  it("returns 400 when assistantMessageId is missing", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    const res = await POST(makeReq({}) as never, {
      params: Promise.resolve({ id: conv.id }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when flag is off", async () => {
    process.env.RELAY_CHAT_BRANCHING = "false";
    const conv = await createConversation({ runtimeId: "claude-code" });
    const res = await POST(makeReq({ assistantMessageId: "x" }) as never, {
      params: Promise.resolve({ id: conv.id }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when conversation does not exist", async () => {
    const res = await POST(makeReq({ assistantMessageId: "x" }) as never, {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
