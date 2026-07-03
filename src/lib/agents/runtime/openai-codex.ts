import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentLogs, notifications, projects, tasks } from "@/lib/db/schema";
import {
  getExecution,
  removeExecution,
  setExecution,
} from "@/lib/agents/execution-manager";
import { getProfile } from "@/lib/agents/profiles/registry";
import { resolveProfileRuntimePayload } from "@/lib/agents/profiles/compatibility";
import { buildDocumentContext } from "@/lib/documents/context-builder";
import {
  buildTaskOutputInstructions,
  prepareTaskOutputDirectory,
  scanTaskOutputDocuments,
} from "@/lib/documents/output-scanner";
import { isToolAllowed } from "@/lib/settings/permissions";
import { getRuntimeCatalogEntry } from "./catalog";
import { getLaunchCwd } from "@/lib/environment/workspace-context";
import { CodexAppServerClient } from "./codex-app-server-client";
import {
  ensureOpenAICodexClientAuthenticated,
  readCodexAuthStateFromClient,
  resolveOpenAICodexAuthContext,
} from "./openai-codex-auth";
import {
  classifyTaskFailureReason,
  RetryableRuntimeLaunchError,
  toRetryableRuntimeLaunchError,
  type RuntimeLaunchProgress,
} from "./launch-failure";
import type {
  AgentRuntimeAdapter,
  RuntimeConnectionResult,
  TaskAssistInput,
} from "./types";
import type { TaskAssistResponse } from "./task-assist-types";
import {
  extractUsageSnapshot,
  mergeUsageSnapshot,
  recordUsageLedgerEntry,
  resolveUsageActivityType,
  type UsageActivityType,
  type UsageSnapshot,
} from "@/lib/usage/ledger";

interface JsonRpcLikeRequest {
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcLikeNotification {
  method: string;
  params?: unknown;
}

interface TaskExecutionContext {
  task: typeof tasks.$inferSelect;
  profileId: string;
  instructions: string;
  prompt: string;
  cwd: string;
}

interface NotificationResponse {
  behavior: "allow" | "deny";
  message?: string;
  updatedInput?: {
    answers?: Record<string, string | string[]>;
  };
  alwaysAllow?: boolean;
}

interface CodexUserQuestion {
  id: string;
  header: string;
  question: string;
  options: Array<{ label: string; description: string }>;
  multiSelect: boolean;
  isSecret?: boolean;
}

interface AssistTurnOptions {
  prompt: string;
  developerInstructions: string;
  cwd: string;
}

interface TaskUsageState extends UsageSnapshot {
  activityType: UsageActivityType;
  startedAt: Date;
  taskId: string;
  projectId?: string | null;
  workflowId?: string | null;
  scheduleId?: string | null;
}

const TASK_ASSIST_SYSTEM_PROMPT = `You are an AI task definition assistant.
Return a single JSON object matching the provided schema.
Do not wrap the JSON in markdown or code fences.
Keep the reasoning concise and operational.`;

const TASK_ASSIST_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "improvedDescription",
    "breakdown",
    "recommendedPattern",
    "complexity",
    "needsCheckpoint",
    "reasoning",
  ],
  properties: {
    improvedDescription: { type: "string" },
    breakdown: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "description"],
        properties: {
          title: { type: "string" },
          description: { type: "string" },
        },
      },
    },
    recommendedPattern: {
      type: "string",
      enum: ["single", "sequence", "planner-executor", "checkpoint"],
    },
    complexity: {
      type: "string",
      enum: ["simple", "moderate", "complex"],
    },
    needsCheckpoint: { type: "boolean" },
    reasoning: { type: "string" },
  },
} as const;

async function resolveTaskExecutionContext(
  taskId: string,
  options: { resume?: boolean } = {}
): Promise<TaskExecutionContext> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);

  const profileId = task.agentProfile ?? "general";
  const profile = getProfile(profileId);
  const payload = profile
    ? resolveProfileRuntimePayload(profile, "openai-codex-app-server")
    : null;
  if (payload && !payload.supported) {
    throw new Error(
      payload.reason ??
        `Profile "${profile?.name}" is not supported on OpenAI Codex App Server`
    );
  }
  const docContext = await buildDocumentContext(taskId);
  await prepareTaskOutputDirectory(taskId, {
    clearExisting: !options.resume,
  });
  const outputInstructions = buildTaskOutputInstructions(taskId);
  const prompt = [docContext, outputInstructions, task.description || task.title]
    .filter(Boolean)
    .join("\n\n");

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

  return {
    task,
    profileId,
    instructions: payload?.instructions ?? "",
    prompt,
    cwd,
  };
}

