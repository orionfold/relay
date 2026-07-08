import { NextRequest, NextResponse } from "next/server";
import { AppPublishError, listDeployments } from "@/lib/publishers/app-publish";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pageSlug = req.nextUrl.searchParams.get("pageSlug");
  try {
    return NextResponse.json(listDeployments(id, pageSlug));
  } catch (err) {
    if (err instanceof AppPublishError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode }
      );
    }
    console.error("[apps/deployments] GET error:", err);
    return NextResponse.json({ error: "Failed to list deployments" }, { status: 500 });
  }
}
