import { NextRequest, NextResponse } from "next/server";
import { AppPublishError, getDeployment } from "@/lib/publishers/app-publish";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; deploymentId: string }> }
) {
  const { id, deploymentId } = await params;
  try {
    const deployment = getDeployment(id, deploymentId);
    if (!deployment) {
      return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
    }
    return NextResponse.json(deployment);
  } catch (err) {
    if (err instanceof AppPublishError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    console.error("[apps/deployments/:deploymentId] GET error:", err);
    return NextResponse.json({ error: "Failed to read deployment" }, { status: 500 });
  }
}
