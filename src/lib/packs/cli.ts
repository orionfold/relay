import {
  getAinativeAppsDir,
  getAinativeBlueprintsDir,
  getAinativeProfilesDir,
} from "@/lib/utils/ainative-paths";

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
  "  add <name|path|git-url> [--license-url=<path|url>]   install a pack",
  "  list                 list installed packs",
  "  remove <id>          uninstall a pack",
  "  update <id>          (v1 stub — editable-seed; edit in place)",
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

export async function runPackCommand(
  argv: string[],
  io: PackCommandIo
): Promise<number> {
  const action = argv[0];
  const { value: licenseUrl, rest } = extractFlag(argv.slice(1), "license-url");
  const arg = rest[0];

  switch (action) {
    case "add":
      return runAdd(arg, licenseUrl, io);
    case "list":
      return runList(io);
    case "remove":
      return runRemove(arg, io);
    case "update":
      return runUpdate(arg, io);
    default:
      io.error(`Unknown pack action: ${action ?? "(none)"}`);
      io.error(USAGE);
      return 1;
  }
}

async function runAdd(
  source: string | undefined,
  licenseUrl: string | undefined,
  io: PackCommandIo
): Promise<number> {
  if (!source) {
    io.error("Missing pack source. Usage: relay pack add <name|path|git-url>");
    return 1;
  }
  try {
    const { installPack } = await import("./install");
    const report = await installPack(source, {
      appsDir: io.appsDir,
      profilesDir: io.profilesDir,
      blueprintsDir: io.blueprintsDir,
      licenseUrl,
    });
    io.log(
      `Installed ${report.packId}@${report.packVersion}: ` +
        `${report.projectCreated ? "project created" : "project reused"}, ` +
        `${report.tablesCreated} table(s) (${report.rowsSeeded} row(s)), ` +
        `${report.customersSeeded} customer(s), ` +
        `${report.profilesDropped} profile(s), ` +
        `${report.blueprintsDropped} blueprint(s).`
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
    for (const app of apps) {
      const premium = app.entitlement ? "  [premium]" : "";
      io.log(`${app.id}  ${app.name}  ${app.primitivesSummary}${premium}`);
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
    const { deleteAppCascade } = await import("@/lib/apps/registry");
    const result = await deleteAppCascade(id, {
      appsDir: io.appsDir ?? getAinativeAppsDir(),
      profilesDir: io.profilesDir ?? getAinativeProfilesDir(),
      blueprintsDir: io.blueprintsDir ?? getAinativeBlueprintsDir(),
    });
    if (
      !result.filesRemoved &&
      !result.projectRemoved &&
      result.profilesRemoved === 0 &&
      result.blueprintsRemoved === 0
    ) {
      io.log(`Pack not found: ${id} (nothing removed).`);
      return 0;
    }
    io.log(
      `Removed ${id}: ` +
        `${result.projectRemoved ? "project + rows, " : ""}` +
        `${result.filesRemoved ? "manifest, " : ""}` +
        `${result.profilesRemoved} profile(s), ${result.blueprintsRemoved} blueprint(s).`
    );
    // Customers are durable business data, not namespaced pack files — the
    // cascade deliberately does not touch them. Surface that so a "remove"
    // never silently looks like it also wiped customer records + attribution.
    io.log(
      `Note: customers seeded by this pack are retained (customer records and ` +
        `their cost attribution are durable business data). Remove them ` +
        `manually from /customers if intended.`
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
  io: PackCommandIo
): Promise<number> {
  // v1 is editable-seed: there is no managed base to re-pull yet. The command
  // exists so the future managed-base spec is additive (a new behavior on an
  // existing verb), not a new verb.
  io.log(
    `pack update${id ? ` ${id}` : ""}: managed-base updates land in a future release. ` +
      `v1 is editable-seed — edit the installed pack in place.`
  );
  return 0;
}
