/**
 * Ollama chat engine — streams messages via the Ollama /api/chat endpoint.
 *
 * Follows the same ChatStreamEvent protocol as the main engine
 * so the chat UI can render Ollama responses identically.
 */

import { db } from "@/lib/db";
import { chatMessages, projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSetting } from "@/lib/settings/helpers";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
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
import type { ChatStreamEvent } from "./types";

/**
 * Send a user message to Ollama and stream the response.
 */
export async function* sendOllamaMessage(
  conversationId: string,
  userContent: string,
  signal?: AbortSignal
): AsyncGenerator<ChatStreamEvent> {
  const conversation = await getConversation(conversationId);
  if (!conversation) {
    yield { type: "error", message: "Conversation not found" };
    return;
  }

  yield { type: "status", phase: "preparing", message: "Connecting to Ollama..." };

  // Resolve Ollama base URL and model
  const baseUrl =
    (await getSetting(SETTINGS_KEYS.OLLAMA_BASE_URL)) || "http://localhost:11434";
  // Resolve: conversation-pinned model → configured default → first pulled
  // model → named error. Never the old hardcoded `llama3.2` phantom (#25).
  const requestedModel = conversation.modelId?.replace(/^ollama:/, "");
  const defaultModel = await getSetting(SETTINGS_KEYS.OLLAMA_DEFAULT_MODEL);
  let modelId: string;
  try {
    modelId = await resolveOllamaModel(baseUrl, requestedModel, defaultModel);
  } catch (err) {
    // Surface the "no model configured" case as a visible chat error rather
    // than an unhandled rejection that silently kills the stream (#25, CLAUDE.md #1).
    yield {
      type: "error",
      message: err instanceof Error ? err.message : "No Ollama model configured",
    };
    return;
  }

  // Build context
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

  // Persist user message
  await addMessage({
    conversationId,
    role: "user",
    content: userContent,
    status: "complete",
  });

  // Create assistant message placeholder
  const assistantMsg = await addMessage({
    conversationId,
    role: "assistant",
    content: "",
    status: "streaming",
  });

  // Build message history for Ollama
  const history = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(chatMessages.createdAt)
    .all();

  const messages = [
    // System prompt from context
    ...(context.systemPrompt
      ? [{ role: "system" as const, content: context.systemPrompt }]
      : []),
    // Conversation history (exclude the placeholder assistant msg)
    ...history
      .filter((m) => m.id !== assistantMsg.id && m.content)
      .map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content!,
      })),
  ];

  // Stream from Ollama
  let accumulated = "";

  // Meter the turn like every other chat path (main engine writes a
  // chat_turn row on success, degrade, and error). Ollama's final chunk
  // reports prompt_eval_count / eval_count; local runs are recorded at $0 —
  // those rows are what proves blended-cost savings on /costs.
  const startedAt = new Date();
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let ledgerRecorded = false;
  const recordTurn = async (status: "completed" | "failed" | "cancelled") => {
    if (ledgerRecorded) return;
    ledgerRecorded = true;
    await recordUsageLedgerEntry({
      projectId: conversation.projectId ?? null,
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
    const response = await fetch(`${baseUrl}/api/chat`, {
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
      yield { type: "error", message: `Ollama error (${response.status}): ${errorText}` };
      await updateMessageStatus(assistantMsg.id, "complete");
      await recordTurn("failed");
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", message: "No response stream from Ollama" };
      await updateMessageStatus(assistantMsg.id, "complete");
      await recordTurn("failed");
      return;
    }

    yield { type: "status", phase: "streaming", message: "Streaming response..." };

    const decoder = new TextDecoder();
    let buffer = "";

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
            captureTokenCounts(parsed);
            break;
          }
        } catch {
          // Skip malformed lines
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
        if (parsed.done) captureTokenCounts(parsed);
      } catch {
        // ignore
      }
    }

    // Persist the complete response
    await updateMessageContent(assistantMsg.id, accumulated);
    await updateMessageStatus(assistantMsg.id, "complete");
    await recordTurn("completed");

    yield { type: "done", messageId: assistantMsg.id, quickAccess: [] };
  } catch (err) {
    if (signal?.aborted) {
      yield { type: "error", message: "Request cancelled" };
    } else {
      const msg = err instanceof Error ? err.message : "Ollama streaming failed";
      yield { type: "error", message: msg };
    }
    if (accumulated) {
      await updateMessageContent(assistantMsg.id, accumulated);
    }
    await updateMessageStatus(assistantMsg.id, "complete");
    await recordTurn(signal?.aborted ? "cancelled" : "failed");
  }
}
