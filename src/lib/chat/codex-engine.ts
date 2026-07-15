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
import type { ChatStreamEvent, QuickAccessItem } from "./types";
import { getProviderForRuntime } from "./types";
import {
  createSideChannel,
  emitSideChannelEvent,
  createPendingRequest,
  cleanupConversation,
} from "./permission-bridge";
import { getWorkspaceContext } from "@/lib/environment/workspace-context";
import type { ResolvedExecutionTarget } from "@/lib/agents/runtime/execution-target";
import { finalizeStreamingMessage } from "./reconcile";
import { recordTermination, type TerminationReason } from "./stream-telemetry";
import { registerChatStream, unregisterChatStream } from "./active-streams";
import {
  appendRelayKnowledgePrompt,
  mergeRelayKnowledgeQuickAccess,
  relayKnowledgeMetadata,
  type RelayKnowledgeTurn,
} from "@/lib/knowledge/chat-retrieval";

// ── Helpers ──────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

class CodexChatTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexChatTerminalError";
  }
}

class CodexChatCancelledError extends Error {
  constructor(message = "Request cancelled") {
    super(message);
    this.name = "CodexChatCancelledError";
  }
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
  targetOverride?: ResolvedExecutionTarget,
  knowledgeTurn: RelayKnowledgeTurn = { status: "not-requested" }
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
  registerChatStream(conversationId);
  const sideChannel = createSideChannel(conversationId);
  const startedAt = new Date();
  let usage: UsageSnapshot = {};
  let fullText = "";
  let client: CodexAppServerClient | null = null;
  let threadId = conversation.sessionId;
  let turnId: string | null = null;
  let interruptPromise: Promise<unknown> | null = null;
  let ledgerRecorded = false;
  let terminationRecorded = false;

  const effectiveModelId = () =>
    usage.modelId ??
    targetOverride?.effectiveModelId ??
    conversation.modelId ??
    null;

  const recordTurn = async (status: "completed" | "failed" | "cancelled") => {
    if (ledgerRecorded) return;
    await recordUsageLedgerEntry({
      projectId: conversation.projectId,
      activityType: "chat_turn",
      runtimeId,
      providerId,
      modelId: effectiveModelId(),
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status,
      startedAt,
      finishedAt: new Date(),
    });
    ledgerRecorded = true;
  };

  const recordPrimaryTermination = (
    reason: TerminationReason,
    error?: string
  ) => {
    if (terminationRecorded) return;
    terminationRecorded = true;
    recordTermination({
      reason,
      conversationId,
      messageId: assistantMsg.id,
      durationMs: Date.now() - startedAt.getTime(),
      ...(error ? { error: error.slice(0, 500) } : {}),
    });
  };

  const persistMetadata = async (quickAccess: QuickAccessItem[] = []) => {
    const metadata = JSON.stringify({
      modelId: effectiveModelId(),
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
      ...relayKnowledgeMetadata(knowledgeTurn),
    });
    const { chatMessages } = await import("@/lib/db/schema");
    await db
      .update(chatMessages)
      .set({ metadata })
      .where(eq(chatMessages.id, assistantMsg.id));
  };

  // ── Callback → AsyncGenerator bridge ──────────────────────────────────
  const eventQueue: ChatStreamEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;
  type CodexChatTerminal =
    | { status: "completed" }
    | { status: "cancelled"; message: string }
    | { status: "failed"; message: string };
  // Mutated by notification callbacks; the wrapper keeps TypeScript from
  // incorrectly narrowing a closure-mutated local to `never` after the loop.
  const terminalState: { value: CodexChatTerminal | null } = { value: null };

  function wake() {
    resolveNext?.();
    resolveNext = null;
  }

  function pushEvent(event: ChatStreamEvent) {
    eventQueue.push(event);
    wake();
  }

  function settleTerminal(
    value: CodexChatTerminal
  ) {
    if (terminalState.value) return;
    terminalState.value = value;
    done = true;
    wake();
  }

  async function waitForEvent(): Promise<void> {
    if (eventQueue.length > 0 || done) return;
    return new Promise<void>((r) => {
      resolveNext = r;
    });
  }

  const requestTurnInterrupt = () => {
    if (!interruptPromise && client && threadId && turnId) {
      interruptPromise = client
        .request("turn/interrupt", { threadId, turnId })
        .catch((error) =>
          console.error("[chat] Codex turn interrupt failed:", error)
        );
    }
  };

  const forwardAbort = () => {
    settleTerminal({ status: "cancelled", message: "Request cancelled" });
    requestTurnInterrupt();
  };
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener("abort", forwardAbort, { once: true });

