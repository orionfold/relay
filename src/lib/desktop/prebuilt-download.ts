import { createHash } from "crypto";
import {
  copyFileSync,
  createWriteStream,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { basename, join, relative } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { fileURLToPath } from "url";
import * as tar from "tar";

/**
 * Download-prebuilt-on-first-run (feat-ship-production-build-for-npx, #10).
 *
 * Release CI attaches a pruned `.next` build (`relay-next-build-<version>.tgz`
 * + `.sha256`) to each GitHub Release. On first launch of a version, the CLI
 * downloads it into a version-keyed cache under the data dir, verifies the
 * checksum, and extracts it into the app layout so the existing
 * `isPrebuilt → next start` branch fires. Every failure throws a
 * PrebuiltDownloadError — the CLI catches it, warns loudly, and falls back to
 * dev mode (the status-quo floor). Nothing here may fail silently.
 */
export class PrebuiltDownloadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PrebuiltDownloadError";
  }
}

const RELEASE_DOWNLOAD_BASE = "https://github.com/orionfold/relay/releases/download";
const PREBUILT_VERSION_MANIFEST = "relay-prebuilt-version.json";

interface PrebuiltVersionManifest {
  schemaVersion: 1;
  packageVersion: string;
  artifactSha256: string;
  buildId: string;
}

export function artifactFileName(version: string): string {
  return `relay-next-build-${version}.tgz`;
}

/**
 * Default: the versioned GitHub Release asset. `RELAY_BUILD_ARTIFACT_URL`
 * overrides it verbatim (file:// for the local smoke, https:// mirrors for
 * air-gapped installs); the `.sha256` sidecar is always fetched from
 * `<url>.sha256`.
 */
export function buildArtifactUrl(version: string, override?: string): string {
  if (override && override.trim()) {
    return override.trim();
  }
  return `${RELEASE_DOWNLOAD_BASE}/v${version}/${artifactFileName(version)}`;
}

export function artifactCachePaths(
  buildsDir: string,
  version: string,
): { tgz: string; sha: string } {
  const tgz = join(buildsDir, artifactFileName(version));
  return { tgz, sha: `${tgz}.sha256` };
}

/** Extract the digest from `shasum -a 256`-style output or a bare digest. */
export function parseSha256File(text: string): string {
  const match = text.match(/\b[0-9a-f]{64}\b/i);
  if (!match) {
    throw new PrebuiltDownloadError(
      `Checksum file did not contain a sha256 digest: "${text.slice(0, 80)}"`,
    );
  }
  return match[0].toLowerCase();
}

export async function sha256OfFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

function readPrebuiltVersionManifest(
  effectiveCwd: string,
): PrebuiltVersionManifest | null {
  const manifestPath = join(
    effectiveCwd,
    ".next",
    PREBUILT_VERSION_MANIFEST,
  );
  try {
    const parsed = JSON.parse(
      readFileSync(manifestPath, "utf-8"),
    ) as Partial<PrebuiltVersionManifest>;
    if (
      parsed.schemaVersion !== 1 ||
      typeof parsed.packageVersion !== "string" ||
      typeof parsed.artifactSha256 !== "string" ||
      !/^[0-9a-f]{64}$/i.test(parsed.artifactSha256) ||
      typeof parsed.buildId !== "string" ||
      !parsed.buildId.trim()
    ) {
      return null;
    }
    return parsed as PrebuiltVersionManifest;
  } catch {
    return null;
  }
}

export function isPrebuiltCurrent(
  effectiveCwd: string,
  version: string,
): boolean {
  try {
    const buildId = readFileSync(
      join(effectiveCwd, ".next", "BUILD_ID"),
      "utf-8",
    ).trim();
    const manifest = readPrebuiltVersionManifest(effectiveCwd);
    return (
      Boolean(buildId) &&
      manifest?.packageVersion === version &&
      manifest.buildId === buildId
    );
  } catch {
    return false;
  }
}

/**
 * Fetch `url` into `destPath`. Supports file:// (fs copy — Node's fetch does
 * not handle file URLs) and http(s):// (global fetch, follows GitHub's CDN
 * redirects). Any failure → PrebuiltDownloadError.
 */
