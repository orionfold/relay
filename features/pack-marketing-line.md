---
title: Marketing line — relay-crm + relay-social bundled from a synthetic functional model
status: groomed
priority: P2
milestone: post-mvp
source: _IDEAS/packs-evolution.md §8.3 + §3 + Appendix
dependencies: [pack-bundle-model, pack-agency-bundle, pack-primitive-resurface]
groomed: 2026-07-06 (north-star surveyed; primitives mapped; slice sequenced)
---

# Marketing line — a Functional depth bundle

## Description

> **Operator decision (2026-07-05):** Marketing is **no longer the first bundle proof** — that
> is now `pack-agency-bundle` (Agency→CRE), because published marketing assets already exist for
> the Agency persona (warm audience, compounds existing work). Marketing **demotes to a later
> Functional depth pack** (P1→P2). It still proves the *Functional-category* bundle shape and
> the richest harvest, just after the Agency bundle has proven the mechanism.
>
> **That demotion reason is now spent** (Agency→CRE shipped in 0.32.0, `a03e53dd`). Marketing is
> the natural next arc; it proves the *splitting* bundle (one purchase → two composed function
> packs) that the single-vertical Agency-for-CRE bundle never exercised.

Marketing is a **Functional-category** pack (`§3`: "my team *does* Marketing") that splits into
`relay-crm` + `relay-social` (with `relay-campaigns` folded into `relay-social` for the first
proof), bundled and installed as one "Marketing" app, modeled from the functional shape of a
marketing operating system and seeded with synthetic examples only.

This feature authors those two child packs and the `relay-marketing` bundle pack. It is the
concrete proof that a *splitting* pack (one purchase, multiple composed primitives from **two
different function domains**) works end to end — the capability a single-vertical industry pack
never needed.

### How Marketing differs from the Agency family (the family-boundary decision)

The Agency family is a **persona spine** (`relay-agency`, free) + **industry verticals**
(`relay-cre`, `relay-nonprofit`, paid) + a **bundle** that flattens spine+vertical. Marketing is
**not** part of that family — it is a Functional pack with no shared persona spine. Consequence,
locked this grooming pass:

- **relay-crm owns its own `leads` table.** It does NOT build on `relay-agency`'s `pipeline`
  (prospect→lead→…→won) or `clients`. Those belong to the Agency operating system. A Marketing
  operator installs the Marketing bundle as its **own app**, not on the Agency spine. Reusing the
  Agency `pipeline` id would either couple two unrelated families or collide under a future
  cross-family install. So the Marketing line is **self-contained**: relay-crm owns `leads`
  (+ `contacts`-as-`leads` two-axis lifecycle), relay-social owns the content/campaign/channel
  tables, and the bundle flattens the two. See `pack-taxonomy.md` — this adds a new owned-table
  block for the Marketing family, disjoint from the Agency family's ids.

## User Story

As a marketing operator, I want to install one "Marketing" pack and get a CRM + social pipeline
composed together — leads captured from campaigns, campaign performance read against my lead
book, social posts firing off new leads — so that I run my marketing function on Relay without
wiring two separate apps by hand.

## Technical Approach

Model the working domain first, then ship synthetic public examples. Each entity maps to a Relay
table, and each roster maps to a view. Translate the domain shape below into two pristine
`AppManifest`s + a bundle descriptor. **No new engine seam** — all composition rides on
`pack-bundle-model`'s flatten path (proven by `relay-agency-cre`); this spec is pack content plus
one bundle descriptor.

### Pack A — `relay-crm` (child, owns the lead book)

Directory `src/lib/packs/templates/relay-crm/` mirroring the `relay-cre` layout
(`pack.yaml` + `base/{manifest.yaml, profiles/, blueprints/, seed/}`).

**Tables** (logical ids OWNED by relay-crm — new owners in `pack-taxonomy.md`):

| Logical id | Columns (harvested, trimmed to Relay shape) | Notes |
| --- | --- | --- |
| `leads` | `id, display_name, email, stage, segment, source_origin, source_campaign, owner, last_touch, notes` | The core CRM record. `stage` enum = `lead → subscriber → engaged → qualified → customer → champion`. **Trigger-bound → ships EMPTY** (a magnet-form/import row-insert fires the enrich blueprint). `source_campaign` is the join key to relay-social's `campaigns.id` (== `utm_campaign`). |
| `lead_research` | `lead_id, target_offering, fit_score, role, company, location, likely_pain, latent_need, email_status, last_researched` | Public-research dossier (one per direct-engagement lead). Seeded with 2–3 synthetic examples. |
| `consent_policy` | `basis, mailable, scope, jurisdiction, cadence_cap, notes` | The guardrail record, so the outreach-guard profile reads policy from a table, not code. Seeded with synthetic policy examples. |

