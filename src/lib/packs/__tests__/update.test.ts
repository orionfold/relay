import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

let dataDir: string;
let appsDir: string;
let profilesDir: string;
let blueprintsDir: string;
let packDirV1: string;
let packDirV2: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-update-"));
  appsDir = path.join(dataDir, "apps");
  profilesDir = path.join(dataDir, "profiles");
  blueprintsDir = path.join(dataDir, "blueprints");
  packDirV1 = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-v1-"));
  packDirV2 = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-v2-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(packDirV1, { recursive: true, force: true });
  fs.rmSync(packDirV2, { recursive: true, force: true });
});

interface FixtureOptions {
  version?: string;
  entitlement?: string;
  /** Add a second blueprint (the "new content" a paid update ships). */
  extraBlueprint?: boolean;
  /** Cron for the month-end schedule (config change across versions). */
  cron?: string;
  purchaseUrl?: string;
  /** Per-version customer-voice recap lines (renewal value-recap surface). */
  changelog?: Record<string, string>;
}

/** Same shape as the install-test fixture, parameterized by version. */
function buildPack(dir: string, opts: FixtureOptions = {}): void {
  const version = opts.version ?? "0.1.0";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "pack.yaml"),
    yaml.dump({
      id: "test-agency",
      version,
      name: "Test Agency",
      relayCore: ">=0.15.0",
      ...(opts.entitlement ? { entitlement: opts.entitlement } : {}),
      ...(opts.purchaseUrl ? { purchaseUrl: opts.purchaseUrl } : {}),
      ...(opts.changelog ? { changelog: opts.changelog } : {}),
      customers: [],
    })
  );

  const baseDir = path.join(dir, "base");
  fs.mkdirSync(baseDir, { recursive: true });

  const blueprints: Record<string, unknown>[] = [
    {
      id: "test-agency--weekly",
      source: "$RELAY_DATA_DIR/blueprints/test-agency--weekly.yaml",
    },
  ];
  if (opts.extraBlueprint) {
    blueprints.push({
      id: "test-agency--monthly",
      source: "$RELAY_DATA_DIR/blueprints/test-agency--monthly.yaml",
    });
  }

  fs.writeFileSync(
    path.join(baseDir, "manifest.yaml"),
    yaml.dump({
      id: "test-agency",
      version,
      name: "Test Agency",
      profiles: [
        {
          id: "test-agency--manager",
          source: "$RELAY_DATA_DIR/profiles/test-agency--manager/",
        },
      ],
      blueprints,
      tables: [{ id: "clients", columns: ["name", "stage"] }],
      schedules: [
        {
          id: "month-end",
          cron: opts.cron ?? "0 6 1 * *",
          runs: "test-agency--weekly",
        },
      ],
    })
  );

  const profDir = path.join(baseDir, "profiles", "test-agency--manager");
  fs.mkdirSync(profDir, { recursive: true });
  fs.writeFileSync(
    path.join(profDir, "profile.yaml"),
    `id: test-agency--manager\n# pack version ${version}\n`
  );
  fs.writeFileSync(path.join(profDir, "SKILL.md"), `# Manager v${version}\n`);

  fs.mkdirSync(path.join(baseDir, "blueprints"), { recursive: true });
  const blueprintYaml = (id: string, name: string) =>
    yaml.dump({
      id,
      name,
      description: `Fixture blueprint (pack v${version}).`,
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
          promptTemplate: `Review (pack v${version}).`,
        },
      ],
    });
  fs.writeFileSync(
    path.join(baseDir, "blueprints", "test-agency--weekly.yaml"),
    blueprintYaml("test-agency--weekly", "Weekly Review")
  );
  if (opts.extraBlueprint) {
    fs.writeFileSync(
      path.join(baseDir, "blueprints", "test-agency--monthly.yaml"),
      blueprintYaml("test-agency--monthly", "Monthly Review")
    );
  }

  fs.mkdirSync(path.join(baseDir, "seed", "tables"), { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "seed", "tables", "clients.json"),
    JSON.stringify([
      { name: "Acme Co", stage: "active" },
      { name: "Globex", stage: "prospect" },
    ])
  );
}

function dirs() {
  return { appsDir, profilesDir, blueprintsDir };
}

