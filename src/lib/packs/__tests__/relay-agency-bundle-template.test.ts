import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Acceptance tests for the REAL bundled Agency bundles — `relay-agency-cre`
 * (the first bundle proof, pack-agency-bundle) and `relay-agency-nonprofit`
 * (the persona-neutrality gate). These run against the in-tree template dirs,
 * not fixtures, so they fail if the shipped pack content drifts from the
 * composition contract:
 *
 *   - the bundle flattens `relay-agency` (free persona spine) + a thin industry
 *     pack into ONE installed app under the BUNDLE's identity (one project);
 *   - the persona spine owns the ONE `clients` book — the industry pack does NOT
 *     redeclare `clients` (that collision is exactly what the split fixed), so
 *     the merge does not throw a BundleCollisionError;
 *   - a cross-child binding resolves post-merge (a CRE row-insert trigger on the
 *     CRE-owned rent_roll rewrites to the real UUID; the persona margin KPI reads
 *     the persona clients table with no silent 0-read);
 *   - the industry pack's vertical clients seed into the shared customer
 *     dimension (via seed/customers.yaml aggregation), so one client book carries
 *     both persona and industry clients;
 *   - the free/pro line survives: the bundle is premium (one license per bundle),
 *     gated by the bundle's OWN entitlement.
 */

let dataDir: string;
let appsDir: string;
let profilesDir: string;
let blueprintsDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agency-bundle-test-"));
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
      license_id: "OF-RELAY-BUNDLE-TEST",
      issued_to: { email: "naya@example.com" },
      issued_at: "2026-07-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
      entitlements: ["product:orionfold-relay"],
    })
  );
}

describe("Agency bundles — catalog contract", () => {
  it("lists both Agency bundles as valid premium bundle templates", async () => {
    const { listPackTemplates } = await import("../catalog");
    const { isBundle } = await import("../format");
    const all = listPackTemplates();

    for (const id of ["relay-agency-cre", "relay-agency-nonprofit"]) {
      const tpl = all.find((t) => t.id === id);
      expect(tpl, `${id} must be in the catalog`).toBeDefined();
      expect(tpl!.error).toBeUndefined();
      // A bundle owns no inner manifest; it declares a non-empty child list.
      expect(isBundle(tpl!.meta!)).toBe(true);
      // One license per bundle — the bundle's OWN entitlement gates install.
      expect(tpl!.meta!.entitlement).toBe("product:orionfold-relay");
      expect(tpl!.meta!.purchaseUrl).toBe("https://orionfold.com/relay/");
      // The description IS the what-you-get preview on the locked card.
      expect(tpl!.meta!.description!.length).toBeGreaterThan(100);
    }
  });

  it("the CRE bundle flattens the free persona spine + the thin CRE pack", async () => {
    const { findPackTemplate } = await import("../catalog");
    const tpl = findPackTemplate("relay-agency-cre")!;
    // Persona spine FIRST (owns the client book + merged hero), CRE second.
    expect(tpl.meta!.bundle).toEqual(["relay-agency", "relay-cre"]);
  });

  it("carries a changelog line for every released version (paid-pack renewal contract)", async () => {
    const semver = (await import("semver")).default;
    const { findPackTemplate } = await import("../catalog");
    for (const id of ["relay-agency-cre", "relay-agency-nonprofit"]) {
      const meta = findPackTemplate(id)!.meta!;
      expect(meta.changelog, `${id} needs a changelog`).toBeDefined();
      const versions = Object.keys(meta.changelog!);
      expect(versions).toContain(meta.version);
      for (const v of versions) {
        expect(semver.valid(v), `changelog key "${v}" must be semver`).toBeTruthy();
        expect(meta.changelog![v].length).toBeGreaterThan(20);
      }
    }
  });
});

