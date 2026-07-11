import { query } from "@anthropic-ai/claude-agent-sdk";
import { db } from "@/lib/db";
import { tasks, projects, agentLogs, notifications } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { setExecution, removeExecution } from "./execution-manager";
import { MAX_RESUME_COUNT, DEFAULT_MAX_TURNS, DEFAULT_MAX_BUDGET_USD } from "@/lib/constants/task-status";
import { getAuthEnv, updateAuthStatus } from "@/lib/settings/auth";
import { buildDocumentContext } from "@/lib/documents/context-builder";
import { buildTableContext } from "@/lib/tables/context-builder";
import {
  buildTaskOutputInstructions,
  prepareTaskOutputDirectory,
  scanTaskOutputDocuments,
} from "@/lib/documents/output-scanner";
import { getProfile } from "./profiles/registry";
import { resolvePreferredModel } from "./runtime/model-preference";
import { resolveProfileRuntimePayload, type ResolvedProfileRuntimePayload } from "./profiles/compatibility";
import type { CanUseToolPolicy } from "./profiles/types";
import {
  buildClaudeSdkEnv,
  CLAUDE_SDK_ALLOWED_TOOLS,
  CLAUDE_SDK_SETTING_SOURCES,
} from "./runtime/claude-sdk";
import { getFeaturesForModel } from "@/lib/chat/types";
import { getActiveLearnedContext } from "./learned-context";
import { getLaunchCwd, getWorkspaceContext } from "@/lib/environment/workspace-context";
import { analyzeForLearnedPatterns } from "./pattern-extractor";
import { processSweepResult } from "./sweep";
import { getBrowserMcpServers, getExternalMcpServers } from "./browser-mcp";
import { persistScreenshot, SCREENSHOT_TOOL_NAMES } from "@/lib/screenshots/persist";
import {
  extractUsageSnapshot,
  mergeUsageSnapshot,
  recordUsageLedgerEntry,
  resolveUsageActivityType,
  type UsageActivityType,
  type UsageSnapshot,
} from "@/lib/usage/ledger";
import {
  handleToolPermission,
  clearPermissionCache,
} from "./tool-permissions";
import {
  classifyTaskFailureReason,
  toRetryableRuntimeLaunchError,
  type RuntimeLaunchProgress,
} from "@/lib/agents/runtime/launch-failure";

// ─── ainative MCP injection helpers ──────────────────────────────────────
//
// Shared by executeClaudeTask and resumeClaudeTask so the two runtime entry
// points cannot drift apart. The drift between chat engine injection and
// claude-code runtime injection is what produced the P0 bug this feature
// fixes — do not duplicate these patterns inline.

/**
 * Merge the in-process relay MCP server into a five-source MCP server map.
 * Spread order: profile → browser → external → plugin → relay (TDR-035 §1).
 * relay is spread LAST so no upstream source can shadow the `relay` key
 * with its own server. A plugin declaring `mcpServers: { relay: ... }` in
 * its `.mcp.json` will be silently overwritten by the real in-process server.
 *
 * `@/lib/chat/ainative-tools` is loaded via dynamic `import()` to avoid a
 * circular-dependency crash: that module transitively pulls in the chat
 * tools registry, which imports the runtime registry (`runtime/catalog`,
 * `runtime/index`), which statically references `claudeRuntimeAdapter` —
 * the very module this file is defined in. A static import here would
 * crash with "Cannot access 'claudeRuntimeAdapter' before initialization"
 * at module-load time. The dynamic import defers the ainative-tools module
 * until `executeClaudeTask` / `resumeClaudeTask` actually run, by which
 * time every module in the graph has finished initializing.
 *
 * pluginServers is passed as a pure arg (caller responsibility) — the helper
 * does NOT call loadPluginMcpServers directly; callers load it once per
 * request and pass the result here so both executeClaudeTask and resumeClaudeTask
 * use a single consistent snapshot for the full task lifecycle.
 */
export async function withAinativeMcpServer(
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
    // Map key MUST match createSdkMcpServer({ name: "relay" }) — the SDK builds
    // the mcp__relay__* namespace from this key, and openai-direct.ts skips by it.
    relay: relayServer,
  };
}

