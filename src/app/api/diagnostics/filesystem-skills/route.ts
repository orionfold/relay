import { NextResponse } from "next/server";
import { z } from "zod";
import { readFilesystemSkillDiagnostics } from "@/lib/agents/profiles/filesystem-skill-diagnostics";

const querySchema = z.object({
  includePaths: z.enum(["0", "1"]).default("0"),
});

export async function GET(request: Request) {
  const parsed = querySchema.safeParse({
    includePaths:
      new URL(request.url).searchParams.get("includePaths") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "includePaths must be 0 or 1" },
      { status: 400 },
    );
  }

  const includePaths = parsed.data.includePaths === "1";
  const reports = readFilesystemSkillDiagnostics();
  return NextResponse.json({
    includePaths,
    reports: reports.map((report) => ({
      scannedAt: report.scannedAt,
      scope: report.scope,
      loadedCount: report.loadedCount,
      issueCount: report.issues.length,
      counts: report.issues.reduce<Record<string, number>>((counts, issue) => {
        counts[issue.kind] = (counts[issue.kind] ?? 0) + 1;
        return counts;
      }, {}),
      ...(includePaths ? { root: report.root, issues: report.issues } : {}),
    })),
  });
}