/** Snapshot every artifact under profilesDir + blueprintsDir → contents. */
function snapshotArtifacts(): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (root: string) => {
    if (!fs.existsSync(root)) return;
    for (const entry of fs.readdirSync(root, {
      withFileTypes: true,
      recursive: true,
    })) {
      if (!entry.isFile()) continue;
      const full = path.join(entry.parentPath, entry.name);
      out.set(full, fs.readFileSync(full, "utf-8"));
    }
  };
  walk(profilesDir);
  walk(blueprintsDir);
  return out;
}

async function signedLicense(entitlement: string) {
  const { signEnvelope } = await import(
    "@/lib/licensing/__tests__/sign-helper"
  );
  return signEnvelope({
    schema: "orionfold.license/v1",
    license_id: "OF-RELAY-UPDATE-TEST",
    issued_to: { email: "naya@example.com" },
    issued_at: "2026-07-01T00:00:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    entitlements: [entitlement],
  });
}

describe("packUpdateAvailability", () => {
  it("reports installed vs template versions from one comparison source", async () => {
    buildPack(packDirV1, { version: "0.1.0" });
    const { installPack } = await import("../install");
    const { packUpdateAvailability } = await import("../update");

    await installPack(packDirV1, dirs());

    // Stage a v0.2.0 bundled template for the same pack id.
    const templatesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ainative-templates-")
    );
    try {
      buildPack(path.join(templatesDir, "test-agency"), { version: "0.2.0" });
      fs.mkdirSync(path.join(templatesDir, "test-agency"), { recursive: true });

      const avail = packUpdateAvailability("test-agency", {
        appsDir,
        templatesDir,
      });
      expect(avail).toEqual({
        installedVersion: "0.1.0",
        availableVersion: "0.2.0",
        updateAvailable: true,
      });
    } finally {
      fs.rmSync(templatesDir, { recursive: true, force: true });
    }
  });

  it("is not update-available at the same version, and null-available with no template", async () => {
    buildPack(packDirV1, { version: "0.1.0" });
    const { installPack } = await import("../install");
    const { packUpdateAvailability } = await import("../update");

    await installPack(packDirV1, dirs());

    const templatesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ainative-templates-")
    );
    try {
      buildPack(path.join(templatesDir, "test-agency"), { version: "0.1.0" });
      expect(
        packUpdateAvailability("test-agency", { appsDir, templatesDir })
      ).toEqual({
        installedVersion: "0.1.0",
        availableVersion: "0.1.0",
        updateAvailable: false,
      });

      // No bundled template for this id at all.
      expect(
        packUpdateAvailability("test-agency", {
          appsDir,
          templatesDir: path.join(templatesDir, "empty-nowhere"),
        })
      ).toEqual({
        installedVersion: "0.1.0",
        availableVersion: null,
        updateAvailable: false,
      });
    } finally {
      fs.rmSync(templatesDir, { recursive: true, force: true });
    }
  });

  it("falls back to the installed manifest version when the sidecar is missing (no phantom same-version update)", async () => {
    // A pre-0.21 install has no install-state sidecar, but installPack has
    // always stamped the manifest with the pack version. When the sidecar is
    // gone and the template matches that manifest version, NO update is offered
    // — the fix for the "Update to v0.1.0" phantom on the free Agency pack.
    buildPack(packDirV1, { version: "0.1.0" });
    const { installPack } = await import("../install");
    const { packUpdateAvailability } = await import("../update");
    const { installStatePath } = await import("../install-state");

    await installPack(packDirV1, dirs());
    fs.rmSync(installStatePath(appsDir, "test-agency")); // pre-0.21 install

    const templatesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ainative-templates-")
    );
    try {
      buildPack(path.join(templatesDir, "test-agency"), { version: "0.1.0" });
      expect(
        packUpdateAvailability("test-agency", { appsDir, templatesDir })
      ).toEqual({
        installedVersion: "0.1.0", // recovered from manifest.yaml, not the sidecar
        availableVersion: "0.1.0",
        updateAvailable: false,
      });
    } finally {
      fs.rmSync(templatesDir, { recursive: true, force: true });
    }
  });

  it("still offers a genuine upgrade for a pre-0.21 install (sidecar missing, template newer)", async () => {
    // The manifest fallback must not suppress a REAL upgrade: manifest at
    // 0.1.0, template at 0.2.0 → update available, installedVersion recovered.
    buildPack(packDirV1, { version: "0.1.0" });
    const { installPack } = await import("../install");
    const { packUpdateAvailability } = await import("../update");
    const { installStatePath } = await import("../install-state");

    await installPack(packDirV1, dirs());
    fs.rmSync(installStatePath(appsDir, "test-agency")); // pre-0.21 install

    const templatesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ainative-templates-")
    );
    try {
      buildPack(path.join(templatesDir, "test-agency"), { version: "0.2.0" });
      expect(
        packUpdateAvailability("test-agency", { appsDir, templatesDir })
      ).toEqual({
        installedVersion: "0.1.0",
        availableVersion: "0.2.0",
        updateAvailable: true,
      });
    } finally {
      fs.rmSync(templatesDir, { recursive: true, force: true });
    }
  });

  it("treats a truly-unknown installed version (no sidecar AND no manifest version) as older than any template", async () => {
    // Both version records absent → the original fail-open rule still holds:
    // unknown counts as older, so an update is offered rather than silently
    // withheld. (Manifest without a version is degenerate but must be safe.)
    buildPack(packDirV1, { version: "0.1.0" });
    const { installPack } = await import("../install");
    const { packUpdateAvailability } = await import("../update");
    const { installStatePath } = await import("../install-state");

    await installPack(packDirV1, dirs());
    fs.rmSync(installStatePath(appsDir, "test-agency")); // pre-0.21 install
    // Strip the version field from the installed manifest.
    const manifestPath = path.join(appsDir, "test-agency", "manifest.yaml");
    const stripped = fs
      .readFileSync(manifestPath, "utf-8")
      .split("\n")
      .filter((l) => !/^version:/.test(l.trim()))
      .join("\n");
    fs.writeFileSync(manifestPath, stripped);

    const templatesDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "ainative-templates-")
    );
    try {
      buildPack(path.join(templatesDir, "test-agency"), { version: "0.1.0" });
      expect(
        packUpdateAvailability("test-agency", { appsDir, templatesDir })
      ).toEqual({
        installedVersion: null,
        availableVersion: "0.1.0",
        updateAvailable: true,
      });
    } finally {
      fs.rmSync(templatesDir, { recursive: true, force: true });
    }
  });
});

