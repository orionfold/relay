import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import {
  getAinativeAppsDir,
  getAinativeBlueprintsDir,
  getAinativeProfilesDir,
} from "@/lib/utils/ainative-paths";

const AppArtifactRefSchema = z
  .object({
    id: z.string(),
    source: z.string().optional(),
  })
  .passthrough();

/**
 * Blueprint-specific artifact ref. Extends `AppArtifactRefSchema` with an
 * optional `trigger` field that describes how the blueprint fires. The trigger
 * object is strictly validated so unknown kinds or missing required fields are
 * caught at manifest-parse time rather than at runtime.
 *
 * Phase 4: only `row-insert` is supported. Additional kinds (e.g. `webhook`)
 * require a code change — not a manifest hack.
 */
const AppBlueprintRefSchema = z
  .object({
    id: z.string(),
    source: z.string().optional(),
    trigger: z
      .object({
        kind: z.literal("row-insert"),
        table: z.string().min(1),
      })
      .optional(),
  })
  .passthrough();

/**
 * `view:` is the only place where layout intent enters the manifest. Every
 * other manifest schema is `.passthrough()`; this one is `.strict()` so it
 * cannot drift into an HTML/styling escape hatch. KPI sources are an
 * enumerated discriminated union, not formula strings — new kinds require a
 * code change, not a manifest hack. No formula strings, no HTML, no component
 * refs — kit-specific binding shapes go in the kit's resolver, not here.
 */
export const KitIdSchema = z.enum([
  "auto",
  "tracker",
  "coach",
  "inbox",
  "research",
  "ledger",
  "workflow-hub",
]);

export type ManifestKitId = z.infer<typeof KitIdSchema>;

const BindingRefSchema = z.union([
  z.object({ table: z.string() }).strict(),
  z.object({ blueprint: z.string() }).strict(),
  z.object({ schedule: z.string() }).strict(),
  z.object({ profile: z.string() }).strict(),
]);

const LeafKpiSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tableCount"),
    table: z.string(),
    where: z.string().optional(),
  }),
  z.object({
    kind: z.literal("tableSum"),
    table: z.string(),
    column: z.string(),
  }),
  z.object({
    kind: z.literal("tableLatest"),
    table: z.string(),
    column: z.string(),
  }),
  z.object({
    kind: z.literal("blueprintRunCount"),
    blueprint: z.string(),
    window: z.enum(["7d", "30d"]).default("7d"),
  }),
  z.object({
    kind: z.literal("scheduleNextFire"),
    schedule: z.string(),
  }),
  z.object({
    kind: z.literal("tableSumWindowed"),
    table: z.string().min(1),
    column: z.string().min(1),
    sign: z.enum(["positive", "negative"]).optional(),
    window: z.enum(["mtd", "qtd", "ytd"]).optional(),
  }),
]);

const RatioKpiSourceSchema = z.object({
  kind: z.literal("ratio"),
  numerator: LeafKpiSourceSchema,
  denominator: LeafKpiSourceSchema,
});

const KpiSourceSchema = z.union([LeafKpiSourceSchema, RatioKpiSourceSchema]);

export const KpiSpecSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: KpiSourceSchema,
  format: z.enum(["int", "currency", "percent", "duration", "relative"]).default("int"),
});

export const ViewSchema = z
  .object({
    kit: KitIdSchema.default("auto"),
    bindings: z
      .object({
        hero: BindingRefSchema.optional(),
        secondary: z.array(BindingRefSchema).optional(),
        cadence: BindingRefSchema.optional(),
        runs: BindingRefSchema.optional(),
        kpis: z.array(KpiSpecSchema).optional(),
      })
      .strict()
      .default({}),
    hideManifestPane: z.boolean().default(false),
  })
  .strict();

export type ViewConfig = z.infer<typeof ViewSchema>;

const AppTableRefSchema = z
  .object({
    id: z.string(),
    columns: z.array(z.string()).optional(),
    seed: z.string().optional(),
  })
  .passthrough();

const AppScheduleRefSchema = z
  .object({
    id: z.string(),
    cron: z.string().optional(),
    runs: z.string().optional(),
  })
  .passthrough();

