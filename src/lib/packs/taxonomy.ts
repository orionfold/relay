// Pack taxonomy — the codified owned-primitive registry (R1).
//
// This is the machine-checked SINGLE SOURCE OF TRUTH for "which pack owns which
// logical primitive id, of which kind, with which column contract." It lifts
// the registry that used to live only in the `features/pack-taxonomy.md`
// markdown table into a typed, Zod-validated data structure the tooling reads.
//
// WHY it exists: logical primitive ids (table ids, schedule ids inside a
// manifest) are NOT namespaced — sharing a logical id across packs is how
// composition works (Agency Pro layers a trigger onto the free spine's `intake`
// table by referencing the id `intake`). So a logical id is a SHARED NAME WITH
// EXACTLY ONE OWNER. A second pack that *redefines* it with different columns
// either silently creates a divergent second table (side-by-side install,
// `install.ts` createTable mints a fresh UUID) or refuses the merge (bundle
// flatten, `bundle.ts` BundleCollisionError). Both are bugs. This registry is
// the contract that the R3 CI gate (`scripts/check-pack-taxonomy.mjs`) enforces
// against every manifest at author time.
//
// PURE BY DESIGN — no filesystem, no DB, no runtime-registry-adjacent imports
// (mirrors the discipline in `pack-of.ts`, which is I/O-free so it is safe to
// import anywhere). This keeps the module out of the
// `@/lib/agents/runtime/catalog.ts` module-load-cycle blast radius entirely.
//
// The `.mjs` build gate cannot import this `.ts` file (it runs under plain
// `node` at publish time, via `scripts/npx-prod-smoke.mjs`). So this module is
// ALSO mirrored into a checked-in `taxonomy.json` that the gate reads. The two
// are kept in lockstep by `taxonomy.test.ts` (json-in-sync assertion) — edit
// this `.ts` file, then run `node scripts/generate-taxonomy-json.mjs` to
// regenerate the JSON. Never hand-edit `taxonomy.json`.
import { z } from "zod";

/** The four pack kinds (`packs-evolution.md §3`) plus `bundle`. Decides what a
 * pack may own vs. must build on. */
export const PackKindSchema = z.enum([
  "persona",
  "industry",
  "automation",
  "functional",
  "bundle",
]);
export type PackKind = z.infer<typeof PackKindSchema>;

/** Ownership record for one logical TABLE id. `columns` is the registered
 * contract — the R3 gate flags any declaring manifest whose columns differ. */
const TableOwnershipSchema = z
  .object({
    owner: z.string().min(1), // pack id, e.g. "relay-agency"
    kind: PackKindSchema,
    columns: z.array(z.string().min(1)).min(1),
    note: z.string().optional(), // "built on by" prose, optional
  })
  .strict();

/** Ownership record for one logical SCHEDULE id. */
const ScheduleOwnershipSchema = z
  .object({
    owner: z.string().min(1),
    kind: PackKindSchema,
    note: z.string().optional(),
  })
  .strict();

export const TaxonomySchema = z
  .object({
    tables: z.record(z.string(), TableOwnershipSchema),
    schedules: z.record(z.string(), ScheduleOwnershipSchema),
    // joinKeys deliberately DEFERRED to R7 (integration contract) — not here.
  })
  .strict();

export type Taxonomy = z.infer<typeof TaxonomySchema>;

/**
 * The owned-primitive registry — seeded VERBATIM from the shipped pack
 * manifests (columns read from each pack's `base/manifest.yaml`, not the doc's
 * prose summaries — `pipeline` in particular is `(new-business stages)` prose in
 * the markdown but really `[prospect, stage, value, owner, notes]`).
 *
 * Verified 2026-07-06 against:
 *   relay-agency, relay-cre, relay-nonprofit, relay-agency-pro, relay-crm,
 *   relay-social, relay-web-assets, relay-web-publisher
 *   (each pack's base/manifest.yaml).
 */
