import fs from "node:fs";
import path from "node:path";
import { getAppRoot } from "@/lib/utils/app-root";
import { buildPrimitivesSummary } from "@/lib/apps/registry";
import { parsePack, type PackMeta } from "./format";

/**
 * Bundled-pack catalog — enumerates the in-tree templates that ship inside
 * the npm package (`src/` is in the tarball's `files`, so the templates exist
 * at runtime under npx too). Consumed by the `/packs` gallery, the install
 * API, and the CLI's bare-name resolver, so all three see the same ids.
 *
 * A template that fails to parse is LISTED with its reason, never silently
 * skipped (Principle #1) — a corrupt bundled pack is a packaging bug the
 * gallery should surface, not hide.
 */

export interface PackTemplate {
  /** Directory name; equals meta.id for a valid template. */
  id: string;
  /** Absolute path to the template dir (the `pack add` source). */
  dir: string;
  /** Parsed pack.yaml — absent when the template is corrupt. */
  meta?: PackMeta;
  /** e.g. "1 profile · 1 table" — derived from the pack's app manifest. */
  primitivesSummary?: string;
  /** Why this template failed to parse. */
  error?: string;
}

export interface CatalogOptions {
  /** Override the templates dir (tests). */
  templatesDir?: string;
}

export function packTemplatesDir(opts: CatalogOptions = {}): string {
  return (
    opts.templatesDir ??
    path.join(
      getAppRoot(import.meta.dirname, 3),
      "src",
      "lib",
      "packs",
      "templates"
    )
  );
}

export function listPackTemplates(opts: CatalogOptions = {}): PackTemplate[] {
  const dir = packTemplatesDir(opts);
  if (!fs.existsSync(dir)) return [];

  const out: PackTemplate[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const templateDir = path.join(dir, entry.name);
    try {
      const pack = parsePack(templateDir);
      out.push({
        id: pack.meta.id,
        dir: templateDir,
        meta: pack.meta,
        primitivesSummary: buildPrimitivesSummary(pack.manifest),
      });
    } catch (err) {
      out.push({
        id: entry.name,
        dir: templateDir,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Resolve one bundled template by id; null when unknown or corrupt. */
export function findPackTemplate(
  id: string,
  opts: CatalogOptions = {}
): PackTemplate | null {
  const match = listPackTemplates(opts).find((t) => t.id === id);
  return match && !match.error ? match : null;
}

/** A bare name that is not a path/URL didn't match any bundled template. */
export class UnknownPackNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnknownPackNameError";
  }
}

/** Bundled template ids are kebab-case slugs; anything else is a path/URL. */
const BARE_NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Map a `pack add` source to something `installPack` can acquire: a bare
 * name resolves to its bundled template dir. Precedence: an EXISTING local
 * path always wins (explicit path beats registry — a user pointing at a
 * folder must never be silently rerouted to a bundled pack). Git URLs and
 * non-bare paths pass through untouched; a bare name matching no template
 * throws naming the available ids, which beats the generic
 * "path does not exist" the acquire step would give.
 */
export function resolvePackSource(
  source: string,
  opts: CatalogOptions = {}
): string {
  if (fs.existsSync(path.resolve(source))) return source;
  if (!BARE_NAME.test(source)) return source;

  const template = findPackTemplate(source, opts);
  if (template) return template.dir;

  const ids = listPackTemplates(opts)
    .filter((t) => !t.error)
    .map((t) => t.id);
  throw new UnknownPackNameError(
    `Unknown pack "${source}". Bundled packs: ${ids.length ? ids.join(", ") : "(none)"}. ` +
      `Otherwise pass a folder path or git URL.`
  );
}