export const AppManifestSchema = z
  .object({
    id: z.string(),
    version: z.string().optional(),
    name: z.string(),
    description: z.string().optional(),
    persona: z.string().optional(),
    author: z.string().optional(),
    profiles: z.array(AppArtifactRefSchema).optional().default([]),
    blueprints: z.array(AppBlueprintRefSchema).optional().default([]),
    tables: z.array(AppTableRefSchema).optional().default([]),
    schedules: z.array(AppScheduleRefSchema).optional().default([]),
    permissions: z
      .object({ preset: z.string().optional() })
      .passthrough()
      .optional(),
    view: ViewSchema.optional(),
  })
  .passthrough();

export type AppManifest = z.infer<typeof AppManifestSchema>;

export interface AppSummary {
  id: string;
  name: string;
  description: string | null;
  rootDir: string;
  primitivesSummary: string;
  profileCount: number;
  blueprintCount: number;
  tableCount: number;
  scheduleCount: number;
  scheduleHuman: string | null;
  createdAt: number;
  files: string[];
}

export interface AppDetail extends AppSummary {
  manifest: AppManifest;
}

export function parseAppManifest(yamlText: string): AppManifest | null {
  try {
    const parsed = yaml.load(yamlText);
    const result = AppManifestSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const DOW: Record<string, string> = {
  "0": "Sunday", "1": "Monday", "2": "Tuesday", "3": "Wednesday",
  "4": "Thursday", "5": "Friday", "6": "Saturday", "7": "Sunday",
};

export function humanizeCron(cron: string): string | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;
  const h = Number.parseInt(hour, 10);
  const m = Number.parseInt(min, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const period = h >= 12 ? "pm" : "am";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const timeStr = m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
  if (dow !== "*" && DOW[dow]) return `${DOW[dow]} ${timeStr}`;
  if (dom === "*" && mon === "*") return `daily ${timeStr}`;
  return timeStr;
}

function pluralize(count: number, one: string, many: string): string {
  return count === 1 ? one : `${count} ${many}`;
}

export function buildPrimitivesSummary(manifest: AppManifest): string {
  const parts: string[] = [];
  const profileCount = manifest.profiles.length;
  const blueprintCount = manifest.blueprints.length;
  const tableCount = manifest.tables.length;
  const scheduleCount = manifest.schedules.length;

  if (profileCount > 0) {
    parts.push(pluralize(profileCount, "Profile", "profiles"));
  }
  if (blueprintCount > 0) {
    parts.push(pluralize(blueprintCount, "Blueprint", "blueprints"));
  }
  if (tableCount > 0) {
    parts.push(pluralize(tableCount, "1 table", "tables"));
  }
  if (scheduleCount > 0) {
    const firstCron = manifest.schedules[0].cron;
    const human = firstCron ? humanizeCron(firstCron) : null;
    if (human) {
      parts.push(`${human} schedule`);
    } else {
      parts.push(pluralize(scheduleCount, "Schedule", "schedules"));
    }
  }
  return parts.join(" · ");
}

function collectFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function manifestToSummary(manifest: AppManifest, rootDir: string): AppSummary {
  const manifestPath = path.join(rootDir, "manifest.yaml");
  let createdAt = 0;
  try {
    createdAt = fs.statSync(manifestPath).mtimeMs;
  } catch {
    // leave 0
  }
  const firstCron = manifest.schedules[0]?.cron;
  const scheduleHuman = firstCron ? humanizeCron(firstCron) : null;
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description ?? null,
    rootDir,
    primitivesSummary: buildPrimitivesSummary(manifest),
    profileCount: manifest.profiles.length,
    blueprintCount: manifest.blueprints.length,
    tableCount: manifest.tables.length,
    scheduleCount: manifest.schedules.length,
    scheduleHuman,
    createdAt,
    files: collectFiles(rootDir).sort(),
  };
}

export function listApps(appsDir: string = getAinativeAppsDir()): AppSummary[] {
  if (!fs.existsSync(appsDir)) return [];
  const out: AppSummary[] = [];
  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rootDir = path.join(appsDir, entry.name);
    const manifestPath = path.join(rootDir, "manifest.yaml");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const text = fs.readFileSync(manifestPath, "utf-8");
      const manifest = parseAppManifest(text);
      if (!manifest) continue;
      out.push(manifestToSummary(manifest, rootDir));
    } catch {
      continue;
    }
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

const APPS_CACHE_TTL_MS = 5_000;

interface AppsCacheEntry {
  apps: AppSummary[];
  expiresAt: number;
}

const appsCache = new Map<string, AppsCacheEntry>();

/**
 * Cached listApps() with a 5-second TTL, scoped per appsDir.
 *
 * Used by row-insert dispatch on the hot path. Invalidate via
 * `invalidateAppsCache()` from `upsertAppManifest` and `deleteApp`
 * so structural changes aren't masked.
 */
export function listAppsCached(
  appsDir: string = getAinativeAppsDir()
): AppSummary[] {
  const now = Date.now();
  const cached = appsCache.get(appsDir);
  if (cached && cached.expiresAt > now) {
    return cached.apps;
  }
  const apps = listApps(appsDir);
  appsCache.set(appsDir, { apps, expiresAt: now + APPS_CACHE_TTL_MS });
  return apps;
}

interface AppsDetailCacheEntry {
  apps: AppDetail[];
  expiresAt: number;
}

const appsDetailCache = new Map<string, AppsDetailCacheEntry>();

/**
 * Like `listAppsCached` but returns `AppDetail` entries with the parsed
 * `manifest` field hydrated. Used by row-insert dispatch which needs to
 * inspect `manifest.blueprints` to find subscriptions.
 *
 * Cached separately from `listAppsCached` because the AppDetail shape is
 * heavier; both caches are cleared by `invalidateAppsCache()`.
 */
export function listAppsWithManifestsCached(
  appsDir: string = getAinativeAppsDir()
): AppDetail[] {
  const now = Date.now();
  const cached = appsDetailCache.get(appsDir);
  if (cached && cached.expiresAt > now) {
    return cached.apps;
  }

  const apps: AppDetail[] = [];
  if (!fs.existsSync(appsDir)) {
    appsDetailCache.set(appsDir, { apps, expiresAt: now + APPS_CACHE_TTL_MS });
    return apps;
  }

  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const rootDir = path.join(appsDir, entry.name);
    const manifestPath = path.join(rootDir, "manifest.yaml");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const text = fs.readFileSync(manifestPath, "utf-8");
      const manifest = parseAppManifest(text);
      if (!manifest) continue;
      apps.push({ ...manifestToSummary(manifest, rootDir), manifest });
    } catch {
      continue;
    }
  }

  apps.sort((a, b) => b.createdAt - a.createdAt);
  appsDetailCache.set(appsDir, { apps, expiresAt: now + APPS_CACHE_TTL_MS });
  return apps;
}

