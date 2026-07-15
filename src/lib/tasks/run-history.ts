import "server-only";

import { and, count, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentLogs, notifications, tasks, usageLedger } from "@/lib/db/schema";
import type { UsageCompleteness } from "@/lib/usage/ledger";

const RUN_LIMIT = 20;
const RAW_LOG_LIMIT = 600;
const PERMISSION_LIMIT = 100;
const PREFLIGHT_RECEIPT_LOOKBACK_MS = 5 * 60 * 1000;
export const SEMANTIC_EVENT_LIMIT = 160;
export const SEMANTIC_PAYLOAD_LIMIT = 2_000;
const EXECUTION_ACTIVITY_TYPES = [
  "task_run",
  "task_resume",
  "workflow_step",
  "scheduled_firing",
] as const;

export type TaskRunStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked";

export interface TaskRunLog {
  id: string;
  agentType: string;
  event: string;
  payload: string | null;
  timestamp: string;
  eventCount?: number;
  payloadTruncated?: boolean;
}

export interface TaskRunHistoryItem {
  id: string;
  status: TaskRunStatus;
  activityType: string;
  startedAt: string;
  finishedAt: string | null;
  runtimeId: string | null;
  modelId: string | null;
  totalTokens: number | null;
  costMicros: number | null;
  usageCompleteness: UsageCompleteness;
  logs: TaskRunLog[];
  logsUnavailable: boolean;
  current: boolean;
}

export interface TaskRunHistory {
  runs: TaskRunHistoryItem[];
  totalRuns: number;
  omittedRuns: number;
  logsTruncated: boolean;
  historyUnavailable: boolean;
}

type TaskExecutionRow = Pick<
  typeof usageLedger.$inferSelect,
  | "id"
  | "activityType"
  | "runtimeId"
  | "modelId"
  | "status"
  | "totalTokens"
  | "costMicros"
  | "usageCompleteness"
  | "startedAt"
  | "finishedAt"
>;

type TaskLogRow = Pick<
  typeof agentLogs.$inferSelect,
  "id" | "agentType" | "event" | "payload" | "timestamp"
>;

type TaskPermissionRow = Pick<
  typeof notifications.$inferSelect,
  "id" | "title" | "body" | "toolName" | "response" | "createdAt"
>;

type TaskHistoryState = Pick<
  typeof tasks.$inferSelect,
  "status" | "updatedAt" | "effectiveRuntimeId" | "effectiveModelId"
>;

function iso(value: Date): string {
  return value.toISOString();
}

function boundPayload(payload: string | null): {
  payload: string | null;
  truncated: boolean;
} {
  if (!payload || payload.length <= SEMANTIC_PAYLOAD_LIMIT) {
    return { payload, truncated: false };
  }
  return {
    payload: JSON.stringify({
      message: "Event detail trimmed for task history; open Monitor for the raw payload.",
      preview: payload.slice(0, SEMANTIC_PAYLOAD_LIMIT),
      rawCharacters: payload.length,
    }),
    truncated: true,
  };
}

function serializeLog(log: TaskLogRow): TaskRunLog {
  const bounded = boundPayload(log.payload);
  return {
    id: log.id,
    agentType: log.agentType,
    event: log.event,
    payload: bounded.payload,
    timestamp: iso(log.timestamp),
    eventCount: 1,
    payloadTruncated: bounded.truncated,
  };
}

const RESPONSE_NOISE_EVENTS = new Set([
  "message_start",
  "content_block_start",
  "content_block_delta",
  "stream",
]);
const PREFLIGHT_RECEIPT_EVENTS = new Set([
  "runtime_selected",
  "runtime_launch_failed",
  "runtime_fallback",
]);

function permissionEvent(permission: TaskPermissionRow): TaskRunLog {
  let decision = "pending";
  if (permission.response) {
    try {
      const parsed = JSON.parse(permission.response) as { behavior?: unknown };
      decision = parsed.behavior === "allow" ? "approved" : parsed.behavior === "deny" ? "denied" : "answered";
    } catch {
      decision = "answered";
    }
  }

  const bounded = boundPayload(JSON.stringify({
    title: permission.title,
    message: permission.body,
    tool: permission.toolName,
    decision,
  }));
  return {
    id: `permission-${permission.id}`,
    agentType: "operator",
    event: `permission_${decision}`,
    payload: bounded.payload,
    timestamp: iso(permission.createdAt),
    eventCount: 1,
    payloadTruncated: bounded.truncated,
  };
}

/**
 * Convert raw provider stream chatter into a compact operator timeline. Raw
 * evidence remains untouched in agent_logs and available through Monitor.
 */
