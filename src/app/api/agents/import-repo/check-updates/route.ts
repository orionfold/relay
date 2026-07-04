import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { repoImports } from "@/lib/db/schema";
import { getLatestCommitSha, getFileContent } from "@/lib/import/github-api";
import { contentHash } from "@/lib/import/format-adapter";
import { listProfiles } from "@/lib/agents/profiles/registry";

/**
 * POST /api/agents/import-repo/check-updates
 *
 * Check if imported profiles have updates available in their source repo.
 * Body: { repoImportId: string } or { profileId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { repoImportId, profileId } = body as {
      repoImportId?: string;
      profileId?: string;
    };

    const profiles = listProfiles();

    // Find profiles to check
    let profilesToCheck: typeof profiles;

    if (repoImportId) {
      // Check all profiles from a specific repo import
      const importRow = db
        .select()
        .from(repoImports)
        .where(eq(repoImports.id, repoImportId))
        .get();

      if (!importRow) {
        return NextResponse.json({ error: "Repo import not found" }, { status: 404 });
      }

      const importedIds = JSON.parse(importRow.profileIds) as string[];
      profilesToCheck = profiles.filter((p) => importedIds.includes(p.id));
    } else if (profileId) {
      // Check a single profile
      const profile = profiles.find((p) => p.id === profileId);
      if (!profile?.importMeta) {
        return NextResponse.json({ error: "Profile has no import metadata" }, { status: 400 });
      }
      profilesToCheck = [profile];
    } else {
      return NextResponse.json({ error: "Provide repoImportId or profileId" }, { status: 400 });
    }

    // Filter to only profiles with importMeta
    profilesToCheck = profilesToCheck.filter((p) => p.importMeta);
    if (profilesToCheck.length === 0) {
      return NextResponse.json({ hasUpdates: false, updates: [] });
    }

    // Group by repo to minimize API calls
    const repoGroups = new Map<string, typeof profilesToCheck>();
    for (const p of profilesToCheck) {
      const meta = p.importMeta!;
      const key = `${meta.repoOwner}/${meta.repoName}/${meta.branch}`;
      const group = repoGroups.get(key) ?? [];
      group.push(p);
      repoGroups.set(key, group);
    }

    const updates: Array<{
      profileId: string;
      profileName: string;
      localHash: string;
      remoteHash: string;
      hasUpdate: boolean;
    }> = [];

    for (const [, group] of repoGroups) {
      const meta = group[0].importMeta!;

      // Get latest commit SHA
      let latestSha: string;
      try {
        latestSha = await getLatestCommitSha(meta.repoOwner, meta.repoName, meta.branch);
      } catch {
        // Can't reach repo — skip this group
        for (const p of group) {
          updates.push({
            profileId: p.id,
            profileName: p.name,
            localHash: p.importMeta!.contentHash,
            remoteHash: "unknown",
            hasUpdate: false,
          });
        }
        continue;
      }

      // If commit SHA is same, no updates
      if (latestSha === meta.commitSha) {
        for (const p of group) {
          updates.push({
            profileId: p.id,
            profileName: p.name,
            localHash: p.importMeta!.contentHash,
            remoteHash: p.importMeta!.contentHash,
            hasUpdate: false,
          });
        }
        continue;
      }

      // Commit SHA changed — check each file
      for (const p of group) {
        const pMeta = p.importMeta!;
        const skillFile = pMeta.filePath
          ? `${pMeta.filePath}/SKILL.md`
          : "SKILL.md";

        try {
          const remoteContent = await getFileContent(
            pMeta.repoOwner,
            pMeta.repoName,
            skillFile,
            meta.branch
          );
          const remoteH = contentHash(remoteContent);

          updates.push({
            profileId: p.id,
            profileName: p.name,
            localHash: pMeta.contentHash,
            remoteHash: remoteH,
            hasUpdate: remoteH !== pMeta.contentHash,
          });
        } catch {
          updates.push({
            profileId: p.id,
            profileName: p.name,
            localHash: pMeta.contentHash,
            remoteHash: "fetch-error",
            hasUpdate: false,
          });
        }
      }
    }

    // Update lastCheckedAt on the repo import record
    if (repoImportId) {
      db.update(repoImports)
        .set({ lastCheckedAt: new Date() })
        .where(eq(repoImports.id, repoImportId))
        .run();
    }

    return NextResponse.json({
      hasUpdates: updates.some((u) => u.hasUpdate),
      updates,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Update check failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