describe("relay-agency-cre — the first bundle proof", () => {
  it("refuses install without a license, before any write (free/pro line survives)", async () => {
    const { installPack } = await import("../install");
    const { PackLicenseError } = await import("@/lib/licensing/gate");
    await expect(
      installPack("relay-agency-cre", installOpts())
    ).rejects.toThrow(PackLicenseError);
    expect(fs.existsSync(path.join(appsDir, "relay-agency-cre"))).toBe(false);
  });

  it("flattens Agency + CRE into ONE app under one project, one client book", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");
    const { db } = await import("@/lib/db");
    const { projects } = await import("@/lib/db/schema");

    const report = await installPack("relay-agency-cre", installOpts());

    // The bundle installs as ONE app under the BUNDLE's id.
    expect(report.packId).toBe("relay-agency-cre");
    expect(report.projectCreated).toBe(true);

    // listApps sees a SINGLE app — indistinguishable from a hand-composed one.
    const apps = registry.listApps(appsDir);
    expect(apps.map((a) => a.id)).toEqual(["relay-agency-cre"]);

    // One project row, not one-per-child.
    const projRows = await db.select().from(projects);
    expect(projRows.map((p) => p.id)).toEqual(["relay-agency-cre"]);

    const app = registry.getApp("relay-agency-cre", appsDir)!;
    // Persona spine tables (clients/engagements/intake/pipeline) + CRE's
    // rent_roll — and exactly ONE client book (no duplicate `clients`). Table
    // ids are rewritten to UUIDs, so assert by count: 4 persona + 1 CRE = 5.
    expect(app.manifest.tables.length).toBe(5);

    // Profiles/blueprints from both children, pack-id-namespaced so no collide.
    const persona = app.manifest.profiles.filter((p) =>
      p.id.startsWith("relay-agency--")
    );
    const cre = app.manifest.profiles.filter((p) =>
      p.id.startsWith("relay-cre--")
    );
    expect(persona.length).toBeGreaterThan(0);
    expect(cre.length).toBeGreaterThan(0);
  });

  it("resolves a cross-child binding post-merge: CRE trigger + persona KPI (no silent 0-read)", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");
    const tables = await import("@/lib/data/tables");

    await installPack("relay-agency-cre", installOpts());
    const app = registry.getApp("relay-agency-cre", appsDir)!;

    // Persona seeds two tables: the client book (`clients`, 6 rows) and the
    // engagements ledger (25 rows). Both are persona-owned and must read
    // non-zero post-merge (no silent 0-read). CRE's rent_roll ships empty.
    const withRows = await Promise.all(
      app.manifest.tables.map(async (t) => ({
        id: t.id,
        rows: (await tables.listRows(t.id)).length,
      }))
    );
    const clientsTable = withRows.find((t) => t.rows === 6);
    const engagementsTable = withRows.find((t) => t.rows === 25);
    expect(
      clientsTable,
      "persona clients book must seed non-zero (no silent 0-read)"
    ).toBeDefined();
    expect(
      engagementsTable,
      "persona engagements ledger must seed non-zero (no silent 0-read)"
    ).toBeDefined();

    // CROSS-CHILD TRIGGER: the CRE lease-abstraction blueprint fires on the
    // CRE-owned rent_roll table — after the merge its trigger.table must be a
    // REAL UUID (rewritten from the logical `rent_roll`), never the literal.
    const lease = app.manifest.blueprints.find(
      (b) => b.id === "relay-cre--lease-abstraction"
    ) as { trigger?: { table?: string } };
    expect(lease.trigger?.table).toBeDefined();
    expect(lease.trigger!.table).not.toBe("rent_roll");
    const tableIds = new Set(app.manifest.tables.map((t) => t.id));
    expect(tableIds.has(lease.trigger!.table!)).toBe(true);

    // PERSONA MARGIN KPI reads a SEEDED table post-merge: the margin-mtd KPI's
    // engagements source is rewritten from the logical id to the real UUID, so
    // it reads the 25-row ledger, not a silent 0. (The KPI source shape is a
    // ratio of two windowed sums over `engagements`.)
    const view = app.manifest.view as {
      bindings?: {
        hero?: { table?: string };
        kpis?: {
          id: string;
          source?: { numerator?: { table?: string } };
        }[];
      };
    };
    const margin = view.bindings?.kpis?.find((k) => k.id === "margin-mtd");
    expect(margin?.source?.numerator?.table).toBe(engagementsTable!.id);

    // The merged hero is the persona spine's "money hero" (first-child-wins
    // view merge): the engagements ledger, so the app opens on the margin
    // cockpit, not the CRE rent roll — the persona carries the weight.
    expect(view.bindings?.hero?.table).toBe(engagementsTable!.id);
  });

  it("seeds BOTH persona and CRE vertical clients into the shared customer book", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const { db } = await import("@/lib/db");
    const { customers } = await import("@/lib/db/schema");

    const report = await installPack("relay-agency-cre", installOpts());

    // 6 persona clients + 3 CRE clients = 9, aggregated per-child, deduped by
    // slug (the two child seeds share no slug, so all 9 land).
    expect(report.customersSeeded).toBe(9);
    const custRows = await db.select().from(customers);
    const slugs = custRows.map((c) => c.slug);
    expect(slugs).toContain("northwind-studio"); // persona
    expect(slugs).toContain("meridian-cre"); // CRE vertical
  });
});

describe("relay-agency-nonprofit — the persona-neutrality gate", () => {
  it("installs as cleanly as the CRE bundle (same spine, different industry pack)", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");

    const report = await installPack("relay-agency-nonprofit", installOpts());

    expect(report.packId).toBe("relay-agency-nonprofit");
    expect(report.projectCreated).toBe(true);

    const app = registry.getApp("relay-agency-nonprofit", appsDir)!;
    // 4 persona tables + nonprofit's `grants` = 5, one client book, no collide.
    expect(app.manifest.tables.length).toBe(5);

    // The nonprofit grant pipeline fires on the grants table (row-insert),
    // rewritten to a real UUID post-merge.
    const pipeline = app.manifest.blueprints.find(
      (b) => b.id === "relay-nonprofit--grant-pipeline-deep"
    ) as { trigger?: { table?: string } };
    expect(pipeline.trigger?.table).toBeDefined();
    expect(pipeline.trigger!.table).not.toBe("grants");

    // Persona clients (6) + nonprofit clients (3) into the shared book.
    expect(report.customersSeeded).toBe(9);
  });
});
