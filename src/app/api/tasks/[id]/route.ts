import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  tasks,
  projects,
  workflows,
  schedules,
  usageLedger,
  documents,
  agentLogs,
  notifications,
  agentMessages,
  agentMemory,
  learnedContext,
  taskTableInputs,
  scheduleFiringMetrics,
} from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { getTaskUsageSummary } from "@/lib/usage/task-summary";
import { updateTaskSchema } from "@/lib/validators/task";
import { isValidTransition, type TaskStatus } from "@/lib/constants/task-status";
import { validateRuntimeProfileAssignment } from "@/lib/agents/profiles/assignment-validation";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Join relationship names
  let projectName: string | undefined;
  let workflowName: string | undefined;
  let scheduleName: string | undefined;

  if (task.projectId) {
    const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, task.projectId));
    projectName = p?.name;
  }
  if (task.workflowId) {
    const [w] = await db.select({ name: workflows.name }).from(workflows).where(eq(workflows.id, task.workflowId));
    workflowName = w?.name;
  }
  if (task.scheduleId) {
    const [s] = await db.select({ name: schedules.name }).from(schedules).where(eq(schedules.id, task.scheduleId));
    scheduleName = s?.name;
  }

  const usage = await getTaskUsageSummary(id);

  return NextResponse.json({
    ...task,
    projectName,
    workflowName,
    scheduleName,
    usage,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const compatibilityError = validateRuntimeProfileAssignment({
    profileId:
      parsed.data.agentProfile !== undefined
        ? parsed.data.agentProfile
        : existing.agentProfile,
    runtimeId:
      parsed.data.assignedAgent !== undefined
        ? parsed.data.assignedAgent
        : existing.assignedAgent,
    context: "Task profile",
  });
  if (compatibilityError) {
    return NextResponse.json({ error: compatibilityError }, { status: 400 });
  }

  // Validate status transitions
  if (parsed.data.status && parsed.data.status !== existing.status) {
    if (!isValidTransition(existing.status as TaskStatus, parsed.data.status as TaskStatus)) {
      return NextResponse.json(
        { error: `Invalid transition from ${existing.status} to ${parsed.data.status}` },
        { status: 400 }
      );
    }
  }

  // Extract documentIds before spreading into task update (not a task column)
  const { documentIds, ...taskFields } = parsed.data;
  const now = new Date();

  await db
    .update(tasks)
    .set({ ...taskFields, updatedAt: now })
    .where(eq(tasks.id, id));

  // Handle document linking/unlinking
  if (documentIds !== undefined) {
    try {
      // Unlink documents previously linked to this task that are no longer selected
      const currentDocs = await db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.taskId, id));
      const newDocSet = new Set(documentIds);
      for (const doc of currentDocs) {
        if (!newDocSet.has(doc.id)) {
          await db.update(documents)
            .set({ taskId: null, updatedAt: now })
            .where(eq(documents.id, doc.id));
        }
      }
      // Link newly selected documents
      for (const docId of documentIds) {
        await db.update(documents)
          .set({
            taskId: id,
            projectId: existing.projectId,
            updatedAt: now,
          })
          .where(eq(documents.id, docId));
      }
    } catch (err) {
      console.error("[tasks] Document association failed:", err);
    }
  }

  const [updated] = await db.select().from(tasks).where(eq(tasks.id, id));
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [existing] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Foreign keys are enforced (db/index.ts: `foreign_keys = ON`) and NO table
  // declares `onDelete: cascade`, so a bare `db.delete(tasks)` throws a SQLite
  // FOREIGN KEY constraint failure the moment the task has ANY child row. A task
  // that reached `failed` (or any executed state) always has agentLogs +
  // usageLedger rows, so the delete reliably 500s — the exact symptom of #46
  // (modal delete looks dead) and #51 (card delete toasts "Failed to delete").
  //
  // Clean up every referencing row in one transaction, children before parent.
  // Execution artifacts (logs, usage, notifications, messages, table inputs,
  // firing metrics) are meaningless without their task → delete. User-facing or
  // derived rows that can outlive the task → null the back-reference instead:
  //   - documents: a user's uploaded/generated file must survive task deletion.
  //   - learnedContext / agentMemory: derived knowledge keeps standalone value.
  // (taskTableInputs.taskId is NOT NULL, so it must be deleted, not nulled.)
  // better-sqlite3 is synchronous, so Drizzle's transaction callback must be
  // synchronous too (an async callback throws "Transaction function cannot
  // return a promise"). Each statement ends in `.run()`; FK checks fire per
  // statement, so children are deleted before the parent.
  try {
    db.transaction((tx) => {
      tx.delete(agentLogs).where(eq(agentLogs.taskId, id)).run();
      tx.delete(usageLedger).where(eq(usageLedger.taskId, id)).run();
      tx.delete(notifications).where(eq(notifications.taskId, id)).run();
      tx
        .delete(agentMessages)
        .where(
          or(eq(agentMessages.taskId, id), eq(agentMessages.targetTaskId, id)),
        )
        .run();
      tx.delete(taskTableInputs).where(eq(taskTableInputs.taskId, id)).run();
      tx
        .delete(scheduleFiringMetrics)
        .where(eq(scheduleFiringMetrics.taskId, id))
        .run();

      tx
        .update(documents)
        .set({ taskId: null })
        .where(eq(documents.taskId, id))
        .run();
      tx
        .update(learnedContext)
        .set({ sourceTaskId: null })
        .where(eq(learnedContext.sourceTaskId, id))
        .run();
      tx
        .update(agentMemory)
        .set({ sourceTaskId: null })
        .where(eq(agentMemory.sourceTaskId, id))
        .run();

      tx.delete(tasks).where(eq(tasks.id, id)).run();
    });
  } catch (err) {
    // Zero silent failures (engineering principle #1): surface the real reason
    // instead of an opaque 500 so the client toast + logs are actionable.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[tasks] delete failed:", message);
    return NextResponse.json(
      { error: `Failed to delete task: ${message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
