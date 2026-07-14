import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workflows, tasks, workflowReceiptRuns } from "@/lib/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { executeWorkflow } from "@/lib/workflows/engine";
import type { WorkflowDefinition } from "@/lib/workflows/types";

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

  // Check if genuinely running vs crashed "active" state
  if (workflow.status === "active") {
    const liveTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.workflowId, id),
          inArray(tasks.status, ["running", "queued"])
        )
      );

    if (liveTasks.length > 0) {
      return NextResponse.json(
        { error: "Workflow is already running" },
        { status: 409 }
      );
    }
    // Crashed "active" with 0 live tasks — fall through to re-execution
  }

  // Re-run: comprehensive reset for completed, failed, or crashed-active workflows
  if (
    workflow.status === "completed" ||
    workflow.status === "failed" ||
    workflow.status === "active" // crashed recovery
  ) {
    try {
      if (workflow.status === "completed" || workflow.status === "failed") {
        db.update(workflowReceiptRuns)
          .set({
            terminalStatus: workflow.status,
            finishedAt: workflow.updatedAt,
          })
          .where(
            and(
              eq(workflowReceiptRuns.workflowId, id),
              eq(workflowReceiptRuns.runNumber, workflow.runNumber)
            )
          )
          .run();
      }

      // 1. Cancel orphaned tasks (running/queued from previous execution)
      await db
        .update(tasks)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(
            eq(tasks.workflowId, id),
            inArray(tasks.status, ["running", "queued"])
          )
        );

      // 2. Clear execution state from definition
      const def = JSON.parse(workflow.definition) as WorkflowDefinition & {
        _state?: unknown;
        _loopState?: unknown;
      };
      delete def._state;
      delete def._loopState;

      // 3. Reset to draft
      await db
        .update(workflows)
        .set({
          definition: JSON.stringify(def),
          status: "draft",
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, id));
    } catch {
      return NextResponse.json(
        { error: "Failed to reset workflow state" },
        { status: 500 }
      );
    }
  }

  // Atomic claim: transition to "active" only if still in draft state.
  // Prevents concurrent double-execution from parallel requests.
  const claimedAt = new Date();
  const claimedRunNumber = workflow.runNumber + 1;
  const criteriaSnapshot = workflow.successCriteria ?? "[]";
  const claimResult = db.transaction((tx) => {
    const result = tx
      .update(workflows)
      .set({
        status: "active",
        runNumber: sql`${workflows.runNumber} + 1`,
        successCriteriaRunSnapshot: criteriaSnapshot,
        updatedAt: claimedAt,
      })
      .where(
        and(
          eq(workflows.id, id),
          eq(workflows.status, "draft")
        )
      )
      .run();

    if (result.changes === 1) {
      tx.insert(workflowReceiptRuns)
        .values({
          id: crypto.randomUUID(),
          workflowId: id,
          runNumber: claimedRunNumber,
          criteriaSnapshot,
          terminalStatus: null,
          startedAt: claimedAt,
          finishedAt: null,
        })
        .run();
    }
    return result;
  });

  if (claimResult.changes === 0) {
    return NextResponse.json(
      { error: "Workflow is already running" },
      { status: 409 }
    );
  }

  // Fire-and-forget execution
  executeWorkflow(id).catch((error) => {
    console.error(`Workflow ${id} execution failed:`, error);
  });

  return NextResponse.json({ status: "started", workflowId: id }, { status: 202 });
}
