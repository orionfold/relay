---
title: Marketing line — relay-crm + relay-social bundled, harvested from ~/orionfold/marketing
status: planned
priority: P2
milestone: post-mvp
source: _IDEAS/packs-evolution.md §8.3 + §3 + Appendix
dependencies: [pack-bundle-model, pack-agency-bundle]
---

# Marketing line — a Functional depth bundle

## Description

> **Operator decision (2026-07-05):** Marketing is **no longer the first bundle proof** — that
> is now `pack-agency-bundle` (Agency→CRE), because published marketing assets already exist for
> the Agency persona (warm audience, compounds existing work). Marketing **demotes to a later
> Functional depth pack** (P1→P2). It still proves the *Functional-category* bundle shape and
> the richest harvest, just after the Agency bundle has proven the mechanism.

Marketing is a Functional-category pack (`§3`: "my team *does* Marketing") that splits into
`relay-crm` + `relay-social` (with `relay-campaigns` as a later child), bundled and installed as
one "Marketing" app, harvested from the richest sibling north-star `~/orionfold/marketing`.

This feature authors those child packs and the Marketing bundle pack. It is the concrete proof
that a *splitting* pack (one purchase, multiple composed primitives) works end to end — the
capability a single-vertical Agency pack never needed. It is P1 and depends on
`pack-bundle-model` shipping the flatten mechanism first.

## User Story

As a marketing operator, I want to install one "Marketing" pack and get a CRM + social pipeline
composed together — leads flowing into campaigns, social posts triggered off CRM rows — so that
I run my marketing function on Relay without wiring three separate apps by hand.

## Technical Approach

- **Harvest from the sibling north-star.** Extract CRM and social primitives from
  `~/orionfold/marketing` (profiles, blueprints, tables, schedules, seed rows), translating them
  into pristine AppManifests. This is a harvest, not a greenfield build — the north-star already
  encodes the domain.
- **Author `relay-crm` and `relay-social` as child packs.** Each is a standalone in-tree pack
  (a pristine AppManifest wrapper). Their cross-references (a social blueprint step referencing
  a CRM profile; a campaign KPI reading a CRM leads table) are declared as *intra-bundle*
  bindings, resolved by `pack-bundle-model`'s flatten merge.
- **Author the `relay-marketing` bundle pack.** A bundle descriptor listing
  `relay-crm` + `relay-social` (per `pack-bundle-model`'s format). Installing it merges both into
  one Marketing app.
- **Funnel/cohort chart need (§6).** Marketing wants funnel/cohort charts (Appendix "New
  primitive needed"). If a chart the bundle needs is only un-declarable/buried, it is covered by
  `pack-primitive-resurface` (wave 1). A genuinely-absent funnel/cohort chart is a *build*
  ticket — carry it into `pack-depth-next-wave` or add it here ONLY if a selected Marketing
  surface concretely needs it (§6 "build only when a selected depth pack needs it", never
  speculatively).
- **No new engine seam.** All composition rides on `pack-bundle-model`'s flatten path; this spec
  is pack content + one bundle descriptor.

**Smoke budget:** install the Marketing bundle under `npm run dev` and verify the merged app
renders, leads flow, and social triggers fire off CRM rows.

## Acceptance Criteria

- [ ] `relay-crm` and `relay-social` exist as in-tree child packs, each installable standalone,
      harvested from `~/orionfold/marketing`.
- [ ] `relay-marketing` is a bundle pack (per `pack-bundle-model`) that merges both children into
      one installed Marketing app.
- [ ] A cross-child binding works post-merge: a social blueprint fires off a CRM leads row-insert
      trigger, and a campaign KPI reads a CRM table with no silent 0-read.
- [ ] The Marketing bundle installs, renders, and runs end to end under a dev-server smoke.
- [ ] Any funnel/cohort chart the bundle ships is either resurfaced (existing) via
      `pack-primitive-resurface` or a deliberate build ticket — never a manifest escape hatch.

## Scope Boundaries

**Included:**
- Authoring `relay-crm` + `relay-social` child packs + the `relay-marketing` bundle.
- Harvesting domain content from `~/orionfold/marketing`.

**Excluded:**
- The bundle-merge mechanism itself (`pack-bundle-model` — hard dependency).
- `relay-campaigns` (later child) beyond a stub, unless the first proof needs it.
- Per-line pricing for the Marketing line (`pack-entitlement-per-line` + Website coordination).
- Building brand-new funnel/cohort chart components speculatively (§6 discipline).

## References

- Source: `_IDEAS/packs-evolution.md` §8.3 (bundle proof), §3 (Functional category), §10 Q1
  (Marketing = lead bundle candidate), Appendix (Marketing harvest map row).
- North-star: `~/orionfold/marketing` (harvest source).
- Depends on: `pack-bundle-model`. Relates to: `pack-primitive-resurface` (funnel/cohort chart),
  `pack-entitlement-per-line` (Marketing bundle price → parent line).
