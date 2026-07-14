import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { conversations, chatMessages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { reconcileStreamingMessages } from "../reconcile";
import { __resetForTesting, readTerminations } from "../stream-telemetry";

function seedConversation(): string {
  const id = randomUUID();
  const now = new Date();
  db.insert(conversations)
    .values({
      id,
      runtimeId: "test-runtime",
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function seedMessage(opts: {
  conversationId: string;
  status: "streaming" | "complete" | "error";
  content: string;
  createdAt: Date;
}): string {
  const id = randomUUID();
  db.insert(chatMessages)
    .values({
      id,
      conversationId: opts.conversationId,
      role: "assistant",
      content: opts.content,
      status: opts.status,
      createdAt: opts.createdAt,
    })
    .run();
  return id;
}

describe("reconcileStreamingMessages", () => {
  beforeEach(() => {
    // Isolate each test
    db.delete(chatMessages).run();
    db.delete(conversations).run();
    __resetForTesting();
  });

  it("sweeps a 20-min-old streaming row with empty content to error state with fallback", async () => {
    const convId = seedConversation();
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
    const msgId = seedMessage({
      conversationId: convId,
      status: "streaming",
      content: "",
      createdAt: twentyMinAgo,
    });

    const swept = await reconcileStreamingMessages();

    expect(swept).toBe(1);
    const row = db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, msgId))
      .get();
    expect(row?.status).toBe("error");
    expect(row?.content).toMatch(/Interrupted/i);
    expect(row?.content.length).toBeGreaterThan(0);
    expect(readTerminations().map((event) => event.reason)).toEqual([
      "stream.reconciled.stale",
    ]);
  });

  it("leaves a 30-second-old streaming row untouched", async () => {
    const convId = seedConversation();
    const thirtySecAgo = new Date(Date.now() - 30 * 1000);
    const msgId = seedMessage({
      conversationId: convId,
      status: "streaming",
      content: "",
      createdAt: thirtySecAgo,
    });

    const swept = await reconcileStreamingMessages();

    expect(swept).toBe(0);
    const row = db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, msgId))
      .get();
    expect(row?.status).toBe("streaming");
    expect(row?.content).toBe("");
  });

  it("preserves partial content when sweeping old streaming row", async () => {
    const convId = seedConversation();
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
    const msgId = seedMessage({
      conversationId: convId,
      status: "streaming",
      content: "Here is what I found so",
      createdAt: twentyMinAgo,
    });

    await reconcileStreamingMessages();

    const row = db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, msgId))
      .get();
    expect(row?.status).toBe("error");
    expect(row?.content).toBe("Here is what I found so");
  });

  it("leaves complete messages untouched regardless of age", async () => {
    const convId = seedConversation();
    const twentyMinAgo = new Date(Date.now() - 20 * 60 * 1000);
    const msgId = seedMessage({
      conversationId: convId,
      status: "complete",
      content: "Finished response",
      createdAt: twentyMinAgo,
    });

    const swept = await reconcileStreamingMessages();

    expect(swept).toBe(0);
    const row = db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, msgId))
      .get();
    expect(row?.status).toBe("complete");
    expect(row?.content).toBe("Finished response");
  });
});