/**
 * Drops all cached entries. Call after any manifest mutation
 * (`upsertAppManifest`, `deleteApp`) so the next `listAppsCached`
 * returns fresh data.
 */
export function invalidateAppsCache(): void {
  appsCache.clear();
  appsDetailCache.clear();
}

export function getApp(
  id: string,
  appsDir: string = getAinativeAppsDir()
): AppDetail | null {
  const rootDir = path.join(appsDir, id);
  const manifestPath = path.join(rootDir, "manifest.yaml");
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const text = fs.readFileSync(manifestPath, "utf-8");
    const manifest = parseAppManifest(text);
    if (!manifest) return null;
    return { ...manifestToSummary(manifest, rootDir), manifest };
  } catch {
    return null;
  }
}

/**
 * Atomic manifest write — temp-file + rename so a mid-write failure cannot
 * corrupt manifest.yaml. Validates against the strict `AppManifestSchema`
 * before write, so LLM-hallucinated `view:` shapes (or any other schema
 * violation) fail loudly rather than producing a half-valid file on disk.
 *
 * Used by the view-editing chat tools to mutate `manifest.view` safely
 * without race-prone partial overwrites. The cache is invalidated on
 * success so the dispatcher and `useApps()` see the new layout immediately.
 *
 * Throws when:
 *   - the app dir does not exist
 *   - the manifest fails strict-schema validation
 *   - the underlying fs write or rename fails (caller is expected to surface
 *     the error to the user; the temp file is cleaned up on failure)
 */
