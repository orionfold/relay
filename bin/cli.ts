import { program } from "commander";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  cpSync,
  unlinkSync,
} from "fs";
import { spawn } from "child_process";
import { createServer } from "net";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  buildNextLaunchArgs,
  buildSidecarUrl,
  resolveNextEntrypoint,
  resolveSidecarPort,
} from "../src/lib/desktop/sidecar-launch";
import { getAinativeDataDir, getAinativeDbPath } from "../src/lib/utils/ainative-paths";
import {
  bootstrapAinativeDatabase,
  hasLegacyTables,
  hasMigrationHistory,
  markAllMigrationsApplied,
} from "../src/lib/db/bootstrap";
import { migrateLegacyData } from "../src/lib/utils/migrate-to-ainative";
import { isDevMode } from "../src/lib/instance/detect";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appDir = join(__dirname, "..");
const launchCwd = process.cwd();

// Auto-write .env.local on first run in a non-dev launch folder. This gives
// new npx users a per-folder isolated DB by default — no red sidebar badge,
// no manual Fix click. Skipped in the main dev repo (isDevMode) and skipped
// when the user has already set AINATIVE_DATA_DIR in their shell.
const _envLocalPath = join(launchCwd, ".env.local");
const _firstRunNeedsEnv =
  !existsSync(_envLocalPath) &&
  !process.env.AINATIVE_DATA_DIR &&
  !isDevMode(launchCwd);

if (_firstRunNeedsEnv) {
  const folderName = basename(launchCwd);
  const autoDataDir = join(homedir(), `.${folderName}`);
  writeFileSync(
    _envLocalPath,
    `# Auto-created by ainative-business on first run.\n` +
      `# Points this folder's install at an isolated data directory.\n` +
      `AINATIVE_DATA_DIR=${autoDataDir}\n`,
    "utf-8",
  );
  console.log(`First run — wrote ${_envLocalPath} (AINATIVE_DATA_DIR=${autoDataDir}).`);
}

// Load .env.local from the launch directory. For a local CLI launcher the
// user's .env.local is the authoritative source of runtime config — it wins
// over shell env so the `Fix` sidebar action actually takes effect on the
// very next `npx ainative-business` invocation, regardless of stale exports
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
  AINATIVE_DATA_DIR Custom data directory for the web app
  ANTHROPIC_API_KEY Claude runtime access
  OPENAI_API_KEY   OpenAI Codex runtime access

Examples:
  node dist/cli.js --port 3210 --no-open
  node dist/cli.js --data-dir ~/.ainative-dogfood --port 3100
  node dist/cli.js plugin dry-run my-plugin    # print confinement policy
`;
}

program
  .name("ainative")
  .description("Companion software for the AI Native Business book — a local-first agent runtime and builder scaffold for AI-native businesses.")
  .version(pkg.version)
  .addHelpText("after", getHelpText)
  .option("-p, --port <number>", "port to start on", "3000")
  .option("--data-dir <path>", "custom data directory (overrides AINATIVE_DATA_DIR)")
  .option("--reset", "delete the local database before starting")
  .option("--no-open", "don't auto-open browser")
  .option("--safe-mode", "disable Kind-1 plugin MCP servers; Kind-5 primitives bundles still load");

/**
 * T14: `ainative plugin dry-run <pluginId>` — print the computed confinement
 * policy (mode, platform support, expanded sandbox-exec/aa-exec/docker args)
 * for a given plugin without actually spawning anything.
 *
 * We detect subcommand invocation BEFORE program.parse() so the subcommand
 * path can short-circuit the default server-launch flow (DB migration,
 * Next.js spawn, etc.). The dry-run command does its own minimal setup.
 */
const firstArg = process.argv[2];
const isPluginSubcommand = firstArg === "plugin";

if (isPluginSubcommand) {
  const action = process.argv[3];
  const pluginId = process.argv[4];
  if (action !== "dry-run") {
    console.error(`Unknown plugin action: ${action ?? "(none)"}`);
    console.error("Available actions: dry-run");
    process.exit(1);
  }
  if (!pluginId) {
    console.error("Usage: ainative plugin dry-run <pluginId>");
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

program.parse();

const opts = program.opts();

// Apply --data-dir before resolving paths
if (opts.dataDir) {
  process.env.AINATIVE_DATA_DIR = opts.dataDir;
}

// Apply --safe-mode: export AINATIVE_SAFE_MODE=true so mcp-loader short-circuits
// Kind-1 plugin MCP servers. Kind-5 primitives bundles are managed separately
// (src/lib/plugins/registry.ts) and are not affected by this flag.
if (opts.safeMode) {
  process.env.AINATIVE_SAFE_MODE = "true";
  console.log("Safe mode: Kind-1 plugin MCP servers disabled for this session.");
}

// Migrate any legacy ~/.stagent/ layout to ~/.ainative/ before resolving any
// data-dir paths below. Must run here at module top-level (not inside main())
// because the following const declarations and mkdirSync/Database calls also
// execute at module-load time. Idempotent — safe on every invocation.
await migrateLegacyData();

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
        for (const name of ["src", "public"]) {
          const dest = join(hoistedRoot, name);
          const src = join(appDir, name);
          if (!existsSync(dest) && existsSync(src)) {
            cpSync(src, dest, { recursive: true });
          }
        }
        for (const name of [
          "next.config.mjs",
          "tsconfig.json",
          "postcss.config.mjs",
          "package.json",
          "components.json",
          "drizzle.config.ts",
        ]) {
          const dest = join(hoistedRoot, name);
          const src = join(appDir, name);
          if (!existsSync(dest) && existsSync(src)) {
            writeFileSync(dest, readFileSync(src));
          }
        }
        effectiveCwd = hoistedRoot;
        break;
      }
      searchDir = dirname(searchDir);
    }
  }

  // 7. Spawn Next.js server (production if pre-built, dev otherwise)
  const nextEntrypoint = resolveNextEntrypoint(effectiveCwd);
  const isPrebuilt = existsSync(join(effectiveCwd, ".next", "BUILD_ID"));
  const nextArgs = buildNextLaunchArgs({
    isPrebuilt,
    port: actualPort,
  });
  const sidecarUrl = buildSidecarUrl(actualPort);

  console.log(`ainative ${pkg.version} — Community Edition`);
  console.log(`Data dir: ${DATA_DIR}`);
  console.log(`Mode: ${isPrebuilt ? "production" : "development"}`);
  console.log(`Next entry: ${nextEntrypoint}`);
  console.log(`Starting ainative on ${sidecarUrl}`);
  console.log(`Learn more → https://ainative.business`);

  const child = spawn(process.execPath, [nextEntrypoint, ...nextArgs], {
    cwd: effectiveCwd,
    stdio: "inherit",
    env: {
      ...process.env,
      AINATIVE_DATA_DIR: DATA_DIR,
      AINATIVE_LAUNCH_CWD: launchCwd,
      PORT: String(actualPort),
      ...(opts.safeMode ? { AINATIVE_SAFE_MODE: "true" } : {}),
    },
  });

  // 8. Auto-open browser
  if (opts.open !== false) {
    setTimeout(async () => {
      try {
        const open = (await import("open")).default;
        await open(sidecarUrl);
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
  console.error("Failed to start ainative:", err);
  process.exit(1);
});
