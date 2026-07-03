import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { BlueprintSchema } from "@/lib/validators/blueprint";
import { getAinativeBlueprintsDir } from "@/lib/utils/ainative-paths";
import { getAppRoot } from "@/lib/utils/app-root";
import type { WorkflowBlueprint } from "./types";

const BUILTINS_DIR = path.resolve(
  getAppRoot(import.meta.dirname, 4),
  "src", "lib", "workflows", "blueprints", "builtins"
);

const USER_BLUEPRINTS_DIR = getAinativeBlueprintsDir();

let blueprintCache: Map<string, WorkflowBlueprint> | null = null;

// The user-blueprints dir mtime captured when the cache was last built. Lets a
// long-lived server (the Next.js process) self-heal after an OUT-OF-PROCESS
// install — a `relay pack add` from the CLI, or any external file drop —
// writes new blueprint files that the in-process `reloadBlueprints()` never saw
// (fix-pack-install-blueprint-cache). A directory's mtime bumps whenever an
// entry is added or removed, so one cheap `statSync` per read detects the new
// files and triggers a rebuild. null = cache built when the dir did not exist.
let cachedDirMtimeMs: number | null = null;

// Read the user-dir mtime, or null if the dir doesn't exist yet. A missing dir
// is a valid state (no user blueprints installed) — we must still detect its
// later CREATION, so null-vs-number transitions count as a change below.
function userDirMtimeMs(): number | null {
  try {
    return fs.statSync(USER_BLUEPRINTS_DIR).mtimeMs;
  } catch {
    return null;
  }
}

function scanDirectory(
  dir: string,
  isBuiltin: boolean
): Map<string, WorkflowBlueprint> {
  const blueprints = new Map<string, WorkflowBlueprint>();

  if (!fs.existsSync(dir)) return blueprints;

  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;

    try {
      const content = fs.readFileSync(path.join(dir, file), "utf-8");
      const parsed = yaml.load(content);
      const result = BlueprintSchema.safeParse(parsed);

      if (!result.success) {
        console.warn(
          `[blueprints] Invalid blueprint ${file}:`,
          result.error.issues.map((i) => i.message).join(", ")
        );
        continue;
      }

      blueprints.set(result.data.id, { ...result.data, isBuiltin });
    } catch (err) {
      console.warn(`[blueprints] Error loading ${file}:`, err);
    }
  }

  return blueprints;
}

function loadAll(): Map<string, WorkflowBlueprint> {
  const all = new Map<string, WorkflowBlueprint>();

  // Load built-ins first
  for (const [id, bp] of scanDirectory(BUILTINS_DIR, true)) {
    all.set(id, bp);
  }

  // User blueprints can override built-ins
  for (const [id, bp] of scanDirectory(USER_BLUEPRINTS_DIR, false)) {
    all.set(id, bp);
  }

  return all;
}

function ensureLoaded(): Map<string, WorkflowBlueprint> {
  // Self-heal: if the user-dir mtime moved since we built the cache (an
  // out-of-process install added/removed files), drop the stale cache so it
  // rebuilds below. `!==` covers both the number→number bump AND the
  // null↔number transitions (dir created after an empty-dir cache build, or
  // removed). Skipped on the very first build (cache still null).
  if (blueprintCache && userDirMtimeMs() !== cachedDirMtimeMs) {
    blueprintCache = null;
  }
  if (!blueprintCache) {
    // Snapshot the mtime BEFORE loadAll() so a write landing DURING the scan is
    // caught on the next read rather than silently folded into this build with
    // a newer mtime that would suppress the reload.
    cachedDirMtimeMs = userDirMtimeMs();
    blueprintCache = loadAll();
    // Re-apply in-memory plugin (Kind-5) blueprints — loadAll() only scans
    // disk, so a rebuild would otherwise drop them.
    applyPluginBlueprints(blueprintCache);
  }
  return blueprintCache;
}

export function getBlueprint(id: string): WorkflowBlueprint | undefined {
  return ensureLoaded().get(id);
}

export function listBlueprints(): WorkflowBlueprint[] {
  return Array.from(ensureLoaded().values());
}

export function reloadBlueprints(): void {
  blueprintCache = null;
}

export function isBuiltinBlueprint(id: string): boolean {
  const bp = ensureLoaded().get(id);
  return bp?.isBuiltin ?? false;
}

export function createBlueprint(yamlContent: string): WorkflowBlueprint {
  const parsed = yaml.load(yamlContent);
  const result = BlueprintSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Invalid blueprint: ${result.error.issues.map((i) => i.message).join(", ")}`
    );
  }

  fs.mkdirSync(USER_BLUEPRINTS_DIR, { recursive: true });
  const filePath = path.join(USER_BLUEPRINTS_DIR, `${result.data.id}.yaml`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Blueprint "${result.data.id}" already exists`);
  }

  fs.writeFileSync(filePath, yamlContent);
  reloadBlueprints();
  return { ...result.data, isBuiltin: false };
}

