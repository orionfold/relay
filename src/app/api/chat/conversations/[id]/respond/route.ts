import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import {
  resolvePendingRequest,
  hasPendingRequest,
} from "@/lib/chat/permission-bridge";
import { updateMessageStatus } from "@/lib/data/chat";
import { addAllowedPermission } from "@/lib/settings/permissions";
import { buildPermissionPattern } from "@/lib/notifications/permissions";
import { getConversation } from "@/lib/data/chat";
import { db } from "@/lib/db";
import { chatMessages } from "@/lib/db/schema";

const permissionResponseSchema = z.object({
  requestId: z.string().min(1),
  messageId: z.string().min(1).optional(),
  behavior: z.enum(["allow", "deny"]),
  updatedInput: z.record(z.string(), z.unknown()).optional(),
  message: z.string().optional(),
  alwaysAllow: z.boolean().optional(),
  permissionPattern: z.string().min(1).optional(),
  toolName: z.string().min(1).optional(),
  toolInput: z.record(z.string(), z.unknown()).optional(),
}).strict();

/**
 * POST /api/chat/conversations/[id]/respond
 *
 * Resolves a pending permission or question request in an active chat turn.
 * The permission bridge stores in-memory Promises that block the SDK's
 * canUseTool callback — this endpoint resolves them.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: conversationId } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = permissionResponseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid permission response", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    requestId,
    messageId,
    behavior,
    updatedInput,
    message,
    alwaysAllow,
    permissionPattern,
    toolName,
    toolInput,
  } = parsed.data;

  const conversation = await getConversation(conversationId);
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  if (messageId) {
    const ownedMessage = db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.id, messageId),
          eq(chatMessages.conversationId, conversationId)
        )
      )
      .get();
    if (!ownedMessage) {
      return NextResponse.json(
        { error: "Message not found in conversation" },
        { status: 404 }
      );
    }
  }

  // Resolve the in-memory Promise if it still exists (unblocks SDK).
  // The request may already be gone (timeout, HMR restart, connection drop)
  // — that's fine, we still update DB and UI below.
  const requestExists = hasPendingRequest(requestId);
  const isPending = hasPendingRequest(requestId, conversationId, messageId);
  if (requestExists && !isPending) {
    return NextResponse.json(
      { error: "Pending request not found in conversation" },
      { status: 404 }
    );
  }
  if (isPending) {
    const resolved = resolvePendingRequest(requestId, {
      behavior,
      updatedInput: behavior === "allow" ? updatedInput : undefined,
      message: behavior === "deny" ? (message ?? "User denied this action") : undefined,
    }, conversationId, messageId);

    if (!resolved) {
      return NextResponse.json(
        { error: "Failed to resolve request" },
        { status: 500 }
      );
    }
  }

  // If "Always Allow" was selected, persist the permission pattern
  if (alwaysAllow && behavior === "allow") {
    const pattern = permissionPattern ?? (toolName && toolInput
      ? buildPermissionPattern(toolName, toolInput)
      : null);
    if (pattern) {
      await addAllowedPermission(pattern);
    }
  }

  // Always update the system message status — even for stale requests
  // so the UI reflects the user's action on reload
  if (messageId) {
    await updateMessageStatus(messageId, behavior === "allow" ? "complete" : "error");
  }

  return NextResponse.json({ ok: true, stale: !isPending });
}
