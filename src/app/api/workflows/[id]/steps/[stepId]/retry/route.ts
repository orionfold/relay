import { NextRequest, NextResponse } from "next/server";
import { retryWorkflowStep } from "@/lib/workflows/engine";
import { workflowTransitionErrorResponse } from "@/lib/workflows/transition-errors";

export async function POST(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string; stepId: string }>;
  }
) {
  const { id, stepId } = await params;

  try {
    await retryWorkflowStep(id, stepId);
  } catch (error) {
    const failure = workflowTransitionErrorResponse(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }

  return NextResponse.json(
    { status: "retry_started", workflowId: id, stepId },
    { status: 202 }
  );
}
