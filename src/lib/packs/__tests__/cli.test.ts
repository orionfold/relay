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
let logs: string[];
let errs: string[];

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-cli-"));
  appsDir = path.join(dataDir, "apps");
  profilesDir = path.join(dataDir, "profiles");
  blueprintsDir = path.join(dataDir, "blueprints");
  packDir = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-cli-src-"));
  logs = [];
  errs = [];
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(packDir, { recursive: true, force: true });
});

function io() {
  return {
    appsDir,
    profilesDir,
    blueprintsDir,
    log: (m: string) => logs.push(m),
    error: (m: string) => errs.push(m),
  };
}

function buildFixturePack(id = "cli-pack"): void {
  fs.writeFileSync(
    path.join(packDir, "pack.yaml"),
    yaml.dump({ id, version: "0.1.0", name: "CLI Pack", relayCore: ">=0.15.0", customers: [] })
  );
  const baseDir = path.join(packDir, "base");
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "manifest.yaml"),
    yaml.dump({ id, version: "0.1.0", name: "CLI Pack", profiles: [], blueprints: [], tables: [], schedules: [] })
  );
}

function buildPremiumFixturePack(id = "cli-premium"): void {
  fs.writeFileSync(
    path.join(packDir, "pack.yaml"),
    yaml.dump({
      id,
      version: "0.1.0",
      name: "CLI Premium Pack",
      relayCore: ">=0.15.0",
      entitlement: "product:orionfold-relay",
      customers: [],
    })
  );
  const baseDir = path.join(packDir, "base");
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "manifest.yaml"),
    yaml.dump({ id, version: "0.1.0", name: "CLI Premium Pack", profiles: [], blueprints: [], tables: [], schedules: [] })
  );
}

async function load() {
  return import("../cli");
}

