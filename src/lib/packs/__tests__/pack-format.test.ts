import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import {
  PackManifestSchema,
  parsePack,
  resolvePackLayer,
  PackValidationError,
  type Pack,
  type ResolvedPackFile,
} from "../format";

// ── Fixture builders ─────────────────────────────────────────────────

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-format-test-"));
}

interface FixtureOptions {
  packYaml?: Record<string, unknown>;
  manifest?: Record<string, unknown>;
  /** files relative to base/ — e.g. { "profiles/my-pack--x/profile.yaml": "..." } */
  baseFiles?: Record<string, string>;
  /** files relative to overrides/ */
  overrideFiles?: Record<string, string>;
  /** if provided, written verbatim as base/manifest.yaml instead of dumping `manifest` */
  rawManifestText?: string;
}

const VALID_PACK_YAML = {
  id: "sample-pack",
  version: "0.1.0",
  name: "Sample Pack",
  author: "Orionfold",
  description: "A sample pack for tests.",
  relayCore: ">=0.15.0",
  customers: ["acme-co", "globex"],
};

const VALID_MANIFEST = {
  id: "sample-pack",
  version: "0.1.0",
  name: "Sample Pack",
  description: "A sample pack for tests.",
  profiles: [],
  blueprints: [],
  tables: [],
  schedules: [],
};

