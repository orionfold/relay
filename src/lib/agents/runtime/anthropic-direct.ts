/**
 * Anthropic Direct API runtime adapter.
 *
 * Calls the Anthropic Messages API directly via `@anthropic-ai/sdk`
 * (no subprocess spawning). Supports streaming, tool use, session
 * resume, and budget enforcement.
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
import type { AnthropicToolDef } from "@/lib/chat/tool-registry";
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
import type { ProfileAssistRequest, ProfileAssistResponse } from "./profile-assist-types";
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

// ── 5-source MCP merge ───────────────────────────────────────────────

/**
 * Five-source MCP merge for the Anthropic direct runtime per TDR-035 §1.
 * Order: profile → browser → external → plugin → ainative (last, non-negotiable).
 *
 * Async + dynamic import of @/lib/chat/ainative-tools per TDR-032 dynamic-import
 * discipline — the helper form matches withAinativeMcpServer in claude-agent.ts:70
 * so the pattern copies cleanly across adapters.
 *
 * pluginServers is passed as a pure arg (caller responsibility) — the helper
 * does NOT call loadPluginMcpServers directly; callers load it once per
 * request and pass the result here so the full task lifecycle uses a
 * single consistent snapshot.
 */
export async function withAnthropicDirectMcpServers(
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
 * Anthropic Messages API `mcp_servers` connector entry.
 * The API accepts ONLY remote URL connectors (`type: "url"`) — not
 * in-process server instances or local stdio (`command`) servers.
 */
export type AnthropicMcpConnector = {
  type: "url";
  url: string;
  name: string;
} & Record<string, string>;

/**
 * Project the five-source MCP merge down to the Anthropic Messages API
 * `mcp_servers` shape (remote URL connectors only).
 *
 * The API's `mcp_servers` field is for REMOTE MCP connectors reached over
 * HTTP; the SDK JSON-serializes the request body. The in-process `relay`
 * server (an SDK MCP server object with a circular `root` transport
 * back-reference) and local stdio (`command`) plugin servers CANNOT go here:
 *   - `relay` is not serializable → the SDK's `JSON.stringify(body)` throws
 *     "Converting circular structure to JSON … property 'root' closes the
 *     circle" and every anthropic-direct task fails before the model call.
 *   - stdio (`command`) servers are local subprocesses the remote API cannot
 *     reach; passing them is meaningless.
 *
 * Both are already available to the model as local function tools via
 * `forProvider("anthropic")` + `executeHandler`, so dropping them here loses
 * no capability. Only genuinely remote (URL-bearing) connectors are emitted;
 * any remaining scalar config fields (e.g. a per-connector bearer token) are
 * carried through opaquely. Mirrors openai-direct's `mcpServersToOpenAiTools`
 * (which likewise skips `relay`).
 */
export function mcpServersToAnthropicConnectors(
  mergedServers: Record<string, unknown>,
): AnthropicMcpConnector[] {
  const connectors: AnthropicMcpConnector[] = [];
  for (const [name, config] of Object.entries(mergedServers)) {
    if (name === "relay") continue; // in-process tools handled via function-calling, not the remote MCP path
    const cfg = config as Record<string, unknown>;
    const url = cfg.url ?? cfg.server_url;
    if (typeof url !== "string" || url.length === 0) {
      // stdio/command server or unserializable object — not a remote connector.
      continue;
    }
    const connector = { type: "url", url, name } as AnthropicMcpConnector;
    // Carry through any remaining scalar config fields opaquely (e.g. the
    // API's per-connector auth field, if a plugin config supplied one).
    for (const [key, value] of Object.entries(cfg)) {
      if (["url", "server_url", "command", "args", "env"].includes(key)) continue;
      if (typeof value === "string") connector[key] = value;
    }
    connectors.push(connector);
  }
  return connectors;
}

// ── SDK lazy import ──────────────────────────────────────────────────

type AnthropicSDK = typeof import("@anthropic-ai/sdk");
let _sdk: AnthropicSDK | null = null;

async function getAnthropicSDK(): Promise<AnthropicSDK> {
  if (!_sdk) {
    _sdk = await import("@anthropic-ai/sdk");
  }
  return _sdk;
}

// ── API key resolution ───────────────────────────────────────────────

async function getAnthropicApiKey(): Promise<string> {
  // Try DB-stored key first
  const { getSetting } = await import("@/lib/settings/helpers");
  const { SETTINGS_KEYS } = await import("@/lib/constants/settings");
  const { decrypt } = await import("@/lib/utils/crypto");

  const encryptedKey = await getSetting(SETTINGS_KEYS.AUTH_API_KEY);
  if (encryptedKey) {
    try {
      return decrypt(encryptedKey);
    } catch {
      // Fall through to env
    }
  }

  // Fall back to env var
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  throw new Error("No Anthropic API key configured. Set one in Settings > Authentication.");
}

// ── Streaming model call ─────────────────────────────────────────────

/** Options for prompt caching and advanced capabilities. */
interface AnthropicCallOptions {
  modelId?: string;
  maxTokens?: number;
  /** Enable prompt caching — splits system prompt into cacheable blocks. */
  enableCaching?: boolean;
  /** Profile instructions block (cached separately from base system prompt). */
  profileInstructions?: string;
  /** Extended thinking config (Anthropic only). */
  extendedThinking?: { enabled: boolean; budgetTokens?: number };
  /**
   * Remote MCP connectors (TDR-035 §1), projected to the Anthropic Messages
   * API `mcp_servers` shape by `mcpServersToAnthropicConnectors`. ONLY
   * URL-based remote connectors — the in-process `relay` server and local
   * stdio plugin servers are excluded upstream (they're served as local
   * function tools instead), so this is always JSON-serializable.
   */
  mcpServers?: AnthropicMcpConnector[];
}

/**
 * Build system content blocks with optional prompt caching.
 *
 * When caching is enabled, stable content (base prompt, profile instructions)
 * gets `cache_control: { type: "ephemeral" }` so repeated calls reuse cached
 * token processing at 90% lower cost.
 */
function buildSystemBlocks(
  basePrompt: string,
  profileInstructions: string | undefined,
  enableCaching: boolean,
): unknown {
  if (!enableCaching) return basePrompt;

  const blocks: unknown[] = [];

  if (profileInstructions) {
    // Cache the base prompt separately from profile instructions
    blocks.push({
      type: "text",
      text: basePrompt,
      cache_control: { type: "ephemeral" },
    });
    blocks.push({
      type: "text",
      text: profileInstructions,
      cache_control: { type: "ephemeral" },
    });
  } else {
    // Single cached block
    blocks.push({
      type: "text",
      text: basePrompt,
      cache_control: { type: "ephemeral" },
    });
  }

  return blocks;
}

async function callAnthropicModel(
  client: InstanceType<AnthropicSDK["default"]>,
  systemPrompt: string,
  messages: LoopMessage[],
  tools: AnthropicToolDef[],
  signal: AbortSignal,
  emitEvent: (event: AgentStreamEvent) => void,
  options: AnthropicCallOptions = {},
): Promise<ModelTurnResult> {
  const modelId = options.modelId ?? getRuntimeCatalogEntry("anthropic-direct").models.default;
  const maxTokens = options.maxTokens ?? 8192;

  // Build system content with optional caching
  const systemContent = buildSystemBlocks(
    systemPrompt,
    options.profileInstructions,
    options.enableCaching ?? false,
  );

  // Build request params
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const params: any = {
    model: modelId,
    system: systemContent,
    messages: messages as any,
    tools: tools as any,
    max_tokens: maxTokens,
  };

  // Add extended thinking if enabled
  if (options.extendedThinking?.enabled) {
    params.thinking = {
      type: "enabled",
      budget_tokens: options.extendedThinking.budgetTokens ?? 10000,
    };
  }

  // Inject remote MCP connectors (TDR-035 §1). Already projected to the
  // serializable URL-connector shape by mcpServersToAnthropicConnectors —
  // the in-process `relay` server and local stdio plugins are excluded
  // upstream, so this can no longer make the request body circular.
  // mcp_servers is a beta Anthropic Messages API field; params is typed as
  // any above so no extra assertion is needed here.
  if (options.mcpServers && options.mcpServers.length > 0) {
    params.mcp_servers = options.mcpServers;
  }

  const stream = client.messages.stream(params, { signal });

  let text = "";
  let thinkingText = "";
  const toolCalls: ModelTurnResult["toolCalls"] = [];
  let stopReason = "";
  const usage: TurnUsage = { modelId };

  emitEvent({ type: "status", phase: "running" });

  const response = await stream.finalMessage();

  // Extract usage (including cache metrics)
  if (response.usage) {
    usage.inputTokens = response.usage.input_tokens;
    usage.outputTokens = response.usage.output_tokens;
    usage.totalTokens = response.usage.input_tokens + response.usage.output_tokens;
    // Cache metrics are available as cache_creation_input_tokens / cache_read_input_tokens
    const usageAny = response.usage as unknown as Record<string, unknown>;
    if (usageAny.cache_creation_input_tokens || usageAny.cache_read_input_tokens) {
      (usage as Record<string, unknown>).cacheCreationTokens = usageAny.cache_creation_input_tokens ?? 0;
      (usage as Record<string, unknown>).cacheReadTokens = usageAny.cache_read_input_tokens ?? 0;
    }
  }

  stopReason = response.stop_reason ?? "";

  // Process content blocks
  for (const block of response.content) {
    if (block.type === "text") {
      text += block.text;
      emitEvent({ type: "delta", content: block.text });
    } else if (block.type === "thinking") {
      thinkingText += (block as { thinking: string }).thinking ?? "";
      emitEvent({ type: "status", phase: "thinking" });
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input as Record<string, unknown>,
      });
      emitEvent({ type: "status", phase: "tool_use", message: block.name });
    }
  }

  return {
    text: text || thinkingText, // Fall back to thinking if no text
    toolCalls,
    isComplete: stopReason === "end_turn",
    needsContinuation: stopReason === "max_tokens",
    usage,
  };
}

