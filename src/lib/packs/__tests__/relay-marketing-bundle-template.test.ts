import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Acceptance tests for the REAL Marketing bundle — `relay-marketing`
 * (pack-marketing-line): the *splitting* bundle proof. Unlike the Agency-for-CRE
 * bundle (a persona spine + one thin vertical), this one splits ONE purchase into
 * TWO Functional-domain children — `relay-crm` (owns the lead book) + `relay-social`
 * (owns content/campaigns/channels/ads) — flattened into one "Relay Marketing" app.
 *
 * These run against the in-tree template dirs (not fixtures), so they fail if the
 * shipped pack content drifts from the composition contract:
 *
 *   - the bundle flattens the two children into ONE installed app under the
 *     BUNDLE's identity (one project);
 *   - the two children own DISJOINT logical ids (leads/lead_research/consent_policy
 *     vs content_assets/creatives/campaigns/channels/ad_initiatives), so the merge
 *     does not throw a BundleCollisionError;
 *   - the intra-bundle binding spine resolves post-merge (utm_campaign): a
 *     `relay-social` KPI reads the `relay-crm`-owned `leads` table by a REAL UUID
 *     (cross-child READ, no silent 0-read), and a `relay-social` blueprint's
 *     row-insert trigger on the CRM-owned `leads` table rewrites to that same UUID
 *     (cross-child TRIGGER);
 *   - trigger-bound tables (`leads`, `creatives`) ship EMPTY; the seeded tables
 *     (campaigns/channels/content_assets/lead_research/consent_policy) read
 *     non-zero;
 *   - the free/pro line survives: the bundle is premium (one license per bundle),
 *     gated by the bundle's OWN entitlement.
 */

let dataDir: string;
let appsDir: string;
let profilesDir: string;
let blueprintsDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "marketing-bundle-test-"));
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
      license_id: "OF-RELAY-MKTG-TEST",
      issued_to: { email: "naya@example.com" },
      issued_at: "2026-07-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
      entitlements: ["product:orionfold-relay"],
    })
  );
}

/** The `attributed-leads` KPI is the cross-child READ: a relay-social KPI whose
 * `table` ref points at relay-crm's `leads`. Post-flatten it is rewritten to the
 * real UUID — so it doubles as the way to find the leads table's real id. */
function attributedLeadsTableId(app: {
  manifest: { view?: unknown };
}): string | undefined {
  const view = app.manifest.view as {
    bindings?: { kpis?: { id: string; source?: { table?: string } }[] };
  };
  return view.bindings?.kpis?.find((k) => k.id === "attributed-leads")?.source
    ?.table;
}

