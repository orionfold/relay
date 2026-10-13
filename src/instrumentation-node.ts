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

    const { reconcileInterruptedSnapshots } = await import(
      "@/lib/snapshots/snapshot-manager"
    );
    const interruptedSnapshots = await reconcileInterruptedSnapshots();
    if (interruptedSnapshots > 0) {
      console.warn(
        `[snapshots] reconciled ${interruptedSnapshots} interrupted snapshot(s)`,
      );
    }

    // On-demand runs a previous process left behind. Nothing in this process is
    // executing them, so they would otherwise sit `running` forever and hold
    // concurrency slots no run can use. Must come BEFORE anything that can
    // start a run (plugins, scheduler, channel poller) so the cap is counted
    // against reality rather than against ghosts. Scheduled runs are not swept
    // here — they carry a lease and `reapExpiredLeases` owns them.
    try {
      const { sweepOrphanedTaskRuns } = await import("@/lib/agents/task-slots");
      const orphaned = sweepOrphanedTaskRuns();
      if (orphaned.length > 0) {
        console.warn(
          `[task-slots] failed ${orphaned.length} on-demand run(s) orphaned by a previous process: ${orphaned.join(", ")}`,
        );
      }
    } catch (err) {
      console.error("[task-slots] orphan sweep failed:", err);
    }

    // Plugin loader (Kind 5 only). Seeds dogfood examples on first boot,
    // scans ~/.relay/plugins/, registers profiles + blueprints + tables + schedules.
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

    // On-demand runs a previous process accepted and had not started yet: the
    // caller holds a 202 `queued`, the row carries `run_requested_at`, and the
    // promise its dispatcher waited on died with the process. Re-dispatched in
    // submission order, except workflow steps, which are failed because their
    // workflow engine is gone. See @/lib/agents/deferred-run-recovery.
    //
    // ORDERING INVARIANTS (do not move this block without re-checking):
    //   - MUST come AFTER the orphan sweep above, so the slots those ghosts
    //     held are free and the cap is counted against reality.
    //   - MUST come AFTER the plugin loader — a recovered run may be bound to
    //     a plugin profile, and dispatching before the registry is populated
    //     fails it with "profile not found".
    try {
      const { recoverDeferredTaskRuns } = await import(
        "@/lib/agents/deferred-run-recovery"
      );
      const recovery = await recoverDeferredTaskRuns();
      if (recovery.failed.length > 0) {
        console.warn(
          `[task-slots] failed ${recovery.failed.length} deferred workflow step(s) a previous process left waiting: ${recovery.failed.join(", ")}`,
        );
      }
      if (recovery.cleared.length > 0) {
        console.warn(
          `[task-slots] cleared a stale run request on ${recovery.cleared.length} row(s): ${recovery.cleared.join(", ")}`,
        );
      }
      if (recovery.redispatched.length > 0) {
        console.warn(
          `[task-slots] re-dispatched ${recovery.redispatched.length} deferred on-demand run(s), oldest first: ${recovery.redispatched.join(", ")}`,
        );
      }
    } catch (err) {
      console.error("[task-slots] deferred run recovery failed:", err);
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

    // OCI cells need a synchronous drain before Next's own signal listener can
    // exit the process. The ordinary npm/dev path keeps its existing lifecycle.
    if (process.env.RELAY_CELL_MODE === "true") {
      await installCellShutdown();
    }

  } catch (err) {
    console.error("Instrumentation startup failed:", err);
  }
}

let historyCleanupInterval: ReturnType<typeof setInterval> | null = null;

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

  cleanup().catch((err) => {
    console.error("[history-cleanup] initial cleanup failed:", err);
  });
  historyCleanupInterval = setInterval(() => {
    cleanup().catch((err) => {
      console.error("[history-cleanup] cleanup failed:", err);
    });
  }, CLEANUP_INTERVAL);
}

export function stopHistoryCleanup(): void {
  if (historyCleanupInterval !== null) {
    clearInterval(historyCleanupInterval);
    historyCleanupInterval = null;
    console.log("[history-cleanup] stopped");
  }
}

async function installCellShutdown(): Promise<void> {
  const [shutdown, scheduler, channels, upgrades, backups, snapshots, database] =
    await Promise.all([
      import("@/lib/host/cell-shutdown"),
      import("@/lib/schedules/scheduler"),
      import("@/lib/channels/poller"),
      import("@/lib/instance/upgrade-poller"),
      import("@/lib/snapshots/auto-backup"),
      import("@/lib/snapshots/snapshot-manager"),
      import("@/lib/db"),
    ]);

  shutdown.installCellShutdownHandlers({
    stopSteps: [
      { name: "upgrade-poller", stop: upgrades.stopUpgradePoller },
      { name: "scheduler", stop: scheduler.stopScheduler },
      { name: "channel-poller", stop: channels.stopChannelPoller },
      { name: "auto-backup", stop: backups.stopAutoBackup },
      { name: "history-cleanup", stop: stopHistoryCleanup },
    ],
    isSnapshotLocked: snapshots.isSnapshotInProgress,
    activeTaskCount: () => {
      const row = database.sqlite
        .prepare("SELECT COUNT(*) AS count FROM tasks WHERE status = 'running'")
        .get() as { count?: number } | undefined;
      return row?.count ?? 0;
    },
    checkpointWal: () => {
      database.sqlite.pragma("wal_checkpoint(TRUNCATE)");
    },
  });
  console.log("[cell-shutdown] handlers installed");
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
