import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { repoImports } from "@/lib/db/schema";

/**
 * GET /api/agents/import-repo
 *
 * List all repo imports, most recent first.
 */
export async function GET() {
  try {
    const rows = db
      .select()
      .from(repoImports)
      .orderBy(desc(repoImports.createdAt))
      .all();

    return NextResponse.json(
      rows.map((row) => ({
        ...row,
        profileIds: JSON.parse(row.profileIds),
      }))
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to list repo imports";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
