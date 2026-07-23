import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  documents,
  notifications,
  operationsReceipts,
  schedules,
  tasks,
  workflowReceiptRuns,
  workflows,
} from "@/lib/db/schema";
import {
  OperationsCriteriaValidationError,
  parseStoredSuccessCriteria,
  type SuccessCriteria,
} from "./criteria";
import {
  evaluateOperationsReceipt,
  type OperationsCriterionEvidence,
  type OperationsReceiptEvaluation,
} from "./evaluate";
import { extractWorkflowTerminalResult } from "./workflow-result";

const TERMINAL_TASK_STATUSES = new Set(["completed", "failed", "cancelled"]);

export class OperationsReceiptSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperationsReceiptSourceError";
  }
}

export interface OperationsReceiptView {
  id: string;
  sourceKey: string;
  ownerType: "schedule" | "workflow";
  scheduleId: string | null;
  workflowId: string | null;
  taskId: string | null;
  workflowRunNumber: number | null;
  verdict: "passed" | "at_risk" | "failed";
  criteriaSnapshot: SuccessCriteria;
  evidence: OperationsCriterionEvidence[] | Array<Record<string, unknown>>;
  summary: string;
  nextAction: string;
  startedAt: Date | null;
  finishedAt: Date;
  createdAt: Date;
}

function decodeJsonArray(value: string): {
  items: unknown[];
  error: "invalid_json" | "not_an_array" | null;
} {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? { items: parsed, error: null }
      : { items: [], error: "not_an_array" };
  } catch {
    return { items: [], error: "invalid_json" };
  }
}

function toView(
  row: typeof operationsReceipts.$inferSelect
): OperationsReceiptView {
  const criteria = decodeJsonArray(row.criteriaSnapshot);
  const evidence = decodeJsonArray(row.evidence);
  const corruptFields = [
    criteria.error ? "criteria_snapshot" : null,
    evidence.error ? "evidence" : null,
  ].filter((field): field is string => field !== null);

  if (corruptFields.length > 0) {
    console.error(
      `[operations-receipt] receipt ${row.id} has corrupt ${corruptFields.join(", ")}`
    );
    return {
      ...row,
      verdict: "at_risk",
      criteriaSnapshot: criteria.items as SuccessCriteria,
      evidence: [
        ...(evidence.items as Array<Record<string, unknown>>),
        {
          criterionId: "receipt-storage-error",
          label: "Stored receipt evidence",
          status: "missing",
          detail: `receipt_storage_error: ${corruptFields.join(", ")} could not be decoded.`,
        },
      ],
      summary: "Stored receipt evidence could not be fully decoded.",
      nextAction: "Check database integrity and recreate the receipt from its source run.",
    };
  }

  return {
    ...row,
    criteriaSnapshot: criteria.items as SuccessCriteria,
    evidence: evidence.items as OperationsReceiptView["evidence"],
  };
}

function evaluationFailure(
  error: unknown
): OperationsReceiptEvaluation {
  const message =
    error instanceof Error ? error.message : String(error);
  return {
    verdict: "at_risk",
    evidence: [
      {
        criterionId: "evaluation-error",
        label: "Receipt evaluation",
        level: "required",
        check: "status_is",
        expected: "completed",
        actual: null,
        status: "missing",
        detail: `evaluation_error: ${message.slice(0, 500)}`,
      },
    ],
    summary: "Receipt evaluation could not use the configured success criteria.",
    nextAction: "Review and repair the operation's success criteria.",
  };
}

function readCriteria(
  stored: string | null
): { criteria: SuccessCriteria; evaluationError: OperationsReceiptEvaluation | null } {
  try {
    return {
      criteria: parseStoredSuccessCriteria(stored),
      evaluationError: null,
    };
  } catch (error) {
    if (!(error instanceof OperationsCriteriaValidationError)) throw error;
    return { criteria: [], evaluationError: evaluationFailure(error) };
  }
}

