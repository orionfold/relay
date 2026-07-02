import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import {
  getAinativeAppsDir,
  getAinativeBlueprintsDir,
  getAinativeProfilesDir,
} from "@/lib/utils/ainative-paths";
import { getApp } from "@/lib/apps/registry";
import {
  acquirePack,
  artifactDestPath,
  relayCoreVersion,
  installPack,
  type InstallPackOptions,
  type InstallReport,
} from "./install";
import { parsePack, resolvePackLayer, PackValidationError } from "./format";
import { findPackTemplate } from "./catalog";
import { hashFileSha256, readInstallState } from "./install-state";

/**
 * `relay pack update <id> [source]` — bring an INSTALLED pack to a newer
 * version. The apply step is the existing idempotent `installPack` (gate
 * before writes, table reuse without re-seed, state-preserving schedule
 * upsert); this module adds what update needs on top: version comparison via
 * the install-state sidecar, the renewal-voiced license gate, and
 * backup-then-overwrite protection for user-edited artifacts.
 *
 * D4 invariant (public promise): a failed or missing license refuses the
 * UPDATE and touches nothing — every installed artifact keeps working
 * exactly as it is. The gate runs BEFORE the backup step so a refusal leaves
 * zero trace on disk. There is no online re-validation anywhere in this path.
 *
 * Additive-only invariant (prior art: features/app-updates-dependencies.md):
 * update never deletes files, tables, rows, or customers. Artifacts the new
 * version no longer ships simply stay in place.
 */

export class PackNotInstalledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackNotInstalledError";
  }
}

export interface UpdatePackOptions extends InstallPackOptions {
  /** Explicit pack source (path/git URL). Defaults to the bundled template for <id>. */
  source?: string;
}

export interface UpdateReport {
  packId: string;
  /** Version from the install-state sidecar; null when unknown (pre-0.21 install). */
  previousVersion: string | null;
  newVersion: string;
  /** True ⇒ nothing to do: no gate run, zero writes. */
  upToDate: boolean;
  /** relPaths of user-modified artifacts copied to backup/<oldVersion>/ before overwrite. */
  backedUp: string[];
  /** The underlying install report (absent when upToDate). */
  install?: InstallReport;
}

export interface UpdateAvailability {
  /** From the install-state sidecar; null = unknown (pre-0.21 install). */
  installedVersion: string | null;
  /** The bundled template's version; null when no template exists for this id. */
  availableVersion: string | null;
  updateAvailable: boolean;
}

/**
 * The ONE comparison source for "is an update available?" — CLI `pack list`,
 * the /packs card, and the update API all derive from this (D7). An unknown
 * installed version counts as older than any template, mirroring updatePack.
 */
export function packUpdateAvailability(
  appId: string,
  opts: { appsDir?: string; templatesDir?: string } = {}
): UpdateAvailability {
  const appsDir = opts.appsDir ?? getAinativeAppsDir();
  const installedVersion =
    readInstallState(appsDir, appId)?.packVersion ?? null;
  const template = findPackTemplate(appId, { templatesDir: opts.templatesDir });
  const availableVersion = template?.meta?.version ?? null;
  const updateAvailable =
    availableVersion !== null &&
    semver.valid(availableVersion) !== null &&
    (installedVersion === null ||
      semver.valid(installedVersion) === null ||
      semver.compare(availableVersion, installedVersion) > 0);
  return { installedVersion, availableVersion, updateAvailable };
}

