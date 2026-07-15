import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chatMessages, projects } from "@/lib/db/schema";
import {
  addMessage,
  getConversation,
  updateMessageContent,
  updateMessageStatus,
} from "@/lib/data/chat";
import {
  resolveOpenAICompatibleModel,
  streamOpenAICompatibleCompletion,
  type CompatibleCompletionResult,
  type OpenAICompatibleRuntimeId,
} from "@/lib/agents/runtime/openai-compatible";
import type { ResolvedExecutionTarget } from "@/lib/agents/runtime/execution-target";
import { enforceBudgetGuardrails } from "@/lib/settings/budget-guardrails";
import { recordUsageLedgerEntry } from "@/lib/usage/ledger";
import { getWorkspaceContext } from "@/lib/environment/workspace-context";
import { buildChatContext } from "./context-builder";
import { finalizeStreamingMessage } from "./reconcile";
import { recordTermination, type TerminationReason } from "./stream-telemetry";
import type { ChatStreamEvent } from "./types";

function completeness(result: CompatibleCompletionResult | null) {
  if (result?.usage.inputTokens != null && result.usage.outputTokens != null) {
    return "complete" as const;
  }
  if (result?.usage.inputTokens != null || result?.usage.outputTokens != null) {
    return "partial" as const;
  }
  return "unavailable" as const;
}

export async function* sendOpenAICompatibleMessage(
  runtimeId: OpenAICompatibleRuntimeId,
  conversationId: string,
  userContent: string,
  signal: AbortSignal | undefined,
  target: ResolvedExecutionTarget
): AsyncGenerator<ChatStreamEvent> {
  const startedAt = new Date();
  let conversation: Awaited<ReturnType<typeof getConversation>> | null = null;
  let assistantMessage: Awaited<ReturnType<typeof addMessage>> | null = null;
  let accumulated = "";
  let result: CompatibleCompletionResult | null = null;
  let ledgerRecorded = false;
  let terminationRecorded = false;

  const recordPrimaryTermination = (
    reason: TerminationReason,
    error?: string
  ) => {
    if (terminationRecorded) return;
    terminationRecorded = true;
    recordTermination({
      reason,
      conversationId,
      messageId: assistantMessage?.id ?? null,
      durationMs: Date.now() - startedAt.getTime(),
      ...(error ? { error: error.slice(0, 500) } : {}),
    });
  };

  const recordTurn = async (status: "completed" | "failed" | "cancelled") => {
    if (ledgerRecorded) return;
    ledgerRecorded = true;
    await recordUsageLedgerEntry({
      projectId: conversation?.projectId ?? null,
      activityType: "chat_turn",
      runtimeId,
      providerId: runtimeId,
      modelId: result?.modelId ?? target.effectiveModelId,
      inputTokens: result?.usage.inputTokens ?? null,
      outputTokens: result?.usage.outputTokens ?? null,
      totalTokens: result?.usage.totalTokens ?? null,
      reportedCostMicros: result?.reportedCostMicros ?? null,
      usageCompleteness: completeness(result),
      usageSource:
        runtimeId === "litellm"
          ? "litellm-chat-completion-stream"
          : "lmstudio-chat-completion-stream",
      usageDetails: {
        requestedModelId: target.requestedModelId,
        effectiveModelId: result?.modelId ?? target.effectiveModelId,
        costSource:
          result?.reportedCostMicros == null
            ? "not-reported"
            : "x-litellm-response-cost",
      },
      status,
      startedAt,
      finishedAt: new Date(),
    });
  };

  try {
    conversation = await getConversation(conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    await enforceBudgetGuardrails({
      runtimeId,
      activityType: "chat_turn",
      projectId: conversation.projectId,
    });

    const modelId = await resolveOpenAICompatibleModel(
      runtimeId,
      target.effectiveModelId ?? conversation.modelId
    );
    yield {
      type: "status",
      phase: "preparing",
      message: `Connecting to ${runtimeId === "litellm" ? "LiteLLM" : "LM Studio"}...`,
    };

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
    assistantMessage = await addMessage({
      conversationId,
      role: "assistant",
      content: "",
      status: "streaming",
    });

    const messages = [
      ...(context.systemPrompt
        ? [{ role: "system" as const, content: context.systemPrompt }]
        : []),
      ...context.history
        .filter((message) => message.role !== "system" && message.content)
        .map((message) => ({
          role: message.role as "user" | "assistant",
          content: message.content,
        })),
      { role: "user" as const, content: userContent },
    ];

    yield { type: "status", phase: "streaming", message: "Streaming response..." };

    const deltas: string[] = [];
    let wake: (() => void) | null = null;
    let settled = false;
    let streamError: unknown = null;
    const completion = streamOpenAICompatibleCompletion({
      runtimeId,
      model: modelId,
      messages,
      signal,
      onDelta(delta) {
        deltas.push(delta);
        wake?.();
        wake = null;
      },
    })
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        streamError = error;
      })
      .finally(() => {
        settled = true;
        wake?.();
        wake = null;
      });

    while (!settled || deltas.length > 0) {
      if (deltas.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
        continue;
      }
      const delta = deltas.shift()!;
      accumulated += delta;
      yield { type: "delta", content: delta };
    }
    await completion;
    if (streamError) throw streamError;
    const completedResult = result as CompatibleCompletionResult | null;
    if (!completedResult) {
      throw new Error("Compatible runtime completed without a result");
    }

    await updateMessageContent(assistantMessage.id, accumulated);
    await updateMessageStatus(assistantMessage.id, "complete");
    await db
      .update(chatMessages)
      .set({
        metadata: JSON.stringify({
          runtimeId,
          requestedRuntimeId: target.requestedRuntimeId,
          requestedModelId: target.requestedModelId,
          modelId: completedResult.modelId,
          responseId: completedResult.responseId,
        }),
      })
      .where(eq(chatMessages.id, assistantMessage.id));
    await recordTurn("completed");
    recordPrimaryTermination("stream.completed");
    yield {
      type: "done",
      messageId: assistantMessage.id,
      quickAccess: [],
      modelId: completedResult.modelId,
    };
  } catch (error) {
    const aborted = signal?.aborted === true;
    const message = aborted
      ? "Request cancelled"
      : error instanceof Error
        ? error.message
        : "OpenAI-compatible streaming failed";
    if (assistantMessage) {
      await updateMessageContent(
        assistantMessage.id,
        accumulated ? `${accumulated}\n\n[${message}]` : message
      );
      await updateMessageStatus(assistantMessage.id, "error");
      await recordTurn(aborted ? "cancelled" : "failed");
    }
    recordPrimaryTermination(
      aborted ? "stream.aborted.signal" : "stream.finalized.error",
      message
    );
    yield { type: "error", message };
  } finally {
    if (assistantMessage && !ledgerRecorded) {
      try {
        await recordTurn(signal?.aborted ? "cancelled" : "failed");
      } catch (error) {
        console.error(`[chat] ${runtimeId} usage finalization failed:`, error);
      }
    }
    if (assistantMessage) {
      try {
        await finalizeStreamingMessage(assistantMessage.id, accumulated);
      } catch (error) {
        console.error(`[chat] ${runtimeId} finalize safety net failed:`, error);
      }
    } else if (!terminationRecorded) {
      recordPrimaryTermination(
        "stream.abandoned",
        `${runtimeId} stream ended before creating an assistant message`
      );
    }
  }
}
