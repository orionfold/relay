import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import yaml from "js-yaml";
import semver from "semver";
import {
  getAinativeAppsDir,
  getAinativeBlueprintsDir,
  getAinativeProfilesDir,
} from "@/lib/utils/ainative-paths";
import { getAppRoot } from "@/lib/utils/app-root";
import { writeAppManifest, type AppManifest } from "@/lib/apps/registry";
import {
  parsePack,
  resolvePackLayer,
  PackValidationError,
  type Pack,
  type ResolvedPackFile,
} from "./format";

// Compile-time core version, embedded by tsup's `define` (see tsup.config.ts).
// Present ONLY in the bundled CLI; `undefined` in dev/test/Next.js builds,
// where the runtime lookup below takes over. Declared as a global so the
// reference type-checks in the non-bundled builds where it doesn't exist.
declare const __RELAY_CORE_VERSION__: string | undefined;

// The current relay-core version. Kept here (not inlined) so the compat gate
// has a single point of truth.
function relayCoreVersion(): string {
  // 1. Bundle path: the version baked in at build time. This eliminates the
  //    runtime package.json lookup entirely in the shipped CLI — the source of
  //    the "0.0.0" bug, where the flattened dist/ layout broke the depth-based
  //    getAppRoot resolution and fell back to the user's launch dir.
  if (typeof __RELAY_CORE_VERSION__ === "string" && semver.valid(__RELAY_CORE_VERSION__)) {
    return __RELAY_CORE_VERSION__;
  }

  // 2. Dev/test/Next.js path: resolve the app root via getAppRoot (NOT
  //    process.cwd() — under npx that is the user's launch dir; see
  //    npx-process-cwd.test.ts) and read package.json. getAppRoot is now
  //    bundle-aware (walks up to the orionfold-relay package.json), so this
  //    path is also correct in the bundle even if the define is ever dropped.
  try {
    const root = getAppRoot(import.meta.dirname, 3);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf-8")
    ) as { version?: string };
    if (pkg.version && semver.valid(pkg.version)) return pkg.version;
  } catch {
    // fall through to the conservative default
  }
  return "0.0.0";
}

export interface InstallPackOptions {
  appsDir?: string;
  profilesDir?: string;
  blueprintsDir?: string;
  /** Override the detected relay-core version (tests). */
  coreVersion?: string;
  /**
   * Path or URL to a `{ payload, signature }` license envelope. Required for a
   * premium pack (one whose pack.yaml declares an `entitlement`); ignored for a
   * free pack. Sourced from the buyer's fulfilment email (`--license-url`).
   */
  licenseUrl?: string;
  /** Override the bundled-templates dir for bare-name resolution (tests). */
  templatesDir?: string;
}

export interface InstallReport {
  packId: string;
  packVersion: string;
  projectCreated: boolean;
  tablesCreated: number;
  customersSeeded: number;
  profilesDropped: number;
  blueprintsDropped: number;
  rowsSeeded: number;
}

interface CustomerSeedEntry {
  slug?: string;
  name: string;
  industry?: string | null;
  notes?: string | null;
}

/**
 * Install a pack from a folder path or a git URL.
 *
 * NOT a pure file-drop: the install does a bounded DB write (parent project +
 * user tables + seeded customers) and drops everything else as files. The
 * whole sequence is acquire → validate (incl. relayCore compat) → DB write →
 * file drop → table seed → report. Validation happens BEFORE any write so a
 * malformed or incompatible pack never half-installs (Principle #1).
 *
 * DB-touching helpers are dynamically imported inside the function body — never
 * statically at module top-level — so this module never pulls the
 * runtime-registry-adjacent chain into the CLI's static import graph (TDR-032).
 */
