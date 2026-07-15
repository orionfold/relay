/**
 * Poll-based scheduler engine.
 *
 * Runs on a configurable interval (default 60s), checking for schedules whose
 * `nextFireAt` has passed. For each due schedule it creates a child task and
 * fires it via the provider runtime pipeline.
 *
 * Lifecycle:
 *   - `startScheduler()` — call once at server boot (idempotent)
 *   - `stopScheduler()`  — call on graceful shutdown
 *   - `tickScheduler()`  — exposed for testing; runs one poll cycle
 */

import { db } from "@/lib/db";
import { schedules, tasks, agentLogs, scheduleDocumentInputs, documents, workflows, scheduleFiringMetrics, notifications } from "@/lib/db/schema";
import { eq, and, lte, inArray, sql, asc, isNotNull, isNull } from "drizzle-orm";
import {
  resumeWorkflow,
  resumeWorkflowInteraction,
} from "@/lib/workflows/engine";
import { computeNextFireTime } from "./interval-parser";
import { startTaskExecution } from "@/lib/agents/task-dispatch";
import { getSetting } from "@/lib/settings/helpers";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import { checkActiveHours } from "./active-hours";
import {
  buildHeartbeatPrompt,
  parseHeartbeatResponse,
  parseChecklist,
} from "./heartbeat-prompt";
import { sendToChannels } from "@/lib/channels/registry";
import type { ChannelMessage } from "@/lib/channels/types";
import { processHandoffs } from "@/lib/agents/handoff/bus";
import { claimSlot, reapExpiredLeases, countRunningScheduledSlots } from "./slot-claim";
import { isAppScheduleId, parseAppScheduleId } from "@/lib/apps/app-schedule-id";
import { isAnyChatStreaming } from "@/lib/chat/active-streams";
import {
  getScheduleMaxConcurrent,
  getScheduleMaxRunDurationSec,
  getScheduleChatPressureDelaySec,
} from "./config";
import {
  beginScheduleBudgetRun,
  completeScheduleBudgetRun,
  deferScheduleForBudgetClaim,
  releaseScheduleBudgetRun,
  type ScheduleBudgetRunClaim,
} from "./budget-policies";

const POLL_INTERVAL_MS = 60_000; // 60 seconds

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let draining = false;

async function finalizeScheduleFiring(
  scheduleId: string,
  taskId: string,
  budgetClaim: ScheduleBudgetRunClaim | null = null
): Promise<void> {
  try {
    await completeScheduleBudgetRun({ claim: budgetClaim, taskId });
  } catch (error) {
    console.error(`[scheduler] budget reconciliation failed for ${taskId}:`, error);
  }

  try {
    await recordFiringMetrics(scheduleId, taskId);
  } catch (error) {
    console.error(`[scheduler] metrics recording failed for ${taskId}:`, error);
  }

  try {
    const { ensureScheduleReceipt } = await import("@/lib/operations/receipts");
    await ensureScheduleReceipt(taskId);
  } catch (error) {
    const { reportOperationsReceiptFailure } = await import(
      "@/lib/operations/receipts"
    );
    await reportOperationsReceiptFailure({
      ownerType: "schedule",
      ownerId: scheduleId,
      taskId,
      error,
    });
  }
}

/**
 * Drain queued schedule/heartbeat tasks after a firing completes.
 *
 * Background: schedule firings used to be fire-and-forget. When multiple
 * schedules collided on the same minute (e.g. three `*​/30 * * * *` schedules
 * all firing at :00), one task would execute and the others would sit in
 * "queued" until the next poll cycle 30+ minutes later. This drain hook walks
 * the queue immediately on completion so collisions resolve in seconds.
 *
 * Sequential by design: the executor processes one task at a time to avoid
 * concurrent agent costs and write conflicts. We use a module-level `draining`
 * flag to ensure only one drain loop runs even if multiple firings finish in
 * close succession.
 */
