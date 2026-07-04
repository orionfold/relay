import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { SUPPORTED_AGENT_RUNTIMES } from "@/lib/agents/runtime/catalog";
import { AppManifestSchema } from "@/lib/apps/registry";
import type { AgentProfile } from "./types";
import { hasAgentFile } from "./agent-file";

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function loadAppManifestProfiles(
  appsDir: string,
  profilesDir: string,
  builtinsDir: string
): AgentProfile[] {
  if (!fs.existsSync(appsDir)) return [];

  const synthesized = new Map<string, AgentProfile>();

  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const appId = entry.name;
    const manifestPath = path.join(appsDir, appId, "manifest.yaml");
    if (!fs.existsSync(manifestPath)) continue;

    let manifest: ReturnType<typeof AppManifestSchema.safeParse>;
    try {
      const parsed = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
      manifest = AppManifestSchema.safeParse(parsed);
    } catch (err) {
      console.warn(`[app-manifest-source] Malformed manifest for ${appId}:`, err);
      continue;
    }
    if (!manifest.success) {
      console.warn(`[app-manifest-source] Invalid manifest for ${appId}`);
      continue;
    }

    for (const profileRef of manifest.data.profiles ?? []) {
      const profileId = profileRef.id;

      // Shadow check: skip if a real agent manifest (agent.yaml or legacy
      // profile.yaml) exists for this id as a user file or a builtin.
      if (
        hasAgentFile(path.join(profilesDir, profileId)) ||
        hasAgentFile(path.join(builtinsDir, profileId))
      )
        continue;

      // Collision: keep first synthesis, append app id to tags
      const existing = synthesized.get(profileId);
      if (existing) {
        if (!existing.tags.includes(appId)) {
          existing.tags = [...existing.tags, appId];
        }
        continue;
      }

      const refRecord = profileRef as Record<string, unknown>;
      const name =
        typeof refRecord.name === "string" ? refRecord.name : titleCase(profileId);
      const description =
        typeof refRecord.description === "string" ? refRecord.description : "";

      synthesized.set(profileId, {
        id: profileId,
        name,
        description,
        domain: "work",
        tags: [appId],
        systemPrompt: description,
        skillMd: "",
        supportedRuntimes: [...SUPPORTED_AGENT_RUNTIMES],
        scope: "user",
        origin: "import",
        readOnly: true,
      });
    }
  }

  return Array.from(synthesized.values());
}