export function writeAppManifest(
  id: string,
  manifest: AppManifest,
  appsDir: string = getAinativeAppsDir()
): void {
  const rootDir = path.join(appsDir, id);
  const manifestPath = path.join(rootDir, "manifest.yaml");
  if (!fs.existsSync(rootDir)) {
    throw new Error(`App not found: ${id}`);
  }
  // Validate first so a thrown ZodError doesn't leave a temp file behind.
  const validated = AppManifestSchema.parse(manifest);
  const tmpPath = `${manifestPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmpPath, yaml.dump(validated), "utf-8");
    fs.renameSync(tmpPath, manifestPath);
  } catch (err) {
    // Clean up the temp file if rename failed — we don't want orphaned
    // .tmp files cluttering the app dir.
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // tmp file may not exist if writeFileSync was the failure point
    }
    throw err;
  }
  invalidateAppsCache();
}

export function deleteApp(
  id: string,
  appsDir: string = getAinativeAppsDir()
): boolean {
  const resolvedApps = path.resolve(appsDir);
  const rootDir = path.resolve(appsDir, id);
  if (!rootDir.startsWith(resolvedApps + path.sep)) return false;
  if (!fs.existsSync(rootDir)) return false;
  fs.rmSync(rootDir, { recursive: true, force: true });
  invalidateAppsCache();
  return true;
}

export interface DeleteAppCascadeResult {
  /** True if the manifest directory was successfully removed. */
  filesRemoved: boolean;
  /** True if a DB project with id === appId existed and its rows were cascaded. */
  projectRemoved: boolean;
  /** Number of `<appId>--*` profile dirs removed from the profiles dir. */
  profilesRemoved: number;
  /** Number of `<appId>--*.yaml` blueprint files removed from the blueprints dir. */
  blueprintsRemoved: number;
}

export interface DeleteAppCascadeOptions {
  appsDir?: string;
  profilesDir?: string;
  blueprintsDir?: string;
  /** Injected for tests; defaults to the real DB-backed deleteProjectCascade. */
  deleteProjectFn?: (projectId: string) => boolean;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

function sweepNamespacedProfiles(profilesDir: string, appId: string): number {
  if (!fs.existsSync(profilesDir)) return 0;
  const resolvedProfiles = path.resolve(profilesDir);
  const prefix = `${appId}--`;
  let removed = 0;
  for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (!entry.name.startsWith(prefix)) continue;
    const target = path.resolve(profilesDir, entry.name);
    if (!target.startsWith(resolvedProfiles + path.sep)) continue;
    fs.rmSync(target, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

function sweepNamespacedBlueprints(blueprintsDir: string, appId: string): number {
  if (!fs.existsSync(blueprintsDir)) return 0;
  const resolvedBlueprints = path.resolve(blueprintsDir);
  const prefix = `${appId}--`;
  let removed = 0;
  for (const entry of fs.readdirSync(blueprintsDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith(prefix)) continue;
    if (!entry.name.endsWith(".yaml")) continue;
    const target = path.resolve(blueprintsDir, entry.name);
    if (!target.startsWith(resolvedBlueprints + path.sep)) continue;
    fs.rmSync(target, { force: true });
    removed += 1;
  }
  return removed;
}

/**
 * Cascade-delete an app: removes its DB project (and all FK-dependent rows)
 * via deleteProjectCascade, removes the manifest dir on disk, then sweeps
 * `<appId>--*` profile dirs and `<appId>--*.yaml` blueprint files from the
 * shared `~/.ainative/profiles/` and `~/.ainative/blueprints/` directories.
 *
 * All four halves are independent — a missing piece is not an error. The
 * result reports which halves removed something.
 */
export async function deleteAppCascade(
  appId: string,
  options: DeleteAppCascadeOptions = {}
): Promise<DeleteAppCascadeResult> {
  const appsDir = options.appsDir ?? getAinativeAppsDir();
  const profilesDir = options.profilesDir ?? getAinativeProfilesDir();
  const blueprintsDir = options.blueprintsDir ?? getAinativeBlueprintsDir();

  const empty: DeleteAppCascadeResult = {
    filesRemoved: false,
    projectRemoved: false,
    profilesRemoved: 0,
    blueprintsRemoved: 0,
  };

  const resolvedApps = path.resolve(appsDir);
  const rootDir = path.resolve(appsDir, appId);
  if (!rootDir.startsWith(resolvedApps + path.sep)) {
    return empty;
  }
  // Defense-in-depth: only sweep namespaced files when appId is a clean slug.
  if (!SLUG_RE.test(appId)) {
    return empty;
  }

  let projectRemoved = false;
  if (options.deleteProjectFn) {
    projectRemoved = options.deleteProjectFn(appId);
  } else {
    const mod = await import("@/lib/data/delete-project");
    projectRemoved = mod.deleteProjectCascade(appId);
  }

  const filesRemoved = deleteApp(appId, appsDir);
  const profilesRemoved = sweepNamespacedProfiles(profilesDir, appId);
  const blueprintsRemoved = sweepNamespacedBlueprints(blueprintsDir, appId);

  return { projectRemoved, filesRemoved, profilesRemoved, blueprintsRemoved };
}
