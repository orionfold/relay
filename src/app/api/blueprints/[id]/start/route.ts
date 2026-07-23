import { NextResponse } from "next/server";
import { z } from "zod";
import { executeWorkflow } from "@/lib/workflows/engine";
import {
  BlueprintStartConflictError,
  startBlueprint,
} from "@/lib/workflows/blueprints/start";
import { classifyExecutionTargetError } from "@/lib/agents/runtime/execution-target-preview";

const BodySchema = z
  .object({
    variables: z.record(z.string(), z.unknown()),
    projectId: z.string().min(1).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "A variables object and valid start request identity are required.",
        code: "invalid_start_request",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const result = await startBlueprint({
      blueprintId: id,
      ...parsed.data,
    });
    if (!result.duplicate) {
      executeWorkflow(result.workflowId).catch((error) => {
        console.error(
          `[blueprint-start] workflow ${result.workflowId} failed after atomic claim:`,
          error,
        );
      });
    }
    return NextResponse.json(
      {
        status: result.duplicate ? "already_started" : "started",
        workflowId: result.workflowId,
      },
      { status: result.duplicate ? 200 : 202 },
    );
  } catch (error) {
    if (error instanceof BlueprintStartConflictError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 },
      );
    }
    const classified = classifyExecutionTargetError(error);
    const isTargetError = classified.code !== "target_resolution_failed";
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "The workflow could not start.",
        code: isTargetError ? classified.code : "blueprint_start_failed",
      },
      { status: isTargetError ? 409 : 400 },
    );
  }
}
