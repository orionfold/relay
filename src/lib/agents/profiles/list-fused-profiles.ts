import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { listProfiles } from "./registry";
import type { AgentProfile } from "./types";
import {
  recordFilesystemSkillDiagnostics,
  warnFilesystemSkillIssues,
  type FilesystemSkillDiagnosticReport,
  type FilesystemSkillIssue,
} from "./filesystem-skill-diagnostics";

export class FilesystemSkillDiscoveryError extends Error {
  readonly code = "FILESYSTEM_SKILL_SCANNER_FAILED" as const;

  constructor(
    readonly skillsDir: string,
    readonly scope: "filesystem-project" | "filesystem-user",
    cause: unknown,
  ) {
    super(
      `Filesystem skill discovery could not read the ${scope === "filesystem-user" ? "user" : "project"} skills directory.`,
      { cause },
    );
    this.name = "FilesystemSkillDiscoveryError";
  }
}

/**
 * Minimal YAML frontmatter parser — handles the `---\nkey: value\n---\n...`
 * pattern used by SKILL.md files. Returns null if no frontmatter or no `name`.
 */
function parseFrontmatter(content: string): Record<string, string> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function loadFilesystemSkills(
  skillsDir: string,
  origin: "filesystem-project" | "filesystem-user",
  projectRootDir: string | undefined
): { profiles: AgentProfile[]; issues: FilesystemSkillIssue[] } {
  if (!existsSync(skillsDir)) return { profiles: [], issues: [] };
  const profiles: AgentProfile[] = [];
  const issues: FilesystemSkillIssue[] = [];
  let entries: string[];
  try {
    entries = readdirSync(skillsDir);
  } catch (error) {
    const issue: FilesystemSkillIssue = {
      kind: "scanner-failure",
      scope: origin,
      path: skillsDir,
      reason: error instanceof Error ? error.message : String(error),
    };
    recordFilesystemSkillDiagnostics({
      scannedAt: new Date().toISOString(),
      root: skillsDir,
      scope: origin,
      loadedCount: 0,
      issues: [issue],
    });
    throw new FilesystemSkillDiscoveryError(skillsDir, origin, error);
  }

  for (const entry of entries) {
    const skillPath = join(skillsDir, entry);
    try {
      if (!statSync(skillPath).isDirectory()) continue;
      const skillMdPath = join(skillPath, "SKILL.md");
      if (!existsSync(skillMdPath)) continue;
      let content: string;
      try {
        content = readFileSync(skillMdPath, "utf8");
      } catch (error) {
        issues.push({
          kind: "unreadable-skill",
          scope: origin,
          path: skillMdPath,
          reason: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      const fm = parseFrontmatter(content);
      if (!fm || !fm.name) {
        issues.push({
          kind: "malformed-skill",
          scope: origin,
          path: skillMdPath,
          reason: "Missing name in SKILL.md frontmatter",
        });
        continue;
      }
      profiles.push({
        id: fm.name,
        name: fm.name,
        description: fm.description ?? "",
        domain: "skill",
        tags: [],
        systemPrompt: content,
        skillMd: content,
        allowedTools: [],
        mcpServers: {},
        supportedRuntimes: ["claude-code"],
        origin,
        scope: origin === "filesystem-project" ? "project" : "user",
        readOnly: true,
        projectDir: origin === "filesystem-project" ? projectRootDir : undefined,
      } as AgentProfile);
    } catch (error) {
      issues.push({
        kind: "unavailable-entry",
        scope: origin,
        path: skillPath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const report: FilesystemSkillDiagnosticReport = {
    scannedAt: new Date().toISOString(),
    root: skillsDir,
    scope: origin,
    loadedCount: profiles.length,
    issues,
  };
  recordFilesystemSkillDiagnostics(report);
  return { profiles, issues };
}

/**
 * Lists every agent profile reachable from this ainative instance, merging
 * registry profiles with filesystem skills ("fused" view):
 *   1. Registry profiles (builtins + user registry)
 *   2. User filesystem skills at `~/.claude/skills/*\/SKILL.md` (or `userSkillsDir` override)
 *   3. Project filesystem skills at `<projectDir>/.claude/skills/*\/SKILL.md`
 * Dedupes by id — registry profiles win on collision (they're curated), then
 * user skills win over project skills.
 *
 * @param projectDir Absolute path to the active project's working directory (project root)
 * @param userSkillsDir Override for user skills dir (tests); defaults to `~/.claude/skills`
 */
export async function listFusedProfiles(
  projectDir: string | null | undefined,
  userSkillsDir: string = join(homedir(), ".claude", "skills")
): Promise<AgentProfile[]> {
  const registry = listProfiles();
  const registryIds = new Set(registry.map((p) => p.id));

  const userResult = loadFilesystemSkills(
    userSkillsDir,
    "filesystem-user",
    undefined,
  );
  const userSkills = userResult.profiles.filter((p) => !registryIds.has(p.id));

  const projectResult = projectDir
    ? loadFilesystemSkills(
        join(projectDir, ".claude", "skills"),
        "filesystem-project",
        projectDir
      )
    : { profiles: [], issues: [] };
  const projectSkills = projectResult.profiles.filter(
    (p) => !registryIds.has(p.id) && !userSkills.some((u) => u.id === p.id),
  );

  warnFilesystemSkillIssues([...userResult.issues, ...projectResult.issues]);

  return [...registry, ...userSkills, ...projectSkills];
}
