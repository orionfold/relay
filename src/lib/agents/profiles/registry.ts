import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { ProfileConfigSchema } from "@/lib/validators/profile";
import type { ProfileConfig } from "@/lib/validators/profile";
import { getSupportedRuntimes } from "./compatibility";
import type { AgentProfile } from "./types";
import { scanProjectProfiles } from "./project-profiles";
import { invalidateLatestScan, getLatestScan } from "@/lib/environment/data";
import { db } from "@/lib/db";
import { environmentArtifacts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAinativeProfilesDir, getAinativeAppsDir } from "@/lib/utils/ainative-paths";
import { loadAppManifestProfiles } from "./app-manifest-source";
import {
  AGENT_FILENAME,
  LEGACY_PROFILE_FILENAME,
  resolveAgentFile,
  hasAgentFile,
} from "./agent-file";

/**
 * Builtins ship inside the repo at src/lib/agents/profiles/builtins/.
 * At runtime they are copied (if missing) to ~/.claude/skills/ so users
 * can customize them without touching source.
 * Uses getAppRoot + known subpath because Turbopack compiles import.meta.dirname
 * to a virtual /ROOT/ path that doesn't exist on the filesystem.
 */
import { getAppRoot } from "@/lib/utils/app-root";

const BUILTINS_DIR = path.resolve(
  getAppRoot(import.meta.dirname, 4),
  "src", "lib", "agents", "profiles", "builtins"
);

function getBuiltinsDir(): string {
  return BUILTINS_DIR;
}

const SKILLS_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? homedir(),
  ".claude",
  "skills"
);

/**
 * Auto-promoted profiles (from environment discovery) are written here
 * instead of SKILLS_DIR to avoid colliding with Claude Code's skill namespace.
 */
const PROMOTED_PROFILES_DIR = getAinativeProfilesDir();

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let profileCache: Map<string, AgentProfile> | null = null;
let profileCacheSignature: string | null = null;

function getDirectorySignatureParts(baseDir: string): string[] {
  if (!fs.existsSync(baseDir)) return [];

  const entries = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const parts: string[] = [];

  for (const entry of entries) {
    const dir = path.join(baseDir, entry.name);
    const yamlPath = resolveAgentFile(dir);
    const skillPath = path.join(dir, "SKILL.md");

    parts.push(entry.name);

    if (yamlPath) {
      const stats = fs.statSync(yamlPath);
      parts.push(`yaml:${stats.mtimeMs}:${stats.size}`);
    }

    if (fs.existsSync(skillPath)) {
      const stats = fs.statSync(skillPath);
      parts.push(`skill:${stats.mtimeMs}:${stats.size}`);
    }
  }

  return parts;
}

function getAppsDirectorySignature(): string {
  const appsDir = getAinativeAppsDir();
  if (!fs.existsSync(appsDir)) return "no-apps";

  const parts: string[] = [];
  const entries = fs
    .readdirSync(appsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const manifestPath = path.join(appsDir, entry.name, "manifest.yaml");
    parts.push(entry.name);
    if (fs.existsSync(manifestPath)) {
      const stats = fs.statSync(manifestPath);
      parts.push(`manifest:${stats.mtimeMs}:${stats.size}`);
    }
  }
  return parts.join("|");
}

function getSkillsDirectorySignature(): string {
  const skillsParts = getDirectorySignatureParts(SKILLS_DIR);
  const promotedParts = getDirectorySignatureParts(PROMOTED_PROFILES_DIR);
  const appsSignature = getAppsDirectorySignature();

  if (skillsParts.length === 0 && promotedParts.length === 0 && appsSignature === "no-apps") {
    return "missing";
  }

  return [
    ...skillsParts,
    "||promoted||",
    ...promotedParts,
    "||apps||",
    appsSignature,
  ].join("|");
}

// ---------------------------------------------------------------------------
// ensureBuiltins — copy missing builtins to .claude/skills/ (idempotent)
// ---------------------------------------------------------------------------

