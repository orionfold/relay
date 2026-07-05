import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import realLicense from "@/lib/licensing/__tests__/fixtures/of-relay-verify-20260701.license.json";

/**
 * Acceptance tests for THE PAID UPDATE PATH — Agency Pro earlier → current
 * (feat-pack-update-workflow). These prove the D4 arc end-to-end with the
 * REAL bundled template and the REAL prod-signed license fixture. Post the
 * persona/industry split (0.5.0) the update delta is exercised on the
 * row-triggered intake pipeline (a primitive the neutral pack still owns);
 * pre-split this used the nonprofit grant chapter, now in relay-nonprofit:
 *
 *   - an entitled earlier install updates store-consult (no flag) and re-adds
 *     the triggered intake chapter, with the intake row-trigger LIVE after
 *     the update (trigger-rewrite machinery re-proven on the update path);
 *   - without a license the update refuses renewal-voiced and the installed
 *     earlier version keeps working, byte-identical (the never-re-lock promise).
 *
 * The engine's executeWorkflow is mocked no-op: dispatch-through-instantiation
 * is in scope; agent execution is not.
 */

vi.mock("@/lib/workflows/engine", async () => {
  const actual = await vi.importActual<typeof import("@/lib/workflows/engine")>(
    "@/lib/workflows/engine"
  );
  return {
    ...actual,
    executeWorkflow: vi.fn().mockResolvedValue(undefined),
  };
});

let dataDir: string;
let appsDir: string;
let profilesDir: string;
let blueprintsDir: string;
let v1Dir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agency-pro-update-"));
  // The DEFAULT layout under RELAY_DATA_DIR — the manifest-trigger dispatcher
  // reads apps from getAinativeAppsDir(), so the install must land there.
  appsDir = path.join(dataDir, "apps");
  profilesDir = path.join(dataDir, "profiles");
  blueprintsDir = path.join(dataDir, "blueprints");
  v1Dir = fs.mkdtempSync(path.join(os.tmpdir(), "agency-pro-v1-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(v1Dir, { recursive: true, force: true });
});

function installOpts() {
  return { appsDir, profilesDir, blueprintsDir };
}

/**
 * Reconstruct an earlier Agency Pro from the current bundled template by
 * removing one triggered chapter (the row-triggered intake pipeline + its
 * intake table). Updating back to the current template re-adds them, so the
 * update path's "adds a triggered blueprint, the trigger fires after update"
 * mechanics stay covered on a primitive the post-split neutral pack still owns.
 * (Pre-split this test used the nonprofit grant chapter, which now lives in the
 * relay-nonprofit industry pack.)
 */
async function stageV1Template(): Promise<string> {
  const { listPackTemplates } = await import("../catalog");
  const tpl = listPackTemplates().find((t) => t.id === "relay-agency-pro")!;
  fs.cpSync(tpl.dir, v1Dir, { recursive: true });

  const packYamlPath = path.join(v1Dir, "pack.yaml");
  const packMeta = yaml.load(fs.readFileSync(packYamlPath, "utf-8")) as Record<
    string,
    unknown
  >;
  packMeta.version = "0.1.0";
  fs.writeFileSync(packYamlPath, yaml.dump(packMeta));

  const manifestPath = path.join(v1Dir, "base", "manifest.yaml");
  const manifest = yaml.load(fs.readFileSync(manifestPath, "utf-8")) as {
    version: string;
    profiles: { id: string }[];
    blueprints: { id: string }[];
    tables: { id: string }[];
  };
  manifest.version = "0.1.0";
  manifest.blueprints = manifest.blueprints.filter(
    (b) => b.id !== "relay-agency-pro--intake-pipeline"
  );
  manifest.tables = manifest.tables.filter((t) => t.id !== "intake");
  fs.writeFileSync(manifestPath, yaml.dump(manifest));

  fs.rmSync(
    path.join(
      v1Dir,
      "base",
      "blueprints",
      "relay-agency-pro--intake-pipeline.yaml"
    )
  );
  return v1Dir;
}

async function saveRealLicense() {
  const { saveLicense } = await import("@/lib/licensing/store");
  saveLicense(realLicense);
}