export async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    // Loop until the queue is empty so a single drain cycle clears all
    // collided tasks rather than only the next one.
    while (true) {
      // Respect the global cap — stop draining if we're already at capacity
      const cap = getScheduleMaxConcurrent();
      if (countRunningScheduledSlots() >= cap) return;

      const [nextQueued] = await db
        .select({ id: tasks.id, scheduleId: tasks.scheduleId })
        .from(tasks)
        .where(
          and(
            eq(tasks.status, "queued"),
            inArray(tasks.sourceType, ["scheduled", "heartbeat"])
          )
        )
        .orderBy(asc(tasks.createdAt))
        .limit(1);

      if (!nextQueued) return;

      let budgetClaim: ScheduleBudgetRunClaim | null = null;
      if (nextQueued.scheduleId) {
        const budget = await beginScheduleBudgetRun({
          scheduleId: nextQueued.scheduleId,
          runId: nextQueued.id,
          claimTtlSec: getScheduleMaxRunDurationSec() + 120,
        });
        if (budget.status === "busy") return;
        if (budget.status === "blocked") {
          await db
            .update(tasks)
            .set({
              status: "failed",
              failureReason: "budget_exceeded",
              result: budget.reason,
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, nextQueued.id));
          await finalizeScheduleFiring(nextQueued.scheduleId, nextQueued.id);
          continue;
        }
        budgetClaim = budget.claim;
        if (budgetClaim?.strictestPerRunUsd !== null && budgetClaim) {
          await db
            .update(tasks)
            .set({ maxBudgetUsd: budgetClaim.strictestPerRunUsd })
            .where(eq(tasks.id, nextQueued.id));
        }
      }

      // Atomic claim — could lose the race if a concurrent tick already took
      // this specific task, OR the cap filled between the select and the claim.
      // On a lost-race (task-level) we should try the next queued task; on a
      // cap-full the next iteration's cap check at the top of the loop will
      // return. Continue rather than return so we don't strand other queued
      // tasks that could still claim.
      const leaseSec = getScheduleMaxRunDurationSec();
      const { claimed } = claimSlot(nextQueued.id, cap, leaseSec);
      if (!claimed) {
        await releaseScheduleBudgetRun(budgetClaim);
        continue;
      }

      console.log(`[scheduler] draining queue → running task ${nextQueued.id}`);
      try {
        await startTaskExecution(nextQueued.id);
      } catch (err) {
        console.error(`[scheduler] drain task ${nextQueued.id} failed:`, err);
      }

      // Record health metrics for the schedule that owns this task (if any).
      try {
        const [taskRow] = await db
          .select({ scheduleId: tasks.scheduleId })
          .from(tasks)
          .where(eq(tasks.id, nextQueued.id));
        if (taskRow?.scheduleId) {
          await finalizeScheduleFiring(
            taskRow.scheduleId,
            nextQueued.id,
            budgetClaim
          );
        }
      } catch (err) {
        console.error(`[scheduler] metrics recording failed for ${nextQueued.id}:`, err);
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * Build the turn-budget guidance header that prepends to schedule-spawned
 * task descriptions. Reads `runtime.maxTurns` so the agent sees the same
 * limit the runtime will enforce, and gives concrete batching guidance to
 * head off per-item loop patterns that exhaust turns.
 */
async function buildTurnBudgetHeader(): Promise<string> {
  const raw = await getSetting(SETTINGS_KEYS.MAX_TURNS);
  const maxTurns = raw ? Number.parseInt(raw, 10) || 50 : 50;
  return [
    `TURN BUDGET: You have ${maxTurns} turns maximum. Plan accordingly.`,
    `IMPORTANT: Batch operations to minimize turns.`,
    `- Use ONE web search with multiple keywords instead of per-item searches`,
    `- Read multiple tables in a single turn when possible`,
    `- Do NOT loop through items with individual tool calls`,
    ``,
    ``,
  ].join("\n");
}

/**
 * Detect a failure reason from a completed task by inspecting its result text.
 * Used by recordFiringMetrics to surface meaningful causes (turn limit, timeout,
 * generic) without needing additional schema columns on tasks.
 */
function detectFailureReason(result: string | null): string {
  if (!result) return "unknown";
  const lower = result.toLowerCase();
  if (lower.includes("turn") && (lower.includes("limit") || lower.includes("max"))) {
    return "turn_limit_exceeded";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "timeout";
  }
  if (lower.includes("budget")) return "budget_exceeded";
  return "error";
}

const TURN_BUDGET_BREACH_AUTO_PAUSE_THRESHOLD = 5;
const GRACE_PERIOD_MULTIPLIER = 2; // grace window = 2 × cron interval

/**
 * Record per-firing health metrics on a schedule and auto-pause after
 * 3 consecutive generic failures or 5 consecutive turn-budget breaches.
 * Uses an exponential moving average for turn count so the metric reflects
 * recent behavior more than ancient firings.
 *
 * Turn-budget breaches are tracked separately (turnBudgetBreachStreak) so a
 * misconfigured maxTurns doesn't auto-pause via the generic threshold of 3.
 * A first-breach grace window (2× cron interval after maxTurnsSetAt) forgives
 * the first firing that hits a newly-lowered cap.
 */
export async function recordFiringMetrics(
  scheduleId: string,
  taskId: string,
): Promise<void> {
  const [task] = await db
    .select({
      status: tasks.status,
      result: tasks.result,
      failureReason: tasks.failureReason,
      updatedAt: tasks.updatedAt,
      turnCount: tasks.turnCount,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!task) return;

  const [schedule] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, scheduleId));
  if (!schedule) return;

  // Prefer the persisted per-task turnCount written by the runtime at completion
  // (see features/task-turn-observability.md). Fall back to counting agentLogs
  // rows for pre-existing tasks where turnCount is still null. This keeps the
  // schedule aggregates (lastTurnCount / avgTurnsPerFiring) consistent with the
  // value get_task / list_tasks expose for the same firing — the prior COUNT(*)
  // path counted every log row including content_block_start/delta and tool_*
  // events, which inflated the metric well above the assistant-frame count
  // recorded on the task row.
  let turns: number;
  if (task.turnCount != null) {
    turns = task.turnCount;
  } else {
    const turnCountResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentLogs)
      .where(eq(agentLogs.taskId, taskId));
    turns = Number(turnCountResult[0]?.count ?? 0);
  }

  const prevAvg = schedule.avgTurnsPerFiring ?? turns;
  const newAvg = Math.round(prevAvg * 0.7 + turns * 0.3);

  const isFailure = task.status === "failed";
  const failureReason =
    task.failureReason ?? (isFailure ? detectFailureReason(task.result) : null);
  const isTurnBudgetBreach = failureReason === "turn_limit_exceeded";
  const isGenericFailure = isFailure && !isTurnBudgetBreach;

  // First-breach grace: if this is the first firing after maxTurns was edited,
  // don't count the breach toward the auto-pause streak.
  let turnBudgetStreakDelta = 0;
  if (isTurnBudgetBreach) {
    const graceApplies = shouldApplyGrace(
      schedule.maxTurnsSetAt,
      schedule.cronExpression,
      task.updatedAt,
    );
    if (!graceApplies) turnBudgetStreakDelta = 1;
  }

  const newFailureStreak = isGenericFailure ? (schedule.failureStreak ?? 0) + 1 : 0;
  const newBudgetStreak =
    turnBudgetStreakDelta > 0
      ? (schedule.turnBudgetBreachStreak ?? 0) + 1
      : isTurnBudgetBreach
      ? (schedule.turnBudgetBreachStreak ?? 0)  // hold-steady but coerce null→0
      : 0;
  const shouldAutoPauseGeneric =
    isGenericFailure && newFailureStreak >= 3 && schedule.status === "active";
  const shouldAutoPauseBudget =
    newBudgetStreak >= TURN_BUDGET_BREACH_AUTO_PAUSE_THRESHOLD &&
    schedule.status === "active";
  const shouldAutoPause = shouldAutoPauseGeneric || shouldAutoPauseBudget;

  await db
    .update(schedules)
    .set({
      lastTurnCount: turns,
      avgTurnsPerFiring: newAvg,
      failureStreak: newFailureStreak,
      turnBudgetBreachStreak: newBudgetStreak,
      lastFailureReason: failureReason,
      status: shouldAutoPause ? "paused" : schedule.status,
      updatedAt: new Date(),
    })
    .where(eq(schedules.id, scheduleId));

  if (shouldAutoPauseGeneric) {
    console.warn(
      `[scheduler] auto-paused "${schedule.name}" after 3 consecutive failures`,
    );
  }
  if (shouldAutoPauseBudget) {
    console.warn(
      `[scheduler] auto-paused "${schedule.name}" after 5 consecutive turn-budget breaches (avg: ${newAvg} steps, cap: ${schedule.maxTurns})`,
    );
  }

  try {
    const [taskRow] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, taskId));
    if (taskRow) {
      const firedAtDate = taskRow.createdAt;
      const slotClaimedAt = taskRow.slotClaimedAt;
      const completedAt = taskRow.updatedAt;
      const slotWaitMs =
        slotClaimedAt && firedAtDate
          ? slotClaimedAt.getTime() - firedAtDate.getTime()
          : null;
      const durationMs =
        slotClaimedAt && completedAt
          ? completedAt.getTime() - slotClaimedAt.getTime()
          : null;

      await db.insert(scheduleFiringMetrics).values({
        id: crypto.randomUUID(),
        scheduleId,
        taskId,
        firedAt: firedAtDate,
        slotClaimedAt,
        completedAt,
        slotWaitMs,
        durationMs,
        turnCount: turns,
        maxTurnsAtFiring: schedule.maxTurns,
        eventLoopLagMs: null,
        peakRssMb: null,
        chatStreamsActive: null,
        concurrentSchedules: null,
        failureReason,
      });
    }
  } catch (err) {
    console.error(`[scheduler] failed to insert firing metrics for ${taskId}:`, err);
  }
}

