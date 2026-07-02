import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runLicenseCommand } from "../cli";
import { signEnvelope } from "./sign-helper";

const NOW = new Date("2026-08-01T00:00:00Z");

function makePayload(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    schema: "orionfold.license/v1",
    license_id: "OF-RELAY-TEST-1001",
    product: "orionfold-relay",
    tier: "relay",
    issued_to: { email: "naya@example.com", name: "Naya Patel" },
    issued_at: "2026-07-01T00:00:00Z",
    not_before: "2026-07-01T00:00:00Z",
    expires_at: "2027-07-01T00:00:00Z",
    seats: 1,
    entitlements: ["product:orionfold-relay"],
    ...overrides,
  };
}

let dir: string;
let scratch: string;
let appsDir: string;
let templatesDir: string;
let logs: string[];
let errs: string[];

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-license-cli-"));
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "relay-license-cli-src-"));
  appsDir = path.join(scratch, "apps");
  templatesDir = path.join(scratch, "templates");
  fs.mkdirSync(appsDir, { recursive: true });
  fs.mkdirSync(templatesDir, { recursive: true });
  logs = [];
  errs = [];
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(scratch, { recursive: true, force: true });
});

function io() {
  return {
    dir,
    now: NOW,
    appsDir,
    templatesDir,
    log: (m: string) => logs.push(m),
    error: (m: string) => errs.push(m),
  };
}

/** Bundled-template + installed-pack fixture for the recap surface. */
function installEntitledPack(opts: { installed: string; available: string }) {
  const id = "pro-pack";
  const tplDir = path.join(templatesDir, id);
  fs.mkdirSync(path.join(tplDir, "base"), { recursive: true });
  fs.writeFileSync(
    path.join(tplDir, "pack.yaml"),
    yaml.dump({
      id,
      version: opts.available,
      name: "Pro Pack",
      entitlement: "product:orionfold-relay",
      purchaseUrl: "https://example.com/buy",
      changelog: {
        "0.1.0": "The first six chapters.",
        "0.2.0": "The nonprofit deep chapter.",
      },
    })
  );
  fs.writeFileSync(
    path.join(tplDir, "base", "manifest.yaml"),
    yaml.dump({ id, name: "Pro Pack" })
  );
  fs.mkdirSync(path.join(appsDir, id), { recursive: true });
  fs.writeFileSync(
    path.join(appsDir, id, "install-state.json"),
    JSON.stringify({
      packVersion: opts.installed,
      installedAt: "2026-07-01T00:00:00Z",
      files: {},
    })
  );
}

function writeLicenseFile(
  payload: Record<string, unknown>,
  name = "test.license.json"
): string {
  const file = path.join(scratch, name);
  fs.writeFileSync(file, JSON.stringify(signEnvelope(payload), null, 2));
  return file;
}

