import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, workflows } from "@/lib/db/schema";
import type { WorkflowDefinition } from "@/lib/workflows/types";
import { resolveWorkflowExecutionTargets } from "@/lib/workflows/execution-targets";
import { classifyExecutionTargetError } from "@/lib/agents/runtime/execution-target-preview";
import type { ExecutionTargetPreviewResponse } from "@/lib/agents/runtime/execution-target-contract";
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
  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id));
  if (!workflow) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  let context: RelayExecutionContext | null = null;
  try {
    const [project] = workflow.projectId
      ? await db
          .select({
            id: projects.id,
            name: projects.name,
            workingDirectory: projects.workingDirectory,
          })
          .from(projects)
          .where(eq(projects.id, workflow.projectId))
      : [];
    if (workflow.projectId && !project) {
      throw new Error(
        `Workflow execution context could not resolve project ${workflow.projectId}.`
      );
    }
    context = buildRelayExecutionContext({
      cell: getRelayCellBoundary(),
      project: project ?? null,
    });

    const targets = await resolveWorkflowExecutionTargets({
      definition: JSON.parse(workflow.definition) as WorkflowDefinition,
      workflowRuntimeId: workflow.runtimeId,
    });
    const body: ExecutionTargetPreviewResponse = {
      kind: "workflow",
      ready: true,
      targets,
      context,
      error: null,
    };
    return NextResponse.json(body);
  } catch (error) {
    const classified = classifyExecutionTargetError(error);
    const body: ExecutionTargetPreviewResponse = {
      kind: "workflow",
      ready: false,
      targets: [],
      context,
      error: classified,
    };
    return NextResponse.json(body, { status: 409 });
  }
}
