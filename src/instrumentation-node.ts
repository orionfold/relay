export async function registerNodeInstrumentation() {
  try {
    const { migrateLegacyData } = await import("@/lib/utils/migrate-to-ainative");
    await migrateLegacyData();

    // ainative→relay hop: the runtime now publishes chat/compose tools as
    // mcp__relay__* (engine.ts server key), so previously-saved allow-lists and
    // "Always Allow" records — matched by exact string — must be rewritten too.
    // Runs against the live DB; idempotent, never throws.
    const { migrateMcpNamespace } = await import("@/lib/utils/migrate-mcp-namespace");
    const { sqlite } = await import("@/lib/db");
    const nsReport = migrateMcpNamespace(sqlite);
    if (nsReport.profilesUpdated > 0 || nsReport.permissionsUpdated > 0) {
      console.log(
        `[migrate] mcp namespace ainative→relay: ${nsReport.profilesUpdated} profile(s), ${nsReport.permissionsUpdated} permission set(s)`,
      );
    }
    for (const err of nsReport.errors) {
      console.error(`[migrate] mcp namespace: ${err}`);
    }

    // Instance bootstrap — creates local branch, handles dev-mode gates, consent flow.
    // Runs BEFORE other startup so instance config is available downstream.
    // Safe in the canonical Relay dev repo thanks to RELAY_DEV_MODE=true
    // in .env.local plus the .git/relay-dev-mode sentinel file.
    const { ensureInstance } = await import("@/lib/instance/bootstrap");
    const instanceResult = await ensureInstance();
    if (instanceResult.skipped) {
      console.log(`[instance] bootstrap skipped: ${instanceResult.skipped}`);
    } else {
      for (const step of instanceResult.steps) {
        if (step.status === "failed") {
          console.error(`[instance] ${step.step} failed: ${step.reason}`);
        }
      }
    }

    // Run pending Drizzle migrations (DROP TABLE, CREATE INDEX, etc.)
    // that can't be handled by bootstrap's IF NOT EXISTS pattern.
    // Runs here (not in db/index.ts) to avoid SQLITE_BUSY during next build.
    await runPendingMigrations();

    // Plugin loader (Kind 5 only). Seeds dogfood examples on first boot,
    // scans ~/.ainative/plugins/, registers profiles + blueprints + tables + schedules.
    // Failures are isolated per-plugin; boot continues regardless.
    //
    // ORDERING INVARIANTS (do not move this block without re-checking):
    //   - MUST come AFTER runPendingMigrations() — installPluginTables +
    //     installPluginSchedules write to userTableTemplates / schedules
    //     which the migrations create/upgrade.
    //   - MUST come BEFORE startScheduler() — two-part reason:
    //     (1) Plugin-shipped schedules land in the `schedules` table via
    //         installPluginSchedules; if scheduler starts first, its initial
    //         tick doesn't see those rows and they fire one cadence late.
    //     (2) Scheduled tasks may reference plugin profiles (e.g.,
    //         "finance-pack/personal-cfo"); if scheduler fires before plugins
    //         load, the profile lookup fails and the task crashes with
    //         "profile not found".
    //   - MUST come BEFORE startChannelPoller() — same reason as (2); channel
    //     events can spawn tasks bound to plugin profiles.
    //   - Order vs startUpgradePoller is irrelevant (upgrade poller is async
    //     background, doesn't read profiles synchronously).
    try {
      const { seedExamplePluginsIfEmpty } = await import("@/lib/plugins/seed");
      const { loadPlugins } = await import("@/lib/plugins/registry");
      seedExamplePluginsIfEmpty();
      const plugins = await loadPlugins();
      const loaded = plugins.filter((p) => p.status === "loaded").length;
      const disabled = plugins.length - loaded;
      console.log(`[plugins] ${loaded} loaded, ${disabled} disabled`);
    } catch (err) {
      console.error("[plugins] loader failed:", err);
    }

    // Instance upgrade poller — hourly `git fetch` to detect upstream commits.
    // Skipped in dev mode; lightweight; uses advisory lock to prevent overlap.
    const { startUpgradePoller } = await import("@/lib/instance/upgrade-poller");
    startUpgradePoller();

    const { startScheduler } = await import("@/lib/schedules/scheduler");
    startScheduler();

    const { startChannelPoller } = await import("@/lib/channels/poller");
    startChannelPoller();

    const { startAutoBackup } = await import("@/lib/snapshots/auto-backup");
    startAutoBackup();

    // History retention cleanup — prunes old agent_logs and usage_ledger
    startHistoryCleanup();

  } catch (err) {
    console.error("Instrumentation startup failed:", err);
  }
}

async function startHistoryCleanup() {
  const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000;
  const RETENTION_DAYS = 365;

  async function cleanup() {
    const { db } = await import("@/lib/db");
    const { agentLogs, usageLedger } = await import("@/lib/db/schema");
    const { lt } = await import("drizzle-orm");

    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    db.delete(agentLogs).where(lt(agentLogs.timestamp, cutoff)).run();
    db.delete(usageLedger).where(lt(usageLedger.startedAt, cutoff)).run();
  }

  cleanup().catch(() => {});
  setInterval(() => cleanup().catch(() => {}), CLEANUP_INTERVAL);
}

async function runPendingMigrations() {
  const { join } = await import("path");
  const { existsSync } = await import("fs");
  const { getAppRoot } = await import("@/lib/utils/app-root");

  const appRoot = getAppRoot(import.meta.dirname, 1);
  const migrationsDir = join(appRoot, "src", "lib", "db", "migrations");
  if (!existsSync(migrationsDir)) return; // npx distribution — no migration files

  const { sqlite } = await import("@/lib/db");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const {
    hasLegacyTables,
    hasMigrationHistory,
    markAllMigrationsApplied,
    bootstrapAinativeDatabase,
  } = await import("@/lib/db/bootstrap");

  const needsLegacyRecovery =
    hasLegacyTables(sqlite) && !hasMigrationHistory(sqlite);

  if (needsLegacyRecovery) {
    bootstrapAinativeDatabase(sqlite);
    markAllMigrationsApplied(sqlite, migrationsDir);
    console.log("[db] Recovered legacy database — all migrations stamped.");
  } else {
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: migrationsDir });
  }
}
