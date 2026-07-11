import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
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

function buildFixturePack(
  manifestPatch: Record<string, unknown> = {}
): void {
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
      ...manifestPatch,
    })
  );

  // Profile artifact (a dir with profile.yaml + SKILL.md, namespaced).
  const profDir = path.join(baseDir, "profiles", "test-agency--manager");
  fs.mkdirSync(profDir, { recursive: true });
  fs.writeFileSync(path.join(profDir, "profile.yaml"), "id: test-agency--manager\n");
  fs.writeFileSync(path.join(profDir, "SKILL.md"), "# Manager\n");

  // Blueprint artifact (a namespaced .yaml file, valid per BlueprintSchema
  // so the blueprint registry actually loads it after install).
  fs.mkdirSync(path.join(baseDir, "blueprints"), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "blueprints", "test-agency--weekly.yaml"),
    yaml.dump({
      id: "test-agency--weekly",
      name: "Weekly Review",
      description: "Fixture blueprint.",
      version: "1.0.0",
      domain: "work",
      tags: ["fixture"],
      pattern: "sequence",
      variables: [],
      steps: [
        {
          name: "Review",
          profileId: "test-agency--manager",
          requiresApproval: false,
          promptTemplate: "Review the week.",
        },
      ],
    })
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
  it("classifies an unsigned direct Git source as community/unverified", async () => {
    buildFixturePack();
    execFileSync("git", ["init"], { cwd: packDir, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "relay-test@example.invalid"], {
      cwd: packDir,
    });
    execFileSync("git", ["config", "user.name", "Relay Test"], { cwd: packDir });
    execFileSync("git", ["add", "."], { cwd: packDir });
    execFileSync("git", ["commit", "-m", "fixture"], { cwd: packDir, stdio: "ignore" });
    const bareRepo = path.join(dataDir, "community-pack.git");
    execFileSync("git", ["clone", "--bare", packDir, bareRepo], { stdio: "ignore" });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { installPack } = await loadModules();

    const report = await installPack(bareRepo, installOpts());

    expect(report.tier).toBe("community");
    expect(report.tierVerified).toBe(false);
    expect(warning).toHaveBeenCalledWith(expect.stringMatching(/direct git sources/i));
  });

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

    // R3 — a local/bundled pack (no remote index entry) is implicitly official,
    // no fetch-side verify. The report carries the tier for the CLI badge.
    expect(report.tier).toBe("official");
    expect(report.tierVerified).toBe(true);
    expect(report.tierLabel).toBe("Orionfold");

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

  it("rewrites blueprints[].trigger.table to the real table id so row-insert triggers fire", async () => {
    // A pack-authored trigger references the LOGICAL table id. Dispatch
    // (manifest-trigger-dispatch) matches trigger.table against the REAL
    // UUID, so an unrewritten ref silently never fires.
    buildFixturePack({
      blueprints: [
        {
          id: "test-agency--weekly",
          source: "$RELAY_DATA_DIR/blueprints/test-agency--weekly.yaml",
          trigger: { kind: "row-insert", table: "clients" },
        },
      ],
    });
    const { installPack, registry } = await loadModules();

    await installPack(packDir, installOpts());

    const app = registry.getApp("test-agency", appsDir);
    const realTableId = app!.manifest.tables[0].id;
    expect(realTableId).not.toBe("clients");
    expect(app!.manifest.blueprints[0].trigger?.table).toBe(realTableId);
  });

  it("registers manifest schedules as real schedule rows and rewrites schedule refs", async () => {
    // A manifest schedule (id/cron/runs) must become a real row in the
    // schedules DB table — scheduleNextFire KPIs resolve against that table,
    // and the scheduler engine only fires rows it can see. The manifest's
    // schedule ids (and view bindings referencing them) are rewritten to the
    // composite DB id, mirroring the logical→real table-ref discipline.
    buildFixturePack({
      schedules: [
        {
          id: "month-end",
          cron: "0 6 1 * *",
          runs: "test-agency--weekly",
        },
      ],
      view: {
        kit: "ledger",
        bindings: {
          hero: { table: "clients" },
          kpis: [
            {
              id: "next-close",
              label: "Next close",
              source: { kind: "scheduleNextFire", schedule: "month-end" },
              format: "relative",
            },
          ],
        },
      },
    });
    const { installPack, registry, db, schedules } = await loadModules();

    const report = await installPack(packDir, installOpts());
    expect(report.schedulesRegistered).toBe(1);

    // Real schedule row, active, with a computed nextFireAt and owned by the
    // pack's project.
    const row = await db
      .select()
      .from(schedules)
      .where(
        (await import("drizzle-orm")).eq(schedules.id, "app:test-agency:month-end")
      )
      .get();
    expect(row).toBeDefined();
    expect(row!.status).toBe("active");
    expect(row!.cronExpression).toBe("0 6 1 * *");
    expect(row!.nextFireAt).not.toBeNull();
    expect(row!.projectId).toBe("test-agency");

    // Manifest schedule id + the view's scheduleNextFire binding rewritten to
    // the composite DB id so the KPI resolves (not silently null).
    const app = registry.getApp("test-agency", appsDir);
    expect(app!.manifest.schedules[0].id).toBe("app:test-agency:month-end");
    const view = app!.manifest.view as {
      bindings?: { kpis?: { source?: { schedule?: string } }[] };
    };
    expect(view.bindings?.kpis?.[0]?.source?.schedule).toBe(
      "app:test-agency:month-end"
    );
  });

  it("makes newly dropped blueprints visible to an already-warm blueprint registry", async () => {
    // The blueprint registry caches its scan per process. A pack installed
    // through the running server (install API / chat tool) must be runnable
    // immediately — its triggers dispatch by getBlueprint() — not after a
    // restart. Surfaced by the 2026-07-01 engine smoke.
    buildFixturePack();
    const { installPack } = await loadModules();
    const bpRegistry = await import("@/lib/workflows/blueprints/registry");

    bpRegistry.listBlueprints(); // warm the cache BEFORE install
    expect(bpRegistry.getBlueprint("test-agency--weekly")).toBeUndefined();

    await installPack(packDir, installOpts());

    expect(bpRegistry.getBlueprint("test-agency--weekly")).toBeDefined();
  });

  it("preserves scheduler runtime state on re-install (upsert discipline)", async () => {
    const schedulePatch = {
      schedules: [
        { id: "month-end", cron: "0 6 1 * *", runs: "test-agency--weekly" },
      ],
    };
    buildFixturePack(schedulePatch);
    const { installPack, db, schedules } = await loadModules();
    const { eq } = await import("drizzle-orm");

    await installPack(packDir, installOpts());

    // Simulate scheduler runtime state + a user pause.
    const compositeId = "app:test-agency:month-end";
    db.update(schedules)
      .set({ firingCount: 5, status: "paused" })
      .where(eq(schedules.id, compositeId))
      .run();

    // Re-install with a changed cron — config updates, state survives.
    buildFixturePack({
      schedules: [
        { id: "month-end", cron: "0 7 1 * *", runs: "test-agency--weekly" },
      ],
    });
    await installPack(packDir, installOpts());

    const row = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, compositeId))
      .get();
    expect(row!.cronExpression).toBe("0 7 1 * *"); // config refreshed
    expect(row!.firingCount).toBe(5); // state preserved
    expect(row!.status).toBe("paused"); // user pause survives re-install
  });

  it("refuses a manifest schedule missing cron/runs or naming an undeclared blueprint, before any write", async () => {
    const { installPack, db, projects } = await loadModules();
    const { PackValidationError } = await import("../format");
    const { eq } = await import("drizzle-orm");

    const cases = [
      { id: "no-cron", runs: "test-agency--weekly" },
      { id: "no-runs", cron: "0 6 1 * *" },
      { id: "bad-runs", cron: "0 6 1 * *", runs: "not-declared" },
    ];
    for (const sched of cases) {
      buildFixturePack({ schedules: [sched] });
      await expect(installPack(packDir, installOpts())).rejects.toThrow(
        PackValidationError
      );
    }

    // No partial install — the project was never created.
    const proj = await db
      .select()
      .from(projects)
      .where(eq(projects.id, "test-agency"))
      .get();
    expect(proj).toBeUndefined();
  });

  it("refuses a scheduled blueprint with required variables that have no defaults", async () => {
    buildFixturePack({
      schedules: [
        { id: "month-end", cron: "0 6 1 * *", runs: "test-agency--weekly" },
      ],
    });
    fs.writeFileSync(
      path.join(packDir, "base", "blueprints", "test-agency--weekly.yaml"),
      yaml.dump({
        id: "test-agency--weekly",
        name: "Weekly Review",
        description: "Fixture blueprint.",
        version: "1.0.0",
        domain: "work",
        tags: ["fixture"],
        pattern: "sequence",
        variables: [
          { id: "client", type: "text", label: "Client", required: true },
        ],
        steps: [
          {
            name: "Review",
            profileId: "test-agency--manager",
            requiresApproval: false,
            promptTemplate: "Review {{client}}.",
          },
        ],
      })
    );
    const { installPack, db, projects } = await loadModules();
    const { PackValidationError } = await import("../format");
    const { eq } = await import("drizzle-orm");

    await expect(installPack(packDir, installOpts())).rejects.toThrow(
      PackValidationError
    );

    const proj = await db
      .select()
      .from(projects)
      .where(eq(projects.id, "test-agency"))
      .get();
    expect(proj).toBeUndefined();
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

  it("refuses a premium pack with no license, before any write", async () => {
    buildFixturePack();
    // Mark the fixture pack premium.
    fs.writeFileSync(
      path.join(packDir, "pack.yaml"),
      yaml.dump({
        id: "test-agency",
        version: "0.1.0",
        name: "Test Agency",
        relayCore: ">=0.15.0",
        entitlement: "product:orionfold-relay",
        customers: ["acme-co", "globex"],
      })
    );
    const { installPack, db, projects } = await loadModules();
    const { PackLicenseError } = await import("@/lib/licensing/gate");

    await expect(installPack(packDir, installOpts())).rejects.toThrow(
      PackLicenseError
    );

    // No partial install — the project was never created.
    const proj = await db
      .select()
      .from(projects)
      .where((await import("drizzle-orm")).eq(projects.id, "test-agency"))
      .get();
    expect(proj).toBeUndefined();
  });

  it("refuses a premium pack when the license lacks the entitlement", async () => {
    buildFixturePack();
    fs.writeFileSync(
      path.join(packDir, "pack.yaml"),
      yaml.dump({
        id: "test-agency",
        version: "0.1.0",
        name: "Test Agency",
        relayCore: ">=0.15.0",
        entitlement: "product:orionfold-relay",
        customers: ["acme-co", "globex"],
      })
    );
    // A structurally-valid but untrusted/forged license file.
    const licPath = path.join(packDir, "fake.license.json");
    fs.writeFileSync(
      licPath,
      JSON.stringify({
        payload: {
          issued_at: "2026-06-14T00:00:00Z",
          expires_at: "2027-06-14T00:00:00Z",
          entitlements: ["product:orionfold-relay"],
        },
        signature: {
          alg: "ed25519",
          key_id: "of-license-prod-2026",
          value: "AA==",
        },
      })
    );
    const { installPack } = await loadModules();
    const { PackLicenseError } = await import("@/lib/licensing/gate");

    await expect(
      installPack(packDir, { ...installOpts(), licenseUrl: licPath })
    ).rejects.toThrow(PackLicenseError);
  });

  it("installs a premium pack with NO --license-url when the store holds an entitled license", async () => {
    buildFixturePack();
    fs.writeFileSync(
      path.join(packDir, "pack.yaml"),
      yaml.dump({
        id: "test-agency",
        version: "0.1.0",
        name: "Test Agency",
        relayCore: ">=0.15.0",
        entitlement: "product:orionfold-relay",
        customers: ["acme-co", "globex"],
      })
    );
    // Redeem a license first (relay license add) — the install must consult
    // the store instead of demanding --license-url again (D1/D2).
    const { signEnvelope } = await import(
      "@/lib/licensing/__tests__/sign-helper"
    );
    const { saveLicense } = await import("@/lib/licensing/store");
    saveLicense(
      signEnvelope({
        schema: "orionfold.license/v1",
        license_id: "OF-RELAY-TEST-STORE",
        issued_to: { email: "naya@example.com" },
        issued_at: "2026-07-01T00:00:00Z",
        expires_at: "2099-01-01T00:00:00Z",
        entitlements: ["product:orionfold-relay"],
      })
    );

    const { installPack } = await loadModules();
    const report = await installPack(packDir, installOpts());
    expect(report.packId).toBe("test-agency");

    // The dropped manifest records the entitlement (pack list premium mark).
    const written = yaml.load(
      fs.readFileSync(
        path.join(appsDir, "test-agency", "manifest.yaml"),
        "utf-8"
      )
    ) as Record<string, unknown>;
    expect(written.entitlement).toBe("product:orionfold-relay");
  });

  it("persists the --license-url license to the store on a successful premium install", async () => {
    buildFixturePack();
    fs.writeFileSync(
      path.join(packDir, "pack.yaml"),
      yaml.dump({
        id: "test-agency",
        version: "0.1.0",
        name: "Test Agency",
        relayCore: ">=0.15.0",
        entitlement: "product:orionfold-relay",
        customers: ["acme-co", "globex"],
      })
    );
    const { signEnvelope } = await import(
      "@/lib/licensing/__tests__/sign-helper"
    );
    const licPath = path.join(packDir, "real.license.json");
    fs.writeFileSync(
      licPath,
      JSON.stringify(
        signEnvelope({
          schema: "orionfold.license/v1",
          license_id: "OF-RELAY-TEST-FLAG",
          issued_to: { email: "naya@example.com" },
          issued_at: "2026-07-01T00:00:00Z",
          expires_at: "2099-01-01T00:00:00Z",
          entitlements: ["product:orionfold-relay"],
        })
      )
    );

    const { installPack } = await loadModules();
    await installPack(packDir, { ...installOpts(), licenseUrl: licPath });

    // D1 — redemption persisted; the next premium install needs no flag.
    expect(
      fs.existsSync(
        path.join(dataDir, "licenses", "OF-RELAY-TEST-FLAG.license.json")
      )
    ).toBe(true);
  });
});

