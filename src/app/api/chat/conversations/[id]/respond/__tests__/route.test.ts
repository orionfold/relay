/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages, conversations, settings } from "@/lib/db/schema";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { addMessage, createConversation } from "@/lib/data/chat";
import {
  cleanupConversation,
  createPendingRequest,
  hasPendingRequest,
} from "@/lib/chat/permission-bridge";
import { getAllowedPermissions } from "@/lib/settings/permissions";
import { POST } from "../route";

function request(conversationId: string, body: unknown) {
  return POST(
    new NextRequest(
      `http://relay.test/api/chat/conversations/${conversationId}/respond`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }
    ),
    { params: Promise.resolve({ id: conversationId }) }
  );
}

beforeEach(() => {
  db.delete(chatMessages).run();
  db.delete(conversations).run();
  db.delete(settings)
    .where(eq(settings.key, SETTINGS_KEYS.PERMISSIONS_ALLOW))
    .run();
  vi.useRealTimers();
});

describe("POST /api/chat/conversations/[id]/respond boundary contract", () => {
  it("rejects malformed or invalid responses before touching state", async () => {
    const conversation = await createConversation({ runtimeId: "claude-code" });

    const malformed = await request(conversation.id, "{");
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Invalid JSON body" });

    const invalid = await request(conversation.id, {
      requestId: "request-1",
      behavior: "approve",
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "Invalid permission response" });
  });

  it("returns 404 for a missing conversation", async () => {
    const response = await request("missing", {
      requestId: "request-1",
      behavior: "deny",
    });
    expect(response.status).toBe(404);
  });

  it("refuses a message owned by another conversation", async () => {
    const owner = await createConversation({ runtimeId: "claude-code" });
    const other = await createConversation({ runtimeId: "claude-code" });
    const message = await addMessage({
      conversationId: owner.id,
      role: "system",
      content: "Approval required",
      status: "pending",
    });

    const response = await request(other.id, {
      requestId: "stale-request",
      messageId: message.id,
      behavior: "allow",
    });

    expect(response.status).toBe(404);
    expect(db.select().from(chatMessages).where(eq(chatMessages.id, message.id)).get()?.status)
      .toBe("pending");
  });

  it("cannot resolve a pending request owned by another conversation", async () => {
    vi.useFakeTimers();
    const owner = await createConversation({ runtimeId: "claude-code" });
    const other = await createConversation({ runtimeId: "claude-code" });
    void createPendingRequest("owner-request", owner.id);

    const response = await request(other.id, {
      requestId: "owner-request",
      behavior: "allow",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "Pending request not found in conversation",
    });
    expect(hasPendingRequest("owner-request", owner.id)).toBe(true);
    cleanupConversation(owner.id);
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("cannot resolve a request while updating a different message", async () => {
    vi.useFakeTimers();
    const conversation = await createConversation({ runtimeId: "claude-code" });
    const pendingMessage = await addMessage({
      conversationId: conversation.id,
      role: "system",
      content: "First approval",
      status: "pending",
    });
    const otherMessage = await addMessage({
      conversationId: conversation.id,
      role: "system",
      content: "Second approval",
      status: "pending",
    });
    void createPendingRequest("bound-request", conversation.id, pendingMessage.id);

    const response = await request(conversation.id, {
      requestId: "bound-request",
      messageId: otherMessage.id,
      behavior: "allow",
    });

    expect(response.status).toBe(404);
    expect(hasPendingRequest("bound-request", conversation.id, pendingMessage.id)).toBe(
      true
    );
    expect(db.select().from(chatMessages).where(eq(chatMessages.id, otherMessage.id)).get()?.status)
      .toBe("pending");
    cleanupConversation(conversation.id);
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("updates an owned stale request without pretending it was pending", async () => {
    const conversation = await createConversation({ runtimeId: "claude-code" });
    const message = await addMessage({
      conversationId: conversation.id,
      role: "system",
      content: "Approval required",
      status: "pending",
    });

    const response = await request(conversation.id, {
      requestId: "already-gone",
      messageId: message.id,
      behavior: "deny",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, stale: true });
    expect(db.select().from(chatMessages).where(eq(chatMessages.id, message.id)).get()?.status)
      .toBe("error");
  });

  it("resolves an active gate and persists the operator's allow pattern", async () => {
    vi.useFakeTimers();
    const conversation = await createConversation({ runtimeId: "claude-code" });
    const message = await addMessage({
      conversationId: conversation.id,
      role: "system",
      content: "Approval required",
      status: "pending",
    });
    const pending = createPendingRequest("request-1", conversation.id, message.id);

    const response = await request(conversation.id, {
      requestId: "request-1",
      messageId: message.id,
      behavior: "allow",
      updatedInput: { command: "git status" },
      alwaysAllow: true,
      toolName: "Bash",
      toolInput: { command: "git status" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, stale: false });
    expect(await pending).toEqual({
      behavior: "allow",
      updatedInput: { command: "git status" },
      message: undefined,
    });
    expect(await getAllowedPermissions()).toEqual(["Bash(command:git *)"]);
    expect(db.select().from(chatMessages).where(eq(chatMessages.id, message.id)).get()?.status)
      .toBe("complete");

    cleanupConversation(conversation.id);
    vi.clearAllTimers();
    vi.useRealTimers();
  });
});
