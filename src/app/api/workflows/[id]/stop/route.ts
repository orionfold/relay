import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, workflows } from "@/lib/db/schema";
import { cancelTaskWithRuntime } from "@/lib/agents/runtime";
import type { WorkflowDefinition, WorkflowState } from "@/lib/workflows/types";

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

  for (const task of liveTasks) {
    if (task.status === "running") {
      await cancelTaskWithRuntime(task.id, task.assignedAgent);
    } else {
      await db
        .update(tasks)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(tasks.id, task.id));
    }
  }

  const cancelledTaskIds = new Set(liveTasks.map((task) => task.id));
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
    return NextResponse.json(
      { error: "Failed to parse workflow state" },
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

  return NextResponse.json({
    status: "stopped",
    workflowId: id,
    cancelledTasks: liveTasks.length,
  });
}
