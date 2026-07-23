import { program } from "commander";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "fs";
import { spawn } from "child_process";
import { createServer } from "net";
import {
  buildNextLaunchArgs,
  buildSidecarUrl,
  isNonLoopbackHost,
  resolveNextEntrypoint,
  resolveSidecarPort,
} from "../src/lib/desktop/sidecar-launch";
import {
  ensurePrebuilt,
  isPrebuiltCurrent,
} from "../src/lib/desktop/prebuilt-download";
import { syncHoistedWorkspaceInputs } from "../src/lib/desktop/hoisted-workspace";
import { getAinativeDataDir, getAinativeDbPath } from "../src/lib/utils/ainative-paths";
import {
  BetterSqlite3NativeBindingUnavailableError,
  ensureBetterSqlite3NativeBinding,
} from "../src/lib/cli/native-binding-preflight";
import { isDevMode } from "../src/lib/instance/detect";
import {
  serializeRelayLaunchContext,
  type RelayLaunchContext,
} from "../src/lib/instance/launch-context";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "..");
const launchCwd = process.cwd();

async function ensureNativeSqliteOrExit(): Promise<void> {
  try {
    await ensureBetterSqlite3NativeBinding();
  } catch (error) {
    if (error instanceof BetterSqlite3NativeBindingUnavailableError) {
      console.error(`${error.name}: ${error.message}`);
    } else {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`BetterSqlite3NativeBindingPreflightError: ${reason}`);
    }
    process.exit(1);
  }
}

// Auto-write .env.local on first run in a non-dev launch folder. This gives
// new npx users a per-folder isolated DB by default — no red sidebar badge,
// no manual Fix click. Skipped in the main dev repo (isDevMode) and skipped
// when the user has already set RELAY_DATA_DIR in their shell.
const _envLocalPath = join(launchCwd, ".env.local");
// An explicit --data-dir flag means the user has already chosen where data
// lives, so the per-folder isolation convenience-write would only add a
// confusing, unused .env.local. Detect the flag from raw argv here (the flag is
// applied to RELAY_DATA_DIR further down, after the .env.local load, so it wins
// over any auto-written value).
const _hasDataDirFlag = process.argv
  .slice(2)
  .some((a) => a === "--data-dir" || a.startsWith("--data-dir="));
const _isHostCommand = process.argv[2] === "host";
const _firstRunNeedsEnv =
  !existsSync(_envLocalPath) &&
  !process.env.RELAY_DATA_DIR &&
  !_hasDataDirFlag &&
  !_isHostCommand &&
  !isDevMode(launchCwd);

if (_firstRunNeedsEnv) {
  const folderName = basename(launchCwd);
  const autoDataDir = join(homedir(), `.${folderName}`);
  // The auto-write is a convenience (per-folder isolated DB), not a hard
  // requirement — dataDir() falls back to ~/.relay when no override exists.
  // So a failed write must be non-fatal. GitHub issue #1: running `npx` from a
  // \\wsl.localhost UNC path makes CMD.EXE silently reset cwd to C:\Windows
  // (unwritable), which threw an unhandled EPERM here and crashed the CLI
  // before it could even print --help. Warn clearly and continue.
  try {
    writeFileSync(
      _envLocalPath,
      `# Auto-created by orionfold-relay on first run.\n` +
        `# Points this folder's install at an isolated data directory.\n` +
        `RELAY_DATA_DIR=${autoDataDir}\n`,
      "utf-8",
    );
    console.log(`First run — wrote ${_envLocalPath} (RELAY_DATA_DIR=${autoDataDir}).`);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(
      `Warning: could not write ${_envLocalPath} (${reason}).\n` +
        `Continuing with the default data directory (~/.relay). This folder ` +
        `will not get an isolated database.`,
    );
    // WSL/Windows: a UNC-path launch lands cwd in C:\Windows. Point the user
    // at the fix so they aren't left guessing why the write failed.
    if (/^([A-Za-z]:)?[\\/]Windows([\\/]|$)/.test(launchCwd)) {
      console.warn(
        `It looks like you launched from a Windows UNC path under WSL, so the ` +
          `working directory defaulted to "${launchCwd}". Run relay from your ` +
          `Linux filesystem instead — e.g. \`cd ~\` first, or run it from a WSL ` +
          `home directory rather than a \\\\wsl.localhost\\... path.`,
      );
    }
  }
}

