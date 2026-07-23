/**
 * Ollama runtime adapter.
 *
 * Calls the Ollama REST API directly via `fetch()` — no SDK dependency.
 * Supports NDJSON streaming, model listing, and model pulling.
 * Cost is always $0 (local execution).
 */

import { db } from "@/lib/db";
import { tasks, agentLogs, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { setExecution, removeExecution, getExecution } from "../execution-manager";
import { buildTaskQueryContext, createTaskUsageState } from "../claude-agent";
import { getRuntimeCatalogEntry } from "./catalog";
import { resolveOllamaModel } from "./ollama-model-resolver";
import type {
  AgentRuntimeAdapter,
  RuntimeConnectionResult,
  TaskAssistInput,
} from "./types";
import type { TaskAssistResponse } from "./task-assist-types";
import { getProfile, listProfiles } from "../profiles/registry";
import { recordUsageLedgerEntry, resolveUsageActivityType } from "@/lib/usage/ledger";
import {
  fetchOllama,
  getOllamaRuntimeConfig,
  type OllamaRuntimeConfig,
} from "./ollama-config";
import { classifyTaskFailureReason } from "./launch-failure";

// ── Settings helpers ────────────────────────────────────────────────

/**
 * Resolve the effective Ollama model for a task. Uses the configured default,
 * else the first actually-pulled model, else throws a named error — never the
 * old hardcoded `llama3.2` phantom (issue #25).
 */
async function getOllamaModel(
  config: OllamaRuntimeConfig,
  requestedModel?: string | null,
): Promise<string> {
  return resolveOllamaModel(config, requestedModel, config.defaultModel);
}

// ── NDJSON streaming chat ───────────────────────────────────────────

interface OllamaChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  message?: { content: string };
  done: boolean;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

async function streamOllamaChat(
  config: OllamaRuntimeConfig,
  model: string,
  messages: OllamaChatMessage[],
  signal?: AbortSignal,
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const response = await fetchOllama(config, "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Ollama API error (${response.status}): ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Ollama response body is not readable");
  }

  const decoder = new TextDecoder();
  let accumulated = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last incomplete line in buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed: OllamaChatResponse = JSON.parse(line);
        accumulated += parsed.message?.content ?? "";
        if (parsed.done) {
          promptTokens = parsed.prompt_eval_count ?? 0;
          completionTokens = parsed.eval_count ?? 0;
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  // Process any remaining buffer
  if (buffer.trim()) {
    try {
      const parsed: OllamaChatResponse = JSON.parse(buffer);
      accumulated += parsed.message?.content ?? "";
      if (parsed.done) {
        promptTokens = parsed.prompt_eval_count ?? 0;
        completionTokens = parsed.eval_count ?? 0;
      }
    } catch {
      // Skip
    }
  }

  return { text: accumulated, promptTokens, completionTokens };
}

/** Non-streaming chat for task assist (simpler) */
async function callOllamaChat(
  config: OllamaRuntimeConfig,
  model: string,
  messages: OllamaChatMessage[],
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  const response = await fetchOllama(config, "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Ollama API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return {
    text: data.message?.content ?? "",
    promptTokens: data.prompt_eval_count ?? 0,
    completionTokens: data.eval_count ?? 0,
  };
}

// ── Core task execution ─────────────────────────────────────────────

async function executeOllamaTask(taskId: string): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);

  const agentProfileId = task.agentProfile ?? "general";
  const usageState = createTaskUsageState(task, false);
  const abortController = new AbortController();

  setExecution(taskId, {
    abortController,
    sessionId: null,
    taskId,
    startedAt: new Date(),
  });

  try {
    // Mark as running
    await db
      .update(tasks)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    const ctx = await buildTaskQueryContext(task, agentProfileId, "ollama");
    const config = await getOllamaRuntimeConfig();
    const modelId = await getOllamaModel(config, task.effectiveModelId);

    // Build messages
    const messages: OllamaChatMessage[] = [];
    if (ctx.systemInstructions) {
      messages.push({ role: "system", content: ctx.systemInstructions });
    }
    messages.push({ role: "user", content: ctx.userPrompt });

    // Log start
    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId,
      agentType: agentProfileId,
      event: "started",
      payload: JSON.stringify({
        runtime: "ollama",
        model: modelId,
        endpoint: new URL(config.baseUrl).hostname,
      }),
      timestamp: new Date(),
    });

    // Stream the response
    const result = await streamOllamaChat(
      config,
      modelId,
      messages,
      abortController.signal,
    );

    // Finalize task
    const finalStatus = result.text ? "completed" : "failed";
    const resultText = result.text || "Ollama returned an empty response";

    await db
      .update(tasks)
      .set({
        status: finalStatus,
        result: resultText,
        effectiveModelId: modelId,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      taskId,
      type: finalStatus === "completed" ? "task_completed" : "task_failed",
      title: `Task ${finalStatus}: ${task.title}`,
      body: resultText.slice(0, 500),
      createdAt: new Date(),
    });

    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId,
      agentType: agentProfileId,
      event: finalStatus,
      payload: JSON.stringify({
        result: resultText.slice(0, 1000),
        turns: 1,
        usage: {
          modelId,
          inputTokens: result.promptTokens,
          outputTokens: result.completionTokens,
          totalTokens: result.promptTokens + result.completionTokens,
        },
      }),
      timestamp: new Date(),
    });

    // Record usage — cost is always $0 for local models
    await recordUsageLedgerEntry({
      taskId,
      workflowId: task.workflowId ?? null,
      scheduleId: task.scheduleId ?? null,
      projectId: task.projectId ?? null,
      activityType: resolveUsageActivityType({
        workflowId: task.workflowId,
        scheduleId: task.scheduleId,
        isResume: false,
      }),
      runtimeId: "ollama",
      providerId: "ollama",
      modelId,
      inputTokens: result.promptTokens,
      outputTokens: result.completionTokens,
      totalTokens: result.promptTokens + result.completionTokens,
      usageCompleteness: "complete",
      usageSource: "ollama-response",
      status: finalStatus,
      startedAt: usageState.startedAt,
      finishedAt: new Date(),
    });
  } catch (err) {
    if (!abortController.signal.aborted) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await db
        .update(tasks)
        .set({
          status: "failed",
          result: errorMsg,
          failureReason: classifyTaskFailureReason(err),
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        taskId,
        type: "task_failed",
        title: `Task failed: ${task.title}`,
        body: errorMsg.slice(0, 500),
        createdAt: new Date(),
      });
    }
  } finally {
    removeExecution(taskId);
  }
}