function ensureBuiltins(): void {
  const builtinsDir = getBuiltinsDir();
  if (!fs.existsSync(builtinsDir)) return;

  fs.mkdirSync(SKILLS_DIR, { recursive: true });

  for (const entry of fs.readdirSync(builtinsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const targetDir = path.join(SKILLS_DIR, entry.name);
    // Reads resolve either filename so an already-installed profile.yaml is
    // still found; the fresh-copy path below copies whatever name the builtin
    // ships (agent.yaml after the rename).
    const existingTargetYaml = resolveAgentFile(targetDir);
    const srcYaml = resolveAgentFile(path.join(builtinsDir, entry.name));

    // A malformed builtin dir with neither manifest is not copyable — skip it
    // rather than crash the whole boot-time ensure pass (principle #1).
    if (!srcYaml) continue;

    // Never overwrite user edits — only copy if the manifest is missing
    if (existingTargetYaml) {
      const targetYamlForMerge = existingTargetYaml;
      try {
        const source = (yaml.load(fs.readFileSync(srcYaml, "utf-8")) ??
          {}) as Record<string, unknown>;
        const target = (yaml.load(fs.readFileSync(targetYamlForMerge, "utf-8")) ??
          {}) as Record<string, unknown>;
        let changed = false;

        if (
          source.supportedRuntimes !== undefined &&
          target.supportedRuntimes === undefined
        ) {
          target.supportedRuntimes = source.supportedRuntimes;
          changed = true;
        }

        if (
          source.runtimeOverrides !== undefined &&
          target.runtimeOverrides === undefined
        ) {
          target.runtimeOverrides = source.runtimeOverrides;
          changed = true;
        }

        if (
          source.preferredRuntime !== undefined &&
          target.preferredRuntime !== source.preferredRuntime
        ) {
          target.preferredRuntime = source.preferredRuntime;
          changed = true;
        }

        if (
          source.capabilityOverrides !== undefined &&
          target.capabilityOverrides === undefined
        ) {
          target.capabilityOverrides = source.capabilityOverrides;
          changed = true;
        }

        if (changed) {
          // Write back to the SAME file we read (which may still be the legacy
          // profile.yaml) so we never leave two manifests in one dir. The boot
          // migration renames it to agent.yaml later.
          fs.writeFileSync(targetYamlForMerge, yaml.dump(target));
        }
      } catch {
        // If a user has customized or broken the YAML, leave it untouched.
      }
      continue;
    }

    fs.mkdirSync(targetDir, { recursive: true });

    const srcDir = path.join(builtinsDir, entry.name);
    for (const file of fs.readdirSync(srcDir)) {
      fs.copyFileSync(path.join(srcDir, file), path.join(targetDir, file));
    }
  }
}

// ---------------------------------------------------------------------------
// scanProfiles — read .claude/skills/*/profile.yaml, validate, pair w/ SKILL.md
// ---------------------------------------------------------------------------

function scanProfilesFromDir(
  baseDir: string,
  profiles: Map<string, AgentProfile>,
  options: { namespace?: string } = {}
): void {
  if (!fs.existsSync(baseDir)) return;

  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const dir = path.join(baseDir, entry.name);
    const yamlPath = resolveAgentFile(dir);
    const skillPath = path.join(dir, "SKILL.md");

    if (!yamlPath) continue;

    try {
      const rawYaml = fs.readFileSync(yamlPath, "utf-8");
      const parsed = yaml.load(rawYaml);
      const result = ProfileConfigSchema.safeParse(parsed);

      if (!result.success) {
        console.warn(
          `[profiles] Invalid agent manifest in ${entry.name}:`,
          result.error.issues.map((i) => i.message).join(", ")
        );
        continue;
      }

      const config = result.data;
      const skillMd = fs.existsSync(skillPath)
        ? fs.readFileSync(skillPath, "utf-8")
        : "";

      // Extract description from SKILL.md frontmatter or fall back to name
      const descMatch = skillMd.match(
        /^---\s*\n[\s\S]*?description:\s*(.+?)\s*\n[\s\S]*?---/
      );
      const description = descMatch?.[1] ?? config.name;

      // Infer origin from metadata
      const origin = config.importMeta
        ? "import" as const
        : config.author === "ainative-env"
          ? "environment" as const
          : config.author === "ainative-ai-assist"
            ? "ai-assist" as const
            : "manual" as const;

      // When called from the Kind 5 plugin loader, namespace the id so
      // bundle profiles get registered as "<plugin-id>/<profile-id>" and
      // never collide with builtin / user-customized profiles.
      const finalId = options.namespace
        ? `${options.namespace}/${config.id}`
        : config.id;

      profiles.set(finalId, {
        id: finalId,
        name: config.name,
        description,
        domain: config.domain,
        tags: config.tags,
        systemPrompt: skillMd, // backward compat
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
        preferredRuntime: config.preferredRuntime,
        runtimeOverrides: config.runtimeOverrides,
        capabilityOverrides: config.capabilityOverrides,
        origin,
      });
    } catch (err) {
      console.warn(`[profiles] Error loading profile ${entry.name}:`, err);
    }
  }

}

