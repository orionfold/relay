import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cancelTaskWithRuntime } from "@/lib/agents/runtime";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));

  if (!task) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await cancelTaskWithRuntime(id, task.assignedAgent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: message, code: "task_cancel_failed" },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}