> **Two-axis lifecycle** (preserve from north-star): a lead carries both `stage` (list
> lifecycle) and a `direct_status` (`research_queue → ready_to_contact → awaiting_reply →
> follow_up_due → do_not_contact | converted`). For the first proof, fold `direct_status` into a
> column on `leads` rather than a second table — keep the shape minimal, expand later.

**Profiles** (namespaced `relay-crm--`, modeled from the lead workflow):
- `relay-crm--lead-pipeline` — the CRM owner/operator (files leads, reconciles, promotes stages).
- `relay-crm--lead-screen` — the intake quality gate (6 gates: email-reality, jurisdiction,
  guardrail, dedup, zero-fabrication, fit-floor).
- `relay-crm--outreach-guard` — the pre-send compliance gate (channel routing, CAN-SPAM, GDPR,
  cadence cap read from `consent_policy`).

**Blueprints** (namespaced `relay-crm--`):
- `relay-crm--lead-enrich` — **row-insert trigger on `leads`**: a new lead is researched +
  screened + fit-scored, writing a `lead_research` row. (This is the trigger that mandates
  `leads` ship empty.)
- `relay-crm--outreach-loop` — research-direct → draft → outreach-guard go/fix/no-go → log touch
  → follow-up-due. On-demand (no trigger).

**Schedules** (namespaced): `relay-crm--lead-poller` — the 4×/day list-hygiene pass, reconciling
stale leads. (Logical id `lead-poller`, owned by relay-crm in the taxonomy schedules table.)

**View:** `kit: workflow-hub`, hero = `leads`, secondary = the outreach-loop + enrich blueprints,
runs = outreach-loop. KPIs (standard, resurfaced primitives — see §"Charts"): mailable %,
lead-count-by-stage bar, by-origin attribution table.

### Pack B — `relay-social` (child, owns content + campaigns + channels + ads)

Directory `src/lib/packs/templates/relay-social/`.

**Tables** (logical ids OWNED by relay-social):

| Logical id | Columns | Notes |
| --- | --- | --- |
| `content_assets` | `id, title, type, collection, funnel_stage, promotes, repurpose_status, priority, owner` | Source content (the supply side). `repurpose_status`: `none → planned → drafted → published`. Seeded. |
| `creatives` | `id, parent, promotes, channel, format, campaign, status, hook, cta` | Channel-ready social drafts. `status`: `planned → drafted → scheduled → published`. **Trigger-bound → ships EMPTY** (a new content asset can fire a repurpose blueprint). |
| `campaigns` | `id, promotes, funnel_stage, starts, ends, status, utm_campaign, impressions, clicks, signups` | Demand-gen initiatives. `status`: `planned → scheduled → live → completed | paused`. `id == utm_campaign` — **the join key back to `leads.source_campaign`.** Seeded (real: `2026-q3-ai-native-series`). |
| `channels` | `id, platform, handle, url, funnel_role, audience, last_refreshed, refresh_status` | Publishing surfaces. `funnel_role`: `reach | engagement | conversion | revenue`. Seeded. |
| `ad_initiatives` | `id, title, intent_kind, status, attached_campaign, primary_kpi, budget_envelope_usd, target_cac_usd` | The paid side. `status`: `proposed → approved → live → paused | completed`. Seeded lightly. |

**Profiles** (namespaced `relay-social--`, modeled from the content/campaign/ad workflow):
- `relay-social--content-studio` — inventory + repurpose planner (writes the creative brief).
- `relay-social--campaign-runner` — launch/schedule/publish-helper/measure.
- `relay-social--advertising-advisor` — paid strategist (CAC/ROAS gates, stop-loss/scale-up).

**Blueprints** (namespaced `relay-social--`):
- `relay-social--repurpose` — **row-insert trigger on `content_assets`**: a new content asset is
  repurposed into channel-native `creatives` drafts. (Mandates `creatives` ship empty.)
- `relay-social--campaign-launch` — plan → schedule → publish-helper → measure (advances a
  campaign through its lifecycle, writes back `impressions/clicks/signups`). On-demand.

**Schedules** (namespaced): `relay-social--content-cadence` — the weekly "today + next 7 days"
posting companion (logical id `content-cadence`, owned by relay-social).

**View:** `kit: workflow-hub`, hero = `campaigns`, secondary = campaign-launch + repurpose,
runs = campaign-launch.

### The intra-bundle binding spine (AC-3, the whole point of the split)