describe("relay-marketing — catalog contract", () => {
  it("lists the Marketing bundle as a valid premium bundle template", async () => {
    const { listPackTemplates } = await import("../catalog");
    const { isBundle } = await import("../format");
    const all = listPackTemplates();

    const tpl = all.find((t) => t.id === "relay-marketing");
    expect(tpl, "relay-marketing must be in the catalog").toBeDefined();
    expect(tpl!.error).toBeUndefined();
    // A bundle owns no inner manifest; it declares a non-empty child list.
    expect(isBundle(tpl!.meta!)).toBe(true);
    expect(tpl!.meta!.bundle).toEqual(["relay-crm", "relay-social"]);
    // One license per bundle — the bundle's OWN entitlement gates install.
    expect(tpl!.meta!.entitlement).toBe("product:orionfold-relay");
    expect(tpl!.meta!.purchaseUrl).toBe("https://orionfold.com/relay/");
    // The description IS the what-you-get preview on the locked card.
    expect(tpl!.meta!.description!.length).toBeGreaterThan(100);
  });

  it("both children are valid standalone premium templates", async () => {
    const { listPackTemplates } = await import("../catalog");
    const all = listPackTemplates();
    for (const id of ["relay-crm", "relay-social"]) {
      const tpl = all.find((t) => t.id === id);
      expect(tpl, `${id} must be in the catalog`).toBeDefined();
      expect(tpl!.error).toBeUndefined();
      expect(tpl!.meta!.entitlement).toBe("product:orionfold-relay");
    }
  });

  it("carries a changelog line for every released version (paid-pack renewal contract)", async () => {
    const semver = (await import("semver")).default;
    const { findPackTemplate } = await import("../catalog");
    for (const id of ["relay-marketing", "relay-crm", "relay-social"]) {
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

describe("relay-marketing — the splitting bundle proof", () => {
  it("refuses install without a license, before any write (free/pro line survives)", async () => {
    const { installPack } = await import("../install");
    const { PackLicenseError } = await import("@/lib/licensing/gate");
    await expect(
      installPack("relay-marketing", installOpts())
    ).rejects.toThrow(PackLicenseError);
    expect(fs.existsSync(path.join(appsDir, "relay-marketing"))).toBe(false);
  });

  it("flattens CRM + Social into ONE app under one project, disjoint ids", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");
    const { db } = await import("@/lib/db");
    const { projects } = await import("@/lib/db/schema");

    const report = await installPack("relay-marketing", installOpts());

    // The bundle installs as ONE app under the BUNDLE's id.
    expect(report.packId).toBe("relay-marketing");
    expect(report.projectCreated).toBe(true);

    // listApps sees a SINGLE app — indistinguishable from a hand-composed one.
    const apps = registry.listApps(appsDir);
    expect(apps.map((a) => a.id)).toEqual(["relay-marketing"]);

    // One project row, not one-per-child.
    const projRows = await db.select().from(projects);
    expect(projRows.map((p) => p.id)).toEqual(["relay-marketing"]);

    const app = registry.getApp("relay-marketing", appsDir)!;
    // 3 CRM tables (leads/lead_research/consent_policy) + 5 Social tables
    // (content_assets/creatives/campaigns/channels/ad_initiatives) = 8, disjoint,
    // no collision (ids rewritten to UUIDs, so assert by count).
    expect(app.manifest.tables.length).toBe(8);

    // Profiles from both children, pack-id-namespaced so no collide.
    const crm = app.manifest.profiles.filter((p) =>
      p.id.startsWith("relay-crm--")
    );
    const social = app.manifest.profiles.filter((p) =>
      p.id.startsWith("relay-social--")
    );
    expect(crm.length).toBe(3);
    expect(social.length).toBe(3);
  });

  it("resolves the utm_campaign spine post-merge: cross-child READ + cross-child TRIGGER (no silent 0-read)", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");
    const tables = await import("@/lib/data/tables");

    await installPack("relay-marketing", installOpts());
    const app = registry.getApp("relay-marketing", appsDir)!;

    // CROSS-CHILD READ: the relay-social `attributed-leads` KPI's `table` ref is
    // rewritten from the logical `leads` (a relay-crm-owned table) to a REAL
    // UUID — never the literal.
    const leadsTableId = attributedLeadsTableId(app);
    expect(leadsTableId, "attributed-leads KPI must exist post-merge").toBeDefined();
    expect(leadsTableId).not.toBe("leads");
    const tableIds = new Set(app.manifest.tables.map((t) => t.id));
    expect(tableIds.has(leadsTableId!)).toBe(true);

    // CROSS-CHILD TRIGGER: the relay-social `welcome-creative` blueprint fires on
    // a row-insert into the CRM-owned `leads` — after the merge its trigger.table
    // must be the SAME real UUID the KPI reads (both rewritten from `leads`).
    const welcome = app.manifest.blueprints.find(
      (b) => b.id === "relay-social--welcome-creative"
    ) as { trigger?: { table?: string } };
    expect(welcome.trigger?.table).toBeDefined();
    expect(welcome.trigger!.table).not.toBe("leads");
    expect(welcome.trigger!.table).toBe(leadsTableId);

    // The relay-crm `lead-enrich` trigger also binds `leads` (intra-child) — same
    // real UUID, proving one leads table serves both children's triggers.
    const enrich = app.manifest.blueprints.find(
      (b) => b.id === "relay-crm--lead-enrich"
    ) as { trigger?: { table?: string } };
    expect(enrich.trigger!.table).toBe(leadsTableId);

    // NO SILENT 0-READ: `leads` ships EMPTY (trigger-bound), so the KPI reads 0
    // until a lead lands. Insert one attributed lead → the cross-child READ now
    // resolves to a real, non-zero attributed count over the sibling-owned table.
    expect((await tables.listRows(leadsTableId!)).length).toBe(0);
    await tables.addRows(leadsTableId!, [
      {
        data: {
          display_name: "New Subscriber",
          email: "new@example.com",
          stage: "subscriber",
          direct_status: "converted",
          segment: "early_adopter",
          source_origin: "website",
          source_campaign: "become-ai-native-business",
          owner: "founder",
          last_touch: "2026-07-06",
          notes: "Attributed to a live campaign — proves the utm_campaign spine.",
        },
      },
    ]);
    expect(
      (await tables.listRows(leadsTableId!)).length,
      "cross-child READ must resolve to a real non-zero count post-insert"
    ).toBe(1);

    // CROSS-CHILD TRIGGER DISPATCH (the actual fix, not just the wiring): the
    // row-insert must fill both triggered blueprints' `lead` var from the row,
    // so dispatch does NOT throw "Missing required variables". Before the fix,
    // `lead` was required with no {{row.col}} default and dispatch threw.
    const { buildVariables } = await import("@/lib/apps/manifest-trigger-dispatch");
    // listRows returns each row's `data` as a serialized JSON string; the real
    // dispatch path passes an already-parsed object to buildVariables.
    const rawRow = (await tables.listRows(leadsTableId!))[0].data;
    const row = (
      typeof rawRow === "string" ? JSON.parse(rawRow) : rawRow
    ) as Record<string, unknown>;
    for (const bpId of ["relay-social--welcome-creative", "relay-crm--lead-enrich"]) {
      const vars = buildVariables(bpId, row);
      expect(
        vars.lead,
        `${bpId}: the required "lead" var must be filled from the row (display_name)`
      ).toBe("New Subscriber");
    }
  });

  it("trigger-bound tables ship EMPTY; seeded tables read non-zero", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");
    const tables = await import("@/lib/data/tables");

    await installPack("relay-marketing", installOpts());
    const app = registry.getApp("relay-marketing", appsDir)!;

    const withRows = await Promise.all(
      app.manifest.tables.map(async (t) => ({
        id: t.id,
        rows: (await tables.listRows(t.id)).length,
      }))
    );
    const counts = withRows.map((t) => t.rows).sort((a, b) => a - b);

    // Two trigger-bound tables ship empty: `leads` (lead-enrich) and `creatives`
    // (repurpose). The other six seed non-zero: lead_research (3),
    // consent_policy (4), content_assets (4), campaigns (5), channels (5),
    // ad_initiatives (2).
    const emptyTables = withRows.filter((t) => t.rows === 0);
    expect(emptyTables.length).toBe(2);
    const seededTables = withRows.filter((t) => t.rows > 0);
    expect(seededTables.length).toBe(6);
    // Every seeded table has real rows (no silent 0-read on the seeded side).
    expect(counts.filter((c) => c > 0).length).toBe(6);
  });
});
