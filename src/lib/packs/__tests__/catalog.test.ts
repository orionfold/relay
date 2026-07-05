import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import {
  listPackTemplates,
  resolvePackSource,
  UnknownPackNameError,
} from "../catalog";

// ── Fixture builders (mirrors pack-format.test.ts) ───────────────────

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-catalog-test-"));
}

const VALID_PACK_YAML = {
  id: "sample-pack",
  version: "0.1.0",
  name: "Sample Pack",
  description: "A sample pack for tests.",
  customers: ["acme-co"],
};

const VALID_MANIFEST = {
  id: "sample-pack",
  version: "0.1.0",
  name: "Sample Pack",
  profiles: [{ id: "sample-pack--agent" }],
  blueprints: [],
  tables: [{ id: "clients" }],
  schedules: [],
};

function writeTemplate(
  templatesDir: string,
  dirName: string,
  packYaml: Record<string, unknown> | string = VALID_PACK_YAML,
  manifest: Record<string, unknown> = VALID_MANIFEST
): string {
  const dir = path.join(templatesDir, dirName);
  fs.mkdirSync(path.join(dir, "base"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "pack.yaml"),
    typeof packYaml === "string" ? packYaml : yaml.dump(packYaml)
  );
  fs.writeFileSync(
    path.join(dir, "base", "manifest.yaml"),
    yaml.dump(manifest)
  );
  return dir;
}

describe("listPackTemplates", () => {
  let templatesDir: string;
  beforeEach(() => {
    templatesDir = makeTmp();
  });
  afterEach(() => {
    fs.rmSync(templatesDir, { recursive: true, force: true });
  });

  it("lists a valid template with meta + primitives summary", () => {
    writeTemplate(templatesDir, "sample-pack");
    const out = listPackTemplates({ templatesDir });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("sample-pack");
    expect(out[0].meta?.name).toBe("Sample Pack");
    expect(out[0].error).toBeUndefined();
    // buildPrimitivesSummary derives from the manifest's primitives
    expect(out[0].primitivesSummary?.toLowerCase()).toContain("agent");
    expect(out[0].primitivesSummary?.toLowerCase()).toContain("table");
  });

  it("lists a corrupt template with its reason instead of skipping it", () => {
    writeTemplate(templatesDir, "good-pack", {
      ...VALID_PACK_YAML,
      id: "good-pack",
    });
    writeTemplate(templatesDir, "broken-pack", "id: : : not yaml [");
    const out = listPackTemplates({ templatesDir });
    expect(out).toHaveLength(2);
    const broken = out.find((t) => t.id === "broken-pack");
    expect(broken).toBeDefined();
    expect(broken!.error).toBeTruthy();
    expect(broken!.meta).toBeUndefined();
    const good = out.find((t) => t.id === "good-pack");
    expect(good?.error).toBeUndefined();
  });

  it("carries premium fields through (entitlement, price, purchaseUrl)", () => {
    writeTemplate(templatesDir, "premium-pack", {
      ...VALID_PACK_YAML,
      id: "premium-pack",
      entitlement: "product:orionfold-relay",
      price: "$499/year",
      purchaseUrl: "https://orionfold.com/relay/pricing",
    });
    const out = listPackTemplates({ templatesDir });
    expect(out[0].meta?.entitlement).toBe("product:orionfold-relay");
    expect(out[0].meta?.price).toBe("$499/year");
    expect(out[0].meta?.purchaseUrl).toBe("https://orionfold.com/relay/pricing");
  });

  it("returns [] for a missing templates dir", () => {
    const out = listPackTemplates({
      templatesDir: path.join(templatesDir, "does-not-exist"),
    });
    expect(out).toEqual([]);
  });

  it("ignores stray files that are not template dirs", () => {
    writeTemplate(templatesDir, "sample-pack");
    fs.writeFileSync(path.join(templatesDir, "README.md"), "# not a pack\n");
    const out = listPackTemplates({ templatesDir });
    expect(out).toHaveLength(1);
  });

  it("finds the real bundled relay-agency template by default", () => {
    const out = listPackTemplates();
    const agency = out.find((t) => t.id === "relay-agency");
    expect(agency).toBeDefined();
    expect(agency!.error).toBeUndefined();
    expect(agency!.meta?.name).toBe("Relay Agency");
  });

  it("lists a BUNDLE template cleanly (empty derived manifest, no error)", () => {
    // A bundle pack has only pack.yaml + a `bundle` list, no base/manifest.yaml.
    // parsePack derives an empty placeholder manifest; buildPrimitivesSummary
    // must not throw on it, and the template must list without an error.
    const dir = path.join(templatesDir, "sample-bundle");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "pack.yaml"),
      yaml.dump({
        id: "sample-bundle",
        version: "0.1.0",
        name: "Sample Bundle",
        bundle: ["child-a", "child-b"],
      })
    );

    const out = listPackTemplates({ templatesDir });
    const bundle = out.find((t) => t.id === "sample-bundle");
    expect(bundle).toBeDefined();
    expect(bundle!.error).toBeUndefined();
    expect(bundle!.meta?.bundle).toEqual(["child-a", "child-b"]);
  });

  it("does NOT list the test-only bundle fixtures in the real catalog", () => {
    // relay-bundle-smoke / relay-crm-mini / relay-social-mini live under
    // __tests__/fixtures, never the shipped templates/ dir.
    const ids = listPackTemplates().map((t) => t.id);
    expect(ids).not.toContain("relay-bundle-smoke");
    expect(ids).not.toContain("relay-crm-mini");
    expect(ids).not.toContain("relay-social-mini");
  });
});

describe("resolvePackSource", () => {
  let templatesDir: string;
  beforeEach(() => {
    templatesDir = makeTmp();
  });
  afterEach(() => {
    fs.rmSync(templatesDir, { recursive: true, force: true });
  });

  it("resolves a bare name to the bundled template dir", () => {
    const dir = writeTemplate(templatesDir, "sample-pack");
    const resolved = resolvePackSource("sample-pack", { templatesDir });
    expect(resolved).toBe(dir);
  });

  it("lets an existing local path win over a same-named template", () => {
    writeTemplate(templatesDir, "sample-pack");
    // A real local dir whose basename collides with the template id.
    const localDir = path.join(templatesDir, "cwd", "sample-pack");
    fs.mkdirSync(localDir, { recursive: true });
    const resolved = resolvePackSource(localDir, { templatesDir });
    expect(resolved).toBe(localDir);
  });

  it("throws UnknownPackNameError naming available ids for an unknown bare name", () => {
    writeTemplate(templatesDir, "sample-pack");
    expect(() => resolvePackSource("nope", { templatesDir })).toThrow(
      UnknownPackNameError
    );
    expect(() => resolvePackSource("nope", { templatesDir })).toThrow(
      /sample-pack/
    );
  });

  it("passes through git URLs and non-bare paths untouched", () => {
    expect(
      resolvePackSource("https://example.com/repo.git", { templatesDir })
    ).toBe("https://example.com/repo.git");
    expect(resolvePackSource("./missing/dir", { templatesDir })).toBe(
      "./missing/dir"
    );
  });
});