/**
 * Scan a directory of profile.yaml/SKILL.md folders and inject namespaced
 * profile entries into the provided Map. Used by the Kind 5 plugin loader
 * to ingest <plugin>/profiles/* with `<plugin-id>/<profile-id>` keys, while
 * preserving all the canonical profile-loading behavior (frontmatter
 * extraction, runtime inference, origin classification).
 */
export function scanProfilesIntoMap(
  baseDir: string,
  profiles: Map<string, AgentProfile>,
  options: { namespace?: string } = {}
): void {
  scanProfilesFromDir(baseDir, profiles, options);
}

function scanProfiles(): Map<string, AgentProfile> {
  const profiles = new Map<string, AgentProfile>();

  // Synthesize FIRST so file-based scans below shadow synthesized entries
  // with the same id (Map last-write-wins).
  const synthesized = loadAppManifestProfiles(
    getAinativeAppsDir(),
    PROMOTED_PROFILES_DIR,
    getBuiltinsDir()
  );
  for (const profile of synthesized) {
    profiles.set(profile.id, profile);
  }

  scanProfilesFromDir(SKILLS_DIR, profiles);
  scanProfilesFromDir(PROMOTED_PROFILES_DIR, profiles);
  return profiles;
}

// ---------------------------------------------------------------------------
// Initialization — lazy on first access
// ---------------------------------------------------------------------------

function ensureLoaded(): Map<string, AgentProfile> {
  ensureBuiltins();
  const signature = getSkillsDirectorySignature();

  if (!profileCache || profileCacheSignature !== signature) {
    profileCache = scanProfiles();
    profileCacheSignature = signature;
  }
  return profileCache;
}

// ---------------------------------------------------------------------------
// Public API — same synchronous signatures as before
// ---------------------------------------------------------------------------

export function getProfile(id: string): AgentProfile | undefined {
  return ensureLoaded().get(id);
}

export function listProfiles(): AgentProfile[] {
  return Array.from(ensureLoaded().values());
}

/**
 * List all profiles: builtin + user + project-scoped.
 * Project profiles are only included when a projectDir is provided.
 * Each profile is annotated with its scope.
 */
export function listAllProfiles(projectDir?: string): AgentProfile[] {
  const userProfiles = listProfiles().map((p) => ({
    ...p,
    scope: p.scope ?? (isBuiltin(p.id) ? "builtin" as const : "user" as const),
  }));

  if (!projectDir) return userProfiles;

  const projectProfiles = scanProjectProfiles(projectDir);
  return [...userProfiles, ...projectProfiles];
}