export async function updatePack(
  id: string,
  options: UpdatePackOptions = {}
): Promise<UpdateReport> {
  const appsDir = options.appsDir ?? getAinativeAppsDir();
  const profilesDir = options.profilesDir ?? getAinativeProfilesDir();
  const blueprintsDir = options.blueprintsDir ?? getAinativeBlueprintsDir();

  // 1. The pack must already be installed — update is not install.
  const installed = getApp(id, appsDir);
  if (!installed) {
    throw new PackNotInstalledError(
      `Pack "${id}" is not installed. Install it first with: relay pack add ${id}`
    );
  }
  const state = readInstallState(appsDir, id);
  const previousVersion = state?.packVersion ?? null;

  // 2. Resolve + acquire the source (explicit path/git arg wins, else the
  // bundled template for this id), then validate strictly.
  const { resolvePackSource } = await import("./catalog");
  const resolvedSource = resolvePackSource(options.source ?? id, {
    templatesDir: options.templatesDir,
  });
  const { dir: packDir, cleanup } = acquirePack(resolvedSource);

  try {
    const pack = parsePack(packDir);

    if (pack.meta.id !== id) {
      throw new PackValidationError(
        `Update source is pack "${pack.meta.id}", not "${id}" — refusing to cross-update.`
      );
    }

    const coreVersion = options.coreVersion ?? relayCoreVersion();
    if (pack.meta.relayCore && !semver.satisfies(coreVersion, pack.meta.relayCore)) {
      throw new PackValidationError(
        `Pack ${pack.meta.id}@${pack.meta.version} requires relay-core ${pack.meta.relayCore}, ` +
          `but this install is ${coreVersion}.`
      );
    }

    // 3. Version comparison. Not newer → done: no gate, zero writes. An
    // unknown installed version (missing/corrupt sidecar) always proceeds —
    // pre-0.21 installs must be updatable.
    const newVersion = pack.meta.version;
    if (
      previousVersion !== null &&
      semver.valid(previousVersion) &&
      semver.valid(newVersion) &&
      semver.compare(newVersion, previousVersion) <= 0
    ) {
      return {
        packId: id,
        previousVersion,
        newVersion,
        upToDate: true,
        backedUp: [],
      };
    }

    // 4. License gate — the renewal chokepoint, BEFORE any write (including
    // backups). Same offline gate as install; only the refusal voice differs:
    // it must state the D4 promise (installed content keeps working) and name
    // the fix (renew).
    if (pack.meta.entitlement) {
      const { assertEntitled, PackLicenseError } = await import(
        "@/lib/licensing/gate"
      );
      try {
        if (options.licenseUrl) {
          const { loadLicense } = await import("@/lib/licensing/load");
          const license = await loadLicense(options.licenseUrl);
          assertEntitled(pack.meta.entitlement, license);
        } else {
          const { findEntitledLicense } = await import("@/lib/licensing/store");
          if (!findEntitledLicense(pack.meta.entitlement)) {
            assertEntitled(pack.meta.entitlement, undefined);
          }
        }
      } catch (err) {
        if (err instanceof PackLicenseError) {
          const renew = pack.meta.purchaseUrl
            ? `renew at ${pack.meta.purchaseUrl}`
            : `redeem one with: relay license add <path-or-url to your .license.json>`;
          // Value-recap voice: name what the withheld update contains, from
          // the pack's own changelog (fail-open — silence if it has none).
          let withheld = "";
          try {
            const { changelogWindow } = await import("@/lib/licensing/recap");
            const pending = changelogWindow(
              pack.meta.changelog,
              previousVersion,
              newVersion
            );
            if (pending.length > 0) {
              withheld =
                `This update includes: ` +
                pending.map((p) => `v${p.version} — ${p.note}`).join("; ") +
                ` `;
            }
          } catch {
            // recap is decoration on the refusal, never a second failure.
          }
          throw new PackLicenseError(
            `Your installed ${id} keeps working — nothing is locked. ` +
              `Updating to v${newVersion} needs an active license: ${renew}. ` +
              withheld +
              `(${err.message})`,
            err.reason
          );
        }
        throw err;
      }
    }

    // 5. Backup-then-overwrite. A destination file whose bytes differ from
    // the recorded install hash was edited by the user — copy it to
    // backup/<oldVersion>/<relPath> BEFORE the overwrite. No sidecar ⇒ every
    // existing artifact is potentially user-modified ⇒ back up all of them.
    const resolved = resolvePackLayer(pack);
    const backupRoot = path.join(
      appsDir,
      id,
      "backup",
      previousVersion ?? "unknown"
    );
    const backedUp: string[] = [];
    for (const file of resolved.files) {
      const dest = artifactDestPath(file.relPath, profilesDir, blueprintsDir);
      if (!dest || !fs.existsSync(dest)) continue;
      const recorded = state?.files[file.relPath];
      if (recorded !== undefined && hashFileSha256(dest) === recorded) continue;
      const backupPath = path.join(backupRoot, file.relPath);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(dest, backupPath);
      backedUp.push(file.relPath);
    }

    // 6. Apply — the idempotent install path (rewrites the sidecar for the
    // new version as its last step). packDir is a local dir here, so the
    // inner acquire is a passthrough even for git sources.
    const install = await installPack(packDir, {
      appsDir,
      profilesDir,
      blueprintsDir,
      coreVersion: options.coreVersion,
      licenseUrl: options.licenseUrl,
      templatesDir: options.templatesDir,
    });

    return {
      packId: id,
      previousVersion,
      newVersion,
      upToDate: false,
      backedUp,
      install,
    };
  } finally {
    cleanup();
  }
}
