import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

/**
 * licenseValueRecap — the ONE recap source every renewal surface reads
 * (license status, the 402 update refusal, the /packs card, the Website
 * email copy). Reuses packUpdateAvailability (D7: never a second version
 * comparison) and is fail-open everywhere (cli-startup-robustness rule:
 * a broken sidecar/template yields silence, never a crash).
 */

let dataDir: string;
let appsDir: string;
let templatesDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-recap-"));
  appsDir = path.join(dataDir, "apps");
  templatesDir = path.join(dataDir, "templates");
  fs.mkdirSync(appsDir, { recursive: true });
  fs.mkdirSync(templatesDir, { recursive: true });
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function writeTemplate(
  id: string,
  version: string,
  opts: {
    entitlement?: string;
    changelog?: Record<string, string>;
    purchaseUrl?: string;
  } = {}
): void {
  const dir = path.join(templatesDir, id);
  fs.mkdirSync(path.join(dir, "base"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "pack.yaml"),
    yaml.dump({
      id,
      version,
      name: id,
      ...(opts.entitlement ? { entitlement: opts.entitlement } : {}),
      ...(opts.changelog ? { changelog: opts.changelog } : {}),
      ...(opts.purchaseUrl ? { purchaseUrl: opts.purchaseUrl } : {}),
    })
  );
  fs.writeFileSync(
    path.join(dir, "base", "manifest.yaml"),
    yaml.dump({ id, name: id })
  );
}

function writeInstalled(id: string, version: string | null): void {
  fs.mkdirSync(path.join(appsDir, id), { recursive: true });
  if (version !== null) {
    fs.writeFileSync(
      path.join(appsDir, id, "install-state.json"),
      JSON.stringify({
        packVersion: version,
        installedAt: "2026-07-01T00:00:00Z",
        files: {},
      })
    );
  }
}

const PRO = "product:orionfold-relay";
const LOG = {
  "0.1.0": "The first six chapters.",
  "0.2.0": "The nonprofit deep chapter.",
  "0.3.0": "The healthcare chapter.",
};

async function recap(entitlements: string[]) {
  const { entitledPackRecaps } = await import("../recap");
  return entitledPackRecaps(entitlements, { appsDir, templatesDir });
}

describe("entitledPackRecaps", () => {
  it("reports received + pending changelog lines for an installed entitled pack", async () => {
    writeTemplate("pro-pack", "0.3.0", {
      entitlement: PRO,
      changelog: LOG,
      purchaseUrl: "https://example.com/buy",
    });
    writeInstalled("pro-pack", "0.1.0");

    const [r] = await recap([PRO]);
    expect(r.packId).toBe("pro-pack");
    expect(r.installedVersion).toBe("0.1.0");
    expect(r.availableVersion).toBe("0.3.0");
    expect(r.updateAvailable).toBe(true);
    expect(r.received).toBe("The first six chapters.");
    expect(r.pending).toEqual([
      { version: "0.2.0", note: "The nonprofit deep chapter." },
      { version: "0.3.0", note: "The healthcare chapter." },
    ]);
    expect(r.purchaseUrl).toBe("https://example.com/buy");
  });

  it("includes only INSTALLED packs whose entitlement the license covers", async () => {
    writeTemplate("pro-pack", "0.2.0", { entitlement: PRO, changelog: LOG });
    writeTemplate("other-pro", "0.2.0", {
      entitlement: "product:other",
      changelog: LOG,
    });
    writeTemplate("free-pack", "0.2.0", { changelog: LOG });
    writeInstalled("pro-pack", "0.1.0");
    writeInstalled("other-pro", "0.1.0");
    writeInstalled("free-pack", "0.1.0");
    // Entitled but never installed → install-nudge territory, not renewal recap.
    writeTemplate("pro-uninstalled", "0.2.0", { entitlement: PRO });

    const rs = await recap([PRO]);
    expect(rs.map((r) => r.packId)).toEqual(["pro-pack"]);
  });

  it("is silent on an up-to-date install (no phantom nudge)", async () => {
    writeTemplate("pro-pack", "0.2.0", { entitlement: PRO, changelog: LOG });
    writeInstalled("pro-pack", "0.2.0");

    const [r] = await recap([PRO]);
    expect(r.updateAvailable).toBe(false);
    expect(r.pending).toEqual([]);
    expect(r.received).toBe("The nonprofit deep chapter.");
  });

  it("treats a missing sidecar (pre-0.21 install) as everything-pending, nothing-received", async () => {
    writeTemplate("pro-pack", "0.2.0", { entitlement: PRO, changelog: LOG });
    writeInstalled("pro-pack", null);

    const [r] = await recap([PRO]);
    expect(r.installedVersion).toBeNull();
    expect(r.updateAvailable).toBe(true);
    expect(r.received).toBeUndefined();
    expect(r.pending).toEqual([
      { version: "0.1.0", note: "The first six chapters." },
      { version: "0.2.0", note: "The nonprofit deep chapter." },
    ]);
  });

  it("still reports availability when the template has no changelog (pending is just empty)", async () => {
    writeTemplate("pro-pack", "0.2.0", { entitlement: PRO });
    writeInstalled("pro-pack", "0.1.0");

    const [r] = await recap([PRO]);
    expect(r.updateAvailable).toBe(true);
    expect(r.pending).toEqual([]);
    expect(r.received).toBeUndefined();
  });

  it("fails open to [] on a broken templates dir", async () => {
    fs.rmSync(templatesDir, { recursive: true, force: true });
    expect(await recap([PRO])).toEqual([]);
  });

  it("skips invalid changelog version keys instead of throwing", async () => {
    writeTemplate("pro-pack", "0.2.0", {
      entitlement: PRO,
      changelog: { "not-semver": "??", "0.2.0": "The nonprofit deep chapter." },
    });
    writeInstalled("pro-pack", "0.1.0");

    const [r] = await recap([PRO]);
    expect(r.pending).toEqual([
      { version: "0.2.0", note: "The nonprofit deep chapter." },
    ]);
  });
});