export async function installPack(
  source: string,
  options: InstallPackOptions = {}
): Promise<InstallReport> {
  const appsDir = options.appsDir ?? getAinativeAppsDir();
  const profilesDir = options.profilesDir ?? getAinativeProfilesDir();
  const blueprintsDir = options.blueprintsDir ?? getAinativeBlueprintsDir();
  const coreVersion = options.coreVersion ?? relayCoreVersion();

  // 1. Acquire — a bare name resolves to its bundled template dir first
  // (existing local paths win; see resolvePackSource), then clone a git URL
  // into a temp dir, or read a folder in place.
  const { resolvePackSource } = await import("./catalog");
  const resolvedSource = resolvePackSource(source, {
    templatesDir: options.templatesDir,
  });
  const { dir: packDir, cleanup } = acquirePack(resolvedSource);

  try {
    // 2. Validate — strict schema gate (throws PackValidationError) ...
    const pack = parsePack(packDir);

    // ... then the relayCore compat check (also before any write).
    if (pack.meta.relayCore) {
      if (!semver.satisfies(coreVersion, pack.meta.relayCore)) {
        throw new PackValidationError(
          `Pack ${pack.meta.id}@${pack.meta.version} requires relay-core ${pack.meta.relayCore}, ` +
            `but this install is ${coreVersion}.`
        );
      }
    }

    // 2b. License gate — a premium pack (declares `entitlement`) requires a
    // verified license BEFORE any write. Free packs skip this entirely. The
    // licensing modules are dynamically imported (kept out of the CLI's static
    // graph, consistent with TDR-032) and run 100% offline.
    //
    // Two proof paths (D1/D2):
    //   - `--license-url` supplied → load + gate it, and on success PERSIST it
    //     to the license store, so this is the last time the flag is needed.
    //   - no flag → consult the store for an already-redeemed license that
    //     grants this entitlement before refusing.
    if (pack.meta.entitlement) {
      const { assertEntitled } = await import("@/lib/licensing/gate");
      if (options.licenseUrl) {
        const { loadLicense } = await import("@/lib/licensing/load");
        const license = await loadLicense(options.licenseUrl);
        assertEntitled(pack.meta.entitlement, license);
        const { saveLicense } = await import("@/lib/licensing/store");
        saveLicense(license);
      } else {
        const { findEntitledLicense } = await import("@/lib/licensing/store");
        if (!findEntitledLicense(pack.meta.entitlement)) {
          // Throws the canonical "missing license" refusal.
          assertEntitled(pack.meta.entitlement, undefined);
        }
      }
    }

    const resolved = resolvePackLayer(pack);

    // 3. DB-write boundary (bounded, reuses existing seams).
    const { ensureAppProject } = await import("@/lib/apps/compose-integration");
    const { ensureCustomer } = await import("@/lib/customers");
    const { createTable, addRows, listTables } = await import(
      "@/lib/data/tables"
    );

    const projectResult = await ensureAppProject(pack.meta.id, appsDir);

    // 3a. User tables — one per manifest table ref. The authored ref uses a
    // logical id (e.g. "clients"); we create a real UUID-keyed table and
    // remember logical→real so the dropped manifest can be rewritten.
    //
    // Idempotent: createTable always mints a new UUID, so a naive re-install
    // would duplicate the table. We first look up an existing table for this
    // project by its derived name and reuse it. addRows dedupes by data-hash,
    // so re-seeding the same rows is a no-op — but we still only seed on a
    // freshly-created table to keep the row count honest in the report.
    const existingTables = await listTables({ projectId: pack.meta.id });
    const existingByName = new Map(existingTables.map((t) => [t.name, t.id]));

    const logicalToReal = new Map<string, string>();
    let rowsSeeded = 0;
    let tablesCreated = 0;
    for (const tableRef of pack.manifest.tables) {
      const logicalId = tableRef.id;
      const tableName = titleCase(logicalId);
      const columnNames = (tableRef.columns as string[] | undefined) ?? [];

      const existingId = existingByName.get(tableName);
      if (existingId) {
        // Reuse the existing table — do not re-create or re-seed.
        logicalToReal.set(logicalId, existingId);
        continue;
      }

      tablesCreated += 1;
      const created = await createTable({
        name: tableName,
        projectId: pack.meta.id,
        source: "template",
        columns: columnNames.map((name, i) => ({
          name,
          displayName: titleCase(name),
          dataType: "text" as const,
          position: i,
        })),
      });
      logicalToReal.set(logicalId, created.id);

      // 5. Seed rows for this logical table, if a seed file exists.
      const rows = readTableSeed(resolved, logicalId);
      if (rows.length > 0) {
        const { ids } = await addRows(
          created.id,
          rows.map((data) => ({ data, createdBy: "user" as const }))
        );
        rowsSeeded += ids.length;
      }
    }

    // 3b. Customers — slug-idempotent via the customer-dimension seam.
    let customersSeeded = 0;
    for (const entry of readCustomerSeed(resolved)) {
      await ensureCustomer({
        slug: entry.slug,
        name: entry.name,
        industry: entry.industry ?? null,
        notes: entry.notes ?? null,
      });
      customersSeeded += 1;
    }

    // 4. File drop — atomic manifest write (with table refs rewritten to real
    // ids) + namespaced profile/blueprint artifacts into the shared dirs.
    const droppedManifest = rewriteTableRefs(pack.manifest, logicalToReal);
    // Record the entitlement on the installed manifest so `pack list` (and
    // the future /packs UI) can mark premium packs without re-reading the
    // original pack source (D6).
    if (pack.meta.entitlement) {
      droppedManifest.entitlement = pack.meta.entitlement;
    }
    writeManifest(appsDir, pack.meta.id, droppedManifest);

    const { profilesDropped, blueprintsDropped } = dropArtifacts(
      resolved.files,
      profilesDir,
      blueprintsDir
    );

    // 6. Report — zero silent steps.
    return {
      packId: pack.meta.id,
      packVersion: pack.meta.version,
      projectCreated: projectResult.created,
      tablesCreated,
      customersSeeded,
      profilesDropped,
      blueprintsDropped,
      rowsSeeded,
    };
  } finally {
    cleanup();
  }
}

