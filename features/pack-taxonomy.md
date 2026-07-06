---
title: Pack taxonomy — the shared registry every new pack builds on
status: living
priority: P1
milestone: post-mvp
source: operator request 2026-07-05 (after the relay-agency-cre bundle exposed a clients-table collision)
relates: [pack-generalize-agency, pack-bundle-model, pack-agency-bundle, pack-entitlement-per-line]
---

# Pack taxonomy — the shared registry every new pack builds on

**Read this before authoring or editing any pack.** It is the single reference that keeps new
packs from redeclaring, shadowing, or duplicating what peer packs already provide. A pack should
**build on** the primitives its peers own, not re-derive them.

The `ainative-app` skill and every `features/pack-*.md` spec point here. When you add a pack (or a
table/schedule to an existing one), reconcile it against the **Owned-primitives registry** below and
follow the **rules**. If your change would give a second owner to an already-owned logical id, stop:
that is the exact class of bug the `relay-agency-cre` bundle surfaced (two packs each defining their
own `clients` table → a silent shadow side-by-side, a `BundleCollisionError` under a bundle flatten).

## Why this exists (the failure it prevents)

Two id spaces behave differently, and the difference is the whole point of this doc:

- **Artifact ids** (profile dirs, blueprint filenames) are **namespaced `<pack-id>--name`** (two
  hyphens; see `app-package-format.md` and the `ainative-app` skill). Two packs can each ship a
  `--analyst` profile with no collision because the prefix disambiguates. Namespacing makes these
  safe automatically — you do not have to think about them here.

- **Logical primitive ids** (table ids, schedule ids inside a manifest) are **NOT namespaced**, and
  they must not be — sharing a logical id across packs is how composition *works*: Agency Pro layers
  a row-insert trigger onto the free spine's `intake` table by referencing the id `intake`. Because
  they are unnamespaced, a logical id is a **shared name with exactly one owner**. A second pack that
  *redefines* it (different columns, its own seed) either silently creates a divergent second table
  (side-by-side install) or refuses the merge (bundle flatten). Both are bugs.

The rule that falls out: **one owner per logical primitive; everyone else builds on it, never
redefines it.**

## The category taxonomy (what KIND of pack this is)

Every pack is one of four kinds (`packs-evolution.md §3`). This decides what the pack is allowed to
own and what it must build on:

| Kind | Example | Owns | Builds on |
| --- | --- | --- | --- |
| **Persona (spine)** | `relay-agency` (free) | The operating-system tables every vertical shares (`clients`, `engagements`, `intake`, `pipeline`). The fat spine. | Nothing — it is the base. |
| **Industry (vertical)** | `relay-cre`, `relay-nonprofit` (paid) | ONLY its distinct vertical tables (`rent_roll`, `grants`). Thin. | The persona spine's tables. Never redeclares `clients` — its vertical clients flow into the spine's client book via `seed/customers.yaml`. |
| **Automation (pro)** | `relay-agency-pro` (paid) | Nothing new structurally — it re-lists the spine's tables (`engagements`, `intake`) to attach triggers/schedules. Installs *alongside* the spine as a separate app. | The persona verbs; adds the automation layer (`persona-pack-manual-automated-split`). |
| **Bundle** | `relay-agency-cre` (paid) | No tables of its own — it owns only identity + entitlement and a `bundle: [child ...]` list. | Its children, flattened into ONE app at install (`pack-bundle-model`). |

The manual-vs-automated line (free spine = manual client-book OS; Pro = automation layer; industry
= thin verticals) is the repeatable split for every persona family — see
`persona-pack-manual-automated-split`.

## Owned-primitives registry (the shared namespace — keep current)

The logical table/schedule ids currently in play and their **single owner**. When you add or move a
primitive, update this table in the SAME change (it is the source of truth reviewers diff against).

### Tables

| Logical id | Owner | Columns | Built on by (referencing pack) |
| --- | --- | --- | --- |
| `clients` | `relay-agency` | `name, engagement_type, tier, status, health` | The client book. Industry packs seed their verticals into it via `seed/customers.yaml`, never redeclare it. |
| `engagements` | `relay-agency` | `client, date, category, description, amount, status` | The signed-amount ledger (the margin cockpit source). `relay-agency-pro` re-lists it to attach automation. |
| `intake` | `relay-agency` | `client, service, source, status, notes` | The work queue. `relay-agency-pro` attaches a row-insert trigger (`intake-pipeline`). Ships empty (a seed would fire the trigger on install). |
| `pipeline` | `relay-agency` | (new-business stages) | The lead→signed pipeline. |
| `rent_roll` | `relay-cre` | `property, tenant, base_rent, expiry, escalation, option` | CRE's distinct vertical primitive; carries the `lease-abstraction` row-insert trigger. Ships empty. |
| `grants` | `relay-nonprofit` | `client, funder, program, amount, deadline, stage, notes` | Nonprofit's distinct vertical primitive; carries the `grant-pipeline-deep` row-insert trigger. Ships empty. |

#### Marketing family (Functional line — disjoint from the Agency family)

The Marketing line (`pack-marketing-line`) is a **Functional** bundle, NOT part of the Agency persona
family. It owns its OWN lead book — it does NOT build on the Agency `pipeline`/`clients`. The two
children are bound by `utm_campaign` (a Social campaign KPI reads the CRM `leads` book; a new lead can
fire a Social reaction), not by a shared persona spine. Every id below is disjoint from the Agency ids.

