// src/lib/plugins/registry.ts
//
// FROZEN SCOPE (_SPECS/feature-cut-freeze.md Target 4 · _IDEAS/reprioritze.md §4)
// Plugin fall-through is the config-over-code *escape hatch*, not a first-class
// path. Maintain-only: do not invest in DX that makes plugins the easy default —
// the moment plugins feel first-class, the config-over-code promise erodes.
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { PluginManifestSchema, CURRENT_PLUGIN_API_VERSION, type LoadedPlugin, type PluginManifest, type PluginTableTemplate } from "./sdk/types";
import { getAinativePluginsDir, getAinativeLogsDir } from "@/lib/utils/ainative-paths";
import {
  mergePluginProfiles,
  clearAllPluginProfiles,
  clearPluginProfiles,
  scanProfilesIntoMap,
} from "@/lib/agents/profiles/registry";
import type { AgentProfile } from "@/lib/agents/profiles/types";
import { BlueprintSchema } from "@/lib/validators/blueprint";
import {
  mergePluginBlueprints,
  clearAllPluginBlueprints,
  clearPluginBlueprints,
  validateBlueprintRefs,
} from "@/lib/workflows/blueprints/registry";
import type { WorkflowBlueprint } from "@/lib/workflows/blueprints/types";
import { installPluginTables, removePluginTables } from "@/lib/data/seed-data/table-templates";
import {
  mergePluginSchedules,
  clearAllPluginSchedules,
  clearPluginSchedules,
  validateScheduleRefs,
} from "@/lib/schedules/registry";
import { installPluginSchedules, removePluginSchedules, removeOrphanSchedules } from "@/lib/schedules/installer";
import { ScheduleSpecSchema } from "@/lib/validators/schedule-spec";
import type { ScheduleSpec } from "@/lib/validators/schedule-spec";

// apiVersion compatibility window. A plugin's manifest.apiVersion must
// be in this set or the plugin is disabled with reason "apiVersion_mismatch".
//
// Bump checklist (every chore(release) MAJOR or MINOR commit):
//   1. When MINOR bumps (N → N+1): ADD the new MINOR string here.
//   2. Drop a MINOR only when orionfold-relay is 2 MINORs ahead of it.
//   3. NEVER drop a MINOR in the same release that adds the next one.
//
// Self-enforcing: api-version-window.test.ts reads package.json and
// asserts the current and previous MINOR are present. Drop a value or
// forget to widen on bump → test fails.
//
// Maintenance: bump CURRENT_PLUGIN_API_VERSION (sdk/types.ts) and the
// previous-MINOR literal here on every MINOR release (the window went
// unfixed from 0.15.0 through 0.16.0 — treat the window test's failure as
// a release blocker, not noise). The 0.13→0.14 three-MINOR bridge is over;
// this is the standard 2-MINOR window now.
const SUPPORTED_API_VERSIONS = new Set([CURRENT_PLUGIN_API_VERSION, "0.33"]);

/** Test-helper export so the window-enforcement test can read state. */
export function isSupportedApiVersion(apiVersion: string): boolean {
  return SUPPORTED_API_VERSIONS.has(apiVersion);
}

let pluginCache: LoadedPlugin[] | null = null;

// T9: Track the ids of plugins whose tables we installed in the most recent
// scan. The cache itself is invalidated lazily by `reloadPlugins()`, so we
// can't rely on `pluginCache` to know which DB rows to clear before re-scanning.
// This separate tracker survives `pluginCache = null` and lets the reload
// drop stale rows owned by bundles that were removed between scans.
let lastLoadedPluginIds: Set<string> = new Set();

function logToFile(line: string): void {
  try {
    const logsDir = getAinativeLogsDir();
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(
      path.join(logsDir, "plugins.log"),
      `${new Date().toISOString()} ${line}\n`
    );
  } catch {
    /* swallow log errors */
  }
}

