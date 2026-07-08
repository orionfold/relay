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
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pageSlug = req.nextUrl.searchParams.get("pageSlug");
  try {
    return NextResponse.json(
      pageSlug ? await createAppPreview(id, { pageSlug }) : await createAppPreview(id),
      { status: 201 }
    );
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
  const pageSlug = req.nextUrl.searchParams.get("pageSlug");
  if (!artifactId) {
    return NextResponse.json(
      { error: "Missing artifactId", code: "PREVIEW_ARTIFACT_REQUIRED" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(
      pageSlug
        ? await getAppPreviewStatus(id, artifactId, { pageSlug })
        : await getAppPreviewStatus(id, artifactId)
    );
  } catch (err) {
    return errorResponse(err);
  }
}