// Load .env.local from the launch directory. For a local CLI launcher the
// user's .env.local is the authoritative source of runtime config — it wins
// over shell env so the `Fix` sidebar action actually takes effect on the
// very next `npx orionfold-relay` invocation, regardless of stale exports
// from earlier experiments or direnv-style tools.
if (existsSync(_envLocalPath)) {
  for (const line of readFileSync(_envLocalPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed
      .slice(eqIdx + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (key) {
      process.env[key] = val;
    }
  }
}

// Apply --data-dir to RELAY_DATA_DIR BEFORE the subcommand short-circuits
// below. The pack/license/plugin verbs detect themselves from raw argv and
// exit before program.parse() runs (which is where --data-dir is normally
// mapped, at line ~224). Without this pre-scan those subcommands silently
// ignore --data-dir and write to the default dir / the .env.local value — a
// wrong-location write with no error. Running this AFTER the .env.local load
// (above) makes an explicit flag win over an auto-written RELAY_DATA_DIR, which
// is the documented precedence ("overrides RELAY_DATA_DIR"). Kept as a tiny
// local scanner rather than importing packs/cli's extractFlag: that module
// carries the DB/install dependency chain we must keep out of the default
// startup graph (TDR-032).
function scanDataDirFlag(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === "--data-dir") return argv[i + 1];
    if (tok.startsWith("--data-dir=")) return tok.slice("--data-dir=".length);
  }
  return undefined;
}
const _dataDirFlag = scanDataDirFlag(process.argv.slice(2));
if (_dataDirFlag) {
  process.env.RELAY_DATA_DIR = _dataDirFlag;
}

const pkg = JSON.parse(readFileSync(join(appDir, "package.json"), "utf-8"));

function getHelpText() {
  const dir = getAinativeDataDir();
  const db = getAinativeDbPath();
  return `
Data:
  Directory        ${dir}
  Database         ${db}
  Sessions         ${join(dir, "sessions")}
  Logs             ${join(dir, "logs")}

Environment variables:
  RELAY_DATA_DIR   Custom data directory for the web app
  ANTHROPIC_API_KEY Claude runtime access
  OPENAI_API_KEY   OpenAI Codex runtime access

Examples:
  node dist/cli.js --port 3210 --no-open
  node dist/cli.js --hostname 0.0.0.0 --exposure-profile private-authenticated --public-origin http://192.168.1.20:3000
  node dist/cli.js --data-dir ~/.relay-dogfood --port 3100
  node dist/cli.js plugin dry-run my-plugin    # print confinement policy
  node dist/cli.js pack add ./my-pack          # install a Relay pack (folder or git url)
  node dist/cli.js pack list                   # list installed packs
  node dist/cli.js pack remove my-pack         # uninstall a pack
  node dist/cli.js license add <path-or-url>   # redeem a license (from your fulfilment email)
  node dist/cli.js license status              # show saved licenses + entitlements
  node dist/cli.js license remove <id>         # remove a saved license (packs stay installed)
  node dist/cli.js auth bootstrap              # issue a 15-minute first-admin credential
  node dist/cli.js auth status                 # inspect local access state
  node dist/cli.js recovery key create --out /secure/relay-cell.key
  node dist/cli.js recovery create --destination /mnt/relay-backups --key-file /secure/relay-cell.key
  node dist/cli.js recovery verify --bundle <path> --key-file /secure/relay-cell.key
  node dist/cli.js recovery restore --bundle <path> --key-file <path> --target-data-dir ~/.relay-restored
  node dist/cli.js host inventory            # inspect the local Relay Host supervisor registry
`;
}

