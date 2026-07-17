import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { resolveTaskExecutionTarget } from "@/lib/agents/runtime/execution-target";
import {
  classifyExecutionTargetError,
  toExecutionTargetPreviewItem,
} from "@/lib/agents/runtime/execution-target-preview";
import type { ExecutionTargetPreviewResponse } from "@/lib/agents/runtime/execution-target-contract";
import { classifyTaskProfile } from "@/lib/agents/router";
import {
  buildRelayExecutionContext,
  getRelayCellBoundary,
  type RelayExecutionContext,
} from "@/lib/instance/cell-boundary";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let context: RelayExecutionContext | null = null;
  try {
    const [project] = task.projectId
      ? await db
          .select({
            id: projects.id,
            name: projects.name,
            workingDirectory: projects.workingDirectory,
          })
          .from(projects)
          .where(eq(projects.id, task.projectId))
      : [];
    if (task.projectId && !project) {
      throw new Error(
        `Task execution context could not resolve project ${task.projectId}.`
      );
    }
    context = buildRelayExecutionContext({
      cell: getRelayCellBoundary(),
      project: project ?? null,
    });

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
      context,
      error: null,
    };
    return NextResponse.json(body);
  } catch (error) {
    const classified = classifyExecutionTargetError(error);
    const body: ExecutionTargetPreviewResponse = {
      kind: "task",
      ready: false,
      targets: [],
      context,
      error: classified,
    };
    return NextResponse.json(body, { status: 409 });
  }
}
