import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const tmp = mkdtempSync(join(tmpdir(), "ainative-route-redo-"));
process.env.RELAY_DATA_DIR = tmp;

vi.mock("@/lib/environment/auto-scan", () => ({
  ensureFreshScan: vi.fn(),
}));

// eslint-disable-next-line import/first
import { POST } from "../route";
// eslint-disable-next-line import/first
import {
  createConversation,
  addMessage,
  markPairRewound,
} from "@/lib/data/chat";
// eslint-disable-next-line import/first
import { db } from "@/lib/db";
// eslint-disable-next-line import/first
import { conversations, chatMessages } from "@/lib/db/schema";

const ORIG_FLAG = process.env.RELAY_CHAT_BRANCHING;

function makeReq(): Request {
  return new Request("http://localhost/api/chat/conversations/x/redo", {
    method: "POST",
  });
}

describe("POST /api/chat/conversations/[id]/redo", () => {
  beforeEach(() => {
    process.env.RELAY_CHAT_BRANCHING = "true";
  });
  afterEach(async () => {
    await db.delete(chatMessages);
    await db.delete(conversations);
    if (ORIG_FLAG === undefined) delete process.env.RELAY_CHAT_BRANCHING;
    else process.env.RELAY_CHAT_BRANCHING = ORIG_FLAG;
  });

  it("restores the most recently rewound pair", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    await addMessage({ conversationId: conv.id, role: "user", content: "hi" });
    const a = await addMessage({
      conversationId: conv.id,
      role: "assistant",
      content: "yo",
    });
    await markPairRewound(a.id);

    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: conv.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.restoredMessageIds).toHaveLength(2);
  });

  it("returns 200 with empty array when nothing is rewound", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: conv.id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.restoredMessageIds).toEqual([]);
  });

  it("returns 404 when flag is off", async () => {
    process.env.RELAY_CHAT_BRANCHING = "false";
    const conv = await createConversation({ runtimeId: "claude-code" });
    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: conv.id }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when conversation does not exist", async () => {
    const res = await POST(makeReq() as never, {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