describe("installPack install-state sidecar", () => {
  it("records version + dropped-file hashes at their DEST paths after install", async () => {
    buildFixturePack();
    const { installPack } = await loadModules();
    const { createHash } = await import("node:crypto");

    await installPack(packDir, installOpts());

    const sidecarPath = path.join(appsDir, "test-agency", "install-state.json");
    expect(fs.existsSync(sidecarPath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(sidecarPath, "utf-8")) as {
      packVersion: string;
      installedAt: string;
      files: Record<string, string>;
    };

    expect(state.packVersion).toBe("0.1.0");
    expect(Date.parse(state.installedAt)).not.toBeNaN();

    // Every dropped artifact is hashed; the machine-written manifest.yaml and
    // consumed seed/** files are NOT (the manifest is regenerated per install).
    expect(Object.keys(state.files).sort()).toEqual([
      "blueprints/test-agency--weekly.yaml",
      "profiles/test-agency--manager/SKILL.md",
      "profiles/test-agency--manager/profile.yaml",
    ]);

    // Hashes are of the DESTINATION bytes (what the user could later edit).
    const destBlueprint = path.join(blueprintsDir, "test-agency--weekly.yaml");
    const expected = createHash("sha256")
      .update(fs.readFileSync(destBlueprint))
      .digest("hex");
    expect(state.files["blueprints/test-agency--weekly.yaml"]).toBe(expected);
  });
});

describe("installPack by bundled name", () => {
  it("installs a bundled template by bare name (no filesystem path)", async () => {
    buildFixturePack();
    // Stage the fixture as a bundled template named after its pack id.
    const templatesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ainative-pack-templates-")
    );
    fs.cpSync(packDir, path.join(templatesDir, "test-agency"), {
      recursive: true,
    });
    try {
      const { installPack } = await loadModules();
      const report = await installPack("test-agency", {
        ...installOpts(),
        templatesDir,
      });
      expect(report.packId).toBe("test-agency");
      expect(
        fs.existsSync(path.join(appsDir, "test-agency", "manifest.yaml"))
      ).toBe(true);
    } finally {
      fs.rmSync(templatesDir, { recursive: true, force: true });
    }
  });

  it("refuses an unknown bare name, naming the available bundled packs", async () => {
    const templatesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ainative-pack-templates-")
    );
    // Point the R2 remote-resolver at an empty local index base so an unknown
    // name deterministically falls through to the helpful UnknownPackNameError
    // (fail-open on an unreachable index) — never a real network call in tests.
    const emptyIndexBase = pathToFileURL(
      fs.mkdtempSync(path.join(os.tmpdir(), "ainative-empty-index-"))
    ).href;
    try {
      const { installPack } = await loadModules();
      await expect(
        installPack("not-a-pack", {
          ...installOpts(),
          templatesDir,
          packIndexBaseUrl: emptyIndexBase,
        })
      ).rejects.toThrow(/Unknown pack "not-a-pack"/);
    } finally {
      fs.rmSync(templatesDir, { recursive: true, force: true });
    }
  });

  // R3 `pack-provenance-tiers` — a pack fetched through the canonical index
  // carries `entry.sig`/`entry.keyId`; the install verifies provenance offline
  // and reports the tier. Stages a signed file:// canonical tree and asserts the
  // signed pack installs as `official` (verified end-to-end through the R2 fetch
  // → R3 verify seam), then that a tampered sig downgrades to community.
  async function stageSignedTree(
    sign: (parts: { meta: unknown; manifest: unknown }) => string
  ) {
    const { parsePack } = await import("../format");
    const tar = await import("tar");
    const { createHash } = await import("node:crypto");
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-signed-tree-"));

    // A minimal valid pack, staged and PARSED so we sign over the exact canonical
    // meta+manifest the verifier recomputes (schema defaults applied).
    const stage = path.join(base, "stage");
    fs.mkdirSync(path.join(stage, "base"), { recursive: true });
    fs.writeFileSync(
      path.join(stage, "pack.yaml"),
      "id: relay-signed-demo\nname: Signed Demo\nversion: 1.0.0\n"
    );
    fs.writeFileSync(
      path.join(stage, "base", "manifest.yaml"),
      "id: relay-signed-demo\nname: Signed Demo\nversion: 1.0.0\ntables: []\nprofiles: []\nblueprints: []\n"
    );
    const parsed = parsePack(stage);
    const sig = sign({ meta: parsed.meta, manifest: parsed.manifest });

    const artifactDir = path.join(base, "packs", "official");
    fs.mkdirSync(artifactDir, { recursive: true });
    const tgzPath = path.join(artifactDir, "relay-signed-demo.tgz");
    await tar.create({ gzip: true, file: tgzPath, cwd: stage }, [
      "pack.yaml",
      "base",
    ]);
    const sha = createHash("sha256")
      .update(fs.readFileSync(tgzPath))
      .digest("hex");
    fs.writeFileSync(`${tgzPath}.sha256`, sha);

    fs.writeFileSync(
      path.join(base, "index.json"),
      JSON.stringify({
        schema: "orionfold.packs/v1",
        packs: [
          {
            id: "relay-signed-demo",
            tier: "official",
            version: "1.0.0",
            path: "packs/official/relay-signed-demo",
            sha,
            sig,
            keyId: "of-packs-dev-2026",
          },
        ],
      })
    );
    return {
      baseUrl: pathToFileURL(base).href,
      cleanup: () => fs.rmSync(base, { recursive: true, force: true }),
    };
  }

  it("installs a signed index pack as official, verified end-to-end", async () => {
    const { signPack } = await import("./sign-pack-helper");
    const { baseUrl, cleanup } = await stageSignedTree(({ meta, manifest }) =>
      signPack(meta, manifest)
    );
    try {
      const { installPack } = await loadModules();
      const report = await installPack("relay-signed-demo", {
        ...installOpts(),
        packIndexBaseUrl: baseUrl,
      });
      expect(report.packId).toBe("relay-signed-demo");
      expect(report.tier).toBe("official");
      expect(report.tierVerified).toBe(true);
      expect(report.tierLabel).toBe("Orionfold");
    } finally {
      cleanup();
    }
  });

  it("downgrades a bad-signature index pack to community (warn-and-install)", async () => {
    // Sign correctly, then corrupt the sig bytes so verify fails → downgrade.
    const { signPack } = await import("./sign-pack-helper");
    const { baseUrl, cleanup } = await stageSignedTree(({ meta, manifest }) => {
      const good = Buffer.from(signPack(meta, manifest), "base64");
      good[0] ^= 0xff; // flip a byte
      return good.toString("base64");
    });
    try {
      const { installPack } = await loadModules();
      const report = await installPack("relay-signed-demo", {
        ...installOpts(),
        packIndexBaseUrl: baseUrl,
      });
      // Warn-and-install is the default ceiling — it installs, tier downgraded.
      expect(report.packId).toBe("relay-signed-demo");
      expect(report.tier).toBe("community");
      expect(report.tierVerified).toBe(false);
    } finally {
      cleanup();
    }
  });
});