export function assembleSemanticEvents(
  logs: TaskLogRow[],
  permissions: TaskPermissionRow[] = [],
): { events: TaskRunLog[]; truncated: boolean } {
  const ordered = [
    ...logs.map((log) => ({ timestamp: log.timestamp, event: serializeLog(log) })),
    ...permissions.map((permission) => ({
      timestamp: permission.createdAt,
      event: permissionEvent(permission),
    })),
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const semantic: TaskRunLog[] = [];
  for (const item of ordered) {
    if (!RESPONSE_NOISE_EVENTS.has(item.event.event)) {
      semantic.push(item.event);
      continue;
    }

    const previous = semantic.at(-1);
    if (previous?.event === "response_progress") {
      previous.eventCount = (previous.eventCount ?? 1) + 1;
      previous.timestamp = item.event.timestamp;
      previous.payload = JSON.stringify({
        message: "Generated response content",
        rawEvents: previous.eventCount,
      });
      continue;
    }

    semantic.push({
      ...item.event,
      id: `response-${item.event.id}`,
      event: "response_progress",
      payloadTruncated: false,
      payload: JSON.stringify({
        message: "Generated response content",
        rawEvents: 1,
      }),
    });
  }

  return {
    events: semantic.slice(-SEMANTIC_EVENT_LIMIT),
    truncated: semantic.length > SEMANTIC_EVENT_LIMIT,
  };
}

function executionStatus(status: TaskExecutionRow["status"]): TaskRunStatus {
  return status === "unknown_pricing" ? "completed" : status;
}

function isTerminalTaskStatus(status: TaskHistoryState["status"]): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function inferredTerminalStatus(
  taskStatus: TaskHistoryState["status"],
  logs: TaskLogRow[],
): TaskRunStatus {
  const terminal = [...logs]
    .reverse()
    .find((log) => ["completed", "failed", "error", "cancelled"].includes(log.event));
  if (terminal?.event === "completed") return "completed";
  if (terminal?.event === "cancelled") return "cancelled";
  if (terminal?.event === "failed" || terminal?.event === "error") return "failed";
  return taskStatus === "cancelled" ? "cancelled" : taskStatus === "failed" ? "failed" : "completed";
}

export function assembleTaskRunHistory(input: {
  task: TaskHistoryState;
  executions: TaskExecutionRow[];
  logs: TaskLogRow[];
  permissions?: TaskPermissionRow[];
  totalRuns: number;
  logsTruncated?: boolean;
}): TaskRunHistory {
  const executions = [...input.executions].sort(
    (a, b) => b.startedAt.getTime() - a.startedAt.getTime(),
  );
  const rawLogs = [...input.logs].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  );
  const { events: logs, truncated: semanticEventsTruncated } = assembleSemanticEvents(
    rawLogs,
    input.permissions,
  );
  const runs: TaskRunHistoryItem[] = executions.map((execution, index) => {
    const startedAt = execution.startedAt.getTime();
    const finishedAt = execution.finishedAt.getTime();
    const olderRunFinishedAt = executions[index + 1]?.finishedAt.getTime();
    const runLogs = logs.filter((log) => {
      const timestamp = new Date(log.timestamp).getTime();
      const duringRun = timestamp >= startedAt && timestamp <= finishedAt;
      const preflightReceipt =
        PREFLIGHT_RECEIPT_EVENTS.has(log.event) &&
        timestamp < startedAt &&
        (olderRunFinishedAt == null || timestamp > olderRunFinishedAt);
      return duringRun || preflightReceipt;
    });

    return {
      id: execution.id,
      status: executionStatus(execution.status),
      activityType: execution.activityType,
      startedAt: iso(execution.startedAt),
      finishedAt: iso(execution.finishedAt),
      runtimeId: execution.runtimeId,
      modelId: execution.modelId,
      totalTokens: execution.totalTokens,
      costMicros: execution.costMicros,
      usageCompleteness: execution.usageCompleteness,
      logs: runLogs,
      logsUnavailable: runLogs.length === 0,
      current: false,
    };
  });

  const latestFinishedAt = executions.reduce(
    (latest, execution) => Math.max(latest, execution.finishedAt.getTime()),
    0,
  );

  if (input.task.status === "running") {
    const currentLogs = logs.filter(
      (log) => new Date(log.timestamp).getTime() > latestFinishedAt,
    );
    const firstCurrentLogAt = currentLogs[0] ? new Date(currentLogs[0].timestamp).getTime() : undefined;
    const startedAt = new Date(
      firstCurrentLogAt ?? Math.max(input.task.updatedAt.getTime(), latestFinishedAt + 1),
    );
    runs.unshift({
      id: `current-${startedAt.getTime()}`,
      status: "running",
      activityType: "current_run",
      startedAt: iso(startedAt),
      finishedAt: null,
      runtimeId: input.task.effectiveRuntimeId,
      modelId: input.task.effectiveModelId,
      totalTokens: null,
      costMicros: null,
      usageCompleteness: "unavailable",
      logs: currentLogs,
      logsUnavailable: false,
      current: true,
    });
  } else if (executions.length === 0 && logs.length > 0 && isTerminalTaskStatus(input.task.status)) {
    runs.push({
      id: `legacy-${new Date(logs[0].timestamp).getTime()}`,
      status: inferredTerminalStatus(input.task.status, rawLogs),
      activityType: "recorded_activity",
      startedAt: logs[0].timestamp,
      finishedAt: logs[logs.length - 1].timestamp,
      runtimeId: input.task.effectiveRuntimeId,
      modelId: input.task.effectiveModelId,
      totalTokens: null,
      costMicros: null,
      usageCompleteness: "unavailable",
      logs,
      logsUnavailable: false,
      current: false,
    });
  }

  const historyUnavailable =
    runs.length === 0 && isTerminalTaskStatus(input.task.status);
  const hasLegacyRun =
    executions.length === 0 &&
    logs.length > 0 &&
    isTerminalTaskStatus(input.task.status);

  return {
    runs,
    totalRuns:
      input.totalRuns +
      (input.task.status === "running" ? 1 : 0) +
      (hasLegacyRun ? 1 : 0),
    omittedRuns: Math.max(0, input.totalRuns - executions.length),
    logsTruncated: (input.logsTruncated ?? false) || semanticEventsTruncated,
    historyUnavailable,
  };
}

