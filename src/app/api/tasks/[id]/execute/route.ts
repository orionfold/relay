import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { tasks, projects, usageLedger } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
import {
  claimTaskSlot,
  countRunningTaskSlots,
  getTaskMaxConcurrent,
} from "@/lib/agents/task-slots";

/**
 * Run a queued task now.
 *
 * Honors the on-demand concurrency cap by default: over the cap the task stays
 * `queued` and the answer is still `202`, carrying `state: "queued"` so the
 * caller knows the run was accepted and deferred rather than started. It is
 * never an error — the run starts when a slot frees, oldest submission first.
 *
 * `?force=true` bypasses the cap, audit-logged to `usage_ledger` as
 * `manual_force_bypass` before dispatch, as `tdr-manual-honors-cap.md`
 * prescribes for every operational "run now" surface.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Read from req.url rather than req.nextUrl: the route is also invoked
  // directly with a plain Request, which has no NextRequest accessors.
  const force = new URL(req.url).searchParams.get("force") === "true";

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

  // The classified profile is the route's own decision and is recorded whether
  // or not a slot is free, so a deferred run starts with the same profile the
  // preflight resolved its target against.
  if (taskProfile !== task.agentProfile) {
    db.update(tasks)
      .set({ agentProfile: taskProfile, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .run();
  }

  // Atomic check-and-claim after target preflight. A concurrent request can
  // still win while preflight is running, so the transition stays guarded —
  // and the same statement enforces the on-demand concurrency cap.
  const claimed = claimTaskSlot(id, { from: ["queued"], force });

  if (!claimed) {
    const current = db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, id))
      .get();
    if (current?.status !== "queued") {
      return NextResponse.json(
        { error: "Task is already running or its status changed" },
        { status: 409 }
      );
    }

    // Cap full. The run is accepted and waits its turn; it is not an error and
    // the task is not failed.
    const cap = getTaskMaxConcurrent();
    startTaskExecution(id, {
      requestedRuntimeId: task.assignedAgent,
      preflightTarget: executionTarget,
    }).catch((err) => console.error(`Task ${id} execution error:`, err));

    return NextResponse.json(
      {
        message: `Execution queued — ${countRunningTaskSlots()}/${cap} on-demand runs in flight. It starts when a slot frees.`,
        state: "queued",
        taskId: id,
        cap,
      },
      { status: 202 }
    );
  }

  // Audit the bypass synchronously, before dispatch, so the record survives
  // whatever the run does next.
  if (force) {
    const nowTs = new Date();
    db.insert(usageLedger)
      .values({
        id: randomUUID(),
        taskId: id,
        projectId: task.projectId,
        activityType: "manual_force_bypass",
        runtimeId: "manual",
        providerId: "manual",
        status: "completed",
        costMicros: 0,
        startedAt: nowTs,
        finishedAt: nowTs,
      })
      .run();
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

  return NextResponse.json(
    { message: "Execution started", state: "running", taskId: id, forced: force },
    { status: 202 }
  );
}