// ── Session persistence ──────────────────────────────────────────────

async function saveSessionSnapshot(
  taskId: string,
  profileId: string,
  messages: LoopMessage[],
) {
  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId,
    agentType: profileId,
    event: "session_snapshot",
    payload: JSON.stringify({ messages }),
    timestamp: new Date(),
  });
}

async function loadSessionSnapshot(taskId: string): Promise<LoopMessage[] | null> {
  const [log] = await db
    .select()
    .from(agentLogs)
    .where(eq(agentLogs.taskId, taskId))
    .orderBy(agentLogs.timestamp)
    .limit(1);

  if (!log?.payload) return null;

  try {
    const data = JSON.parse(log.payload);
    if (Array.isArray(data.messages)) return data.messages;
  } catch {
    // Corrupted snapshot
  }
  return null;
}

// ── Core task execution ──────────────────────────────────────────────

async function executeAnthropicDirectTask(taskId: string, isResume = false): Promise<void> {
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
    // Mark as running
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

    const apiKey = await getAnthropicApiKey();
    const sdk = await getAnthropicSDK();
    const client = new sdk.default({ apiKey });

    // Get tools in Anthropic format
    const toolServer = createToolServer(task.projectId);
    const { tools, executeHandler } = toolServer.forProvider("anthropic");

    // Merge all five MCP server sources (TDR-035 §1).
    // Browser/external MCP are not yet wired in this adapter; pass {} for those
    // sources. pluginServers is loaded dynamically to avoid module-load cycles.
    const pluginServers = await (async () => {
      const { loadPluginMcpServers } = await import("@/lib/plugins/mcp-loader");
      return loadPluginMcpServers({ runtime: "anthropic-direct" });
    })();
    const mergedMcpServers = await withAnthropicDirectMcpServers(
      {},
      {},
      {},
      pluginServers,
      task.projectId,
    );
    // Project to the serializable remote-connector shape BEFORE it reaches the
    // request body — the raw merge holds the in-process `relay` server (a
    // circular SDK object) that would crash JSON.stringify (see the helper).
    const mcpConnectors = mcpServersToAnthropicConnectors(mergedMcpServers);

    // Build initial messages or restore from snapshot
    let initialMessages: LoopMessage[];
    if (isResume) {
      const snapshot = await loadSessionSnapshot(taskId);
      initialMessages = snapshot ?? [{ role: "user", content: ctx.userPrompt }];
    } else {
      initialMessages = [{ role: "user", content: ctx.userPrompt }];
    }

    // Resolve model: explicit runtime setting > onboarding model preference
    // tier > catalog default ("Balanced" means Sonnet on every runtime, not
    // just chat — fix-workflow-model-preference-propagation).
    const { getSetting } = await import("@/lib/settings/helpers");
    const { resolvePreferredModel } = await import("./model-preference");
    const modelId =
      (await getSetting("anthropic_direct_model")) ??
      (await resolvePreferredModel("anthropic-direct")).modelId;

    const maxTurns = ctx.maxTurns ?? DEFAULT_MAX_TURNS;

    // Log start
    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId,
      agentType: agentProfileId,
      event: isResume ? "resumed" : "started",
      payload: JSON.stringify({
        runtime: "anthropic-direct",
        model: modelId,
        maxTurns,
      }),
      timestamp: new Date(),
    });

    // Run the agentic loop
    const result = await runAgenticLoop(initialMessages, {
      async callModel(messages, signal) {
        // Resolve capability overrides from profile
        const profile = getProfile(agentProfileId);
        const capOverrides = profile?.capabilityOverrides?.["anthropic-direct"];

        const turnResult = await callAnthropicModel(
          client,
          ctx.systemInstructions,
          messages,
          tools as AnthropicToolDef[],
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
            enableCaching: true,
            profileInstructions: profile?.skillMd,
            extendedThinking: capOverrides?.extendedThinking,
            mcpServers: mcpConnectors,
          },
        );

        // Save session snapshot after each model turn
        await saveSessionSnapshot(taskId, agentProfileId, [
          ...messages,
          { role: "assistant", content: turnResult.text },
        ]);

        return turnResult;
      },

      formatToolResult(toolCallId, _toolName, result) {
        return {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolCallId,
              content: result.content.map((c) => ({
                type: "text",
                text: c.text,
              })),
              is_error: result.isError ?? false,
            },
          ],
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

      emitEvent(event) {
        // Events are logged in callModel; no-op here
      },

      maxTurns,
      maxBudgetUsd: task.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD,
      signal: abortController.signal,
    });

    // Finalize task based on result
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

    // Record usage
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
      runtimeId: "anthropic-direct",
      providerId: "anthropic",
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

