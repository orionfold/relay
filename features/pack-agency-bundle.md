---
title: Agency bundle — the first bundle proof (relay-agency + relay-cre flattened)
status: planned
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

- [ ] A `relay-agency-cre` bundle pack flattens `relay-agency` + `relay-cre` into ONE installed
      app; `getApp`/`listApps` see a single app indistinguishable from a hand-composed one.
- [ ] A cross-child binding resolves post-merge: a CRE row-insert fires a persona pipeline
      blueprint, and a persona margin KPI reads a CRE-seeded table with no silent 0-read.
- [ ] The merged app's depth comes from the persona spine (thin-industry discipline demonstrated).
- [ ] The `relay-agency` + `relay-nonprofit` bundle also installs cleanly (persona-neutrality gate).
- [ ] The free/pro line survives if the premium tier bundles.
- [ ] A dev-server smoke installs the Agency (CRE) bundle and runs it end to end.

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
