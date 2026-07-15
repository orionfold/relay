import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, workflows } from "@/lib/db/schema";
import { cancelTaskWithRuntime } from "@/lib/agents/runtime";
import type { WorkflowDefinition, WorkflowState } from "@/lib/workflows/types";
import {
  ensureWorkflowReceipt,
  reportOperationsReceiptFailure,
} from "@/lib/operations/receipts";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id));

  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const liveTasks = await db
    .select({
      id: tasks.id,
      status: tasks.status,
      assignedAgent: tasks.assignedAgent,
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.workflowId, id),
        inArray(tasks.status, ["running", "queued"])
      )
    );

  if (workflow.status !== "active" && liveTasks.length === 0) {
    return NextResponse.json(
      { error: `Workflow is not running (current status: ${workflow.status})` },
      { status: 409 }
    );
  }

  const cancelledTaskIds = new Set<string>();
  const failedCancellations: Array<{ taskId: string; error: string }> = [];
  for (const task of liveTasks) {
    try {
      if (task.status === "running") {
        await cancelTaskWithRuntime(task.id, task.assignedAgent);
      }
      await db
        .update(tasks)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(tasks.id, task.id));
      cancelledTaskIds.add(task.id);
    } catch (error) {
      failedCancellations.push({
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (failedCancellations.length > 0) {
    return NextResponse.json(
      {
        error: "One or more workflow tasks could not be cancelled",
        code: "WORKFLOW_CANCELLATION_FAILED",
        failedCancellations,
        cancelledTasks: cancelledTaskIds.size,
      },
      { status: 409 }
    );
  }

  let definition: (WorkflowDefinition & { _state?: WorkflowState; _loopState?: unknown }) | null = null;

  try {
    definition = JSON.parse(workflow.definition) as WorkflowDefinition & {
      _state?: WorkflowState;
      _loopState?: unknown;
    };
    if (definition._state) {
      definition._state.status = "failed";
      definition._state.completedAt = new Date().toISOString();
      definition._state.stepStates = definition._state.stepStates.map((step) => {
        if (
          step.status === "running" ||
          step.status === "waiting_approval" ||
          (step.taskId && cancelledTaskIds.has(step.taskId))
        ) {
          return {
            ...step,
            status: "failed",
            error: "Workflow stopped by user",
            completedAt: new Date().toISOString(),
          };
        }
        return step;
      });
    }
    if (definition._loopState && typeof definition._loopState === "object") {
      definition._loopState = {
        ...definition._loopState,
        status: "failed",
        stopReason: "human_cancel",
        completedAt: new Date().toISOString(),
      };
    }
  } catch {
    await db
      .update(workflows)
      .set({ status: "failed", resumeAt: null, updatedAt: new Date() })
      .where(eq(workflows.id, id));
    return NextResponse.json(
      {
        error: "Failed to parse workflow state after cancelling its tasks",
        code: "WORKFLOW_STATE_INVALID",
      },
      { status: 500 }
    );
  }

  await db
    .update(workflows)
    .set({
      definition: JSON.stringify(definition),
      status: "failed",
      resumeAt: null,
      updatedAt: new Date(),
    })
    .where(eq(workflows.id, id));

  try {
    await ensureWorkflowReceipt(id, workflow.runNumber);
  } catch (error) {
    await reportOperationsReceiptFailure({
      ownerType: "workflow",
      ownerId: id,
      error,
    });
  }

  return NextResponse.json({
    status: "stopped",
    workflowId: id,
    cancelledTasks: cancelledTaskIds.size,
  });
}
