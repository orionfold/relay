import { NextRequest, NextResponse } from "next/server";
import { scanRepo } from "@/lib/import/repo-scanner";

/**
 * POST /api/agents/import-repo/scan
 *
 * Scan a GitHub repo to discover importable skills.
 * Body: { url: string }
 * Returns: RepoScanResult
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    const result = await scanRepo(url.trim());
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
