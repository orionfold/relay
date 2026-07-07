import { NextRequest, NextResponse } from "next/server";
import { AppPublishError, createAppPreview } from "@/lib/publishers/app-publish";

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