describe("updatePack", () => {
  it("updates v1 → v2: new artifacts land, table not re-seeded, schedule state preserved, sidecar rewritten", async () => {
    buildPack(packDirV1, { version: "0.1.0" });
    buildPack(packDirV2, {
      version: "0.2.0",
      extraBlueprint: true,
      cron: "0 7 1 * *",
    });
    const { installPack } = await import("../install");
    const { updatePack } = await import("../update");
    const { readInstallState } = await import("../install-state");
    const { db } = await import("@/lib/db");
    const { schedules, userTableRows } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    await installPack(packDirV1, dirs());

    // Simulate scheduler runtime state the update must not clobber.
    db.update(schedules)
      .set({ firingCount: 7 })
      .where(eq(schedules.id, "app:test-agency:month-end"))
      .run();

    const report = await updatePack("test-agency", {
      ...dirs(),
      source: packDirV2,
    });

    expect(report.upToDate).toBe(false);
    expect(report.previousVersion).toBe("0.1.0");
    expect(report.newVersion).toBe("0.2.0");

    // New v2 artifact landed.
    expect(
      fs.existsSync(path.join(blueprintsDir, "test-agency--monthly.yaml"))
    ).toBe(true);

    // Existing table reused, rows NOT re-seeded (2, not 4).
    const { getApp } = await import("@/lib/apps/registry");
    const app = getApp("test-agency", appsDir);
    const realTableId = app!.manifest.tables[0].id;
    const rows = await db
      .select()
      .from(userTableRows)
      .where(eq(userTableRows.tableId, realTableId));
    expect(rows).toHaveLength(2);

    // Schedule config refreshed, runtime state preserved.
    const sched = await db
      .select()
      .from(schedules)
      .where(eq(schedules.id, "app:test-agency:month-end"))
      .get();
    expect(sched!.cronExpression).toBe("0 7 1 * *");
    expect(sched!.firingCount).toBe(7);

    // Sidecar rewritten for the new version.
    const state = readInstallState(appsDir, "test-agency");
    expect(state?.packVersion).toBe("0.2.0");
    expect(state?.files["blueprints/test-agency--monthly.yaml"]).toBeDefined();
  });

  it("backs up a user-modified file to backup/<oldVersion>/ before overwriting, and reports it", async () => {
    buildPack(packDirV1, { version: "0.1.0" });
    buildPack(packDirV2, { version: "0.2.0" });
    const { installPack } = await import("../install");
    const { updatePack } = await import("../update");

    await installPack(packDirV1, dirs());

    // User edits a dropped artifact after install.
    const editedDest = path.join(
      profilesDir,
      "test-agency--manager",
      "SKILL.md"
    );
    fs.writeFileSync(editedDest, "# Manager — MY CUSTOM EDITS\n");

    const report = await updatePack("test-agency", {
      ...dirs(),
      source: packDirV2,
    });

    // The edit was backed up with its bytes intact...
    const backupPath = path.join(
      appsDir,
      "test-agency",
      "backup",
      "0.1.0",
      "profiles",
      "test-agency--manager",
      "SKILL.md"
    );
    expect(fs.readFileSync(backupPath, "utf-8")).toBe(
      "# Manager — MY CUSTOM EDITS\n"
    );
    // ...the new content overwrote the destination...
    expect(fs.readFileSync(editedDest, "utf-8")).toBe("# Manager v0.2.0\n");
    // ...and the report says so, loudly.
    expect(report.backedUp).toEqual([
      "profiles/test-agency--manager/SKILL.md",
    ]);
  });

  it("treats a missing sidecar (pre-0.21 install) as backup-everything", async () => {
    buildPack(packDirV1, { version: "0.1.0" });
    buildPack(packDirV2, { version: "0.2.0" });
    const { installPack } = await import("../install");
    const { updatePack } = await import("../update");
    const { installStatePath } = await import("../install-state");

    await installPack(packDirV1, dirs());
    fs.rmSync(installStatePath(appsDir, "test-agency")); // pre-0.21 install

    const report = await updatePack("test-agency", {
      ...dirs(),
      source: packDirV2,
    });

    // Version unknown → treated as older than anything; every existing
    // artifact treated as potentially user-modified.
    expect(report.previousVersion).toBeNull();
    expect(report.backedUp.sort()).toEqual([
      "blueprints/test-agency--weekly.yaml",
      "profiles/test-agency--manager/SKILL.md",
      "profiles/test-agency--manager/profile.yaml",
    ]);
    expect(
      fs.existsSync(
        path.join(
          appsDir,
          "test-agency",
          "backup",
          "unknown",
          "blueprints",
          "test-agency--weekly.yaml"
        )
      )
    ).toBe(true);
  });

  it("reports already-up-to-date with zero writes and no gate run for a same-version source", async () => {
    buildPack(packDirV1, {
      version: "0.1.0",
      entitlement: "product:orionfold-relay",
    });
    const { installPack } = await import("../install");
    const { updatePack } = await import("../update");
    const { installStatePath } = await import("../install-state");

    const licPath = path.join(packDirV1, "real.license.json");
    fs.writeFileSync(
      licPath,
      JSON.stringify(await signedLicense("product:orionfold-relay"))
    );
    await installPack(packDirV1, { ...dirs(), licenseUrl: licPath });

    // Remove every license — if the gate ran, the update would refuse.
    fs.rmSync(path.join(dataDir, "licenses"), { recursive: true, force: true });

    const sidecarBefore = fs.readFileSync(
      installStatePath(appsDir, "test-agency"),
      "utf-8"
    );
    const before = snapshotArtifacts();

    const report = await updatePack("test-agency", {
      ...dirs(),
      source: packDirV1,
    });

    expect(report.upToDate).toBe(true);
    expect(report.previousVersion).toBe("0.1.0");
    expect(report.newVersion).toBe("0.1.0");
    expect(report.backedUp).toEqual([]);

    // Zero writes: artifacts and sidecar byte-identical.
    expect(snapshotArtifacts()).toEqual(before);
    expect(
      fs.readFileSync(installStatePath(appsDir, "test-agency"), "utf-8")
    ).toBe(sidecarBefore);
  });

  it("throws PackNotInstalledError pointing at `pack add` when the pack is not installed", async () => {
    buildPack(packDirV1, { version: "0.1.0" });
    const { updatePack, PackNotInstalledError } = await import("../update");

    await expect(
      updatePack("test-agency", { ...dirs(), source: packDirV1 })
    ).rejects.toThrow(PackNotInstalledError);
    await expect(
      updatePack("test-agency", { ...dirs(), source: packDirV1 })
    ).rejects.toThrow(/pack add/);
  });

  it("D4: refuses an entitled update without a license, renewal-voiced, leaving every artifact byte-identical", async () => {
    buildPack(packDirV1, {
      version: "0.1.0",
      entitlement: "product:orionfold-relay",
      purchaseUrl: "https://orionfold.com/relay/",
    });
    buildPack(packDirV2, {
      version: "0.2.0",
      entitlement: "product:orionfold-relay",
      purchaseUrl: "https://orionfold.com/relay/",
      extraBlueprint: true,
    });
    const { installPack } = await import("../install");
    const { updatePack } = await import("../update");
    const { readInstallState } = await import("../install-state");
    const { PackLicenseError } = await import("@/lib/licensing/gate");

    const licPath = path.join(packDirV1, "real.license.json");
    fs.writeFileSync(
      licPath,
      JSON.stringify(await signedLicense("product:orionfold-relay"))
    );
    await installPack(packDirV1, { ...dirs(), licenseUrl: licPath });

    // License gone (expired/removed) — the D4 moment.
    fs.rmSync(path.join(dataDir, "licenses"), { recursive: true, force: true });

    const before = snapshotArtifacts();

    let thrown: unknown;
    try {
      await updatePack("test-agency", { ...dirs(), source: packDirV2 });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(PackLicenseError);
    const message = (thrown as Error).message;
    // Renewal-voiced: states the promise, names the fix.
    expect(message).toMatch(/keeps working/i);
    expect(message).toMatch(/renew/i);
    expect(message).toContain("https://orionfold.com/relay/");

    // Every installed artifact byte-identical; sidecar still v0.1.0; the v2
    // blueprint did NOT land; no backup dir was created.
    expect(snapshotArtifacts()).toEqual(before);
    expect(readInstallState(appsDir, "test-agency")?.packVersion).toBe("0.1.0");
    expect(
      fs.existsSync(path.join(blueprintsDir, "test-agency--monthly.yaml"))
    ).toBe(false);
    expect(fs.existsSync(path.join(appsDir, "test-agency", "backup"))).toBe(
      false
    );
  });

  it("names the withheld value in the refusal — version AND its changelog line (value-recap voice)", async () => {
    buildPack(packDirV1, {
      version: "0.1.0",
      entitlement: "product:orionfold-relay",
    });
    buildPack(packDirV2, {
      version: "0.2.0",
      entitlement: "product:orionfold-relay",
      changelog: {
        "0.1.0": "The first six chapters.",
        "0.2.0": "The nonprofit deep chapter.",
      },
    });
    const { installPack } = await import("../install");
    const { updatePack } = await import("../update");

    const licPath = path.join(packDirV1, "real.license.json");
    fs.writeFileSync(
      licPath,
      JSON.stringify(await signedLicense("product:orionfold-relay"))
    );
    await installPack(packDirV1, { ...dirs(), licenseUrl: licPath });
    fs.rmSync(path.join(dataDir, "licenses"), { recursive: true, force: true });

    await expect(
      updatePack("test-agency", { ...dirs(), source: packDirV2 })
    ).rejects.toThrow(/v0\.2\.0 — The nonprofit deep chapter\./);
  });

  it("updates an entitled pack via the persisted license store (no flag)", async () => {
    buildPack(packDirV1, {
      version: "0.1.0",
      entitlement: "product:orionfold-relay",
    });
    buildPack(packDirV2, {
      version: "0.2.0",
      entitlement: "product:orionfold-relay",
    });
    const { installPack } = await import("../install");
    const { updatePack } = await import("../update");

    const licPath = path.join(packDirV1, "real.license.json");
    fs.writeFileSync(
      licPath,
      JSON.stringify(await signedLicense("product:orionfold-relay"))
    );
    await installPack(packDirV1, { ...dirs(), licenseUrl: licPath });

    // Store still holds the redeemed license — update needs no flag (D2).
    const report = await updatePack("test-agency", {
      ...dirs(),
      source: packDirV2,
    });
    expect(report.newVersion).toBe("0.2.0");
    expect(report.upToDate).toBe(false);
  });
});
