import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

/**
 * Acceptance tests for the REAL bundled `relay-agency-pro` template — the
 * first premium pack (PLG-2b). These run against the in-tree template dir,
 * not a fixture, so they fail if the shipped content drifts from the
 * contract: premium metadata for the locked card (D6), the license gate
 * (D1/D2), standalone-ness (no free-pack references), hardened profiles
 * (governance-as-content), and the trigger/schedule primitives the engine
 * fixes 0a/0b exist to serve.
 */

let dataDir: string;
let appsDir: string;
let profilesDir: string;
let blueprintsDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agency-pro-test-"));
  appsDir = path.join(dataDir, "apps");
  profilesDir = path.join(dataDir, "profiles");
  blueprintsDir = path.join(dataDir, "blueprints");
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function installOpts() {
  return { appsDir, profilesDir, blueprintsDir };
}

async function saveEntitledLicense() {
  const { signEnvelope } = await import("@/lib/licensing/__tests__/sign-helper");
  const { saveLicense } = await import("@/lib/licensing/store");
  saveLicense(
    signEnvelope({
      schema: "orionfold.license/v1",
      license_id: "OF-RELAY-PRO-TEST",
      issued_to: { email: "naya@example.com" },
      issued_at: "2026-07-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
      entitlements: ["product:orionfold-relay"],
    })
  );
}

