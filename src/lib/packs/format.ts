import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import { AppManifestSchema, type AppManifest } from "@/lib/apps/registry";

/**
 * Relay Pack format — a pack is a SUPERSET of an AppManifest: a `pack.yaml`
 * carrying distribution metadata (version, compat range, declared customer
 * slugs) wrapping a clean `base/manifest.yaml` that is a plain AppManifest.
 *
 * Keeping `pack.yaml` separate from the inner manifest keeps the AppManifest
 * contract pristine — the pack format extends AROUND it, not INTO it. See
 * _SPECS/2026-06-30-132118-01_relay-pack-format.md.
 *
 * The on-disk layout is pre-split into `base/` (upstream-authored, managed in
 * a future release) + `overrides/` (user-owned, shadows base at load time).
 * v1 only copies, but the split exists from day one so the future managed-base
 * graduation is non-breaking.
 */

// ── pack.yaml schema ─────────────────────────────────────────────────

/**
 * Pack-level metadata. `.strict()` on the known keys so a hallucinated or
 * fat-fingered field fails at parse rather than installing silently. The
 * inner AppManifest stays `.passthrough()` (validated separately) — only this
 * wrapper is strict.
 */
export const PackManifestSchema = z
  .object({
    id: z.string().min(1),
    version: z.string().min(1),
    name: z.string().min(1),
    author: z.string().optional(),
    description: z.string().optional(),
    /** Relay-core compat range, e.g. ">=0.15.0". Checked at install time. */
    relayCore: z.string().optional(),
    /**
     * Premium gate. When set, `relay pack add` requires a verified license
     * whose entitlements include this exact string (e.g.
     * "product:orionfold-relay"). Absent ⇒ a free pack with no license gate.
     * The string is the unit of entitlement, version- and pack-id-agnostic.
     */
    entitlement: z.string().min(1).optional(),
    /**
     * Premium display copy (D6). Offline strings rendered on the locked
     * gallery card — the Website still owns actual pricing. Meaningful only
     * alongside `entitlement`; harmless on a free pack. Either a flat string
     * ("$499/year") or a two-phase offer ({ list, intro?, note? }) so a
     * founding/introductory price can render alongside the list price.
     * Render sites consume `packPrice()` — never branch on the raw shape.
     */
    price: z
      .union([
        z.string().min(1),
        z
          .object({
            list: z.string().min(1),
            intro: z.string().min(1).optional(),
            note: z.string().min(1).optional(),
          })
          .strict(),
      ])
      .optional(),
    /**
     * Card identity token — a lucide icon name rendered on the gallery card
     * (e.g. "briefcase"). Unknown tokens fall back to the default glyph;
     * never a remote asset.
     */
    icon: z.string().min(1).optional(),
    /** Get-license CTA target on the locked card. */
    purchaseUrl: z.url().optional(),
    /**
     * Relationship copy linking this pack to a sibling (e.g. a free pack that
     * has a paid upgrade, or a paid pack that builds ALONGSIDE a free one).
     * Rendered as one line on the /packs card. `href` is optional — an
     * app-internal path ("/packs?filter=premium") or absolute purchase URL.
     * Additive framing only: the packs coexist, one never replaces the other.
     */
    related: z
      .object({
        text: z.string().min(1),
        href: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    /**
     * Per-version customer-voice recap, version → one line. The single source
     * for every renewal value-recap surface (`license status`, the 402 update
     * refusal, the /packs update card, the Website renewal email). Optional —
     * but paid packs should carry it, or their renewal case argues generically.
     */
    changelog: z.record(z.string(), z.string().min(1)).optional(),
    /** Customer slugs seeded via ensureCustomer at install. */
    customers: z.array(z.string()).default([]),
    /**
     * Bundle descriptor (`pack-bundle-model`). When present, this pack is a
     * BUNDLE: it owns no inner AppManifest of its own and instead lists child
     * pack ids to flatten into ONE installed app at install time. Children
     * resolve local-first (bundled template dir or existing local path) — never
     * a remote index (no-marketplace fence). A bundle pack therefore has NO
     * `base/manifest.yaml`; `parsePack` derives a placeholder manifest from
     * this pack.yaml and the install path merges the children in. Non-empty:
     * a bundle of nothing is a packaging bug that must fail at parse, not
     * install an empty app.
     */
    bundle: z.array(z.string().min(1)).nonempty().optional(),
  })
  .strict();

export type PackMeta = z.infer<typeof PackManifestSchema>;

/** Normalized two-phase offer; `list` is always present. */
export interface PackPrice {
  list: string;
  intro?: string;
  note?: string;
}

/**
 * The single price shape every render site consumes (card, any future recap
 * surface). Flat-string packs normalize to `{ list }`; free packs → null.
 */
export function packPrice(meta: PackMeta): PackPrice | null {
  if (!meta.price) return null;
  return typeof meta.price === "string" ? { list: meta.price } : meta.price;
}

// ── Pack + resolved-layer types ──────────────────────────────────────

export interface Pack {
  /** Absolute path to the pack root (the dir containing pack.yaml). */
  rootDir: string;
  /** Parsed + validated pack.yaml. */
  meta: PackMeta;
  /** Parsed + validated base/manifest.yaml (a clean AppManifest). */
  manifest: AppManifest;
}

export type PackLayer = "base" | "override";

export interface ResolvedPackFile {
  /** Path relative to base/ (and overrides/), e.g. "profiles/x--y/profile.yaml". */
  relPath: string;
  /** Absolute path to the winning file on disk. */
  absPath: string;
  /** Which layer the winning file came from. */
  layer: PackLayer;
}

export interface ResolvedPack {
  pack: Pack;
  /** All addressable files under base/ + overrides/, override shadowing base. */
  files: ResolvedPackFile[];
}

// ── Errors (Principle #2: every error has a name) ────────────────────

/** Thrown when a pack dir is missing required files or fails schema validation. */
export class PackValidationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "PackValidationError";
  }
}

