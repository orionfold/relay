---
title: Canonical pack index — the `orionfold.packs/v1` machine-readable index (R1)
status: built
priority: P1
milestone: post-mvp
source: _IDEAS/packs-publish.md §4 (Pillar A) / §10 R1
dependencies: []
---

# Canonical pack index — the `orionfold.packs/v1` index (R1)

## Description

Today every pack ships as a **bundled template dir** in the npm payload
(`src/lib/packs/templates/`), resolved local-first by `catalog.ts`. There is no way for Relay
to learn about a pack it did not ship with — no canonical list of "what packs exist, at which
version, at which trust tier, requiring which core." This feature ships that list: a versioned,
machine-readable **pack index** published at a canonical Orionfold URL and *read* by Relay,
exactly the way `pricing.json` is a canonical SSOT the product reads and never writes.

The index is the **keystone of the whole distribution standard** — the remote resolver (R2)
consults it to fetch a pack, the provenance verifier (R3) reads each entry's `sig`+`keyId`, the
tarball diet (R4) reads it to fetch the long tail, and the community loop (R7) links a
customer's repo into it. Nothing else in `packs-publish.md` works until the index exists, which
is why it sequences first. It is a **schema + a published JSON file + a typed reader** — no
install-path change, no network fetch of packs yet (that is R2). Scoping it this way keeps blast
radius **S** and lets the schema + reader land and be tested against a fixture in isolation.

