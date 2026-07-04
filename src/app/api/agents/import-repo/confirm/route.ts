import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { repoImports } from "@/lib/db/schema";
import {
  createProfile,
  deleteProfile,
  reloadProfiles,
  isBuiltin,
} from "@/lib/agents/profiles/registry";
import { ProfileConfigSchema, type ProfileConfig } from "@/lib/validators/profile";

interface ImportItem {
  config: ProfileConfig;
  skillMd: string;
  action: "import" | "replace" | "skip";
}

/**
 * POST /api/agents/import-repo/confirm
 *
 * Execute a batch import of profiles.
 * Body: { repoUrl, owner, repo, branch, commitSha, imports: ImportItem[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repoUrl, owner, repo, branch, commitSha, imports } = body as {
      repoUrl: string;
      owner: string;
      repo: string;
      branch: string;
      commitSha: string;
      imports: ImportItem[];
    };

    if (!repoUrl || !imports?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let imported = 0;
    let replaced = 0;
    let skipped = 0;
    const profileIds: string[] = [];
    const errors: string[] = [];

    for (const item of imports) {
      if (item.action === "skip") {
        skipped++;
        continue;
      }

      // Validate the config
      const result = ProfileConfigSchema.safeParse(item.config);
      if (!result.success) {
        errors.push(`${item.config.id}: ${result.error.issues.map((i) => i.message).join(", ")}`);
        continue;
      }

      try {
        if (item.action === "replace") {
          // Delete existing (unless it's a builtin — can't replace builtins)
          if (!isBuiltin(item.config.id)) {
            try {
              deleteProfile(item.config.id);
            } catch {
              // May not exist yet
            }
          }
          createProfile(result.data, item.skillMd);
          replaced++;
        } else {
          // "import" — create new
          createProfile(result.data, item.skillMd);
          imported++;
        }
        profileIds.push(item.config.id);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${item.config.id}: ${msg}`);
      }
    }

    reloadProfiles();

    // Record the repo import in the database
    if (profileIds.length > 0) {
      db.insert(repoImports)
        .values({
          id: randomUUID(),
          repoUrl,
          repoOwner: owner,
          repoName: repo,
          branch,
          commitSha,
          profileIds: JSON.stringify(profileIds),
          skillCount: profileIds.length,
          createdAt: new Date(),
        })
        .run();
    }

    return NextResponse.json(
      {
        ok: true,
        imported,
        replaced,
        skipped,
        profileIds,
        errors: errors.length > 0 ? errors : undefined,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
