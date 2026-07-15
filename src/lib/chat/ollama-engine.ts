/**
 * Ollama chat engine — streams messages via the Ollama /api/chat endpoint.
 *
 * Follows the same ChatStreamEvent protocol as the main engine
 * so the chat UI can render Ollama responses identically.
 */

import { db } from "@/lib/db";
import { chatMessages, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getConversation,
  addMessage,
  updateMessageStatus,
  updateMessageContent,
} from "@/lib/data/chat";
import { buildChatContext } from "./context-builder";
import { getWorkspaceContext } from "@/lib/environment/workspace-context";
import { recordUsageLedgerEntry } from "@/lib/usage/ledger";
import { resolveOllamaModel } from "@/lib/agents/runtime/ollama-model-resolver";
import { finalizeStreamingMessage } from "./reconcile";
import {
  recordTermination,
  type TerminationReason,
} from "./stream-telemetry";
import type { ChatStreamEvent } from "./types";
import {
  appendRelayKnowledgePrompt,
  mergeRelayKnowledgeQuickAccess,
  relayKnowledgeMetadata,
  type RelayKnowledgeTurn,
} from "@/lib/knowledge/chat-retrieval";

/**
 * Send a user message to Ollama and stream the response.
 */
export async function* sendOllamaMessage(
  conversationId: string,
  userContent: string,
  signal?: AbortSignal,
  knowledgeTurn: RelayKnowledgeTurn = { status: "not-requested" }
): AsyncGenerator<ChatStreamEvent> {
  const startedAt = new Date();
  let conversation: Awaited<ReturnType<typeof getConversation>> | null = null;
  let assistantMsg: Awaited<ReturnType<typeof addMessage>> | null = null;
  let accumulated = "";
  let primaryTerminationRecorded = false;

  const recordPrimaryTermination = (
    reason: TerminationReason,
    error?: string
  ) => {
    if (primaryTerminationRecorded) return;
    primaryTerminationRecorded = true;
    recordTermination({
      reason,
      conversationId,
      messageId: assistantMsg?.id ?? null,
      durationMs: Date.now() - startedAt.getTime(),
      ...(error ? { error: error.slice(0, 500) } : {}),
    });
  };

  let modelId: string | null = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let ledgerRecorded = false;
  const recordTurn = async (status: "completed" | "failed" | "cancelled") => {
    if (ledgerRecorded) return;
    await recordUsageLedgerEntry({
      projectId: conversation?.projectId ?? null,
      activityType: "chat_turn",
      runtimeId: "ollama",
      providerId: "ollama",
      modelId,
      inputTokens,
      outputTokens,
      totalTokens:
        inputTokens != null && outputTokens != null
          ? inputTokens + outputTokens
          : null,
      status,
      startedAt,
      finishedAt: new Date(),
    });
    ledgerRecorded = true;
  };
  const captureTokenCounts = (parsed: {
    prompt_eval_count?: unknown;
    eval_count?: unknown;
  }) => {
    if (typeof parsed.prompt_eval_count === "number") {
      inputTokens = parsed.prompt_eval_count;
    }
    if (typeof parsed.eval_count === "number") {
      outputTokens = parsed.eval_count;
    }
  };

  try {
    conversation = await getConversation(conversationId);
    if (!conversation) {
      const message = "Conversation not found";
      recordPrimaryTermination("stream.finalized.error", message);
      yield { type: "error", message };
      return;
    }

    yield {
      type: "status",
      phase: "preparing",
      message: "Connecting to Ollama...",
    };

    const { fetchOllama, getOllamaRuntimeConfig } = await import(
      "@/lib/agents/runtime/ollama-config"
    );
    const config = await getOllamaRuntimeConfig();
    const requestedModel = conversation.modelId?.replace(/^ollama:/, "");
    try {
      modelId = await resolveOllamaModel(
        config,
        requestedModel,
        config.defaultModel
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No Ollama model configured";
      recordPrimaryTermination("stream.finalized.error", message);
      yield { type: "error", message };
      return;
    }

    let projectName: string | null = null;
    let projectCwd: string | null = null;
    if (conversation.projectId) {
      const project = db
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
    if (projectCwd) workspace.cwd = projectCwd;
    const context = await buildChatContext({
      conversationId,
      projectId: conversation.projectId,
      projectName,
      workspace,
    });

    await addMessage({
      conversationId,
      role: "user",
      content: userContent,
      status: "complete",
    });
    assistantMsg = await addMessage({
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
    });

    const history = db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(chatMessages.createdAt)
      .all();
    const messages = [
      ...(context.systemPrompt || knowledgeTurn.status === "ready"
        ? [{ role: "system" as const, content: appendRelayKnowledgePrompt(context.systemPrompt, knowledgeTurn) }]
        : []),
      ...history
        .filter((message) => message.id !== assistantMsg!.id && message.content)
        .map((message) => ({
          role: message.role as "user" | "assistant" | "system",
          content: message.content!,
        })),
    ];

    const response = await fetchOllama(config, "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      const message = `Ollama error (${response.status}): ${errorText}`;
      await updateMessageContent(assistantMsg.id, message);
      await updateMessageStatus(assistantMsg.id, "error");
      await recordTurn("failed");
      recordPrimaryTermination("stream.finalized.error", message);
      yield { type: "error", message };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const message = "No response stream from Ollama";
      await updateMessageContent(assistantMsg.id, message);
      await updateMessageStatus(assistantMsg.id, "error");
      await recordTurn("failed");
      recordPrimaryTermination("stream.finalized.error", message);
      yield { type: "error", message };
      return;
    }

    yield { type: "status", phase: "streaming", message: "Streaming response..." };

    const decoder = new TextDecoder();
    let buffer = "";
    let terminalFrameReceived = false;
    let malformedFrameReceived = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          const delta = parsed.message?.content ?? "";
          if (delta) {
            accumulated += delta;
            yield { type: "delta", content: delta };
          }
          if (parsed.done) {
            terminalFrameReceived = true;
            captureTokenCounts(parsed);
            break;
          }
        } catch {
          malformedFrameReceived = true;
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer);
        const delta = parsed.message?.content ?? "";
        if (delta) {
          accumulated += delta;
          yield { type: "delta", content: delta };
        }
        if (parsed.done) {
          terminalFrameReceived = true;
          captureTokenCounts(parsed);
        }
      } catch {
        malformedFrameReceived = true;
      }
    }

    if (malformedFrameReceived || !terminalFrameReceived) {
      const message = malformedFrameReceived
        ? "Ollama returned malformed streaming data"
        : "Ollama stream ended before its terminal frame";
      const durableContent = accumulated
        ? `${accumulated}\n\n[${message}]`
        : message;
      await updateMessageContent(assistantMsg.id, durableContent);
      await updateMessageStatus(assistantMsg.id, "error");
      await recordTurn("failed");
      recordPrimaryTermination("stream.finalized.error", message);
      yield { type: "error", message };
      return;
    }

    if (!accumulated.trim()) {
      const message = "Ollama returned an empty response";
      await updateMessageContent(assistantMsg.id, message);
      await updateMessageStatus(assistantMsg.id, "error");
      await recordTurn("failed");
      recordPrimaryTermination("stream.finalized.error", message);
      yield { type: "error", message };
      return;
    }

    await updateMessageContent(assistantMsg.id, accumulated);
    await updateMessageStatus(assistantMsg.id, "complete");
    const quickAccess = mergeRelayKnowledgeQuickAccess([], knowledgeTurn);
    await db
      .update(chatMessages)
      .set({
        metadata: JSON.stringify({
          runtimeId: "ollama",
          modelId,
          ...(quickAccess.length > 0 ? { quickAccess } : {}),
          ...relayKnowledgeMetadata(knowledgeTurn),
        }),
      })
      .where(eq(chatMessages.id, assistantMsg.id));
    await recordTurn("completed");
    recordPrimaryTermination("stream.completed");
    yield { type: "done", messageId: assistantMsg.id, quickAccess, ...(modelId ? { modelId } : {}) };
  } catch (error) {
    const message = signal?.aborted
      ? "Request cancelled"
      : error instanceof Error
        ? error.message
        : "Ollama streaming failed";
    if (assistantMsg) {
      await updateMessageContent(assistantMsg.id, accumulated || message);
      await updateMessageStatus(assistantMsg.id, "error");
      await recordTurn(signal?.aborted ? "cancelled" : "failed");
    }
    recordPrimaryTermination(
      signal?.aborted ? "stream.aborted.signal" : "stream.finalized.error",
      message
    );
    yield { type: "error", message };
  } finally {
    if (assistantMsg && !ledgerRecorded) {
      try {
        await recordTurn(signal?.aborted ? "cancelled" : "failed");
      } catch (error) {
        console.error("[chat] Ollama usage finalization failed:", error);
      }
    }
    if (assistantMsg) {
      try {
        await finalizeStreamingMessage(assistantMsg.id, accumulated);
      } catch (error) {
        console.error("[chat] Ollama finalize safety net failed:", error);
      }
    } else if (!primaryTerminationRecorded) {
      recordPrimaryTermination(
        "stream.abandoned",
        "Ollama stream ended before creating an assistant message"
      );
    }
  }
}