export async function downloadToFile(url: string, destPath: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (cause) {
    throw new PrebuiltDownloadError(`Invalid artifact URL: ${url}`, { cause });
  }

  if (parsed.protocol === "file:") {
    const sourcePath = fileURLToPath(parsed);
    if (!existsSync(sourcePath)) {
      throw new PrebuiltDownloadError(`Artifact not found at ${sourcePath}`);
    }
    copyFileSync(sourcePath, destPath);
    return;
  }

  let response: Response;
  try {
    response = await fetch(url, { redirect: "follow" });
  } catch (cause) {
    throw new PrebuiltDownloadError(
      `Network error downloading ${url}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  if (!response.ok || !response.body) {
    throw new PrebuiltDownloadError(
      `Download of ${url} failed with HTTP ${response.status} ${response.statusText}`,
    );
  }
  try {
    await pipeline(
      Readable.fromWeb(response.body as import("stream/web").ReadableStream),
      createWriteStream(destPath),
    );
  } catch (cause) {
    rmSync(destPath, { force: true });
    throw new PrebuiltDownloadError(
      `Failed writing artifact to ${destPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
}

/**
 * Extract the artifact into `destDir` and require `.next/BUILD_ID` to appear.
 * `strict: true` so tar entry errors reject instead of degrading to warnings —
 * a partially-extracted build must never look like success.
 */
export async function extractPrebuilt(
  tgzPath: string,
  destDir: string,
  { relink = true }: { relink?: boolean } = {},
): Promise<void> {
  try {
    await tar.extract({ file: tgzPath, cwd: destDir, strict: true });
  } catch (cause) {
    throw new PrebuiltDownloadError(
      `Failed extracting ${basename(tgzPath)}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
  }
  if (!existsSync(join(destDir, ".next", "BUILD_ID"))) {
    throw new PrebuiltDownloadError(
      `Artifact ${basename(tgzPath)} extracted but contains no .next/BUILD_ID — not a valid prebuilt bundle.`,
    );
  }
  if (relink) {
    relinkExternalPackages(destDir);
  }
}

/**
 * Next's build emits `.next/node_modules/<pkg>-<hash>` symlinks for
 * `serverExternalPackages`, and the compiled server chunks require() those
 * hashed names at runtime. Raw symlink tar entries can't be extracted on
 * Windows without elevated privileges, so the artifact ships a manifest
 * (`.next/relay-external-packages.json`, written by
 * scripts/build-prebuilt-artifact.mjs) instead, and the links are recreated
 * here against the install's own node_modules — junction on Windows (no
 * privileges required), relative symlink elsewhere.
 */
function relinkExternalPackages(
  destDir: string,
  {
    packageRoot = destDir,
    finalLinksDir = join(destDir, ".next", "node_modules"),
  }: { packageRoot?: string; finalLinksDir?: string } = {},
): void {
  const manifestPath = join(destDir, ".next", "relay-external-packages.json");
  if (!existsSync(manifestPath)) {
    return; // artifact predates the manifest — nothing to relink
  }

  let links: Record<string, string>;
  try {
    links = JSON.parse(readFileSync(manifestPath, "utf-8")).links ?? {};
  } catch (cause) {
    throw new PrebuiltDownloadError(
      `Artifact manifest ${manifestPath} is not valid JSON.`,
      { cause },
    );
  }

  const linksDir = join(destDir, ".next", "node_modules");
  mkdirSync(linksDir, { recursive: true });

  for (const [hashedName, packagePath] of Object.entries(links)) {
    const target = join(packageRoot, "node_modules", packagePath);
    if (!existsSync(target)) {
      throw new PrebuiltDownloadError(
        `Prebuilt server expects package "${packagePath}" (as ${hashedName}) but it is ` +
          `not installed at ${target}. The npm install may be incomplete — reinstall and retry.`,
      );
    }
    const linkPath = join(linksDir, hashedName);
    rmSync(linkPath, { recursive: true, force: true });
    try {
      if (process.platform === "win32") {
        // Junctions take absolute targets and need no special privileges.
        symlinkSync(target, linkPath, "junction");
      } else {
        // A staged .next directory is promoted after links are created. Store
        // the relative target for its final location, not its temporary one.
        symlinkSync(relative(finalLinksDir, target), linkPath);
      }
    } catch (cause) {
      throw new PrebuiltDownloadError(
        `Could not link ${hashedName} → ${target}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }
}

async function installPrebuiltVersion({
  tgzPath,
  effectiveCwd,
  version,
  artifactSha256,
}: {
  tgzPath: string;
  effectiveCwd: string;
  version: string;
  artifactSha256: string;
}): Promise<void> {
  const suffix = `${process.pid}-${Date.now()}`;
  const stageRoot = join(effectiveCwd, `.relay-prebuilt-stage-${suffix}`);
  const stagedNext = join(stageRoot, ".next");
  const finalNext = join(effectiveCwd, ".next");
  const backupNext = join(effectiveCwd, `.relay-prebuilt-backup-${suffix}`);
  let backedUp = false;

  rmSync(stageRoot, { recursive: true, force: true });
  rmSync(backupNext, { recursive: true, force: true });
  mkdirSync(stageRoot, { recursive: true });

  try {
    await extractPrebuilt(tgzPath, stageRoot, { relink: false });
    relinkExternalPackages(stageRoot, {
      packageRoot: effectiveCwd,
      finalLinksDir: join(effectiveCwd, ".next", "node_modules"),
    });
    const buildId = readFileSync(join(stagedNext, "BUILD_ID"), "utf-8").trim();
    writeFileSync(
      join(stagedNext, PREBUILT_VERSION_MANIFEST),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          packageVersion: version,
          artifactSha256,
          buildId,
        } satisfies PrebuiltVersionManifest,
        null,
        2,
      )}\n`,
      "utf-8",
    );

    if (existsSync(finalNext)) {
      renameSync(finalNext, backupNext);
      backedUp = true;
    }
    renameSync(stagedNext, finalNext);
    rmSync(backupNext, { recursive: true, force: true });
    backedUp = false;
  } catch (cause) {
    if (!existsSync(finalNext) && backedUp && existsSync(backupNext)) {
      renameSync(backupNext, finalNext);
      backedUp = false;
    }
    if (cause instanceof PrebuiltDownloadError) {
      throw cause;
    }
    throw new PrebuiltDownloadError(
      `Could not promote the verified Relay ${version} production build: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  } finally {
    rmSync(stageRoot, { recursive: true, force: true });
    if (!backedUp) {
      rmSync(backupNext, { recursive: true, force: true });
    }
  }
}

/**
 * Cap the version-keyed cache: keep the current version plus the most recent
 * others up to `keep` total. Cache-only cleanup — never throws into the launch
 * path; a failed unlink just leaves a stale file behind.
 */
export function pruneBuildCache(buildsDir: string, currentVersion: string, keep = 2): void {
  let entries: string[];
  try {
    entries = readdirSync(buildsDir).filter(
      (name) => /^relay-next-build-.+\.tgz$/.test(name),
    );
  } catch {
    return;
  }
  const current = artifactFileName(currentVersion);
  const others = entries
    .filter((name) => name !== current)
    .map((name) => {
      const filePath = join(buildsDir, name);
      let mtime = 0;
      try {
        mtime = statSync(filePath).mtimeMs;
      } catch {
        // Unstat-able → treat as oldest.
      }
      return { name, filePath, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const keepOthers = entries.includes(current) ? keep - 1 : keep;
  for (const stale of others.slice(Math.max(keepOthers, 0))) {
    rmSync(stale.filePath, { force: true });
    rmSync(`${stale.filePath}.sha256`, { force: true });
  }
}

export type EnsurePrebuiltOutcome = "already-present" | "from-cache" | "downloaded";

/**
 * Make the effective `.next` build authoritative for `version`: no-op only
 * when BUILD_ID and Relay's version/checksum manifest agree, otherwise stage
 * and atomically promote a verified version-keyed artifact. Throws
 * PrebuiltDownloadError on any failure; the caller owns the loud dev-mode
 * fallback and must use `isPrebuiltCurrent()` before selecting production.
 */
export async function ensurePrebuilt({
  version,
  effectiveCwd,
  buildsDir,
  artifactUrlOverride,
  log,
}: {
  version: string;
  effectiveCwd: string;
  buildsDir: string;
  artifactUrlOverride?: string;
  log: (message: string) => void;
}): Promise<EnsurePrebuiltOutcome> {
  if (isPrebuiltCurrent(effectiveCwd, version)) {
    return "already-present";
  }

  mkdirSync(buildsDir, { recursive: true });
  const cache = artifactCachePaths(buildsDir, version);

  if (existsSync(cache.tgz) && existsSync(cache.sha)) {
    log(`Using cached production build for ${version} (${cache.tgz}).`);
    try {
      const shaText = readFileSync(cache.sha, "utf-8");
      await verifyChecksum(cache.tgz, shaText);
      await installPrebuiltVersion({
        tgzPath: cache.tgz,
        effectiveCwd,
        version,
        artifactSha256: parseSha256File(shaText),
      });
    } catch (error) {
      // Do not make every later launch retry a cache entry that failed its
      // integrity or install contract.
      rmSync(cache.tgz, { force: true });
      rmSync(cache.sha, { force: true });
      throw error;
    }
    return "from-cache";
  }

  const url = buildArtifactUrl(version, artifactUrlOverride);
  log(`Downloading production build for ${version} (~40 MB) from ${url} ...`);

  try {
    await downloadToFile(url, cache.tgz);
    const shaText = await fetchChecksumText(`${url}.sha256`, buildsDir);
    writeFileSync(cache.sha, shaText, "utf-8");
    await verifyChecksum(cache.tgz, shaText);
    await installPrebuiltVersion({
      tgzPath: cache.tgz,
      effectiveCwd,
      version,
      artifactSha256: parseSha256File(shaText),
    });
  } catch (error) {
    // A failed/corrupt download must not survive as a poisoned cache entry.
    rmSync(cache.tgz, { force: true });
    rmSync(cache.sha, { force: true });
    throw error;
  }

  log(`Production build ready (cached at ${cache.tgz}).`);
  pruneBuildCache(buildsDir, version);
  return "downloaded";
}

async function fetchChecksumText(shaUrl: string, buildsDir: string): Promise<string> {
  const tempPath = join(buildsDir, `.sha-download-${process.pid}`);
  try {
    await downloadToFile(shaUrl, tempPath);
    return readFileSync(tempPath, "utf-8");
  } finally {
    rmSync(tempPath, { force: true });
  }
}

async function verifyChecksum(tgzPath: string, shaFileText: string): Promise<void> {
  const expected = parseSha256File(shaFileText);
  const actual = await sha256OfFile(tgzPath);
  if (actual !== expected) {
    throw new PrebuiltDownloadError(
      `Checksum mismatch for ${basename(tgzPath)}: expected ${expected}, got ${actual}. ` +
        `The download may be corrupt or tampered with.`,
    );
  }
}
