import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentLogs, notifications, tasks } from "@/lib/db/schema";
import { buildTaskQueryContext, createTaskUsageState } from "../claude-agent";
import { getExecution, removeExecution, setExecution } from "../execution-manager";
import { recordUsageLedgerEntry, resolveUsageActivityType } from "@/lib/usage/ledger";
import { getRuntimeCatalogEntry } from "./catalog";
import type { AgentRuntimeAdapter, RuntimeConnectionResult } from "./types";
import {
  createOpenAICompatibleCompletion,
  getOpenAICompatibleRuntimeConfig,
  listOpenAICompatibleModels,
  resolveOpenAICompatibleModel,
  type OpenAICompatibleRuntimeId,
} from "./openai-compatible";

function usageCompleteness(inputTokens: number | null, outputTokens: number | null) {
  if (inputTokens != null && outputTokens != null) return "complete" as const;
  if (inputTokens != null || outputTokens != null) return "partial" as const;
  return "unavailable" as const;
}

async function recordTaskUsage(input: {
  task: typeof tasks.$inferSelect;
  runtimeId: OpenAICompatibleRuntimeId;
  modelId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reportedCostMicros: number | null;
  status: "completed" | "failed" | "cancelled";
  startedAt: Date;
}) {
  await recordUsageLedgerEntry({
    taskId: input.task.id,
    workflowId: input.task.workflowId ?? null,
    scheduleId: input.task.scheduleId ?? null,
    projectId: input.task.projectId ?? null,
    activityType: resolveUsageActivityType({
      workflowId: input.task.workflowId,
      scheduleId: input.task.scheduleId,
      isResume: false,
    }),
    runtimeId: input.runtimeId,
    providerId: input.runtimeId,
    modelId: input.modelId,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens: input.totalTokens,
    reportedCostMicros: input.reportedCostMicros,
    usageCompleteness: usageCompleteness(input.inputTokens, input.outputTokens),
    usageSource:
      input.runtimeId === "litellm"
        ? "litellm-chat-completion"
        : "lmstudio-chat-completion",
    usageDetails: {
      costSource:
        input.reportedCostMicros == null
          ? "not-reported"
          : "x-litellm-response-cost",
    },
    status: input.status,
    startedAt: input.startedAt,
    finishedAt: new Date(),
  });
}

async function executeCompatibleTask(
  runtimeId: OpenAICompatibleRuntimeId,
  taskId: string
): Promise<void> {
  const task = await db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new Error(`Task ${taskId} not found`);

  const usageState = createTaskUsageState(task, false);
  const abortController = new AbortController();
  let modelId = task.effectiveModelId;
  let ledgerRecorded = false;
  const agentProfileId = task.agentProfile ?? "general";

  setExecution(taskId, {
    abortController,
    sessionId: null,
    taskId,
    startedAt: usageState.startedAt,
  });

  try {
    await db
      .update(tasks)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    const [ctx, config] = await Promise.all([
      buildTaskQueryContext(task, agentProfileId),
      getOpenAICompatibleRuntimeConfig(runtimeId),
    ]);
    modelId = await resolveOpenAICompatibleModel(runtimeId, modelId);

    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId,
      agentType: agentProfileId,
      event: "started",
      payload: JSON.stringify({
        runtime: runtimeId,
        requestedModel: task.effectiveModelId,
        model: modelId,
        endpointOrigin: new URL(config.baseUrl).origin,
      }),
      timestamp: new Date(),
    });

    const messages: Array<{
      role: "system" | "user";
      content: string;
    }> = [];
    if (ctx.systemInstructions) {
      messages.push({ role: "system", content: ctx.systemInstructions });
    }
    messages.push({ role: "user", content: ctx.userPrompt });

    const result = await createOpenAICompatibleCompletion({
      runtimeId,
      model: modelId,
      messages,
      signal: abortController.signal,
    });
    modelId = result.modelId;

    await db
      .update(tasks)
      .set({
        status: "completed",
        result: result.text,
        effectiveModelId: modelId,
        turnCount: 1,
        tokenCount: result.usage.totalTokens,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId,
      agentType: agentProfileId,
      event: "completed",
      payload: JSON.stringify({
        result: result.text.slice(0, 1000),
        turns: 1,
        usage: { modelId, ...result.usage },
      }),
      timestamp: new Date(),
    });
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      taskId,
      type: "task_completed",
      title: `Task completed: ${task.title}`,
      body: result.text.slice(0, 500),
      createdAt: new Date(),
    });
    await recordTaskUsage({
      task,
      runtimeId,
      modelId,
      ...result.usage,
      reportedCostMicros: result.reportedCostMicros,
      status: "completed",
      startedAt: usageState.startedAt,
    });
    ledgerRecorded = true;
  } catch (error) {
    const cancelled = abortController.signal.aborted;
    const message = cancelled
      ? `${getRuntimeCatalogEntry(runtimeId).label} task was cancelled`
      : error instanceof Error
        ? error.message
        : String(error);
    await db
      .update(tasks)
      .set({
        status: cancelled ? "cancelled" : "failed",
        result: message,
        effectiveModelId: modelId,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      taskId,
      type: cancelled ? "agent_message" : "task_failed",
      title: cancelled ? `Task cancelled: ${task.title}` : `Task failed: ${task.title}`,
      body: message.slice(0, 500),
      createdAt: new Date(),
    });
    if (!ledgerRecorded) {
      await recordTaskUsage({
        task,
        runtimeId,
        modelId,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        reportedCostMicros: null,
        status: cancelled ? "cancelled" : "failed",
        startedAt: usageState.startedAt,
      });
    }
    if (!cancelled) throw error;
  } finally {
    removeExecution(taskId);
  }
}

async function testCompatibleConnection(
  runtimeId: OpenAICompatibleRuntimeId
): Promise<RuntimeConnectionResult> {
  try {
    const config = await getOpenAICompatibleRuntimeConfig(runtimeId);
    if (!config.configured) {
      return {
        connected: false,
        apiKeySource: config.apiKeySource,
        error: `${config.label} is not configured`,
      };
    }
    await listOpenAICompatibleModels(runtimeId, AbortSignal.timeout(5_000));
    return { connected: true, apiKeySource: config.apiKeySource };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function makeOpenAICompatibleAdapter(
  runtimeId: OpenAICompatibleRuntimeId
): AgentRuntimeAdapter {
  return {
    metadata: getRuntimeCatalogEntry(runtimeId),
    executeTask: (taskId) => executeCompatibleTask(runtimeId, taskId),
    async resumeTask() {
      throw new Error(
        `${getRuntimeCatalogEntry(runtimeId).label} does not support task resume`
      );
    },
    async cancelTask(taskId) {
      getExecution(taskId)?.abortController?.abort();
      await db
        .update(tasks)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
    },
    testConnection: () => testCompatibleConnection(runtimeId),
  };
}

export const liteLLMRuntimeAdapter = makeOpenAICompatibleAdapter("litellm");
export const lmStudioRuntimeAdapter = makeOpenAICompatibleAdapter("lmstudio");
