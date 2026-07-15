import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { resolveTaskExecutionTarget } from "@/lib/agents/runtime/execution-target";
import {
  classifyExecutionTargetError,
  toExecutionTargetPreviewItem,
} from "@/lib/agents/runtime/execution-target-preview";
import type { ExecutionTargetPreviewResponse } from "@/lib/agents/runtime/execution-target-contract";
import { classifyTaskProfile } from "@/lib/agents/router";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  try {
    let profileId = task.agentProfile;
    let target = await resolveTaskExecutionTarget({
      title: task.title,
      description: task.description,
      requestedRuntimeId: task.assignedAgent,
      profileId,
    });
    if (!profileId) {
      profileId = classifyTaskProfile(
        task.title,
        task.description,
        target.effectiveRuntimeId
      );
      target = await resolveTaskExecutionTarget({
        title: task.title,
        description: task.description,
        requestedRuntimeId: task.assignedAgent,
        profileId,
      });
    }
    const body: ExecutionTargetPreviewResponse = {
      kind: "task",
      ready: true,
      targets: [
        toExecutionTargetPreviewItem({
          key: task.id,
          label: task.title,
          profileId,
          target,
        }),
      ],
      error: null,
    };
    return NextResponse.json(body);
  } catch (error) {
    const classified = classifyExecutionTargetError(error);
    const body: ExecutionTargetPreviewResponse = {
      kind: "task",
      ready: false,
      targets: [],
      error: classified,
    };
    return NextResponse.json(body, { status: 409 });
  }
}