/**
 * Thrown when merging a bundle's children hits a collision that would silently
 * overwrite one child's primitive with another's (a logical table/primitive id
 * shared across children, or two child files landing on the same dest path).
 * A colliding bundle must fail install LOUDLY, never half-merge (Principle #1).
 */
export class BundleCollisionError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "BundleCollisionError";
  }
}

/** A pack is a BUNDLE iff it declares a non-empty `bundle` child list. */
export function isBundle(meta: PackMeta): boolean {
  return Array.isArray(meta.bundle) && meta.bundle.length > 0;
}

// ── parsePack ────────────────────────────────────────────────────────

/**
 * Read + validate a pack directory. Reads `pack.yaml` and `base/manifest.yaml`,
 * validates both against their schemas, and returns a typed `Pack`. Fails
 * loudly with a named `PackValidationError` on any violation — never returns a
 * half-valid pack (Principle #1: no silent failures).
 */
export function parsePack(dir: string): Pack {
  const packYamlPath = path.join(dir, "pack.yaml");
  if (!fs.existsSync(packYamlPath)) {
    throw new PackValidationError(`Pack is missing pack.yaml: ${dir}`);
  }

  let rawMeta: unknown;
  try {
    rawMeta = yaml.load(fs.readFileSync(packYamlPath, "utf-8"));
  } catch (err) {
    throw new PackValidationError(`pack.yaml is not valid YAML: ${dir}`, err);
  }
  const metaResult = PackManifestSchema.safeParse(rawMeta);
  if (!metaResult.success) {
    throw new PackValidationError(
      `pack.yaml failed validation: ${metaResult.error.message}`,
      metaResult.error
    );
  }

  // A BUNDLE pack owns no inner manifest — it composes children at install. We
  // derive a placeholder AppManifest (id/name/version/description/entitlement
  // from pack.yaml, empty primitive arrays) so the `Pack` contract holds and
  // every non-bundle caller is unaffected. The real primitives arrive at merge.
  if (isBundle(metaResult.data)) {
    const meta = metaResult.data;
    const placeholder = AppManifestSchema.parse({
      id: meta.id,
      version: meta.version,
      name: meta.name,
      ...(meta.description ? { description: meta.description } : {}),
      ...(meta.entitlement ? { entitlement: meta.entitlement } : {}),
    });
    return { rootDir: dir, meta, manifest: placeholder };
  }

  const manifestPath = path.join(dir, "base", "manifest.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new PackValidationError(
      `Pack is missing base/manifest.yaml: ${dir}`
    );
  }

  let rawManifest: unknown;
  try {
    rawManifest = yaml.load(fs.readFileSync(manifestPath, "utf-8"));
  } catch (err) {
    throw new PackValidationError(
      `base/manifest.yaml is not valid YAML: ${dir}`,
      err
    );
  }
  const manifestResult = AppManifestSchema.safeParse(rawManifest);
  if (!manifestResult.success) {
    throw new PackValidationError(
      `base/manifest.yaml failed AppManifest validation: ${manifestResult.error.message}`,
      manifestResult.error
    );
  }

  return {
    rootDir: dir,
    meta: metaResult.data,
    manifest: manifestResult.data,
  };
}

// ── resolvePackLayer ─────────────────────────────────────────────────

function walkRelative(root: string, acc: Map<string, string>): void {
  if (!fs.existsSync(root)) return;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        acc.set(path.relative(root, full), full);
      }
    }
  }
}

/**
 * Load-time precedence resolver. For every addressable file under `base/`,
 * an `overrides/` file of the same relative path SHADOWS it (SKILL.md-style
 * same-name precedence). Override-only files (no base counterpart) are
 * included too.
 *
 * In v1 `overrides/` is usually empty, so this is near-identity — but the
 * resolver is defined now so the managed-base graduation later changes
 * neither the format nor the call sites. The `manifest.yaml` itself is NOT a
 * layered file (it's parsed into `pack.manifest`); only the file-droppable
 * artifacts under profiles/blueprints/seed are layered.
 */
export function resolvePackLayer(pack: Pack): ResolvedPack {
  const baseDir = path.join(pack.rootDir, "base");
  const overridesDir = path.join(pack.rootDir, "overrides");

  const baseFiles = new Map<string, string>();
  walkRelative(baseDir, baseFiles);
  const overrideFiles = new Map<string, string>();
  walkRelative(overridesDir, overrideFiles);

  // manifest.yaml is consumed as structured data, not dropped as a file.
  baseFiles.delete("manifest.yaml");
  overrideFiles.delete("manifest.yaml");

  const merged = new Map<string, ResolvedPackFile>();
  for (const [relPath, absPath] of baseFiles) {
    merged.set(relPath, { relPath, absPath, layer: "base" });
  }
  for (const [relPath, absPath] of overrideFiles) {
    merged.set(relPath, { relPath, absPath, layer: "override" });
  }

  return {
    pack,
    files: [...merged.values()],
  };
}