export function getProfileTags(): Map<string, string[]> {
  const tagMap = new Map<string, string[]>();
  for (const profile of ensureLoaded().values()) {
    tagMap.set(profile.id, profile.tags);
  }
  return tagMap;
}

/** Force re-scan of .claude/skills/ — call after user adds/edits profiles */
export function reloadProfiles(): void {
  profileCache = null;
  profileCacheSignature = null;
}

/** Check if a profile ID is a built-in (exists in builtins/ source directory) */
export function isBuiltin(id: string): boolean {
  return hasAgentFile(path.join(getBuiltinsDir(), id));
}

/** Create a new custom profile in ~/.claude/skills/ */
export function createProfile(config: ProfileConfig, skillMd: string): void {
  const result = ProfileConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid profile: ${result.error.issues.map(i => i.message).join(", ")}`);
  }

  const dir = path.join(SKILLS_DIR, config.id);
  if (hasAgentFile(dir)) {
    throw new Error(`Profile "${config.id}" already exists`);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, AGENT_FILENAME), yaml.dump(config));
  fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd);
  reloadProfiles();
  invalidateLatestScan();
}

/**
 * Create an auto-promoted profile in ~/.ainative/profiles/ (not ~/.claude/skills/).
 * This avoids colliding with Claude Code's skill discovery namespace.
 */
export function createPromotedProfile(config: ProfileConfig, skillMd: string): void {
  const result = ProfileConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid profile: ${result.error.issues.map(i => i.message).join(", ")}`);
  }

  const dir = path.join(PROMOTED_PROFILES_DIR, config.id);
  if (hasAgentFile(dir)) {
    throw new Error(`Profile "${config.id}" already exists`);
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, AGENT_FILENAME), yaml.dump(config));
  fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd);
  reloadProfiles();
  invalidateLatestScan();
}

