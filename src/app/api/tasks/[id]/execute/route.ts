import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, projects } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { classifyTaskProfile } from "@/lib/agents/router";
import { validateRuntimeProfileAssignment } from "@/lib/agents/profiles/assignment-validation";
import {
  BudgetLimitExceededError,
  enforceTaskBudgetGuardrails,
} from "@/lib/settings/budget-guardrails";
import { ensureFreshScan } from "@/lib/environment/auto-scan";
import { resolveTaskExecutionTarget } from "@/lib/agents/runtime/execution-target";
import { classifyExecutionTargetError } from "@/lib/agents/runtime/execution-target-preview";
import { startTaskExecution } from "@/lib/agents/task-dispatch";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    await enforceTaskBudgetGuardrails(id);
  } catch (error) {
    if (error instanceof BudgetLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (task.status !== "queued") {
    return NextResponse.json(
      { error: `Task must be queued to execute, current status: ${task.status}` },
      { status: 400 }
    );
  }

  let taskProfile = task.agentProfile;
  let executionTarget;
  try {
    executionTarget = await resolveTaskExecutionTarget({
      title: task.title,
      description: task.description,
      requestedRuntimeId: task.assignedAgent,
      profileId: taskProfile,
    });
    // Auto-classify before claiming so an incompatible or unavailable target
    // leaves the task queued and editable instead of manufacturing a failed run.
    if (!taskProfile) {
      taskProfile = classifyTaskProfile(
        task.title,
        task.description,
        executionTarget.effectiveRuntimeId
      );
      executionTarget = await resolveTaskExecutionTarget({
        title: task.title,
        description: task.description,
        requestedRuntimeId: task.assignedAgent,
        profileId: taskProfile,
      });
    }

    const compatibilityError = validateRuntimeProfileAssignment({
      profileId: taskProfile,
      runtimeId: executionTarget.effectiveRuntimeId,
      context: "Task profile",
    });
    if (compatibilityError) {
      return NextResponse.json(
        { error: compatibilityError, code: "runtime_capability_mismatch" },
        { status: 409 }
      );
    }
  } catch (error) {
    const classified = classifyExecutionTargetError(error);
    return NextResponse.json(
      { error: classified.message, code: classified.code },
      { status: 409 }
    );
  }

  // Atomic check-and-claim after target preflight. A concurrent request can
  // still win while preflight is running, so retain the guarded transition.
  const claimed = db
    .update(tasks)
    .set({
      status: "running",
      agentProfile: taskProfile,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, id), eq(tasks.status, "queued")))
    .returning()
    .all();

  if (claimed.length === 0) {
    return NextResponse.json(
      { error: "Task is already running or its status changed" },
      { status: 409 }
    );
  }

  // Auto-scan environment only after the run has been claimed.
  if (task.projectId) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, task.projectId));
    if (project?.workingDirectory) {
      ensureFreshScan(project.workingDirectory, task.projectId);
    }
  }

  // Fire-and-forget — task already marked as running
  startTaskExecution(id, {
    requestedRuntimeId: task.assignedAgent,
    preflightTarget: executionTarget,
  }).catch(
    (err) => console.error(`Task ${id} execution error:`, err)
  );

  return NextResponse.json({ message: "Execution started" }, { status: 202 });
}