export async function getTaskRunHistory(taskId: string): Promise<TaskRunHistory | null> {
  const [task] = await db
    .select({
      status: tasks.status,
      updatedAt: tasks.updatedAt,
      effectiveRuntimeId: tasks.effectiveRuntimeId,
      effectiveModelId: tasks.effectiveModelId,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId));

  if (!task) return null;

  const executionWhere = and(
    eq(usageLedger.taskId, taskId),
    inArray(usageLedger.activityType, [...EXECUTION_ACTIVITY_TYPES]),
  );
  const [executions, [runCount]] = await Promise.all([
    db
      .select({
        id: usageLedger.id,
        activityType: usageLedger.activityType,
        runtimeId: usageLedger.runtimeId,
        modelId: usageLedger.modelId,
        status: usageLedger.status,
        totalTokens: usageLedger.totalTokens,
        costMicros: usageLedger.costMicros,
        usageCompleteness: usageLedger.usageCompleteness,
        startedAt: usageLedger.startedAt,
        finishedAt: usageLedger.finishedAt,
      })
      .from(usageLedger)
      .where(executionWhere)
      .orderBy(desc(usageLedger.startedAt))
      .limit(RUN_LIMIT),
    db.select({ value: count() }).from(usageLedger).where(executionWhere),
  ]);

  const oldestIncludedStart = executions.at(-1)?.startedAt;
  const oldestIncludedReceiptStart = oldestIncludedStart
    ? new Date(oldestIncludedStart.getTime() - PREFLIGHT_RECEIPT_LOOKBACK_MS)
    : null;
  const logWhere = oldestIncludedStart
    ? and(
        eq(agentLogs.taskId, taskId),
        gte(
          agentLogs.timestamp,
          oldestIncludedReceiptStart ?? oldestIncludedStart,
        ),
      )
    : eq(agentLogs.taskId, taskId);
  const permissionWhere = oldestIncludedStart
    ? and(
        eq(notifications.taskId, taskId),
        eq(notifications.type, "permission_required"),
        gte(notifications.createdAt, oldestIncludedStart),
      )
    : and(
        eq(notifications.taskId, taskId),
        eq(notifications.type, "permission_required"),
      );
  const [recentLogs, recentPermissions] = await Promise.all([
    db
      .select({
        id: agentLogs.id,
        agentType: agentLogs.agentType,
        event: agentLogs.event,
        payload: agentLogs.payload,
        timestamp: agentLogs.timestamp,
      })
      .from(agentLogs)
      .where(logWhere)
      .orderBy(desc(agentLogs.timestamp))
      .limit(RAW_LOG_LIMIT + 1),
    db
      .select({
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        toolName: notifications.toolName,
        response: notifications.response,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(permissionWhere)
      .orderBy(desc(notifications.createdAt))
      .limit(PERMISSION_LIMIT + 1),
  ]);
  const logsTruncated =
    recentLogs.length > RAW_LOG_LIMIT || recentPermissions.length > PERMISSION_LIMIT;
  const logs = recentLogs.slice(0, RAW_LOG_LIMIT).reverse();
  const permissions = recentPermissions.slice(0, PERMISSION_LIMIT).reverse();

  return assembleTaskRunHistory({
    task,
    executions,
    logs,
    permissions,
    totalRuns: runCount?.value ?? 0,
    logsTruncated,
  });
}
