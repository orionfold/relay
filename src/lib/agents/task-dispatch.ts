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
  await db.insert(agentLogs).values({
    id: crypto.randomUUID(),
    taskId,
    agentType: "runtime-router",
    event: "runtime_launch_failed",
    payload: JSON.stringify({
      runtimeId: error.runtimeId,
      error: error.message,
    }),
    timestamp: new Date(),
  });
}

async function markTaskLaunchFailed(
  taskId: string,
  taskTitle: string,
  error: unknown
) {
  const message = error instanceof Error ? error.message : String(error);
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
  const effectiveLabel = getRuntimeCatalogEntry(
    input.retryTarget.effectiveRuntimeId
  ).label;

  return {
    ...input.retryTarget,
    fallbackApplied: true,
    fallbackReason: `${input.launchError.message}. Fell back to ${effectiveLabel}.`,
    requestedRuntimeId:
      input.retryTarget.requestedRuntimeId ?? input.originalTarget.requestedRuntimeId,
    requestedModelId:
      input.retryTarget.requestedModelId ?? input.originalTarget.requestedModelId,
    effectiveModelId: input.retryTarget.effectiveModelId,
    effectiveRuntimeId: input.retryTarget.effectiveRuntimeId,
    selectionMode: "automatic",
    selectionReason: `${input.launchError.message}; selected the next healthy compatible runtime`,
  };
}

async function retryTaskWithFallback(
  task: typeof tasks.$inferSelect,
  originalTarget: ResolvedExecutionTarget,
  launchError: RetryableRuntimeLaunchError
) {
  await logRuntimeLaunchFailure(task.id, launchError);

  let retryTarget: ResolvedExecutionTarget;
  try {
    retryTarget = await resolveTaskExecutionTarget({
      title: task.title,
      description: task.description,
      requestedRuntimeId: originalTarget.requestedRuntimeId ?? task.assignedAgent,
      profileId: task.agentProfile,
      unavailableRuntimeIds: [launchError.runtimeId],
      unavailableReasons: {
        [launchError.runtimeId]: launchError.message,
      },
    });
  } catch (error) {
    await markTaskLaunchFailed(task.id, task.title, error);
    throw error;
  }

  const fallbackTarget = buildLaunchFallbackTarget({
    originalTarget,
    retryTarget,
    launchError,
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
      await markTaskLaunchFailed(task.id, task.title, error);
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
      if (target.requestedRuntimeId) {
        await logRuntimeLaunchFailure(task.id, error);
        await markTaskLaunchFailed(task.id, task.title, error);
        throw error;
      }
      return retryTaskWithFallback(task, target, error);
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
