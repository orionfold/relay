import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { CodexAppServerClient } from "@/lib/agents/runtime/codex-app-server-client";
import {
  ensureOpenAICodexClientAuthenticated,
  resolveOpenAICodexAuthContext,
} from "@/lib/agents/runtime/openai-codex-auth";
import {
  extractUsageSnapshot,
  mergeUsageSnapshot,
  recordUsageLedgerEntry,
  type UsageSnapshot,
} from "@/lib/usage/ledger";
import { enforceBudgetGuardrails } from "@/lib/settings/budget-guardrails";
import {
  getConversation,
  addMessage,
  updateMessageStatus,
  updateMessageContent,
  updateConversation,
} from "@/lib/data/chat";
import { buildChatContext } from "./context-builder";
import {
  detectEntities,
  deduplicateByEntityId,
} from "./entity-detector";
import type { ChatStreamEvent } from "./types";
import { getProviderForRuntime } from "./types";
import {
  createSideChannel,
  emitSideChannelEvent,
  createPendingRequest,
  cleanupConversation,
} from "./permission-bridge";
import { getWorkspaceContext } from "@/lib/environment/workspace-context";
import type { ResolvedExecutionTarget } from "@/lib/agents/runtime/execution-target";

// ── Helpers ──────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Send a user message and stream the assistant response via the Codex App
 * Server. Mirrors the `sendMessage()` generator interface from engine.ts
 * but dispatches through the Codex WebSocket protocol.
 */
