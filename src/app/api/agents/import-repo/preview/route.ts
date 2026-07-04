import { NextRequest, NextResponse } from "next/server";
import { fetchSkillContent, type DiscoveredSkill } from "@/lib/import/repo-scanner";
import { adaptSkillMdOnly, adaptAinativeNative, type ReadmeContext } from "@/lib/import/format-adapter";
import { checkDuplicates } from "@/lib/import/dedup";
import { listProfiles } from "@/lib/agents/profiles/registry";

/**
 * POST /api/agents/import-repo/preview
 *
 * Fetch selected skills and run format adaptation + dedup.
 * Body: { owner, repo, branch, commitSha, repoUrl, repoReadme, skills: DiscoveredSkill[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { owner, repo, branch, commitSha, repoUrl, repoReadme, skills } = body as {
      owner: string;
      repo: string;
      branch: string;
      commitSha: string;
      repoUrl: string;
      repoReadme?: string;
      skills: DiscoveredSkill[];
    };

    if (!owner || !repo || !branch || !skills?.length) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const repoMeta = { repoUrl, owner, repo, branch, commitSha };

    // Fetch content for each selected skill in parallel
    const fetchResults = await Promise.all(
      skills.map(async (skill) => {
        try {
          const { skillMd, profileYaml, readme } = await fetchSkillContent(owner, repo, branch, skill);

          const readmeCtx: ReadmeContext = {
            skillReadme: readme,
            repoReadme: repoReadme ?? "",
          };

          const adapted = skill.format === "ainative" && profileYaml
            ? adaptAinativeNative(skill, skillMd, profileYaml, repoMeta, readmeCtx)
            : adaptSkillMdOnly(skill, skillMd, repoMeta, readmeCtx);

          return { skill, adapted, error: null };
        } catch (err: unknown) {
          return {
            skill,
            adapted: null,
            error: err instanceof Error ? err.message : "Fetch failed",
          };
        }
      })
    );

    // Run dedup against existing profiles
    const existingProfiles = listProfiles();
    const successfulAdaptations = fetchResults
      .filter((r) => r.adapted !== null)
      .map((r) => ({
        config: r.adapted!.config,
        skillMd: r.adapted!.skillMd,
      }));

    const dedupResults = checkDuplicates(successfulAdaptations, existingProfiles);

    // Combine results
    const previews = fetchResults.map((r) => {
      if (!r.adapted) {
        return {
          skill: r.skill,
          config: null,
          skillMd: null,
          dedup: null,
          error: r.error,
        };
      }

      const dedup = dedupResults.find(
        (d) => d.candidate.id === r.adapted!.config.id
      );

      return {
        skill: r.skill,
        config: r.adapted.config,
        skillMd: r.adapted.skillMd,
        dedup: dedup
          ? {
              status: dedup.status,
              matchReason: dedup.matchReason,
              similarity: dedup.similarity,
              matchedProfileId: dedup.matchedProfile?.id,
              matchedProfileName: dedup.matchedProfile?.name,
            }
          : null,
        error: null,
      };
    });

    return NextResponse.json({ previews });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Preview failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
