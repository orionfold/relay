import { db } from "@/lib/db";
import { agentLogs, notifications, tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { executeTaskWithRuntime, resumeTaskWithRuntime } from "@/lib/agents/runtime";
import {
  resolveResumeExecutionTarget,
  resolveTaskExecutionTarget,
  type ResolvedExecutionTarget,
} from "@/lib/agents/runtime/execution-target";
import {
  classifyTaskFailureReason,
  RetryableRuntimeLaunchError,
} from "@/lib/agents/runtime/launch-failure";
import { getRuntimeCatalogEntry } from "@/lib/agents/runtime/catalog";
import { sanitizeProviderError } from "@/lib/agents/runtime/provider-endpoint";

function toSafeLaunchError(
  error: RetryableRuntimeLaunchError,
): RetryableRuntimeLaunchError {
  const message = sanitizeProviderError(error.message);
  if (message === error.message) return error;
  return new RetryableRuntimeLaunchError({
    runtimeId: error.runtimeId,
    message,
    cause: new Error(message),
  });
}

async function persistExecutionTarget(
  taskId: string,
  target: ResolvedExecutionTarget
) {
  await db
    .update(tasks)
    .set({
      effectiveRuntimeId: target.effectiveRuntimeId,
      effectiveModelId: target.effectiveModelId,
      runtimeFallbackReason: target.fallbackReason,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId,
    agentType: "runtime-router",
    event: "runtime_selected",
    payload: JSON.stringify({
      selectionMode: target.selectionMode,
      routingPreference: target.routingPreference ?? null,
      effectiveRuntimeId: target.effectiveRuntimeId,
      effectiveModelId: target.effectiveModelId,
      selectionReason: target.selectionReason.slice(0, 500),
      automaticFallbackEnabled: target.automaticFallbackEnabled ?? false,
      consideredRuntimeIds: (target.consideredRuntimeIds ?? []).slice(0, 7),
      skippedRuntimes: (target.skippedRuntimes ?? []).slice(0, 7).map((skip) => ({
        runtimeId: skip.runtimeId,
        reason: skip.reason.slice(0, 500),
      })),
    }),
    timestamp: new Date(),
  });

  if (target.fallbackApplied && target.fallbackReason) {
    await db.insert(agentLogs).values({
      id: crypto.randomUUID(),
      taskId,
      agentType: "runtime-router",
      event: "runtime_fallback",
      payload: JSON.stringify({
        requestedRuntimeId: target.requestedRuntimeId,
        effectiveRuntimeId: target.effectiveRuntimeId,
        reason: target.fallbackReason,
      }),
      timestamp: new Date(),
    });
  }
}

async function logRuntimeLaunchFailure(
  taskId: string,
  error: RetryableRuntimeLaunchError
) {
  const safeMessage = sanitizeProviderError(error.message);
  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId,
    agentType: "runtime-router",
    event: "runtime_launch_failed",
    payload: JSON.stringify({
      runtimeId: error.runtimeId,
      error: safeMessage,
    }),
    timestamp: new Date(),
  });
}

async function markTaskLaunchFailed(
  taskId: string,
  taskTitle: string,
  error: unknown
) {
  const message = sanitizeProviderError(
    error instanceof Error ? error.message : String(error),
  );
  await db
    .update(tasks)
    .set({
      status: "failed",
      result: message,
      failureReason: classifyTaskFailureReason(
        error instanceof Error ? error : new Error(message)
      ),
      sessionId: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    taskId,
    type: "task_failed",
    title: `Task failed: ${taskTitle}`,
    body: message.slice(0, 500),
    createdAt: new Date(),
  });
}

