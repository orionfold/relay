import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workflows, tasks, documents, workflowReceiptRuns, projects } from "@/lib/db/schema";
import { eq, and, inArray, count, desc, getTableColumns, sql as drizzleSql } from "drizzle-orm";
import { parseWorkflowState } from "@/lib/workflows/engine";
import type {
  WorkflowStatusResponse,
  NonLoopPattern,
  StepWithState,
} from "@/lib/workflows/types";
import {
  ensureWorkflowReceipt,
  listWorkflowReceipts,
} from "@/lib/operations/receipts";

/** Collect output documents for workflow step tasks + input documents from parent task */
async function getWorkflowDocuments(
  state: { stepStates: Array<{ taskId?: string }> } | null,
  sourceTaskId?: string
) {
  const stepDocuments: Record<string, Array<{ id: string; originalName: string; mimeType: string; storagePath: string; direction: string }>> = {};
  const parentDocuments: Array<{ id: string; originalName: string; mimeType: string; storagePath: string; direction: string }> = [];

  try {
    // Collect step task IDs that have completed
    const stepTaskIds = (state?.stepStates ?? [])
      .map((s) => s.taskId)
      .filter((id): id is string => !!id);

    if (stepTaskIds.length > 0) {
      const outputDocs = await db
        .select({
          id: documents.id,
          taskId: documents.taskId,
          originalName: documents.originalName,
          mimeType: documents.mimeType,
          storagePath: documents.storagePath,
          direction: documents.direction,
        })
        .from(documents)
        .where(and(inArray(documents.taskId, stepTaskIds), eq(documents.direction, "output")));

      for (const doc of outputDocs) {
        if (!doc.taskId) continue;
        if (!stepDocuments[doc.taskId]) stepDocuments[doc.taskId] = [];
        stepDocuments[doc.taskId].push({
          id: doc.id,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          storagePath: doc.storagePath,
          direction: doc.direction,
        });
      }
    }

    // Parent task input documents
    if (sourceTaskId) {
      const inputDocs = await db
        .select({
          id: documents.id,
          originalName: documents.originalName,
          mimeType: documents.mimeType,
          storagePath: documents.storagePath,
          direction: documents.direction,
        })
        .from(documents)
        .where(and(eq(documents.taskId, sourceTaskId), eq(documents.direction, "input")));

      parentDocuments.push(...inputDocs);
    }
  } catch (error) {
    console.error("[workflow-status] Failed to query workflow documents:", error);
  }

  return { stepDocuments, parentDocuments };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [workflow] = await db
    .select({
      ...getTableColumns(workflows),
      projectName: projects.name,
    })
    .from(workflows)
    .leftJoin(projects, eq(workflows.projectId, projects.id))
    .where(eq(workflows.id, id));

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const runHistory = await db
    .select({
      runNumber: tasks.workflowRunNumber,
      taskCount: count(tasks.id),
      completedCount: drizzleSql<number>`SUM(CASE WHEN ${tasks.status} = 'completed' THEN 1 ELSE 0 END)`,
      failedCount: drizzleSql<number>`SUM(CASE WHEN ${tasks.status} = 'failed' THEN 1 ELSE 0 END)`,
    })
    .from(tasks)
    .where(eq(tasks.workflowId, id))
    .groupBy(tasks.workflowRunNumber)
    .orderBy(desc(tasks.workflowRunNumber));

  const [{ liveTaskCount = 0 } = { liveTaskCount: 0 }] = await db
    .select({ liveTaskCount: count(tasks.id) })
    .from(tasks)
    .where(
      and(
        eq(tasks.workflowId, id),
        inArray(tasks.status, ["running", "queued"])
      )
    );

  const { definition, state, loopState } = parseWorkflowState(workflow.definition);
  const sourceTaskId: string | undefined = definition.sourceTaskId;
  const { stepDocuments, parentDocuments } = await getWorkflowDocuments(state, sourceTaskId);
  const receiptReconciliationErrors: string[] = [];
  const recentReceiptRuns = await db
    .select({
      runNumber: workflowReceiptRuns.runNumber,
      terminalStatus: workflowReceiptRuns.terminalStatus,
    })
    .from(workflowReceiptRuns)
    .where(eq(workflowReceiptRuns.workflowId, workflow.id))
    .orderBy(desc(workflowReceiptRuns.runNumber))
    .limit(20);
  for (const receiptRun of recentReceiptRuns) {
    const isCurrentTerminal =
      receiptRun.runNumber === workflow.runNumber &&
      (workflow.status === "completed" || workflow.status === "failed");
    if (!receiptRun.terminalStatus && !isCurrentTerminal) continue;
    try {
      await ensureWorkflowReceipt(workflow.id, receiptRun.runNumber);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[workflow-status] receipt reconciliation failed for ${workflow.id} run ${receiptRun.runNumber}:`,
        error
      );
      receiptReconciliationErrors.push(message);
    }
  }
  const receipts = await listWorkflowReceipts(workflow.id);

  // Loop pattern returns loop-specific data instead of step states.
  // The `satisfies` annotation enforces the TDR-031 contract: the loop arm
  // of WorkflowStatusResponse cannot emit `workflowState` or `resumeAt`, and
  // its `steps` field is raw WorkflowStep[] (not StepWithState[]).
  if (definition.pattern === "loop") {
    const loopBody = {
      id: workflow.id,
      name: workflow.name,
      status: workflow.status,
      projectId: workflow.projectId,
      projectName: workflow.projectName,
      definition: workflow.definition,
      pattern: "loop" as const,
      loopConfig: definition.loopConfig,
      swarmConfig: definition.swarmConfig,
      loopState,
      liveTaskCount,
      steps: definition.steps,
      stepDocuments,
      parentDocuments,
      runNumber: workflow.runNumber,
      runHistory,
      receipts,
      receiptReconciliationErrors,
    } satisfies WorkflowStatusResponse;
    return NextResponse.json(loopBody);
  }

  // Non-loop arm: sequence, parallel, swarm, planner-executor, checkpoint all
  // share the step-state rendering path. `satisfies` enforces that this branch
  // cannot accidentally emit `loopState`, and that every step has `.state`.
  const nonLoopBody = {
    id: workflow.id,
    name: workflow.name,
    status: workflow.status,
    resumeAt: workflow.resumeAt ?? null,
    projectId: workflow.projectId,
    projectName: workflow.projectName,
    definition: workflow.definition,
    pattern: definition.pattern as NonLoopPattern,
    swarmConfig: definition.swarmConfig,
    steps: definition.steps.map((step, i): StepWithState => ({
      ...step,
      state: state?.stepStates[i] ?? { stepId: step.id, status: "pending" },
    })),
    workflowState: state,
    liveTaskCount,
    stepDocuments,
    parentDocuments,
    runNumber: workflow.runNumber,
    runHistory,
    receipts,
    receiptReconciliationErrors,
  } satisfies WorkflowStatusResponse;
  return NextResponse.json(nonLoopBody);
}
