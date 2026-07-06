---
title: Pack taxonomy codified — the machine-checked registry (R1)
status: shipped
priority: P1
milestone: post-mvp
source: _IDEAS/packs-robustify.md §4 Pillar A / §10 R1
dependencies: []
---

# Pack taxonomy codified — the machine-checked registry (R1)

## Description

`features/pack-taxonomy.md` is the single most important scaling constraint the pack system
has — the registry of which pack owns which logical primitive id — and today it is **a markdown
table a human reviewer diffs**. The only code enforcement is `BundleCollisionError`
(`src/lib/packs/bundle.ts`, raised from `claimIds` at :45), and it fires **only when two ids
collide inside a bundle flatten**. Two packs that each declare a `clients` table and are installed
**side-by-side** hit no error at all — `createTable` mints two fresh UUID tables (`install.ts:252`)
and the second silently diverges. At hundreds of packs the markdown registry is a reviewer
bottleneck and the side-by-side path is a silent-corruption hole.

This feature lifts the registry from prose into a **machine-checked data file the product reads**:
`src/lib/packs/taxonomy.ts` — a typed, Zod-validated single source of truth for "which pack owns
which logical id, of which kind, with which column contract." It is the SSOT that the R3 CI gate
(`pack-taxonomy-ci-gate.md`), the future R2 install-time collision check, and the `ainative-app`
authoring skill all read — one file, no drift between doc and code.

This is R1 in `_IDEAS/packs-robustify.md` — the foundation the two CI gates stand on. It is a
**data file + typed loader only**: no install-time behavior change, no CI gate, no runtime-registry
imports. Those are separate, dependent requirements (R3, R2). Scoping it this way keeps blast radius
**S** and lets it land and be tested in isolation before anything enforces against it.

## User Story

As a pack author (human or LLM via the `ainative-app` skill), I want the owned-primitive registry
to be a checked data structure the tooling reads, so that "which pack owns `clients`" has one
authoritative answer that gates and skills consume identically — instead of a markdown table that
can silently drift from the code that installs packs.

## Technical Approach

### The data file — `src/lib/packs/taxonomy.ts`

A typed, Zod-validated module. Shape (illustrative; finalize field names at build time against the
existing registry rows in `features/pack-taxonomy.md`):

```ts
// src/lib/packs/taxonomy.ts
import { z } from "zod";

export const PackKindSchema = z.enum(["persona", "industry", "automation", "functional", "bundle"]);

const TableOwnershipSchema = z.object({
  owner: z.string().min(1),                    // pack id, e.g. "relay-agency"
  kind: PackKindSchema,
  columns: z.array(z.string().min(1)),         // the registered column contract
  note: z.string().optional(),                 // "built on by" prose, optional
});

const ScheduleOwnershipSchema = z.object({
  owner: z.string().min(1),
});

export const TaxonomySchema = z.object({
  tables: z.record(z.string(), TableOwnershipSchema),
  schedules: z.record(z.string(), ScheduleOwnershipSchema),
  // joinKeys deliberately DEFERRED to R7 (integration contract) — not in this scope.
}).strict();

export type Taxonomy = z.infer<typeof TaxonomySchema>;

export const TAXONOMY: Taxonomy = { /* the 17 tables + 3 schedules below, verbatim from the doc */ };
```

Seed it **verbatim from the current `features/pack-taxonomy.md` Owned-primitives registry** (verified
2026-07-06):

- **Tables (owner · columns):**
  - `clients` — `relay-agency` (persona) — `name, engagement_type, tier, status, health`
  - `engagements` — `relay-agency` (persona) — `client, date, category, description, amount, status`
  - `intake` — `relay-agency` (persona) — `client, service, source, status, notes`
  - `pipeline` — `relay-agency` (persona) — (new-business stages)
  - `rent_roll` — `relay-cre` (industry) — `property, tenant, base_rent, expiry, escalation, option`
  - `grants` — `relay-nonprofit` (industry) — `client, funder, program, amount, deadline, stage, notes`
  - `leads` — `relay-crm` (functional) — `display_name, email, stage, direct_status, segment, source_origin, source_campaign, owner, last_touch, notes`
  - `lead_research` — `relay-crm` (functional) — `lead_id, target_offering, fit_score, role, company, location, likely_pain, latent_need, email_status, last_researched`
  - `consent_policy` — `relay-crm` (functional) — `basis, mailable, scope, jurisdiction, cadence_cap, notes`
  - `content_assets` — `relay-social` (functional) — `title, type, collection, funnel_stage, promotes, repurpose_status, priority, owner`
  - `creatives` — `relay-social` (functional) — `parent, promotes, channel, format, campaign, status, hook, cta`
  - `campaigns` — `relay-social` (functional) — `promotes, funnel_stage, starts, ends, status, utm_campaign, impressions, clicks, signups`
  - `channels` — `relay-social` (functional) — `platform, handle, url, funnel_role, audience, last_refreshed, refresh_status`
  - `ad_initiatives` — `relay-social` (functional) — `title, intent_kind, status, attached_campaign, primary_kpi, budget_envelope_usd, target_cac_usd`