/**
 * Prepend `mcp__relay__*` to a profile's explicit allowedTools so the
 * ainative tool registration survives the SDK preset filter. When the
 * profile has no explicit allowlist and `includeSdkTools` is true, fall
 * back to Phase 1a's CLAUDE_SDK_ALLOWED_TOOLS (Skill, Read/Grep/Glob,
 * Edit/Write/Bash, TodoWrite) so task execution gets the same toolset as
 * chat. Returns `undefined` only when the profile has no allowlist AND
 * the caller does not want SDK tools added — letting the SDK fall
 * through to claude_code preset defaults.
 */
function withAinativeAllowedTools(
  profileAllowedTools: string[] | undefined,
  includeSdkTools: boolean,
): string[] | undefined {
  // An empty `allowedTools: []` is treated the same as `undefined` — an
  // empty array is almost never the profile author's intent (they'd get
  // only `mcp__relay__*` and nothing else). Require at least one tool
  // name for the "profile has explicit list" branch.
  if (profileAllowedTools && profileAllowedTools.length > 0) {
    // Profile has explicit list — respect it. Only prepend ainative.
    return Array.from(new Set(["mcp__relay__*", ...profileAllowedTools]));
  }
  if (includeSdkTools) {
    // No profile allowlist but runtime has native skills — pass the
    // Phase 1a tool set alongside mcp__relay__* + browser/external
    // (callers merge their own browser/external patterns into this list).
    return ["mcp__relay__*", ...CLAUDE_SDK_ALLOWED_TOOLS];
  }
  return undefined;
}

/**
 * Write an explicit failure_reason to tasks at terminal-state transitions.
 * Called from handleExecutionError and the execute/resume functions on known
 * error classes. Prefer this over reverse-engineering reasons from text via
 * detectFailureReason in scheduler.ts, which is fragile to SDK message changes.
 */
