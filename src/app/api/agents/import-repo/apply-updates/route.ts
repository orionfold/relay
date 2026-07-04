import { NextRequest, NextResponse } from "next/server";
import { getFileContent } from "@/lib/import/github-api";
import { contentHash, enrichProfileFromContent, type ReadmeContext } from "@/lib/import/format-adapter";
import {
  getProfile,
  updateProfile,
  reloadProfiles,
} from "@/lib/agents/profiles/registry";
import type { ProfileConfig } from "@/lib/validators/profile";

/**
 * POST /api/agents/import-repo/apply-updates
 *
 * Apply accepted updates to imported profiles.
 * Body: { updates: Array<{ profileId: string; accept: boolean }> }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { updates } = body as {
      updates: Array<{ profileId: string; accept: boolean }>;
    };

    if (!updates?.length) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    let applied = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const update of updates) {
      if (!update.accept) {
        skipped++;
        continue;
      }

      const profile = getProfile(update.profileId);
      if (!profile?.importMeta) {
        errors.push(`${update.profileId}: No import metadata`);
        continue;
      }

      const meta = profile.importMeta;
      const skillFile = meta.filePath
        ? `${meta.filePath}/SKILL.md`
        : "SKILL.md";

      try {
        // Fetch updated SKILL.md
        const newSkillMd = await getFileContent(
          meta.repoOwner,
          meta.repoName,
          skillFile,
          meta.branch
        );

        // Fetch README context for enrichment
        let repoReadme = "";
        try {
          repoReadme = await getFileContent(meta.repoOwner, meta.repoName, "README.md", meta.branch);
        } catch { /* no README */ }

        let skillReadme: string | null = null;
        if (meta.filePath) {
          try {
            skillReadme = await getFileContent(meta.repoOwner, meta.repoName, `${meta.filePath}/README.md`, meta.branch);
          } catch { /* no per-skill README */ }
        }

        const readmeCtx: ReadmeContext = { skillReadme, repoReadme };
        const dirName = meta.filePath.split("/").pop() ?? profile.id;

        // Re-extract description and tags from updated content
        const { enrichedSkillMd, tags } = enrichProfileFromContent(
          newSkillMd, profile.tags, profile.name, dirName, readmeCtx
        );

        // Build updated config
        const updatedConfig: ProfileConfig = {
          id: profile.id,
          name: profile.name,
          version: profile.version ?? "1.0.0",
          domain: profile.domain as "work" | "personal",
          tags,
          allowedTools: profile.allowedTools,
          mcpServers: profile.mcpServers,
          canUseToolPolicy: profile.canUseToolPolicy,
          maxTurns: profile.maxTurns,
          outputFormat: profile.outputFormat,
          author: profile.author,
          source: profile.source,
          tests: profile.tests,
          supportedRuntimes: profile.supportedRuntimes,
          runtimeOverrides: profile.runtimeOverrides,
          importMeta: {
            ...meta,
            contentHash: contentHash(newSkillMd),
            importedAt: new Date().toISOString(),
          },
        };

        updateProfile(update.profileId, updatedConfig, enrichedSkillMd);
        applied++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Update failed";
        errors.push(`${update.profileId}: ${msg}`);
      }
    }

    reloadProfiles();

    return NextResponse.json({
      ok: true,
      applied,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Apply updates failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
