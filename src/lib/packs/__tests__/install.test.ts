import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

let dataDir: string;
let appsDir: string;
let profilesDir: string;
let blueprintsDir: string;
let packDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-install-"));
  appsDir = path.join(dataDir, "apps");
  profilesDir = path.join(dataDir, "profiles");
  blueprintsDir = path.join(dataDir, "blueprints");
  packDir = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-src-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(packDir, { recursive: true, force: true });
});

async function loadModules() {
  const installer = await import("../install");
  const registry = await import("@/lib/apps/registry");
  const tables = await import("@/lib/data/tables");
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  return { ...installer, registry, tables, db, ...schema };
}

// ── Fixture pack builder ─────────────────────────────────────────────

function buildFixturePack(): void {
  fs.writeFileSync(
    path.join(packDir, "pack.yaml"),
    yaml.dump({
      id: "test-agency",
      version: "0.1.0",
      name: "Test Agency",
      author: "Orionfold",
      description: "Fixture pack for install tests.",
      relayCore: ">=0.15.0",
      customers: ["acme-co", "globex"],
    })
  );

  const baseDir = path.join(packDir, "base");
  fs.mkdirSync(baseDir, { recursive: true });

  fs.writeFileSync(
    path.join(baseDir, "manifest.yaml"),
    yaml.dump({
      id: "test-agency",
      version: "0.1.0",
      name: "Test Agency",
      description: "Fixture pack for install tests.",
      profiles: [
        {
          id: "test-agency--manager",
          source: "$RELAY_DATA_DIR/profiles/test-agency--manager/",
        },
      ],
      blueprints: [
        {
          id: "test-agency--weekly",
          source: "$RELAY_DATA_DIR/blueprints/test-agency--weekly.yaml",
        },
      ],
      tables: [{ id: "clients", columns: ["name", "stage"] }],
      schedules: [],
      view: {
        kit: "workflow-hub",
        bindings: {
          hero: { table: "clients" },
          kpis: [
            {
              id: "client-count",
              label: "Clients",
              source: { kind: "tableCount", table: "clients" },
              format: "int",
            },
          ],
        },
      },
    })
  );

  // Profile artifact (a dir with profile.yaml + SKILL.md, namespaced).
  const profDir = path.join(baseDir, "profiles", "test-agency--manager");
  fs.mkdirSync(profDir, { recursive: true });
  fs.writeFileSync(path.join(profDir, "profile.yaml"), "id: test-agency--manager\n");
  fs.writeFileSync(path.join(profDir, "SKILL.md"), "# Manager\n");

  // Blueprint artifact (a namespaced .yaml file).
  fs.mkdirSync(path.join(baseDir, "blueprints"), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "blueprints", "test-agency--weekly.yaml"),
    "id: test-agency--weekly\n"
  );

  // Customer seed.
  fs.mkdirSync(path.join(baseDir, "seed"), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "seed", "customers.yaml"),
    yaml.dump([
      { slug: "acme-co", name: "Acme Co", industry: "CRE" },
      { slug: "globex", name: "Globex", industry: "Nonprofit" },
    ])
  );

  // Table seed rows for the `clients` logical table.
  fs.mkdirSync(path.join(baseDir, "seed", "tables"), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "seed", "tables", "clients.json"),
    JSON.stringify([
      { name: "Acme Co", stage: "active" },
      { name: "Globex", stage: "prospect" },
    ])
  );
}

function installOpts() {
  return { appsDir, profilesDir, blueprintsDir };
}

