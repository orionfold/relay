/**
 * OpenAI Direct API runtime adapter.
 *
 * Calls the OpenAI Responses API directly via `openai` SDK
 * (no Codex binary needed). Supports streaming, hybrid tool use
 * (server-side + client-side), and session resume via
 * `previous_response_id`.
 */

import { db } from "@/lib/db";
import { tasks, agentLogs, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { setExecution, removeExecution, getExecution } from "../execution-manager";
import { DEFAULT_MAX_TURNS, DEFAULT_MAX_BUDGET_USD } from "@/lib/constants/task-status";
import {
  buildTaskQueryContext,
  createTaskUsageState,
} from "../claude-agent";
import { createToolServer } from "@/lib/chat/ainative-tools";
import type { OpenAIFunctionDef } from "@/lib/chat/tool-registry";
import { handleToolPermission, clearPermissionCache } from "../tool-permissions";
import {
  runAgenticLoop,
  type LoopMessage,
  type ModelTurnResult,
  type TurnUsage,
  type AgentStreamEvent,
} from "../agentic-loop";
import { getRuntimeCatalogEntry } from "./catalog";
import type {
  AgentRuntimeAdapter,
  RuntimeConnectionResult,
  TaskAssistInput,
} from "./types";
import type { TaskAssistResponse } from "./task-assist-types";
import type { ProfileTestReport } from "../profiles/test-types";
import { getProfile, listProfiles } from "../profiles/registry";
import {
  recordUsageLedgerEntry,
  resolveUsageActivityType,
} from "@/lib/usage/ledger";
import {
  scanTaskOutputDocuments,
  prepareTaskOutputDirectory,
  buildTaskOutputInstructions,
} from "@/lib/documents/output-scanner";

// ── Five-source MCP merge (TDR-035 §1) ──────────────────────────────

/**
 * Five-source MCP merge for the OpenAI direct runtime per TDR-035 §1.
 * Order: profile → browser → external → plugin → ainative (last, non-negotiable).
 *
 * Returns an object map (Record<serverName, config>) — the caller transforms
 * to OpenAI's tools: [{ type: "mcp", ... }] array shape at the request level
 * via mcpServersToOpenAiTools.
 *
 * Async + dynamic import of @/lib/chat/ainative-tools per TDR-032.
 *
 * pluginServers is passed as a pure arg (caller responsibility) — the helper
 * does NOT call loadPluginMcpServers directly; callers load it once per
 * request and pass the result here so the full task lifecycle uses a
 * single consistent snapshot.
 */
export async function withOpenAiDirectMcpServers(
  profileServers: Record<string, unknown>,
  browserServers: Record<string, unknown>,
  externalServers: Record<string, unknown>,
  pluginServers: Record<string, unknown>,
  projectId?: string | null,
): Promise<Record<string, unknown>> {
  const { createToolServer } = await import("@/lib/chat/ainative-tools");
  const relayServer = createToolServer(projectId).asMcpServer();
  return {
    ...profileServers,
    ...browserServers,
    ...externalServers,
    ...pluginServers,
    relay: relayServer,
  };
}

/**
 * Transform a merged MCP server map into OpenAI's Responses API tools shape.
 * Each entry becomes { type: "mcp", server_label, ... } in the tools array.
 *
 * The "relay" in-process server is NOT emitted — OpenAI direct uses its own
 * function-calling tools path for it (existing createToolServer flow).
 * Plugin servers (stdio or ainative-sdk) are emitted as MCP entries.
 */
export function mcpServersToOpenAiTools(
  mergedServers: Record<string, unknown>,
): Array<{ type: "mcp"; server_label: string; [key: string]: unknown }> {
  const tools: Array<{ type: "mcp"; server_label: string; [key: string]: unknown }> = [];
  for (const [name, config] of Object.entries(mergedServers)) {
    if (name === "relay") continue; // relay in-process tools handled via function-calling, not MCP path
    const cfg = config as Record<string, unknown>;
    const entry: { type: "mcp"; server_label: string; [key: string]: unknown } = {
      type: "mcp",
      server_label: name,
    };
    // Pass through known fields; schema conformance is the plugin author's responsibility.
    if (typeof cfg.command === "string") entry.command = cfg.command;
    if (Array.isArray(cfg.args)) entry.args = cfg.args;
    if (cfg.env && typeof cfg.env === "object") entry.env = cfg.env;
    if (typeof cfg.url === "string") entry.server_url = cfg.url;
    tools.push(entry);
  }
  return tools;
}

// ── SDK lazy import ──────────────────────────────────────────────────

type OpenAISDK = typeof import("openai");
let _sdk: OpenAISDK | null = null;

async function getOpenAISDK(): Promise<OpenAISDK> {
  if (!_sdk) {
    _sdk = await import("openai");
  }
  return _sdk;
}

// ── API key resolution ───────────────────────────────────────────────

async function getOpenAIApiKeyValue(): Promise<string> {
  const { getOpenAIApiKey } = await import("@/lib/settings/openai-auth");
  const { apiKey } = await getOpenAIApiKey();
  if (apiKey) return apiKey;
  throw new Error("No OpenAI API key configured. Set one in Settings > Authentication.");
}

// ── Model call via Responses API ─────────────────────────────────────

/** Options for OpenAI model call. */
interface OpenAICallOptions {
  modelId?: string;
  previousResponseId?: string | null;
  /** Server-side tools to enable (e.g., { web_search_preview: true, code_interpreter: true }). */
  serverTools?: Record<string, boolean>;
  /**
   * Plugin MCP tool entries from the five-source merge (TDR-035 §1).
   * Already transformed to OpenAI { type: "mcp", server_label, ... } shape.
   * Appended to the tools array at request time.
   */
  pluginMcpTools?: Array<{ type: "mcp"; server_label: string; [key: string]: unknown }>;
}

async function callOpenAIModel(
  client: InstanceType<OpenAISDK["default"]>,
  instructions: string,
  input: LoopMessage[],
  tools: OpenAIFunctionDef[],
  _signal: AbortSignal,
  emitEvent: (event: AgentStreamEvent) => void,
  options: OpenAICallOptions = {},
): Promise<ModelTurnResult & { responseId?: string }> {
  const modelId = options.modelId ?? getRuntimeCatalogEntry("openai-direct").models.default;

  // Build tool array: ainative function tools + enabled server-side tools + plugin MCP tools
  const serverToolConfig = options.serverTools ?? { web_search_preview: true };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTools: any[] = [...tools];
  for (const [toolType, enabled] of Object.entries(serverToolConfig)) {
    if (enabled) allTools.push({ type: toolType });
  }
  // Append plugin MCP tools from five-source merge (TDR-035 §1)
  if (options.pluginMcpTools && options.pluginMcpTools.length > 0) {
    allTools.push(...options.pluginMcpTools);
  }

  const response = await client.responses.create({
    model: modelId,
    instructions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: input as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: allTools as any,
    ...(options.previousResponseId ? { previous_response_id: options.previousResponseId } : {}),
  });

  emitEvent({ type: "status", phase: "running" });

  let text = "";
  const toolCalls: ModelTurnResult["toolCalls"] = [];
  const usage: TurnUsage = { modelId };
  let responseId: string | undefined;

  // Process response output
  responseId = response.id;

  if (response.usage) {
    usage.inputTokens = response.usage.input_tokens;
    usage.outputTokens = response.usage.output_tokens;
    usage.totalTokens = response.usage.input_tokens + response.usage.output_tokens;
  }

  for (const item of response.output) {
    if (item.type === "message") {
      for (const part of item.content) {
        if (part.type === "output_text") {
          text += part.text;
          emitEvent({ type: "delta", content: part.text });
        }
      }
    } else if (item.type === "function_call") {
      // Client-side ainative tool call — needs HITL
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(item.arguments);
      } catch {
        parsedArgs = {};
      }
      toolCalls.push({
        id: item.call_id,
        name: item.name,
        arguments: parsedArgs,
      });
      emitEvent({ type: "status", phase: "tool_use", message: item.name });
    }
    // Server-side tool results (web_search_call etc.) are in output
    // but already handled by the API — just log them
  }

  const isComplete = response.status === "completed" && toolCalls.length === 0;

  return {
    text,
    toolCalls,
    isComplete,
    needsContinuation: false, // Responses API handles continuations internally
    usage,
    responseId,
  };
}

