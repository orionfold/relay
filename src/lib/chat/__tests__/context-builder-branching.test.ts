import { afterAll, afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Scope the DB to a per-file temp dir BEFORE importing the chat modules.
const tmp = mkdtempSync(join(tmpdir(), "ainative-ctx-branching-"));
process.env.RELAY_DATA_DIR = tmp;

// eslint-disable-next-line import/first
import {
  createConversation,
  addMessage,
  markPairRewound,
  MAX_BRANCH_DEPTH,
} from "@/lib/data/chat";
// eslint-disable-next-line import/first
import { buildChatContext } from "../context-builder";
// eslint-disable-next-line import/first
import { db } from "@/lib/db";
// eslint-disable-next-line import/first
import { conversations, chatMessages } from "@/lib/db/schema";

describe("context-builder + branching", () => {
  afterEach(async () => {
    await db.delete(chatMessages);
    await db.delete(conversations);
  });

  it("linear conversation behaves identically to pre-branching baseline", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    await addMessage({
      conversationId: conv.id,
      role: "user",
      content: "linear ask",
    });
    await addMessage({
      conversationId: conv.id,
      role: "assistant",
      content: "linear answer",
    });

    const ctx = await buildChatContext({ conversationId: conv.id });
    expect(ctx.history.map((m) => m.content)).toEqual([
      "linear ask",
      "linear answer",
    ]);
    expect(ctx.history.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("branch conversation reconstructs ancestor prefix in history", async () => {
    const root = await createConversation({ runtimeId: "claude-code" });
    await addMessage({
      conversationId: root.id,
      role: "user",
      content: "root ask",
    });
    const a1 = await addMessage({
      conversationId: root.id,
      role: "assistant",
      content: "root answer",
    });
    // Post-branch-point messages — must NOT appear in branch history.
    await addMessage({
      conversationId: root.id,
      role: "user",
      content: "post-branch ask",
    });

    const branch = await createConversation({
      runtimeId: "claude-code",
      parentConversationId: root.id,
      branchedFromMessageId: a1.id,
    });
    await addMessage({
      conversationId: branch.id,
      role: "user",
      content: "branched ask",
    });

    const ctx = await buildChatContext({ conversationId: branch.id });
    expect(ctx.history.map((m) => m.content)).toEqual([
      "root ask",
      "root answer",
      "branched ask",
    ]);
  });

  it("rewound pairs are excluded from the agent-visible history", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    await addMessage({
      conversationId: conv.id,
      role: "user",
      content: "rewound-user",
    });
    const rewindable = await addMessage({
      conversationId: conv.id,
      role: "assistant",
      content: "rewound-assistant",
    });
    await markPairRewound(rewindable.id);

    await addMessage({
      conversationId: conv.id,
      role: "user",
      content: "live-user",
    });

    const ctx = await buildChatContext({ conversationId: conv.id });
    expect(ctx.history.map((m) => m.content)).toEqual(["live-user"]);
  });

  it("prepends a depth-cap notice when the ancestor chain exceeds MAX_BRANCH_DEPTH", async () => {
    let prevConvId: string | null = null;
    let prevMessageId: string | null = null;
    let leafId: string | null = null;
    for (let i = 0; i < MAX_BRANCH_DEPTH + 2; i++) {
      const c = await createConversation({
        runtimeId: "claude-code",
        parentConversationId: prevConvId,
        branchedFromMessageId: prevMessageId,
      });
      const m = await addMessage({
        conversationId: c.id,
        role: "assistant",
        content: `msg${i}`,
      });
      prevConvId = c.id;
      prevMessageId = m.id;
      leafId = c.id;
    }

    const ctx = await buildChatContext({ conversationId: leafId! });
    const first = ctx.history[0];
    expect(first.role).toBe("system");
    expect(first.content).toMatch(/branch ancestry exceeded/);
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
