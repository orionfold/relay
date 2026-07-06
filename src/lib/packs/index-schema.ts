// Canonical pack index — the `orionfold.packs/v1` machine-readable index (R1).
//
// This is the KEYSTONE of the Orionfold Packs distribution standard
// (`_IDEAS/packs-publish.md` §4, Pillar A). Today every pack ships as a bundled
// template dir in the npm payload and is resolved local-first by `catalog.ts`.
// There is no way for Relay to learn about a pack it did not ship with — no
// canonical list of "what packs exist, at which version, at which trust tier,
// requiring which core." This module is the *schema + typed reader* for that
// list: a versioned, machine-readable index published at a canonical Orionfold
// URL and READ by Relay, exactly the way `pricing.json` is a canonical SSOT the
// product reads and never writes (`scripts/check-price-drift.mjs`).
//
// Reading the index is a canonical READ from an Orionfold source — promise-clean
// under "Relay never sends your data to Orionfold" (README:107, memory
// `phone-home-definition`), the same shape as the shipped `pricing.json`
// bare-GET and the `prebuilt-download.ts` GitHub Releases GET.
//
// SCOPE (R1): schema + a pure reader + a committed fixture. NO network fetch of
// packs (that is R2 `pack-remote-resolver`, which owns the one GET + the
// data-flow egress row), NO signature verification (R3 `pack-provenance-tiers`),
// NO change to `install.ts` / `catalog.ts` resolution. The reader takes
// already-fetched JSON text so R1 stays pure and testable against a fixture, and
// the one network call lives in exactly one place (R2).
//
// PURE BY DESIGN — a zero-runtime-import leaf (imports only `zod`), mirroring the
// discipline in `taxonomy.ts` / `pack-of.ts`. This keeps the module out of the
// `@/lib/agents/runtime/catalog.ts` module-load-cycle blast radius entirely, so
// the R2 resolver and R3 verifier can consume it from anywhere
// (memory `shared-constant-zero-import-leaf`). `index-schema.test.ts` asserts
// the single-zod-import invariant by source.
//
// VERSIONING — the `schema` discriminant (`orionfold.packs/v1`) mirrors the
// `orionfold.pricing/v1` / `orionfold.license/v1` discipline: additive fields
// only within a version so a newer index and an older Relay interoperate; a
// breaking change majors the string and the old Relay refuses loudly (it is a
// `z.literal`, so an unknown schema string fails the parse).
import { z } from "zod";

/** The three trust tiers (R3 `pack-provenance-tiers` gives each a badge).
 * `official` = signed by the Orionfold key, hosted in the canonical tree;
 * `partner` = signed by a partner key, hosted; `community` = unsigned, the
 * index only LINKS the customer's repo, never hosts it. */
export const PackTierSchema = z.enum(["official", "partner", "community"]);
export type PackTier = z.infer<typeof PackTierSchema>;

/** One entry in the canonical index. Location is EXACTLY ONE of `path` (hosted
 * in the canonical tree — official/partner) or `repo` (a community link — the
 * index links, never hosts). The `sig`/`keyId`/`sha` fields are read by R2/R3;
 * they are optional here so an unsigned community entry validates. */
const PackIndexEntrySchema = z
  .object({
    id: z.string().min(1),
    tier: PackTierSchema,
    version: z.string().min(1), // semver of the pack
    relayCore: z.string().optional(), // semver range; R5 early-skip reads this
    entitlement: z.string().optional(), // "product:orionfold-relay" for premium
    // location — EXACTLY ONE of path (hosted) or repo (community-linked).
    path: z.string().optional(), // e.g. "packs/official/relay-crm"
    repo: z.string().optional(), // e.g. "github.com/jane/janes-invoice-pack"
    sha: z.string().optional(), // git sha / content hash for R2/R4 sha-verify
    sig: z.string().nullable().optional(), // ed25519 sig; null = unsigned (community)
    keyId: z.string().optional(), // which embedded key signed it (R3)
  })
  .strict()
  .refine((e) => (e.path ? 1 : 0) + (e.repo ? 1 : 0) === 1, {
    message: "index entry must have exactly one of path (hosted) or repo (linked)",
  });

export const PackIndexSchema = z
  .object({
    schema: z.literal("orionfold.packs/v1"),
    packs: z.array(PackIndexEntrySchema),
  })
  .strict();

export type PackIndex = z.infer<typeof PackIndexSchema>;
export type PackIndexEntry = z.infer<typeof PackIndexEntrySchema>;

/** Parse + validate already-fetched index JSON text. Throws a Zod error on any
 * malformed shape (unknown schema string, both/neither location, extra field).
 * R2 owns fetching the text; this stays network-free. */
export function parsePackIndex(json: string): PackIndex {
  return PackIndexSchema.parse(JSON.parse(json));
}

/** The index entry for a pack id, or undefined if it is not in the index. */
export function findIndexEntry(index: PackIndex, id: string): PackIndexEntry | undefined {
  return index.packs.find((p) => p.id === id);
}

// Re-export the entry schema so R2/R3 can validate a single entry in isolation.
export { PackIndexEntrySchema };
