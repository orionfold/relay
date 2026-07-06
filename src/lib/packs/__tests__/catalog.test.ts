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

// ── resolvePackSourceAsync — the R2 remote-resolution branch ─────────────

describe("resolvePackSourceAsync", () => {
  let templatesDir: string;
  let indexBase: string;
  let indexBaseUrl: string;

  beforeEach(async () => {
    templatesDir = makeTmp();
    indexBase = makeTmp();
  });
  afterEach(() => {
    fs.rmSync(templatesDir, { recursive: true, force: true });
    fs.rmSync(indexBase, { recursive: true, force: true });
  });

  /** Stage a file:// canonical tree: index.json + one sha-verified pack .tgz. */
  async function stageRemotePack(id: string): Promise<string> {
    const { pathToFileURL } = await import("node:url");
    const { createHash } = await import("node:crypto");
    const tar = await import("tar");

    const stage = path.join(indexBase, "stage");
    fs.mkdirSync(path.join(stage, "base"), { recursive: true });
    fs.writeFileSync(
      path.join(stage, "pack.yaml"),
      yaml.dump({ id, version: "1.0.0", name: id })
    );
    fs.writeFileSync(
      path.join(stage, "base", "manifest.yaml"),
      yaml.dump({ id, version: "1.0.0", name: id, profiles: [], blueprints: [], tables: [], schedules: [] })
    );
    const artDir = path.join(indexBase, "packs", "official");
    fs.mkdirSync(artDir, { recursive: true });
    const tgz = path.join(artDir, `${id}.tgz`);
    await tar.create({ gzip: true, file: tgz, cwd: stage }, ["pack.yaml", "base"]);
    const sha = createHash("sha256").update(fs.readFileSync(tgz)).digest("hex");
    fs.writeFileSync(
      path.join(indexBase, "index.json"),
      JSON.stringify({
        schema: "orionfold.packs/v1",
        packs: [{ id, tier: "official", version: "1.0.0", path: `packs/official/${id}`, sha }],
      })
    );
    indexBaseUrl = pathToFileURL(indexBase).href;
    return sha;
  }

  it("resolves a bundled name with ZERO network (local-first, no index consulted)", async () => {
    const { resolvePackSourceAsync } = await import("../catalog");
    const dir = writeTemplate(templatesDir, "sample-pack");
    // Point the index base at a dir with NO index.json — if it were consulted,
    // the fetch would throw. It resolves locally, so it must not be.
    const { dir: resolved, entry } = await resolvePackSourceAsync("sample-pack", {
      templatesDir,
      baseUrl: indexBaseUrl,
    });
    expect(resolved).toBe(dir);
    expect(entry).toBeUndefined();
  });

  it("delegates a local path and a git URL to the sync resolver", async () => {
    const { resolvePackSourceAsync } = await import("../catalog");
    const git = await resolvePackSourceAsync("https://example.com/repo.git", {
      templatesDir,
    });
    expect(git.dir).toBe("https://example.com/repo.git");
    expect(git.entry).toBeUndefined();
  });

  it("consults the index and fetches a non-bundled pack into a temp dir", async () => {
    await stageRemotePack("relay-remote-demo");
    const { resolvePackSourceAsync } = await import("../catalog");
    const { dir, cleanup, entry } = await resolvePackSourceAsync("relay-remote-demo", {
      templatesDir,
      baseUrl: indexBaseUrl,
    });
    try {
      expect(fs.existsSync(path.join(dir, "pack.yaml"))).toBe(true);
      expect(entry?.id).toBe("relay-remote-demo");
      expect(entry?.tier).toBe("official");
    } finally {
      cleanup?.();
    }
  });

  it("rethrows the helpful UnknownPackNameError when the name is absent from the index", async () => {
    await stageRemotePack("relay-remote-demo");
    writeTemplate(templatesDir, "sample-pack");
    const { resolvePackSourceAsync, UnknownPackNameError } = await import("../catalog");
    await expect(
      resolvePackSourceAsync("no-such-pack", { templatesDir, baseUrl: indexBaseUrl })
    ).rejects.toThrow(UnknownPackNameError);
    await expect(
      resolvePackSourceAsync("no-such-pack", { templatesDir, baseUrl: indexBaseUrl })
    ).rejects.toThrow(/sample-pack/);
  });

  it("fails OPEN to the helpful error when the index itself is unreachable", async () => {
    // indexBase has no index.json — the fetch throws; a never-bundled name
    // must still surface UnknownPackNameError, not a raw network error.
    const { pathToFileURL } = await import("node:url");
    writeTemplate(templatesDir, "sample-pack");
    const { resolvePackSourceAsync, UnknownPackNameError } = await import("../catalog");
    await expect(
      resolvePackSourceAsync("no-such-pack", {
        templatesDir,
        baseUrl: pathToFileURL(indexBase).href,
      })
    ).rejects.toThrow(UnknownPackNameError);
  });

  it("hands a community repo entry to git-clone as a URL", async () => {
    const { pathToFileURL } = await import("node:url");
    fs.writeFileSync(
      path.join(indexBase, "index.json"),
      JSON.stringify({
        schema: "orionfold.packs/v1",
        packs: [{ id: "janes-pack", tier: "community", version: "0.1.0", repo: "github.com/jane/janes-pack", sig: null }],
      })
    );
    const { resolvePackSourceAsync } = await import("../catalog");
    const { dir, entry } = await resolvePackSourceAsync("janes-pack", {
      templatesDir,
      baseUrl: pathToFileURL(indexBase).href,
    });
    expect(dir).toBe("https://github.com/jane/janes-pack");
    expect(entry?.tier).toBe("community");
  });
});
