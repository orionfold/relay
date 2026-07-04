import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

// BUG-6: seedSampleData wipes ALL user tables (clearAllData), including the ones
// a pack materialized at install. reseedInstalledPacks must rebuild + repopulate
// each installed pack's tables from its bundled template so the pack cockpit
// reads non-zero after a seed. These tests exercise that seam against a fixture
// pack in a temp templates dir.

let dataDir: string;
let appsDir: string;
let profilesDir: string;
let blueprintsDir: string;
let templatesDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-reseed-"));
  appsDir = path.join(dataDir, "apps");
  profilesDir = path.join(dataDir, "profiles");
  blueprintsDir = path.join(dataDir, "blueprints");
  templatesDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-reseed-tmpl-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(templatesDir, { recursive: true, force: true });
});

/**
 * Write a bundled-template pack `ledger-pack` with a single seeded `entries`
 * table (2 rows) into templatesDir, so `installPack("ledger-pack", {templatesDir})`
 * resolves it. Mirrors the real templates/<id>/{pack.yaml,base/...} layout.
 */
function buildLedgerTemplate(): void {
  const packRoot = path.join(templatesDir, "ledger-pack");
  const baseDir = path.join(packRoot, "base");
  fs.mkdirSync(baseDir, { recursive: true });

  fs.writeFileSync(
    path.join(packRoot, "pack.yaml"),
    yaml.dump({
      id: "ledger-pack",
      version: "0.1.0",
      name: "Ledger Pack",
      author: "Orionfold",
      description: "Fixture pack with a seeded ledger table.",
      relayCore: ">=0.15.0",
    })
  );

  fs.writeFileSync(
    path.join(baseDir, "manifest.yaml"),
    yaml.dump({
      id: "ledger-pack",
      version: "0.1.0",
      name: "Ledger Pack",
      description: "Fixture pack with a seeded ledger table.",
      tables: [{ id: "entries", columns: ["label", "amount"] }],
    })
  );

  fs.mkdirSync(path.join(baseDir, "seed", "tables"), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "seed", "tables", "entries.json"),
    JSON.stringify([
      { label: "Billing", amount: "1000" },
      { label: "Cost", amount: "-400" },
    ])
  );
}

async function loadModules() {
  const { reseedInstalledPacks } = await import("../installed-packs");
  const { installPack } = await import("@/lib/packs/install");
  const registry = await import("@/lib/apps/registry");
  const tables = await import("@/lib/data/tables");
  return { reseedInstalledPacks, installPack, registry, tables };
}

function installOpts() {
  return { appsDir, profilesDir, blueprintsDir, templatesDir };
}

/** Resolve the real (UUID) id of the pack's `Entries` table from its manifest. */
function realEntriesTableId(registry: {
  getApp: (id: string, appsDir: string) => { manifest: { tables: { id: string }[] } } | null;
}): string {
  const app = registry.getApp("ledger-pack", appsDir);
  if (!app) throw new Error("ledger-pack not installed");
  return app.manifest.tables[0].id;
}

describe("reseedInstalledPacks", () => {
  it("repopulates a pack's wiped tables from the bundled template", async () => {
    buildLedgerTemplate();
    const { reseedInstalledPacks, installPack, registry, tables } =
      await loadModules();

    // 1. Install the pack — table + rows materialize.
    await installPack("ledger-pack", installOpts());
    let tableId = realEntriesTableId(registry);
    expect(await tables.listRows(tableId)).toHaveLength(2);

    // 2. Simulate clearAllData(): drop the pack's table entirely (defs + rows).
    const { db } = await import("@/lib/db");
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    db.delete(schema.userTableRows).where(eq(schema.userTableRows.tableId, tableId)).run();
    db.delete(schema.userTableColumns).where(eq(schema.userTableColumns.tableId, tableId)).run();
    db.delete(schema.userTables).where(eq(schema.userTables.id, tableId)).run();

    // 3. Re-seed installed packs — the table + rows must come back.
    const results = await reseedInstalledPacks(installOpts());
    const ledger = results.find((r) => r.packId === "ledger-pack");
    expect(ledger).toBeDefined();
    expect(ledger?.error).toBeUndefined();
    expect(ledger?.tablesCreated).toBe(1);
    expect(ledger?.rowsSeeded).toBe(2);

    // The table exists again with its seeded rows (fresh UUID after rebuild).
    const rebuiltId = realEntriesTableId(registry);
    expect(await tables.listRows(rebuiltId)).toHaveLength(2);
  });

  it("is idempotent — a re-seed with the table intact adds no duplicate rows", async () => {
    buildLedgerTemplate();
    const { reseedInstalledPacks, installPack, registry, tables } =
      await loadModules();

    await installPack("ledger-pack", installOpts());

    // Re-seed without wiping — install reuses the table by name and dedupes rows.
    const results = await reseedInstalledPacks(installOpts());
    const ledger = results.find((r) => r.packId === "ledger-pack");
    expect(ledger?.tablesCreated).toBe(0); // reused, not re-created
    expect(ledger?.rowsSeeded).toBe(0); // dedup — no new rows

    const tableId = realEntriesTableId(registry);
    expect(await tables.listRows(tableId)).toHaveLength(2); // still just 2
  });

  it("reports a failing pack without aborting the rest (no silent failure)", async () => {
    buildLedgerTemplate();
    const { reseedInstalledPacks, installPack } = await loadModules();

    await installPack("ledger-pack", installOpts());

    // Fabricate a second installed app whose id has NO bundled template — its
    // re-seed must fail (UnknownPackNameError) and be REPORTED, while the good
    // pack still re-seeds.
    const orphanDir = path.join(appsDir, "orphan-app");
    fs.mkdirSync(orphanDir, { recursive: true });
    fs.writeFileSync(
      path.join(orphanDir, "manifest.yaml"),
      yaml.dump({ id: "orphan-app", name: "Orphan", description: "no template", tables: [] })
    );

    const results = await reseedInstalledPacks(installOpts());
    const orphan = results.find((r) => r.packId === "orphan-app");
    const ledger = results.find((r) => r.packId === "ledger-pack");

    expect(orphan?.error).toBeTruthy(); // failure surfaced, not swallowed
    expect(orphan?.rowsSeeded).toBe(0);
    expect(ledger?.error).toBeUndefined(); // the good pack still seeded
  });
});