export const TAXONOMY: Taxonomy = {
  tables: {
    // ── Agency persona family ───────────────────────────────────────────
    clients: {
      owner: "relay-agency",
      kind: "persona",
      columns: ["name", "engagement_type", "tier", "status", "health"],
      note: "The client book. Industry packs seed verticals into it via seed/customers.yaml, never redeclare it.",
    },
    engagements: {
      owner: "relay-agency",
      kind: "persona",
      columns: ["client", "date", "category", "description", "amount", "status"],
      note: "The signed-amount ledger (margin cockpit source). relay-agency-pro re-lists it to attach automation.",
    },
    intake: {
      owner: "relay-agency",
      kind: "persona",
      columns: ["client", "service", "source", "status", "notes"],
      note: "The work queue. relay-agency-pro attaches a row-insert trigger. Ships empty.",
    },
    pipeline: {
      owner: "relay-agency",
      kind: "persona",
      columns: ["prospect", "stage", "value", "owner", "notes"],
      note: "The lead→signed new-business pipeline.",
    },
    // ── Industry verticals ──────────────────────────────────────────────
    rent_roll: {
      owner: "relay-cre",
      kind: "industry",
      columns: ["property", "tenant", "base_rent", "expiry", "escalation", "option"],
      note: "CRE's distinct vertical primitive; carries the lease-abstraction row-insert trigger. Ships empty.",
    },
    grants: {
      owner: "relay-nonprofit",
      kind: "industry",
      columns: ["client", "funder", "program", "amount", "deadline", "stage", "notes"],
      note: "Nonprofit's distinct vertical primitive; carries the grant-pipeline-deep row-insert trigger. Ships empty.",
    },
    // ── Marketing family (Functional line — disjoint from Agency) ────────
    leads: {
      owner: "relay-crm",
      kind: "functional",
      columns: [
        "display_name",
        "email",
        "stage",
        "direct_status",
        "segment",
        "source_origin",
        "source_campaign",
        "owner",
        "last_touch",
        "notes",
      ],
      note: "The core CRM record (two-axis lifecycle). Carries the lead-enrich trigger → ships empty. source_campaign == campaigns.utm_campaign is the intra-bundle join key.",
    },
    lead_research: {
      owner: "relay-crm",
      kind: "functional",
      columns: [
        "lead_id",
        "target_offering",
        "fit_score",
        "role",
        "company",
        "location",
        "likely_pain",
        "latent_need",
        "email_status",
        "last_researched",
      ],
      note: "The public-research dossier. Seeded (not trigger-bound).",
    },
    consent_policy: {
      owner: "relay-crm",
      kind: "functional",
      columns: ["basis", "mailable", "scope", "jurisdiction", "cadence_cap", "notes"],
      note: "The consent guardrail as data, read by the outreach-guard profile. Seeded.",
    },
    content_assets: {
      owner: "relay-social",
      kind: "functional",
      columns: [
        "title",
        "type",
        "collection",
        "funnel_stage",
        "promotes",
        "repurpose_status",
        "priority",
        "owner",
      ],
      note: "Source content (supply side). Carries the repurpose row-insert trigger. Seeded.",
    },
    creatives: {
      owner: "relay-social",
      kind: "functional",
      columns: ["parent", "promotes", "channel", "format", "campaign", "status", "hook", "cta"],
      note: "Channel-ready drafts — the output of repurpose/welcome-creative. Ships empty.",
    },
    campaigns: {
      owner: "relay-social",
      kind: "functional",
      columns: [
        "promotes",
        "funnel_stage",
        "starts",
        "ends",
        "status",
        "utm_campaign",
        "impressions",
        "clicks",
        "signups",
      ],
      note: "Demand-gen initiatives. utm_campaign is the join key CRM leads.source_campaign references. Seeded.",
    },
    channels: {
      owner: "relay-social",
      kind: "functional",
      columns: [
        "platform",
        "handle",
        "url",
        "funnel_role",
        "audience",
        "last_refreshed",
        "refresh_status",
      ],
      note: "Publishing surfaces. Seeded.",
    },
    ad_initiatives: {
      owner: "relay-social",
      kind: "functional",
      columns: [
        "title",
        "intent_kind",
        "status",
        "attached_campaign",
        "primary_kpi",
        "budget_envelope_usd",
        "target_cac_usd",
      ],
      note: "The paid side. Seeded lightly.",
    },
    // ── Web Designer family (Functional line) ──────────────────────────
    web_assets: {
      owner: "relay-web-assets",
      kind: "functional",
      columns: [
        "title",
        "asset_type",
        "page_role",
        "audience",
        "summary",
        "status",
        "source_note",
        "image_url",
        "reference_url",
        "sort_order",
      ],
      note: "The reusable web-design asset library. Rendered through the gallery preview primitive.",
    },
    web_sections: {
      owner: "relay-web-publisher",
      kind: "functional",
      columns: [
        "kind",
        "heading",
        "body",
        "order",
        "ctaLabel",
        "ctaUrl",
        "imageUrl",
        "status",
        "notes",
      ],
      note: "The ordered static-site section table read by the static-site generator.",
    },
    web_templates: {
      owner: "relay-web-templates",
      kind: "functional",
      columns: [
        "id",
        "version",
        "name",
        "description",
        "provenance",
        "compatibility",
        "supportedSectionKinds",
        "allowedControls",
        "previewFixtures",
        "layout",
      ],
      note: "The declarative static-site template catalog used by Web Designer and Web Publisher.",
    },
  },
  schedules: {
    "month-end-close": {
      owner: "relay-agency-pro",
      kind: "automation",
      note: "Installed as composite id app:relay-agency-pro:month-end-close.",
    },
    "lead-poller": {
      owner: "relay-crm",
      kind: "functional",
      note: "relay-crm--outreach-loop — the 4×/day list-hygiene pass.",
    },
    "content-cadence": {
      owner: "relay-social",
      kind: "functional",
      note: "relay-social--campaign-launch — the weekly posting companion.",
    },
  },
};

/** Validate and return the registry. Throws a Zod error on a malformed shape. */
export function loadTaxonomy(): Taxonomy {
  return TaxonomySchema.parse(TAXONOMY);
}

/** The registered owner pack id for a logical table id, or undefined. */
export function ownerOfTable(id: string): string | undefined {
  return TAXONOMY.tables[id]?.owner;
}

/** The registered owner pack id for a logical schedule id, or undefined. */
export function ownerOfSchedule(id: string): string | undefined {
  return TAXONOMY.schedules[id]?.owner;
}

/** The registered column contract for a logical table id, or undefined. */
export function registeredColumns(id: string): string[] | undefined {
  return TAXONOMY.tables[id]?.columns;
}