describe("Agency Pro 0.1.0 → current (the paid update path)", () => {
  it("updates store-consult and adds the triggered intake chapter; the intake row-trigger fires after update", async () => {
    await saveRealLicense();
    const staged = await stageV1Template();
    const { installPack } = await import("../install");
    const { updatePack } = await import("../update");
    const { readInstallState } = await import("../install-state");
    const registry = await import("@/lib/apps/registry");

    await installPack(staged, installOpts());
    expect(readInstallState(appsDir, "relay-agency-pro")?.packVersion).toBe(
      "0.1.0"
    );

    // The paid update — store-consult, no flag (the real prod fixture).
    const report = await updatePack("relay-agency-pro", installOpts());
    expect(report.previousVersion).toBe("0.1.0");
    // The update lands the CURRENT template version (0.5.0 = the persona/
    // industry split). The staged v1 had the intake pipeline + intake table
    // removed, so the update re-adds exactly one table (intake); engagements
    // is reused.
    expect(report.newVersion).toBe("0.5.0");
    expect(report.install!.tablesCreated).toBe(1); // intake; engagements reused
    expect(readInstallState(appsDir, "relay-agency-pro")?.packVersion).toBe(
      "0.5.0"
    );

    // The re-added blueprint is on disk.
    expect(
      fs.existsSync(
        path.join(blueprintsDir, "relay-agency-pro--intake-pipeline.yaml")
      )
    ).toBe(true);

    // The intake trigger is rewritten to the REAL table id on the update path.
    const app = registry.getApp("relay-agency-pro", appsDir)!;
    const intakeBp = app.manifest.blueprints.find(
      (bp) => bp.id === "relay-agency-pro--intake-pipeline"
    )!;
    const intakeTableId = intakeBp.trigger!.table;
    expect(intakeTableId).not.toBe("intake");

    // Drop an intake row → the pipeline instantiates (trigger machinery
    // re-proven on content that arrived VIA UPDATE, not install).
    registry.invalidateAppsCache();
    const { addRows } = await import("@/lib/data/tables");
    await addRows(intakeTableId, [
      {
        data: {
          client: "Northwind Studio",
          service: "bookkeeping",
          source: "email",
          status: "new",
          notes: "July receipts attached",
        },
        createdBy: "user" as const,
      },
    ]);

    // The dispatcher is fire-and-forget (addRows does not await it) — poll
    // briefly, same contract as tables-row-insert-dispatch.test.ts.
    const { db } = await import("@/lib/db");
    const { workflows } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    let spawned: { definition: string }[] = [];
    const start = Date.now();
    while (Date.now() - start < 2000) {
      spawned = await db
        .select()
        .from(workflows)
        .where(eq(workflows.projectId, "relay-agency-pro"));
      if (spawned.length > 0) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(spawned.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(spawned.map((w) => w.definition))).toContain(
      "intake-pipeline"
    );
  });

  it("D4: without a license the update refuses renewal-voiced and 0.1.0 keeps working, byte-identical", async () => {
    await saveRealLicense();
    const staged = await stageV1Template();
    const { installPack } = await import("../install");
    const { updatePack } = await import("../update");
    const { readInstallState } = await import("../install-state");
    const { PackLicenseError } = await import("@/lib/licensing/gate");

    await installPack(staged, installOpts());

    // The license goes away (expiry/removal) — the renewal moment.
    fs.rmSync(path.join(dataDir, "licenses"), { recursive: true, force: true });

    const snapshot = new Map<string, Buffer>();
    for (const dir of [profilesDir, blueprintsDir]) {
      for (const entry of fs.readdirSync(dir, {
        withFileTypes: true,
        recursive: true,
      })) {
        if (!entry.isFile()) continue;
        const full = path.join(entry.parentPath, entry.name);
        snapshot.set(full, fs.readFileSync(full));
      }
    }

    let thrown: unknown;
    try {
      await updatePack("relay-agency-pro", installOpts());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PackLicenseError);
    const message = (thrown as Error).message;
    expect(message).toMatch(/keeps working/i);
    expect(message).toContain("https://orionfold.com/relay/");

    // Byte-identical artifacts, sidecar still 0.1.0, no re-added chapter, no backups.
    for (const [file, bytes] of snapshot) {
      expect(fs.readFileSync(file).equals(bytes), file).toBe(true);
    }
    expect(readInstallState(appsDir, "relay-agency-pro")?.packVersion).toBe(
      "0.1.0"
    );
    expect(
      fs.existsSync(
        path.join(blueprintsDir, "relay-agency-pro--intake-pipeline.yaml")
      )
    ).toBe(false);
    expect(
      fs.existsSync(path.join(appsDir, "relay-agency-pro", "backup"))
    ).toBe(false);

    // "Keeps working" is concrete: the installed 0.1.0 blueprints are still
    // registry-visible and dispatchable after the refusal.
    const bpRegistry = await import("@/lib/workflows/blueprints/registry");
    bpRegistry.reloadBlueprints();
    expect(
      bpRegistry.getBlueprint("relay-agency-pro--month-end-close")
    ).toBeDefined();
  });
});