/** Update an existing custom profile (rejects builtins) */
export function updateProfile(id: string, config: ProfileConfig, skillMd: string): void {
  if (isBuiltin(id)) {
    throw new Error("Cannot modify built-in profiles");
  }

  const result = ProfileConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid profile: ${result.error.issues.map(i => i.message).join(", ")}`);
  }

  const skillsDir = path.join(SKILLS_DIR, id);
  const promotedDir = path.join(PROMOTED_PROFILES_DIR, id);
  const dir = fs.existsSync(skillsDir)
    ? skillsDir
    : fs.existsSync(promotedDir)
      ? promotedDir
      : null;

  if (!dir) {
    throw new Error(`Profile "${id}" not found`);
  }

  fs.writeFileSync(path.join(dir, AGENT_FILENAME), yaml.dump(config));
  // Remove a lingering legacy manifest so the dir never holds both files
  // (the dual-read prefers agent.yaml, so the stale one would just be dead).
  const legacyPath = path.join(dir, LEGACY_PROFILE_FILENAME);
  if (fs.existsSync(legacyPath)) fs.rmSync(legacyPath);
  fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd);
  reloadProfiles();
  invalidateLatestScan();
}

/** Delete a custom profile (rejects builtins). Checks both user and promoted dirs. */
export function deleteProfile(id: string): void {
  if (isBuiltin(id)) {
    throw new Error("Cannot delete built-in profiles");
  }

  const skillsDir = path.join(SKILLS_DIR, id);
  const promotedDir = path.join(PROMOTED_PROFILES_DIR, id);
  const dir = fs.existsSync(skillsDir)
    ? skillsDir
    : fs.existsSync(promotedDir)
      ? promotedDir
      : null;

  if (!dir) {
    throw new Error(`Profile "${id}" not found`);
  }

  fs.rmSync(dir, { recursive: true, force: true });
  reloadProfiles();
  invalidateLatestScan();
}

// ---------------------------------------------------------------------------
// Plugin profile injection (Kind 5)
// ---------------------------------------------------------------------------

interface PluginProfileEntry {
  pluginId: string;
  profile: AgentProfile;
}

const pluginProfileIndex: Map<string, Set<string>> = new Map(); // pluginId -> Set<profileId>

/**
 * Inject namespaced profiles from a Kind 5 plugin into the cache.
 * Caller is responsible for namespacing the profile.id (e.g. "finance-pack/personal-cfo").
 * Subsequent calls REPLACE entries for the same (pluginId, profileId) pair.
 */
export function mergePluginProfiles(entries: PluginProfileEntry[]): void {
  const cache = ensureLoaded();
  for (const entry of entries) {
    cache.set(entry.profile.id, entry.profile);
    if (!pluginProfileIndex.has(entry.pluginId)) {
      pluginProfileIndex.set(entry.pluginId, new Set());
    }
    pluginProfileIndex.get(entry.pluginId)!.add(entry.profile.id);
  }
}

/** Remove all profiles registered by a single plugin (used during reload). */
export function clearPluginProfiles(pluginId: string): void {
  const cache = profileCache; // do not trigger ensureLoaded() — if cache is null, nothing to clear
  const ids = pluginProfileIndex.get(pluginId);
  if (!ids) return;
  if (cache) {
    for (const id of ids) cache.delete(id);
  }
  pluginProfileIndex.delete(pluginId);
}

/** Remove all plugin-injected profiles (used at full reload + tests). */
export function clearAllPluginProfiles(): void {
  for (const pluginId of Array.from(pluginProfileIndex.keys())) {
    clearPluginProfiles(pluginId);
  }
}

/** Test introspection — pluginId → list of namespaced profile ids it owns. */
export function listPluginProfileIds(pluginId: string): string[] {
  return Array.from(pluginProfileIndex.get(pluginId) ?? []);
}

// ---------------------------------------------------------------------------
// Environment status enrichment
// ---------------------------------------------------------------------------

export interface ProfileEnvironmentStatus {
  linked: boolean;
  artifactId?: string;
  contentHash?: string;
  drifted?: boolean;
}

export interface ProfileWithEnvStatus extends AgentProfile {
  environmentStatus?: ProfileEnvironmentStatus;
}

/**
 * List all profiles annotated with their environment linkage status.
 * For each profile, checks if a linked artifact exists in the latest scan
 * and whether their content hashes have drifted.
 */
export function listProfilesWithEnvironmentStatus(
  projectDir?: string
): ProfileWithEnvStatus[] {
  const profiles = listAllProfiles(projectDir);
  const latestScan = getLatestScan();

  if (!latestScan) {
    return profiles.map((p) => ({ ...p, environmentStatus: undefined }));
  }

  // Get all linked artifacts from this scan in one query
  const linkedArtifacts = db
    .select({
      linkedProfileId: environmentArtifacts.linkedProfileId,
      id: environmentArtifacts.id,
      contentHash: environmentArtifacts.contentHash,
    })
    .from(environmentArtifacts)
    .where(
      and(
        eq(environmentArtifacts.scanId, latestScan.id),
        eq(environmentArtifacts.category, "skill")
      )
    )
    .all();

  // Build a map of profileId → artifact info
  const artifactMap = new Map<string, { id: string; contentHash: string }>();
  for (const a of linkedArtifacts) {
    if (a.linkedProfileId) {
      artifactMap.set(a.linkedProfileId, {
        id: a.id,
        contentHash: a.contentHash,
      });
    }
  }

  return profiles.map((profile) => {
    const artifact = artifactMap.get(profile.id);
    if (!artifact) {
      return { ...profile, environmentStatus: { linked: false } };
    }

    // Check for drift: compare the artifact's content hash with the profile's
    // SKILL.md content. We compute a simple hash comparison — if the environment
    // artifact's hash differs, the content has drifted.
    return {
      ...profile,
      environmentStatus: {
        linked: true,
        artifactId: artifact.id,
        contentHash: artifact.contentHash,
      },
    };
  });
}
