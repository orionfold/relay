import { createHash } from "crypto";
import { createReadStream, existsSync, mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pipeline } from "stream/promises";
import * as tar from "tar";
import { downloadToFile } from "@/lib/desktop/prebuilt-download";
import {
  parsePackIndex,
  type PackIndex,
  type PackIndexEntry,
} from "./index-schema";

/**
 * Remote pack fetch (R2, `packs-publish.md` §4 Pillar A resolver seam).
 *
 * The ONE outbound-network surface for resolving a pack Relay did not ship
 * with: a bare, sha256-verified GET of the canonical index (R1 schema) and of a
 * per-pack `.tgz` artifact, following the `prebuilt-download.ts` precedent
 * verbatim (egress row #1 → this adds egress row #11 in `docs/trust/data-flow.md`).
 * Nothing identifying is sent — reads FROM a canonical Orionfold source only, so
 * it is promise-clean under "Relay never sends your data to Orionfold"
 * (README:107, memory `phone-home-definition`).
 *
 * Reuses `downloadToFile` (handles `file://` for the local smoke + `http(s)://`
 * with redirect-follow) so the outbound shape stays identical to the one the
 * trust doc already describes. A bundled pack NEVER reaches this module — the
 * resolver only calls in for a bare name that is neither a local path nor a
 * bundled template, so offline installs of bundled packs never touch the network.
 *
 * Scope (R2): fetch + CONTENT integrity (sha256 == entry.sha). PROVENANCE
 * (who signed it — entry.sig/keyId) is R3 `pack-provenance-tiers`, verified
 * against the returned entry after this fetch.
 */
export class RemotePackFetchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RemotePackFetchError";
  }
}

/** The canonical pack-index base URL. Open decision #1 (Website-coordinated,
 * drafted in `strategy/relay/_RELAY.md` 2026-07-06) — placeholder until the
 * peer confirms; `RELAY_PACK_INDEX_URL` overrides it verbatim (mirror or a
 * `file://` fixture for the smoke/tests), mirroring `RELAY_BUILD_ARTIFACT_URL`. */
const DEFAULT_PACK_INDEX_BASE = "https://orionfold.com/relay/packs";

export interface RemoteOptions {
  /** Override the canonical base URL (tests/smoke/air-gap mirrors). Falls back
   * to `RELAY_PACK_INDEX_URL`, then the canonical default. No trailing slash. */
  baseUrl?: string;
}

function resolveBaseUrl(opts: RemoteOptions = {}): string {
  const raw = opts.baseUrl ?? process.env.RELAY_PACK_INDEX_URL ?? DEFAULT_PACK_INDEX_BASE;
  return raw.replace(/\/+$/, "");
}

/** `<base>/index.json` — the canonical index location. */
export function packIndexUrl(opts: RemoteOptions = {}): string {
  return `${resolveBaseUrl(opts)}/index.json`;
}

/** `<base>/<entry.path>.tgz` — a hosted pack's artifact. Throws for an entry
 * with no `path` (a community `repo` entry is fetched via git, not here). */
export function packArtifactUrl(entry: PackIndexEntry, opts: RemoteOptions = {}): string {
  if (!entry.path) {
    throw new RemotePackFetchError(
      `Pack "${entry.id}" has no hosted path — a community (repo) entry is cloned, not downloaded.`,
    );
  }
  return `${resolveBaseUrl(opts)}/${entry.path}.tgz`;
}

/** GET + parse the canonical index. Throws RemotePackFetchError on a fetch miss
 * or a schema-invalid index. Network-free otherwise (R1 reader does the parse). */
export async function fetchPackIndex(opts: RemoteOptions = {}): Promise<PackIndex> {
  const url = packIndexUrl(opts);
  const tmp = mkdtempSync(join(tmpdir(), "relay-pack-index-"));
  const dest = join(tmp, "index.json");
  try {
    await downloadToFile(url, dest);
  } catch (cause) {
    rmSync(tmp, { recursive: true, force: true });
    throw new RemotePackFetchError(
      `Could not fetch the canonical pack index from ${url}.`,
      { cause },
    );
  }
  try {
    return parsePackIndex(readFileSync(dest, "utf-8"));
  } catch (cause) {
    throw new RemotePackFetchError(
      `The pack index at ${url} is not a valid orionfold.packs/v1 index.`,
      { cause },
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function sha256OfFile(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

/**
 * Fetch a HOSTED pack (`entry.path`) as a sha-verified `.tgz`, extract into a
 * fresh temp dir, and return it in the `{ dir, cleanup }` shape `acquirePack`
 * yields — so the install path treats a remotely-fetched pack identically to a
 * git clone. The content hash is verified against `entry.sha` BEFORE extraction;
 * a mismatch throws and nothing is installed (Principle #1). A community `repo`
 * entry is NOT handled here — the resolver hands its URL to the existing
 * git-clone in `acquirePack`.
 */
export async function fetchPackDir(
  entry: PackIndexEntry,
  opts: RemoteOptions = {},
): Promise<{ dir: string; cleanup: () => void }> {
  const url = packArtifactUrl(entry, opts); // throws for a no-path entry
  const work = mkdtempSync(join(tmpdir(), "relay-pack-fetch-"));
  const tgz = join(work, "pack.tgz");
  const cleanup = () => rmSync(work, { recursive: true, force: true });

  try {
    await downloadToFile(url, tgz);
  } catch (cause) {
    cleanup();
    throw new RemotePackFetchError(
      `Could not fetch pack "${entry.id}" from ${url}.`,
      { cause },
    );
  }

  // Content integrity — sha256 must match the index entry before we trust it.
  if (entry.sha) {
    const actual = await sha256OfFile(tgz);
    if (actual !== entry.sha.toLowerCase()) {
      cleanup();
      throw new RemotePackFetchError(
        `Checksum mismatch for pack "${entry.id}": index expects ${entry.sha}, ` +
          `fetched ${actual}. The download may be corrupt or tampered with.`,
      );
    }
  }

  const extractDir = join(work, "pack");
  try {
    // strict: a partially-extracted pack must never look like success.
    await tar.extract({ file: tgz, cwd: work, strict: true });
  } catch (cause) {
    cleanup();
    throw new RemotePackFetchError(
      `Failed extracting pack "${entry.id}" from ${url}.`,
      { cause },
    );
  }
  // The tar was created with cwd=pack-root, so entries land under `work/` —
  // pack.yaml at the root. If the artifact wrapped its contents in a top dir,
  // that is a packaging bug the parse step will surface loudly.
  if (existsSync(join(work, "pack.yaml"))) {
    return { dir: work, cleanup };
  }
  if (existsSync(join(extractDir, "pack.yaml"))) {
    return { dir: extractDir, cleanup };
  }
  cleanup();
  throw new RemotePackFetchError(
    `Pack "${entry.id}" artifact from ${url} contains no pack.yaml — not a valid pack.`,
  );
}