| Logical id | Owner | Columns | Built on by (referencing pack) |
| --- | --- | --- | --- |
| `leads` | `relay-crm` | `display_name, email, stage, direct_status, segment, source_origin, source_campaign, owner, last_touch, notes` | The core CRM record (two-axis lifecycle). Carries the `lead-enrich` row-insert trigger → ships EMPTY. `source_campaign == campaigns.utm_campaign` is the intra-bundle join key. `relay-social` REFERENCES it (a KPI, the `welcome-creative` trigger) — never redeclares it. |
| `lead_research` | `relay-crm` | `lead_id, target_offering, fit_score, role, company, location, likely_pain, latent_need, email_status, last_researched` | The public-research dossier. Seeded (NOT trigger-bound). |
| `consent_policy` | `relay-crm` | `basis, mailable, scope, jurisdiction, cadence_cap, notes` | The consent guardrail as data, read by the outreach-guard profile. Seeded. |
| `content_assets` | `relay-social` | `title, type, collection, funnel_stage, promotes, repurpose_status, priority, owner` | Source content (supply side). Carries the `repurpose` row-insert trigger (fires on NEW inserts; seeded rows are added via seed writes, which bypass the trigger). Seeded. |
| `creatives` | `relay-social` | `parent, promotes, channel, format, campaign, status, hook, cta` | Channel-ready drafts — the output of `repurpose`/`welcome-creative`. Ships EMPTY. |
| `campaigns` | `relay-social` | `promotes, funnel_stage, starts, ends, status, utm_campaign, impressions, clicks, signups` | Demand-gen initiatives. `utm_campaign` is the join key the CRM `leads.source_campaign` references. Seeded. |
| `channels` | `relay-social` | `platform, handle, url, funnel_role, audience, last_refreshed, refresh_status` | Publishing surfaces. Seeded. |
| `ad_initiatives` | `relay-social` | `title, intent_kind, status, attached_campaign, primary_kpi, budget_envelope_usd, target_cac_usd` | The paid side. Seeded lightly. |

### Schedules

| Logical id | Owner | Runs |
| --- | --- | --- |
| `month-end-close` | `relay-agency-pro` | `relay-agency-pro--month-end-close` (installed as composite id `app:relay-agency-pro:month-end-close`). |
| `lead-poller` | `relay-crm` | `relay-crm--outreach-loop` — the 4×/day list-hygiene pass. |
| `content-cadence` | `relay-social` | `relay-social--campaign-launch` — the weekly posting companion. |

### Profile / blueprint prefixes (namespaced — collision-free by construction)

`relay-agency--`, `relay-cre--`, `relay-nonprofit--`, `relay-agency-pro--`, `relay-crm--`,
`relay-social--`. A new pack claims its own `<pack-id>--` prefix; nothing to reconcile here.

## Rules for a new pack (the checklist)

1. **Pick the kind** from the category table. That decides what you may own vs. must build on.
2. **Claim only distinct tables.** Before adding a `- id:` under `tables:`, check the registry. If a
   peer already owns that logical id:
   - You want to *reference/extend* it (attach a trigger, read it in a KPI, run a blueprint on it) →
     **do not redeclare it in your manifest.** Reference the id; the owner's install creates the
     table, and side-by-side installs share the real table by name. (This is the Pro→spine pattern —
     Pro re-lists `engagements`/`intake` only because Pro installs standalone and needs the table to
     exist in its OWN app scope; a pack that will only ever be a *bundle child* references without
     re-listing.)
   - You want a *different* table → **give it a distinct id.** `rent_roll`, not a second `clients`.
3. **Vertical clients go through the customer dimension, not a table.** An industry pack seeds its
   clients in `seed/customers.yaml` (aggregated + slug-deduped across bundle children by the
   installer). It does NOT ship a `seed/tables/clients.json` — the spine owns the client book.
4. **Bundle-child discipline.** If this pack could ever be a `bundle:` child (any industry or persona
   pack), it must not declare any table id another prospective sibling owns. The flatten merges into
   ONE app; a shared logical id there is a `BundleCollisionError`, by design (no silent shadow).
5. **Trigger-bound tables ship empty.** A table with a row-insert trigger must have no seed — seeding
   dispatches the blueprint on install (`seed-clears-pack-tables-and-addrows-fires-triggers`).
6. **Namespace every artifact id** `<pack-id>--`. (Profiles, blueprints. Automatic collision safety.)
7. **Update this registry** in the same change. A new owned table/schedule adds a row; a moved
   primitive moves its row. Reviewers diff the registry to catch a second owner.
8. **Paid pack hygiene** (if `entitlement`): one entitlement per pack/bundle, a `price` matched to
   orionfold.com/relay/, a `changelog:` line per version, `purchaseUrl`. See the pack specs.

## How to verify (before you commit)

- **Bundle-collision check** is free: if two children collide on a logical id, `installPack` throws
  `BundleCollisionError` naming the id and both packs. Author a bundle that includes your pack and
  install it (`relay-agency-cre` is the reference) — a clean install proves no shadow.
- **No silent 0-read:** after a bundle install, a KPI/trigger referencing a shared table must resolve
  to the real UUID. `relay-agency-bundle-template.test.ts` is the pattern to copy.

## References

- `packs-evolution.md §3` (the four categories), `§4` (persona/industry split), `§5` (composition
  model). Memories: `persona-pack-manual-automated-split`, `pack-install-drops-by-dir-scan`,
  `pack-bundle-flatten-model`, `pack-of-is-primitive-pack-resolver`.
- Mechanism: `pack-bundle-model` (flatten + `BundleCollisionError`), `pack-agency-bundle` (the first
  bundle proof + the `clients`-collision worked example that motivated this doc).
- Authoring: the `ainative-app` skill (`.claude/skills/ainative-app/SKILL.md`) references this file.