export async function writeTerminalFailureReason(
  taskId: string,
  error: unknown,
): Promise<void> {
  const reason = classifyTaskFailureReason(error);
  await db
    .update(tasks)
    .set({ failureReason: reason, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
}

/** Typed representation of messages from the Agent SDK stream */
interface AgentStreamMessage {
  type?: string;
  subtype?: string;
  session_id?: string;
  api_key_source?: string;
  event?: Record<string, unknown>;
  message?: {
    content?: Array<{ type: string; name?: string; input?: unknown }>;
  };
  result?: unknown;
}

export interface TaskUsageState extends UsageSnapshot {
  activityType: UsageActivityType;
  startedAt: Date;
  taskId: string;
  projectId?: string | null;
  workflowId?: string | null;
  scheduleId?: string | null;
}

export function createTaskUsageState(
  task: {
    id: string;
    projectId?: string | null;
    workflowId?: string | null;
    scheduleId?: string | null;
  },
  isResume = false
): TaskUsageState {
  return {
    taskId: task.id,
    projectId: task.projectId ?? null,
    workflowId: task.workflowId ?? null,
    scheduleId: task.scheduleId ?? null,
    activityType: resolveUsageActivityType({
      workflowId: task.workflowId,
      scheduleId: task.scheduleId,
      isResume,
    }),
    startedAt: new Date(),
  };
}

function applyUsageSnapshot(state: TaskUsageState, source: unknown) {
  Object.assign(state, mergeUsageSnapshot(state, extractUsageSnapshot(source)));
}

export async function finalizeTaskUsage(
  state: TaskUsageState,
  status: "completed" | "failed" | "cancelled"
) {
  await recordUsageLedgerEntry({
    taskId: state.taskId,
    workflowId: state.workflowId ?? null,
    scheduleId: state.scheduleId ?? null,
    projectId: state.projectId ?? null,
    activityType: state.activityType,
    runtimeId: "claude-code",
    providerId: "anthropic",
    modelId: state.modelId ?? null,
    inputTokens: state.inputTokens ?? null,
    outputTokens: state.outputTokens ?? null,
    totalTokens: state.totalTokens ?? null,
    status,
    startedAt: state.startedAt,
    finishedAt: new Date(),
  });

  await db
    .update(tasks)
    .set({
      effectiveModelId: state.modelId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, state.taskId));
}

/**
 * Process the async message stream from the Agent SDK.
 * Shared between executeClaudeTask and resumeClaudeTask to avoid duplication.
 */
async function processAgentStream(
  taskId: string,
  taskTitle: string,
  response: AsyncIterable<Record<string, unknown>>,
  abortController: AbortController,
  agentProfileId = "general",
  usageState: TaskUsageState,
  launchProgress?: RuntimeLaunchProgress
): Promise<void> {
  let sessionId: string | null = null;
  let sessionAuthSource: "db" | "env" | "oauth" | "unknown" | null = null;
  let receivedResult = false;
  let turnCount = 0;

  // Screenshot interception state
  const pendingScreenshotTools = new Set<string>();

  for await (const raw of response) {
    const message = raw as AgentStreamMessage;
    applyUsageSnapshot(usageState, raw);

    // Capture session ID from init message
    if (
      message.type === "system" &&
      message.subtype === "init" &&
      message.session_id
    ) {
      sessionId = message.session_id;
      await db
        .update(tasks)
        .set({ sessionId, updatedAt: new Date() })
        .where(eq(tasks.id, taskId));

      // SDK init only proves the process started. Remember the claimed source,
      // then persist it only after a successful terminal result.
      if (message.api_key_source) {
        sessionAuthSource = message.api_key_source as "db" | "env" | "oauth" | "unknown";
      }

      // Update execution manager with sessionId
      setExecution(taskId, {
        abortController,
        sessionId,
        taskId,
        startedAt: new Date(),
      });
    }

    // Log meaningful stream events
    if (message.type === "stream_event" && message.event) {
      const event = message.event;
      const eventType = event.type as string;

      if (
        eventType === "content_block_start" ||
        eventType === "content_block_delta" ||
        eventType === "message_start"
      ) {
        await db.insert(agentLogs).values({
          id: crypto.randomUUID(),
          taskId,
          agentType: agentProfileId,
          event: eventType,
          payload: JSON.stringify(event),
          timestamp: new Date(),
        });
      }
    }

    // Handle assistant messages (tool use starts)
    if (message.type === "assistant" && message.message?.content) {
      turnCount++;
      if (launchProgress) {
        launchProgress.hasTurnStarted = true;
      }
      for (const block of message.message.content) {
        if (block.type === "tool_use") {
          if (launchProgress) {
            launchProgress.hasToolUse = true;
          }
          // Track screenshot tool_use IDs for result interception
          const toolBlock = block as { type: string; id?: string; name?: string; input?: unknown };
          if (typeof toolBlock.name === "string" && SCREENSHOT_TOOL_NAMES.has(toolBlock.name) && typeof toolBlock.id === "string") {
            pendingScreenshotTools.add(toolBlock.id);
          }
          await db.insert(agentLogs).values({
            id: crypto.randomUUID(),
            taskId,
            agentType: agentProfileId,
            event: "tool_start",
            payload: JSON.stringify({
              tool: block.name,
              input: block.input,
            }),
            timestamp: new Date(),
          });
        }
      }
    }

    // Intercept tool results containing screenshot image data
    if (message.type === "user" && pendingScreenshotTools.size > 0) {
      const userMsg = (raw as Record<string, unknown>).message as Record<string, unknown> | undefined;
      const userContent = userMsg?.content as Array<Record<string, unknown>> | undefined;
      if (userContent) {
        for (const block of userContent) {
          if (block.type === "tool_result" && typeof block.tool_use_id === "string" && pendingScreenshotTools.has(block.tool_use_id)) {
            pendingScreenshotTools.delete(block.tool_use_id);
            const resultContent = block.content as Array<Record<string, unknown>> | undefined;
            if (resultContent) {
              for (const item of resultContent) {
                if (item.type === "image" && typeof item.source === "object" && item.source !== null) {
                  const source = item.source as Record<string, unknown>;
                  if (source.type === "base64" && typeof source.data === "string") {
                    const attachment = await persistScreenshot(source.data, {
                      taskId,
                      toolName: `screenshot_${block.tool_use_id}`,
                    });
                    if (attachment) {
                      await db.insert(agentLogs).values({
                        id: crypto.randomUUID(),
                        taskId,
                        agentType: agentProfileId,
                        event: "screenshot",
                        payload: JSON.stringify({
                          documentId: attachment.documentId,
                          thumbnailUrl: attachment.thumbnailUrl,
                          toolName: `screenshot_${block.tool_use_id}`,
                        }),
                        timestamp: new Date(),
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Handle result — skip if task was cancelled mid-stream
    if (message.type === "result" && "result" in raw) {
      if (abortController.signal.aborted) {
        await finalizeTaskUsage(usageState, "cancelled");
        return;
      }
      receivedResult = true;
      if (!raw.is_error && sessionAuthSource) {
        await updateAuthStatus(sessionAuthSource);
      }
      if (launchProgress) {
        launchProgress.hasResult = true;
      }
      const resultText =
        typeof message.result === "string"
          ? message.result
          : JSON.stringify(message.result);

      await db
        .update(tasks)
        .set({
          status: "completed",
          result: resultText,
          turnCount,
          tokenCount: usageState.totalTokens ?? null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        taskId,
        type: "task_completed",
        title: `Task completed: ${taskTitle}`,
        body: resultText.slice(0, 500),
        createdAt: new Date(),
      });

      await db.insert(agentLogs).values({
        id: crypto.randomUUID(),
        taskId,
        agentType: agentProfileId,
        event: "completed",
        payload: JSON.stringify({ result: resultText.slice(0, 1000) }),
        timestamp: new Date(),
      });

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

      // Fire-and-forget sweep result processing
      if (agentProfileId === "sweep") {
        processSweepResult(taskId).catch((err) => {
          console.error("[sweep] result processing failed:", err);
        });
      }

      await finalizeTaskUsage(usageState, "completed");
    }
  }

  // Safety net: if stream ended without a result frame, fail the task
  // instead of leaving it stuck in "running" forever
  if (!receivedResult) {
    const errorDetail = turnCount > 0
      ? `Agent exhausted its turn limit (${turnCount} turns used) without producing a final result. The task may need fewer sub-queries or a higher maxTurns setting.`
      : "Agent stream ended without producing a result";

    const streamFailureReason = turnCount > 0 ? "turn_limit_exceeded" : "sdk_error";

    await db
      .update(tasks)
      .set({
        status: "failed",
        result: errorDetail,
        failureReason: streamFailureReason,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId));

    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      taskId,
      type: "task_failed",
      title: `Task failed: ${taskTitle}`,
      body: errorDetail,
      createdAt: new Date(),
    });

    await finalizeTaskUsage(usageState, "failed");
  }
}

// ---------------------------------------------------------------------------
// Shared prompt & query context builder (F12: eliminate duplication)
// ---------------------------------------------------------------------------

export interface TaskQueryContext {
  /** User task content — goes into `prompt` */
  userPrompt: string;
  /** System instructions — goes into `options.systemPrompt` */
  systemInstructions: string;
  /** Resolved working directory */
  cwd: string;
  /** Profile payload (tools, MCP, policy) */
  payload: ResolvedProfileRuntimePayload | null;
  /** Profile's maxTurns or default */
  maxTurns: number;
  /** Profile's canUseToolPolicy */
  canUseToolPolicy?: CanUseToolPolicy;
  /**
   * Concrete model to pass to `query()`: profile pin > onboarding model
   * preference tier > quality default. Without an explicit model the SDK
   * silently falls back to ITS default — which billed Opus to users who chose
   * "Balanced" (fix-workflow-model-preference-propagation).
   */
  modelId: string;
}

export async function buildTaskQueryContext(
  task: { id: string; title: string; description?: string | null; projectId?: string | null },
  profileId: string
): Promise<TaskQueryContext> {
  const profile = getProfile(profileId);
  const payload = profile
    ? resolveProfileRuntimePayload(profile, "claude-code")
    : null;
  if (payload && !payload.supported) {
    throw new Error(payload.reason ?? `Profile "${profile?.name}" is not supported on Claude Code`);
  }

  const profileInstructions = payload?.instructions ?? "";
  const basePrompt = task.description || task.title;
  const docContext = await buildDocumentContext(task.id);
  const tableContext = await buildTableContext(task.id);
  const outputInstructions = buildTaskOutputInstructions(task.id);
  const learnedCtx = getActiveLearnedContext(profileId);
  const learnedCtxBlock = learnedCtx
    ? `## Learned Context\n<learned-context>\n${learnedCtx}\n</learned-context>`
    : "";

  // Resolve working directory: project's workingDirectory > launch cwd
  let cwd = getLaunchCwd();
  if (task.projectId) {
    const [project] = await db
      .select({ workingDirectory: projects.workingDirectory })
      .from(projects)
      .where(eq(projects.id, task.projectId));
    if (project?.workingDirectory) {
      cwd = project.workingDirectory;
    }
  }

  // Add worktree guidance when running inside a git worktree
  const ws = getWorkspaceContext();
  const worktreeNote = ws.isWorktree
    ? `## Workspace Note\nYou are operating inside a git worktree (branch: ${ws.gitBranch ?? "unknown"}). All file operations MUST use paths relative to the working directory: ${cwd}. Do NOT navigate to or create files in the main repository directory.`
    : "";

  // F1: Separate system instructions from user content
  const systemInstructions = [worktreeNote, profileInstructions, learnedCtxBlock, docContext, tableContext, outputInstructions]
    .filter(Boolean)
    .join("\n\n");

  // F9: Use profile maxTurns or fall back to default
  const maxTurns = profile?.maxTurns ?? DEFAULT_MAX_TURNS;

  const { modelId } = await resolvePreferredModel("claude-code", {
    pinnedModelId: profile?.capabilityOverrides?.["claude-code"]?.modelId,
  });

  return {
    userPrompt: basePrompt,
    systemInstructions,
    cwd,
    payload,
    maxTurns,
    canUseToolPolicy: payload?.canUseToolPolicy,
    modelId,
  };
}

export async function executeClaudeTask(taskId: string): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);
  const usageState = createTaskUsageState(task);
  const launchProgress: RuntimeLaunchProgress = {};

  const abortController = new AbortController();
  const agentProfileId = task.agentProfile ?? "general";

  setExecution(taskId, {
    abortController,
    sessionId: null,
    taskId,
    startedAt: new Date(),
  });

  try {
    await prepareTaskOutputDirectory(taskId, { clearExisting: true });
    const ctx = await buildTaskQueryContext(task, agentProfileId);

    // Per-schedule override: if the task carries its own maxTurns (set by
    // fireSchedule from schedules.maxTurns), it takes precedence over the
    // profile default. This is the runtime-enforced budget cap.
    const effectiveMaxTurns = task.maxTurns ?? ctx.maxTurns;

    // Merge all five MCP server sources (TDR-035 §1) in parallel, then inject
    // into the in-process ainative server via the shared helper.
    // loadPluginMcpServers is imported dynamically to avoid a module-load cycle
    // (same reason as withAinativeMcpServer's dynamic import of ainative-tools).
    const [browserServers, externalServers, pluginServers] = await Promise.all([
      getBrowserMcpServers(),
      getExternalMcpServers(),
      (async () => {
        const { loadPluginMcpServers } = await import("@/lib/plugins/mcp-loader");
        return loadPluginMcpServers({ runtime: "claude-code" });
      })(),
    ]);
    const mergedMcpServers = await withAinativeMcpServer(
      ctx.payload?.mcpServers ?? {},
      browserServers,
      externalServers,
      pluginServers,
      task.projectId,
    );
    // Capability gate: only pass settingSources + CLAUDE_SDK tools when the
    // runtime is claude-code (or a future runtime with hasNativeSkills).
    // Anthropic-direct and OpenAI-direct task runtimes don't understand
    // these SDK-specific options. Tasks do not carry a model field yet —
    // an empty string falls through to the claude-code default in
    // getFeaturesForModel, so the gate opens by default for the primary
    // claude-code use case. Task 4's resume path follows the same pattern.
    const runtimeFeatures = getFeaturesForModel("");
    const includeSdkNativeTools = runtimeFeatures.hasNativeSkills;

    // allowedTools merged via shared helper. When the profile has no explicit
    // allowlist AND the runtime has native skills, we fall back to Phase 1a's
    // CLAUDE_SDK_ALLOWED_TOOLS (Skill, Read/Grep/Glob, Edit/Write/Bash,
    // TodoWrite) so task execution matches chat. Computed once so the
    // conditional spread below does not invoke the helper twice.
    const mergedAllowedTools = withAinativeAllowedTools(
      ctx.payload?.allowedTools,
      includeSdkNativeTools,
    );

    const authEnv = await getAuthEnv();
    const response = query({
      prompt: ctx.userPrompt,
      options: {
        abortController,
        // Explicit model: profile pin > onboarding preference > quality
        // default. Omitting this let the SDK pick ITS default (Opus) and
        // silently bill the wrong tier.
        model: ctx.modelId,
        includePartialMessages: true,
        cwd: ctx.cwd,
        env: buildClaudeSdkEnv(authEnv),
        // F1: Use dedicated systemPrompt option with claude_code preset
        systemPrompt: ctx.systemInstructions
          ? { type: "preset" as const, preset: "claude_code" as const, append: ctx.systemInstructions }
          : { type: "preset" as const, preset: "claude_code" as const },
        // F9: Bounded turn limit from profile or default; per-schedule override wins
        maxTurns: effectiveMaxTurns,
        // F4: Per-execution budget cap — use task-specific override if set
        maxBudgetUsd: task.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD,
        ...(mergedAllowedTools && { allowedTools: mergedAllowedTools }),
        // Phase 1a parity: load user + project settings (.claude/skills,
        // CLAUDE.md, .claude/rules/*.md) when the runtime supports it.
        ...(includeSdkNativeTools && {
          settingSources: [...CLAUDE_SDK_SETTING_SOURCES],
        }),
        ...(Object.keys(mergedMcpServers).length > 0 && {
          mcpServers: mergedMcpServers,
        }),
        // @ts-expect-error Agent SDK canUseTool types are incomplete — our async handler is compatible at runtime
        canUseTool: async (
          toolName: string,
          input: Record<string, unknown>
        ) => {
          return handleToolPermission(taskId, toolName, input, ctx.canUseToolPolicy);
        },
      },
    });

    await processAgentStream(
      taskId,
      task.title,
      response as AsyncIterable<Record<string, unknown>>,
      abortController,
      agentProfileId,
      usageState,
      launchProgress
    );

    try {
      await analyzeForLearnedPatterns(taskId, agentProfileId);
    } catch (err) {
      console.error("[self-improvement] pattern extraction failed:", err);
    }
  } catch (error: unknown) {
    const retryableLaunchError = toRetryableRuntimeLaunchError({
      runtimeId: "claude-code",
      error,
      progress: launchProgress,
    });
    if (retryableLaunchError) {
      throw retryableLaunchError;
    }
    await handleExecutionError(
      taskId,
      task.title,
      error,
      abortController,
      agentProfileId,
      usageState
    );
  } finally {
    clearPermissionCache(taskId);
    removeExecution(taskId);
  }
}

export async function resumeClaudeTask(taskId: string): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);
  const usageState = createTaskUsageState(task, true);

  if (!task.sessionId) {
    throw new Error("No session to resume — use Retry instead");
  }

  if (task.resumeCount >= MAX_RESUME_COUNT) {
    throw new Error("Resume limit reached. Re-queue for fresh start.");
  }

  // Increment resume count
  await db
    .update(tasks)
    .set({ resumeCount: task.resumeCount + 1, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));

  const abortController = new AbortController();

  setExecution(taskId, {
    abortController,
    sessionId: task.sessionId,
    taskId,
    startedAt: new Date(),
  });

  const profileId = task.agentProfile ?? "general";

  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId,
    agentType: profileId,
    event: "session_resumed",
    payload: JSON.stringify({
      sessionId: task.sessionId,
      resumeCount: task.resumeCount + 1,
      profile: profileId,
    }),
    timestamp: new Date(),
  });

  try {
    await prepareTaskOutputDirectory(taskId);
    const ctx = await buildTaskQueryContext(task, profileId);

    // Per-schedule override: if the task carries its own maxTurns (set by
    // fireSchedule from schedules.maxTurns), it takes precedence over the
    // profile default. This is the runtime-enforced budget cap.
    const effectiveMaxTurns = task.maxTurns ?? ctx.maxTurns;

    // Merge all five MCP server sources (TDR-035 §1) in parallel, then inject
    // into the in-process ainative server via the shared helper.
    // Same dynamic-import pattern as executeClaudeTask — fresh load per resume
    // request is correct; consistency within a single request is the invariant.
    const [browserServers, externalServers, pluginServers] = await Promise.all([
      getBrowserMcpServers(),
      getExternalMcpServers(),
      (async () => {
        const { loadPluginMcpServers } = await import("@/lib/plugins/mcp-loader");
        return loadPluginMcpServers({ runtime: "claude-code" });
      })(),
    ]);
    const mergedMcpServers = await withAinativeMcpServer(
      ctx.payload?.mcpServers ?? {},
      browserServers,
      externalServers,
      pluginServers,
      task.projectId,
    );
    // Capability gate: same logic as executeClaudeTask. Resumed tasks must
    // get the same SDK options as their original run so skills that were
    // visible on first execution remain visible after a resume. `task.model`
    // does not exist on the tasks schema — pass "" which resolves to the
    // claude-code default (hasNativeSkills: true) for every current task
    // flow. See features/task-runtime-skill-parity.md Task 4.
    const runtimeFeatures = getFeaturesForModel("");
    const includeSdkNativeTools = runtimeFeatures.hasNativeSkills;

    const mergedAllowedTools = withAinativeAllowedTools(
      ctx.payload?.allowedTools,
      includeSdkNativeTools,
    );

    const authEnv = await getAuthEnv();
    const response = query({
      prompt: ctx.userPrompt,
      options: {
        resume: task.sessionId,
        abortController,
        // Same model resolution as the original run — a resume must not
        // silently hop tiers (profile pin > preference > quality default).
        model: ctx.modelId,
        includePartialMessages: true,
        cwd: ctx.cwd,
        env: buildClaudeSdkEnv(authEnv),
        // F1: Use dedicated systemPrompt option with claude_code preset
        systemPrompt: ctx.systemInstructions
          ? { type: "preset" as const, preset: "claude_code" as const, append: ctx.systemInstructions }
          : { type: "preset" as const, preset: "claude_code" as const },
        // F9: Bounded turn limit from profile or default; per-schedule override wins
        maxTurns: effectiveMaxTurns,
        // F4: Per-execution budget cap — use task-specific override if set
        maxBudgetUsd: task.maxBudgetUsd ?? DEFAULT_MAX_BUDGET_USD,
        ...(mergedAllowedTools && { allowedTools: mergedAllowedTools }),
        // Phase 1a parity: match executeClaudeTask — see Task 3 rationale.
        ...(includeSdkNativeTools && {
          settingSources: [...CLAUDE_SDK_SETTING_SOURCES],
        }),
        ...(Object.keys(mergedMcpServers).length > 0 && {
          mcpServers: mergedMcpServers,
        }),
        // @ts-expect-error Agent SDK canUseTool types are incomplete — our async handler is compatible at runtime
        canUseTool: async (
          toolName: string,
          input: Record<string, unknown>
        ) => {
          return handleToolPermission(taskId, toolName, input, ctx.canUseToolPolicy);
        },
      },
    });

    await processAgentStream(
      taskId,
      task.title,
      response as AsyncIterable<Record<string, unknown>>,
      abortController,
      profileId,
      usageState
    );

    try {
      await analyzeForLearnedPatterns(taskId, profileId);
    } catch (err) {
      console.error("[self-improvement] pattern extraction failed:", err);
    }
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Detect session expiry from the SDK
    if (
      errorMessage.includes("session") &&
      (errorMessage.includes("expired") || errorMessage.includes("not found"))
    ) {
      await db
        .update(tasks)
        .set({
          status: "failed",
          result: "Session expired — re-queue for fresh start",
          sessionId: null,
          failureReason: "auth_failed",
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId));

      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        taskId,
        type: "task_failed",
        title: `Session expired: ${task.title}`,
        body: "The agent session has expired. Re-queue this task for a fresh start.",
        createdAt: new Date(),
      });
      await finalizeTaskUsage(usageState, "failed");
      return;
    }

    await handleExecutionError(
      taskId,
      task.title,
      error,
      abortController,
      profileId,
      usageState
    );
  } finally {
    clearPermissionCache(taskId);
    removeExecution(taskId);
  }
}

/**
 * Shared error handler for both execute and resume paths.
 */
async function handleExecutionError(
  taskId: string,
  taskTitle: string,
  error: unknown,
  abortController: AbortController,
  agentProfileId = "general",
  usageState?: TaskUsageState
): Promise<void> {
  const errorMessage =
    error instanceof Error ? error.message : String(error);

  if (abortController.signal.aborted) {
    await db
      .update(tasks)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
    if (usageState) {
      await finalizeTaskUsage(usageState, "cancelled");
    }
    return;
  }

  const failureReason = classifyTaskFailureReason(error);
  await db
    .update(tasks)
    .set({
      status: "failed",
      result: errorMessage,
      failureReason,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    taskId,
    type: "task_failed",
    title: `Task failed: ${taskTitle}`,
    body: errorMessage.slice(0, 500),
    createdAt: new Date(),
  });

  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId,
    agentType: agentProfileId,
    event: "error",
    payload: JSON.stringify({ error: errorMessage }),
    timestamp: new Date(),
  });

  if (usageState) {
    await finalizeTaskUsage(usageState, "failed");
  }
}

// handleToolPermission and clearPermissionCache imported from ./tool-permissions