describe("license add", () => {
  it("verifies, persists, and prints the activation ceremony", async () => {
    const file = writeLicenseFile(makePayload());

    const code = await runLicenseCommand(["add", file], io());

    expect(code).toBe(0);
    const out = logs.join("\n");
    // Ceremony anatomy: identity, ID, what unlocked, where it lives, D4 promise.
    expect(out).toContain("Naya Patel");
    expect(out).toContain("OF-RELAY-TEST-1001");
    expect(out).toContain("product:orionfold-relay");
    expect(out).toContain(
      path.join(dir, "OF-RELAY-TEST-1001.license.json")
    );
    expect(out).toContain("Your packs are yours forever.");
    // Persisted for real.
    expect(
      fs.existsSync(path.join(dir, "OF-RELAY-TEST-1001.license.json"))
    ).toBe(true);
  });

  it("fails with a named error for a tampered license (exit 1, nothing stored)", async () => {
    const doc = signEnvelope(makePayload());
    (doc.payload as Record<string, unknown>).seats = 99;
    const file = path.join(scratch, "tampered.license.json");
    fs.writeFileSync(file, JSON.stringify(doc));

    const code = await runLicenseCommand(["add", file], io());

    expect(code).toBe(1);
    expect(errs.join("\n")).toMatch(/signature/i);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("requires a path or url argument", async () => {
    const code = await runLicenseCommand(["add"], io());
    expect(code).toBe(1);
    expect(errs.join("\n")).toMatch(/usage/i);
  });
});

describe("license status", () => {
  it("points at license add when the store is empty (exit 0)", async () => {
    const code = await runLicenseCommand(["status"], io());
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/relay license add/);
  });

  it("shows identity, term, seats, entitlements and validity", async () => {
    await runLicenseCommand(["add", writeLicenseFile(makePayload())], io());
    logs = [];

    const code = await runLicenseCommand(["status"], io());

    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).toContain("OF-RELAY-TEST-1001");
    expect(out).toContain("Naya Patel");
    expect(out).toContain("product:orionfold-relay");
    expect(out).toMatch(/valid/i);
    expect(out).toMatch(/seats?:?\s*1/i);
  });

  it("warns (never blocks) when expiry is within 30 days", async () => {
    // Expires 10 days after the injected clock.
    await runLicenseCommand(
      ["add", writeLicenseFile(makePayload({ expires_at: "2026-08-11T00:00:00Z" }))],
      io()
    );
    logs = [];

    const code = await runLicenseCommand(["status"], io());

    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).toMatch(/expires in 10 days/i);
    expect(out).toMatch(/installed packs (are yours|stay)/i);
  });

  it("recaps pending value with the one-command cure when an entitled pack has an update", async () => {
    installEntitledPack({ installed: "0.1.0", available: "0.2.0" });
    await runLicenseCommand(["add", writeLicenseFile(makePayload())], io());
    logs = [];

    const code = await runLicenseCommand(["status"], io());

    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).toMatch(/included in your term/i);
    expect(out).toContain("v0.2.0 — The nonprofit deep chapter.");
    expect(out).toContain("relay pack update pro-pack");
  });

  it("prints no recap when the entitled pack is current (empty diff = silence)", async () => {
    installEntitledPack({ installed: "0.2.0", available: "0.2.0" });
    await runLicenseCommand(["add", writeLicenseFile(makePayload())], io());
    logs = [];

    const code = await runLicenseCommand(["status"], io());

    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).not.toMatch(/included in your term/i);
    expect(out).not.toContain("pack update");
  });

  it("names the year's delivered value inside the ≤30-day renewal warning", async () => {
    installEntitledPack({ installed: "0.1.0", available: "0.2.0" });
    await runLicenseCommand(
      ["add", writeLicenseFile(makePayload({ expires_at: "2026-08-11T00:00:00Z" }))],
      io()
    );
    logs = [];

    const code = await runLicenseCommand(["status"], io());

    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).toMatch(/expires in 10 days/i);
    // The generic D4 sentence gains specific evidence.
    expect(out).toMatch(/this (license )?year delivered/i);
    expect(out).toContain("v0.2.0 — The nonprofit deep chapter.");
  });

  it("recaps an EXPIRED license renewal-voiced: packs keep working, renewal unlocks the named update", async () => {
    installEntitledPack({ installed: "0.1.0", available: "0.2.0" });
    // Expired a month before the injected clock; add with a pre-expiry clock.
    const file = writeLicenseFile(
      makePayload({ expires_at: "2026-07-15T00:00:00Z" })
    );
    await runLicenseCommand(["add", file], {
      ...io(),
      now: new Date("2026-07-02T00:00:00Z"),
    });
    logs = [];

    const code = await runLicenseCommand(["status"], io());

    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).toMatch(/expired/i);
    // D4 voice: never a threat, always what renewal buys.
    expect(out).toMatch(/keeps? working|yours forever/i);
    expect(out).toContain("v0.2.0 — The nonprofit deep chapter.");
    expect(out).toMatch(/renew/i);
  });

  it("names an invalid store entry instead of crashing (exit 0)", async () => {
    fs.writeFileSync(path.join(dir, "JUNK.license.json"), "{broken");

    const code = await runLicenseCommand(["status"], io());

    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).toMatch(/JUNK/);
    expect(out).toMatch(/invalid|corrupt/i);
  });
});

describe("license remove", () => {
  it("removes a persisted license and states that packs stay installed (D4)", async () => {
    await runLicenseCommand(["add", writeLicenseFile(makePayload())], io());
    logs = [];

    const code = await runLicenseCommand(
      ["remove", "OF-RELAY-TEST-1001"],
      io()
    );

    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).toMatch(/removed/i);
    expect(out).toMatch(/packs.*(stay|remain) installed/i);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("reports an unknown id without failing the process", async () => {
    const code = await runLicenseCommand(["remove", "OF-RELAY-NOPE"], io());
    expect(code).toBe(0);
    expect(logs.join("\n")).toMatch(/not found/i);
  });

  it("requires an id argument", async () => {
    const code = await runLicenseCommand(["remove"], io());
    expect(code).toBe(1);
    expect(errs.join("\n")).toMatch(/usage/i);
  });
});

describe("unknown action", () => {
  it("prints usage and exits 1", async () => {
    const code = await runLicenseCommand(["frobnicate"], io());
    expect(code).toBe(1);
    expect(errs.join("\n")).toMatch(/usage/i);
  });
});