describe("relay-agency-pro bundled template", () => {
  it("is listed in the catalog as a valid premium template (locked-card contract)", async () => {
    const { listPackTemplates } = await import("../catalog");
    const tpl = listPackTemplates().find((t) => t.id === "relay-agency-pro");
    expect(tpl).toBeDefined();
    expect(tpl!.error).toBeUndefined();
    expect(tpl!.meta!.entitlement).toBe("product:orionfold-relay");
    expect(tpl!.meta!.price).toBe("$499/year");
    expect(tpl!.meta!.purchaseUrl).toBe("https://orionfold.com/relay/");
    expect(tpl!.meta!.relayCore).toBe(">=0.18.0");
    // The description IS the what-you-get preview on the locked card (D6).
    expect(tpl!.meta!.description!.length).toBeGreaterThan(100);
  });

  it("carries a changelog line for every released version — paid packs must argue renewal with evidence", async () => {
    const semver = (await import("semver")).default;
    const { findPackTemplate } = await import("../catalog");
    const tpl = findPackTemplate("relay-agency-pro");
    const meta = tpl!.meta!;

    // The recap surfaces (license status, 402 refusal, /packs card, renewal
    // email) all read this map; a paid pack without it argues generically.
    expect(meta.changelog).toBeDefined();
    const versions = Object.keys(meta.changelog!);
    expect(versions).toContain("0.1.0");
    expect(versions).toContain(meta.version);
    for (const v of versions) {
      expect(semver.valid(v), `changelog key "${v}" must be semver`).toBeTruthy();
      expect(
        semver.compare(v, meta.version),
        `changelog key "${v}" must not exceed pack version ${meta.version}`
      ).toBeLessThanOrEqual(0);
      expect(meta.changelog![v].length).toBeGreaterThan(20);
    }
  });

  it("refuses install by bare name without a license, before any write", async () => {
    const { installPack } = await import("../install");
    const { PackLicenseError } = await import("@/lib/licensing/gate");
    await expect(
      installPack("relay-agency-pro", installOpts())
    ).rejects.toThrow(PackLicenseError);
    expect(fs.existsSync(path.join(appsDir, "relay-agency-pro"))).toBe(false);
  });

  it("installs store-consult with an entitled license and materializes every primitive", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");

    const report = await installPack("relay-agency-pro", installOpts());

    expect(report.packId).toBe("relay-agency-pro");
    expect(report.profilesDropped).toBeGreaterThanOrEqual(7);
    expect(report.blueprintsDropped).toBeGreaterThanOrEqual(6);
    expect(report.tablesCreated).toBe(3);
    expect(report.schedulesRegistered).toBe(1);
    expect(report.customersSeeded).toBe(0); // Pro operates real clients

    const app = registry.getApp("relay-agency-pro", appsDir)!;

    // Intake trigger rewritten to the real table UUID (engine fix 0a).
    const triggered = app.manifest.blueprints.filter((bp) => bp.trigger);
    expect(triggered.length).toBeGreaterThanOrEqual(1);
    const tableIds = new Set(app.manifest.tables.map((t) => t.id));
    for (const bp of triggered) {
      expect(tableIds.has(bp.trigger!.table)).toBe(true);
      expect(bp.trigger!.table).not.toBe("intake");
    }

    // Month-end schedule registered as a real row (engine fix 0b) and the
    // manifest + scheduleNextFire KPI rewritten to the composite id.
    const compositeId = "app:relay-agency-pro:month-end-close";
    expect(app.manifest.schedules[0].id).toBe(compositeId);
    const { db } = await import("@/lib/db");
    const schema = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const schedRow = db
      .select()
      .from(schema.schedules)
      .where(eq(schema.schedules.id, compositeId))
      .get();
    expect(schedRow).toBeDefined();
    expect(schedRow!.status).toBe("active");
    expect(schedRow!.nextFireAt).not.toBeNull();

    const view = app.manifest.view as {
      kit?: string;
      bindings?: { kpis?: { id: string; source?: Record<string, unknown> }[] };
    };
    expect(view.kit).toBe("ledger");
    const nextClose = view.bindings!.kpis!.find(
      (k) => (k.source as { kind?: string }).kind === "scheduleNextFire"
    );
    expect(nextClose).toBeDefined();
    expect((nextClose!.source as { schedule?: string }).schedule).toBe(
      compositeId
    );
  });

  it("v0.2.0 ships the nonprofit deep chapter — the first paid update (D4 pitch made real)", async () => {
    const { listPackTemplates } = await import("../catalog");
    const tpl = listPackTemplates().find((t) => t.id === "relay-agency-pro")!;
    expect(tpl.meta!.version).toBe("0.2.0");
    // The locked-card description now sells the chapter as INCLUDED, not
    // promised ("arrives in v0.2.0" was the 0.1.0 copy).
    expect(tpl.meta!.description).toMatch(/nonprofit/i);
    expect(tpl.meta!.description).not.toMatch(/arrives in v0\.2\.0/i);

    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");
    await installPack("relay-agency-pro", installOpts());

    // The chapter's three primitives land: deep profile, row-triggered deep
    // blueprint bound to the grants table (rewritten to the real UUID), and
    // the grants table itself.
    expect(
      fs.existsSync(
        path.join(
          profilesDir,
          "relay-agency-pro--nonprofit-grants-analyst",
          "SKILL.md"
        )
      )
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(blueprintsDir, "relay-agency-pro--grant-pipeline-deep.yaml")
      )
    ).toBe(true);

    const app = registry.getApp("relay-agency-pro", appsDir)!;
    const grantBp = app.manifest.blueprints.find(
      (bp) => bp.id === "relay-agency-pro--grant-pipeline-deep"
    );
    expect(grantBp?.trigger?.kind).toBe("row-insert");
    const tableIds = new Set(app.manifest.tables.map((t) => t.id));
    expect(tableIds.has(grantBp!.trigger!.table)).toBe(true);
    expect(grantBp!.trigger!.table).not.toBe("grants"); // rewritten to real id
  });

  it("ships hardened profiles — governance as content, verifiable on disk", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    await installPack("relay-agency-pro", installOpts());

    const { ProfileConfigSchema } = await import("@/lib/validators/profile");
    const profileDirs = fs
      .readdirSync(profilesDir)
      .filter((d) => d.startsWith("relay-agency-pro--"));
    expect(profileDirs.length).toBeGreaterThanOrEqual(6);

    for (const dir of profileDirs) {
      const raw = yaml.load(
        fs.readFileSync(path.join(profilesDir, dir, "profile.yaml"), "utf-8")
      );
      const parsed = ProfileConfigSchema.safeParse(raw);
      expect(
        parsed.success,
        `${dir}/profile.yaml: ${parsed.success ? "" : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
      ).toBe(true);
      const profile = raw as {
        allowedTools?: string[];
        canUseToolPolicy?: { autoDeny?: string[] };
        maxTurns?: number;
      };
      // Every Pro profile is client-safe by contract: explicit allowlist,
      // Bash auto-denied, bounded turns.
      expect(profile.allowedTools?.length).toBeGreaterThan(0);
      expect(profile.canUseToolPolicy?.autoDeny).toContain("Bash");
      expect(profile.maxTurns).toBeGreaterThan(0);
      // Deep methodology ships as maintained IP.
      expect(
        fs.statSync(path.join(profilesDir, dir, "SKILL.md")).size
      ).toBeGreaterThan(500);
    }
  });

  it("is standalone — every step profileId is a Pro profile the pack ships", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    await installPack("relay-agency-pro", installOpts());

    const shippedProfiles = new Set(
      fs
        .readdirSync(profilesDir)
        .filter((d) => d.startsWith("relay-agency-pro--"))
    );
    const blueprintFiles = fs
      .readdirSync(blueprintsDir)
      .filter((f) => f.startsWith("relay-agency-pro--") && f.endsWith(".yaml"));
    expect(blueprintFiles.length).toBeGreaterThanOrEqual(5);

    for (const file of blueprintFiles) {
      const bp = yaml.load(
        fs.readFileSync(path.join(blueprintsDir, file), "utf-8")
      ) as { steps?: { profileId?: string }[] };
      for (const step of bp.steps ?? []) {
        if (!step.profileId) continue;
        expect(
          step.profileId,
          `${file} references ${step.profileId}`
        ).toMatch(/^relay-agency-pro--/);
        expect(shippedProfiles.has(step.profileId)).toBe(true);
      }
    }
  });

  it("ships only schema-valid blueprints — an invalid one silently never fires", async () => {
    // The blueprint registry (workflows/blueprints/registry.ts) skips any
    // file that fails BlueprintSchema with only a console.warn, so a schema
    // slip in shipped content would surface as "Blueprint not found" at the
    // customer's first trigger. Caught live in the 2026-07-01 smoke
    // (pattern: pipeline is not a valid enum value).
    const { BlueprintSchema } = await import("@/lib/validators/blueprint");
    const { listPackTemplates } = await import("../catalog");
    const tpl = listPackTemplates().find((t) => t.id === "relay-agency-pro")!;
    const bpDir = path.join(tpl.dir, "base", "blueprints");
    const files = fs.readdirSync(bpDir).filter((f) => f.endsWith(".yaml"));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const parsed = yaml.load(fs.readFileSync(path.join(bpDir, file), "utf-8"));
      const result = BlueprintSchema.safeParse(parsed);
      expect(
        result.success,
        `${file}: ${result.success ? "" : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
      ).toBe(true);
    }
  });

  it("keeps every scheduled blueprint fireable with no variables (defaults only)", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");
    await installPack("relay-agency-pro", installOpts());

    const app = registry.getApp("relay-agency-pro", appsDir)!;
    // The scheduler dispatches with {} — a required variable without a
    // default would make every firing throw.
    for (const sched of app.manifest.schedules) {
      const runs = (sched as { runs?: string }).runs!;
      const bp = yaml.load(
        fs.readFileSync(path.join(blueprintsDir, `${runs}.yaml`), "utf-8")
      ) as { variables?: { id: string; required?: boolean; default?: unknown }[] };
      for (const v of bp.variables ?? []) {
        if (v.required) {
          expect(
            v.default,
            `scheduled blueprint ${runs} variable ${v.id} needs a default`
          ).toBeDefined();
        }
      }
    }
  });
});
