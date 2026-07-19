import { getAinativeAppsDir } from "@/lib/utils/ainative-paths";

/**
 * Testable command dispatcher for `relay pack <action>`. Kept separate from
 * bin/cli.ts so the argv → action mapping is unit-tested without spawning the
 * CLI. bin/cli.ts does only thin firstArg detection + a dynamic import of this
 * module (TDR-032: never statically pull the DB/runtime chain into the CLI's
 * default startup graph).
 *
 * Returns a process exit code (0 = success, 1 = error). All output goes
 * through the injected `io.log` / `io.error` so the caller (or a test) owns the
 * sink — zero silent steps (Principle #1).
 */

export interface PackCommandIo {
  appsDir?: string;
  profilesDir?: string;
  blueprintsDir?: string;
  log: (message: string) => void;
  error: (message: string) => void;
}

const USAGE = [
  "Usage: relay pack <action>",
  "  add <name|path|git-url> [--license-url=<path|url>] [--allow-community]   install a pack",
  "  list                 list installed packs",
  "  remove <id>          remove a pack; retain its business data and reusable primitives",
  "  update <id> [source] [--license-url=<path|url>]      update to a newer version",
].join("\n");

/**
 * Pull a `--flag=value` (or `--flag value`) out of argv, returning its value
 * and the remaining positional args. Kept tiny + local — the pack CLI has one
 * flag; a flag library would be premature (Principle #6).
 */
function extractFlag(
  argv: string[],
  name: string
): { value?: string; rest: string[] } {
  const rest: string[] = [];
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === `--${name}`) {
      value = argv[i + 1];
      i++; // consume the value token
    } else if (tok.startsWith(`--${name}=`)) {
      value = tok.slice(`--${name}=`.length);
    } else {
      rest.push(tok);
    }
  }
  return { value, rest };
}

/**
 * Pull a bare boolean `--flag` (no value) out of argv, returning whether it was
 * present and the remaining positional args. Local + tiny, same rationale as
 * extractFlag (Principle #6).
 */
function hasFlag(argv: string[], name: string): { present: boolean; rest: string[] } {
  const rest: string[] = [];
  let present = false;
  for (const tok of argv) {
    if (tok === `--${name}`) present = true;
    else rest.push(tok);
  }
  return { present, rest };
}

export async function runPackCommand(
  argv: string[],
  io: PackCommandIo
): Promise<number> {
  const action = argv[0];
  const { value: licenseUrl, rest: afterLicense } = extractFlag(
    argv.slice(1),
    "license-url"
  );
  const { present: allowCommunity, rest } = hasFlag(
    afterLicense,
    "allow-community"
  );
  const arg = rest[0];

  switch (action) {
    case "add":
      return runAdd(arg, licenseUrl, allowCommunity, io);
    case "list":
      return runList(io);
    case "remove":
      return runRemove(arg, io);
    case "update":
      return runUpdate(arg, rest[1], licenseUrl, io);
    default:
      io.error(`Unknown pack action: ${action ?? "(none)"}`);
      io.error(USAGE);
      return 1;
  }
}

