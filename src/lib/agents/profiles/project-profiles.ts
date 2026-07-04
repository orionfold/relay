/**
 * Project-scoped profile scanner.
 * Reads .claude/skills/ from a project directory in-place (no copying).
 * Supports both profile.yaml + SKILL.md profiles and SKILL.md-only skills.
 */

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ProfileConfigSchema } from "@/lib/validators/profile";
import { getSupportedRuntimes } from "./compatibility";
import type { AgentProfile } from "./types";
import { resolveAgentFile } from "./agent-file";

// ---------------------------------------------------------------------------
// Cache — keyed by projectDir, invalidated on mtime changes
// ---------------------------------------------------------------------------

const projectProfileCache = new Map<string, {
  signature: string;
  profiles: AgentProfile[];
}>();

function getProjectSkillsSignature(skillsDir: string): string {
  if (!fs.existsSync(skillsDir)) return "missing";

  const entries = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const parts: string[] = [];
  for (const entry of entries) {
    const dir = path.join(skillsDir, entry.name);
    parts.push(entry.name);

    const yamlPath = resolveAgentFile(dir);
    if (yamlPath) {
      const s = fs.statSync(yamlPath);
      parts.push(`yaml:${s.mtimeMs}:${s.size}`);
    }

    const skillPath = path.join(dir, "SKILL.md");
    if (fs.existsSync(skillPath)) {
      const s = fs.statSync(skillPath);
      parts.push(`skill:${s.mtimeMs}:${s.size}`);
    }
  }

  return parts.join("|");
}

// ---------------------------------------------------------------------------
// Minimal profile generation for SKILL.md-only skills
// ---------------------------------------------------------------------------

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const fm: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      if (key && value) fm[key] = value;
    }
  }
  return fm;
}

function generateMinimalProfile(
  skillDir: string,
  dirName: string,
  projectDir: string
): AgentProfile {
  const skillPath = path.join(skillDir, "SKILL.md");
  const skillMd = fs.readFileSync(skillPath, "utf-8");
  const fm = parseFrontmatter(skillMd);

  return {
    id: dirName,
    name: fm.name || dirName,
    description: fm.description || `Project skill: ${dirName}`,
    domain: "work",
    tags: ["project-skill"],
    systemPrompt: skillMd,
    skillMd,
    supportedRuntimes: ["claude-code"],
    scope: "project",
    readOnly: true,
    projectDir,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Scan a project's .claude/skills/ directory for profiles. */
export function scanProjectProfiles(projectDir: string): AgentProfile[] {
  const skillsDir = path.join(projectDir, ".claude", "skills");
  if (!fs.existsSync(skillsDir)) return [];

  const signature = getProjectSkillsSignature(skillsDir);
  const cached = projectProfileCache.get(projectDir);
  if (cached && cached.signature === signature) return cached.profiles;

  const profiles: AgentProfile[] = [];

  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const dir = path.join(skillsDir, entry.name);
    const yamlPath = resolveAgentFile(dir);
    const skillPath = path.join(dir, "SKILL.md");

    if (yamlPath && fs.existsSync(skillPath)) {
      // Full agent: agent.yaml (or legacy profile.yaml) + SKILL.md
      try {
        const rawYaml = fs.readFileSync(yamlPath, "utf-8");
        const parsed = yaml.load(rawYaml);
        const result = ProfileConfigSchema.safeParse(parsed);

        if (!result.success) {
          console.warn(
            `[project-profiles] Invalid agent manifest in ${entry.name}:`,
            result.error.issues.map((i) => i.message).join(", ")
          );
          continue;
        }

        const config = result.data;
        const skillMd = fs.readFileSync(skillPath, "utf-8");
        const descMatch = skillMd.match(
          /^---\s*\n[\s\S]*?description:\s*(.+?)\s*\n[\s\S]*?---/
        );

        profiles.push({
          id: config.id,
          name: config.name,
          description: descMatch?.[1] ?? config.name,
          domain: config.domain,
          tags: config.tags,
          systemPrompt: skillMd,
          skillMd,
          allowedTools: config.allowedTools,
          mcpServers: config.mcpServers as Record<string, unknown>,
          canUseToolPolicy: config.canUseToolPolicy,
          maxTurns: config.maxTurns,
          outputFormat: config.outputFormat,
          version: config.version,
          author: config.author,
          source: config.source,
          tests: config.tests,
          importMeta: config.importMeta,
          supportedRuntimes: getSupportedRuntimes(config),
          runtimeOverrides: config.runtimeOverrides,
          scope: "project",
          readOnly: true,
          projectDir,
        });
      } catch (err) {
        console.warn(
          `[project-profiles] Error loading ${entry.name}:`,
          err
        );
      }
    } else if (fs.existsSync(skillPath)) {
      // SKILL.md-only skill — generate minimal profile
      try {
        profiles.push(generateMinimalProfile(dir, entry.name, projectDir));
      } catch (err) {
        console.warn(
          `[project-profiles] Error reading SKILL.md in ${entry.name}:`,
          err
        );
      }
    }
    // Skip directories with neither file
  }

  projectProfileCache.set(projectDir, { signature, profiles });
  return profiles;
}

/** Get a single project profile by ID. */
export function getProjectProfile(
  projectDir: string,
  id: string
): AgentProfile | undefined {
  return scanProjectProfiles(projectDir).find((p) => p.id === id);
}