describe("installPack", () => {
  it("creates the project, tables, customers, files, and reports counts", async () => {
    buildFixturePack();
    const { installPack, registry, tables, db, customers, projects } =
      await loadModules();

    const report = await installPack(packDir, installOpts());

    // Report shape — zero silent steps.
    expect(report.packId).toBe("test-agency");
    expect(report.projectCreated).toBe(true);
    expect(report.tablesCreated).toBe(1);
    expect(report.customersSeeded).toBe(2);
    expect(report.profilesDropped).toBe(1);
    expect(report.blueprintsDropped).toBe(1);
    expect(report.rowsSeeded).toBe(2);

    // Project row exists.
    const proj = await db
      .select()
      .from(projects)
      .where((await import("drizzle-orm")).eq(projects.id, "test-agency"))
      .get();
    expect(proj?.id).toBe("test-agency");

    // Customers seeded.
    const custRows = await db.select().from(customers);
    expect(custRows.map((c: { slug: string }) => c.slug).sort()).toEqual([
      "acme-co",
      "globex",
    ]);

    // Manifest dropped + the logical table ref rewritten to a real id.
    const app = registry.getApp("test-agency", appsDir);
    expect(app).not.toBeNull();
    expect(app!.manifest.tables).toHaveLength(1);
    const realTableId = app!.manifest.tables[0].id;
    expect(realTableId).not.toBe("clients"); // rewritten to a real UUID

    // View bindings that reference the SAME logical table must be rewritten too —
    // else KPIs/hero resolve against a name that no longer matches the real id
    // and silently read 0. (Surfaced by the relay-agency pack walkthrough.)
    const view = app!.manifest.view as
      | {
          bindings?: {
            hero?: { table?: string };
            kpis?: { source?: { table?: string } }[];
          };
        }
      | undefined;
    expect(view?.bindings?.hero?.table).toBe(realTableId);
    expect(view?.bindings?.kpis?.[0]?.source?.table).toBe(realTableId);

    // The real table exists with seeded rows.
    const tableRows = await tables.listRows(realTableId);
    expect(tableRows).toHaveLength(2);

    // Namespaced artifacts dropped into the shared dirs.
    expect(
      fs.existsSync(path.join(profilesDir, "test-agency--manager", "profile.yaml"))
    ).toBe(true);
    expect(
      fs.existsSync(path.join(blueprintsDir, "test-agency--weekly.yaml"))
    ).toBe(true);
  });

  it("is idempotent on re-install — no duplicate project, customers, or tables", async () => {
    buildFixturePack();
    const { installPack, registry, db, customers, userTables, userTableRows } =
      await loadModules();

    const first = await installPack(packDir, installOpts());
    const second = await installPack(packDir, installOpts());

    expect(first.projectCreated).toBe(true);
    expect(second.projectCreated).toBe(false); // already existed

    const custRows = await db.select().from(customers);
    expect(custRows).toHaveLength(2); // not 4

    // Still exactly one table on the app manifest (not re-created).
    const app = registry.getApp("test-agency", appsDir);
    expect(app!.manifest.tables).toHaveLength(1);

    // DB-level idempotency: exactly ONE user table for this project, with its
    // rows seeded once (not doubled). The manifest being overwritten is not
    // enough — the underlying table must be reused, not re-created.
    const tablesForProject = await db
      .select()
      .from(userTables)
      .where((await import("drizzle-orm")).eq(userTables.projectId, "test-agency"));
    expect(tablesForProject).toHaveLength(1);

    const realTableId = app!.manifest.tables[0].id;
    const rows = await db
      .select()
      .from(userTableRows)
      .where((await import("drizzle-orm")).eq(userTableRows.tableId, realTableId));
    expect(rows).toHaveLength(2); // not 4
  });

  it("throws PackValidationError before any write when relayCore compat is unmet", async () => {
    buildFixturePack();
    // Demand a core version far above the current 0.15.0.
    fs.writeFileSync(
      path.join(packDir, "pack.yaml"),
      yaml.dump({
        id: "test-agency",
        version: "0.1.0",
        name: "Test Agency",
        relayCore: ">=99.0.0",
        customers: [],
      })
    );
    const { installPack, db, projects } = await loadModules();
    const { PackValidationError } = await import("../format");

    await expect(installPack(packDir, installOpts())).rejects.toThrow(
      PackValidationError
    );

    // No partial install — the project was never created.
    const proj = await db
      .select()
      .from(projects)
      .where((await import("drizzle-orm")).eq(projects.id, "test-agency"))
      .get();
    expect(proj).toBeUndefined();
  });

  it("throws PackValidationError when the pack dir is invalid", async () => {
    // Empty packDir — no pack.yaml.
    const { installPack } = await loadModules();
    const { PackValidationError } = await import("../format");
    await expect(installPack(packDir, installOpts())).rejects.toThrow(
      PackValidationError
    );
  });
});