// ── Bundle-at-install (flatten) — pack-bundle-model ──────────────────────

describe("installPack — bundle flatten", () => {
  // The test-only bundle fixtures (relay-bundle-smoke + its two children) live
  // beside this test; children resolve via the templatesDir override.
  const fixturesDir = path.join(import.meta.dirname, "fixtures");
  const bundleDir = path.join(fixturesDir, "relay-bundle-smoke");

  function bundleOpts() {
    return { ...installOpts(), templatesDir: fixturesDir };
  }

  it("flattens a bundle's children into ONE app under one project", async () => {
    const { installPack, registry, db, projects } = await loadModules();

    const report = await installPack(bundleDir, bundleOpts());

    // The bundle installs as ONE app under the bundle's id.
    expect(report.packId).toBe("relay-bundle-smoke");
    expect(report.projectCreated).toBe(true);
    // Two children → 2 tables (leads + posts), 2 profiles, 2 blueprints.
    expect(report.tablesCreated).toBe(2);
    expect(report.profilesDropped).toBe(2);
    expect(report.blueprintsDropped).toBe(2);
    // Only the CRM child seeds rows (3 leads); Social's posts ships empty.
    expect(report.rowsSeeded).toBe(3);

    // listApps sees a SINGLE app — indistinguishable from a hand-composed one.
    const apps = registry.listApps(appsDir);
    expect(apps.map((a: { id: string }) => a.id)).toEqual([
      "relay-bundle-smoke",
    ]);

    // One project row, not one-per-child.
    const projRows = await db.select().from(projects);
    expect(projRows.map((p: { id: string }) => p.id)).toEqual([
      "relay-bundle-smoke",
    ]);
  });

  it("resolves a CROSS-CHILD binding + KPI post-merge (no silent 0-read)", async () => {
    const { installPack, registry, tables } = await loadModules();

    await installPack(bundleDir, bundleOpts());
    const app = registry.getApp("relay-bundle-smoke", appsDir)!;

    // The `leads` logical id (CRM child) was rewritten to a real UUID.
    const leads = app.manifest.tables.find(
      (t: { id: string }) => t.id !== "posts"
    );
    // Both table ids are UUIDs now; find leads by its seeded row count instead.
    const tablesWithRows = await Promise.all(
      app.manifest.tables.map(async (t: { id: string }) => ({
        id: t.id,
        rows: (await tables.listRows(t.id)).length,
      }))
    );
    const leadsTable = tablesWithRows.find((t) => t.rows === 3)!;
    expect(leadsTable).toBeDefined();

    // CROSS-CHILD TRIGGER: the Social child's blueprint fires on the CRM
    // child's leads table — its trigger.table must be the REAL leads UUID.
    const announce = app.manifest.blueprints.find((b: { id: string }) =>
      b.id.includes("announce")
    ) as { trigger?: { table?: string } };
    expect(announce.trigger?.table).toBe(leadsTable.id);

    // CROSS-CHILD KPI: the Social child's `leads-to-announce` KPI counts the
    // CRM child's leads table. Post-merge it must point at the real UUID (so it
    // reads 3, not silent 0). It sits at index 1 (CRM's lead-count is index 0).
    const view = app.manifest.view as {
      bindings?: { kpis?: { id: string; source?: { table?: string } }[] };
    };
    const crossKpi = view.bindings?.kpis?.find(
      (k) => k.id === "leads-to-announce"
    );
    expect(crossKpi?.source?.table).toBe(leadsTable.id);
    void leads;
  });

  it("refuses to merge children that collide on a logical table id", async () => {
    // A second bundle whose two children both declare a `leads` table.
    const collideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "ainative-bundle-collide-")
    );
    try {
      // Child A + B, each with a `leads` table.
      for (const childId of ["collide-a", "collide-b"]) {
        const base = path.join(collideRoot, childId, "base");
        fs.mkdirSync(base, { recursive: true });
        fs.writeFileSync(
          path.join(collideRoot, childId, "pack.yaml"),
          yaml.dump({ id: childId, version: "0.1.0", name: childId })
        );
        fs.writeFileSync(
          path.join(base, "manifest.yaml"),
          yaml.dump({
            id: childId,
            name: childId,
            tables: [{ id: "leads" }],
          })
        );
      }
      const bundle = path.join(collideRoot, "collide-bundle");
      fs.mkdirSync(bundle, { recursive: true });
      fs.writeFileSync(
        path.join(bundle, "pack.yaml"),
        yaml.dump({
          id: "collide-bundle",
          version: "0.1.0",
          name: "Collide Bundle",
          bundle: ["collide-a", "collide-b"],
        })
      );

      const { installPack, registry, db, projects } = await loadModules();
      await expect(
        installPack(bundle, { ...installOpts(), templatesDir: collideRoot })
      ).rejects.toThrow(/collision.*leads/i);

      // No half-merge: the colliding bundle wrote nothing.
      expect(registry.getApp("collide-bundle", appsDir)).toBeNull();
      const projRows = await db.select().from(projects);
      expect(
        projRows.some((p: { id: string }) => p.id === "collide-bundle")
      ).toBe(false);
    } finally {
      fs.rmSync(collideRoot, { recursive: true, force: true });
    }
  });

  // R2 opens the TOP-LEVEL install to remote resolution but keeps the
  // bundle-child fence (install.ts:143-149) shut: a bundle's flattened children
  // must still be bundled names or local paths — never resolved across the
  // network (a bundle is one atomic app; N remote children would make one
  // install depend on N fetches and could pull unvetted community children into
  // a higher-tier app).
  it("still refuses a git-URL bundle child (the no-marketplace fence stays shut)", async () => {
    const fenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-fence-"));
    try {
      const bundle = path.join(fenceRoot, "fence-bundle");
      fs.mkdirSync(bundle, { recursive: true });
      fs.writeFileSync(
        path.join(bundle, "pack.yaml"),
        yaml.dump({
          id: "fence-bundle",
          version: "0.1.0",
          name: "Fence Bundle",
          bundle: ["https://example.com/child.git"],
        })
      );
      const { installPack } = await loadModules();
      await expect(
        installPack(bundle, { ...installOpts(), templatesDir: fenceRoot })
      ).rejects.toThrow(/no-marketplace fence|git URL child|Bundle children/i);
    } finally {
      fs.rmSync(fenceRoot, { recursive: true, force: true });
    }
  });
});