function readManifest(rootDir: string): { manifest?: PluginManifest; error?: string } {
  const manifestPath = path.join(rootDir, "plugin.yaml");
  if (!fs.existsSync(manifestPath)) return { error: "missing plugin.yaml" };
  let raw: unknown;
  try {
    raw = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    return { error: `yaml_parse: ${err instanceof Error ? err.message : String(err)}` };
  }
  const parsed = PluginManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  return { manifest: parsed.data };
}

function discoverBundleRoots(): string[] {
  const baseDir = getAinativePluginsDir();
  if (!fs.existsSync(baseDir)) return [];
  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(baseDir, e.name))
    .sort();
}

/**
 * Generic per-section scanner: walks `<rootDir>/<section>/` for `.yaml`/`.yml`
 * files, invokes `parseFile(absPath)` on each, and returns the non-null
 * results in readdir order.
 *
 * File-level concerns only:
 *   - directory existence check (missing → `[]`)
 *   - yaml/yml extension filter (non-yaml silently skipped)
 *   - try/catch around `parseFile` (throws logged via console.warn, file skipped)
 *   - null-return handling (silently skipped, no warning)
 *
 * Per-section concerns stay in the callers: namespacing, validation,
 * cross-reference resolution, structured log-to-file warnings. Callers that
 * want to surface a parse error via the `[plugins] Error in ...` warning
 * branch should throw from `parseFile`; callers that want a silent skip
 * (e.g. after emitting their own structured warning) should return `null`.
 *
 * Generic over `T` so each caller gets back exactly the shape it constructed
 * — no forced wrapping, no post-processing. The three existing sections
 * (profiles, blueprints, tables) and the incoming schedules scanner all
 * return different shapes; a uniform helper would force unnatural mappings.
 */
export function scanBundleSection<T>(opts: {
  rootDir: string;
  section: "profiles" | "blueprints" | "tables" | "schedules";
  parseFile: (filePath: string) => T | null;
}): T[] {
  const dir = path.join(opts.rootDir, opts.section);
  if (!fs.existsSync(dir)) return [];
  const out: T[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    const filePath = path.join(dir, file);
    try {
      const result = opts.parseFile(filePath);
      if (result !== null) out.push(result);
    } catch (err) {
      console.warn(`[plugins] Error in ${opts.section}/${file}:`, err);
    }
  }
  return out;
}

/**
 * Scan a single bundle's profiles/ directory using the canonical profile
 * scanner with namespace support. Reusing the canonical scanner means
 * plugin profiles get IDENTICAL treatment to builtins (SKILL.md frontmatter
 * extraction, multi-runtime inference, origin classification, tests, etc).
 * Hand-rolling the construction here would silently drop these features.
 *
 * NOTE (M2 refactor): this function is NOT an adapter over `scanBundleSection`.
 * The canonical profile scanner (`scanProfilesIntoMap`) is directory-scoped,
 * not file-scoped — it does its own directory walk to support SKILL.md
 * sibling discovery and multi-runtime inference. Shoehorning it into a
 * per-file `parseFile` closure would either (a) duplicate the walk and
 * break identity with builtin profile loading, or (b) require refactoring
 * `scanProfilesIntoMap` itself, which is out of scope for this extraction.
 * Leaving as-is preserves the "IDENTICAL treatment to builtins" guarantee.
 */
function scanBundleProfiles(
  rootDir: string,
  pluginId: string
): Array<{ namespacedId: string; profile: AgentProfile }> {
  const profilesDir = path.join(rootDir, "profiles");
  if (!fs.existsSync(profilesDir)) return [];
  const tmp = new Map<string, AgentProfile>();
  scanProfilesIntoMap(profilesDir, tmp, { namespace: pluginId });
  return Array.from(tmp.entries()).map(([id, profile]) => ({
    namespacedId: id,
    profile,
  }));
}

/**
 * Scan a single bundle's blueprints/ directory. Each YAML is namespaced
 * `<pluginId>/<localId>` and validated against BlueprintSchema. Cross-ref
 * validation (via validateBlueprintRefs) ensures profile references resolve
 * either to a builtin profile, a same-plugin sibling, or are rejected as
 * cross-plugin references.
 *
 * Skips (with log) on schema parse failure or unresolved ref. Bundle still
 * loads — only the offending blueprint is dropped.
 */
