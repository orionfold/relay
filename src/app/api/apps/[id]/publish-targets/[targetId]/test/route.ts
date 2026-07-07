import { NextRequest, NextResponse } from "next/server";
import { AppPublishError, testPublishTarget } from "@/lib/publishers/app-publish";

function errorResponse(err: unknown) {
  if (err instanceof AppPublishError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode }
    );
  }
  console.error("[apps/publish-targets/test] route error:", err);
  return NextResponse.json(
    { testStatus: "failed", error: "Publish target test failed" },
    { status: 500 }
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; targetId: string }> }
) {
  const { id, targetId } = await params;
  try {
    const result = await testPublishTarget(id, targetId);
    return NextResponse.json({
      testStatus: result.ok ? "ok" : "failed",
      error: result.error,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
