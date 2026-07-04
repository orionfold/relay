import { NextRequest, NextResponse } from "next/server";
import { getLatestProfileTestReport } from "@/lib/data/profile-test-results";
import { DEFAULT_AGENT_RUNTIME } from "@/lib/agents/runtime/catalog";

/**
 * GET /api/agents/[id]/test-results?runtimeId=...
 *
 * Returns the most recent persisted test report for this profile+runtime.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const runtimeId = req.nextUrl.searchParams.get("runtimeId") ?? DEFAULT_AGENT_RUNTIME;

  const report = getLatestProfileTestReport(id, runtimeId);
  if (!report) {
    return NextResponse.json(null, { status: 404 });
  }
  return NextResponse.json(report);
}