/**
 * First-breach grace: if maxTurnsSetAt was recent enough that this is the
 * first-or-second firing after the edit, don't count the breach toward the
 * auto-pause streak.
 */
function shouldApplyGrace(
  maxTurnsSetAt: Date | null,
  cronExpression: string,
  completedAt: Date | null,
): boolean {
  if (!maxTurnsSetAt || !completedAt) return false;
  try {
    const t1 = computeNextFireTime(cronExpression, maxTurnsSetAt);
    const t2 = computeNextFireTime(cronExpression, t1);
    const cronIntervalMs = t2.getTime() - t1.getTime();
    const graceWindowEnd = new Date(
      maxTurnsSetAt.getTime() + GRACE_PERIOD_MULTIPLIER * cronIntervalMs,
    );
    return completedAt <= graceWindowEnd;
  } catch {
    return false;
  }
}

/**
 * Start the scheduler singleton. Safe to call multiple times — subsequent
 * calls are no-ops if already running.
 */
export function startScheduler(): void {
  if (intervalHandle !== null) return;

  // Bootstrap: recompute nextFireAt for any active schedules that are missing it
  bootstrapNextFireTimes();

  intervalHandle = setInterval(() => {
    tickScheduler().catch((err) => {
      console.error("[scheduler] tick error:", err);
    });
  }, POLL_INTERVAL_MS);

  console.log("[scheduler] started — polling every 60s");
}