program
  .name("relay")
  .description("Orionfold Relay — a local-first, multi-agent orchestration runtime and builder scaffold for AI-native work.")
  .version(pkg.version)
  .addHelpText("after", getHelpText)
  .option("-p, --port <number>", "port to start on", "3000")
  .option(
    "--hostname <host>",
    "host to bind to (default 127.0.0.1; use 0.0.0.0 to expose on the network)",
    "127.0.0.1",
  )
  .option("--data-dir <path>", "custom data directory (overrides RELAY_DATA_DIR)")
  .option(
    "--exposure-profile <profile>",
    "trusted-local, private-authenticated, or remote-authenticated",
    process.env.RELAY_EXPOSURE_PROFILE || "trusted-local",
  )
  .option("--public-origin <url>", "browser-visible origin for authenticated access")
  .option(
    "--route-prefix <path>",
    "server-owned URL prefix for this Cell",
    process.env.RELAY_ROUTE_PREFIX || "/",
  )
  .option("--reset", "delete the local database before starting")
  .option("--no-open", "don't auto-open browser")
  .option("--safe-mode", "disable Kind-1 plugin MCP servers; Kind-5 primitives bundles still load");

/**
 * T14: `relay plugin dry-run <pluginId>` — print the computed confinement
 * policy (mode, platform support, expanded sandbox-exec/aa-exec/docker args)
 * for a given plugin without actually spawning anything.
 *
 * We detect subcommand invocation BEFORE program.parse() so the subcommand
 * path can short-circuit the default server-launch flow (DB migration,
 * Next.js spawn, etc.). The dry-run command does its own minimal setup.
 */
const firstArg = process.argv[2];
const isPluginSubcommand = firstArg === "plugin";
const isPackSubcommand = firstArg === "pack";
const isLicenseSubcommand = firstArg === "license";
const isAuthSubcommand = firstArg === "auth";
const isRecoverySubcommand = firstArg === "recovery";
const isHostSubcommand = firstArg === "host";

if (isPluginSubcommand) {
  const action = process.argv[3];
  const pluginId = process.argv[4];
  if (action !== "dry-run") {
    console.error(`Unknown plugin action: ${action ?? "(none)"}`);
    console.error("Available actions: dry-run");
    process.exit(1);
  }
  if (!pluginId) {
    console.error("Usage: relay plugin dry-run <pluginId>");
    process.exit(1);
  }
  // Dynamic import keeps the confinement module + its dependency chain out of
  // the default CLI startup path.
  const { dryRunConfinement } = await import(
    "../src/lib/plugins/confinement/wrap"
  );
  const result = await dryRunConfinement(pluginId);
  console.log(result);
  process.exit(0);
}

if (isPackSubcommand) {
  // `relay pack add|list|remove|update` — installs/manages Relay packs.
  // Detected here, BEFORE program.parse(), so the pack path short-circuits the
  // default server-launch flow. The command logic is dynamically imported so
  // its DB/install dependency chain never enters the default startup graph
  // (TDR-032 — no static top-level import of runtime-registry-adjacent code).
  await ensureNativeSqliteOrExit();
  const { runPackCommand } = await import("../src/lib/packs/cli");
  const code = await runPackCommand(process.argv.slice(3), {
    log: (m) => console.log(m),
    error: (m) => console.error(m),
  });
  process.exit(code);
}

if (isLicenseSubcommand) {
  // `relay license add|status|remove` — redeem/inspect/remove licenses (D2).
  // Same short-circuit + dynamic-import shape as the pack verb (TDR-032).
  // Store location honors RELAY_DATA_DIR, same as pack's dirs.
  const { runLicenseCommand } = await import("../src/lib/licensing/cli");
  const code = await runLicenseCommand(process.argv.slice(3), {
    log: (m) => console.log(m),
    error: (m) => console.error(m),
  });
  process.exit(code);
}

if (isAuthSubcommand) {
  await ensureNativeSqliteOrExit();
  const { runAuthCommand } = await import("../src/lib/host-ingress/cli");
  const code = await runAuthCommand(process.argv.slice(3), {
    log: (m) => console.log(m),
    error: (m) => console.error(m),
  });
  process.exit(code);
}

if (isRecoverySubcommand) {
  await ensureNativeSqliteOrExit();
  const { runRecoveryCommand } = await import("../src/lib/recovery/cli");
  const code = await runRecoveryCommand(process.argv.slice(3), {
    log: (m) => console.log(m),
    error: (m) => console.error(m),
  });
  process.exit(code);
}