// ── Session persistence ──────────────────────────────────────────────

async function saveResponseId(taskId: string, profileId: string, responseId: string) {
  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId,
    agentType: profileId,
    event: "openai_response_id",
    payload: JSON.stringify({ responseId }),
    timestamp: new Date(),
  });
}

async function loadResponseId(taskId: string): Promise<string | null> {
  const [log] = await db
    .select()
    .from(agentLogs)
    .where(eq(agentLogs.taskId, taskId))
    .orderBy(agentLogs.timestamp)
    .limit(1);

  if (!log?.payload) return null;
  try {
    const data = JSON.parse(log.payload);
    return data.responseId ?? null;
  } catch {
    return null;
  }
}

// ── Core task execution ──────────────────────────────────────────────

async function executeOpenAIDirectTask(taskId: string, isResume = false): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);

  const agentProfileId = task.agentProfile ?? "general";
  const usageState = createTaskUsageState(task, isResume);
  const abortController = new AbortController();

  setExecution(taskId, {
    abortController,
    sessionId: null,
    taskId,
    startedAt: new Date(),
  });

  try {
    await db
      .update(tasks)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));

    const ctx = await buildTaskQueryContext(task, agentProfileId);

    // Prepare output directory so the agent can write output files
    if (!isResume) {
      await prepareTaskOutputDirectory(taskId);
    }
    const outputInstructions = buildTaskOutputInstructions(taskId);
    ctx.systemInstructions = `${ctx.systemInstructions}\n\n${outputInstructions}`;

    const apiKey = await getOpenAIApiKeyValue();
    const sdk = await getOpenAISDK();
    const client = new sdk.default({ apiKey });

    const toolServer = createToolServer(task.projectId);
    const { tools, executeHandler } = toolServer.forProvider("openai");

    // Merge all five MCP server sources (TDR-035 §1).
    // Browser/external MCP are not yet wired in this adapter; pass {} for those
    // sources. pluginServers is loaded dynamically to avoid module-load cycles.
    const pluginServers = await (async () => {
      const { loadPluginMcpServers } = await import("@/lib/plugins/mcp-loader");
      return loadPluginMcpServers({ runtime: "openai-direct" });
    })();
    const mergedMcpServers = await withOpenAiDirectMcpServers(
      {},
      {},
      {},
      pluginServers,
      task.projectId,
    );
    const pluginMcpTools = mcpServersToOpenAiTools(mergedMcpServers);

    // Resolve model: explicit runtime setting > onboarding model preference
    // tier > catalog default ("Balanced" means the balanced tier on every
    // runtime, not just chat — fix-workflow-model-preference-propagation).
    const { getSetting } = await import("@/lib/settings/helpers");
    const { resolvePreferredModel } = await import("./model-preference");
    const modelId =
      (await getSetting("openai_direct_model")) ??
      (await resolvePreferredModel("openai-direct")).modelId;
    const maxTurns = ctx.maxTurns ?? DEFAULT_MAX_TURNS;

    // For resume: load previous response ID
    let previousResponseId: string | null = null;
    if (isResume) {
      previousResponseId = await loadResponseId(taskId);
    }

    const initialMessages: LoopMessage[] = [
      { role: "user", content: ctx.userPrompt },
    ];

    // Log start
    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId,
      agentType: agentProfileId,
      event: isResume ? "resumed" : "started",
      payload: JSON.stringify({
        runtime: "openai-direct",
        model: modelId,
        maxTurns,
      }),
      timestamp: new Date(),
    });

    // Track last response ID for resume
    let lastResponseId: string | null = previousResponseId;

    const result = await runAgenticLoop(initialMessages, {
      async callModel(messages, signal) {
        // Resolve capability overrides from profile
        const profile = getProfile(agentProfileId);
        const capOverrides = profile?.capabilityOverrides?.["openai-direct"];

        const turnResult = await callOpenAIModel(
          client,
          ctx.systemInstructions,
          messages,
          tools as OpenAIFunctionDef[],
          signal,
          (evt) => {
            void db.insert(agentLogs).values({
              id: crypto.randomUUID(),
              taskId,
              agentType: agentProfileId,
              event: "stream",
              payload: JSON.stringify(evt),
              timestamp: new Date(),
            });
          },
          {
            modelId: capOverrides?.modelId ?? modelId,
            previousResponseId: lastResponseId,
            serverTools: capOverrides?.serverTools,
            pluginMcpTools,
          },
        );

        // Store response ID for resume
        if (turnResult.responseId) {
          lastResponseId = turnResult.responseId;
          await saveResponseId(taskId, agentProfileId, turnResult.responseId);
        }

        return turnResult;
      },

      formatToolResult(toolCallId, _toolName, result) {
        return {
          type: "function_call_output",
          call_id: toolCallId,
          output: result.content.map((c) => c.text).join("\n"),
        };
      },

      formatContinuation() {
        return { role: "user", content: "Please continue." };
      },

      async executeTool(name, args) {
        return executeHandler(name, args);
      },

      async checkPermission(toolName, args) {
        return handleToolPermission(taskId, toolName, args, ctx.canUseToolPolicy);
      },

      emitEvent(_event) {
        // Events logged in callModel
      },

      maxTurns,
      maxBudgetUsd: task.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD,
      signal: abortController.signal,
    });

    const finalStatus = result.stopReason === "complete" ? "completed" : "failed";
    const resultText = result.stopReason === "complete"
      ? result.finalText
      : result.errorMessage
        ? `Task stopped: ${result.stopReason} — ${result.errorMessage}`
        : `Task stopped: ${result.stopReason}`;

    await db
      .update(tasks)
      .set({ status: finalStatus, result: resultText, updatedAt: new Date() })
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
        turns: result.turnCount,
        usage: result.totalUsage,
      }),
      timestamp: new Date(),
    });

    // Scan output directory for generated documents
    try {
      await scanTaskOutputDocuments(taskId);
    } catch (error) {
      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId,
        agentType: agentProfileId,
        event: "output_scan_failed",
        payload: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
        timestamp: new Date(),
      });
    }

    await recordUsageLedgerEntry({
      taskId,
      workflowId: task.workflowId ?? null,
      scheduleId: task.scheduleId ?? null,
      projectId: task.projectId ?? null,
      activityType: resolveUsageActivityType({
        workflowId: task.workflowId,
        scheduleId: task.scheduleId,
        isResume,
      }),
      runtimeId: "openai-direct",
      providerId: "openai",
      modelId: result.totalUsage.modelId ?? modelId,
      inputTokens: result.totalUsage.inputTokens ?? null,
      outputTokens: result.totalUsage.outputTokens ?? null,
      totalTokens: result.totalUsage.totalTokens ?? null,
      status: finalStatus,
      startedAt: usageState.startedAt,
      finishedAt: new Date(),
    });

    await db
      .update(tasks)
      .set({
        effectiveModelId: result.totalUsage.modelId ?? modelId,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));
  } catch (err) {
    if (!abortController.signal.aborted) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await db
        .update(tasks)
        .set({ status: "failed", result: errorMsg, updatedAt: new Date() })
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
    clearPermissionCache(taskId);
    removeExecution(taskId);
  }
}