/**
 * Stop the scheduler.
 */
export function stopScheduler(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("[scheduler] stopped");
  }
}

/**
 * Run one poll cycle: find due schedules and fire them.
 */
export async function tickScheduler(): Promise<void> {
  const now = new Date();

  // Reap any running tasks whose lease has expired before claiming new slots.
  try {
    const reaped = reapExpiredLeases();
    if (reaped.length > 0) {
      console.warn(
        `[scheduler] reaped ${reaped.length} expired lease(s): ${reaped.join(", ")}`,
      );
    }
  } catch (err) {
    console.error("[scheduler] lease reaper error:", err);
  }

  const dueSchedules = await db
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.status, "active"),
        lte(schedules.nextFireAt, now)
      )
    );

  // Chat soft pressure: defer new firings by N seconds when any chat stream
  // is in flight. In-flight scheduled runs are NOT affected — this only gates
  // new claims. Per-iteration try/catch so a single failed deferral doesn't
  // silently skip the remaining schedules in this tick.
  if (isAnyChatStreaming() && dueSchedules.length > 0) {
    const delayMs = getScheduleChatPressureDelaySec() * 1000;
    const deferredUntil = new Date(now.getTime() + delayMs);
    let deferredCount = 0;
    for (const schedule of dueSchedules) {
      try {
        await db
          .update(schedules)
          .set({ nextFireAt: deferredUntil, updatedAt: now })
          .where(eq(schedules.id, schedule.id));
        deferredCount++;
      } catch (err) {
        console.error(
          `[scheduler] failed to defer schedule ${schedule.id} under chat pressure:`,
          err,
        );
      }
    }
    console.warn(
      `[scheduler] chat streaming — deferred ${deferredCount}/${dueSchedules.length} firings by ${delayMs}ms`,
    );
    return;
  }

  for (const schedule of dueSchedules) {
    try {
      // Atomic claim: attempt to update nextFireAt to null as a lock.
      // Only the first tick to succeed (.changes > 0) proceeds with firing.
      const claimResult = db
        .update(schedules)
        .set({ nextFireAt: null, updatedAt: now })
        .where(
          and(
            eq(schedules.id, schedule.id),
            eq(schedules.status, "active"),
            lte(schedules.nextFireAt, now)
          )
        )
        .run();

      if (claimResult.changes === 0) {
        // Another tick already claimed this schedule
        continue;
      }

      // Branch on schedule type. App-manifest schedules (composite
      // `app:<appId>:<id>` rows registered by the pack installer) dispatch
      // their manifest blueprint instead of creating a prompt task.
      if (schedule.type === "heartbeat") {
        await fireHeartbeat(schedule, now);
      } else if (isAppScheduleId(schedule.id)) {
        await fireAppSchedule(schedule, now);
      } else {
        await fireSchedule(schedule, now);
      }
    } catch (err) {
      console.error(`[scheduler] failed to fire schedule ${schedule.id}:`, err);
    }
  }

  // Process pending agent handoffs
  try {
    await processHandoffs();
  } catch (err) {
    console.error("[scheduler] handoff processing error:", err);
  }

  // Resume delayed workflows whose resume_at has passed. Uses the partial index
  // idx_workflows_resume_at (WHERE resume_at IS NOT NULL) for efficiency.
  // resumeWorkflow is idempotent via atomic status transition, so even if the
  // scheduler tick races a user's "Resume Now" click, exactly one resume wins.
  try {
    const nowMs = now.getTime();
    const dueDelayedWorkflows = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(
        and(
          eq(workflows.status, "paused"),
          isNotNull(workflows.resumeAt),
          lte(workflows.resumeAt, nowMs),
        ),
      );

    for (const wf of dueDelayedWorkflows) {
      resumeWorkflow(wf.id).catch((err) => {
        console.error(`[scheduler] failed to resume workflow ${wf.id}:`, err);
      });
    }
  } catch (err) {
    console.error("[scheduler] delayed-workflow check error:", err);
  }

  // Reconcile answered checkpoint inputs that were persisted before a process
  // exit. Immediate response handling normally resumes these; this sweep is
  // the durable shadow path when that fire-and-forget continuation was lost.
  try {
    const pausedInteractions = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(
        and(
          eq(workflows.status, "paused"),
          isNull(workflows.resumeAt)
        )
      );
    for (const workflow of pausedInteractions) {
      resumeWorkflowInteraction(workflow.id).catch((error) => {
        console.error(
          `[scheduler] failed to reconcile workflow input ${workflow.id}:`,
          error
        );
      });
    }
  } catch (error) {
    console.error("[scheduler] workflow-input reconciliation error:", error);
  }
}

