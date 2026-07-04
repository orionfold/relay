/**
 * Pack-aware seed step (BUG-6).
 *
 * `clearAllData()` wipes ALL user tables — including the ones a paid pack
 * materialized at install (e.g. Agency Pro's `Engagements` ledger). The generic
 * seed generators only recreate demo tables, so after a seed the just-installed
 * pack's cockpit reads an empty table ("No transactions yet") and every windowed
 * KPI is zero. That is the reported symptom.
 *
 * Fix: after the generic seed, re-apply every installed pack via the SAME
 * idempotent `installPack()` path that install uses. It rebuilds the pack's
 * tables from its bundled manifest and re-seeds them from `seed/tables/*.json`
 * (the ledger sample ships there). Reusing `installPack` — rather than
 * hand-rolling create-table + addRows here — keeps the seed and install paths
 * from ever drifting: whatever a pack ships as seed data, both surfaces produce
 * identically.
 *
 * Best-effort per pack: one pack failing (e.g. an unlicensed premium pack whose
 * license gate refuses) must not abort the whole seed. Failures are reported,
 * never swallowed (engineering principle #1).
 *
 * `installPack` is runtime-registry-adjacent (CLAUDE.md smoke budget), so it is
 * dynamically imported inside the function body, never a top-level static import.
 */

export interface PackReseedResult {
  packId: string;
  tablesCreated: number;
  rowsSeeded: number;
  error?: string;
}

export interface ReseedInstalledPacksOptions {
  /** Override the apps dir scanned for installed packs (defaults to data dir). */
  appsDir?: string;
  /** Override where a bare pack id resolves to its bundled template (tests). */
  templatesDir?: string;
  /** Override the profiles drop dir (threaded to installPack). */
  profilesDir?: string;
  /** Override the blueprints drop dir (threaded to installPack). */
  blueprintsDir?: string;
}

/**
 * Re-apply seed data for every installed pack. Returns one result per pack so
 * the caller can fold the counts into the seed report and surface failures.
 *
 * Options exist mainly for tests (point `templatesDir`/`appsDir` at a fixture)
 * and for non-default-data-dir instances; production passes none and the
 * install machinery falls back to the configured data dir.
 */
export async function reseedInstalledPacks(
  options: ReseedInstalledPacksOptions = {}
): Promise<PackReseedResult[]> {
  const { listApps } = await import("@/lib/apps/registry");
  const { installPack } = await import("@/lib/packs/install");

  const installed = listApps(options.appsDir);
  const results: PackReseedResult[] = [];

  for (const app of installed) {
    try {
      // A bare pack id resolves to its bundled template (which carries the
      // seed/tables/*.json files). installPack is idempotent: it reuses tables
      // by name, dedupes rows by hash, and upserts schedules/profiles — so
      // re-running it against an already-installed pack repopulates the tables
      // clearAllData wiped and no-ops on everything already present.
      const report = await installPack(app.id, {
        appsDir: options.appsDir,
        profilesDir: options.profilesDir,
        blueprintsDir: options.blueprintsDir,
        templatesDir: options.templatesDir,
      });
      results.push({
        packId: app.id,
        tablesCreated: report.tablesCreated,
        rowsSeeded: report.rowsSeeded,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Named, visible failure — a premium pack without a valid license, a
      // core-version mismatch, or a malformed manifest lands here. The seed
      // continues; the reason travels back in the report.
      console.error(
        `[seed] pack re-seed failed for "${app.id}": ${message}`
      );
      results.push({
        packId: app.id,
        tablesCreated: 0,
        rowsSeeded: 0,
        error: message,
      });
    }
  }

  return results;
}
