import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

// Acceptance tests for the REAL bundled free `relay-agency` persona pack after
// the persona/industry split. Runs against the in-tree template dir.
let dataDir: string, appsDir: string, profilesDir: string, blueprintsDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-agency-test-"));
  appsDir = path.join(dataDir, "apps");
  profilesDir = path.join(dataDir, "profiles");
  blueprintsDir = path.join(dataDir, "blueprints");
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(dataDir, { recursive: true, force: true }); });
const installOpts = () => ({ appsDir, profilesDir, blueprintsDir });

describe("relay-agency free persona pack", () => {
  it("is a free (unlicensed) catalog template named Relay Agency", async () => {
    const { listPackTemplates } = await import("../catalog");
    const tpl = listPackTemplates().find((t) => t.id === "relay-agency");
    expect(tpl).toBeDefined();
    expect(tpl!.error).toBeUndefined();
    expect(tpl!.meta!.name).toBe("Relay Agency");
    expect(tpl!.meta!.entitlement).toBeUndefined(); // FREE
    expect(tpl!.meta!.changelog).toBeDefined();
  });

  it("installs with no license and materializes the neutral spine", async () => {
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");
    const report = await installPack("relay-agency", installOpts());
    expect(report.packId).toBe("relay-agency");
    expect(report.profilesDropped).toBe(7);
    expect(report.blueprintsDropped).toBe(7);
    expect(report.tablesCreated).toBe(4);
    expect(report.customersSeeded).toBe(6);
    // clients (6) + engagements (25) + pipeline (4) seed rows; intake ships empty.
    expect(report.rowsSeeded).toBe(35);
    const app = registry.getApp("relay-agency", appsDir)!;
    expect(app.manifest.tables.length).toBe(4);
    expect(app.manifest.view.kit).toBe("workflow-hub");
    // The money hero + margin KPIs bind to the engagements table (rewritten to
    // its real id at install; the binding must resolve, not read the logical id).
    const view = app.manifest.view as { bindings?: { hero?: { table?: string }; kpis?: unknown[] } };
    const heroTable = view.bindings!.hero!.table!;
    expect(app.manifest.tables.some((t) => t.id === heroTable)).toBe(true);
    expect(view.bindings!.kpis!.length).toBe(4);
  });

  it("ships only schema-valid blueprints, none CRE/nonprofit", async () => {
    const { BlueprintSchema } = await import("@/lib/validators/blueprint");
    const { listPackTemplates } = await import("../catalog");
    const tpl = listPackTemplates().find((t) => t.id === "relay-agency")!;
    // Only the manifest-referenced blueprints matter — read them via manifest.
    const bpDir = path.join(tpl.dir, "base", "blueprints");
    const manifest = yaml.load(fs.readFileSync(path.join(tpl.dir, "base", "manifest.yaml"), "utf-8")) as { blueprints: { id: string }[] };
    for (const b of manifest.blueprints) {
      const parsed = yaml.load(fs.readFileSync(path.join(bpDir, `${b.id}.yaml`), "utf-8"));
      const r = BlueprintSchema.safeParse(parsed);
      expect(r.success, `${b.id}: ${r.success ? "" : r.error.issues.map((i)=>`${i.path.join(".")}: ${i.message}`).join("; ")}`).toBe(true);
      const raw = JSON.stringify(parsed).toLowerCase();
      expect(raw).not.toMatch(/\bcre\b|lease|rent-roll|grant|nonprofit|donor/);
    }
  });

  it("every step profileId is a relay-agency profile the manifest ships", async () => {
    const { listPackTemplates } = await import("../catalog");
    const tpl = listPackTemplates().find((t) => t.id === "relay-agency")!;
    const manifest = yaml.load(fs.readFileSync(path.join(tpl.dir, "base", "manifest.yaml"), "utf-8")) as { profiles: { id: string }[]; blueprints: { id: string }[] };
    const shipped = new Set(manifest.profiles.map((p) => p.id));
    const bpDir = path.join(tpl.dir, "base", "blueprints");
    for (const b of manifest.blueprints) {
      const bp = yaml.load(fs.readFileSync(path.join(bpDir, `${b.id}.yaml`), "utf-8")) as { steps?: { profileId?: string }[] };
      for (const s of bp.steps ?? []) {
        if (!s.profileId) continue;
        expect(shipped.has(s.profileId), `${b.id} references ${s.profileId}`).toBe(true);
      }
    }
  });
});