async function fireSchedule(
  schedule: typeof schedules.$inferSelect,
  now: Date
): Promise<void> {
  // Concurrency guard: skip if a child task from this schedule is still running.
  // Escape SQL LIKE metacharacters (%, _) in schedule name to prevent false matches.
  const escapedName = schedule.name
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  const runningChildren = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        sql`${tasks.title} LIKE ${`${escapedName} — firing #%`} ESCAPE '\\'`,
        inArray(tasks.status, ["queued", "running"])
      )
    );
  if (runningChildren.length > 0) {
    console.log(`[scheduler] skipping ${schedule.id} — previous firing still running`);
    return;
  }

  // Check expiry
  if (schedule.expiresAt && schedule.expiresAt <= now) {
    await db
      .update(schedules)
      .set({ status: "expired", updatedAt: now })
      .where(eq(schedules.id, schedule.id));
    return;
  }

  // Check max firings
  if (schedule.maxFirings && schedule.firingCount >= schedule.maxFirings) {
    await db
      .update(schedules)
      .set({ status: "expired", updatedAt: now })
      .where(eq(schedules.id, schedule.id));
    return;
  }

  const taskId = crypto.randomUUID();
  const firingNumber = schedule.firingCount + 1;
  const leaseSec = schedule.maxRunDurationSec ?? getScheduleMaxRunDurationSec();
  const budget = await beginScheduleBudgetRun({
    scheduleId: schedule.id,
    runId: taskId,
    claimTtlSec: leaseSec + 120,
    now,
  });
  if (budget.status === "blocked") return;
  if (budget.status === "busy") {
    await deferScheduleForBudgetClaim(schedule.id, budget.retryAt);
    console.warn(`[scheduler] deferred ${schedule.id} — ${budget.reason}`);
    return;
  }
  const budgetClaim = budget.claim;

  // Prepend turn-budget guidance so the agent can plan batched tool calls
  // instead of per-item loops that exhaust maxTurns mid-task.
  const budgetHeader = await buildTurnBudgetHeader();

  await db.insert(tasks).values({
    id: taskId,
    projectId: schedule.projectId,
    workflowId: null,
    scheduleId: schedule.id,
    title: `${schedule.name} — firing #${firingNumber}`,
    description: budgetHeader + schedule.prompt,
    status: "queued",
    assignedAgent: schedule.assignedAgent,
    agentProfile: schedule.agentProfile,
    priority: 2,
    sourceType: "scheduled",
    maxTurns: schedule.maxTurns, // per-schedule override, NULL = inherit global
    maxBudgetUsd: budgetClaim?.strictestPerRunUsd ?? null,
    successCriteriaSnapshot: schedule.successCriteria ?? "[]",
    createdAt: now,
    updatedAt: now,
  });

  // Link schedule's documents to the created task
  try {
    const schedDocs = await db
      .select({ documentId: scheduleDocumentInputs.documentId })
      .from(scheduleDocumentInputs)
      .where(eq(scheduleDocumentInputs.scheduleId, schedule.id));
    for (const { documentId } of schedDocs) {
      await db.update(documents)
        .set({ taskId, projectId: schedule.projectId, updatedAt: now })
        .where(eq(documents.id, documentId));
    }
  } catch (err) {
    console.error(`[scheduler] Document linking failed for schedule ${schedule.id}:`, err);
  }

  // Update schedule counters
  const isOneShot = !schedule.recurs;
  const reachedMax =
    schedule.maxFirings !== null && firingNumber >= schedule.maxFirings;

  const nextStatus = isOneShot
    ? "completed"
    : reachedMax
      ? "expired"
      : "active";

  const nextFireAt =
    nextStatus === "active"
      ? computeNextFireTime(schedule.cronExpression, now)
      : null;

  await db
    .update(schedules)
    .set({
      firingCount: firingNumber,
      lastFiredAt: now,
      nextFireAt,
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(schedules.id, schedule.id));

  // Atomic slot claim — if the global cap is full, leave the task in queued
  // state. The task will be picked up by drainQueue when a currently-running
  // task completes (its .then(drainQueue) chain runs the drain loop), OR by
  // the next tickScheduler pass up to POLL_INTERVAL_MS (60s) later — whichever
  // comes first. In a saturated-cap scenario where no running task completes
  // before the next poll, expect up to a 60s drain latency.
  const cap = getScheduleMaxConcurrent();
  const { claimed } = claimSlot(taskId, cap, leaseSec);

  if (!claimed) {
    await releaseScheduleBudgetRun(budgetClaim);
    console.warn(
      `[scheduler] schedule "${schedule.name}" queued — cap full (${countRunningScheduledSlots()}/${cap})`,
    );
    return;
  }

  // Drain-aware task execution. We still don't await in fireSchedule (the
  // poll loop must keep claiming other due schedules), but on completion we
  // record metrics and trigger drainQueue() so any tasks queued by colliding
  // schedules execute immediately instead of waiting for the next poll.
  startTaskExecution(taskId)
    .catch((err) => {
      console.error(
        `[scheduler] task execution failed for schedule ${schedule.id}, task ${taskId}:`,
        err
      );
    })
    .then(() => finalizeScheduleFiring(schedule.id, taskId, budgetClaim))
    .then(() => drainQueue().catch(() => {}));

  console.log(
    `[scheduler] fired schedule "${schedule.name}" → task ${taskId} (firing #${firingNumber})`
  );

  // Deliver to configured channels
  if (schedule.deliveryChannels) {
    try {
      const channelIds = JSON.parse(schedule.deliveryChannels) as string[];
      if (channelIds.length > 0) {
        const message: ChannelMessage = {
          subject: `Schedule fired: ${schedule.name} (#${firingNumber})`,
          body: `Task "${schedule.name} — firing #${firingNumber}" has been created and queued for execution.\n\nPrompt: ${schedule.prompt.slice(0, 500)}`,
          format: "text",
          metadata: { scheduleId: schedule.id, taskId, firingNumber },
        };
        sendToChannels(channelIds, message).catch((err) => {
          console.error(`[scheduler] channel delivery failed for schedule ${schedule.id}:`, err);
        });
      }
    } catch {
      // Invalid JSON in deliveryChannels — skip
    }
  }
}