if (isHostSubcommand) {
  await ensureNativeSqliteOrExit();
  const [{ runHostCommand }, { relayProductVersion }] = await Promise.all([
    import("../src/lib/host/supervisor/cli"),
    import("../src/lib/config/version"),
  ]);
  const code = await runHostCommand(
    process.argv.slice(3),
    {
      log: (message) => console.log(message),
      error: (message) => console.error(message),
    },
    { version: relayProductVersion() },
  );
  process.exit(code);
}

program.parse();

const opts = program.opts();

// Apply --data-dir before resolving paths. Redundant with the pre-parse scan
// above (which also covers the subcommand short-circuits), but kept as the
// canonical commander-parsed application for the server-launch path.
if (opts.dataDir) {
  process.env.RELAY_DATA_DIR = opts.dataDir;
}
process.env.RELAY_EXPOSURE_PROFILE = opts.exposureProfile;
if (opts.publicOrigin) process.env.RELAY_PUBLIC_ORIGIN = opts.publicOrigin;
process.env.RELAY_ROUTE_PREFIX = opts.routePrefix;

// Apply --safe-mode: export RELAY_SAFE_MODE=true so mcp-loader short-circuits
// Kind-1 plugin MCP servers. Kind-5 primitives bundles are managed separately
// (src/lib/plugins/registry.ts) and are not affected by this flag.
if (opts.safeMode) {
  process.env.RELAY_SAFE_MODE = "true";
  console.log("Safe mode: Kind-1 plugin MCP servers disabled for this session.");
}

// This preflight must happen before the first dynamic import that can reach
// Relay's database graph. Keeping every better-sqlite3/Drizzle import below it
// lets npm-12 one-off installs report and repair a blocked native binding in
// Relay's own words instead of crashing during ESM module evaluation.
await ensureNativeSqliteOrExit();

const { migrateLegacyData, shouldMigrateLegacyHomeData } = await import(
  "../src/lib/utils/migrate-to-ainative"
);
const { default: Database } = await import("better-sqlite3");
const { drizzle } = await import("drizzle-orm/better-sqlite3");
const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
const {
  bootstrapAinativeDatabase,
  hasLegacyTables,
  hasMigrationHistory,
  markAllMigrationsApplied,
} = await import("../src/lib/db/bootstrap");

// Migrate a legacy home layout only when this process owns the default
// ~/.relay data surface. An explicit/private RELAY_DATA_DIR is an isolation
// boundary: starting that Cell must never inspect or rewrite the operator's
// default database.
if (shouldMigrateLegacyHomeData()) {
  await migrateLegacyData();
} else {
  console.log("[migrate] skipped legacy home migration: custom RELAY_DATA_DIR is active");
}

const DATA_DIR = getAinativeDataDir();
const dbPath = getAinativeDbPath();
const requestedPort = Number.parseInt(opts.port, 10);

if (Number.isNaN(requestedPort) || requestedPort <= 0) {
  program.error(`Invalid port: ${opts.port}`);
}

// 1. Data directory setup
for (const dir of [DATA_DIR, join(DATA_DIR, "logs"), join(DATA_DIR, "sessions")]) {
  mkdirSync(dir, { recursive: true });
}

// 2. Handle --reset
if (opts.reset) {
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
    // Also remove WAL/SHM files if present.
    for (const suffix of ["-wal", "-shm"]) {
      const filePath = dbPath + suffix;
      if (existsSync(filePath)) unlinkSync(filePath);
    }
    console.log("Database reset.");
  } else {
    console.log("No database found to reset.");
  }
}

// 3. Database migrations
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
const migrationsDir = join(appDir, "src", "lib", "db", "migrations");
const db = drizzle(sqlite);
const needsLegacyRecovery =
  hasLegacyTables(sqlite) && !hasMigrationHistory(sqlite);

if (needsLegacyRecovery) {
  bootstrapAinativeDatabase(sqlite);
  markAllMigrationsApplied(sqlite, migrationsDir);
  console.log("Recovered legacy database schema.");
} else {
  migrate(db, { migrationsFolder: migrationsDir });
  bootstrapAinativeDatabase(sqlite);
}

