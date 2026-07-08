import { NextRequest, NextResponse } from "next/server";
import { AppPublishError, deletePublishTarget } from "@/lib/publishers/app-publish";

function errorResponse(err: unknown) {
  if (err instanceof AppPublishError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode }
    );
  }
  console.error("[apps/publish-targets/:targetId] route error:", err);
  return NextResponse.json({ error: "Publish target delete failed" }, { status: 500 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> }
) {
  const { id, targetId } = await params;
  try {
    return NextResponse.json(deletePublishTarget(id, targetId));
  } catch (err) {
    return errorResponse(err);
  }
}