function createTaskUsageState(
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

function applyUsageSnapshot(state: UsageSnapshot, source: unknown) {
  Object.assign(state, mergeUsageSnapshot(state, extractUsageSnapshot(source)));
}

async function finalizeTaskUsage(
  state: TaskUsageState,
  status: "completed" | "failed" | "cancelled"
) {
  await recordUsageLedgerEntry({
    taskId: state.taskId,
    workflowId: state.workflowId ?? null,
    scheduleId: state.scheduleId ?? null,
    projectId: state.projectId ?? null,
    activityType: state.activityType,
    runtimeId: "openai-codex-app-server",
    providerId: "openai",
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

function buildTurnInput(prompt: string) {
  return [
    {
      type: "text" as const,
      text: prompt,
      text_elements: [],
    },
  ];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseQuestions(value: unknown): CodexUserQuestion[] {
  if (!Array.isArray(value)) return [];

  const questions: CodexUserQuestion[] = [];

  value.forEach((entry, index) => {
    const question = asRecord(entry);
    if (!question) return;

    const id = asString(question.id) ?? `question-${index + 1}`;
    const header = asString(question.header) ?? "Question";
    const text = asString(question.question);
    if (!text) return;

    const optionsValue = Array.isArray(question.options) ? question.options : [];
    const options = optionsValue
      .map((option) => {
        const parsed = asRecord(option);
        if (!parsed) return null;
        const label = asString(parsed.label);
        if (!label) return null;
        return {
          label,
          description: asString(parsed.description) ?? "",
        };
      })
      .filter(
        (option): option is { label: string; description: string } =>
          option !== null
      );

    questions.push({
      id,
      header,
      question: text,
      options,
      multiSelect: false,
      isSecret: Boolean(question.isSecret),
    });
  });

  return questions;
}

function extractThreadId(params: Record<string, unknown>): string | null {
  const thread = asRecord(params.thread);
  return asString(thread?.id) ?? asString(params.threadId);
}

function extractTurnId(params: Record<string, unknown>): string | null {
  const turn = asRecord(params.turn);
  return asString(turn?.id) ?? asString(params.turnId);
}

function extractTurnStatus(params: Record<string, unknown>) {
  const turn = asRecord(params.turn);
  const error = asRecord(turn?.error);

  return {
    status: asString(turn?.status),
    errorMessage: asString(error?.message),
  };
}

function extractJsonObject(text: string): TaskAssistResponse {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Codex did not return valid JSON for task assist");
  }

  return JSON.parse(jsonMatch[0]) as TaskAssistResponse;
}

async function insertLog(taskId: string, event: string, payload: unknown) {
  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId,
    agentType: "openai-codex-app-server",
    event,
    payload: JSON.stringify(payload),
    timestamp: new Date(),
  });
}

async function markTaskCompleted(
  taskId: string,
  title: string,
  resultText: string
) {
  await db
    .update(tasks)
    .set({
      status: "completed",
      result: resultText,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    taskId,
    type: "task_completed",
    title: `Task completed: ${title}`,
    body: resultText.slice(0, 500),
    createdAt: new Date(),
  });

  try {
    await scanTaskOutputDocuments(taskId);
  } catch (error) {
    await insertLog(taskId, "output_scan_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function markTaskFailed(taskId: string, title: string, message: string) {
  await db
    .update(tasks)
    .set({
      status: "failed",
      result: message,
      failureReason: classifyTaskFailureReason(new Error(message)),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    taskId,
    type: "task_failed",
    title: `Task failed: ${title}`,
    body: message.slice(0, 500),
    createdAt: new Date(),
  });
}

async function markTaskCancelled(taskId: string) {
  await db
    .update(tasks)
    .set({
      status: "cancelled",
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}

async function waitForNotificationResponse(
  notificationId: string
): Promise<NotificationResponse> {
  const deadline = Date.now() + 55_000;
  const pollInterval = 1_500;

  while (Date.now() < deadline) {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId));

    if (notification?.response) {
      try {
        return JSON.parse(notification.response) as NotificationResponse;
      } catch {
        return {
          behavior: "deny",
          message: "Invalid response format",
        };
      }
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return {
    behavior: "deny",
    message: "Request timed out",
  };
}

async function createApprovalNotification(
  taskId: string,
  title: string,
  toolName: string,
  toolInput: Record<string, unknown>
) {
  if (await isToolAllowed(toolName, toolInput)) {
    return null;
  }

  const notificationId = crypto.randomUUID();
  await db.insert(notifications).values({
    id: notificationId,
    taskId,
    type: "permission_required",
    title,
    body: JSON.stringify(toolInput).slice(0, 1000),
    toolName,
    toolInput: JSON.stringify(toolInput),
    createdAt: new Date(),
  });

  return notificationId;
}

async function createQuestionNotification(
  taskId: string,
  questions: CodexUserQuestion[]
) {
  const notificationId = crypto.randomUUID();

  await db.insert(notifications).values({
    id: notificationId,
    taskId,
    type: "agent_message",
    title: "Agent has a question",
    body: questions.map((question) => question.question).join("\n").slice(0, 1000),
    toolName: "AskUserQuestion",
    toolInput: JSON.stringify({ questions }),
    createdAt: new Date(),
  });

  return notificationId;
}

async function handleServerRequest(
  client: CodexAppServerClient,
  taskId: string,
  request: JsonRpcLikeRequest
) {
  const params = asRecord(request.params) ?? {};

  switch (request.method) {
    case "item/commandExecution/requestApproval": {
      const toolInput = {
        command: asString(params.command),
        cwd: asString(params.cwd),
        reason: asString(params.reason),
        approvalId: asString(params.approvalId),
      };

      const notificationId = await createApprovalNotification(
        taskId,
        "Permission required: Command execution",
        "Bash",
        toolInput
      );

      if (!notificationId) {
        client.respond(request.id, { decision: "acceptForSession" });
        return;
      }

      const response = await waitForNotificationResponse(notificationId);
      client.respond(request.id, {
        decision:
          response.behavior === "allow"
            ? response.alwaysAllow
              ? "acceptForSession"
              : "accept"
            : "decline",
      });
      return;
    }

    case "item/fileChange/requestApproval": {
      const toolInput = {
        reason: asString(params.reason),
        grantRoot: asString(params.grantRoot),
      };

      const notificationId = await createApprovalNotification(
        taskId,
        "Permission required: File change",
        "Write",
        toolInput
      );

      if (!notificationId) {
        client.respond(request.id, { decision: "acceptForSession" });
        return;
      }

      const response = await waitForNotificationResponse(notificationId);
      client.respond(request.id, {
        decision:
          response.behavior === "allow"
            ? response.alwaysAllow
              ? "acceptForSession"
              : "accept"
            : "decline",
      });
      return;
    }

    case "item/tool/requestUserInput": {
      const questions = parseQuestions(params.questions);
      const notificationId = await createQuestionNotification(taskId, questions);
      const response = await waitForNotificationResponse(notificationId);
      const answers = response.updatedInput?.answers ?? {};

      client.respond(request.id, {
        answers: Object.fromEntries(
          Object.entries(answers).map(([questionId, answer]) => [
            questionId,
            {
              answers: Array.isArray(answer)
                ? answer.map(String)
                : [String(answer ?? "")],
            },
          ])
        ),
      });
      return;
    }

    case "item/tool/call": {
      client.respond(request.id, {
        success: false,
        contentItems: [
          {
            type: "inputText",
            text: "Dynamic tool calls are not supported by Relay's Codex runtime yet.",
          },
        ],
      });
      return;
    }

    default:
      client.reject(
        request.id,
        `Unsupported Codex server request: ${request.method}`
      );
  }
}

async function runAssistTurn({
  prompt,
  developerInstructions,
  cwd,
}: AssistTurnOptions): Promise<{ text: string; usage: UsageSnapshot }> {
  const auth = await resolveOpenAICodexAuthContext();

  let client: CodexAppServerClient | null = null;
  let text = "";
  let usage: UsageSnapshot = {};

  try {
    client = await auth.connect(cwd);

    client.onNotification = (notification: JsonRpcLikeNotification) => {
      if (notification.method !== "item/agentMessage/delta") return;
      const delta = asString(asRecord(notification.params)?.delta);
      if (delta) {
        text += delta;
      }
    };

    await ensureOpenAICodexClientAuthenticated(client, auth);

    const threadResponse = (await client.request("thread/start", {
      cwd,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      serviceName: "relay",
      developerInstructions,
      experimentalRawEvents: false,
      ephemeral: true,
    })) as { thread: { id: string } };

    const ASSIST_TIMEOUT_MS = 60_000;

    const completion = new Promise<void>((resolve, reject) => {
      client!.onProcessError = (error: Error) => {
        reject(new Error(`Codex process died: ${error.message}`));
      };

      client!.onNotification = (notification: JsonRpcLikeNotification) => {
        const params = asRecord(notification.params) ?? {};
        applyUsageSnapshot(usage, params);

        if (notification.method === "item/agentMessage/delta") {
          const delta = asString(params.delta);
          if (delta) {
            text += delta;
          }
          return;
        }

        if (notification.method === "turn/completed") {
          const { status, errorMessage } = extractTurnStatus(params);

          if (status === "completed") {
            resolve();
            return;
          }

          reject(new Error(errorMessage || `Codex assist turn ended with status ${status}`));
        }
      };
    });

    const timeout = new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error("Codex task assist timed out after 60s")),
        ASSIST_TIMEOUT_MS
      );
    });

    await client.request("turn/start", {
      threadId: threadResponse.thread.id,
      input: buildTurnInput(prompt),
      approvalPolicy: "never",
      outputSchema: TASK_ASSIST_OUTPUT_SCHEMA,
    });

    await Promise.race([completion, timeout]);

    return { text: text.trim(), usage };
  } finally {
    if (client) {
      await client.close();
    }
  }
}

async function executeOpenAICodexTask(
  taskId: string,
  options: { resume?: boolean } = {}
): Promise<void> {
  const { task, profileId, instructions, prompt, cwd } =
    await resolveTaskExecutionContext(taskId, options);
  const auth = await resolveOpenAICodexAuthContext();

  const abortController = new AbortController();
  let client: CodexAppServerClient | null = null;
  let threadId = task.sessionId;
  let turnId: string | null = null;
  let agentOutput = "";
  let settled = false;
  const launchProgress: RuntimeLaunchProgress = {};
  let resolveCompletion: (() => void) | null = null;
  let rejectCompletion: ((error: Error) => void) | null = null;
  const usageState = createTaskUsageState(task, Boolean(task.sessionId));

  const settle = async (work: () => Promise<void>) => {
    if (settled) return;
    settled = true;
    await work();
  };

  try {
    client = await auth.connect(cwd);

    client.onProcessError = (error) => {
      const retryableLaunchError =
        !options.resume
          ? toRetryableRuntimeLaunchError({
              runtimeId: "openai-codex-app-server",
              error,
              progress: launchProgress,
            })
          : null;
      if (retryableLaunchError) {
        rejectCompletion?.(retryableLaunchError);
        return;
      }
      if (settled) return;
      void settle(async () => {
        await markTaskFailed(taskId, task.title, error.message);
        await insertLog(taskId, "failed", { error: error.message });
        await finalizeTaskUsage(usageState, "failed");
      });
      rejectCompletion?.(error);
    };

    client.onRequest = (request: JsonRpcLikeRequest) => {
      void handleServerRequest(client!, taskId, request).catch((error) => {
        client?.reject(
          request.id,
          error instanceof Error ? error.message : String(error)
        );
      });
    };

    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = (error: Error) => reject(error);
      client!.onNotification = (notification: JsonRpcLikeNotification) => {
        void (async () => {
          const params = asRecord(notification.params) ?? {};
          applyUsageSnapshot(usageState, params);

          switch (notification.method) {
            case "thread/started": {
              const startedThreadId = extractThreadId(params);
              if (!startedThreadId) return;
              threadId = startedThreadId;
              await db
                .update(tasks)
                .set({ sessionId: threadId, updatedAt: new Date() })
                .where(eq(tasks.id, taskId));
              return;
            }

            case "turn/started": {
              turnId = extractTurnId(params);
              launchProgress.hasTurnStarted = true;
              setExecution(taskId, {
                abortController,
                sessionId: threadId,
                taskId,
                startedAt: new Date(),
                interrupt: async () => {
                  if (client && threadId && turnId) {
                    await client.request("turn/interrupt", { threadId, turnId });
                  }
                },
                cleanup: async () => {
                  if (client) {
                    await client.close();
                  }
                },
                metadata: {
                  runtimeId: "openai-codex-app-server",
                  threadId,
                  turnId,
                },
              });
              await insertLog(taskId, "turn_started", { threadId, turnId });
              return;
            }

            case "item/agentMessage/delta": {
              const delta = asString(params.delta) ?? "";
              agentOutput += delta;
              await insertLog(taskId, "agent_message_delta", {
                threadId,
                turnId,
                itemId: asString(params.itemId),
                delta,
              });
              return;
            }

            case "item/commandExecution/outputDelta": {
              launchProgress.hasToolUse = true;
              await insertLog(taskId, "command_output_delta", {
                threadId,
                turnId,
                itemId: asString(params.itemId),
                delta: asString(params.delta),
              });
              return;
            }

            case "item/plan/delta": {
              await insertLog(taskId, "plan_delta", {
                threadId,
                turnId,
                itemId: asString(params.itemId),
                delta: params.delta,
              });
              return;
            }

            case "turn/completed": {
              const { status, errorMessage } = extractTurnStatus(params);
              launchProgress.hasResult = true;

              if (status === "completed") {
                const finalResult =
                  agentOutput.trim() || "Completed without textual output.";
                await settle(async () => {
                  await markTaskCompleted(taskId, task.title, finalResult);
                  await insertLog(taskId, "completed", {
                    threadId,
                    turnId,
                    result: finalResult.slice(0, 1000),
                    profileId,
                  });
                  await finalizeTaskUsage(usageState, "completed");
                });
                resolveCompletion?.();
                return;
              }

              if (status === "interrupted" || abortController.signal.aborted) {
                await settle(async () => {
                  await markTaskCancelled(taskId);
                  await insertLog(taskId, "cancelled", { threadId, turnId });
                  await finalizeTaskUsage(usageState, "cancelled");
                });
                resolveCompletion?.();
                return;
              }

              const message = errorMessage || "Codex turn failed";
              await settle(async () => {
                await markTaskFailed(taskId, task.title, message);
                await insertLog(taskId, "failed", { threadId, turnId, error: message });
                await finalizeTaskUsage(usageState, "failed");
              });
              rejectCompletion?.(new Error(message));
              return;
            }

            default:
              return;
          }
        })().catch(reject);
      };
    });

    await ensureOpenAICodexClientAuthenticated(client, auth);

    if (threadId) {
      await client.request("thread/resume", {
        threadId,
        cwd,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        developerInstructions: instructions || null,
      });
    } else {
      const threadResponse = (await client.request("thread/start", {
        cwd,
        approvalPolicy: "on-request",
        sandbox: "workspace-write",
        serviceName: "relay",
        developerInstructions: instructions || null,
        experimentalRawEvents: false,
        ephemeral: false,
      })) as { thread: { id: string } };

      threadId = threadResponse.thread.id;
      await db
        .update(tasks)
        .set({ sessionId: threadId, updatedAt: new Date() })
        .where(eq(tasks.id, taskId));
    }

    await insertLog(taskId, "thread_started", {
      threadId,
      profileId,
      runtime: "openai-codex-app-server",
    });

    await client.request("turn/start", {
      threadId,
      input: buildTurnInput(prompt),
      cwd,
      approvalPolicy: "on-request",
    });

    setExecution(taskId, {
      abortController,
      sessionId: threadId,
      taskId,
      startedAt: new Date(),
      interrupt: async () => {
        if (client && threadId && turnId) {
          await client.request("turn/interrupt", { threadId, turnId });
        }
      },
      cleanup: async () => {
        if (client) {
          await client.close();
        }
      },
      metadata: {
        runtimeId: "openai-codex-app-server",
        threadId,
        turnId,
      },
    });

    await completion;
  } catch (error) {
    if (abortController.signal.aborted || settled) {
      return;
    }

    if (error instanceof RetryableRuntimeLaunchError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    await settle(async () => {
      await markTaskFailed(taskId, task.title, message);
      await insertLog(taskId, "failed", { threadId, turnId, error: message });
      await finalizeTaskUsage(usageState, "failed");
    });
    throw error;
  } finally {
    if (client) {
      await client.close();
    }
    removeExecution(taskId);
  }
}

async function resumeOpenAICodexTask(taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (!task.sessionId) {
    throw new Error("No session to resume — use Retry instead");
  }

  await db
    .update(tasks)
    .set({
      resumeCount: sql`${tasks.resumeCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await executeOpenAICodexTask(taskId, { resume: true });
}

async function cancelOpenAICodexTask(taskId: string) {
  const execution = getExecution(taskId);
  execution?.abortController.abort();

  if (execution?.interrupt) {
    await execution.interrupt();
  }
  if (execution?.cleanup) {
    await execution.cleanup();
  }

  removeExecution(taskId);
  await markTaskCancelled(taskId);
}

async function runOpenAITaskAssist(
  input: TaskAssistInput
): Promise<TaskAssistResponse> {
  const prompt = [
    input.title ? `Task title: ${input.title}` : "",
    input.description ? `Description: ${input.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const startedAt = new Date();
  let usage: UsageSnapshot = {};

  try {
    const result = await runAssistTurn({
      prompt,
      developerInstructions: TASK_ASSIST_SYSTEM_PROMPT,
      cwd: getLaunchCwd(),
    });
    usage = result.usage;
    const parsed = extractJsonObject(result.text);

    await recordUsageLedgerEntry({
      activityType: "task_assist",
      runtimeId: "openai-codex-app-server",
      providerId: "openai",
      modelId: usage.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "completed",
      startedAt,
      finishedAt: new Date(),
    });

    return parsed;
  } catch (error) {
    await recordUsageLedgerEntry({
      activityType: "task_assist",
      runtimeId: "openai-codex-app-server",
      providerId: "openai",
      modelId: usage.modelId ?? null,
      inputTokens: usage.inputTokens ?? null,
      outputTokens: usage.outputTokens ?? null,
      totalTokens: usage.totalTokens ?? null,
      status: "failed",
      startedAt,
      finishedAt: new Date(),
    });
    throw error;
  }
}

async function testOpenAIConnection(): Promise<RuntimeConnectionResult> {
  let client: CodexAppServerClient | null = null;
  try {
    const auth = await resolveOpenAICodexAuthContext();
    client = await auth.connect(getLaunchCwd());
    await ensureOpenAICodexClientAuthenticated(client, auth);
    const accountState = await readCodexAuthStateFromClient(client, {
      refreshToken: auth.apiKeySource === "oauth",
    });

    return {
      connected: auth.apiKeySource === "oauth" ? accountState.connected : true,
      apiKeySource: auth.apiKeySource,
      account: accountState.account,
      rateLimits: accountState.rateLimits,
      authMode: accountState.authMode,
    };
  } catch (error) {
    return {
      connected: false,
      apiKeySource:
        error instanceof Error &&
        error.message.includes("ChatGPT sign-in is not configured")
          ? "oauth"
          : "unknown",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (client) {
      await client.close();
    }
  }
}

export const openAICodexRuntimeAdapter: AgentRuntimeAdapter = {
  metadata: getRuntimeCatalogEntry("openai-codex-app-server"),
  executeTask(taskId: string) {
    return executeOpenAICodexTask(taskId);
  },
  resumeTask(taskId: string) {
    return resumeOpenAICodexTask(taskId);
  },
  cancelTask(taskId: string) {
    return cancelOpenAICodexTask(taskId);
  },
  runTaskAssist(input: TaskAssistInput) {
    return runOpenAITaskAssist(input);
  },
  testConnection() {
    return testOpenAIConnection();
  },
};