  try {
    if (signal?.aborted) throw new CodexChatCancelledError();
    const auth = await resolveOpenAICodexAuthContext();

    yield {
      type: "status",
      phase: "connecting",
      message: "Connecting to model...",
    };
    client = await auth.connect(workspace.cwd);

    // Initialize and authenticate
    await ensureOpenAICodexClientAuthenticated(client, auth);

    // Keep provider identity explicit. Discovery may fail, but silently
    // substituting Codex's default would make persisted model metadata false.
    const requestedModelId =
      targetOverride?.effectiveModelId ?? conversation.modelId;
    let validatedModel = requestedModelId || undefined;
    try {
      const modelResponse = (await client.request("model/list", {})) as {
        models?: Array<{ id: string; name?: string }>;
      };
      const availableIds = new Set(
        (modelResponse.models ?? []).map((m: { id: string }) => m.id)
      );
      if (requestedModelId && !availableIds.has(requestedModelId)) {
        throw new CodexChatTerminalError(
          `Requested Codex model "${requestedModelId}" is not available for this account.`
        );
      }
    } catch (error) {
      if (error instanceof CodexChatTerminalError) throw error;
      // Discovery failure is not authoritative. Pass the requested model to the
      // provider so it can accept or reject that exact identity.
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

        case "turn/started": {
          const turn = asRecord(params.turn);
          turnId = turn ? asString(turn.id) : asString(params.turnId);
          if (signal?.aborted) requestTurnInterrupt();
          pushEvent({
            type: "status",
            phase: "generating",
            message: "Generating response...",
          });
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

          if (status === "completed") {
            settleTerminal({ status: "completed" });
          } else if (status === "interrupted") {
            settleTerminal({
              status: "cancelled",
              message: "Codex turn was interrupted",
            });
          } else {
            const errObj = turn ? asRecord(turn.error) : null;
            const errMsg = errObj ? asString(errObj.message) : null;
            settleTerminal({
              status: "failed",
              message: errMsg || "Codex turn failed",
            });
          }
          break;
        }

        default:
          break;
      }
    };

    client.onProcessError = (error) => {
      settleTerminal({ status: "failed", message: error.message });
    };

    // Start or resume thread
    if (threadId) {
      await client.request("thread/resume", {
        threadId,
        cwd: workspace.cwd,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        developerInstructions: appendRelayKnowledgePrompt(context.systemPrompt, knowledgeTurn) || null,
      });
    } else {
      const threadResponse = (await client.request("thread/start", {
        cwd: workspace.cwd,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        serviceName: "relay",
        developerInstructions: appendRelayKnowledgePrompt(context.systemPrompt, knowledgeTurn) || null,
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

    if (signal?.aborted) throw new CodexChatCancelledError();

    // Start turn — only pass model if validated against available models
    await client.request("turn/start", {
      threadId,
      input: [{ type: "text", text: turnText }],
      cwd: workspace.cwd,
      ...(validatedModel ? { model: validatedModel } : {}),
      approvalPolicy: "on-request",
    });

    // Yield every event queued before the terminal notification. Codex may
    // deliver the final delta and `turn/completed` in the same microtask; a
    // plain `while (!done)` would observe the terminal first and drop the
    // already-queued delta.
    while (!done || eventQueue.length > 0) {
      await waitForEvent();

      // Drain side-channel events (from approval bridge)
      for (const sideEvent of sideChannel.drain()) {
        yield sideEvent;
      }

      while (eventQueue.length > 0) {
        const event = eventQueue.shift()!;
        yield event;
      }
    }

    // Drain any remaining side-channel events
    for (const sideEvent of sideChannel.drain()) {
      yield sideEvent;
    }

    const terminal = terminalState.value;
    if (!terminal) {
      throw new CodexChatTerminalError(
        "Codex stream ended without a terminal turn status"
      );
    }
    if (terminal.status === "cancelled") {
      throw new CodexChatCancelledError(terminal.message);
    }
    if (terminal.status === "failed") {
      throw new CodexChatTerminalError(terminal.message);
    }
    if (!fullText.trim()) {
      throw new CodexChatTerminalError(
        "Codex completed without assistant output"
      );
    }

    // Finalize durable state before exposing the public terminal event. The
    // SSE route stops consuming after `done`; writing first prevents iterator
    // return() from skipping persistence.
    await updateMessageContent(assistantMsg.id, fullText);
    await updateMessageStatus(assistantMsg.id, "complete");

    // Detect entities for Quick Access pills
    const textEntities = await detectEntities(fullText, conversation.projectId);
    const quickAccess = mergeRelayKnowledgeQuickAccess(
      deduplicateByEntityId(textEntities),
      knowledgeTurn
    );

    await persistMetadata(quickAccess);
    await recordTurn("completed");
    recordPrimaryTermination("stream.completed");
    yield {
      type: "done",
      messageId: assistantMsg.id,
      quickAccess,
      ...(targetOverride?.fallbackReason
        ? { fallbackReason: targetOverride.fallbackReason }
        : {}),
      ...(effectiveModelId() ? { modelId: effectiveModelId()! } : {}),
    };
  } catch (error) {
    const cancelled =
      signal?.aborted === true ||
      error instanceof CodexChatCancelledError ||
      terminalState.value?.status === "cancelled";
    const errorMessage = cancelled
      ? "Request cancelled"
      : error instanceof Error
        ? error.message
        : "Unknown error";

    await updateMessageContent(assistantMsg.id, fullText || errorMessage);
    await updateMessageStatus(assistantMsg.id, "error");
    await persistMetadata();
    await recordTurn(cancelled ? "cancelled" : "failed");
    recordPrimaryTermination(
      signal?.aborted ? "stream.aborted.signal" : "stream.finalized.error",
      errorMessage
    );
    yield { type: "error", message: errorMessage };
  } finally {
    signal?.removeEventListener("abort", forwardAbort);
    try {
      await finalizeStreamingMessage(assistantMsg.id, fullText);
    } catch (error) {
      console.error("[chat] Codex finalize safety net failed:", error);
    }
    unregisterChatStream(conversationId);
    cleanupConversation(conversationId);
    await interruptPromise;
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
