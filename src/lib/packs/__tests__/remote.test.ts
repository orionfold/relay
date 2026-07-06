// @vitest-environment node
import { createHash } from "crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import * as tar from "tar";
import { afterEach, describe, expect, it } from "vitest";
import {
  RemotePackFetchError,
  packIndexUrl,
  packArtifactUrl,
  fetchPackIndex,
  fetchPackDir,
} from "../remote";
import type { PackIndexEntry } from "../index-schema";

// R2 — the remote pack resolver's fetch half. These tests exercise the two
// egress helpers against a file:// fixture base (the prebuilt-download.ts
// pattern): the index GET + parse, and the sha-verified per-pack .tgz fetch +
// extract into a temp dir that acquirePack can then read. Every failure mode
// (miss, sha mismatch, community-repo-via-tgz misuse) throws a named error.

const cleanups: Array<() => void> = [];
function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** Build a file:// "canonical tree": an index.json + one pack .tgz + .sha256. */
async function makeCanonicalTree() {
  const base = tempDir("relay-pack-remote-base-");

  // A minimal valid pack dir staged under stage/, tarred to <path>.tgz.
  const stage = join(base, "stage");
  mkdirSync(join(stage, "base"), { recursive: true });
  writeFileSync(
    join(stage, "pack.yaml"),
    "id: relay-remote-demo\nname: Remote Demo\nversion: 1.0.0\n",
  );
  writeFileSync(
    join(stage, "base", "manifest.yaml"),
    "name: Remote Demo\ntables: []\nprofiles: []\nblueprints: []\n",
  );

  const artifactDir = join(base, "packs", "official");
  mkdirSync(artifactDir, { recursive: true });
  const tgzPath = join(artifactDir, "relay-remote-demo.tgz");
  await tar.create({ gzip: true, file: tgzPath, cwd: stage }, ["pack.yaml", "base"]);
  const sha = createHash("sha256").update(readFileSync(tgzPath)).digest("hex");

  const entry: PackIndexEntry = {
    id: "relay-remote-demo",
    tier: "official",
    version: "1.0.0",
    path: "packs/official/relay-remote-demo",
    sha,
  };
  const index = { schema: "orionfold.packs/v1", packs: [entry] };
  writeFileSync(join(base, "index.json"), JSON.stringify(index));

  // file:// base URL, no trailing slash — matches how an https base would read.
  const baseUrl = pathToFileURL(base).href;
  return { base, baseUrl, entry, sha, tgzPath };
}

describe("URL builders honor the override base", () => {
  it("packIndexUrl joins base + index.json", () => {
    expect(packIndexUrl({ baseUrl: "https://x.test/relay/packs" })).toBe(
      "https://x.test/relay/packs/index.json",
    );
  });

  it("packArtifactUrl joins base + <path>.tgz", () => {
    const entry = {
      id: "relay-crm",
      tier: "official",
      version: "1.0.0",
      path: "packs/official/relay-crm",
    } as PackIndexEntry;
    expect(packArtifactUrl(entry, { baseUrl: "https://x.test/relay/packs" })).toBe(
      "https://x.test/relay/packs/packs/official/relay-crm.tgz",
    );
  });
});

describe("fetchPackIndex", () => {
  it("fetches + parses the canonical index from a file:// base", async () => {
    const { baseUrl } = await makeCanonicalTree();
    const index = await fetchPackIndex({ baseUrl });
    expect(index.schema).toBe("orionfold.packs/v1");
    expect(index.packs.map((p) => p.id)).toContain("relay-remote-demo");
  });

  it("throws a named error when the index is absent", async () => {
    const missing = pathToFileURL(tempDir("relay-empty-")).href;
    await expect(fetchPackIndex({ baseUrl: missing })).rejects.toThrow(
      RemotePackFetchError,
    );
  });
});

describe("fetchPackDir", () => {
  it("fetches + sha-verifies + extracts a hosted pack into a temp dir", async () => {
    const { baseUrl, entry } = await makeCanonicalTree();
    const { dir, cleanup } = await fetchPackDir(entry, { baseUrl });
    cleanups.push(cleanup);
    expect(existsSync(join(dir, "pack.yaml"))).toBe(true);
    expect(existsSync(join(dir, "base", "manifest.yaml"))).toBe(true);
    expect(readFileSync(join(dir, "pack.yaml"), "utf-8")).toContain("relay-remote-demo");
  });

  it("rejects loudly when the fetched .tgz hash != entry.sha", async () => {
    const { baseUrl, entry } = await makeCanonicalTree();
    const tampered = { ...entry, sha: "0".repeat(64) };
    await expect(fetchPackDir(tampered, { baseUrl })).rejects.toThrow(
      /hash|checksum|sha/i,
    );
  });

  it("throws when a hosted entry has no path", async () => {
    const { baseUrl } = await makeCanonicalTree();
    const noPath = {
      id: "x",
      tier: "official",
      version: "1.0.0",
      repo: "github.com/x/y",
    } as PackIndexEntry;
    await expect(fetchPackDir(noPath, { baseUrl })).rejects.toThrow(RemotePackFetchError);
  });

  it("throws a named error when the artifact is absent", async () => {
    const { baseUrl, entry } = await makeCanonicalTree();
    const gone = { ...entry, path: "packs/official/does-not-exist" };
    await expect(fetchPackDir(gone, { baseUrl })).rejects.toThrow(RemotePackFetchError);
  });
});