/**
 * Fire an app-manifest schedule (composite `app:<appId>:<id>` row): resolve
 * the owning app's manifest, find this schedule's `runs` blueprint, and
 * dispatch it via the same instantiate→execute chokepoint as row triggers.
 *
 * The manifest stays the source of truth for WHAT runs — the DB row only
 * carries cadence + scheduler state — so a pack update that repoints `runs`
 * takes effect without a re-install of the schedule row.
 *
 * A schedule whose owning app (or manifest entry) is gone is paused, not
 * left to refire into nothing forever; the pause is surfaced via a
 * notification (Principle #1 — zero silent failures).
 *
 * App modules are dynamically imported at fire time, mirroring the
 * TDR-032 discipline used across the dispatch chain.
 */
async function fireAppSchedule(
  schedule: typeof schedules.$inferSelect,
  now: Date
): Promise<void> {
  // Expiry / max-firings — same lifecycle rules as fireSchedule.
  if (schedule.expiresAt && schedule.expiresAt <= now) {
    await db
      .update(schedules)
      .set({ status: "expired", updatedAt: now })
      .where(eq(schedules.id, schedule.id));
    return;
  }
  if (schedule.maxFirings && schedule.firingCount >= schedule.maxFirings) {
    await db
      .update(schedules)
      .set({ status: "expired", updatedAt: now })
      .where(eq(schedules.id, schedule.id));
    return;
  }

  const parsed = parseAppScheduleId(schedule.id);
  const { getApp } = await import("@/lib/apps/registry");
  const app = parsed ? getApp(parsed.appId) : null;
  const entry = app?.manifest.schedules.find((s) => s.id === schedule.id);
  const blueprintId = entry?.runs;

  if (!parsed || !blueprintId) {
    const reason = !parsed
      ? "its id could not be parsed"
      : !app
        ? `app "${parsed.appId}" is not installed`
        : `app "${parsed.appId}" no longer declares it`;
    console.error(
      `[scheduler] pausing app schedule "${schedule.id}" — ${reason}`
    );
    await db
      .update(schedules)
      .set({ status: "paused", updatedAt: now })
      .where(eq(schedules.id, schedule.id));
    try {
      await db.insert(notifications).values({
        id: crypto.randomUUID(),
        taskId: null,
        type: "task_failed",
        title: `App schedule paused: ${schedule.name}`,
        body: `Schedule "${schedule.id}" was paused because ${reason}. Re-install the pack to restore it.`,
        read: false,
        createdAt: now,
      });
    } catch (nerr) {
      console.error(`[scheduler] notification write failed:`, nerr);
    }
    return;
  }

  const budget = await beginScheduleBudgetRun({
    scheduleId: schedule.id,
    claimTtlSec:
      (schedule.maxRunDurationSec ?? getScheduleMaxRunDurationSec()) + 120,
    now,
  });
  if (budget.status === "blocked") return;
  if (budget.status === "busy") {
    await deferScheduleForBudgetClaim(schedule.id, budget.retryAt);
    console.warn(`[scheduler] deferred ${schedule.id} — ${budget.reason}`);
    return;
  }
  const budgetClaim = budget.claim;

  const { dispatchScheduledBlueprint } = await import(
    "@/lib/apps/manifest-trigger-dispatch"
  );
  const result = await dispatchScheduledBlueprint({
    appId: parsed.appId,
    blueprintId,
    scheduleId: schedule.id,
    maxBudgetUsd: budgetClaim?.strictestPerRunUsd ?? null,
  });

  if (!result) {
    await releaseScheduleBudgetRun(budgetClaim);
    const failureStreak = (schedule.failureStreak ?? 0) + 1;
    const shouldAutoPause = failureStreak >= 3 && schedule.status === "active";
    const nextFireAt =
      !shouldAutoPause && schedule.recurs
        ? computeNextFireTime(schedule.cronExpression, now)
        : null;

    await db
      .update(schedules)
      .set({
        failureStreak,
        lastFailureReason: "dispatch_failed",
        nextFireAt,
        status: shouldAutoPause ? "paused" : schedule.status,
        updatedAt: now,
      })
      .where(eq(schedules.id, schedule.id));

    console.error(
      `[scheduler] app schedule "${schedule.name}" failed to dispatch blueprint ${blueprintId}`
    );
    return;
  }

  // Update counters + compute the next fire (scheduleNextFire KPI reads this).
  const firingNumber = schedule.firingCount + 1;
  const isOneShot = !schedule.recurs;
  const reachedMax =
    schedule.maxFirings !== null && firingNumber >= schedule.maxFirings;
  const nextStatus = isOneShot
    ? "completed"
    : reachedMax
      ? "expired"
      : "active";
  const nextFireAt =
    nextStatus === "active"
      ? computeNextFireTime(schedule.cronExpression, now)
      : null;

  await db
    .update(schedules)
    .set({
      firingCount: firingNumber,
      lastFiredAt: now,
      nextFireAt,
      status: nextStatus,
      failureStreak: 0,
      lastFailureReason: null,
      updatedAt: now,
    })
    .where(eq(schedules.id, schedule.id));

  result.completion
    .catch((error) => {
      console.error(
        `[scheduler] app workflow ${result.workflowId} failed for schedule ${schedule.id}:`,
        error
      );
    })
    .then(() =>
      completeScheduleBudgetRun({
        claim: budgetClaim,
        workflowId: result.workflowId,
      })
    )
    .catch((error) => {
      console.error(
        `[scheduler] app budget reconciliation failed for workflow ${result.workflowId}:`,
        error
      );
    });

  console.log(
    `[scheduler] fired app schedule "${schedule.name}" → blueprint ${blueprintId} (firing #${firingNumber})`
  );
}