function writeFixture(dir: string, opts: FixtureOptions = {}): void {
  const packYaml = opts.packYaml ?? VALID_PACK_YAML;
  fs.writeFileSync(path.join(dir, "pack.yaml"), yaml.dump(packYaml));

  const baseDir = path.join(dir, "base");
  fs.mkdirSync(baseDir, { recursive: true });
  if (opts.rawManifestText !== undefined) {
    fs.writeFileSync(path.join(baseDir, "manifest.yaml"), opts.rawManifestText);
  } else {
    fs.writeFileSync(
      path.join(baseDir, "manifest.yaml"),
      yaml.dump(opts.manifest ?? VALID_MANIFEST)
    );
  }

  for (const [rel, content] of Object.entries(opts.baseFiles ?? {})) {
    const full = path.join(baseDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  for (const [rel, content] of Object.entries(opts.overrideFiles ?? {})) {
    const full = path.join(dir, "overrides", rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

// ── PackManifestSchema ───────────────────────────────────────────────

describe("PackManifestSchema", () => {
  it("accepts a well-formed pack.yaml", () => {
    const result = PackManifestSchema.safeParse(VALID_PACK_YAML);
    expect(result.success).toBe(true);
  });

  it("defaults customers to an empty array when omitted", () => {
    const { customers: _omit, ...rest } = VALID_PACK_YAML;
    const result = PackManifestSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.customers).toEqual([]);
  });

  it("rejects a pack.yaml missing the id", () => {
    const { id: _omit, ...rest } = VALID_PACK_YAML;
    const result = PackManifestSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects a non-string customers entry", () => {
    const result = PackManifestSchema.safeParse({
      ...VALID_PACK_YAML,
      customers: [{ slug: "acme" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an optional entitlement string (premium pack)", () => {
    const result = PackManifestSchema.safeParse({
      ...VALID_PACK_YAML,
      entitlement: "product:orionfold-relay",
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.entitlement).toBe("product:orionfold-relay");
  });

  it("leaves entitlement undefined when omitted (free pack)", () => {
    const result = PackManifestSchema.safeParse(VALID_PACK_YAML);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.entitlement).toBeUndefined();
  });

  it("rejects a non-string entitlement", () => {
    const result = PackManifestSchema.safeParse({
      ...VALID_PACK_YAML,
      entitlement: ["product:orionfold-relay"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional price + purchaseUrl (premium display copy, D6)", () => {
    const result = PackManifestSchema.safeParse({
      ...VALID_PACK_YAML,
      entitlement: "product:orionfold-relay",
      price: "$499/year",
      purchaseUrl: "https://orionfold.com/relay/pricing",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBe("$499/year");
      expect(result.data.purchaseUrl).toBe("https://orionfold.com/relay/pricing");
    }
  });

  it("leaves price and purchaseUrl undefined when omitted", () => {
    const result = PackManifestSchema.safeParse(VALID_PACK_YAML);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.price).toBeUndefined();
      expect(result.data.purchaseUrl).toBeUndefined();
    }
  });

  it("rejects a purchaseUrl that is not a valid URL", () => {
    const result = PackManifestSchema.safeParse({
      ...VALID_PACK_YAML,
      purchaseUrl: "not a url",
    });
    expect(result.success).toBe(false);
  });
});

// ── parsePack ────────────────────────────────────────────────────────

describe("parsePack", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmp();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("parses a valid pack into a typed Pack", () => {
    writeFixture(dir);
    const pack = parsePack(dir);
    expect(pack.meta.id).toBe("sample-pack");
    expect(pack.meta.customers).toEqual(["acme-co", "globex"]);
    expect(pack.manifest.name).toBe("Sample Pack");
    expect(pack.rootDir).toBe(dir);
  });

  it("throws PackValidationError when pack.yaml is missing", () => {
    fs.mkdirSync(path.join(dir, "base"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "base", "manifest.yaml"),
      yaml.dump(VALID_MANIFEST)
    );
    expect(() => parsePack(dir)).toThrow(PackValidationError);
  });

  it("throws PackValidationError when base/manifest.yaml is missing", () => {
    fs.writeFileSync(path.join(dir, "pack.yaml"), yaml.dump(VALID_PACK_YAML));
    expect(() => parsePack(dir)).toThrow(PackValidationError);
  });

  it("throws PackValidationError when pack.yaml fails schema validation", () => {
    writeFixture(dir, { packYaml: { name: "no id here" } });
    expect(() => parsePack(dir)).toThrow(PackValidationError);
  });

  it("throws PackValidationError when the manifest violates the strict AppManifestSchema", () => {
    // `view` is the one .strict() island — an unknown key under view fails.
    writeFixture(dir, {
      manifest: {
        ...VALID_MANIFEST,
        view: { kit: "tracker", bogusKey: true },
      },
    });
    expect(() => parsePack(dir)).toThrow(PackValidationError);
  });

  it("throws PackValidationError on malformed YAML", () => {
    writeFixture(dir, { rawManifestText: "id: : : not yaml [" });
    expect(() => parsePack(dir)).toThrow(PackValidationError);
  });
});

// ── resolvePackLayer ─────────────────────────────────────────────────

describe("resolvePackLayer", () => {
  let dir: string;
  beforeEach(() => {
    dir = makeTmp();
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns base files when overrides/ is empty (near-identity in v1)", () => {
    writeFixture(dir, {
      baseFiles: {
        "profiles/sample-pack--agent/profile.yaml": "id: sample-pack--agent\n",
        "profiles/sample-pack--agent/SKILL.md": "# Agent\nbase\n",
        "blueprints/sample-pack--flow.yaml": "id: sample-pack--flow\n",
      },
    });
    const pack = parsePack(dir);
    const resolved = resolvePackLayer(pack);
    const rel = resolved.files.map((f: ResolvedPackFile) => f.relPath).sort();
    expect(rel).toContain("profiles/sample-pack--agent/profile.yaml");
    expect(rel).toContain("blueprints/sample-pack--flow.yaml");
    // all resolved from base when no overrides
    for (const f of resolved.files) expect(f.layer).toBe("base");
  });

  it("shadows a base file with the overrides/ file of the same relPath", () => {
    writeFixture(dir, {
      baseFiles: {
        "profiles/sample-pack--agent/SKILL.md": "# base version\n",
      },
      overrideFiles: {
        "profiles/sample-pack--agent/SKILL.md": "# override version\n",
      },
    });
    const pack = parsePack(dir);
    const resolved = resolvePackLayer(pack);
    const match = resolved.files.find(
      (f: ResolvedPackFile) => f.relPath === "profiles/sample-pack--agent/SKILL.md"
    );
    expect(match).toBeDefined();
    expect(match!.layer).toBe("override");
    expect(fs.readFileSync(match!.absPath, "utf-8")).toBe("# override version\n");
    // a base file shadowed by an override must not appear twice
    const dupes = resolved.files.filter(
      (f: ResolvedPackFile) => f.relPath === "profiles/sample-pack--agent/SKILL.md"
    );
    expect(dupes).toHaveLength(1);
  });

  it("includes override-only files that have no base counterpart", () => {
    writeFixture(dir, {
      overrideFiles: {
        "blueprints/sample-pack--extra.yaml": "id: sample-pack--extra\n",
      },
    });
    const pack: Pack = parsePack(dir);
    const resolved = resolvePackLayer(pack);
    const match = resolved.files.find(
      (f: ResolvedPackFile) => f.relPath === "blueprints/sample-pack--extra.yaml"
    );
    expect(match).toBeDefined();
    expect(match!.layer).toBe("override");
  });
});