// ── Task Assist ──────────────────────────────────────────────────────

async function runOpenAITaskAssist(input: TaskAssistInput): Promise<TaskAssistResponse> {
  const apiKey = await getOpenAIApiKeyValue();
  const sdk = await getOpenAISDK();
  const client = new sdk.default({ apiKey });

  const profileIds = listProfiles().map((p) => p.id);
  const profileList = profileIds.length > 0
    ? `Available agent profiles: ${profileIds.join(", ")}`
    : "No explicit profiles available.";

  const instructions = `You are an AI task definition assistant. Analyze the given task and return ONLY a JSON object (no markdown) with:
- "improvedDescription", "breakdown", "recommendedPattern", "complexity", "needsCheckpoint", "reasoning"

${profileList}`;

  const userContent = [
    input.title ? `Task title: ${input.title}` : "",
    input.description ? `Description: ${input.description}` : "",
  ].filter(Boolean).join("\n");

  const response = await client.responses.create({
    model: getRuntimeCatalogEntry("openai-direct").models.tiers?.balanced
      ?? getRuntimeCatalogEntry("openai-direct").models.default,
    instructions,
    input: userContent || "Analyze this task",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = (response.output as any[])
    .filter((item) => item.type === "message")
    .flatMap((item) =>
      (item.content ?? [])
        .filter((p: { type: string }) => p.type === "output_text")
        .map((p: { text?: string }) => p.text ?? ""),
    )
    .join("");

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

// ── Connection Test ──────────────────────────────────────────────────

async function testOpenAIConnection(): Promise<RuntimeConnectionResult> {
  try {
    const apiKey = await getOpenAIApiKeyValue();
    const sdk = await getOpenAISDK();
    const client = new sdk.default({ apiKey });

    // Simple validation
    await client.responses.create({
      model: getRuntimeCatalogEntry("openai-direct").models.tiers?.fast
        ?? getRuntimeCatalogEntry("openai-direct").models.default,
      input: "ping",
    });

    return { connected: true, apiKeySource: "db" };
  } catch (err) {
    return {
      connected: false,
      error: err instanceof Error ? err.message : "Connection failed",
    };
  }
}

// ── Adapter export ───────────────────────────────────────────────────

export const openAIDirectRuntimeAdapter: AgentRuntimeAdapter = {
  metadata: getRuntimeCatalogEntry("openai-direct" as never), // Registered in catalog.ts

  async executeTask(taskId: string) {
    return executeOpenAIDirectTask(taskId, false);
  },

  async resumeTask(taskId: string) {
    return executeOpenAIDirectTask(taskId, true);
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
    return runOpenAITaskAssist(input);
  },

  async runProfileTests(profileId: string): Promise<ProfileTestReport> {
    const profile = getProfile(profileId);
    return {
      profileId,
      profileName: profile?.name ?? profileId,
      runtimeId: "openai-direct",
      results: [],
      totalPassed: 0,
      totalFailed: 0,
      unsupported: true,
      unsupportedReason: "Profile smoke tests not yet implemented for OpenAI Direct runtime",
    };
  },

  async testConnection() {
    return testOpenAIConnection();
  },
};
