import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import type { WorkflowDefinition } from "@/lib/workflows/types";
import { validateWorkflowDefinitionAssignments } from "@/lib/agents/profiles/assignment-validation";
import { validateWorkflowDefinition } from "@/lib/workflows/definition-validation";
import {
  OperationsCriteriaValidationError,
  serializeSuccessCriteria,
} from "@/lib/operations/criteria";
import { projectReferenceExists } from "@/lib/data/reference-validation";
import { createWorkflowRequestSchema } from "@/lib/validators/workflow";

export async function GET() {
  const result = await db
    .select({
      id: workflows.id,
      name: workflows.name,
      projectId: workflows.projectId,
      definition: workflows.definition,
      status: workflows.status,
      runNumber: workflows.runNumber,
      createdAt: workflows.createdAt,
      updatedAt: workflows.updatedAt,
      taskCount: sql<number>`(SELECT COUNT(*) FROM tasks t WHERE t.workflow_id = "workflows"."id")`.as("taskCount"),
      liveTaskCount: sql<number>`(SELECT COUNT(*) FROM tasks t WHERE t.workflow_id = "workflows"."id" AND t.status IN ('running', 'queued'))`.as("liveTaskCount"),
      outputDocCount: sql<number>`(SELECT COUNT(*) FROM documents d WHERE d.task_id IN (SELECT t2.id FROM tasks t2 WHERE t2.workflow_id = "workflows"."id") AND d.direction = 'output')`.as("outputDocCount"),
    })
    .from(workflows)
    .orderBy(desc(workflows.createdAt));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createWorkflowRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.issues },
      { status: 400 }
    );
  }
  const {
    name,
    projectId,
    definition: rawDefinition,
    successCriteria,
  } = parsed.data;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const definition = rawDefinition as WorkflowDefinition | undefined;
  const definitionError = definition
    ? validateWorkflowDefinition(definition)
    : "Definition must include pattern and at least one step";
  if (definitionError) {
    return NextResponse.json(
      { error: definitionError },
      { status: 400 }
    );
  }

  const compatibilityError = validateWorkflowDefinitionAssignments(
    definition as WorkflowDefinition
  );
  if (compatibilityError) {
    return NextResponse.json({ error: compatibilityError }, { status: 400 });
  }

  if (projectId && !(await projectReferenceExists(projectId))) {
    return NextResponse.json(
      { error: `Project not found: ${projectId}` },
      { status: 404 }
    );
  }

  const id = crypto.randomUUID();
  const now = new Date();
  let serializedSuccessCriteria: string | null;
  try {
    serializedSuccessCriteria = serializeSuccessCriteria(successCriteria ?? []);
  } catch (error) {
    if (error instanceof OperationsCriteriaValidationError) {
      return NextResponse.json(
        { error: error.message, issues: error.issues },
        { status: 400 }
      );
    }
    throw error;
  }

  await db.insert(workflows).values({
    id,
    name: name.trim(),
    projectId: projectId ?? null,
    definition: JSON.stringify(definition),
    successCriteria: serializedSuccessCriteria,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  });

  const [created] = await db.select().from(workflows).where(eq(workflows.id, id));

  return NextResponse.json(created, { status: 201 });
}