async function runAnthropicTaskAssist(input: TaskAssistInput): Promise<TaskAssistResponse> {
  const apiKey = await getAnthropicApiKey();
  const sdk = await getAnthropicSDK();
  const client = new sdk.default({ apiKey });

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

  const response = await client.messages.create({
    model: getRuntimeCatalogEntry("anthropic-direct").models.tiers?.balanced
      ?? getRuntimeCatalogEntry("anthropic-direct").models.default,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent || "Analyze this task" }],
    max_tokens: 2048,
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
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

// ── Profile Assist ───────────────────────────────────────────────────

async function runAnthropicProfileAssist(input: ProfileAssistRequest): Promise<ProfileAssistResponse> {
  const apiKey = await getAnthropicApiKey();
  const sdk = await getAnthropicSDK();
  const client = new sdk.default({ apiKey });

  const response = await client.messages.create({
    model: getRuntimeCatalogEntry("anthropic-direct").models.tiers?.balanced
      ?? getRuntimeCatalogEntry("anthropic-direct").models.default,
    system: `You are an AI assistant that helps configure agent profiles. Return ONLY a JSON object with the requested fields.`,
    messages: [{ role: "user", content: JSON.stringify(input) }],
    max_tokens: 2048,
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  try {
    return JSON.parse(text);
  } catch {
    return {
      name: "unknown",
      description: text,
      domain: "work" as const,
      tags: [],
      skillMd: "",
      allowedTools: [],
      canUseToolPolicy: { autoApprove: [], autoDeny: [] },
      maxTurns: 10,
      outputFormat: "",
      supportedRuntimes: ["anthropic-direct"],
      tests: [],
      reasoning: "Failed to parse structured response",
    };
  }
}

// ── Connection Test ──────────────────────────────────────────────────

async function testAnthropicConnection(): Promise<RuntimeConnectionResult> {
  try {
    const apiKey = await getAnthropicApiKey();
    const sdk = await getAnthropicSDK();
    const client = new sdk.default({ apiKey });

    // Simple validation: create a minimal request
    await client.messages.create({
      model: getRuntimeCatalogEntry("anthropic-direct").models.tiers?.fast
        ?? getRuntimeCatalogEntry("anthropic-direct").models.default,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
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

export const anthropicDirectRuntimeAdapter: AgentRuntimeAdapter = {
  metadata: getRuntimeCatalogEntry("anthropic-direct" as never), // Registered in catalog.ts

  async executeTask(taskId: string) {
    return executeAnthropicDirectTask(taskId, false);
  },

  async resumeTask(taskId: string) {
    return executeAnthropicDirectTask(taskId, true);
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
    return runAnthropicTaskAssist(input);
  },

  async runProfileAssist(input: ProfileAssistRequest) {
    return runAnthropicProfileAssist(input);
  },

  async runProfileTests(profileId: string): Promise<ProfileTestReport> {
    const profile = getProfile(profileId);
    return {
      profileId,
      profileName: profile?.name ?? profileId,
      runtimeId: "anthropic-direct",
      results: [],
      totalPassed: 0,
      totalFailed: 0,
      unsupported: true,
      unsupportedReason: "Profile smoke tests not yet implemented for Anthropic Direct runtime",
    };
  },

  async testConnection() {
    return testAnthropicConnection();
  },
};
