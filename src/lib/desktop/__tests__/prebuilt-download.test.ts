// @vitest-environment node
import { createHash } from "crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, utimesSync, readdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import * as tar from "tar";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PrebuiltDownloadError,
  artifactCachePaths,
  buildArtifactUrl,
  downloadToFile,
  ensurePrebuilt,
  extractPrebuilt,
  isPrebuiltCurrent,
  parseSha256File,
  pruneBuildCache,
  sha256OfFile,
} from "../prebuilt-download";

const cleanups: Array<() => void | Promise<void>> = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  while (cleanups.length) {
    await cleanups.pop()!();
  }
});

/** Build a minimal valid artifact: a .tgz containing .next/BUILD_ID (+ sha file). */
async function makeArtifact(
  dir: string,
  version = "9.9.9",
  buildId = "test-build-id",
) {
  const stage = join(dir, `stage-${version}`);
  mkdirSync(join(stage, ".next", "server"), { recursive: true });
  writeFileSync(join(stage, ".next", "BUILD_ID"), buildId);
  writeFileSync(join(stage, ".next", "server", "app.js"), "// server bits");
  const tgzPath = join(dir, `relay-next-build-${version}.tgz`);
  await tar.create({ gzip: true, file: tgzPath, cwd: stage }, [".next"]);
  const sha = createHash("sha256").update(readFileSync(tgzPath)).digest("hex");
  const shaPath = `${tgzPath}.sha256`;
  writeFileSync(shaPath, `${sha}  relay-next-build-${version}.tgz\n`);
  return { tgzPath, shaPath, sha };
}

describe("buildArtifactUrl", () => {
  it("points at the versioned GitHub release asset by default", () => {
    expect(buildArtifactUrl("0.16.0")).toBe(
      "https://github.com/orionfold/relay/releases/download/v0.16.0/relay-next-build-0.16.0.tgz",
    );
  });

  it("returns the override verbatim when RELAY_BUILD_ARTIFACT_URL is set", () => {
    expect(buildArtifactUrl("0.16.0", "file:///tmp/x.tgz")).toBe("file:///tmp/x.tgz");
  });

  it("ignores a blank override", () => {
    expect(buildArtifactUrl("0.16.0", "  ")).toContain("github.com");
  });
});

describe("artifactCachePaths", () => {
  it("keys the cache file by version inside the builds dir", () => {
    const { tgz, sha } = artifactCachePaths("/data/builds", "0.16.0");
    expect(tgz).toBe(join("/data/builds", "relay-next-build-0.16.0.tgz"));
    expect(sha).toBe(join("/data/builds", "relay-next-build-0.16.0.tgz.sha256"));
  });
});

describe("parseSha256File", () => {
  it("extracts the hex digest from `shasum -a 256` output", () => {
    const digest = "a".repeat(64);
    expect(parseSha256File(`${digest}  relay-next-build-0.16.0.tgz\n`)).toBe(digest);
  });

  it("accepts a bare digest", () => {
    const digest = "b".repeat(64);
    expect(parseSha256File(`${digest}\n`)).toBe(digest);
  });

  it("throws a named error when no digest is present", () => {
    expect(() => parseSha256File("not a checksum")).toThrow(PrebuiltDownloadError);
    try {
      parseSha256File("not a checksum");
    } catch (e) {
      expect((e as Error).name).toBe("PrebuiltDownloadError");
    }
  });
});

describe("sha256OfFile", () => {
  it("hashes file contents", async () => {
    const dir = tempDir("relay-sha-");
    const filePath = join(dir, "f.bin");
    writeFileSync(filePath, "hello");
    const expected = createHash("sha256").update("hello").digest("hex");
    await expect(sha256OfFile(filePath)).resolves.toBe(expected);
  });
});

