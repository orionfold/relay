import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { schedules, tasks, usageLedger } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { claimSlot, countRunningScheduledSlots } from "@/lib/schedules/slot-claim";
import {
  getScheduleMaxConcurrent,
  getScheduleMaxRunDurationSec,
} from "@/lib/schedules/config";
import { randomUUID } from "crypto";
import { startTaskExecution } from "@/lib/agents/task-dispatch";

/**
 * Manually fire a schedule. Honors the global concurrency cap by default.
 * Use `?force=true` to bypass the cap (logged to usage_ledger as
 * "manual_force_bypass" for audit).
 *
 * Security note: force bypass is audit-logged synchronously before task
 * execution begins, so every bypass leaves a permanent record regardless of
 * task outcome.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: scheduleId } = await params;
  const force = req.nextUrl.searchParams.get("force") === "true";

  const [schedule] = db
    .select()
    .from(schedules)
    .where(eq(schedules.id, scheduleId))
    .all();
  if (!schedule) {
    return NextResponse.json({ error: "schedule_not_found" }, { status: 404 });
  }

  const taskId = randomUUID();
  const firingNumber = schedule.firingCount + 1;
  const now = new Date();

  db.insert(tasks)
    .values({
      id: taskId,
      projectId: schedule.projectId,
      workflowId: null,
      scheduleId: schedule.id,
      title: `${schedule.name} — manual firing #${firingNumber}`,
      description: schedule.prompt,
      status: "queued",
      assignedAgent: schedule.assignedAgent,
      agentProfile: schedule.agentProfile,
      priority: 2,
      sourceType: "scheduled",
      maxTurns: schedule.maxTurns,
      successCriteriaSnapshot: schedule.successCriteria ?? "[]",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const cap = getScheduleMaxConcurrent();
  const leaseSec = schedule.maxRunDurationSec ?? getScheduleMaxRunDurationSec();

  // When force=true, pass an effectively infinite cap so the subquery COUNT
  // can never exceed it. This lets `claimSlot` atomically transition the task
  // to "running" even when the real cap is full.
  const effectiveCap = force ? Number.MAX_SAFE_INTEGER : cap;
  const { claimed } = claimSlot(taskId, effectiveCap, leaseSec);

  if (!claimed) {
    db.delete(tasks).where(eq(tasks.id, taskId)).run();
    const slotEtaSec = 60;
    return NextResponse.json(
      {
        error: "capacity_full",
        message: `Swarm at capacity (${countRunningScheduledSlots()}/${cap}). Retry in ~${slotEtaSec}s or add ?force=true to bypass.`,
        slotEtaSec,
      },
      { status: 429 },
    );
  }

  // Audit log written synchronously before task execution so that a force
  // bypass is always recorded even if the task itself fails immediately.
  if (force) {
    const nowTs = new Date();
    db.insert(usageLedger)
      .values({
        id: randomUUID(),
        taskId,
        scheduleId: schedule.id,
        projectId: schedule.projectId,
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

  // Fire-and-forget: the route returns immediately with taskId; execution runs
  // in the background. Errors are logged but do not affect the 200 response.
  startTaskExecution(taskId)
    .catch((err) => {
      console.error(`[api/schedules/execute] task ${taskId} failed:`, err);
    })
    .then(async () => {
      try {
        const { ensureScheduleReceipt } = await import(
          "@/lib/operations/receipts"
        );
        await ensureScheduleReceipt(taskId);
      } catch (error) {
        const { reportOperationsReceiptFailure } = await import(
          "@/lib/operations/receipts"
        );
        await reportOperationsReceiptFailure({
          ownerType: "schedule",
          ownerId: schedule.id,
          taskId,
          error,
        });
      }
    });

  return NextResponse.json({ taskId, forced: force });
}