export async function* sendCodexMessage(
  conversationId: string,
  userContent: string,
  signal?: AbortSignal,
  targetOverride?: ResolvedExecutionTarget
): AsyncGenerator<ChatStreamEvent> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    yield { type: "error", message: "Conversation not found" };
    return;
  }

  const runtimeId = targetOverride?.effectiveRuntimeId ?? conversation.runtimeId;
  const providerId = getProviderForRuntime(runtimeId);

  // Enforce budget
  try {
    await enforceBudgetGuardrails({
      runtimeId,
      activityType: "chat_turn",
      projectId: conversation.projectId,
    });
  } catch (error) {
    yield {
      type: "error",
      message: error instanceof Error ? error.message : "Budget limit exceeded",
    };
    return;
  }

  yield { type: "status", phase: "preparing", message: "Preparing context..." };

  // Build workspace context
  let projectName: string | null = null;
  let projectCwd: string | null = null;
  if (conversation.projectId) {
    const project = await db
      .select()
      .from(projects)
      .where(eq(projects.id, conversation.projectId))
      .get();
    if (project) {
      projectName = project.name;
      projectCwd = project.workingDirectory ?? null;
    }
  }

  const workspace = getWorkspaceContext();
  if (projectCwd) {
    workspace.cwd = projectCwd;
  }

  const context = await buildChatContext({
    conversationId,
    projectId: conversation.projectId,
    projectName,
    workspace,
  });

  // Persist user message
  await addMessage({ conversationId, role: "user", content: userContent });

  // Auto-title
  if (!conversation.title) {
    const title =
      userContent.length > 60 ? userContent.slice(0, 57) + "..." : userContent;
    await updateConversation(conversationId, { title });
  }

  // Create placeholder assistant message
  const assistantMsg = await addMessage({
    conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
  });

  // Get OpenAI API key
  let auth;
  try {
    auth = await resolveOpenAICodexAuthContext();
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "OpenAI Codex authentication is not configured.";
    await updateMessageContent(assistantMsg.id, message);
    await updateMessageStatus(assistantMsg.id, "error");
    yield { type: "error", message };
    return;
  }

  yield { type: "status", phase: "connecting", message: "Connecting to model..." };

  const sideChannel = createSideChannel(conversationId);
  const startedAt = new Date();
  let usage: UsageSnapshot = {};
  let fullText = "";
  let client: CodexAppServerClient | null = null;
  let threadId = conversation.sessionId;

  // ── Callback → AsyncGenerator bridge ──────────────────────────────────
  const eventQueue: ChatStreamEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;

  function pushEvent(event: ChatStreamEvent) {
    eventQueue.push(event);
    resolveNext?.();
    resolveNext = null;
  }

  async function waitForEvent(): Promise<void> {
    if (eventQueue.length > 0) return;
    return new Promise<void>((r) => {
      resolveNext = r;
    });
  }

  try {
    client = await auth.connect(workspace.cwd);

    // Initialize and authenticate
    await ensureOpenAICodexClientAuthenticated(client, auth);

    // Validate model availability against what the user's account supports
    let validatedModel: string | undefined;
    try {
      const modelResponse = (await client.request("model/list", {})) as {
        models?: Array<{ id: string; name?: string }>;
      };
      const availableIds = new Set(
        (modelResponse.models ?? []).map((m: { id: string }) => m.id)
      );
      const requestedModelId =
        targetOverride?.effectiveModelId ?? conversation.modelId;
      if (requestedModelId && availableIds.has(requestedModelId)) {
        validatedModel = requestedModelId;
      }
      // If not available, validatedModel stays undefined → Codex uses its default
    } catch {
      // model/list failed — proceed without explicit model selection
    }

    // Handle server-initiated requests (approvals)
    client.onRequest = (request) => {
      void handleCodexApproval(client!, conversationId, request, sideChannel)
        .catch(() => {
          client?.reject(
            request.id,
            "Failed to process approval request"
          );
        });
    };

    // Set up notification handler
    let inReasoningPhase = false;

    client.onNotification = (notification) => {
      const params = asRecord(notification.params) ?? {};
      usage = mergeUsageSnapshot(usage, extractUsageSnapshot(params));

      switch (notification.method) {
        case "thread/started": {
          const t = asRecord(params.thread);
          const tid = t ? asString(t.id) : null;
          if (tid) threadId = tid;
          break;
        }

        // ── Reasoning / thinking steps ──────────────────────────────
        case "item/reasoning/summaryTextDelta": {
          const delta = asString(params.delta) ?? "";
          if (delta) {
            inReasoningPhase = true;
            fullText += delta;
            pushEvent({ type: "delta", content: delta });
          }
          break;
        }

        case "item/reasoning/summaryPartAdded": {
          // Newline between reasoning sections for readability
          fullText += "\n\n";
          pushEvent({ type: "delta", content: "\n\n" });
          break;
        }

        case "item/plan/delta": {
          const delta = asString(params.delta) ?? "";
          if (delta) {
            inReasoningPhase = true;
            fullText += delta;
            pushEvent({ type: "delta", content: delta });
          }
          break;
        }

        // ── Agent response ──────────────────────────────────────────
        case "item/agentMessage/delta": {
          const delta = asString(params.delta) ?? "";
          if (delta) {
            // Insert separator when transitioning from thinking to response
            if (inReasoningPhase) {
              inReasoningPhase = false;
              const separator = "\n\n---\n\n";
              fullText += separator;
              pushEvent({ type: "delta", content: separator });
            }
            fullText += delta;
            pushEvent({ type: "delta", content: delta });
          }
          break;
        }

        case "turn/completed": {
          const turn = asRecord(params.turn);
          const status = turn ? asString(turn.status) : null;

          if (status === "completed" || status === "interrupted") {
            done = true;
            pushEvent({ type: "done" as "done", messageId: assistantMsg.id, quickAccess: [] });
          } else {
            const errObj = turn ? asRecord(turn.error) : null;
            const errMsg = errObj ? asString(errObj.message) : null;
            done = true;
            pushEvent({ type: "error", message: errMsg || "Codex turn failed" });
          }
          break;
        }

        case "turn/started":
          // First event from model — signal generating
          pushEvent({ type: "status", phase: "generating", message: "Generating response..." });
          break;

        default:
          break;
      }
    };

    client.onProcessError = (error) => {
      done = true;
      pushEvent({ type: "error", message: error.message });
    };

    // Start or resume thread
    if (threadId) {
      await client.request("thread/resume", {
        threadId,
        cwd: workspace.cwd,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        developerInstructions: context.systemPrompt || null,
      });
    } else {
      const threadResponse = (await client.request("thread/start", {
        cwd: workspace.cwd,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        serviceName: "relay",
        developerInstructions: context.systemPrompt || null,
        experimentalRawEvents: false,
        ephemeral: false,
      })) as { thread: { id: string } };

      threadId = threadResponse.thread.id;
    }

    // Persist thread ID for resume
    if (threadId && threadId !== conversation.sessionId) {
      await updateConversation(conversationId, { sessionId: threadId });
    }

    // Build turn input: history context + user message
    const historyBlock = context.history.length > 0
      ? context.history
          .map((m) => `**${m.role}:** ${m.content}`)
          .join("\n\n") + "\n\n"
      : "";
    const turnText = historyBlock + userContent;

    // Start turn — only pass model if validated against available models
    await client.request("turn/start", {
      threadId,
      input: [{ type: "text", text: turnText }],
      cwd: workspace.cwd,
      ...(validatedModel ? { model: validatedModel } : {}),
      approvalPolicy: "on-request",
    });

    // Yield events from the queue until done
    while (!done) {
      await waitForEvent();

      // Drain side-channel events (from approval bridge)
      for (const sideEvent of sideChannel.drain()) {
        yield sideEvent;
      }

      while (eventQueue.length > 0) {
        const event = eventQueue.shift()!;
        yield event;
        if (event.type === "done" || event.type === "error") {
          done = true;
          break;
        }
      }
    }

    // Drain any remaining side-channel events
    for (const sideEvent of sideChannel.drain()) {
      yield sideEvent;
    }

    // Finalize assistant message
    await updateMessageContent(assistantMsg.id, fullText);
    await updateMessageStatus(assistantMsg.id, "complete");

    // Detect entities for Quick Access pills
    const textEntities = await detectEntities(fullText, conversation.projectId);
    const quickAccess = deduplicateByEntityId(textEntities);

    // Save usage metadata
    const metadata = JSON.stringify({
      modelId:
        usage.modelId ??
        targetOverride?.effectiveModelId ??
        conversation.modelId,
      runtimeId,
      requestedRuntimeId:
        targetOverride?.requestedRuntimeId ?? conversation.runtimeId,
      requestedModelId:
        targetOverride?.requestedModelId ?? conversation.modelId,
      ...(targetOverride?.fallbackReason
        ? { fallbackReason: targetOverride.fallbackReason }
        : {}),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      ...(quickAccess.length > 0 ? { quickAccess } : {}),
    });
    const { chatMessages } = await import("@/lib/db/schema");
    await db
      .update(chatMessages)
      .set({ metadata })
      .where(eq(chatMessages.id, assistantMsg.id));

    // Record usage
    await recordUsageLedgerEntry({
      projectId: conversation.projectId,
      activityType: "chat_turn",
      runtimeId,
      providerId,
      modelId:
        usage.modelId ??
        targetOverride?.effectiveModelId ??
        conversation.modelId ??
        null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "completed",
      startedAt,
      finishedAt: new Date(),
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await updateMessageContent(assistantMsg.id, fullText || errorMessage);
    await updateMessageStatus(assistantMsg.id, "error");

    await recordUsageLedgerEntry({
      projectId: conversation.projectId,
      activityType: "chat_turn",
      runtimeId,
      providerId,
      modelId:
        usage.modelId ??
        targetOverride?.effectiveModelId ??
        conversation.modelId ??
        null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: signal?.aborted ? "cancelled" : "failed",
      startedAt,
      finishedAt: new Date(),
    });

    yield { type: "error", message: errorMessage };
  } finally {
    cleanupConversation(conversationId);
    if (client) {
      await client.close();
    }
  }
}

// ── Approval handler ─────────────────────────────────────────────────────

interface CodexRequest {
  id: number;
  method: string;
  params?: unknown;
}

async function handleCodexApproval(
  client: CodexAppServerClient,
  conversationId: string,
  request: CodexRequest,
  sideChannel: ReturnType<typeof createSideChannel>
) {
  const params = asRecord(request.params) ?? {};

  if (
    request.method === "item/commandExecution/requestApproval" ||
    request.method === "item/fileChange/requestApproval"
  ) {
    const toolName = request.method === "item/commandExecution/requestApproval"
      ? "codex_command_execution"
      : "codex_file_change";
    const toolInput = {
      command: asString(params.command),
      cwd: asString(params.cwd),
      reason: asString(params.reason),
      itemId: asString(params.itemId),
    };

    const requestId = crypto.randomUUID();
    const systemMsg = await addMessage({
      conversationId,
      role: "system",
      content: `Permission required: ${toolName}`,
      status: "pending",
      metadata: JSON.stringify({
        type: "permission_request",
        requestId,
        toolName,
        toolInput,
      }),
    });

    emitSideChannelEvent(conversationId, {
      type: "permission_request",
      requestId,
      messageId: systemMsg.id,
      toolName,
      toolInput,
    });

    // Block until user responds
    const response = await createPendingRequest(requestId, conversationId);

    // Forward decision to Codex
    if (response.behavior === "allow") {
      client.respond(request.id, "accept");
    } else {
      client.respond(request.id, "decline");
    }
  } else if (request.method === "item/tool/requestUserInput") {
    // Forward as question
    const questions = [{
      question: asString(params.message) ?? "Agent needs input",
      header: "Agent Question",
    }];

    const requestId = crypto.randomUUID();
    const systemMsg = await addMessage({
      conversationId,
      role: "system",
      content: "Agent has a question",
      status: "pending",
      metadata: JSON.stringify({
        type: "question",
        requestId,
        questions,
      }),
    });

    emitSideChannelEvent(conversationId, {
      type: "question",
      requestId,
      messageId: systemMsg.id,
      questions,
    });

    const response = await createPendingRequest(requestId, conversationId);

    client.respond(request.id, {
      success: true,
      contentItems: [
        {
          type: "inputText",
          text: response.message ?? JSON.stringify(response.updatedInput) ?? "OK",
        },
      ],
    });
  } else {
    client.reject(request.id, `Unsupported Codex request: ${request.method}`);
  }
}
