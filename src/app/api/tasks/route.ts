import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks, documents } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createTaskSchema } from "@/lib/validators/task";
import { processDocument } from "@/lib/documents/processor";
import { validateRuntimeProfileAssignment } from "@/lib/agents/profiles/assignment-validation";

const VALID_TASK_STATUSES = ["planned", "queued", "running", "completed", "failed", "cancelled"] as const;
type TaskStatus = typeof VALID_TASK_STATUSES[number];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const status = url.searchParams.get("status");

  if (status && !VALID_TASK_STATUSES.includes(status as TaskStatus)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_TASK_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const conditions = [];
  if (projectId) conditions.push(eq(tasks.projectId, projectId));
  if (status) conditions.push(eq(tasks.status, status as TaskStatus));

  const result = await db
    .select()
    .from(tasks)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(tasks.priority, desc(tasks.createdAt));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const compatibilityError = validateRuntimeProfileAssignment({
    profileId: parsed.data.agentProfile,
    runtimeId: parsed.data.assignedAgent,
    context: "Task profile",
  });
  if (compatibilityError) {
    return NextResponse.json({ error: compatibilityError }, { status: 400 });
  }

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(tasks).values({
    id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    projectId: parsed.data.projectId ?? null,
    priority: parsed.data.priority,
    assignedAgent: parsed.data.assignedAgent ?? null,
    agentProfile: parsed.data.agentProfile ?? null,
    status: "planned",
    createdAt: now,
    updatedAt: now,
  });

  // Link documents to this task (from document picker or legacy fileIds)
  if (parsed.data.documentIds && parsed.data.documentIds.length > 0) {
    try {
      for (const docId of parsed.data.documentIds) {
        await db.update(documents)
          .set({
            taskId: id,
            projectId: parsed.data.projectId ?? null,
            updatedAt: now,
          })
          .where(eq(documents.id, docId));

        // Trigger processing if not already done (fire-and-forget)
        processDocument(docId).catch((err) => {
          console.error(`[tasks] processDocument failed for ${docId}:`, err);
        });
      }
    } catch (err) {
      // Document association is best-effort — don't fail task creation
      console.error("[tasks] Document association failed:", err);
    }
  }

  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  return NextResponse.json(task, { status: 201 });
}