describe("downloadToFile", () => {
  it("rejects an invalid artifact URL before writing", async () => {
    const dir = tempDir("relay-dl-");
    await expect(
      downloadToFile("not a url", join(dir, "dest.tgz")),
    ).rejects.toThrow(/Invalid artifact URL/);
  });

  it("copies file:// URLs", async () => {
    const dir = tempDir("relay-dl-");
    const src = join(dir, "src.tgz");
    writeFileSync(src, "artifact-bytes");
    const dest = join(dir, "dest.tgz");
    await downloadToFile(pathToFileURL(src).href, dest);
    expect(readFileSync(dest, "utf-8")).toBe("artifact-bytes");
  });

  it("throws a named error for a missing file:// source", async () => {
    const dir = tempDir("relay-dl-");
    await expect(
      downloadToFile(pathToFileURL(join(dir, "nope.tgz")).href, join(dir, "dest.tgz")),
    ).rejects.toThrow(PrebuiltDownloadError);
  });

  it("downloads over http and fails loudly on non-200", async () => {
    const dir = tempDir("relay-http-");
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith("/ok.tgz")) {
        return new Response("http-bytes", { status: 200 });
      }
      return new Response("not found", {
        status: 404,
        statusText: "Not Found",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const dest = join(dir, "dest.tgz");
    await downloadToFile("https://artifacts.example/ok.tgz", dest);
    expect(readFileSync(dest, "utf-8")).toBe("http-bytes");

    await expect(
      downloadToFile(
        "https://artifacts.example/missing.tgz",
        join(dir, "d2.tgz")
      ),
    ).rejects.toThrow(PrebuiltDownloadError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [new Error("offline"), "offline"],
    ["offline-string", "offline-string"],
  ])("names network failures without assuming an Error object", async (cause, detail) => {
    const dir = tempDir("relay-http-");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw cause;
    }));

    await expect(
      downloadToFile("https://artifacts.example/fail.tgz", join(dir, "dest.tgz")),
    ).rejects.toThrow(detail);
  });
});

describe("extractPrebuilt", () => {
  it("wraps invalid tar archives in a named extraction error", async () => {
    const dir = tempDir("relay-extract-");
    const tgzPath = join(dir, "invalid.tgz");
    const dest = join(dir, "app");
    writeFileSync(tgzPath, "not a tar archive");
    mkdirSync(dest, { recursive: true });

    await expect(extractPrebuilt(tgzPath, dest)).rejects.toThrow(
      /Failed extracting invalid\.tgz/,
    );
  });

  it("extracts .next and finds BUILD_ID", async () => {
    const dir = tempDir("relay-extract-");
    const { tgzPath } = await makeArtifact(dir);
    const dest = join(dir, "app");
    mkdirSync(dest, { recursive: true });
    await extractPrebuilt(tgzPath, dest);
    expect(readFileSync(join(dest, ".next", "BUILD_ID"), "utf-8")).toBe("test-build-id");
  });

  it("throws a named error when the archive has no BUILD_ID", async () => {
    const dir = tempDir("relay-extract-");
    const stage = join(dir, "stage");
    mkdirSync(join(stage, ".next"), { recursive: true });
    writeFileSync(join(stage, ".next", "junk.txt"), "no build id here");
    const tgzPath = join(dir, "bad.tgz");
    await tar.create({ gzip: true, file: tgzPath, cwd: stage }, [".next"]);
    const dest = join(dir, "app");
    mkdirSync(dest, { recursive: true });
    await expect(extractPrebuilt(tgzPath, dest)).rejects.toThrow(PrebuiltDownloadError);
  });

  it("recreates .next/node_modules links for external packages from the manifest", async () => {
    const dir = tempDir("relay-links-");
    // Artifact carries a manifest instead of raw symlinks (Windows can't
    // extract symlink tar entries without privileges).
    const stage = join(dir, "stage");
    mkdirSync(join(stage, ".next"), { recursive: true });
    writeFileSync(join(stage, ".next", "BUILD_ID"), "test-build-id");
    writeFileSync(
      join(stage, ".next", "relay-external-packages.json"),
      JSON.stringify({ version: 1, links: { "fake-pkg-abc123": "fake-pkg" } }),
    );
    const tgzPath = join(dir, "artifact.tgz");
    await tar.create({ gzip: true, file: tgzPath, cwd: stage }, [".next"]);

    // The customer install layout: real package under dest/node_modules.
    const dest = join(dir, "app");
    mkdirSync(join(dest, "node_modules", "fake-pkg"), { recursive: true });
    writeFileSync(join(dest, "node_modules", "fake-pkg", "index.js"), "real bits");

    await extractPrebuilt(tgzPath, dest);
    // The hashed name must resolve to the real package through the link.
    expect(
      readFileSync(join(dest, ".next", "node_modules", "fake-pkg-abc123", "index.js"), "utf-8"),
    ).toBe("real bits");
  });

  it("throws a named error when a manifest package is missing from node_modules", async () => {
    const dir = tempDir("relay-links-");
    const stage = join(dir, "stage");
    mkdirSync(join(stage, ".next"), { recursive: true });
    writeFileSync(join(stage, ".next", "BUILD_ID"), "test-build-id");
    writeFileSync(
      join(stage, ".next", "relay-external-packages.json"),
      JSON.stringify({ version: 1, links: { "ghost-pkg-abc123": "ghost-pkg" } }),
    );
    const tgzPath = join(dir, "artifact.tgz");
    await tar.create({ gzip: true, file: tgzPath, cwd: stage }, [".next"]);
    const dest = join(dir, "app");
    mkdirSync(dest, { recursive: true });
    await expect(extractPrebuilt(tgzPath, dest)).rejects.toThrow(PrebuiltDownloadError);
  });

  it("rejects malformed external-package manifests", async () => {
    const dir = tempDir("relay-links-");
    const stage = join(dir, "stage");
    mkdirSync(join(stage, ".next"), { recursive: true });
    writeFileSync(join(stage, ".next", "BUILD_ID"), "test-build-id");
    writeFileSync(join(stage, ".next", "relay-external-packages.json"), "{");
    const tgzPath = join(dir, "artifact.tgz");
    await tar.create({ gzip: true, file: tgzPath, cwd: stage }, [".next"]);
    const dest = join(dir, "app");
    mkdirSync(dest, { recursive: true });

    await expect(extractPrebuilt(tgzPath, dest)).rejects.toThrow(
      /is not valid JSON/,
    );
  });

  it("accepts an external-package manifest with no links", async () => {
    const dir = tempDir("relay-links-");
    const stage = join(dir, "stage");
    mkdirSync(join(stage, ".next"), { recursive: true });
    writeFileSync(join(stage, ".next", "BUILD_ID"), "test-build-id");
    writeFileSync(
      join(stage, ".next", "relay-external-packages.json"),
      JSON.stringify({ version: 1 }),
    );
    const tgzPath = join(dir, "artifact.tgz");
    await tar.create({ gzip: true, file: tgzPath, cwd: stage }, [".next"]);
    const dest = join(dir, "app");
    mkdirSync(dest, { recursive: true });

    await expect(extractPrebuilt(tgzPath, dest)).resolves.toBeUndefined();
  });
});