export function deleteBlueprint(id: string): void {
  if (isBuiltinBlueprint(id)) {
    throw new Error("Cannot delete built-in blueprints");
  }

  const filePath = path.join(USER_BLUEPRINTS_DIR, `${id}.yaml`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Blueprint "${id}" not found`);
  }

  fs.unlinkSync(filePath);
  reloadBlueprints();
}

/** Get the user blueprints directory path */
export function getUserBlueprintsDir(): string {
  return USER_BLUEPRINTS_DIR;
}

// ---------------------------------------------------------------------------
// Plugin blueprint injection (Kind 5)
// ---------------------------------------------------------------------------

// Static import is intentional and safe: TDR-032's no-static-chat-tools-import
// rule applies to the @/lib/chat/ainative-tools cycle, not the
// workflows→profiles direction. Profile registry has zero static chat-tools
// dependency (verified by grep). This formalizes a layer dependency that
// already exists implicitly via workflows/engine.ts invoking profile-bound agents.
// Do NOT replace with a dynamic import "for safety" — that would defeat
// the sync loader simplicity for no actual cycle-prevention benefit.
import { getProfile } from "@/lib/agents/profiles/registry";

interface PluginBlueprintEntry {
  pluginId: string;
  blueprint: WorkflowBlueprint;
}

// Kind-5 plugin blueprints live ONLY in memory (sourced from plugin bundle
// dirs, never from USER_BLUEPRINTS_DIR), so a disk rescan in loadAll() does not
// see them. We retain the full blueprint objects here — not just ids — so they
// can be re-applied after ANY cache rebuild, including the mtime self-heal in
// ensureLoaded(). Without this, an out-of-process pack install would trigger a
// reload that silently dropped every plugin blueprint until the next plugin
// scan (fix-pack-install-blueprint-cache regression guard).
const pluginBlueprints: Map<string, Map<string, WorkflowBlueprint>> = new Map();

/** Re-apply retained plugin blueprints onto a freshly-built disk cache. */
function applyPluginBlueprints(cache: Map<string, WorkflowBlueprint>): void {
  for (const byId of pluginBlueprints.values()) {
    for (const [id, bp] of byId) cache.set(id, bp);
  }
}

export function mergePluginBlueprints(entries: PluginBlueprintEntry[]): void {
  const cache = ensureLoaded();
  for (const entry of entries) {
    cache.set(entry.blueprint.id, entry.blueprint);
    if (!pluginBlueprints.has(entry.pluginId)) {
      pluginBlueprints.set(entry.pluginId, new Map());
    }
    pluginBlueprints.get(entry.pluginId)!.set(entry.blueprint.id, entry.blueprint);
  }
}

export function clearPluginBlueprints(pluginId: string): void {
  const cache = blueprintCache;
  const byId = pluginBlueprints.get(pluginId);
  if (!byId) return;
  if (cache) for (const id of byId.keys()) cache.delete(id);
  pluginBlueprints.delete(pluginId);
}

export function clearAllPluginBlueprints(): void {
  for (const pluginId of Array.from(pluginBlueprints.keys())) {
    clearPluginBlueprints(pluginId);
  }
}

export function listPluginBlueprintIds(pluginId: string): string[] {
  return Array.from(pluginBlueprints.get(pluginId)?.keys() ?? []);
}

export interface ValidateBlueprintRefsOptions {
  pluginId: string;
  /** namespaced profile ids declared by THIS plugin */
  siblingProfileIds: Set<string>;
}

export interface ValidateBlueprintRefsResult {
  ok: boolean;
  error?: string;
}

export function validateBlueprintRefs(
  bp: WorkflowBlueprint,
  opts: ValidateBlueprintRefsOptions
): ValidateBlueprintRefsResult {
  // Plugin loader (T8) namespaces blueprint.id as `<pluginId>/<localId>`, so
  // cross-plugin id collisions in the cache do not occur in practice. The
  // pluginBlueprintIndex therefore reliably tracks ownership for clear/list.
  for (const step of bp.steps ?? []) {
    if (!step.profileId) continue;
    const ref = step.profileId;
    if (ref.includes("/")) {
      const [refPluginId] = ref.split("/");
      if (refPluginId !== opts.pluginId) {
        return { ok: false, error: `cross-plugin profile reference not allowed: ${ref}` };
      }
      if (!opts.siblingProfileIds.has(ref)) {
        return { ok: false, error: `unresolved sibling profile reference: ${ref}` };
      }
    } else {
      if (!getProfile(ref)) {
        return { ok: false, error: `unresolved profile reference: ${ref}` };
      }
    }
  }
  return { ok: true };
}