- **Schedules (owner):**
  - `month-end-close` — `relay-agency-pro`
  - `lead-poller` — `relay-crm`
  - `content-cadence` — `relay-social`

> `pipeline`'s columns are prose ("new-business stages") in the doc — read the real column list from
> `relay-agency/base/manifest.yaml` at build time and record the actual column names, so the R3
> column-drift check has a true baseline. Same for any row whose columns are summarized rather than
> enumerated.

### The typed loader — `loadTaxonomy()`

A pure function that returns the validated `TAXONOMY` and exposes lookups the gate + skill need:

```ts
export function loadTaxonomy(): Taxonomy { return TaxonomySchema.parse(TAXONOMY); }
export function ownerOfTable(id: string): string | undefined { return TAXONOMY.tables[id]?.owner; }
export function ownerOfSchedule(id: string): string | undefined { return TAXONOMY.schedules[id]?.owner; }
export function registeredColumns(id: string): string[] | undefined { return TAXONOMY.tables[id]?.columns; }
```

**PURE by design** — no filesystem, no DB, no runtime-registry-adjacent imports (mirror the discipline
in `pack-of.ts`, which is deliberately I/O-free so it is safe to import anywhere). This keeps the
module out of the `@/lib/agents/runtime/catalog.ts` module-load-cycle blast radius entirely.

### Keep the markdown, make it derived

`features/pack-taxonomy.md` stays as the human-readable authoring doc, but its Owned-primitives
registry becomes **derived from / reconciled against** `taxonomy.ts`. Add a one-line pointer at the
top of the markdown registry section: "Source of truth: `src/lib/packs/taxonomy.ts` (R1). This table
mirrors it." The R3 gate (separate spec) is what enforces they stay in sync with the actual manifests.

### `ainative-app` skill touchpoint

Update `.claude/skills/ainative-app/SKILL.md:82` (the "reconcile against `pack-taxonomy.md`"
paragraph) to also name `src/lib/packs/taxonomy.ts` as the codified SSOT the gate reads. One-line
addition; the skill still points authors at the markdown for prose.

## Acceptance Criteria

- [ ] `src/lib/packs/taxonomy.ts` exists, exports `TAXONOMY`, `TaxonomySchema`, `Taxonomy`, and the
      four lookup helpers, and is Zod-validated (`.strict()`).
- [ ] `TAXONOMY` contains all 14 tables + 3 schedules currently in `features/pack-taxonomy.md`, with
      owners and column contracts matching the shipped pack manifests (columns read from the real
      manifests, not the doc's prose summaries, where they differ).
- [ ] The module is pure — a unit test importing it triggers **no** filesystem/DB access and no
      runtime-registry import (assert by import alone; it must not pull `catalog.ts` transitively).
- [ ] Unit test: `loadTaxonomy()` round-trips through `TaxonomySchema.parse` without error; a
      malformed fixture (duplicate-less record with a bad shape) is rejected with a Zod error.
- [ ] Unit test: `ownerOfTable("clients") === "relay-agency"`, `ownerOfSchedule("lead-poller") ===
      "relay-crm"`, and an unregistered id returns `undefined`.
- [ ] `features/pack-taxonomy.md` registry section names `taxonomy.ts` as the source of truth.
- [ ] `.claude/skills/ainative-app/SKILL.md` references `taxonomy.ts` alongside the markdown.
- [ ] `npm test` green (0 new regressions vs. the 8 known pre-existing failures).

## Scope Boundaries

**Included:**
- The typed, Zod-validated `taxonomy.ts` data file seeded from the current registry.
- The pure typed loader + lookup helpers.
- Doc + skill pointers naming it the SSOT.
- Unit tests for the loader, purity, and lookups.

**Excluded (separate requirements):**
- The **CI gate** that parses manifests and fails the build on drift → `pack-taxonomy-ci-gate.md` (R3).
- The **install-time cross-pack collision check** → R2 (later).
- **`joinKeys`** / the integration contract → R7 (later). Deliberately omitted from the schema now;
  add the `joinKeys` record when R7 is groomed.
- Any change to `install.ts` / `bundle.ts` runtime behavior. This is data + loader only.
- Generating the markdown from the data file (leave markdown hand-maintained-but-reconciled; a
  generator is a nice-to-have, not required for the gate to work).

## References

- Source: `_IDEAS/packs-robustify.md` §4 (Pillar A) + §10 R1 + §11 (sequencing: R1 → R3 → R2).
- The registry being codified: `features/pack-taxonomy.md` (Owned-primitives registry, verified
  2026-07-06 against `format.ts`, `bundle.ts:45` `claimIds`, `install.ts:252` `createTable`).
- Purity precedent: `src/lib/apps/pack-of.ts` (I/O-free by design, safe to import anywhere).
- Enables: `pack-taxonomy-ci-gate.md` (R3) — the gate reads this file.
- Memory: `pack-taxonomy-shared-registry`, `pack-of-is-primitive-pack-resolver`,
  `shared-constant-zero-import-leaf` (keep the module a zero-runtime-import leaf).
