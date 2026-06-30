import { afterAll, afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Scope the DB to a per-file temp dir BEFORE importing the data module.
// The chat module's @/lib/db import initialises a singleton against this path.
const tmp = mkdtempSync(join(tmpdir(), "ainative-branching-"));
process.env.RELAY_DATA_DIR = tmp;

// eslint-disable-next-line import/first
import {
  createConversation,
  addMessage,
  getMessagesWithAncestors,
  markPairRewound,
  restoreLatestRewoundPair,
  getConversationFamily,
  MAX_BRANCH_DEPTH,
} from "../chat";
// eslint-disable-next-line import/first
import { db } from "@/lib/db";
// eslint-disable-next-line import/first
import { conversations, chatMessages } from "@/lib/db/schema";

describe("chat branching data layer", () => {
  beforeAll(() => {
    // No-op — db singleton initialises on import.
  });

  afterEach(async () => {
    await db.delete(chatMessages);
    await db.delete(conversations);
  });

  it("createConversation persists parent + branchedFrom columns", async () => {
    const root = await createConversation({ runtimeId: "claude-code" });
    const msg = await addMessage({
      conversationId: root.id,
      role: "assistant",
      content: "first response",
    });
    const branch = await createConversation({
      runtimeId: "claude-code",
      parentConversationId: root.id,
      branchedFromMessageId: msg.id,
    });

    expect(branch.parentConversationId).toBe(root.id);
    expect(branch.branchedFromMessageId).toBe(msg.id);
  });

  it("getMessagesWithAncestors on a linear conversation = same as getMessages", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    await addMessage({ conversationId: conv.id, role: "user", content: "hi" });
    await addMessage({ conversationId: conv.id, role: "assistant", content: "hello" });

    const { messages, depthCapped } = await getMessagesWithAncestors(conv.id);
    expect(messages.map((m) => m.content)).toEqual(["hi", "hello"]);
    expect(depthCapped).toBe(false);
  });

  it("getMessagesWithAncestors on a branch reconstructs the prefix from the parent", async () => {
    const root = await createConversation({ runtimeId: "claude-code" });
    const u1 = await addMessage({
      conversationId: root.id,
      role: "user",
      content: "u1",
    });
    const a1 = await addMessage({
      conversationId: root.id,
      role: "assistant",
      content: "a1",
    });
    // These messages are AFTER the branch point — they must NOT appear
    // in the branch's flattened context.
    await addMessage({ conversationId: root.id, role: "user", content: "u2" });
    await addMessage({
      conversationId: root.id,
      role: "assistant",
      content: "a2",
    });

    const branch = await createConversation({
      runtimeId: "claude-code",
      parentConversationId: root.id,
      branchedFromMessageId: a1.id,
    });
    await addMessage({
      conversationId: branch.id,
      role: "user",
      content: "branched-question",
    });
    await addMessage({
      conversationId: branch.id,
      role: "assistant",
      content: "branched-answer",
    });

    const { messages, depthCapped } = await getMessagesWithAncestors(branch.id);
    expect(messages.map((m) => m.content)).toEqual([
      "u1",
      "a1",
      "branched-question",
      "branched-answer",
    ]);
    expect(depthCapped).toBe(false);
    // Sanity: u1/a1 came from the root, not duplicated into the branch.
    expect(messages[0].conversationId).toBe(root.id);
    expect(messages[2].conversationId).toBe(branch.id);
    // u1 used to verify branch-point inclusivity (createdAt <= a1.createdAt).
    expect(u1.id).toBe(messages[0].id);
  });

  it("getMessagesWithAncestors handles 2-deep branches", async () => {
    const root = await createConversation({ runtimeId: "claude-code" });
    await addMessage({ conversationId: root.id, role: "user", content: "r1u" });
    const r1a = await addMessage({
      conversationId: root.id,
      role: "assistant",
      content: "r1a",
    });

    const mid = await createConversation({
      runtimeId: "claude-code",
      parentConversationId: root.id,
      branchedFromMessageId: r1a.id,
    });
    await addMessage({ conversationId: mid.id, role: "user", content: "m1u" });
    const m1a = await addMessage({
      conversationId: mid.id,
      role: "assistant",
      content: "m1a",
    });

    const leaf = await createConversation({
      runtimeId: "claude-code",
      parentConversationId: mid.id,
      branchedFromMessageId: m1a.id,
    });
    await addMessage({
      conversationId: leaf.id,
      role: "user",
      content: "l1u",
    });

    const { messages, depthCapped } = await getMessagesWithAncestors(leaf.id);
    expect(messages.map((m) => m.content)).toEqual([
      "r1u",
      "r1a",
      "m1u",
      "m1a",
      "l1u",
    ]);
    expect(depthCapped).toBe(false);
  });

  it("getMessagesWithAncestors filters rewoundAt across all layers", async () => {
    const root = await createConversation({ runtimeId: "claude-code" });
    const u1 = await addMessage({
      conversationId: root.id,
      role: "user",
      content: "u1-rewound",
    });
    const a1 = await addMessage({
      conversationId: root.id,
      role: "assistant",
      content: "a1-rewound",
    });
    // Mark the (u1, a1) pair rewound.
    await markPairRewound(a1.id);

    const u2 = await addMessage({
      conversationId: root.id,
      role: "user",
      content: "u2",
    });
    const a2 = await addMessage({
      conversationId: root.id,
      role: "assistant",
      content: "a2",
    });

    const branch = await createConversation({
      runtimeId: "claude-code",
      parentConversationId: root.id,
      branchedFromMessageId: a2.id,
    });
    await addMessage({
      conversationId: branch.id,
      role: "user",
      content: "branched-after-rewound-prefix",
    });

    const { messages } = await getMessagesWithAncestors(branch.id);
    expect(messages.map((m) => m.content)).toEqual([
      "u2",
      "a2",
      "branched-after-rewound-prefix",
    ]);
    // Sanity — the rewound prefix really was filtered, not just reordered.
    void u1;
    void u2;
  });

  it("flags depthCapped=true on chains longer than MAX_BRANCH_DEPTH", async () => {
    // Build a chain of MAX_BRANCH_DEPTH + 2 conversations linked via parent.
    const ids: string[] = [];
    let prevConvId: string | null = null;
    let prevMessageId: string | null = null;
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
      ids.push(c.id);
      prevConvId = c.id;
      prevMessageId = m.id;
    }

    const leafId = ids[ids.length - 1];
    const { depthCapped } = await getMessagesWithAncestors(leafId);
    expect(depthCapped).toBe(true);
  });

  it("markPairRewound flags the assistant + preceding user message and returns user content", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    const u1 = await addMessage({
      conversationId: conv.id,
      role: "user",
      content: "first ask",
    });
    const a1 = await addMessage({
      conversationId: conv.id,
      role: "assistant",
      content: "first answer",
    });

    const result = await markPairRewound(a1.id);
    expect(result.rewoundUserContent).toBe("first ask");

    const refreshed = await db
      .select()
      .from(chatMessages)
      .where(undefined)
      .all();
    const byId = Object.fromEntries(refreshed.map((r) => [r.id, r]));
    expect(byId[a1.id].rewoundAt).not.toBeNull();
    expect(byId[u1.id].rewoundAt).not.toBeNull();
    // Both timestamps should be the same (same atomic call) — restore relies on this.
    expect(byId[a1.id].rewoundAt).toEqual(byId[u1.id].rewoundAt);
  });

  it("markPairRewound on a non-assistant message is a no-op", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    const u1 = await addMessage({
      conversationId: conv.id,
      role: "user",
      content: "user msg",
    });

    const result = await markPairRewound(u1.id);
    expect(result.rewoundUserContent).toBeNull();

    const refreshed = await db
      .select()
      .from(chatMessages)
      .all();
    expect(refreshed[0].rewoundAt).toBeNull();
  });

  it("restoreLatestRewoundPair restores only the most-recent pair", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    await addMessage({
      conversationId: conv.id,
      role: "user",
      content: "u1",
    });
    const a1 = await addMessage({
      conversationId: conv.id,
      role: "assistant",
      content: "a1",
    });
    await markPairRewound(a1.id);

    // Wait a tick so the second pair has a strictly later rewoundAt.
    await new Promise((r) => setTimeout(r, 10));

    await addMessage({
      conversationId: conv.id,
      role: "user",
      content: "u2",
    });
    const a2 = await addMessage({
      conversationId: conv.id,
      role: "assistant",
      content: "a2",
    });
    await markPairRewound(a2.id);

    const result = await restoreLatestRewoundPair(conv.id);
    expect(result.restoredMessageIds).toHaveLength(2);

    // a1+u1 should still be rewound. a2+u2 should be restored.
    const refreshed = await db.select().from(chatMessages).all();
    const byId = Object.fromEntries(refreshed.map((r) => [r.id, r]));
    expect(byId[a1.id].rewoundAt).not.toBeNull();
    expect(byId[a2.id].rewoundAt).toBeNull();
  });

  it("restoreLatestRewoundPair is a no-op when nothing is rewound", async () => {
    const conv = await createConversation({ runtimeId: "claude-code" });
    await addMessage({
      conversationId: conv.id,
      role: "assistant",
      content: "a",
    });

    const result = await restoreLatestRewoundPair(conv.id);
    expect(result.restoredMessageIds).toEqual([]);
  });

  describe("getConversationFamily", () => {
    it("returns single-element list for an isolated conversation", async () => {
      const conv = await createConversation({ runtimeId: "claude-code" });
      const family = await getConversationFamily(conv.id);
      expect(family.map((c) => c.id)).toEqual([conv.id]);
    });

    it("returns root + all descendants for a 2-level tree", async () => {
      const root = await createConversation({ runtimeId: "claude-code" });
      const m = await addMessage({
        conversationId: root.id,
        role: "assistant",
        content: "fork",
      });
      const childA = await createConversation({
        runtimeId: "claude-code",
        parentConversationId: root.id,
        branchedFromMessageId: m.id,
      });
      const childB = await createConversation({
        runtimeId: "claude-code",
        parentConversationId: root.id,
        branchedFromMessageId: m.id,
      });
      const m2 = await addMessage({
        conversationId: childA.id,
        role: "assistant",
        content: "deeper fork",
      });
      const grandchild = await createConversation({
        runtimeId: "claude-code",
        parentConversationId: childA.id,
        branchedFromMessageId: m2.id,
      });

      const family = await getConversationFamily(grandchild.id);
      const ids = family.map((c) => c.id).sort();
      expect(ids).toEqual([childA.id, childB.id, grandchild.id, root.id].sort());
    });

    it("returns family from any node in the tree (root, leaf, mid)", async () => {
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

      const fromRoot = await getConversationFamily(root.id);
      const fromChild = await getConversationFamily(child.id);
      expect(fromRoot.map((c) => c.id).sort()).toEqual(
        fromChild.map((c) => c.id).sort()
      );
    });

    it("returns empty list when conversation does not exist", async () => {
      const family = await getConversationFamily("does-not-exist");
      expect(family).toEqual([]);
    });
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
});