// ── Acquire ──────────────────────────────────────────────────────────

function isGitUrl(source: string): boolean {
  return (
    /^https?:\/\//.test(source) ||
    /^git@/.test(source) ||
    source.endsWith(".git")
  );
}

function acquirePack(source: string): { dir: string; cleanup: () => void } {
  if (!isGitUrl(source)) {
    const resolved = path.resolve(source);
    if (!fs.existsSync(resolved)) {
      throw new PackValidationError(`Pack path does not exist: ${resolved}`);
    }
    return { dir: resolved, cleanup: () => {} };
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-clone-"));
  try {
    execFileSync("git", ["clone", "--depth", "1", source, tmp], {
      stdio: "pipe",
    });
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new PackValidationError(`git clone failed for ${source}`, err);
  }
  return {
    dir: tmp,
    cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
  };
}

// ── Seed readers (override-aware via resolvePackLayer) ───────────────

function findResolved(
  files: ResolvedPackFile[],
  relPath: string
): ResolvedPackFile | undefined {
  return files.find((f) => f.relPath === relPath);
}

function readCustomerSeed(
  resolved: ReturnType<typeof resolvePackLayer>
): CustomerSeedEntry[] {
  const file = findResolved(resolved.files, "seed/customers.yaml");
  if (!file) return [];
  const parsed = yaml.load(fs.readFileSync(file.absPath, "utf-8"));
  if (!Array.isArray(parsed)) {
    throw new PackValidationError(
      "seed/customers.yaml must be a YAML list of { slug, name, ... }"
    );
  }
  return parsed as CustomerSeedEntry[];
}

function readTableSeed(
  resolved: ReturnType<typeof resolvePackLayer>,
  logicalId: string
): Array<Record<string, unknown>> {
  // Support .json and .yaml seed files, keyed by the logical table id.
  for (const ext of ["json", "yaml", "yml"]) {
    const file = findResolved(resolved.files, `seed/tables/${logicalId}.${ext}`);
    if (!file) continue;
    const text = fs.readFileSync(file.absPath, "utf-8");
    const parsed = ext === "json" ? JSON.parse(text) : yaml.load(text);
    if (!Array.isArray(parsed)) {
      throw new PackValidationError(
        `seed/tables/${logicalId}.${ext} must be a list of row objects`
      );
    }
    return parsed as Array<Record<string, unknown>>;
  }
  return [];
}

// ── Manifest rewrite + write ─────────────────────────────────────────

/**
 * Rewrite the manifest's table refs from authored logical ids to the real
 * UUIDs created at install. The running app machinery (row-trigger dispatch,
 * view-kit bindings) resolves tables by these ids, so the dropped manifest
 * must carry the real ids, not the author's logical handles.
 */
function rewriteTableRefs(
  manifest: AppManifest,
  logicalToReal: Map<string, string>
): AppManifest {
  const rewritten: AppManifest = {
    ...manifest,
    tables: manifest.tables.map((t) => {
      const real = logicalToReal.get(t.id);
      return real ? { ...t, id: real } : t;
    }),
  };
  // The view binds to tables by the SAME logical id. Rewrite those refs too —
  // hero/secondary/cadence/runs bindings and every KPI source (incl. nested
  // ratio numerator/denominator). Missing this leaves the view pointing at a
  // logical name that no longer matches the real id, so KPIs silently read 0.
  if (rewritten.view) {
    rewritten.view = rewriteViewTableRefs(
      rewritten.view,
      logicalToReal
    ) as AppManifest["view"];
  }
  return rewritten;
}

/** Deep-rewrite every `table` reference inside a view config to its real id. */
function rewriteViewTableRefs(
  view: unknown,
  logicalToReal: Map<string, string>
): unknown {
  if (Array.isArray(view)) {
    return view.map((v) => rewriteViewTableRefs(v, logicalToReal));
  }
  if (view && typeof view === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(view as Record<string, unknown>)) {
      if (key === "table" && typeof value === "string") {
        out[key] = logicalToReal.get(value) ?? value;
      } else {
        out[key] = rewriteViewTableRefs(value, logicalToReal);
      }
    }
    return out;
  }
  return view;
}