sqlite.close();
console.log("Database ready.");

// 4. Port allocation
function findAvailablePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(preferred, () => {
      server.close(() => resolve(preferred));
    });
    server.on("error", () => {
      resolve(findAvailablePort(preferred + 1));
    });
  });
}

async function main() {
  // Re-use the port from argv if one was passed explicitly.
  const actualPort = await resolveSidecarPort({
    argv: process.argv.slice(2),
    requestedPort,
    findAvailablePort,
  });
  let effectiveCwd = appDir;

  // 6. Workspace hoisting workaround for Next.js dependencies
  const localNm = join(appDir, "node_modules");
  if (!existsSync(join(localNm, "next", "package.json"))) {
    let searchDir = dirname(appDir);
    while (searchDir !== dirname(searchDir)) {
      const candidate = join(searchDir, "node_modules", "next", "package.json");
      if (existsSync(candidate)) {
        const hoistedRoot = searchDir;
        syncHoistedWorkspaceInputs({
          appDir,
          hoistedRoot,
          packageVersion: pkg.version,
        });
        effectiveCwd = hoistedRoot;
        break;
      }
      searchDir = dirname(searchDir);
    }
  }

  // 6.5. First run of a released version: fetch the CI-built production
  // `.next` from the GitHub Release so we can `next start` instead of
  // `next dev` (#10 — fixes the HMR-socket (#7) / dev-warning (#8) /
  // dev-origin-gate class). Skipped in the canonical dev repo (isDevMode —
  // there is no release asset for unpublished versions, and extracting into
  // the working tree would clobber local builds). Any failure is loud and
  // falls back to today's dev-mode launch — never a blocked start.
  if (!isDevMode(launchCwd)) {
    try {
      await ensurePrebuilt({
        version: pkg.version,
        effectiveCwd,
        buildsDir: join(DATA_DIR, "builds"),
        artifactUrlOverride: process.env.RELAY_BUILD_ARTIFACT_URL,
        log: (message) => console.log(message),
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.warn(
        `⚠ Could not set up the production build (${reason}).\n` +
          `Falling back to development mode for this run — Relay still works, ` +
          `but slower and with dev-mode console noise. Check your network (the ` +
          `build downloads once per version from GitHub Releases) and re-run, ` +
          `or set RELAY_BUILD_ARTIFACT_URL to a mirror.`,
      );
    }
  }

  // 7. Spawn Next.js server (production if pre-built, dev otherwise)
  const nextEntrypoint = resolveNextEntrypoint(effectiveCwd);
  const isPrebuilt = isPrebuiltCurrent(effectiveCwd, pkg.version);
  const bindHost = (opts.hostname as string) || "127.0.0.1";
  const exposureProfile = (process.env.RELAY_EXPOSURE_PROFILE ||
    "trusted-local") as RelayLaunchContext["exposureProfile"];
  if (isNonLoopbackHost(bindHost) && exposureProfile === "trusted-local") {
    program.error(
      "Non-loopback binding is refused in trusted-local mode. Select private-authenticated or remote-authenticated and provide --public-origin.",
    );
  }
  const { getIngressConfig } = await import("../src/lib/host-ingress/config");
  getIngressConfig();
  if (exposureProfile === "remote-authenticated" && !process.env.RELAY_INGRESS_TOKEN) {
    program.error("Remote-authenticated exposure requires RELAY_INGRESS_TOKEN for the configured TLS ingress.");
  }
  if (exposureProfile === "remote-authenticated" && isNonLoopbackHost(bindHost)) {
    program.error("Remote-authenticated v1 must bind loopback so the configured TLS ingress is the only external path.");
  }
  const { randomSecret } = await import("../src/lib/host-ingress/credentials");
  const internalAuthToken = randomSecret();
  const nextArgs = buildNextLaunchArgs({
    isPrebuilt,
    port: actualPort,
    host: bindHost,
  });
  const sidecarUrl = buildSidecarUrl(actualPort, bindHost);
  const launchContext = serializeRelayLaunchContext({
    schemaVersion: 1,
    packageVersion: pkg.version,
    dataDir: DATA_DIR,
    hostRoot: process.env.RELAY_HOST_ROOT || null,
    npmCache: process.env.NPM_CONFIG_CACHE || null,
    port: actualPort,
    hostname: bindHost,
    exposureProfile,
    publicOrigin: process.env.RELAY_PUBLIC_ORIGIN || null,
    routePrefix: process.env.RELAY_ROUTE_PREFIX || "/",
    safeMode: opts.safeMode === true,
    noOpen: opts.open === false,
  });

  // D3 — the banner reads the license store: a paying customer is never
  // greeted as "Community Edition" again. Fail-OPEN: any store fault at all
  // (missing dir, corrupt file, import error) falls back to the Community
  // line — a broken license store must never block or noisy-up a launch.
  let licensedTo: string | null = null;
  try {
    const { getLicensedIdentity } = await import("../src/lib/licensing/store");
    licensedTo = getLicensedIdentity();
  } catch {
    licensedTo = null;
  }
  console.log(
    `Orionfold Relay ${pkg.version} — ${licensedTo ? `Licensed to ${licensedTo}` : "Community Edition"}`,
  );
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Mode: ${isPrebuilt ? "production" : "development"}`);
  console.log(`Exposure: ${exposureProfile}`);
  console.log(`Next entry: ${nextEntrypoint}`);
  console.log(`Starting Relay on ${sidecarUrl}`);
  console.log(`Learn more → https://orionfold.com`);

  const child = spawn(process.execPath, [nextEntrypoint, ...nextArgs], {
    cwd: effectiveCwd,
    stdio: "inherit",
    env: {
      ...process.env,
      RELAY_DATA_DIR: DATA_DIR,
      RELAY_LAUNCH_CWD: launchCwd,
      RELAY_LAUNCH_CONTEXT: launchContext,
      PORT: String(actualPort),
      // Origin for Relay's internal loopback self-calls (trigger dispatch,
      // compose table tools). The server always listens on loopback even when
      // bound to a non-loopback host, so self-calls target 127.0.0.1 + the real
      // port — never :3000, never the LAN IP. Fixes issue #29.
      RELAY_SELF_BASE_URL: buildSidecarUrl(actualPort, "127.0.0.1"),
      RELAY_INTERNAL_AUTH_TOKEN: internalAuthToken,
      RELAY_EXPOSURE_PROFILE: exposureProfile,
      RELAY_ROUTE_PREFIX: process.env.RELAY_ROUTE_PREFIX || "/",
      ...(process.env.RELAY_PUBLIC_ORIGIN
        ? { RELAY_PUBLIC_ORIGIN: process.env.RELAY_PUBLIC_ORIGIN }
        : {}),
      ...(opts.safeMode ? { RELAY_SAFE_MODE: "true" } : {}),
      // In dev mode, Next blocks cross-origin /_next/* dev-asset requests from
      // the LAN client's IP, breaking the app over the network (issue #13).
      // When the operator has opted into non-loopback binding, tell next.config
      // to allow any dev origin. Mirrors the same trust decision as the warning
      // above; harmless for the prebuilt `next start` path (no dev-origin gate).
      ...(isNonLoopbackHost(bindHost) ? { RELAY_ALLOW_LAN_ORIGINS: "true" } : {}),
    },
  });

  // 8. Auto-open browser. When bound to a non-loopback host (e.g. 0.0.0.0 =
  // "all interfaces"), that address isn't browsable from a client, so open the
  // loopback equivalent on this machine instead — the server still listens on
  // it because 0.0.0.0 includes loopback.
  if (opts.open !== false) {
    const openUrl = isNonLoopbackHost(bindHost)
      ? buildSidecarUrl(actualPort, "127.0.0.1")
      : sidecarUrl;
    setTimeout(async () => {
      try {
        const open = (await import("open")).default;
        await open(openUrl);
      } catch {
        // Silently fail — user can open manually
      }
    }, 3000);
  }

  // 9. Graceful shutdown
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("exit", (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error("Failed to start Relay:", err);
  process.exit(1);
});
