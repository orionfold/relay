import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dataDir: string;
let appsDir: string;
let profilesDir: string;
let blueprintsDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "web-designer-pack-test-"));
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
      license_id: "OF-RELAY-WEB-TEST",
      issued_to: { email: "naya@example.com" },
      issued_at: "2026-07-01T00:00:00Z",
      expires_at: "2099-01-01T00:00:00Z",
      entitlements: ["product:orionfold-relay"],
    })
  );
}

describe("relay-web-designer — catalog contract", () => {
  it("lists the Web Designer bundle and both standalone children", async () => {
    const { listPackTemplates } = await import("../catalog");
    const { isBundle } = await import("../format");
    const all = listPackTemplates();

    const bundle = all.find((t) => t.id === "relay-web-designer");
    expect(bundle, "relay-web-designer must be in the catalog").toBeDefined();
    expect(bundle!.error).toBeUndefined();
    expect(isBundle(bundle!.meta!)).toBe(true);
    expect(bundle!.meta!.bundle).toEqual([
      "relay-web-publisher",
      "relay-web-assets",
    ]);
    expect(bundle!.meta!.entitlement).toBe("product:orionfold-relay");

    for (const id of ["relay-web-assets", "relay-web-publisher"]) {
      const child = all.find((t) => t.id === id);
      expect(child, `${id} must be in the catalog`).toBeDefined();
      expect(child!.error).toBeUndefined();
      expect(child!.meta!.entitlement).toBe("product:orionfold-relay");
    }
  });

  it("ships synthetic seed data only — no local private peer references", () => {
    const root = path.join(process.cwd(), "src/lib/packs/templates");
    const templateRoots = [
      path.join(root, "relay-web-assets"),
      path.join(root, "relay-web-publisher"),
      path.join(root, "relay-web-designer"),
    ];
    const forbidden = [
      /\/Users\/manavsehgal\/orionfold/i,
      /~\/orionfold/i,
      /self-wealth/i,
      /self-health/i,
      /beehiiv/i,
      /north-star/i,
      /harvested from/i,
      /manavsehgal/i,
    ];

    const files = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return files(fullPath);
        return [fullPath];
      });

    for (const templateRoot of templateRoots) {
      for (const file of files(templateRoot)) {
        const raw = fs.readFileSync(file, "utf-8");
        for (const pattern of forbidden) {
          expect(raw, `${file} must not contain ${pattern}`).not.toMatch(pattern);
        }
      }
    }
  });
});

describe("relay-web-designer — bundle install contract", () => {
  it("installs one composed app with gallery + preview/publish bindings rewritten", async () => {
    await saveEntitledLicense();
    const { installPack } = await import("../install");
    const registry = await import("@/lib/apps/registry");

    const report = await installPack("relay-web-designer", installOpts());
    expect(report.packId).toBe("relay-web-designer");
    expect(report.projectCreated).toBe(true);

    const apps = registry.listApps(appsDir);
    expect(apps.map((a) => a.id)).toEqual(["relay-web-designer"]);

    const app = registry.getApp("relay-web-designer", appsDir)!;
    expect(app).not.toBeNull();
    const bindings = app.manifest.view?.bindings;
    expect(app.tableCount).toBe(2);
    expect(app.profileCount).toBe(2);
    expect(app.blueprintCount).toBe(2);
    expect(bindings?.publish?.targetType).toBe("github-pages");
    expect(bindings?.generate?.generatorType).toBe("static-site");
    expect(bindings?.generate?.table).not.toBe("web_sections");
    expect(bindings?.galleries?.map((g) => g.id)).toEqual([
      "site-preview-gallery",
      "asset-gallery",
    ]);
    expect(bindings?.galleries?.[0]?.table).not.toBe("web_sections");
    expect(bindings?.galleries?.[1]?.table).not.toBe("web_assets");
  });
});