Per the phone-home promise (`README.md:107`, memory `phone-home-definition`), reading the index
is a **canonical READ from an Orionfold source** — promise-clean, the same shape as the
shipped `pricing.json` bare-GET (`check-price-drift.mjs`) and the `prebuilt-download.ts` GitHub
Releases GET (egress row #1). This spec adds the *schema and reader*; R2 adds the egress row.

## User Story

As Relay (the installer), I want a versioned canonical index of every published pack — its id,
tier, version, location, signature, and `relayCore` range — so that I can resolve, verify, and
compatibility-check a pack I did not ship with, from a single authoritative source that a newer
index and an older Relay both understand.

## Technical Approach

### The index schema — `orionfold.packs/v1`

A Zod-validated schema mirroring the `orionfold.pricing/v1` / `orionfold.license/v1` versioning
discipline (a `schema` discriminant so a newer index and an older Relay interoperate — additive
fields only; a breaking change majors the schema string and the old Relay refuses loudly).

Location: a new leaf module, e.g. `src/lib/packs/index-schema.ts` — kept a **zero-runtime-import
leaf** like `taxonomy.ts` / `pack-of.ts` (imports only `zod`), so it stays out of the
`catalog.ts` module-load-cycle blast radius (memory `shared-constant-zero-import-leaf`).

```ts
// src/lib/packs/index-schema.ts
import { z } from "zod";

export const PackTierSchema = z.enum(["official", "partner", "community"]);

const PackIndexEntrySchema = z.object({
  id: z.string().min(1),
  tier: PackTierSchema,
  version: z.string().min(1),           // semver of the pack
  relayCore: z.string().optional(),     // semver range; R5 early-skip reads this
  entitlement: z.string().optional(),   // "product:orionfold-relay" for premium
  // location — EXACTLY ONE of path (official/partner in the canonical tree) or repo (community).
  path: z.string().optional(),          // e.g. "packs/official/relay-crm"
  repo: z.string().optional(),          // e.g. "github.com/jane/janes-invoice-pack" (community links, never hosts)
  sha: z.string().optional(),           // git sha / content hash for R2/R4 sha-verify
  sig: z.string().nullable().optional(),// ed25519 sig; null = unsigned (community)
  keyId: z.string().optional(),         // which embedded key signed it (R3)
}).strict()
  .refine((e) => (e.path ? 1 : 0) + (e.repo ? 1 : 0) === 1, {
    message: "index entry must have exactly one of path (hosted) or repo (linked)",
  });

export const PackIndexSchema = z.object({
  schema: z.literal("orionfold.packs/v1"),
  packs: z.array(PackIndexEntrySchema),
}).strict();

export type PackIndex = z.infer<typeof PackIndexSchema>;
export type PackIndexEntry = z.infer<typeof PackIndexEntrySchema>;
```

### The typed reader — `loadPackIndex()`

A pure parse + lookup surface the R2 resolver and R3 verifier consume. **No network in this
spec** — the reader takes already-fetched JSON text (R2 owns the fetch + the egress row). This
keeps R1 pure and testable against a fixture, and keeps the one network call in exactly one
place (R2).

```ts
export function parsePackIndex(json: string): PackIndex { return PackIndexSchema.parse(JSON.parse(json)); }
export function findIndexEntry(index: PackIndex, id: string): PackIndexEntry | undefined {
  return index.packs.find((p) => p.id === id);
}
```

### The published `index.json` (Website-coordinated — open decision)

The canonical file itself is **published by the Website peer**, not by this repo — its location
(a `packs/` subtree in `github.com/orionfold/relay` vs. a dedicated `orionfold/relay-packs`
repo) and its exact URL are **open decision #1** (`packs-publish.md §12`), needing
`strategy/relay/_RELAY.md` coordination (the `pricing.json` SSOT-on-orionfold.com,
bare-GET/fail-open pattern is the template, memory `strategy-repo-readwrite-only` — edit the
mailbox, never commit). This spec ships the **schema + reader + a committed fixture**
(`src/lib/packs/__tests__/fixtures/pack-index.json`) so R2 can be built and tested before the
real URL is finalized; wiring the real URL is R2's job.

### Reconcile with the existing catalog listing

`listPackTemplates` (`catalog.ts`) enumerates *bundled* templates today. This index is the
*superset* view (bundled + remote). Do **not** merge them in this spec — R2 is where the
resolver reconciles "bundled dir wins, else consult index." Here the index is a standalone,
read-only data surface.

## Acceptance Criteria

- [x] `src/lib/packs/index-schema.ts` exists, exports `PackIndexSchema`, `PackIndexEntrySchema`,
      `PackIndex`, `PackIndexEntry`, `PackTierSchema`, and the `parsePackIndex` / `findIndexEntry`
      helpers, all Zod `.strict()`.
- [x] The module is a zero-runtime-import leaf — a unit test asserts importing it pulls no
      filesystem/DB/`catalog.ts` transitive import (only `zod`).
- [x] Schema rejects an entry with **both** `path` and `repo`, and an entry with **neither**
      (the exactly-one-location refine), with a named Zod error.
- [x] Schema rejects an unknown top-level `schema` string (only `orionfold.packs/v1` parses).
- [x] A committed fixture `pack-index.json` (official + partner + community entries) round-trips
      through `parsePackIndex` without error; `findIndexEntry(idx, "relay-crm")` returns the
      official entry, an unknown id returns `undefined`.
- [x] A `strategy/relay/_RELAY.md` coordination note is drafted for the Website peer covering the
      canonical index URL + versioning (open decision #1) — drafted, not committed to strategy.
- [x] `npm test` green (0 new regressions vs. the known pre-existing failures).

## Scope Boundaries

**Included:**
- The `orionfold.packs/v1` Zod schema + typed reader (pure, leaf module).
- A committed test fixture index.
- The `_RELAY.md` coordination note for the canonical URL.

**Excluded (separate requirements):**
- **Fetching** a pack via the index → `pack-remote-resolver.md` (R2). The index reader is
  network-free here; R2 owns the one GET + the `data-flow.md` egress row.
- **Verifying** an entry's `sig`/`keyId` → `pack-provenance-tiers.md` (R3).
- **Publishing** the real `index.json` (Website peer's job) and finalizing its URL (open
  decision #1).
- Any change to `install.ts` / `catalog.ts` resolution behavior — data + reader only.

## References

- Source: `_IDEAS/packs-publish.md` §4 (Pillar A — the layout + the versioned index) + §10 R1 +
  §9 (index-first sequencing).
- SSOT + versioning precedent: `scripts/check-price-drift.mjs:29`
  (`https://orionfold.com/relay/pricing.json`, bare-GET / fail-open / SSOT-on-orionfold.com) and
  the `orionfold.license/v1` schema string.
- Purity / leaf-module precedent: `src/lib/packs/taxonomy.ts`, `src/lib/apps/pack-of.ts`.
- Enables: `pack-remote-resolver.md` (R2), `pack-provenance-tiers.md` (R3), `pack-tarball-diet.md`
  (R4), `pack-community-publish.md` (R7) — all read this index.
- Open decision #1 (Website-coordinated): canonical index location + URL + versioning.
- Memory: `shared-constant-zero-import-leaf`, `strategy-repo-readwrite-only`,
  `phone-home-definition`, `check-git-history-for-prior-art`.