async function insertReceipt(
  values: typeof operationsReceipts.$inferInsert
): Promise<OperationsReceiptView> {
  await db
    .insert(operationsReceipts)
    .values(values)
    .onConflictDoUpdate({
      target: operationsReceipts.sourceKey,
      set: {
        verdict: values.verdict,
        evidence: values.evidence,
        summary: values.summary,
        nextAction: values.nextAction,
        startedAt: values.startedAt,
        finishedAt: values.finishedAt,
      },
    });

  const [row] = await db
    .select()
    .from(operationsReceipts)
    .where(eq(operationsReceipts.sourceKey, values.sourceKey));
  if (!row) {
    throw new OperationsReceiptSourceError(
      `Receipt ${values.sourceKey} was not persisted`
    );
  }
  return toView(row);
}

function durationSeconds(startedAt: Date | null, finishedAt: Date): number | null {
  if (!startedAt) return null;
  return Math.max(
    0,
    Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000)
  );
}

export async function ensureScheduleReceipt(
  taskId: string
): Promise<OperationsReceiptView> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!task) {
    throw new OperationsReceiptSourceError(`Schedule task ${taskId} was not found`);
  }
  if (!task.scheduleId) {
    throw new OperationsReceiptSourceError(
      `Task ${taskId} is not linked to a schedule`
    );
  }
  if (!TERMINAL_TASK_STATUSES.has(task.status)) {
    throw new OperationsReceiptSourceError(
      `Schedule task ${taskId} is not terminal (${task.status})`
    );
  }

  const sourceKey = `schedule:${task.scheduleId}:task:${task.id}`;
  const [schedule] = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, task.scheduleId));
  if (!schedule) {
    throw new OperationsReceiptSourceError(
      `Schedule ${task.scheduleId} was not found for task ${task.id}`
    );
  }

  const [{ value: outputCount = 0 } = { value: 0 }] = await db
    .select({ value: count(documents.id) })
    .from(documents)
    .where(
      and(eq(documents.taskId, task.id), eq(documents.direction, "output"))
    );

  if (task.successCriteriaSnapshot === null) {
    throw new OperationsReceiptSourceError(
      `Schedule task ${taskId} has no run criteria snapshot (pre-feature run)`
    );
  }
  const { criteria, evaluationError } = readCriteria(
    task.successCriteriaSnapshot
  );
  const startedAt = task.slotClaimedAt ?? task.createdAt;
  const finishedAt = task.updatedAt;
  const evaluation =
    evaluationError ??
    evaluateOperationsReceipt(criteria, {
      status: task.status,
      result: task.result,
      outputCount: Number(outputCount),
      durationSeconds: durationSeconds(startedAt, finishedAt),
    });

  return insertReceipt({
    id: crypto.randomUUID(),
    sourceKey,
    ownerType: "schedule",
    scheduleId: schedule.id,
    workflowId: null,
    taskId: task.id,
    workflowRunNumber: null,
    verdict: evaluation.verdict,
    criteriaSnapshot: JSON.stringify(criteria),
    evidence: JSON.stringify(evaluation.evidence),
    summary: evaluation.summary,
    nextAction: evaluation.nextAction,
    startedAt,
    finishedAt,
    createdAt: new Date(),
  });
}

