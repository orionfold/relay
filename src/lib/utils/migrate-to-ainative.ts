import {
  existsSync,
  renameSync,
  cpSync,
  rmSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import Database from "better-sqlite3";

export interface MigrationReport {
  dirMigrated: boolean;
  dbFilesRenamed: number;
  sqlRowsUpdated: number;
  sentinelRenamed: boolean;
  keychainMigrated: boolean;
  /** Count of on-disk profile.yaml files renamed to agent.yaml (Profiles->Agents). */
  agentFilesRenamed: number;
  errors: string[];
}

export interface MigrationOptions {
  home?: string;
  gitDir?: string;
  logger?: (msg: string) => void;
}

/**
 * Home-brand migration owns only Relay's default ~/.relay data surface.
 *
 * A customer who supplies RELAY_DATA_DIR has selected an isolated Cell or
 * private instance. Starting that runtime must never inspect or mutate the
 * operator's default ~/.relay database as a side effect.
 */
export function shouldMigrateLegacyHomeData(options: {
  dataDirOverride?: string;
  home?: string;
} = {}): boolean {
  const home = options.home ?? homedir();
  const override = options.dataDirOverride ?? process.env.RELAY_DATA_DIR;
  if (!override) return true;
  return resolve(override) === resolve(join(home, ".relay"));
}

interface KeychainMigrateModule {
  migrateKeychainService: (
    oldName: string,
    newName: string,
    log: (msg: string) => void,
  ) => Promise<boolean>;
}

function hasSqliteHeader(path: string): boolean {
  const SQLITE_MAGIC = "SQLite format 3\0";
  try {
    const header = readFileSync(path, { encoding: null });
    return header.length >= 16 && header.subarray(0, 16).toString("binary") === SQLITE_MAGIC;
  } catch {
    return false;
  }
}

/**
 * A single directory-rename hop in the brand-migration chain (`from` -> `to`),
 * together with the db-file basename rename that lives inside that dir.
 * `stagent` -> `ainative` -> `relay`.
 */
interface MigrationHop {
  /** Legacy home-relative dir name, e.g. ".stagent". */
  fromDir: string;
  /** Next-brand home-relative dir name, e.g. ".ainative". */
  toDir: string;
  /** Legacy db basename (no suffix), e.g. "stagent.db". */
  fromDb: string;
  /** Next-brand db basename (no suffix), e.g. "ainative.db". */
  toDb: string;
}

// Ordered chain: an install may sit at ANY legacy brand. Running the hops in
// order converges `~/.stagent` (two behind) OR `~/.ainative` (one behind) onto
// the live `~/.relay` / relay.db that @/lib/config/env resolves. The SQL
// mcp__stagent__ -> mcp__ainative__ rewrite happens here (Step 3); the
// subsequent mcp__ainative__ -> mcp__relay__ rewrite runs against the live DB
// in instrumentation-node.ts via migrate-mcp-namespace.ts.
const MIGRATION_CHAIN: MigrationHop[] = [
  { fromDir: ".stagent", toDir: ".ainative", fromDb: "stagent.db", toDb: "ainative.db" },
  { fromDir: ".ainative", toDir: ".relay", fromDb: "ainative.db", toDb: "relay.db" },
];

/**
 * Step 6 helper: rename any `profile.yaml` -> `agent.yaml` in the immediate
 * child dirs of `root` (Profiles -> Agents primitive rename). Idempotent —
 * skips a dir that already has `agent.yaml`. Never throws; a per-dir failure is
 * recorded and the walk continues. Returns the count renamed.
 */
function renameProfileFilesInRoot(
  root: string,
  log: (msg: string) => void,
  errors: string[],
): number {
  if (!existsSync(root)) return 0;
  let renamed = 0;
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (err) {
    errors.push(`agent-file scan failed in ${root}: ${String(err)}`);
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name);
    const legacy = join(dir, "profile.yaml");
    const next = join(dir, "agent.yaml");
    // Only rename when the legacy file is present AND the new name is free —
    // the dual-read already prefers agent.yaml, so a dir with both is left as-is.
    if (existsSync(legacy) && !existsSync(next)) {
      try {
        renameSync(legacy, next);
        renamed++;
      } catch (err) {
        errors.push(`agent-file rename failed in ${dir}: ${String(err)}`);
      }
    }
  }
  if (renamed > 0) log(`renamed ${renamed} profile.yaml -> agent.yaml in ${root}`);
  return renamed;
}