/**
 * Write the manifest into appsDir/<id>/manifest.yaml via the existing atomic
 * temp-rename writer. writeAppManifest requires the app dir to exist first
 * (it is the view-edit path, which only mutates existing apps), so create the
 * dir before delegating.
 */
function writeManifest(
  appsDir: string,
  appId: string,
  manifest: AppManifest
): void {
  fs.mkdirSync(path.join(appsDir, appId), { recursive: true });
  writeAppManifest(appId, manifest, appsDir);
}

// ── File drop ────────────────────────────────────────────────────────

function dropArtifacts(
  files: ResolvedPackFile[],
  profilesDir: string,
  blueprintsDir: string
): { profilesDropped: number; blueprintsDropped: number } {
  const profileDirs = new Set<string>();
  let blueprintsDropped = 0;

  for (const file of files) {
    if (file.relPath.startsWith("profiles/")) {
      const dest = path.join(profilesDir, file.relPath.slice("profiles/".length));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file.absPath, dest);
      // Count distinct top-level profile dirs (<appId>--<name>).
      const top = file.relPath.split("/")[1];
      if (top) profileDirs.add(top);
    } else if (
      file.relPath.startsWith("blueprints/") &&
      file.relPath.endsWith(".yaml")
    ) {
      const dest = path.join(
        blueprintsDir,
        file.relPath.slice("blueprints/".length)
      );
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(file.absPath, dest);
      blueprintsDropped += 1;
    }
    // seed/** is consumed during the DB write, not dropped.
  }

  return { profilesDropped: profileDirs.size, blueprintsDropped };
}

// ── Small util (local; same shape as compose-integration's titleCase) ──

function titleCase(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

// Re-export for the CLI + tests that want the typed Pack without a second import.
export type { Pack };
