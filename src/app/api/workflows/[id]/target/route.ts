import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import type { WorkflowDefinition } from "@/lib/workflows/types";
import { resolveWorkflowExecutionTargets } from "@/lib/workflows/execution-targets";
import { classifyExecutionTargetError } from "@/lib/agents/runtime/execution-target-preview";
import type { ExecutionTargetPreviewResponse } from "@/lib/agents/runtime/execution-target-contract";

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

  try {
    const targets = await resolveWorkflowExecutionTargets({
      definition: JSON.parse(workflow.definition) as WorkflowDefinition,
      workflowRuntimeId: workflow.runtimeId,
    });
    const body: ExecutionTargetPreviewResponse = {
      kind: "workflow",
      ready: true,
      targets,
      error: null,
    };
    return NextResponse.json(body);
  } catch (error) {
    const classified = classifyExecutionTargetError(error);
    const body: ExecutionTargetPreviewResponse = {
      kind: "workflow",
      ready: false,
      targets: [],
      error: classified,
    };
    return NextResponse.json(body, { status: 409 });
  }
}