describe("pruneBuildCache", () => {
  it("is a no-op when the cache directory does not exist", () => {
    expect(() =>
      pruneBuildCache(join(tempDir("relay-prune-"), "missing"), "0.16.0", 2),
    ).not.toThrow();
  });

  it("keeps the current version and the newest other artifact", () => {
    const dir = tempDir("relay-prune-");
    const mk = (v: string, ageMinutes: number) => {
      const p = join(dir, `relay-next-build-${v}.tgz`);
      writeFileSync(p, v);
      writeFileSync(`${p}.sha256`, "x");
      const t = new Date(Date.now() - ageMinutes * 60_000);
      utimesSync(p, t, t);
    };
    mk("0.14.0", 300);
    mk("0.15.0", 200);
    mk("0.15.5", 100);
    mk("0.16.0", 0);
    pruneBuildCache(dir, "0.16.0", 2);
    const left = readdirSync(dir).filter((f) => f.endsWith(".tgz")).sort();
    expect(left).toEqual(["relay-next-build-0.15.5.tgz", "relay-next-build-0.16.0.tgz"]);
    // sha sidecars of pruned versions go too
    expect(existsSync(join(dir, "relay-next-build-0.14.0.tgz.sha256"))).toBe(false);
  });

  it("keeps the requested number of newest artifacts when current is absent", () => {
    const dir = tempDir("relay-prune-");
    for (const [version, ageMinutes] of [["0.14.0", 20], ["0.15.0", 10]] as const) {
      const artifact = join(dir, `relay-next-build-${version}.tgz`);
      writeFileSync(artifact, version);
      const timestamp = new Date(Date.now() - ageMinutes * 60_000);
      utimesSync(artifact, timestamp, timestamp);
    }

    pruneBuildCache(dir, "0.16.0", 1);
    expect(
      readdirSync(dir).filter((name) => name.endsWith(".tgz")),
    ).toEqual(["relay-next-build-0.15.0.tgz"]);
  });
});