async function runAdd(
  source: string | undefined,
  licenseUrl: string | undefined,
  allowCommunity: boolean,
  io: PackCommandIo
): Promise<number> {
  if (!source) {
    io.error("Missing pack source. Usage: relay pack add <name|path|git-url>");
    return 1;
  }
  try {
    const { installPack } = await import("./install");
    const { packTierBadge } = await import("./provenance");
    const report = await installPack(source, {
      appsDir: io.appsDir,
      profilesDir: io.profilesDir,
      blueprintsDir: io.blueprintsDir,
      licenseUrl,
      allowCommunity,
    });
    io.log(
      `Installed ${report.packId}@${report.packVersion} ` +
        `[${packTierBadge(report.tier, report.tierLabel)}]: ` +
        `${report.projectCreated ? "project created" : "project reused"}, ` +
        `${report.tablesCreated} table(s) (${report.rowsSeeded} row(s)), ` +
        `${report.customersSeeded} customer(s), ` +
        `${report.profilesDropped} profile(s), ` +
        `${report.blueprintsDropped} blueprint(s), ` +
        `${report.schedulesRegistered} schedule(s).`
    );
    return 0;
  } catch (err) {
    io.error(
      `Failed to install pack: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}

async function runList(io: PackCommandIo): Promise<number> {
  try {
    const { listApps } = await import("@/lib/apps/registry");
    const appsDir = io.appsDir ?? getAinativeAppsDir();
    const apps = listApps(appsDir);
    if (apps.length === 0) {
      io.log("No packs installed.");
      return 0;
    }
    const { packUpdateAvailability } = await import("./update");
    for (const app of apps) {
      const premium = app.entitlement ? "  [premium]" : "";
      const avail = packUpdateAvailability(app.id, { appsDir });
      const version = avail.installedVersion
        ? `  installed v${avail.installedVersion}`
        : "";
      const update =
        avail.updateAvailable && avail.availableVersion
          ? `  [update available → v${avail.availableVersion}]`
          : "";
      io.log(
        `${app.id}  ${app.name}  ${app.primitivesSummary}${version}${update}${premium}`
      );
    }
    return 0;
  } catch (err) {
    io.error(
      `Failed to list packs: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}

async function runRemove(
  id: string | undefined,
  io: PackCommandIo
): Promise<number> {
  if (!id) {
    io.error("Missing pack id. Usage: relay pack remove <id>");
    return 1;
  }
  try {
    const { removeInstalledPack } = await import("@/lib/apps/registry");
    const result = await removeInstalledPack(id, {
      appsDir: io.appsDir ?? getAinativeAppsDir(),
    });
    if (!result) {
      io.log(`Pack not found: ${id} (nothing removed).`);
      return 0;
    }
    io.log(
      `Removed ${id}: ` +
        `installed-pack files and ${result.schedulesRemoved} schedule(s).`
    );
    io.log(
      `Retained: ${result.retained.tables} table(s) with rows/columns/triggers, ` +
        `${result.retained.profiles} profile(s), ` +
        `${result.retained.blueprints} blueprint(s), durable customers, and ` +
        `customer attribution. Delete retained data separately from its owning ` +
        `view if intended; pack removal is not Relay Cell deletion.`
    );
    return 0;
  } catch (err) {
    io.error(
      `Failed to remove pack: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}

async function runUpdate(
  id: string | undefined,
  source: string | undefined,
  licenseUrl: string | undefined,
  io: PackCommandIo
): Promise<number> {
  if (!id) {
    io.error(
      "Missing pack id. Usage: relay pack update <id> [source] [--license-url=<path|url>]"
    );
    return 1;
  }
  try {
    const { updatePack } = await import("./update");
    const report = await updatePack(id, {
      appsDir: io.appsDir,
      profilesDir: io.profilesDir,
      blueprintsDir: io.blueprintsDir,
      source,
      licenseUrl,
    });

    if (report.upToDate) {
      io.log(
        `${report.packId} is already up to date (v${report.newVersion}).`
      );
      return 0;
    }

    const install = report.install!;
    io.log(
      `Updated ${report.packId} v${report.previousVersion ?? "unknown"} → v${report.newVersion}: ` +
        `${install.tablesCreated} table(s) added (${install.rowsSeeded} row(s)), ` +
        `${install.profilesDropped} profile(s), ` +
        `${install.blueprintsDropped} blueprint(s), ` +
        `${install.schedulesRegistered} schedule(s).`
    );
    if (report.backedUp.length > 0) {
      io.log(
        `Backed up ${report.backedUp.length} user-modified file(s) to ` +
          `apps/${report.packId}/backup/${report.previousVersion ?? "unknown"}/ before overwriting:`
      );
      for (const relPath of report.backedUp) {
        io.log(`  ${relPath}`);
      }
    }
    return 0;
  } catch (err) {
    io.error(
      `Failed to update pack: ${err instanceof Error ? err.message : String(err)}`
    );
    return 1;
  }
}