/**
 * Fire a heartbeat schedule: evaluate checklist, suppress or create action task.
 */
async function fireHeartbeat(
  schedule: typeof schedules.$inferSelect,
  now: Date
): Promise<void> {
  // 1. Active hours check
  const hoursResult = checkActiveHours(
    schedule.activeHoursStart,
    schedule.activeHoursEnd,
    schedule.activeTimezone,
    now
  );

  if (!hoursResult.isActive) {
    // Reschedule to the next active window or next cron fire (whichever is later)
    const nextCronFire = computeNextFireTime(schedule.cronExpression, now);
    const nextFire = hoursResult.nextActiveAt && hoursResult.nextActiveAt > nextCronFire
      ? hoursResult.nextActiveAt
      : nextCronFire;

    await db
      .update(schedules)
      .set({ nextFireAt: nextFire, updatedAt: now })
      .where(eq(schedules.id, schedule.id));

    console.log(`[scheduler] heartbeat "${schedule.name}" skipped — outside active hours`);
    return;
  }

  // 2. Daily budget check
  if (schedule.heartbeatBudgetPerDay !== null && schedule.heartbeatBudgetPerDay > 0) {
    // Reset daily budget if we've crossed into a new day
    const resetAt = schedule.heartbeatBudgetResetAt;
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    if (!resetAt || resetAt < startOfToday) {
      db.update(schedules)
        .set({
          heartbeatSpentToday: 0,
          heartbeatBudgetResetAt: startOfToday,
          updatedAt: now,
        })
        .where(eq(schedules.id, schedule.id))
        .run();
      // Reset the in-memory value for the check below
      schedule = { ...schedule, heartbeatSpentToday: 0 };
    }

    if (schedule.heartbeatSpentToday >= (schedule.heartbeatBudgetPerDay ?? Infinity)) {
      // Budget exhausted — skip and reschedule to tomorrow
      const nextFire = computeNextFireTime(schedule.cronExpression, now);
      await db
        .update(schedules)
        .set({ nextFireAt: nextFire, updatedAt: now })
        .where(eq(schedules.id, schedule.id));

      console.log(`[scheduler] heartbeat "${schedule.name}" paused — daily budget exhausted`);
      return;
    }
  }

  // 3. Parse checklist
  const checklist = parseChecklist(schedule.heartbeatChecklist);
  if (checklist.length === 0) {
    console.warn(`[scheduler] heartbeat "${schedule.name}" has empty checklist — skipping`);
    const nextFire = computeNextFireTime(schedule.cronExpression, now);
    await db
      .update(schedules)
      .set({ nextFireAt: nextFire, updatedAt: now })
      .where(eq(schedules.id, schedule.id));
    return;
  }

  // 4. Create evaluation task
  const evalTaskId = crypto.randomUUID();
  const firingNumber = schedule.firingCount + 1;
  const heartbeatDescription = buildHeartbeatPrompt(checklist, schedule.name);
  const budget = await beginScheduleBudgetRun({
    scheduleId: schedule.id,
    runId: evalTaskId,
    claimTtlSec:
      (schedule.maxRunDurationSec ?? getScheduleMaxRunDurationSec()) + 120,
    now,
  });
  if (budget.status === "blocked") return;
  if (budget.status === "busy") {
    await deferScheduleForBudgetClaim(schedule.id, budget.retryAt);
    console.warn(`[scheduler] deferred heartbeat ${schedule.id} — ${budget.reason}`);
    return;
  }
  const budgetClaim = budget.claim;

  await db.insert(tasks).values({
    id: evalTaskId,
    projectId: schedule.projectId,
    workflowId: null,
    scheduleId: schedule.id,
    title: `${schedule.name} — heartbeat #${firingNumber}`,
    description: heartbeatDescription,
    status: "queued",
    assignedAgent: schedule.assignedAgent,
    agentProfile: schedule.agentProfile,
    priority: 2,
    sourceType: "heartbeat",
    maxTurns: schedule.maxTurns, // per-schedule override, NULL = inherit global
    maxBudgetUsd: budgetClaim?.strictestPerRunUsd ?? null,
    successCriteriaSnapshot: schedule.successCriteria ?? "[]",
    createdAt: now,
    updatedAt: now,
  });

  // Link schedule's documents to the heartbeat task
  try {
    const schedDocs = await db
      .select({ documentId: scheduleDocumentInputs.documentId })
      .from(scheduleDocumentInputs)
      .where(eq(scheduleDocumentInputs.scheduleId, schedule.id));
    for (const { documentId } of schedDocs) {
      await db.update(documents)
        .set({ taskId: evalTaskId, projectId: schedule.projectId, updatedAt: now })
        .where(eq(documents.id, documentId));
    }
  } catch (err) {
    console.error(`[scheduler] Document linking failed for heartbeat ${schedule.id}:`, err);
  }

  // 5. Execute and wait for result (with timeout)
  try {
    await startTaskExecution(evalTaskId);
  } catch (err) {
    console.error(`[scheduler] heartbeat evaluation failed for "${schedule.name}":`, err);
  }

  // 6. Read the completed task result
  const [evalTask] = await db
    .select({ result: tasks.result, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.id, evalTaskId));

  const evaluation = evalTask?.result
    ? parseHeartbeatResponse(evalTask.result)
    : null;

  // Default to action_needed=true if we can't parse the response (fail-open)
  const actionNeeded = evaluation?.action_needed ?? true;

  // 7. Log the heartbeat evaluation
  const logId = crypto.randomUUID();
  const logPayload = actionNeeded
    ? `Heartbeat action needed: ${evaluation?.items?.filter((i) => i.status === "action_needed").map((i) => i.summary).join("; ") ?? "parse failed, defaulting to action"}`
    : `Heartbeat OK — all items normal (suppression #${schedule.suppressionCount + 1})`;

  db.insert(agentLogs)
    .values({
      id: logId,
      taskId: evalTaskId,
      agentType: "heartbeat",
      event: actionNeeded ? "heartbeat_action" : "heartbeat_suppressed",
      payload: logPayload,
      timestamp: now,
    })
    .run();

  // 8. Update schedule counters and compute next fire
  const nextFire = computeNextFireTime(schedule.cronExpression, now);

  if (actionNeeded) {
    // Action path: reset suppression, update lastActionAt
    await db
      .update(schedules)
      .set({
        firingCount: firingNumber,
        lastFiredAt: now,
        lastActionAt: now,
        suppressionCount: 0,
        nextFireAt: nextFire,
        updatedAt: now,
      })
      .where(eq(schedules.id, schedule.id));

    console.log(
      `[scheduler] heartbeat "${schedule.name}" → ACTION NEEDED → task ${evalTaskId} (firing #${firingNumber})`
    );
  } else {
    // Suppression path: increment counter, no action task
    await db
      .update(schedules)
      .set({
        firingCount: firingNumber,
        lastFiredAt: now,
        suppressionCount: schedule.suppressionCount + 1,
        nextFireAt: nextFire,
        updatedAt: now,
      })
      .where(eq(schedules.id, schedule.id));

    console.log(
      `[scheduler] heartbeat "${schedule.name}" → OK (suppression #${schedule.suppressionCount + 1})`
    );
  }

  // Reconcile after schedule counters/next fire are written so a pause action
  // is final and cannot be overwritten by normal heartbeat post-processing.
  finalizeScheduleFiring(schedule.id, evalTaskId, budgetClaim)
    .then(() => drainQueue().catch(() => {}));
}

/**
 * Recompute nextFireAt for active schedules that have it set to null.
 * Called once at startup to recover from unclean shutdowns.
 */
function bootstrapNextFireTimes(): void {
  const activeSchedules = db
    .select()
    .from(schedules)
    .where(eq(schedules.status, "active"))
    .all();

  const now = new Date();
  for (const schedule of activeSchedules) {
    if (!schedule.nextFireAt) {
      const nextFire = computeNextFireTime(schedule.cronExpression, now);
      db.update(schedules)
        .set({ nextFireAt: nextFire, updatedAt: now })
        .where(eq(schedules.id, schedule.id))
        .run();
    }
  }
}