// ── Task Assist ─────────────────────────────────────────────────────

async function runOllamaTaskAssist(input: TaskAssistInput): Promise<TaskAssistResponse> {
  const config = await getOllamaRuntimeConfig();
  const modelId = await getOllamaModel(config);

  const profileIds = listProfiles().map((p) => p.id);
  const profileList = profileIds.length > 0
    ? `Available agent profiles: ${profileIds.join(", ")}`
    : "No explicit profiles available.";

  const systemPrompt = `You are an AI task definition assistant. Analyze the given task and return ONLY a JSON object (no markdown) with:
- "improvedDescription": A clearer version of the task
- "breakdown": Array of step objects if complex (empty array if simple)
- "recommendedPattern": one of "single", "sequence", "planner-executor", "checkpoint", "parallel", "loop", "swarm"
- "complexity": "simple", "moderate", or "complex"
- "needsCheckpoint": boolean
- "reasoning": Brief explanation

${profileList}`;

  const userContent = [
    input.title ? `Task title: ${input.title}` : "",
    input.description ? `Description: ${input.description}` : "",
  ].filter(Boolean).join("\n");

  const { text } = await callOllamaChat(config, modelId, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent || "Analyze this task" },
  ]);

  try {
    return JSON.parse(text);
  } catch {
    return {
      improvedDescription: text,
      breakdown: [],
      recommendedPattern: "single",
      complexity: "simple",
      needsCheckpoint: false,
      reasoning: "Failed to parse structured response",
    };
  }
}

// ── Connection Test ─────────────────────────────────────────────────

async function testOllamaConnection(): Promise<RuntimeConnectionResult> {
  try {
    const config = await getOllamaRuntimeConfig();
    const response = await fetchOllama(config, "/api/tags", {}, 5_000);

    if (!response.ok) {
      return {
        connected: false,
        error: `Ollama responded with status ${response.status}`,
      };
    }

    return { connected: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    const isTimeout = message.includes("timeout") || message.includes("abort");
    const isRefused = message.includes("ECONNREFUSED") || message.includes("fetch failed");

    return {
      connected: false,
      error: isTimeout
        ? "Ollama is not responding (timeout). Is it running?"
        : isRefused
          ? "Cannot connect to Ollama. Make sure it is running (ollama serve)."
          : message,
    };
  }
}

// ── Adapter export ──────────────────────────────────────────────────

export const ollamaRuntimeAdapter: AgentRuntimeAdapter = {
  metadata: getRuntimeCatalogEntry("ollama"),

  async executeTask(taskId: string) {
    return executeOllamaTask(taskId);
  },

  async resumeTask(_taskId: string) {
    throw new Error("Ollama runtime does not support task resume");
  },

  async cancelTask(taskId: string) {
    const execution = getExecution(taskId);
    if (execution?.abortController) {
      execution.abortController.abort();
    }
    await db
      .update(tasks)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    removeExecution(taskId);
  },

  async runTaskAssist(input: TaskAssistInput) {
    return runOllamaTaskAssist(input);
  },

  async testConnection() {
    return testOllamaConnection();
  },
};
