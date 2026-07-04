import { NextRequest, NextResponse } from "next/server";
import { createProfile, reloadProfiles } from "@/lib/agents/profiles/registry";
import { ProfileConfigSchema } from "@/lib/validators/profile";
import yaml from "js-yaml";

/**
 * POST /api/agents/import
 *
 * Import a profile from a GitHub URL. Supports:
 * - Raw GitHub URLs to profile.yaml (fetches adjacent SKILL.md)
 * - GitHub repo directory URLs (e.g. github.com/user/repo/tree/main/.claude/skills/my-profile)
 */
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    // Convert GitHub web URL to raw content URL
    const rawBase = toRawGitHubUrl(url);
    if (!rawBase) {
      return NextResponse.json(
        { error: "Only GitHub URLs are supported (github.com or raw.githubusercontent.com)" },
        { status: 400 }
      );
    }

    // Fetch profile.yaml
    const yamlUrl = rawBase.endsWith("profile.yaml") ? rawBase : `${rawBase}/profile.yaml`;
    const yamlRes = await fetch(yamlUrl);
    if (!yamlRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch profile.yaml: ${yamlRes.status}` },
        { status: 400 }
      );
    }
    const yamlText = await yamlRes.text();
    const parsed = yaml.load(yamlText);
    const result = ProfileConfigSchema.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json(
        { error: `Invalid profile.yaml: ${result.error.issues.map((i) => i.message).join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch SKILL.md (optional — profile works without it)
    const skillBase = yamlUrl.replace(/profile\.yaml$/, "");
    const skillUrl = `${skillBase}SKILL.md`;
    let skillMd = "";
    try {
      const skillRes = await fetch(skillUrl);
      if (skillRes.ok) {
        skillMd = await skillRes.text();
      }
    } catch {
      // SKILL.md is optional — continue without it
    }

    // Create profile via registry
    createProfile(result.data, skillMd);
    reloadProfiles();

    return NextResponse.json(
      { ok: true, id: result.data.id, name: result.data.name },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * Convert various GitHub URL formats to raw content base URL.
 *
 * Supports:
 * - https://raw.githubusercontent.com/user/repo/branch/path → as-is
 * - https://github.com/user/repo/tree/branch/path → raw.githubusercontent.com
 * - https://github.com/user/repo/blob/branch/path → raw.githubusercontent.com
 */
function toRawGitHubUrl(url: string): string | null {
  try {
    const u = new URL(url);

    // Already a raw URL
    if (u.hostname === "raw.githubusercontent.com") {
      return url.replace(/\/$/, "");
    }

    if (u.hostname !== "github.com") return null;

    // github.com/user/repo/tree/branch/path or github.com/user/repo/blob/branch/path
    const match = u.pathname.match(
      /^\/([^/]+)\/([^/]+)\/(tree|blob)\/([^/]+)\/(.+)/
    );
    if (match) {
      const [, owner, repo, , branch, filePath] = match;
      return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`.replace(/\/$/, "");
    }

    return null;
  } catch {
    return null;
  }
}