export async function ensureWorkflowReceipt(
  workflowId: string,
  requestedRunNumber?: number
): Promise<OperationsReceiptView> {
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, workflowId));
  if (!workflow) {
    throw new OperationsReceiptSourceError(`Workflow ${workflowId} was not found`);
  }

  const runNumber = requestedRunNumber ?? workflow.runNumber;
  if (runNumber < 1) {
    throw new OperationsReceiptSourceError(
      `Workflow ${workflowId} has no terminal run number`
    );
  }
  const sourceKey = `workflow:${workflowId}:run:${runNumber}`;
  const [runMarker] = await db
    .select()
    .from(workflowReceiptRuns)
    .where(
      and(
        eq(workflowReceiptRuns.workflowId, workflowId),
        eq(workflowReceiptRuns.runNumber, runNumber)
      )
    );
  if (!runMarker) {
    throw new OperationsReceiptSourceError(
      `Workflow ${workflowId} run ${runNumber} has no receipt-run marker (pre-feature run)`
    );
  }

  const runTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.workflowId, workflowId),
        eq(tasks.workflowRunNumber, runNumber)
      )
    )
    .orderBy(asc(tasks.createdAt));

  const currentRun = runNumber === workflow.runNumber;
  const hasFailedTask = runTasks.some(
    (task) => task.status === "failed" || task.status === "cancelled"
  );
  const markerStatus = currentRun &&
    (workflow.status === "completed" || workflow.status === "failed")
      ? workflow.status
      : runMarker.terminalStatus;
  // The terminal workflow/run marker describes the outcome after all retry
  // attempts. Exact-step recovery intentionally retains the failed attempt and
  // creates a new task in the same run, so an old failed task must not override
  // a later authoritative Completed transition.
  const status =
    markerStatus ??
    (hasFailedTask
      ? "failed"
      : runTasks.length > 0 &&
          runTasks.every((task) => task.status === "completed")
        ? "completed"
        : "active");
  if (status !== "completed" && status !== "failed") {
    throw new OperationsReceiptSourceError(
      `Workflow ${workflowId} run ${runNumber} is not terminal (${status})`
    );
  }

  const taskIds = runTasks.map((task) => task.id);
  let outputCount = 0;
  if (taskIds.length > 0) {
    const { inArray } = await import("drizzle-orm");
    const [row] = await db
      .select({ value: count(documents.id) })
      .from(documents)
      .where(
        and(inArray(documents.taskId, taskIds), eq(documents.direction, "output"))
      );
    outputCount = Number(row?.value ?? 0);
  }

  const startedAt = runTasks[0]?.createdAt ?? runMarker.startedAt;
  const finishedAt =
    runTasks.reduce<Date | null>((latest, task) => {
      if (!latest || task.updatedAt > latest) return task.updatedAt;
      return latest;
    }, null) ?? runMarker.finishedAt ?? workflow.updatedAt;
  const result = extractWorkflowTerminalResult(
    currentRun ? workflow.definition : "",
    runTasks.map((task) => task.result)
  );
  const { criteria, evaluationError } = readCriteria(
    runMarker.criteriaSnapshot
  );

  await db
    .update(workflowReceiptRuns)
    .set({ terminalStatus: status, finishedAt })
    .where(eq(workflowReceiptRuns.id, runMarker.id));
  const evaluation =
    evaluationError ??
    evaluateOperationsReceipt(criteria, {
      status,
      result,
      outputCount,
      durationSeconds: durationSeconds(startedAt, finishedAt),
    });

  return insertReceipt({
    id: crypto.randomUUID(),
    sourceKey,
    ownerType: "workflow",
    scheduleId: null,
    workflowId: workflow.id,
    taskId: null,
    workflowRunNumber: runNumber,
    verdict: evaluation.verdict,
    criteriaSnapshot: JSON.stringify(criteria),
    evidence: JSON.stringify(evaluation.evidence),
    summary: evaluation.summary,
    nextAction: evaluation.nextAction,
    startedAt,
    finishedAt,
    createdAt: new Date(),
  });
}

export async function listScheduleReceipts(
  scheduleId: string,
  limit = 20
): Promise<OperationsReceiptView[]> {
  const rows = await db
    .select()
    .from(operationsReceipts)
    .where(eq(operationsReceipts.scheduleId, scheduleId))
    .orderBy(desc(operationsReceipts.finishedAt))
    .limit(limit);
  return rows.map(toView);
}

export async function listWorkflowReceipts(
  workflowId: string,
  limit = 20
): Promise<OperationsReceiptView[]> {
  const rows = await db
    .select()
    .from(operationsReceipts)
    .where(eq(operationsReceipts.workflowId, workflowId))
    .orderBy(desc(operationsReceipts.finishedAt))
    .limit(limit);
  return rows.map(toView);
}

export async function reportOperationsReceiptFailure(input: {
  ownerType: "schedule" | "workflow";
  ownerId: string;
  taskId?: string | null;
  error: unknown;
}): Promise<void> {
  const detail = input.error instanceof Error
    ? `${input.error.name}: ${input.error.message}`
    : String(input.error);
  console.error(
    `[operations-receipt] ${input.ownerType} ${input.ownerId} receipt failed:`,
    input.error
  );
  try {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      taskId: input.taskId ?? null,
      type: "task_failed",
      title: "Operations Receipt could not be recorded",
      body: `${input.ownerType} ${input.ownerId}: ${detail.slice(0, 500)}. Open the operation detail to retry reconciliation.`,
      read: false,
      createdAt: new Date(),
    });
  } catch (notificationError) {
    console.error(
      "[operations-receipt] failure notification could not be recorded:",
      notificationError
    );
  }
}
