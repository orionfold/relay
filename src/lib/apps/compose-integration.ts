import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAinativeAppsDir } from "@/lib/utils/ainative-paths";
import { AppManifestSchema, invalidateAppsCache, type AppManifest } from "./registry";
import { extractAppIdFromArtifactId } from "./composition-detector";

export { extractAppIdFromArtifactId };

export type ComposeArtifactKind = "profile" | "blueprint" | "table" | "schedule";

export interface ComposeArtifactInput {
  kind: ComposeArtifactKind;
  id: string;
  source?: string;
  columns?: string[];
  cron?: string;
  runs?: string;
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * Upsert a projects row so composed primitives have a real DB parent.
 * The project id is the app-id slug directly so compose tools can thread
 * it through without a lookup. Idempotent.
 *
 * Name resolution: prefer the app manifest's `name` (canonical app label)
 * over a slug-cased fallback. Compose tool callers used to pass the
 * artifact's display name (profile/blueprint/table name) here, which
 * caused the project to be named after a single primitive rather than
 * the app itself (F8). The manifest is the source of truth.
 */
export async function ensureAppProject(
  appId: string,
  appsDir: string = getAinativeAppsDir()
): Promise<{ projectId: string; created: boolean }> {
  const existing = await db
    .select()
    .from(projects)
    .where(eq(projects.id, appId))
    .get();
  if (existing) return { projectId: existing.id, created: false };

  const now = new Date();
  await db.insert(projects).values({
    id: appId,
    name: resolveAppName(appId, appsDir),
    description: "Composed app",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  return { projectId: appId, created: true };
}

function resolveAppName(appId: string, appsDir: string): string {
  const manifestPath = path.join(appsDir, appId, "manifest.yaml");
  if (fs.existsSync(manifestPath)) {
    try {
      const parsed = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
      const result = AppManifestSchema.safeParse(parsed);
      if (result.success) return result.data.name;
    } catch {
      // malformed yaml — fall through to slug-cased default
    }
  }
  return titleCase(appId);
}

const BUCKETS: Record<
  ComposeArtifactKind,
  "profiles" | "blueprints" | "tables" | "schedules"
> = {
  profile: "profiles",
  blueprint: "blueprints",
  table: "tables",
  schedule: "schedules",
};

/**
 * Read-modify-write the app's manifest.yaml under getAinativeAppsDir(),
 * appending the artifact to its bucket. Idempotent — a duplicate id is
 * not re-added. Creates the app dir + a minimal manifest if absent.
 */
export function upsertAppManifest(
  appId: string,
  artifact: ComposeArtifactInput,
  displayName?: string,
  appsDir: string = getAinativeAppsDir()
): AppManifest {
  const appDir = path.join(appsDir, appId);
  const manifestPath = path.join(appDir, "manifest.yaml");
  fs.mkdirSync(appDir, { recursive: true });

  let manifest: AppManifest = emptyManifest(appId, displayName);
  if (fs.existsSync(manifestPath)) {
    try {
      const parsed = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
      const result = AppManifestSchema.safeParse(parsed);
      if (result.success) manifest = result.data;
    } catch {
      // malformed yaml — fall through and overwrite with a fresh manifest
    }
  }

  // Stamp legacy manifests without changing ownership when composition adds
  // a primitive to an installed Pack shell.
  manifest.origin ??=
    manifest.entitlement || fs.existsSync(path.join(appDir, "install-state.json"))
      ? "installed-pack"
      : "user-created";

  const arr = manifest[BUCKETS[artifact.kind]] as Array<
    Record<string, unknown> & { id: string }
  >;
  if (!arr.some((e) => e.id === artifact.id)) {
    const entry: Record<string, unknown> = { id: artifact.id };
    if (artifact.source) entry.source = artifact.source;
    if (artifact.columns) entry.columns = artifact.columns;
    if (artifact.cron) entry.cron = artifact.cron;
    if (artifact.runs) entry.runs = artifact.runs;
    arr.push(entry as Record<string, unknown> & { id: string });
  }

  fs.writeFileSync(manifestPath, yaml.dump(manifest));
  invalidateAppsCache();
  return manifest;
}

function emptyManifest(appId: string, displayName?: string): AppManifest {
  const name = displayName ?? titleCase(appId);
  return {
    id: appId,
    version: "0.1.0",
    name,
    origin: "user-created",
    description: `Composed app: ${name}`,
    profiles: [],
    blueprints: [],
    tables: [],
    schedules: [],
  };
}