describe("ensurePrebuilt", () => {
  it("downloads, verifies, extracts, and caches on first run", async () => {
    const dir = tempDir("relay-ensure-");
    const { tgzPath } = await makeArtifact(dir);
    const appDir = join(dir, "app");
    const buildsDir = join(dir, "builds");
    mkdirSync(appDir, { recursive: true });

    const logs: string[] = [];
    const outcome = await ensurePrebuilt({
      version: "9.9.9",
      effectiveCwd: appDir,
      buildsDir,
      artifactUrlOverride: pathToFileURL(tgzPath).href,
      log: (m) => logs.push(m),
    });

    expect(outcome).toBe("downloaded");
    expect(existsSync(join(appDir, ".next", "BUILD_ID"))).toBe(true);
    expect(existsSync(join(buildsDir, "relay-next-build-9.9.9.tgz"))).toBe(true);
    expect(logs.join("\n")).toMatch(/download/i);
  });

  it("is a no-op only when the installed manifest matches the requested version", async () => {
    const dir = tempDir("relay-ensure-");
    const { tgzPath } = await makeArtifact(dir);
    const appDir = join(dir, "app");
    const buildsDir = join(dir, "builds");
    mkdirSync(appDir, { recursive: true });

    await ensurePrebuilt({
      version: "9.9.9",
      effectiveCwd: appDir,
      buildsDir,
      artifactUrlOverride: pathToFileURL(tgzPath).href,
      log: () => {},
    });

    const outcome = await ensurePrebuilt({
      version: "9.9.9",
      effectiveCwd: appDir,
      buildsDir,
      artifactUrlOverride: "http://127.0.0.1:1/unreachable.tgz",
      log: () => {},
    });
    expect(outcome).toBe("already-present");
    expect(isPrebuiltCurrent(appDir, "9.9.9")).toBe(true);
    expect(isPrebuiltCurrent(appDir, "9.9.8")).toBe(false);
  });

  it("rejects a manifest whose build identity no longer matches BUILD_ID", async () => {
    const dir = tempDir("relay-ensure-");
    const { tgzPath } = await makeArtifact(dir);
    const appDir = join(dir, "app");
    const buildsDir = join(dir, "builds");
    mkdirSync(appDir, { recursive: true });
    await ensurePrebuilt({
      version: "9.9.9",
      effectiveCwd: appDir,
      buildsDir,
      artifactUrlOverride: pathToFileURL(tgzPath).href,
      log: () => {},
    });

    writeFileSync(join(appDir, ".next", "BUILD_ID"), "different-build");

    expect(isPrebuiltCurrent(appDir, "9.9.9")).toBe(false);
  });

  it("replaces a legacy BUILD_ID-only build from the current version cache", async () => {
    const dir = tempDir("relay-ensure-");
    const { tgzPath, shaPath } = await makeArtifact(dir);
    const appDir = join(dir, "app");
    const buildsDir = join(dir, "builds");
    mkdirSync(join(appDir, ".next"), { recursive: true });
    writeFileSync(join(appDir, ".next", "BUILD_ID"), "stale-build");
    mkdirSync(buildsDir, { recursive: true });
    const cache = artifactCachePaths(buildsDir, "9.9.9");
    writeFileSync(cache.tgz, readFileSync(tgzPath));
    writeFileSync(cache.sha, readFileSync(shaPath));

    expect(isPrebuiltCurrent(appDir, "9.9.9")).toBe(false);
    const outcome = await ensurePrebuilt({
      version: "9.9.9",
      effectiveCwd: appDir,
      buildsDir,
      artifactUrlOverride: "http://127.0.0.1:1/unreachable.tgz",
      log: () => {},
    });

    expect(outcome).toBe("from-cache");
    expect(readFileSync(join(appDir, ".next", "BUILD_ID"), "utf-8")).toBe(
      "test-build-id",
    );
    expect(isPrebuiltCurrent(appDir, "9.9.9")).toBe(true);
  });

  it("promotes N+1 over N in one effective npx root without trusting the old BUILD_ID", async () => {
    const dir = tempDir("relay-ensure-");
    const v1 = await makeArtifact(dir, "1.0.0", "build-v1");
    const v2 = await makeArtifact(dir, "2.0.0", "build-v2");
    const appDir = join(dir, "shared-npx-root");
    const buildsDir = join(dir, "builds");
    mkdirSync(appDir, { recursive: true });

    await ensurePrebuilt({
      version: "1.0.0",
      effectiveCwd: appDir,
      buildsDir,
      artifactUrlOverride: pathToFileURL(v1.tgzPath).href,
      log: () => {},
    });
    expect(isPrebuiltCurrent(appDir, "1.0.0")).toBe(true);

    await ensurePrebuilt({
      version: "2.0.0",
      effectiveCwd: appDir,
      buildsDir,
      artifactUrlOverride: pathToFileURL(v2.tgzPath).href,
      log: () => {},
    });

    expect(readFileSync(join(appDir, ".next", "BUILD_ID"), "utf-8")).toBe(
      "build-v2",
    );
    expect(isPrebuiltCurrent(appDir, "1.0.0")).toBe(false);
    expect(isPrebuiltCurrent(appDir, "2.0.0")).toBe(true);
  });

  it("retains N but refuses to call it current when the N+1 download fails", async () => {
    const dir = tempDir("relay-ensure-");
    const v1 = await makeArtifact(dir, "1.0.0", "build-v1");
    const appDir = join(dir, "shared-npx-root");
    const buildsDir = join(dir, "builds");
    mkdirSync(appDir, { recursive: true });
    await ensurePrebuilt({
      version: "1.0.0",
      effectiveCwd: appDir,
      buildsDir,
      artifactUrlOverride: pathToFileURL(v1.tgzPath).href,
      log: () => {},
    });

    await expect(
      ensurePrebuilt({
        version: "2.0.0",
        effectiveCwd: appDir,
        buildsDir,
        artifactUrlOverride: "http://127.0.0.1:1/unreachable.tgz",
        log: () => {},
      }),
    ).rejects.toThrow(PrebuiltDownloadError);

    expect(readFileSync(join(appDir, ".next", "BUILD_ID"), "utf-8")).toBe(
      "build-v1",
    );
    expect(isPrebuiltCurrent(appDir, "1.0.0")).toBe(true);
    expect(isPrebuiltCurrent(appDir, "2.0.0")).toBe(false);
  });

  it("extracts from the version-keyed cache without downloading", async () => {
    const dir = tempDir("relay-ensure-");
    const { tgzPath, shaPath } = await makeArtifact(dir);
    const appDir = join(dir, "app");
    const buildsDir = join(dir, "builds");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(buildsDir, { recursive: true });
    const cache = artifactCachePaths(buildsDir, "9.9.9");
    writeFileSync(cache.tgz, readFileSync(tgzPath));
    writeFileSync(cache.sha, readFileSync(shaPath));

    const outcome = await ensurePrebuilt({
      version: "9.9.9",
      effectiveCwd: appDir,
      buildsDir,
      // Deliberately unreachable URL: cache hit must not touch the network.
      artifactUrlOverride: "http://127.0.0.1:1/unreachable.tgz",
      log: () => {},
    });
    expect(outcome).toBe("from-cache");
    expect(existsSync(join(appDir, ".next", "BUILD_ID"))).toBe(true);
  });

  it("rejects a checksum mismatch and evicts the bad cache file", async () => {
    const dir = tempDir("relay-ensure-");
    const { tgzPath, shaPath } = await makeArtifact(dir);
    // Corrupt the sha sidecar so verification must fail.
    writeFileSync(shaPath, `${"0".repeat(64)}  relay-next-build-9.9.9.tgz\n`);
    const appDir = join(dir, "app");
    const buildsDir = join(dir, "builds");
    mkdirSync(appDir, { recursive: true });

    await expect(
      ensurePrebuilt({
        version: "9.9.9",
        effectiveCwd: appDir,
        buildsDir,
        artifactUrlOverride: pathToFileURL(tgzPath).href,
        log: () => {},
      }),
    ).rejects.toThrow(PrebuiltDownloadError);
    // Bad bits must not survive as a poisoned cache.
    expect(existsSync(artifactCachePaths(buildsDir, "9.9.9").tgz)).toBe(false);
    expect(existsSync(join(appDir, ".next", "BUILD_ID"))).toBe(false);
  });

  it("evicts a corrupt pre-existing cache entry instead of retrying it forever", async () => {
    const dir = tempDir("relay-ensure-");
    const appDir = join(dir, "app");
    const buildsDir = join(dir, "builds");
    const cache = artifactCachePaths(buildsDir, "9.9.9");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(buildsDir, { recursive: true });
    writeFileSync(cache.tgz, "not-a-tarball");
    writeFileSync(cache.sha, `${"0".repeat(64)}\n`);

    await expect(
      ensurePrebuilt({
        version: "9.9.9",
        effectiveCwd: appDir,
        buildsDir,
        log: () => {},
      }),
    ).rejects.toThrow(PrebuiltDownloadError);

    expect(existsSync(cache.tgz)).toBe(false);
    expect(existsSync(cache.sha)).toBe(false);
  });

  it("wraps a failed download in PrebuiltDownloadError", async () => {
    const dir = tempDir("relay-ensure-");
    const appDir = join(dir, "app");
    mkdirSync(appDir, { recursive: true });
    await expect(
      ensurePrebuilt({
        version: "9.9.9",
        effectiveCwd: appDir,
        buildsDir: join(dir, "builds"),
        artifactUrlOverride: "http://127.0.0.1:1/unreachable.tgz",
        log: () => {},
      }),
    ).rejects.toThrow(PrebuiltDownloadError);
  });
});