The two children are bound by **`utm_campaign`** — verified as the real join key in the
north-star (campaign board reads "attributed funnel outcomes keyed by `utm_campaign`"). After the
bundle flatten both tables live in ONE app, so these bindings resolve intra-app (same as
relay-cre's lease-abstraction trigger firing on the merged app's `rent_roll`):

1. **Campaign KPI reads the lead book (cross-child READ).** A `relay-social` view KPI on the
   `campaigns` hero reads `relay-crm`'s `leads` table, counting `leads` where
   `source_campaign == campaigns.utm_campaign` and `stage ∈ {subscriber, customer, champion}`.
   This is the "attributed funnel outcomes" panel — a standard KPI/table binding reading a
   sibling-owned table. **Must resolve to the real UUID post-flatten (no silent 0-read).**
2. **New lead fires a social/nurture step (cross-child TRIGGER).** A row-insert into `relay-crm`'s
   `leads` (from a magnet-form capture) is legal for a `relay-social` blueprint to react to,
   because the flatten puts both in the same app. First proof: the `relay-crm--lead-enrich`
   trigger is sufficient to prove the trigger seam; a `relay-social` reaction (e.g. "new
   subscriber → queue a welcome creative") is the concrete cross-child trigger to demonstrate.

**Ownership rule (locked):** `leads` is owned by `relay-crm` ONLY. `relay-social` **references**
it in a KPI binding — it never redeclares it in its own `tables:`. This is the exact
`clients`-discipline `relay-cre` follows (`pack-taxonomy.md` rule 2). A redeclare = a
`BundleCollisionError` under the flatten, by design.

### Pack C — `relay-marketing` (the bundle)

Directory `src/lib/packs/templates/relay-marketing/pack.yaml`, mirroring `relay-agency-cre`:
- Owns NO `base/manifest.yaml` — only identity, entitlement, and `bundle: [relay-crm,
  relay-social]`.
- `entitlement: product:orionfold-relay` (one license unlocks every paid pack — NOT a separate
  SKU; memory `packs-license-price-is-shared-not-per-pack`).
- `price` object matched to `orionfold.com/relay/pricing.json` at release (`$349` intro / `$499`
  list), rendered via `packPrice()`.
- `bundle` order = merge order: `relay-crm` first (owns the `leads` book + the merged app hero
  is the lead pipeline), `relay-social` second (adds campaigns/content on top).
- `changelog:` line for `0.1.0` (customer-voice; REQUIRED — feeds license status / 402 / /packs
  card / renewal email).

### Charts — what is standard vs. what is a build ticket (§6 discipline)

The north-star survey settled this concretely:

- **Everything the first proof needs is standard** and covered by `pack-primitive-resurface`
  (wave-1, shipped): lead-count-by-stage **bar**, campaign KPI **tiles**, attribution **table +
  status chip**, velocity **line**, channel-freshness **table**. No escape hatch, no new
  component.
- **The one non-standard chart is OUT of scope**: the horizontal **funnel band-flow** panel
  (Attract → Capture → Nurture → Convert with inter-band conversion arrows). The north-star
  *itself* declined D3/Sankey as YAGNI and hand-rolled HTML bands. Per §6 ("build a new primitive
  only when a selected pack concretely needs it"), this is a deliberate **build ticket carried to
  `pack-depth-next-wave`** (a `funnel-flow` Core primitive: Zod arm + evaluator + kit) — NOT
  built here. The Marketing bundle ships with the standard KPI/bar/table treatment of the same
  data; the band-flow is a later visual upgrade, not a blocker.
- **Cohort grid: explicitly declined** (north-star: "honest about small-N rather than inventing a
  cohort-tracked rate the data can't support"). Not built anywhere until real demand.

**Smoke budget** (CLAUDE.md — pack install is runtime-registry-adjacent): after authoring, run a
real `npm run dev` and (1) install `relay-crm` standalone → app renders, lead-enrich fires on a
row-insert; (2) install `relay-social` standalone → renders; (3) install the `relay-marketing`
bundle → merged app renders, the campaign-KPI-reads-leads binding resolves to a real UUID (assert
non-zero, no silent 0-read), a new `leads` row fires the cross-child trigger. Copy
`relay-agency-bundle-template.test.ts` as the automated pattern; the dev-server smoke is the gate
unit tests can't replace.

## Acceptance Criteria

- [ ] `relay-crm` exists as an in-tree child pack (owns `leads` + `lead_research` +
      `consent_policy`, 3 `relay-crm--` profiles, `lead-enrich` row-insert trigger blueprint,
      `lead-poller` schedule), installable standalone, and seeded with synthetic examples.
- [ ] `relay-social` exists as an in-tree child pack (owns `content_assets` + `creatives` +
      `campaigns` + `channels` + `ad_initiatives`, 3 `relay-social--` profiles, `repurpose`
      row-insert trigger blueprint, `content-cadence` schedule), installable standalone.
- [ ] `relay-marketing` is a bundle pack (per `pack-bundle-model`) that merges both children into
      one installed Marketing app, entitlement `product:orionfold-relay`, `price` matched to
      `pricing.json`, `changelog:` line present.
- [ ] **Cross-child READ works post-merge:** a `relay-social` campaign KPI reads `relay-crm`'s
      `leads` table by `utm_campaign` and resolves to the real UUID with a non-zero attributed
      count — no silent 0-read.
- [ ] **Cross-child TRIGGER works post-merge:** a row-insert into `leads` fires a blueprint in the
      flattened app (proven by `lead-enrich`; a `relay-social` reaction demonstrated).
- [ ] `leads` and `creatives` (trigger-bound) ship EMPTY; `campaigns`/`channels`/`content_assets`/
      `lead_research`/`consent_policy` ship with synthetic seeded rows.
- [ ] `pack-taxonomy.md` is updated in the SAME change with the Marketing family's owned tables +
      schedules (disjoint from the Agency family ids); no logical-id has two owners.
- [ ] The Marketing bundle installs, renders, and runs end to end under a `npm run dev` smoke; the
      automated bundle-template test (copy of `relay-agency-bundle-template.test.ts`) passes.
- [ ] Any chart the bundle ships is standard/resurfaced; the funnel band-flow is carried to
      `pack-depth-next-wave` as a build ticket, not a manifest escape hatch here.

## Scope Boundaries

**Included:**
- Authoring `relay-crm` + `relay-social` child packs + the `relay-marketing` bundle.
- Authoring the domain model, synthetic seed rows, and guardrails.
- Updating `pack-taxonomy.md` with the new Marketing-family owned ids.
- A bundle-template test + a dev-server smoke.

**Excluded:**
- The bundle-merge mechanism itself (`pack-bundle-model` — hard dependency, shipped).
- A separate `relay-campaigns` child (folded into `relay-social` for the first proof; split out
  only if the harvest concretely outgrows one pack).
- The **funnel band-flow chart primitive** — a deliberate build ticket in `pack-depth-next-wave`
  (§6). The bundle ships standard KPI/bar/table charts of the same data.
- Cohort-rate charts (declined by the north-star; no demand).
- Per-line pricing mechanics beyond the shared license (RESOLVED: license-level, no bundle SKU —
  memory `packs-license-price-is-shared-not-per-pack`).
- The write-discipline runtime (atomic writes, poller-lock, auto-commit) from the north-star's
  `crm/lib/writes.py` — that is the file-store's concern; Relay tables provide their own
  persistence. Preserve the *policy* (consent as first-class, never auto-publish/auto-spend) as
  profile SKILL.md guidance, not ported code.

## Open decisions (for the operator, before build)

- **relay-campaigns split:** folded into relay-social for the first proof (recommended — keeps the
  proof to two children). Split into a third child only if the operator wants campaigns as an
  independently-installable pack. *Not derivable from the doc — confirm at build kickoff.*
- **Cross-child trigger demo:** the `lead-enrich` trigger alone proves the seam; whether to also
  ship a `relay-social` "new-subscriber → welcome-creative" reaction in the first proof (richer,
  more surface) or defer it (leaner) is a scope call.

## References

- Source: `_IDEAS/packs-evolution.md` §8.3 (bundle proof), §3 (Functional category), §10 Q1
  (Marketing = lead bundle candidate), Appendix (Marketing harvest map row).
- Domain model: CRM/leads, consent policy, content, campaigns, channels, ads, and demand-gen flow.
- Reference implementation to mirror: `relay-cre` (child manifest shape) + `relay-agency-cre`
  (bundle pack.yaml + `relay-agency-bundle-template.test.ts`).
- Registry to update: `features/pack-taxonomy.md` (one-owner-per-logical-id).
- Depends on: `pack-bundle-model` (shipped), `pack-primitive-resurface` (shipped — standard
  charts). Relates to: `pack-depth-next-wave` (the funnel band-flow build ticket),
  `pack-entitlement-per-line` (shared license). Memories: `pack-bundle-flatten-model`,
  `pack-taxonomy-shared-registry`, `seed-clears-pack-tables-and-addrows-fires-triggers`,
  `packs-license-price-is-shared-not-per-pack`.