/**
 * Idempotent migration of legacy data dirs onto the live `~/.relay`. Walks the
 * `~/.stagent` -> `~/.ainative` -> `~/.relay` chain so an install at any prior
 * brand converges on the current one. Safe to call on every boot.
 * Never throws — errors are collected in report.errors.
 */
export async function migrateLegacyData(
  options: MigrationOptions = {},
): Promise<MigrationReport> {
  const home = options.home ?? homedir();
  const gitDir = options.gitDir ?? join(process.cwd(), ".git");
  const log = options.logger ?? ((m: string) => console.log(`[migrate] ${m}`));
  const report: MigrationReport = {
    dirMigrated: false,
    dbFilesRenamed: 0,
    sqlRowsUpdated: 0,
    sentinelRenamed: false,
    keychainMigrated: false,
    agentFilesRenamed: 0,
    errors: [],
  };

  // The terminus of the chain — where the live app reads from.
  const finalDir = join(home, MIGRATION_CHAIN[MIGRATION_CHAIN.length - 1].toDir);
  const finalDbName = MIGRATION_CHAIN[MIGRATION_CHAIN.length - 1].toDb;

  // Steps 1+2: walk each hop's dir rename + db-file rename. A `return` here on
  // an unrecoverable dir error aborts the whole chain (matches prior behavior:
  // the data is in an unknown state, so downstream steps must not run).
  for (const hop of MIGRATION_CHAIN) {
    const oldDir = join(home, hop.fromDir);
    const newDir = join(home, hop.toDir);

    // Step 1: rename directory if needed
    if (existsSync(oldDir) && !existsSync(newDir)) {
      try {
        renameSync(oldDir, newDir);
        report.dirMigrated = true;
        log(`renamed ${oldDir} -> ${newDir}`);
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "EXDEV") {
          try {
            cpSync(oldDir, newDir, { recursive: true });
            rmSync(oldDir, { recursive: true, force: true });
            report.dirMigrated = true;
            log(`copied ${oldDir} -> ${newDir} (cross-device fallback)`);
          } catch (copyErr) {
            report.errors.push(`dir copy failed: ${String(copyErr)}`);
            return report;
          }
        } else {
          report.errors.push(`dir rename failed: ${String(err)}`);
          return report;
        }
      }
    }

    // Step 2: rename DB files inside the (now-current) dir. If newDir exists
    // from a partial prior run (e.g., failed cpSync cross-device), iteration
    // here is safe — neither old nor new DB files may exist and the step
    // becomes a no-op.
    if (existsSync(newDir)) {
      for (const suffix of ["", "-shm", "-wal"]) {
        const oldName = join(newDir, `${hop.fromDb}${suffix}`);
        const newName = join(newDir, `${hop.toDb}${suffix}`);
        if (existsSync(oldName) && !existsSync(newName)) {
          try {
            renameSync(oldName, newName);
            report.dbFilesRenamed++;
          } catch (err) {
            report.errors.push(`db file rename failed (${suffix}): ${String(err)}`);
          }
        }
      }
    }
  }

  // Step 3: SQL row migration on the FINAL db. Only open the DB if it begins
  // with the SQLite magic header. Opening a non-SQLite file (e.g., a test
  // fixture placeholder) would succeed initially, then fail on the first
  // prepare(), and the close() in finally would silently delete co-located
  // -shm/-wal. This rewrites the stagent-era mcp prefix / sourceFormat; the
  // ainative->relay mcp rewrite runs later against the live DB.
  const dbPath = join(finalDir, finalDbName);
  if (existsSync(dbPath) && !hasSqliteHeader(dbPath)) {
    log(`skipping SQL migration — ${dbPath} exists but lacks SQLite header`);
  }
  if (existsSync(dbPath) && hasSqliteHeader(dbPath)) {
    try {
      const db = new Database(dbPath);
      try {
        const tableExists = db
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agent_profiles'")
          .get();
        if (tableExists) {
          // Run each statement independently — the agent_profiles table may have
          // been created without one or both columns (test or partial schema).
          // A failure in one update must not prevent the other from running.
          let changes = 0;
          try {
            const r1 = db
              .prepare("UPDATE agent_profiles SET allowed_tools = REPLACE(allowed_tools, 'mcp__stagent__', 'mcp__ainative__') WHERE allowed_tools LIKE '%mcp__stagent__%'")
              .run();
            changes += r1.changes;
          } catch (colErr) {
            // Column may not exist in older schema versions — skip silently.
            log(`allowed_tools update skipped: ${String(colErr)}`);
          }
          try {
            const r2 = db
              .prepare(`UPDATE agent_profiles SET import_meta = REPLACE(import_meta, '"sourceFormat":"stagent"', '"sourceFormat":"ainative"') WHERE import_meta LIKE '%"sourceFormat":"stagent"%'`)
              .run();
            changes += r2.changes;
          } catch (colErr) {
            // Column may not exist in older schema versions — skip silently.
            log(`import_meta update skipped: ${String(colErr)}`);
          }
          report.sqlRowsUpdated = changes;
          if (report.sqlRowsUpdated > 0) {
            log(`rewrote ${report.sqlRowsUpdated} agent_profiles row(s)`);
          }
        }
      } finally {
        db.close();
      }
    } catch (err) {
      report.errors.push(`SQL migration failed: ${String(err)}`);
    }
  }

  // Step 4: sentinel file rename
  if (existsSync(gitDir)) {
    const oldSentinel = join(gitDir, "stagent-dev-mode");
    const newSentinel = join(gitDir, "ainative-dev-mode");
    if (existsSync(oldSentinel) && !existsSync(newSentinel)) {
      try {
        renameSync(oldSentinel, newSentinel);
        report.sentinelRenamed = true;
        log(`renamed sentinel ${oldSentinel} -> ${newSentinel}`);
      } catch (err) {
        report.errors.push(`sentinel rename failed: ${String(err)}`);
      }
    }
  }

  // Step 5: keychain migration — delegated to sibling module via dynamic import.
  // The import may fail in Phase 1 if ./keychain-migrate hasn't landed yet (Task 4).
  // Treat any failure (module-not-found OR runtime error) as non-fatal and record.
  // Use a variable specifier so static bundler analysis does not attempt to resolve
  // the module at compile time (it may not yet exist when this module is compiled).
  if (process.platform === "darwin") {
    try {
      const keychainModule = "./keychain-migrate";
      const mod = (await import(/* @vite-ignore */ keychainModule)) as KeychainMigrateModule;
      report.keychainMigrated = await mod.migrateKeychainService("stagent", "ainative", log);
    } catch (err) {
      report.errors.push(`keychain migration failed: ${String(err)}`);
    }
  }

  // Step 6: Profiles -> Agents on-disk manifest rename. Walk the two profile
  // roots and rename profile.yaml -> agent.yaml. The registry dual-reads both
  // names, so this is a cleanup that converges existing installs; it is safe to
  // run every boot and independent of the brand-dir chain above.
  const profileRoots = [
    join(finalDir, "profiles"),
    join(home, ".claude", "skills"),
  ];
  for (const root of profileRoots) {
    report.agentFilesRenamed += renameProfileFilesInRoot(root, log, report.errors);
  }

  return report;
}
