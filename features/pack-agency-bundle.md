---
title: Agency bundle — the first bundle proof (relay-agency + relay-cre flattened)
status: built
priority: P1
milestone: post-mvp
source: _IDEAS/packs-evolution.md §4 + §8.3 + §10 Q1 (operator-resolved 2026-07-05)
dependencies: [pack-generalize-agency, pack-bundle-model]
---

# Agency bundle — the first bundle proof

## Description

`pack-bundle-model` ships the flatten-at-install composition mechanism; it needs a first real
consumer to prove composition end to end. The strategy left the first-bundle choice open
(`packs-evolution.md §10 Q1`: Marketing for harvest depth vs Agency→CRE for familiarity).

**Operator decision (2026-07-05): the first bundle proof is Agency→CRE, not Marketing.**
Rationale: published marketing assets already exist for the Agency persona — a GTM argument the
strategy weighed only on harvest depth. The Agency bundle therefore has a warm audience and
compounds work already done, and it is the *smallest, most familiar* composition case (§4's
"composition in miniature"). Marketing demotes to a later depth pack (`pack-marketing-line`).

This feature authors the `relay-agency` + `relay-cre` bundle: a bundle pack that flattens the
domain-neutral persona spine (from `pack-generalize-agency`) with the thin CRE industry pack
into ONE installed "Agency (CRE)" app. It is the direct continuation of the persona/industry
split — spec #1 (split) and this spec (bundle) are one throughline, not two disconnected efforts.

## User Story

As an agency operator serving CRE, I want to install one "Agency for CRE" pack and get the full
agency operating system with CRE lease/renewal content composed in, so that I buy and install
once instead of layering a persona pack and an industry pack by hand.

## Technical Approach

- **Bundle descriptor.** Author a `relay-agency-cre` bundle pack (per `pack-bundle-model`'s
  format) listing `relay-agency` (persona spine) + `relay-cre` (thin industry content) as
  children to flatten.
- **Install-time merge.** Rides entirely on `pack-bundle-model`'s flatten path — the two children
  merge into one AppManifest under one project scope; all bindings become intra-app (a CRE
  blueprint step referencing a persona profile; a persona margin KPI reading a CRE-seeded table
  resolve with no silent 0-read).
- **Persona-carries-the-weight discipline.** The bundle must demonstrate the "powerful persona +
  thin industry" split (`pack-generalize-agency` operator decision): the merged app's depth comes
  from the persona spine, with CRE adding sharp vertical content, not re-deriving the operating
  system.
- **Nonprofit parity check.** A second bundle candidate `relay-agency` + `relay-nonprofit` should
  flatten the same way (proves the persona spine is genuinely vertical-neutral). Ship the CRE
  bundle as the proof; validate the nonprofit bundle installs cleanly as the neutrality gate.
- **Agency Pro tier.** If the premium tier bundles too, ensure the free/pro line survives the
  bundle (Pro = the operating system on top of the persona verbs — `feat-agency-pro-pack.md`).
- **No new engine seam** beyond `pack-bundle-model` — this is pack content + a bundle descriptor.

**Smoke budget (CLAUDE.md):** install the Agency (CRE) bundle under `npm run dev` and verify the
merged app renders, intake triggers work end to end, and per-client margin reads the CRE table.

## Acceptance Criteria

- [x] A `relay-agency-cre` bundle pack flattens `relay-agency` + `relay-cre` into ONE installed
      app; `getApp`/`listApps` see a single app indistinguishable from a hand-composed one.
- [x] A cross-child binding resolves post-merge: a CRE row-insert fires a persona pipeline
      blueprint, and a persona margin KPI reads a CRE-seeded table with no silent 0-read.
- [x] The merged app's depth comes from the persona spine (thin-industry discipline demonstrated).
- [x] The `relay-agency` + `relay-nonprofit` bundle also installs cleanly (persona-neutrality gate).
- [x] The free/pro line survives if the premium tier bundles.
- [x] A dev-server smoke installs the Agency (CRE) bundle and runs it end to end.

## Verification run — 2026-07-05

Built + verified. Two bundle descriptors authored (`relay-agency-cre`,
`relay-agency-nonprofit`), each a `pack.yaml` with `bundle: [relay-agency, <industry>]` and no
`base/manifest.yaml` — they ride `pack-bundle-model`'s flatten path with zero merge-code changes.

**The collision the split exposed.** `relay-cre` and `relay-nonprofit` each still declared their own
`clients` table (a leftover from side-by-side install). A bundle flattens children into ONE app, so
those `clients` ids collided with the persona spine's `clients` and the merge refused with
`BundleCollisionError` (working as designed — no silent shadow). **Operator-resolved (recommended
option):** the persona spine owns the ONE client book; the industry packs drop their `clients`
redeclaration and contribute their DISTINCT vertical table instead — CRE gains a `rent_roll`
(its actual pitch; `lease-abstraction` now row-triggers on it), nonprofit keeps `grants`. Each
pack's vertical clients still flow into the shared book via `seed/customers.yaml` aggregation. This
matches the split's own stated intent (`engagement_type replaces vertical; an industry pack tags its
own clients`) and is the general discipline captured in the pack taxonomy (`_IDEAS/pack-taxonomy.md`).

**Evidence.** `relay-agency-bundle-template.test.ts` (8 tests, real templates): catalog contract,
one-app/one-project flatten, cross-child trigger→real-UUID + persona margin KPI non-zero, both-child
customer aggregation (9 = 6+3), and the nonprofit neutrality gate. Full packs suite green (141).
Module-graph smoke parses all 5 packs via the catalog. End-to-end install smoke (real `relay-agency-cre`
against an isolated data dir, entitled license): 1 app, 5 tables (4 persona + rent_roll, no `clients`
collision), 10 profiles / 10 blueprints, 35 seeded rows, CRE trigger rewritten to a real UUID; the
persisted merged manifest re-validates through the strict `AppManifestSchema` render-ready
(workflow-hub, hero bound, 4 secondary blueprints, 4 margin KPIs).

## Scope Boundaries

**Included:**
- The `relay-agency-cre` bundle descriptor + install proof; the nonprofit-bundle neutrality gate.

**Excluded:**
- The flatten mechanism itself (`pack-bundle-model` — hard dependency).
- Authoring/splitting the child packs (`pack-generalize-agency` — hard dependency).
- The Marketing bundle (`pack-marketing-line` — now a later depth pack).
- Per-line pricing (`pack-entitlement-per-line`).

## References

- Source: `_IDEAS/packs-evolution.md` §4 (composition in miniature), §8.3, §10 Q1 (first-bundle
  choice — operator-resolved to Agency→CRE 2026-07-05).
- Depends on: `pack-generalize-agency` (the split that produces the children),
  `pack-bundle-model` (the flatten mechanism). Relates to: `pack-entitlement-per-line`.