function scanBundleBlueprints(
  rootDir: string,
  pluginId: string,
  siblingProfileIds: Set<string>
): Array<{ namespacedId: string; blueprint: WorkflowBlueprint }> {
  return scanBundleSection<{ namespacedId: string; blueprint: WorkflowBlueprint }>({
    rootDir,
    section: "blueprints",
    parseFile: (filePath) => {
      const file = path.basename(filePath);
      // Catch yaml-parse + schema errors in-adapter so we preserve the existing
      // structured `logToFile` warning format. If we let the helper's catch
      // handle them, the warning would land on console.warn with a different
      // prefix — drift from M1 behavior.
      try {
        const raw = yaml.load(fs.readFileSync(filePath, "utf-8"));
        const parsed = BlueprintSchema.safeParse(raw);
        if (!parsed.success) {
          logToFile(`skip blueprint ${pluginId}/${file}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
          return null;
        }
        const namespacedId = `${pluginId}/${parsed.data.id}`;
        const blueprint = { ...parsed.data, id: namespacedId, isBuiltin: false } as unknown as WorkflowBlueprint;
        const refs = validateBlueprintRefs(blueprint, { pluginId, siblingProfileIds });
        if (!refs.ok) {
          logToFile(`skip blueprint ${namespacedId}: ${refs.error}`);
          return null;
        }
        return { namespacedId, blueprint };
      } catch (err) {
        logToFile(`skip blueprint ${pluginId}/${file}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
  });
}

/**
 * YAML-parsing schema for plugin table templates. Distinct from the runtime
 * `PluginTableTemplate` type because it provides defaults for description and
 * icon — plugin authors may omit either, and the loader fills in safe values.
 * The parsed shape is a superset of the runtime type, so the cast at the
 * bottom is sound.
 */
const PluginTableSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string(),
  description: z.string().default(""),
  category: z.enum(["business", "personal", "pm", "finance", "content"]),
  icon: z.string().default("Table"),
  columns: z.array(z.object({
    name: z.string(),
    displayName: z.string(),
    dataType: z.string(),
    config: z.record(z.string(), z.unknown()).optional(),
  })),
  sampleRows: z.array(z.record(z.string(), z.unknown())).optional(),
});

/**
 * Scan a single bundle's tables/ directory. Each YAML is validated against
 * PluginTableSchema; failures are logged and the offending file is dropped
 * (the rest of the bundle still loads). Returns parsed templates ready for
 * `installPluginTables` — the loader is responsible for the DB upsert and
 * for prefixing the namespaced ids that surface on the LoadedPlugin record.
 */
function scanBundleTables(rootDir: string, pluginId: string): PluginTableTemplate[] {
  return scanBundleSection<PluginTableTemplate>({
    rootDir,
    section: "tables",
    parseFile: (filePath) => {
      const file = path.basename(filePath);
      // Same reasoning as scanBundleBlueprints: in-adapter try/catch keeps the
      // `logToFile("skip table ...")` warning format byte-identical to M1.
      try {
        const raw = yaml.load(fs.readFileSync(filePath, "utf-8"));
        const parsed = PluginTableSchema.safeParse(raw);
        if (!parsed.success) {
          logToFile(`skip table ${pluginId}/${file}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
          return null;
        }
        return parsed.data as PluginTableTemplate;
      } catch (err) {
        logToFile(`skip table ${pluginId}/${file}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
  });
}

/**
 * Scan a single bundle's schedules/ directory. Each YAML is namespaced
 * `<pluginId>/<localId>` and validated against ScheduleSpecSchema. Cross-ref
 * validation (via validateScheduleRefs) ensures profile references resolve
 * either to a builtin profile, a same-plugin sibling, or are rejected as
 * cross-plugin references.
 *
 * Skips (with log) on schema parse failure or unresolved ref. Bundle still
 * loads — only the offending schedule is dropped.
 *
 * NOTE: this is a thin adapter over scanBundleSection<T>, mirroring the
 * pattern of scanBundleBlueprints. In-adapter try/catch keeps the logToFile
 * warning format consistent with the other sections.
 */
function scanBundleSchedules(
  rootDir: string,
  pluginId: string
): Array<{ namespacedId: string; spec: ScheduleSpec; file: string }> {
  return scanBundleSection<{ namespacedId: string; spec: ScheduleSpec; file: string }>({
    rootDir,
    section: "schedules",
    parseFile: (filePath) => {
      const file = path.basename(filePath);
      try {
        const raw = yaml.load(fs.readFileSync(filePath, "utf-8"));
        const parsed = ScheduleSpecSchema.safeParse(raw);
        if (!parsed.success) {
          logToFile(`skip schedule ${pluginId}/${file}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
          return null;
        }
        return { namespacedId: `${pluginId}/${parsed.data.id}`, spec: parsed.data, file };
      } catch (err) {
        logToFile(`skip schedule ${pluginId}/${file}: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
  });
}

/**
 * Per-bundle loader. Given an already-validated manifest + rootDir, runs the
 * profile/blueprint/table/schedule scan + merge + install steps and returns
 * the resulting `LoadedPlugin` record. Shared by `scanPlugins` (full scan)
 * and `reloadPlugin` (targeted single-bundle reload) so both paths produce
 * identical state — the only behavioral difference between them is which
 * bundles they iterate.
 *
 * Returns a "disabled" record (without touching primitive registries) when
 * apiVersion is unsupported. Manifest readability + duplicate-id dedupe are
 * the caller's responsibility.
 *
 * ASYNC NOTE (T10): `validateScheduleRefs` uses `await import()` to avoid the
 * TDR-032 cycle (schedules registry is on the boot path). This makes
 * loadOneBundle async, which cascades to scanPlugins → loadPlugins →
 * reloadPlugins → reloadPlugin. listPlugins / getPlugin remain sync (they
 * read pluginCache directly).
 */
async function loadOneBundle(rootDir: string, manifest: PluginManifest): Promise<LoadedPlugin> {
  if (!isSupportedApiVersion(manifest.apiVersion)) {
    logToFile(`disabled ${manifest.id}: apiVersion_mismatch (${manifest.apiVersion})`);
    return {
      id: manifest.id, manifest, rootDir,
      profiles: [], blueprints: [], tables: [], schedules: [],
      status: "disabled", error: "apiVersion_mismatch",
    };
  }

  // T7: scan bundle profiles, merge into the canonical profile registry,
  // and surface their namespaced ids on the LoadedPlugin record.
  const scannedProfiles = scanBundleProfiles(rootDir, manifest.id);
  mergePluginProfiles(
    scannedProfiles.map((s) => ({ pluginId: manifest.id, profile: s.profile }))
  );

  // T8: scan bundle blueprints, validate cross-references against sibling
  // profiles + builtins, merge into the canonical blueprint registry under
  // namespaced ids.
  const siblingProfileIds = new Set(scannedProfiles.map((s) => s.namespacedId));
  const scannedBlueprints = scanBundleBlueprints(rootDir, manifest.id, siblingProfileIds);
  mergePluginBlueprints(
    scannedBlueprints.map((s) => ({ pluginId: manifest.id, blueprint: s.blueprint }))
  );

  // T9: tables. Clear any stale rows owned by this plugin first, then
  // install fresh. `installPluginTables` writes to user_table_templates
  // with a composite id (plugin:<pluginId>:<tableId>) and suffixes the
  // display name with the plugin id to disambiguate collisions with builtins.
  removePluginTables(manifest.id);
  const scannedTables = scanBundleTables(rootDir, manifest.id);
  installPluginTables(manifest.id, scannedTables);
  const tableIds = scannedTables.map((t) => `plugin:${manifest.id}:${t.id}`);

  // T10: scan bundle schedules, validate cross-references against sibling
  // profiles + builtins, install into the schedules DB table under composite
  // ids (plugin:<pluginId>:<scheduleId>) and merge into the canonical schedule
  // registry cache. validateScheduleRefs is async (dynamic profile-registry
  // import for TDR-032 defense), so this block awaits per-spec.
  const scannedSchedules = scanBundleSchedules(rootDir, manifest.id);
  const validSchedules: ScheduleSpec[] = [];
  for (const s of scannedSchedules) {
    try {
      const result = await validateScheduleRefs(s.spec, { pluginId: manifest.id, siblingProfileIds });
      if (!result.ok) {
        logToFile(`skip schedule ${manifest.id}/${s.file}: ${result.error}`);
        continue;
      }
      validSchedules.push(s.spec);
    } catch (err) {
      logToFile(`skip schedule ${manifest.id}/${s.file}: validateScheduleRefs threw: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }
  // Install first (state-preserving upsert), then drop orphans.
  // IMPORTANT: do NOT remove before install — that would defeat the
  // onConflictDoUpdate in installSchedulesFromSpecs and silently reset runtime
  // state columns (status, firingCount, etc.) on every reload. Tables use
  // clear-first because they have no user-owned runtime state; schedules must
  // preserve it. Orphan cleanup (specs removed between reloads) is handled by
  // removeOrphanSchedules after the upsert, not before. See TDR-T18 bug report.
  installPluginSchedules(manifest.id, validSchedules);
  const scheduleIds = validSchedules.map((s) => `plugin:${manifest.id}:${s.id}`);
  removeOrphanSchedules(manifest.id, scheduleIds);

  // Also merge into the in-memory schedules registry cache (mirrors blueprints).
  // Build from s.spec (not s) so the `file` field does not leak into ScheduleSpec.
  mergePluginSchedules(
    validSchedules.map((s) => ({
      pluginId: manifest.id,
      schedule: { ...s, id: `${manifest.id}/${s.id}` },
    }))
  );

  logToFile(
    `loaded ${manifest.id}@${manifest.version}: ${scannedProfiles.length} profiles, ${scannedBlueprints.length} blueprints, ${tableIds.length} tables, ${scheduleIds.length} schedules`
  );

  return {
    id: manifest.id, manifest, rootDir,
    profiles: scannedProfiles.map((s) => s.namespacedId),
    blueprints: scannedBlueprints.map((s) => s.namespacedId),
    tables: tableIds,
    schedules: scheduleIds,
    status: "loaded",
  };
}

/**
 * Pure scan of the plugins dir. Does NOT touch the cache.
 * Used by both `loadPlugins()` (lazy, cached) and `reloadPlugins()` (eager).
 *
 * ASYNC NOTE (T10): async because loadOneBundle is async (validateScheduleRefs
 * uses dynamic import for TDR-032 defence).
 */
async function scanPlugins(): Promise<LoadedPlugin[]> {
  const seenIds = new Set<string>();
  const result: LoadedPlugin[] = [];
  const loadedIds = new Set<string>();

  for (const rootDir of discoverBundleRoots()) {
    const { manifest, error } = readManifest(rootDir);
    if (!manifest) {
      const fallbackId = path.basename(rootDir);
      result.push({
        id: fallbackId,
        manifest: { id: fallbackId, version: "0.0.0", apiVersion: "0.0", kind: "primitives-bundle" } as PluginManifest,
        rootDir,
        profiles: [],
        blueprints: [],
        tables: [],
        schedules: [],
        status: "disabled",
        error,
      });
      logToFile(`disabled ${rootDir}: ${error}`);
      continue;
    }

    if (seenIds.has(manifest.id)) {
      result.push({
        id: manifest.id, manifest, rootDir,
        profiles: [], blueprints: [], tables: [], schedules: [],
        status: "disabled", error: "duplicate_plugin_id",
      });
      logToFile(`disabled ${rootDir}: duplicate_plugin_id (${manifest.id})`);
      continue;
    }
    seenIds.add(manifest.id);

    const loaded = await loadOneBundle(rootDir, manifest);
    result.push(loaded);
    if (loaded.status === "loaded") loadedIds.add(manifest.id);
  }

  // T9: record what we just loaded so the next reload knows which plugins'
  // table rows to drop, even when the cache has been invalidated in between.
  lastLoadedPluginIds = loadedIds;
  return result;
}

/**
 * Cached entry point. Scans the plugins dir on first call and on every
 * call after `reloadPlugins()` invalidates the cache.
 *
 * T7/T8/T9 add primitive integration to the scan loop body. T6 only
 * handles manifest validation + apiVersion compat + duplicate-id dedupe.
 * T10: async because scanPlugins → loadOneBundle → validateScheduleRefs
 * uses dynamic import for TDR-032 defence.
 */
export async function loadPlugins(): Promise<LoadedPlugin[]> {
  if (pluginCache) return pluginCache;
  pluginCache = await scanPlugins();
  return pluginCache;
}

/**
 * T9/T10 helper: drop the DB-resident table + schedule rows for every plugin
 * that was loaded in the most recent scan. Iterates `lastLoadedPluginIds`
 * (which survives `pluginCache = null`) so a bundle removed entirely from
 * disk between reloads still has its stale rows cleaned up.
 *
 * Belt-and-braces: the per-bundle remove calls inside scanPlugins also clear
 * at scan time, but that path only fires for bundles still on disk. Removed
 * bundles rely on this helper for cleanup.
 */
/**
 * Collect the set of plugin ids that are currently known as loaded.
 * Used by reloadPlugins() to determine which plugins were removed from disk.
 */
function collectPreviouslyLoadedIds(): Set<string> {
  if (pluginCache) {
    return new Set(pluginCache.filter((p) => p.status === "loaded").map((p) => p.id));
  }
  return new Set(lastLoadedPluginIds);
}

function removeAllPluginTableRowsForCachedPlugins(): void {
  // Prefer the live cache when available (it's the authoritative current
  // state), but fall back to lastLoadedPluginIds when the cache is null —
  // which is the normal state after `reloadPlugins()` invalidates lazily.
  //
  // NOTE: schedules are intentionally NOT cleared here. Per-bundle orphan
  // cleanup (removeOrphanSchedules) handles spec removals within a still-present
  // plugin. Whole-plugin removal is handled in reloadPlugins() after the scan,
  // where we know which plugin ids are truly gone. Clearing schedules here
  // (before the upsert) would defeat the onConflictDoUpdate in
  // installSchedulesFromSpecs and silently reset runtime state (status,
  // firingCount, etc.) on every reload. See T18 bug fix.
  if (pluginCache) {
    for (const p of pluginCache) {
      if (p.status === "loaded") {
        removePluginTables(p.id);
      }
    }
    return;
  }
  for (const id of lastLoadedPluginIds) {
    removePluginTables(id);
  }
}

export async function reloadPlugins(): Promise<LoadedPlugin[]> {
  // Collect the pre-scan plugin ids before cache is invalidated, so we can
  // clean up schedules for bundles that are fully removed from disk.
  const prevLoadedIds = collectPreviouslyLoadedIds();

  // Clear ALL plugin-injected primitives before re-scanning so that
  // removed bundles drop their contributions, and renamed/changed primitives
  // don't accumulate stale entries. Also drop plugin-owned DB table rows so
  // bundles removed from disk don't leave orphaned rows.
  //
  // NOTE: schedule DB rows are NOT removed here. They are handled in two ways:
  //   1. Still-present plugins: per-bundle removeOrphanSchedules (inside
  //      loadOneBundle) deletes specs removed between reloads while preserving
  //      runtime state for surviving specs via the upsert.
  //   2. Fully removed plugins (bundle dir deleted): handled below after the
  //      scan, using prevLoadedIds minus the new scan result.
  //
  // Repopulates `pluginCache` with the fresh scan result so that the sync
  // `listPlugins()` / `getPlugin()` helpers see up-to-date state immediately
  // after this call returns, without requiring a separate `loadPlugins()`.
  removeAllPluginTableRowsForCachedPlugins();
  clearAllPluginProfiles();
  clearAllPluginBlueprints();
  clearAllPluginSchedules();
  pluginCache = null;
  pluginCache = await scanPlugins();

  // Clean up schedule DB rows for plugins that were loaded before but are NOT
  // in the fresh scan (bundle directory deleted between reloads). Per-bundle
  // orphan cleanup already ran for surviving plugins inside scanPlugins().
  const newLoadedIds = new Set(pluginCache.filter((p) => p.status === "loaded").map((p) => p.id));
  for (const id of prevLoadedIds) {
    if (!newLoadedIds.has(id)) {
      removePluginSchedules(id);
    }
  }

  return pluginCache;
}

/**
 * Sync read of the cache. Returns the cached list or an empty array if the
 * cache hasn't been hydrated yet. Callers that need a guaranteed-fresh scan
 * must call `await loadPlugins()` or `await reloadPlugins()` first.
 *
 * Stays sync intentionally — it's the hot read-path for UI components and
 * tool responses that inspect plugin state after the boot-time load.
 */
export function listPlugins(): LoadedPlugin[] {
  return pluginCache ?? [];
}

/**
 * Sync lookup in the cache. Returns null if the cache is unpopulated or the
 * id is not found. Same sync-read contract as listPlugins.
 */
export function getPlugin(id: string): LoadedPlugin | null {
  return pluginCache?.find((p) => p.id === id) ?? null;
}

/**
 * T9b/T10: Targeted single-plugin reload.
 *
 * Re-scans ONLY the named plugin's bundle, preserving every other plugin's
 * cached entry by object identity. Used by hot-reload flows where the agent
 * has just rewritten one bundle and a full `reloadPlugins()` would be
 * needlessly disruptive (it would re-run profile/blueprint/table/schedule
 * merges for every other bundle and invalidate downstream consumers).
 *
 * Returns the freshly-loaded plugin record, or `null` if the bundle no
 * longer exists on disk (or never did). The plugin's prior contributions
 * are cleared from all four primitive registries either way — so a "deleted
 * plugin" reload behaves as an unload.
 *
 * ASYNC NOTE (T10): async because loadOneBundle → validateScheduleRefs
 * uses dynamic import for TDR-032 defence.
 */
export async function reloadPlugin(id: string): Promise<LoadedPlugin | null> {
  // Step 1: Locate the plugin's rootDir from disk (the agent may have just
  // moved or renamed the directory, so we don't trust the cache).
  let foundDir: string | null = null;
  let foundManifest: PluginManifest | null = null;
  for (const rootDir of discoverBundleRoots()) {
    const { manifest } = readManifest(rootDir);
    if (manifest && manifest.id === id) {
      foundDir = rootDir;
      foundManifest = manifest;
      break;
    }
  }

  // Step 2: Clear THIS plugin's prior contributions from all four registries.
  // Other plugins' entries stay intact — that's the whole point.
  clearPluginProfiles(id);
  clearPluginBlueprints(id);
  clearPluginSchedules(id);
  removePluginTables(id);
  removePluginSchedules(id);

  // Step 3: Drop just this entry from the cache (don't null pluginCache).
  // Force population first so downstream identity-preservation guarantees
  // hold even when the cache hasn't been hydrated yet.
  if (!pluginCache) await loadPlugins();
  if (pluginCache) {
    pluginCache = pluginCache.filter((p) => p.id !== id);
  }
  // Keep the plugin-id tracker in sync with cache state — `lastLoadedPluginIds`
  // is the fallback used by `removeAllPluginRowsForCachedPlugins` when the
  // cache is null, and we don't want a deleted plugin's id lingering there.
  lastLoadedPluginIds.delete(id);

  // Step 4: If disk no longer has the plugin, we're done — it was deleted.
  if (!foundDir || !foundManifest) return null;

  // Step 5: Re-scan only this bundle and merge.
  const loaded = await loadOneBundle(foundDir, foundManifest);
  if (pluginCache) pluginCache.push(loaded);
  if (loaded.status === "loaded") lastLoadedPluginIds.add(id);
  return loaded;
}
