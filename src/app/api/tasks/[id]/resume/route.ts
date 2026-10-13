import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { MAX_RESUME_COUNT } from "@/lib/constants/task-status";
import {
  BudgetLimitExceededError,
  enforceTaskBudgetGuardrails,
} from "@/lib/settings/budget-guardrails";
import { resolveResumeExecutionTarget } from "@/lib/agents/runtime/execution-target";
import { resumeTaskExecution } from "@/lib/agents/task-dispatch";
import {
  claimTaskSlot,
  countRunningTaskSlots,
  getTaskMaxConcurrent,
} from "@/lib/agents/task-slots";

/**
 * Resume a failed or cancelled task from its session.
 *
 * A resume is an on-demand run and honors the same cap as a manual execute.
 * Over the cap the task is parked as `queued` and answers `202` with
 * `state: "queued"`; the dispatcher resumes it when its turn comes.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Check task exists and has a session
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!task.sessionId) {
    return NextResponse.json(
      { error: "No session to resume — use Retry instead" },
      { status: 400 }
    );
  }

  if (task.resumeCount >= MAX_RESUME_COUNT) {
    return NextResponse.json(
      { error: "Resume limit reached. Re-queue for fresh start." },
      { status: 400 }
    );
  }

  try {
    await enforceTaskBudgetGuardrails(id, { isResume: true });
  } catch (error) {
    if (error instanceof BudgetLimitExceededError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    throw error;
  }

  // Atomic claim: failed/cancelled → running, inside the on-demand cap.
  const claimed = claimTaskSlot(id, { from: ["failed", "cancelled"] });

  if (!claimed) {
    const current = db
      .select({ status: tasks.status })
      .from(tasks)
      .where(eq(tasks.id, id))
      .get();
    if (current?.status !== "failed" && current?.status !== "cancelled") {
      return NextResponse.json(
        {
          error: `Task must be failed or cancelled to resume, current status: ${task.status}`,
        },
        { status: 400 }
      );
    }
    // Still resumable, so the refusal was the cap. The dispatcher parks the row
    // as queued and resumes it when a slot frees.
  }

  try {
    await resolveResumeExecutionTarget({
      requestedRuntimeId: task.assignedAgent,
      effectiveRuntimeId: task.effectiveRuntimeId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    db.update(tasks)
      .set({
        status: "failed",
        result: message,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, id))
      .run();
    return NextResponse.json({ error: message }, { status: 400 });
  }

  // Fire-and-forget
  resumeTaskExecution(id, {
    requestedRuntimeId: task.assignedAgent,
    effectiveRuntimeId: task.effectiveRuntimeId,
  }).catch((err) =>
    console.error(`Task ${id} resume error:`, err)
  );

  if (!claimed) {
    const cap = getTaskMaxConcurrent();
    return NextResponse.json(
      {
        message: `Resume queued — ${countRunningTaskSlots()}/${cap} on-demand runs in flight. It resumes when a slot frees.`,
        state: "queued",
        taskId: id,
        cap,
      },
      { status: 202 }
    );
  }

  return NextResponse.json(
    { message: "Resume started", state: "running", taskId: id },
    { status: 202 }
  );
}
