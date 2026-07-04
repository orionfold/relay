import { NextRequest, NextResponse } from "next/server";
import {
  createConversation,
  listConversations,
} from "@/lib/data/chat";
import { db } from "@/lib/db";
import { projects, conversations, chatMessages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ensureFreshScan } from "@/lib/environment/auto-scan";

/**
 * GET /api/chat/conversations?status=active&projectId=xxx&limit=50
 * List conversations with optional filters.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status") as "active" | "archived" | null;
  const projectId = searchParams.get("projectId") ?? undefined;
  const limit = searchParams.get("limit")
    ? parseInt(searchParams.get("limit")!, 10)
    : undefined;

  const rows = await listConversations({
    status: status ?? undefined,
    projectId,
    limit,
  });

  return NextResponse.json(rows);
}

/**
 * POST /api/chat/conversations
 * Create a new conversation. Optionally a branch of an existing conversation.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    projectId,
    title,
    runtimeId,
    modelId,
    parentConversationId,
    branchedFromMessageId,
  } = body;

  if (!runtimeId) {
    return NextResponse.json(
      { error: "runtimeId is required" },
      { status: 400 }
    );
  }

  // "ollama" is first-class: getRuntimeForModel() returns it for local models,
  // engine.ts routes it to sendOllamaMessage. Omitting it here 400'd the
  // "Best privacy (local only)" tier's first chat/compose on a fresh install (#30).
  const validRuntimes = ["claude-code", "openai-codex-app-server", "ollama"];
  if (!validRuntimes.includes(runtimeId)) {
    return NextResponse.json(
      { error: `Invalid runtimeId. Must be one of: ${validRuntimes.join(", ")}` },
      { status: 400 }
    );
  }

  // chat-conversation-branches v1 — validate the (parent, branchedFrom) pair.
  // Both must be present together; the branched-from message must exist and
  // belong to the named parent conversation. We reject early so callers don't
  // get a half-broken branch with a dangling FK.
  if (parentConversationId || branchedFromMessageId) {
    if (!parentConversationId || !branchedFromMessageId) {
      return NextResponse.json(
        {
          error:
            "parentConversationId and branchedFromMessageId must both be provided when creating a branch",
        },
        { status: 400 }
      );
    }
    const parent = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, parentConversationId))
      .get();
    if (!parent) {
      return NextResponse.json(
        { error: `Parent conversation ${parentConversationId} not found` },
        { status: 404 }
      );
    }
    const branchPoint = await db
      .select({ id: chatMessages.id })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.id, branchedFromMessageId),
          eq(chatMessages.conversationId, parentConversationId)
        )
      )
      .get();
    if (!branchPoint) {
      return NextResponse.json(
        {
          error: `branchedFromMessageId ${branchedFromMessageId} does not belong to conversation ${parentConversationId}`,
        },
        { status: 400 }
      );
    }
  }

  // Auto-scan environment when starting a conversation for a project
  if (projectId) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    if (project?.workingDirectory) {
      ensureFreshScan(project.workingDirectory, projectId);
    }
  }

  const conversation = await createConversation({
    projectId: projectId ?? null,
    title: title ?? null,
    runtimeId,
    modelId: modelId ?? null,
    parentConversationId: parentConversationId ?? null,
    branchedFromMessageId: branchedFromMessageId ?? null,
  });

  return NextResponse.json(conversation, { status: 201 });
}
