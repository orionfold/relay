import { NextRequest, NextResponse } from "next/server";
import {
  AppPublishError,
  createAppPreview,
  getAppPreviewStatus,
} from "@/lib/publishers/app-publish";

function errorResponse(err: unknown) {
  if (err instanceof AppPublishError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode }
    );
  }
  console.error("[apps/preview] POST error:", err);
  return NextResponse.json({ error: "Failed to create preview" }, { status: 500 });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return NextResponse.json(await createAppPreview(id), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const artifactId = req.nextUrl.searchParams.get("artifactId");
  if (!artifactId) {
    return NextResponse.json(
      { error: "Missing artifactId", code: "PREVIEW_ARTIFACT_REQUIRED" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await getAppPreviewStatus(id, artifactId));
  } catch (err) {
    return errorResponse(err);
  }
}
