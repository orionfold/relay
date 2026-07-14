import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { schedules, tasks } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { parseInterval, computeNextFireTime } from "@/lib/schedules/interval-parser";
import { parseNaturalLanguage } from "@/lib/schedules/nlp-parser";
import { checkCollision } from "@/lib/schedules/collision-check";
import { resolveAgentRuntime } from "@/lib/agents/runtime/catalog";
import { validateRuntimeProfileAssignment } from "@/lib/agents/profiles/assignment-validation";
import {
  OperationsCriteriaValidationError,
  parseStoredSuccessCriteria,
  serializeSuccessCriteria,
  type SuccessCriteria,
} from "@/lib/operations/criteria";
import {
  ensureScheduleReceipt,
  listScheduleReceipts,
} from "@/lib/operations/receipts";
import { getScheduleBudgetSnapshot } from "@/lib/schedules/budget-policies";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [schedule] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, id));

  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const childTasks = await db
    .select()
    .from(tasks)
    .where(eq(tasks.scheduleId, schedule.id))
    .orderBy(desc(tasks.createdAt))
    .limit(100);

  const reconciliationErrors: string[] = [];
  for (const task of childTasks.slice(0, 20)) {
    if (!["completed", "failed", "cancelled"].includes(task.status)) continue;
    if (task.successCriteriaSnapshot === null) continue;
    try {
      await ensureScheduleReceipt(task.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[schedule-detail] receipt reconciliation failed for ${task.id}:`,
        error
      );
      reconciliationErrors.push(message);
    }
  }

  let successCriteria: SuccessCriteria = [];
  let successCriteriaError: string | null = null;
  try {
    successCriteria = parseStoredSuccessCriteria(schedule.successCriteria);
  } catch (error) {
    successCriteriaError = error instanceof Error ? error.message : String(error);
  }
  const receipts = await listScheduleReceipts(schedule.id);
  const budget = await getScheduleBudgetSnapshot(schedule.id);

  return NextResponse.json({
    ...schedule,
    heartbeatChecklist: schedule.heartbeatChecklist
      ? JSON.parse(schedule.heartbeatChecklist)
      : null,
    successCriteria,
    successCriteriaError,
    receipts,
    budget,
    receiptReconciliationErrors: reconciliationErrors,
    firingHistory: childTasks,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const {
    status, name, prompt, interval, assignedAgent, agentProfile,
    heartbeatChecklist, activeHoursStart, activeHoursEnd, activeTimezone,
    heartbeatBudgetPerDay,
    successCriteria,
  } = body as {
    status?: string;
    name?: string;
    prompt?: string;
    interval?: string;
    assignedAgent?: string;
    agentProfile?: string;
    heartbeatChecklist?: Array<{ id: string; instruction: string; priority: string }>;
    activeHoursStart?: number | null;
    activeHoursEnd?: number | null;
    activeTimezone?: string;
    heartbeatBudgetPerDay?: number | null;
    successCriteria?: unknown;
  };

  const [schedule] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, id));

  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const now = new Date();
  const updates: Record<string, unknown> = { updatedAt: now };

  // Status transitions
  if (status) {
    if (status === "paused") {
      if (schedule.status !== "active") {
        return NextResponse.json(
          { error: "Can only pause an active schedule" },
          { status: 409 }
        );
      }
      updates.status = "paused";
      updates.nextFireAt = null;
    } else if (status === "active") {
      if (schedule.status !== "paused") {
        return NextResponse.json(
          { error: "Can only resume a paused schedule" },
          { status: 409 }
        );
      }
      updates.status = "active";
      updates.nextFireAt = computeNextFireTime(schedule.cronExpression, now);
    } else {
      return NextResponse.json(
        { error: `Invalid status: ${status}` },
        { status: 400 }
      );
    }
  }

  // Field updates (only when active or paused)
  if (name !== undefined) {
    if (!name.trim()) {
      return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
    }
    updates.name = name.trim();
  }

  if (prompt !== undefined) {
    if (!prompt.trim()) {
      return NextResponse.json({ error: "Prompt cannot be empty" }, { status: 400 });
    }
    updates.prompt = prompt.trim();
  }

  if (interval !== undefined) {
    try {
      const nlResult = parseNaturalLanguage(interval);
      const cronExpression = nlResult
        ? nlResult.cronExpression
        : parseInterval(interval);
      updates.cronExpression = cronExpression;
      // Recompute next fire time if schedule is active
      if ((updates.status ?? schedule.status) === "active") {
        updates.nextFireAt = computeNextFireTime(cronExpression, now);
      }
    } catch (err) {
      return NextResponse.json(
        { error: (err as Error).message },
        { status: 400 }
      );
    }
  }

  if (agentProfile !== undefined) {
    updates.agentProfile = agentProfile || null;
  }

  if (assignedAgent !== undefined) {
    if (assignedAgent) {
      try {
        updates.assignedAgent = resolveAgentRuntime(assignedAgent);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 400 }
        );
      }
    } else {
      updates.assignedAgent = null;
    }
  }

  // Heartbeat-specific field updates
  if (heartbeatChecklist !== undefined) {
    updates.heartbeatChecklist = heartbeatChecklist
      ? JSON.stringify(heartbeatChecklist)
      : null;
  }
  if (activeHoursStart !== undefined) {
    updates.activeHoursStart = activeHoursStart;
  }
  if (activeHoursEnd !== undefined) {
    updates.activeHoursEnd = activeHoursEnd;
  }
  if (activeTimezone !== undefined) {
    updates.activeTimezone = activeTimezone || "UTC";
  }
  if (heartbeatBudgetPerDay !== undefined) {
    updates.heartbeatBudgetPerDay = heartbeatBudgetPerDay;
  }
  if (successCriteria !== undefined) {
    try {
      updates.successCriteria = serializeSuccessCriteria(successCriteria);
    } catch (error) {
      if (error instanceof OperationsCriteriaValidationError) {
        return NextResponse.json(
          { error: error.message, issues: error.issues },
          { status: 400 }
        );
      }
      throw error;
    }
  }

  const compatibilityError = validateRuntimeProfileAssignment({
    profileId:
      agentProfile !== undefined ? agentProfile || null : schedule.agentProfile,
    runtimeId:
      assignedAgent !== undefined
        ? assignedAgent || null
        : schedule.assignedAgent,
    context: "Schedule profile",
  });
  if (compatibilityError) {
    return NextResponse.json({ error: compatibilityError }, { status: 400 });
  }

  await db.update(schedules).set(updates).where(eq(schedules.id, id));

  const [updated] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, id));

  const effectiveCron = (updates.cronExpression as string | undefined) ?? schedule.cronExpression;
  const warnings = checkCollision(
    effectiveCron,
    schedule.avgTurnsPerFiring ?? 0,
    schedule.projectId ?? null,
    schedule.id,
  );
  return NextResponse.json({ schedule: updated, warnings });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [schedule] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, id));

  if (!schedule) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  await db.delete(schedules).where(eq(schedules.id, id));

  return NextResponse.json({ deleted: true });
}
