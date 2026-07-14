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
  isBundle,
  PackValidationError,
  type Pack,
  type ResolvedPack,
  type ResolvedPackFile,
} from "./format";
import { mergeBundle } from "./bundle";
import {
  verifyPackProvenance,
  packProvenanceBytes,
  packInstallPolicy,
  packTierBadge,
  type PackTier,
} from "./provenance";

// Compile-time core version, embedded by tsup's `define` (see tsup.config.ts).
// Present ONLY in the bundled CLI; `undefined` in dev/test/Next.js builds,
// where the runtime lookup below takes over. Declared as a global so the
// reference type-checks in the non-bundled builds where it doesn't exist.
declare const __RELAY_CORE_VERSION__: string | undefined;

// The current relay-core version. Kept here (not inlined) so the compat gate
// has a single point of truth (also consumed by the update verb's pre-write
// compat check).
export function relayCoreVersion(): string {
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
  /**
   * Override the canonical pack-index base URL for remote resolution (R2).
   * Falls back to `RELAY_PACK_INDEX_URL`, then the canonical default. A
   * `file://` base points the smoke/tests at a local fixture tree; a bundled
   * pack never reaches the index so this is unused for offline installs.
   */
  packIndexBaseUrl?: string;
  /**
   * The `--allow-community` escape hatch (R3 `pack-provenance-tiers`). Only
   * consulted if the trust ceiling is tightened (open decision #3); ignored
   * while the default warn-and-install ceiling is in force.
   */
  allowCommunity?: boolean;
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
  schedulesRegistered: number;
  /** Trust tier assigned by the offline provenance verify (R3). A bundled pack
   * is implicitly `official`; a remotely-fetched pack is verified against the
   * embedded pack-key map. */
  tier: PackTier;
  /** True only when a signature verified against a trusted pack key. */
  tierVerified: boolean;
  /** The signer's human label (e.g. "Orionfold"), present only when verified. */
  tierLabel?: string;
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
  // (existing local paths win; see resolvePackSource), then, for a bare name
  // that is neither local nor bundled, consult the canonical index (R1) and
  // fetch it sha-verified (R2). Finally clone a git URL into a temp dir, or read
  // a folder in place. `entry` (present only on the remote path) carries the
  // index metadata R3 verifies provenance against.
  const { resolvePackSourceAsync } = await import("./catalog");
  const {
    dir: resolvedSource,
    cleanup: fetchCleanup,
    entry: indexEntry,
  } = await resolvePackSourceAsync(source, {
    templatesDir: options.templatesDir,
    baseUrl: options.packIndexBaseUrl,
    coreVersion, // R5: the early relayCore skip filters an incompatible remote
    // pack before fetching it; the post-acquire check below stays (defense in depth).
  });
  // `indexEntry` (present only on the remote path) carries `sig`/`keyId` — R3
  // verifies provenance against them just below, after parsePack yields the
  // meta+manifest the signature covers.
  const acquired = acquirePack(resolvedSource);
  const packDir = acquired.dir;
  // Compose the fetch's temp-dir cleanup (if any) with acquirePack's own, so a
  // remotely-fetched pack's temp dir is always removed in the finally below.
  const cleanup = () => {
    acquired.cleanup();
    fetchCleanup?.();
  };

  try {
    // 2. Validate — strict schema gate (throws PackValidationError) ...
    let pack = parsePack(packDir);

    // 2-provenance. Offline trust-tier verify (R3 `pack-provenance-tiers`).
    // Verified against the ORIGINALLY-parsed meta+manifest (before any bundle
    // merge mutates `pack`), which is exactly what a signer covers. A pack that
    // arrived through the remote index carries `indexEntry.sig`/`.keyId`; a
    // BUNDLED or local pack has no entry and is implicitly `official` (it
    // shipped signed-in-tarball / is Orionfold-authored by definition), skipping
    // the fetch-side verify. The verify is 100% offline — no network, no
    // registry (promise-clean; a test asserts zero network during verify).
    let provenance: { tier: PackTier; verified: boolean; label?: string };
    if (indexEntry) {
      const bytes = packProvenanceBytes(pack.meta, pack.manifest);
      provenance = verifyPackProvenance(bytes, indexEntry.sig, indexEntry.keyId);
      // Trust-ceiling policy seam (open decision #3 — default warn-and-install).
      const decision = packInstallPolicy(provenance.tier, provenance.verified, {
        allowCommunity: options.allowCommunity,
      });
      if (decision === "refuse") {
        throw new PackValidationError(
          `Pack ${pack.meta.id}@${pack.meta.version} is ${packTierBadge(
            provenance.tier,
            provenance.label
          )} and the trust ceiling refuses it. ` +
            `Re-run with --allow-community to install it anyway.`
        );
      }
      if (decision === "warn-install" && !provenance.verified) {
        // Loud, never silent (Principle #1): the user is about to install code
        // whose author Relay cannot vouch for.
        console.warn(
          `⚠ Installing ${pack.meta.id}@${pack.meta.version} as ${packTierBadge(
            provenance.tier
          )} — its signature could not be verified against a trusted Orionfold ` +
            `or partner key. Install only if you trust the source.`
        );
      }
    } else if (isGitUrl(source)) {
      // A direct git URL is user-selected third-party content, not bundled
      // Orionfold content. Without an index signature there is no trusted
      // author claim, so classify it honestly as community/unverified.
      provenance = { tier: "community", verified: false };
      const decision = packInstallPolicy(provenance.tier, provenance.verified, {
        allowCommunity: options.allowCommunity,
      });
      if (decision === "refuse") {
        throw new PackValidationError(
          `Pack ${pack.meta.id}@${pack.meta.version} is ${packTierBadge("community")} and the trust ceiling refuses it. Re-run with --allow-community to install it anyway.`
        );
      }
      console.warn(
        `⚠ Installing ${pack.meta.id}@${pack.meta.version} as ${packTierBadge("community")} — direct git sources have no trusted index signature. Install only if you trust the repository.`
      );
    } else {
      provenance = { tier: "official", verified: true, label: "Orionfold" };
    }

    // 2a-bundle. Bundle flatten (`pack-bundle-model`). A bundle pack owns no
    // inner manifest; it lists child pack ids to merge into ONE app. Resolve
    // each child LOCAL-FIRST (bundled template dir or an existing local path —
    // never a remote index, preserving the no-marketplace fence), then merge
    // into a synthetic pack. From here the entire flow below runs UNCHANGED
    // over the merged pack + resolved files, so the single logical→real UUID
    // rewrite spans the whole manifest and every cross-child binding resolves
    // intra-app. Runs before the license gate so the BUNDLE's own entitlement
    // (not the children's) is what gates install — one license per bundle.
    let resolved: ResolvedPack;
    if (isBundle(pack.meta)) {
      const { resolvePackSource } = await import("./catalog");
      const children = pack.meta.bundle!.map((childId) => {
        if (isGitUrl(childId)) {
          throw new PackValidationError(
            `Bundle "${pack.meta.id}" lists a git URL child "${childId}". ` +
              `Bundle children must be bundled pack names or local paths ` +
              `(no remote index — the no-marketplace fence).`
          );
        }
        const childDir = resolvePackSource(childId, {
          templatesDir: options.templatesDir,
        });
        return resolvePackLayer(parsePack(childDir));
      });
      const merged = mergeBundle(pack, children);
      pack = merged.pack;
      resolved = merged;
    } else {
      resolved = resolvePackLayer(pack);
    }

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

    // 2c. Manifest-schedule validation — still BEFORE any write. A schedule
    // that can never fire (no cron) or fires into nothing (no/unknown
    // blueprint) must refuse the whole install, not half-install and go
    // silent at runtime (Principle #1).
    const declaredBlueprints = new Set(
      pack.manifest.blueprints.map((bp) => bp.id)
    );
    for (const sched of pack.manifest.schedules) {
      if (!sched.cron) {
        throw new PackValidationError(
          `Manifest schedule "${sched.id}" has no cron expression.`
        );
      }
      if (!sched.runs) {
        throw new PackValidationError(
          `Manifest schedule "${sched.id}" has no "runs" blueprint.`
        );
      }
      if (!declaredBlueprints.has(sched.runs)) {
        throw new PackValidationError(
          `Manifest schedule "${sched.id}" runs blueprint "${sched.runs}", ` +
          `which the manifest does not declare.`
        );
      }
    }
    assertScheduledBlueprintVarsFillable(pack, resolved);

    // 2d. Row-insert trigger var fillability — still BEFORE any write. A
    // row-insert trigger fires with NO human in the loop, so every REQUIRED
    // variable on the triggered blueprint must be auto-fillable from the
    // inserted row: either a column named exactly like the variable (the
    // passthrough in manifest-trigger-dispatch `buildVariables`), or a
    // `{{row.<col>}}` default naming a real column of the trigger table.
    // Otherwise the pack installs clean, then throws "Missing required
    // variables" the moment the FIRST row lands (Principle #1 — this converts
    // that silent runtime failure into a loud install-time refusal). Only the
    // trigger table's OWN columns count; a trigger whose table this manifest
    // does not declare is inert here (e.g. a cross-child trigger in a
    // standalone child install), so it is skipped.
    assertRowTriggerVarsFillable(pack, resolved);

    const declaredTableIds = new Set(pack.manifest.tables.map((table) => table.id));
    for (const table of pack.manifest.tables) {
      if (table.columnDefinitions) {
        const logicalColumns = table.columns ?? [];
        const definedColumns = table.columnDefinitions.map((column) => column.name);
        if (
          logicalColumns.length !== definedColumns.length ||
          logicalColumns.some((name, index) => name !== definedColumns[index])
        ) {
          throw new PackValidationError(
            `Table "${table.id}" columnDefinitions must match columns exactly and in order. ` +
              `columns=[${logicalColumns.join(", ")}], definitions=[${definedColumns.join(", ")}].`
          );
        }
      }
      for (const column of table.columnDefinitions ?? []) {
        const relationTarget = column.config?.targetTableId;
        if (typeof relationTarget === "string" && !declaredTableIds.has(relationTarget)) {
          throw new PackValidationError(
            `Relation column "${column.name}" on table "${table.id}" targets undeclared table "${relationTarget}".`
          );
        }
      }
    }

    // 3. DB-write boundary (bounded, reuses existing seams).
    const { ensureAppProject } = await import("@/lib/apps/compose-integration");
    const { ensureCustomer } = await import("@/lib/customers");
    const { createTable, addRows, listTables, getColumns, updateColumn } = await import(
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
      const tableName = tableRef.name ?? titleCase(logicalId);
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
        description: tableRef.description ?? null,
        projectId: pack.meta.id,
        source: "template",
        columns: tableRef.columnDefinitions?.length
          ? tableRef.columnDefinitions.map((column, i) => ({
              ...column,
              position: i,
            }))
          : columnNames.map((name, i) => ({
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

    // Relation configs reference logical table ids in an authored pack. All
    // real UUIDs exist only after the first pass, so rewrite relation targets
    // in a second pass rather than persisting dangling logical handles.
    for (const tableRef of pack.manifest.tables) {
      const realTableId = logicalToReal.get(tableRef.id);
      if (!realTableId || !tableRef.columnDefinitions) continue;
      const installedColumns = await getColumns(realTableId);
      for (const definition of tableRef.columnDefinitions) {
        const logicalTarget = definition.config?.targetTableId;
        if (typeof logicalTarget !== "string") continue;
        const realTarget = logicalToReal.get(logicalTarget);
        if (!realTarget) {
          throw new PackValidationError(
            `Relation column "${definition.name}" on table "${tableRef.id}" targets undeclared table "${logicalTarget}".`
          );
        }
        const installed = installedColumns.find((column) => column.name === definition.name);
        if (!installed) continue;
        await updateColumn(installed.id, {
          config: { ...definition.config, targetTableId: realTarget },
        });
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

    // 3c. Schedules — registered as REAL rows in the schedules DB table under
    // deterministic composite ids (app:<appId>:<scheduleId>). The scheduler
    // engine and the scheduleNextFire KPI both resolve against that table;
    // a manifest-only schedule never fires and its KPI silently reads null.
    // Reuses the state-preserving upsert (installSchedulesFromSpecs), so a
    // re-install refreshes config without clobbering scheduler runtime state.
    const scheduleLogicalToReal = new Map<string, string>();
    let schedulesRegistered = 0;
    if (pack.manifest.schedules.length > 0) {
      const { appScheduleId } = await import("@/lib/apps/app-schedule-id");
      const { installSchedulesFromSpecs } = await import(
        "@/lib/schedules/installer"
      );
      const specs = pack.manifest.schedules.map((sched) => {
        const compositeId = appScheduleId(pack.meta.id, sched.id);
        scheduleLogicalToReal.set(sched.id, compositeId);
        const name =
          typeof (sched as { name?: unknown }).name === "string"
            ? ((sched as { name?: string }).name as string)
            : titleCase(sched.id);
        return {
          id: compositeId,
          name: `${name} (${pack.meta.id})`,
          version: pack.meta.version,
          // Display-only: the scheduler branches on the app: id prefix and
          // dispatches the blueprint; this prompt is never sent to an agent.
          prompt: `App schedule for "${pack.meta.id}" — runs blueprint "${sched.runs}".`,
          cronExpression: sched.cron!,
          recurs: true,
          type: "scheduled" as const,
        };
      });
      installSchedulesFromSpecs(specs);
      schedulesRegistered = specs.length;

      // Own the rows: parent them to the pack's project so the Schedules
      // surface groups them with the app. First install only — a user who
      // reassigned the project keeps their choice (state, not config).
      const { db } = await import("@/lib/db");
      const { schedules: schedulesTable } = await import("@/lib/db/schema");
      const { and, inArray, isNull } = await import("drizzle-orm");
      db.update(schedulesTable)
        .set({ projectId: pack.meta.id })
        .where(
          and(
            inArray(schedulesTable.id, specs.map((s) => s.id)),
            isNull(schedulesTable.projectId)
          )
        )
        .run();
    }

    // 4. File drop — atomic manifest write (with table refs rewritten to real
    // ids) + namespaced profile/blueprint artifacts into the shared dirs.
    const droppedManifest = rewriteTableRefs(
      pack.manifest,
      logicalToReal,
      scheduleLogicalToReal
    );
    // Installation owns the source boundary even if an incoming community
    // manifest claims it was user-created on another Relay instance.
    droppedManifest.origin = "installed-pack";
    // Record the entitlement on the installed manifest so `pack list` (and
    // the future /packs UI) can mark premium packs without re-reading the
    // original pack source (D6).
    if (pack.meta.entitlement) {
      droppedManifest.entitlement = pack.meta.entitlement;
    }
    writeManifest(appsDir, pack.meta.id, droppedManifest);

    const { profilesDropped, blueprintsDropped, dropped } = dropArtifacts(
      resolved.files,
      profilesDir,
      blueprintsDir
    );

    // 4b. Install-state sidecar — version + DEST hashes of every dropped
    // artifact, so `pack update` can compare versions and detect user edits.
    const { writeInstallState, hashFileSha256 } = await import(
      "./install-state"
    );
    const stateFiles: Record<string, string> = {};
    for (const artifact of dropped) {
      stateFiles[artifact.relPath] = hashFileSha256(artifact.destPath);
    }
    writeInstallState(appsDir, pack.meta.id, {
      packVersion: pack.meta.version,
      installedAt: new Date().toISOString(),
      files: stateFiles,
    });

    // The blueprint registry caches its directory scan per process. Without
    // an invalidation here, a pack installed through the running server is
    // half-dead until restart: its row-insert triggers dispatch by
    // getBlueprint(), which would still see the pre-install scan.
    if (blueprintsDropped > 0) {
      const { reloadBlueprints } = await import(
        "@/lib/workflows/blueprints/registry"
      );
      reloadBlueprints();
    }

    // Defense-in-depth for the app-detail Data Cache. `loadRuntimeState`
    // (src/lib/apps/view-kits/data.ts) wraps its projection in
    // unstable_cache({ revalidate:30, tags:['app-runtime:<id>'] }). Reloading
    // the registry above fixes getBlueprint(), but a Data-Cache snapshot taken
    // in the 30s window before enrichment populated could still serve husk
    // cards (raw ids, no Run button). Invalidating the tag here guarantees the
    // freshly-installed app's page reads a live projection, not a stale one.
    // (Did not reproduce on a from-scratch install — the registry singleton is
    // populated before first render — but this closes the latent race.)
    try {
      const { revalidateTag } = await import("next/cache");
      // Next 16 requires a profile/expiry arg. expire:0 = purge the tagged
      // entry immediately so the next render recomputes the projection.
      revalidateTag(`app-runtime:${pack.meta.id}`, { expire: 0 });
    } catch {
      // revalidateTag is a no-op outside a Next request/render scope (e.g. the
      // CLI install path). Never let cache housekeeping fail an install.
    }

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
      schedulesRegistered,
      tier: provenance.tier,
      tierVerified: provenance.verified,
      tierLabel: provenance.label,
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

export function acquirePack(
  source: string
): { dir: string; cleanup: () => void } {
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

// ── Row-insert trigger var fillability guard (block 2d) ──────────────

// Mirror of manifest-trigger-dispatch's ROW_PLACEHOLDER: a blueprint variable
// whose `default` is exactly `{{row.<col>}}` is filled from the inserted row.
const ROW_DEFAULT = /^\{\{\s*row\.([a-zA-Z0-9_-]+)\s*\}\}$/;

/**
 * Convert a manifest blueprint `source` (e.g. `$AINATIVE_DATA_DIR/blueprints/
 * x--y.yaml` or a bare `blueprints/x--y.yaml`) to a resolved-file relPath.
 * Returns null for a source that does not point at a bundled blueprint file
 * (e.g. an inline/absent source), which the caller treats as "can't inspect,
 * skip" rather than a hard failure.
 */
function blueprintRelPathFromSource(source: string | undefined): string | null {
  if (!source) return null;
  const idx = source.indexOf("blueprints/");
  if (idx === -1) return null;
  const rel = source.slice(idx);
  return rel.endsWith(".yaml") ? rel : null;
}

/**
 * Guard: every REQUIRED variable on a row-insert-triggered blueprint must be
 * auto-fillable from the trigger table's row. Throws PackValidationError
 * naming the blueprint, variable, and table when it is not. Skips a trigger
 * whose table is not declared in this manifest (inert here).
 */
function assertRowTriggerVarsFillable(pack: Pack, resolved: ResolvedPack): void {
  const columnsByTable = new Map<string, Set<string>>();
  for (const t of pack.manifest.tables) {
    columnsByTable.set(t.id, new Set((t.columns as string[] | undefined) ?? []));
  }

  for (const bp of pack.manifest.blueprints) {
    const trigger = bp.trigger;
    if (trigger?.kind !== "row-insert") continue;
    const cols = columnsByTable.get(trigger.table);
    // Trigger table not declared here → trigger is inert in this install
    // (e.g. a cross-child trigger installed standalone). Nothing to guard.
    if (!cols) continue;

    const relPath = blueprintRelPathFromSource(bp.source);
    if (!relPath) continue; // no bundled file to inspect
    const file = findResolved(resolved.files, relPath);
    if (!file) continue;

    let parsed: unknown;
    try {
      parsed = yaml.load(fs.readFileSync(file.absPath, "utf-8"));
    } catch (err) {
      throw new PackValidationError(
        `Row-insert blueprint "${bp.id}" could not be read for validation: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    const vars =
      (parsed as { variables?: Array<Record<string, unknown>> })?.variables ??
      [];
    for (const v of vars) {
      if (v.required !== true) continue;
      const varId = String(v.id);
      // Path 1: a column named exactly like the variable (dispatch passthrough).
      if (cols.has(varId)) continue;
      // Path 2: a `{{row.<col>}}` default naming a real column.
      const defStr = typeof v.default === "string" ? v.default : null;
      const m = defStr ? ROW_DEFAULT.exec(defStr) : null;
      if (m && cols.has(m[1])) continue;

      throw new PackValidationError(
        `Row-insert blueprint "${bp.id}" (trigger on table "${trigger.table}") ` +
          `has a required variable "${varId}" that cannot be filled from an ` +
          `inserted row. Give it a "{{row.<col>}}" default naming a column of ` +
          `"${trigger.table}" (${[...cols].join(", ")}), or make it optional. ` +
          `A row-insert trigger has no human to prompt for a required value.`
      );
    }
  }
}

/**
 * Guard: scheduled blueprints run without human-supplied variables. Every
 * required variable must therefore have a default, or the first cron firing
 * will throw "Missing required variables" after the pack has already installed.
 */
function assertScheduledBlueprintVarsFillable(
  pack: Pack,
  resolved: ResolvedPack
): void {
  const blueprintsById = new Map(
    pack.manifest.blueprints.map((bp) => [bp.id, bp])
  );

  for (const sched of pack.manifest.schedules) {
    if (!sched.runs) continue;
    const bp = blueprintsById.get(sched.runs);
    const relPath = blueprintRelPathFromSource(bp?.source);
    if (!relPath) continue; // no bundled file to inspect
    const file = findResolved(resolved.files, relPath);
    if (!file) continue;

    let parsed: unknown;
    try {
      parsed = yaml.load(fs.readFileSync(file.absPath, "utf-8"));
    } catch (err) {
      throw new PackValidationError(
        `Scheduled blueprint "${sched.runs}" could not be read for validation: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    const vars =
      (parsed as { variables?: Array<Record<string, unknown>> })?.variables ??
      [];
    for (const v of vars) {
      if (v.required !== true) continue;
      if (v.default !== undefined && v.default !== null) continue;

      throw new PackValidationError(
        `Manifest schedule "${sched.id}" runs blueprint "${sched.runs}", ` +
          `whose required variable "${String(v.id)}" has no default. ` +
          `Scheduled blueprints run without human input; give the variable a ` +
          `default or make it optional.`
      );
    }
  }
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
  // A single pack ships one seed/customers.yaml; a merged BUNDLE carries one
  // per child (same relPath, distinct child dirs). Aggregate ALL of them and
  // dedupe by slug so a customer shared across children seeds once (matching
  // ensureCustomer's slug-idempotence). Entries without a slug pass through.
  const files = resolved.files.filter(
    (f) => f.relPath === "seed/customers.yaml"
  );
  if (files.length === 0) return [];

  const out: CustomerSeedEntry[] = [];
  const seenSlugs = new Set<string>();
  for (const file of files) {
    const parsed = yaml.load(fs.readFileSync(file.absPath, "utf-8"));
    if (!Array.isArray(parsed)) {
      throw new PackValidationError(
        "seed/customers.yaml must be a YAML list of { slug, name, ... }"
      );
    }
    for (const entry of parsed as CustomerSeedEntry[]) {
      if (entry.slug) {
        if (seenSlugs.has(entry.slug)) continue;
        seenSlugs.add(entry.slug);
      }
      out.push(entry);
    }
  }
  return out;
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
 * Rewrite the manifest's table and schedule refs from authored logical ids
 * to the real ids created at install (tables: UUIDs; schedules: composite
 * `app:<appId>:<id>` DB ids). The running app machinery (row-trigger
 * dispatch, view-kit bindings, scheduleNextFire KPIs) resolves by these ids,
 * so the dropped manifest must carry the real ids, not the author's logical
 * handles.
 */
function rewriteTableRefs(
  manifest: AppManifest,
  logicalToReal: Map<string, string>,
  scheduleLogicalToReal: Map<string, string> = new Map()
): AppManifest {
  const rewritten: AppManifest = {
    ...manifest,
    tables: manifest.tables.map((t) => {
      const real = logicalToReal.get(t.id);
      return real ? { ...t, id: real } : t;
    }),
    // Row-insert triggers bind to tables by the SAME logical id. Dispatch
    // (manifest-trigger-dispatch) matches trigger.table against the REAL
    // UUID, so an unrewritten ref silently never fires.
    blueprints: manifest.blueprints.map((bp) => {
      const triggerTable = bp.trigger?.table;
      if (!triggerTable) return bp;
      const real = logicalToReal.get(triggerTable);
      return real ? { ...bp, trigger: { ...bp.trigger!, table: real } } : bp;
    }),
    schedules: manifest.schedules.map((s) => {
      const real = scheduleLogicalToReal.get(s.id);
      return real ? { ...s, id: real } : s;
    }),
    budgetPolicies: manifest.budgetPolicies.map((policy) =>
      policy.scope === "schedule" && policy.schedule
        ? {
            ...policy,
            schedule:
              scheduleLogicalToReal.get(policy.schedule) ?? policy.schedule,
          }
        : policy
    ),
  };
  // The view binds to tables and schedules by the SAME logical ids. Rewrite
  // those refs too — hero/secondary/cadence/runs bindings and every KPI
  // source (incl. nested ratio numerator/denominator). Missing this leaves
  // the view pointing at a logical name that no longer matches the real id,
  // so KPIs silently read 0 (tables) or null (scheduleNextFire).
  if (rewritten.view) {
    rewritten.view = rewriteViewRefs(rewritten.view, {
      table: logicalToReal,
      schedule: scheduleLogicalToReal,
    }) as AppManifest["view"];
  }
  return rewritten;
}

/** Deep-rewrite every `table`/`schedule` reference inside a view config to its real id. */
function rewriteViewRefs(
  view: unknown,
  maps: { table: Map<string, string>; schedule: Map<string, string> }
): unknown {
  if (Array.isArray(view)) {
    return view.map((v) => rewriteViewRefs(v, maps));
  }
  if (view && typeof view === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(view as Record<string, unknown>)) {
      if ((key === "table" || key === "schedule") && typeof value === "string") {
        out[key] = maps[key].get(value) ?? value;
      } else {
        out[key] = rewriteViewRefs(value, maps);
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

/** One artifact `dropArtifacts` copied: its pack-space relPath + real dest. */
export interface DroppedArtifact {
  relPath: string;
  destPath: string;
}

/**
 * Map a droppable pack file to its destination, or null for files that are
 * consumed rather than dropped (seed/**). Single source for install AND the
 * update path's backup step — both must agree on where an artifact lands.
 */
export function artifactDestPath(
  relPath: string,
  profilesDir: string,
  blueprintsDir: string
): string | null {
  if (relPath.startsWith("profiles/")) {
    return path.join(profilesDir, relPath.slice("profiles/".length));
  }
  if (relPath.startsWith("blueprints/") && relPath.endsWith(".yaml")) {
    return path.join(blueprintsDir, relPath.slice("blueprints/".length));
  }
  return null;
}

function dropArtifacts(
  files: ResolvedPackFile[],
  profilesDir: string,
  blueprintsDir: string
): {
  profilesDropped: number;
  blueprintsDropped: number;
  dropped: DroppedArtifact[];
} {
  const profileDirs = new Set<string>();
  let blueprintsDropped = 0;
  const dropped: DroppedArtifact[] = [];

  for (const file of files) {
    const dest = artifactDestPath(file.relPath, profilesDir, blueprintsDir);
    if (!dest) continue; // seed/** is consumed during the DB write, not dropped.
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file.absPath, dest);
    dropped.push({ relPath: file.relPath, destPath: dest });
    if (file.relPath.startsWith("profiles/")) {
      // Count distinct top-level profile dirs (<appId>--<name>).
      const top = file.relPath.split("/")[1];
      if (top) profileDirs.add(top);
    } else {
      blueprintsDropped += 1;
    }
  }

  return { profilesDropped: profileDirs.size, blueprintsDropped, dropped };
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