function buildLaunchFallbackTarget(input: {
  originalTarget: ResolvedExecutionTarget;
  retryTarget: ResolvedExecutionTarget;
  launchError: RetryableRuntimeLaunchError;
}): ResolvedExecutionTarget {
  const safeLaunchMessage = sanitizeProviderError(input.launchError.message);
  const effectiveLabel = getRuntimeCatalogEntry(
    input.retryTarget.effectiveRuntimeId
  ).label;

  return {
    ...input.retryTarget,
    fallbackApplied: true,
    fallbackReason: `${safeLaunchMessage}. Fell back to ${effectiveLabel}.`,
    requestedRuntimeId:
      input.retryTarget.requestedRuntimeId ?? input.originalTarget.requestedRuntimeId,
    requestedModelId:
      input.retryTarget.requestedModelId ?? input.originalTarget.requestedModelId,
    effectiveModelId: input.retryTarget.effectiveModelId,
    effectiveRuntimeId: input.retryTarget.effectiveRuntimeId,
    selectionMode: "automatic",
    selectionReason: `${safeLaunchMessage}; selected the next healthy compatible runtime`,
  };
}

async function retryTaskWithFallback(
  task: typeof tasks.$inferSelect,
  originalTarget: ResolvedExecutionTarget,
  launchError: RetryableRuntimeLaunchError
) {
  const safeLaunchError = toSafeLaunchError(launchError);
  await logRuntimeLaunchFailure(task.id, safeLaunchError);

  let retryTarget: ResolvedExecutionTarget;
  try {
    retryTarget = await resolveTaskExecutionTarget({
      title: task.title,
      description: task.description,
      requestedRuntimeId: originalTarget.requestedRuntimeId ?? task.assignedAgent,
      profileId: task.agentProfile,
      unavailableRuntimeIds: [launchError.runtimeId],
      unavailableReasons: {
        [safeLaunchError.runtimeId]: safeLaunchError.message,
      },
    });
  } catch (error) {
    await markTaskLaunchFailed(task.id, task.title, error);
    throw error;
  }

  const fallbackTarget = buildLaunchFallbackTarget({
    originalTarget,
    retryTarget,
    launchError: safeLaunchError,
  });

  await db
    .update(tasks)
    .set({
      status: "running",
      result: null,
      failureReason: null,
      sessionId: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));

  await persistExecutionTarget(task.id, fallbackTarget);
  try {
    return await executeTaskWithRuntime(task.id, fallbackTarget.effectiveRuntimeId);
  } catch (error) {
    if (error instanceof RetryableRuntimeLaunchError) {
      const safeError = toSafeLaunchError(error);
      await markTaskLaunchFailed(task.id, task.title, safeError);
      throw safeError;
    }
    throw error;
  }
}

export async function startTaskExecution(
  taskId: string,
  options?: {
    requestedRuntimeId?: string | null;
    preflightTarget?: ResolvedExecutionTarget;
  }
) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const target =
    options?.preflightTarget ??
    (await resolveTaskExecutionTarget({
      title: task.title,
      description: task.description,
      requestedRuntimeId: options?.requestedRuntimeId ?? task.assignedAgent,
      profileId: task.agentProfile,
    }));

  await db
    .update(tasks)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  await persistExecutionTarget(taskId, target);
  try {
    return await executeTaskWithRuntime(taskId, target.effectiveRuntimeId);
  } catch (error) {
    if (error instanceof RetryableRuntimeLaunchError) {
      const safeError = toSafeLaunchError(error);
      if (
        target.requestedRuntimeId ||
        target.selectionMode !== "automatic" ||
        target.automaticFallbackEnabled !== true
      ) {
        await logRuntimeLaunchFailure(task.id, safeError);
        await markTaskLaunchFailed(task.id, task.title, safeError);
        throw safeError;
      }
      return retryTaskWithFallback(task, target, safeError);
    }
    throw error;
  }
}

export async function resumeTaskExecution(
  taskId: string,
  options?: {
    requestedRuntimeId?: string | null;
    effectiveRuntimeId?: string | null;
  }
) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const target = await resolveResumeExecutionTarget({
    requestedRuntimeId: options?.requestedRuntimeId ?? task.assignedAgent,
    effectiveRuntimeId: options?.effectiveRuntimeId ?? task.effectiveRuntimeId,
  });

  await db
    .update(tasks)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  await persistExecutionTarget(taskId, target);
  return resumeTaskWithRuntime(taskId, target.effectiveRuntimeId);
}