describe("runPackCommand", () => {
  it("add: installs a pack and reports a non-zero summary", async () => {
    buildFixturePack();
    const { runPackCommand } = await load();
    const code = await runPackCommand(["add", packDir], io());
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/cli-pack/);
    // project dropped on disk
    expect(fs.existsSync(path.join(appsDir, "cli-pack", "manifest.yaml"))).toBe(true);
  });

  it("list: shows installed packs", async () => {
    buildFixturePack();
    const { runPackCommand } = await load();
    await runPackCommand(["add", packDir], io());
    logs = [];
    const code = await runPackCommand(["list"], io());
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/cli-pack/);
  });

  it("list: shows the installed version from the sidecar", async () => {
    buildFixturePack();
    const { runPackCommand } = await load();
    await runPackCommand(["add", packDir], io());
    logs = [];
    const code = await runPackCommand(["list"], io());
    expect(code).toBe(0);
    const line = logs.find((l) => l.includes("cli-pack"));
    expect(line).toMatch(/installed v0\.1\.0/);
  });

  it("remove: removes the pack registration and reports retained data", async () => {
    buildFixturePack();
    const { runPackCommand } = await load();
    await runPackCommand(["add", packDir], io());
    const retainedProfile = path.join(profilesDir, "cli-pack--reusable");
    const retainedBlueprint = path.join(blueprintsDir, "cli-pack--reusable.yaml");
    fs.mkdirSync(retainedProfile, { recursive: true });
    fs.mkdirSync(blueprintsDir, { recursive: true });
    fs.writeFileSync(path.join(retainedProfile, "SKILL.md"), "keep", "utf-8");
    fs.writeFileSync(retainedBlueprint, "id: keep\n", "utf-8");

    const code = await runPackCommand(["remove", "cli-pack"], io());

    expect(code).toBe(0);
    expect(fs.existsSync(path.join(appsDir, "cli-pack"))).toBe(false);
    expect(fs.existsSync(retainedProfile)).toBe(true);
    expect(fs.existsSync(retainedBlueprint)).toBe(true);
    expect(logs.join("\n")).toMatch(/Retained:.*durable customers.*customer attribution/i);
    expect(logs.join("\n")).toMatch(/pack removal is not Relay Cell deletion/i);
  });

  it("update: refuses a pack that is not installed, pointing at pack add", async () => {
    buildFixturePack();
    const { runPackCommand } = await load();
    const code = await runPackCommand(["update", "cli-pack", packDir], io());
    expect(code).toBe(1);
    expect(errs.join("\n")).toMatch(/not installed/i);
    expect(errs.join("\n")).toMatch(/pack add/);
  });

  it("update: reports vOLD → vNEW and backed-up files", async () => {
    buildFixturePack();
    const { runPackCommand } = await load();
    await runPackCommand(["add", packDir], io());
    logs = [];

    // Bump the source to 0.2.0 (same dir edited in place, like a template bump).
    fs.writeFileSync(
      path.join(packDir, "pack.yaml"),
      yaml.dump({
        id: "cli-pack",
        version: "0.2.0",
        name: "CLI Pack",
        relayCore: ">=0.15.0",
        customers: [],
      })
    );

    const code = await runPackCommand(["update", "cli-pack", packDir], io());
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/cli-pack.*v?0\.1\.0.*→.*v?0\.2\.0/);
  });

  it("update: says already up to date for a same-version source", async () => {
    buildFixturePack();
    const { runPackCommand } = await load();
    await runPackCommand(["add", packDir], io());
    logs = [];

    const code = await runPackCommand(["update", "cli-pack", packDir], io());
    expect(code).toBe(0);
    expect(logs.join("\n").toLowerCase()).toMatch(/up to date/);
  });

  it("update: missing id errors with usage", async () => {
    const { runPackCommand } = await load();
    const code = await runPackCommand(["update"], io());
    expect(code).toBe(1);
    expect(errs.join("\n").toLowerCase()).toMatch(/usage|id/);
  });

  it("unknown action: errors with a non-zero code and usage", async () => {
    const { runPackCommand } = await load();
    const code = await runPackCommand(["frobnicate"], io());
    expect(code).toBe(1);
    expect(errs.join("\n").toLowerCase()).toMatch(/unknown|usage/);
  });

  it("add without a path: errors with usage", async () => {
    const { runPackCommand } = await load();
    const code = await runPackCommand(["add"], io());
    expect(code).toBe(1);
    expect(errs.join("\n").toLowerCase()).toMatch(/usage|path/);
  });

  it("invalid pack: surfaces the failure with a non-zero code", async () => {
    // empty packDir → no pack.yaml
    const { runPackCommand } = await load();
    const code = await runPackCommand(["add", packDir], io());
    expect(code).toBe(1);
    expect(errs.join("\n").toLowerCase()).toMatch(/pack/);
  });

  it("add: a premium pack without --license-url is refused with a license hint", async () => {
    buildPremiumFixturePack();
    const { runPackCommand } = await load();
    const code = await runPackCommand(["add", packDir], io());
    expect(code).toBe(1);
    expect(errs.join("\n").toLowerCase()).toMatch(/license/);
  });

  it("list: marks an installed premium pack [premium]", async () => {
    buildPremiumFixturePack();
    // Redeem an entitled license into the store so the premium add succeeds
    // with no flag, then confirm the list mark.
    const { signEnvelope } = await import(
      "@/lib/licensing/__tests__/sign-helper"
    );
    const { saveLicense } = await import("@/lib/licensing/store");
    saveLicense(
      signEnvelope({
        schema: "orionfold.license/v1",
        license_id: "OF-RELAY-TEST-LIST",
        issued_to: { email: "naya@example.com" },
        issued_at: "2026-07-01T00:00:00Z",
        expires_at: "2099-01-01T00:00:00Z",
        entitlements: ["product:orionfold-relay"],
      })
    );
    const { runPackCommand } = await load();
    const addCode = await runPackCommand(["add", packDir], io());
    expect(addCode).toBe(0);
    logs = [];

    const code = await runPackCommand(["list"], io());
    expect(code).toBe(0);
    const premiumLine = logs.find((l) => l.includes("cli-premium"));
    expect(premiumLine).toBeDefined();
    expect(premiumLine).toContain("[premium]");
  });

  it("add: parses --license-url and threads it to the gate", async () => {
    buildPremiumFixturePack();
    // A structurally-valid but forged license → gate refuses, but the flag
    // must have been parsed (otherwise we'd get the 'missing license' hint).
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
    const { runPackCommand } = await load();
    const code = await runPackCommand(
      ["add", packDir, `--license-url=${licPath}`],
      io()
    );
    expect(code).toBe(1);
    // Forged-signature refusal, NOT the "re-run with --license-url" missing hint.
    expect(errs.join("\n").toLowerCase()).not.toMatch(/re-run with --license-url/);
    expect(errs.join("\n").toLowerCase()).toMatch(/license/);
  });
});
