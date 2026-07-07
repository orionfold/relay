---
title: Next depth packs — Web Designer, Video Creator, Retail Investor (each pulling one new primitive only if it needs it)
status: planned
priority: P2
milestone: post-mvp
source: internal pack-evolution strategy §8.5 + §6 + §9 + Appendix
dependencies: [pack-primitive-resurface, pack-bundle-model]
---

# Next depth packs (wave 2 catalog)

## Description

With the persona/industry split proven (`pack-generalize-agency`), primitives resurfaced
(`pack-primitive-resurface`), and composition shipping (`pack-bundle-model` +
`pack-marketing-line`), the catalog spreads to its next depth-ship packs
(`packs-evolution.md §8.5`): **Web Designer**, **Video Creator**, and **Retail Investor**
(`relay-portfolio` + `relay-technical-analyst`). Each is modeled from its functional domain and
**pulls one *new* analytics primitive only if it concretely needs one** — the
§6 discipline: build a new primitive only when a *selected* depth pack demands it, never
speculatively.

This spec is the umbrella for wave-2 depth packs. Each pack is independently authorable (they
share no state), but they share one rule: the catalog generates the primitive roadmap. Retail
Investor wants a factor **value-heatmap** and a **radar**; Web Designer wants a
**gallery/preview widget** (Appendix). Those are the *build* tickets §6 leaves ABSENT after
wave-1 resurfacing — each is a deliberate Core primitive (Zod arm + evaluator + kit), gated on a
real pack need.

It is P2 (post the composition + entitlement foundation) and split into per-pack sub-slices at
grooming. Retail Investor is also a **Personal-category** pack — subject to the §9 ICP tension.

## User Story

As a builder dogfooding Relay on my own domain (web design, video, or investing), I want a depth
pack with the exact analytics my domain needs, so that
Relay operates my personal/prosumer function without me hand-building charts it does not yet have.

## Technical Approach

Author each pack as an in-tree pristine-AppManifest pack seeded with synthetic examples. For each,
apply the §6 build-vs-resurface rule to its visual needs:

- **Web Designer** (Persona) — a synthetic web-services operating surface. New primitive: a
  **gallery/preview widget** (Appendix) — ABSENT under the fixed slots, so a *build* ticket
  (new component + kit + Zod arm) gated on this pack shipping.
- **Video Creator** (Persona) — domain source tbd. Reuse resurfaced primitives where possible;
  build only what it concretely needs.
- **Retail Investor** (Personal) — a synthetic personal-investing operating surface. Children
  `relay-portfolio` + `relay-technical-analyst` (a bundle per `pack-bundle-model`). New
  primitives: **value-heatmap/matrix** and **radar/spider** (§6 "genuinely absent") — each a
  deliberate build ticket, built here because this selected pack needs them.
- **Primitive-build discipline.** Every new visual is a Core primitive: a Zod arm on the
  `.strict()` manifest schema (`src/lib/apps/registry.ts`) + an evaluator + a view kit — never a
  manifest escape hatch, never a component ref/formula string. Build the heatmap/radar/gallery
  ONLY as its consuming pack ships (§6: "never speculatively").
- **§9 ICP tension for Retail Investor.** Personal packs target individuals and break the
  "consultancies/agencies/builders, not end-users" founding ICP. Per §9, ship Retail Investor as
  a **dogfooding/prosumer surface first** (the near-term buyer is the builder dogfooding Relay on
  themselves); formalize consumer GTM later. Do NOT bet premature
  consumer GTM.

**Smoke budget:** each new primitive (heatmap, radar, gallery) is runtime-registry-adjacent —
budget a dev-server smoke per pack that installs it and renders its new visual.

**Grooming note:** split this umbrella into `pack-web-designer`, `pack-video-creator`,
`pack-retail-investor` sub-specs when each is scheduled; each new primitive gets its own build
ticket so the §6 gate ("only when a selected pack needs it") is auditable.

## Acceptance Criteria

- [ ] Web Designer, Video Creator, and Retail Investor packs each exist as in-tree packs,
      seeded with synthetic examples, installable and rendering end to end.
- [ ] Each new analytics primitive (value-heatmap, radar, gallery/preview) is a typed Zod arm +
      evaluator + kit on the `.strict()` manifest schema — no escape hatch — and is built only
      because its consuming pack needs it (auditable per-pack).
- [ ] Retail Investor ships as a dogfooding/prosumer surface (no premature consumer-GTM
      dependency); the §9 ICP sequencing is respected.
- [ ] No new primitive is built speculatively — each traces to a shipping pack's concrete need.
- [ ] A dev-server smoke per pack installs it and renders its new visual.

## Scope Boundaries

**Included:**
- Authoring the wave-2 depth packs (Web Designer, Video Creator, Retail Investor).
- Building the specific new primitives those packs need (heatmap, radar, gallery).
- Respecting §9 ICP sequencing for the Personal-category Retail Investor pack.

**Excluded:**
- Health pack and full consumer-GTM Personal packs — explicitly **second wave**, gated on
  self-serve GTM (§9); a separate future spec.
- Resurfacing already-built primitives (`pack-primitive-resurface`, wave 1) — this spec builds
  only what remains ABSENT.
- `dependsOn`/foundation packs (`pack-dependson-foundation`).
- Business formation, Consultant, Content/publishing packs (Appendix "later" — future specs).

## References

- Source: internal pack-evolution strategy §8.5 (next depth packs), §6 (build-vs-resurface,
  build-only-when-needed), §9 (Personal-pack ICP tension), Appendix (candidate inventory + new-primitive
  column).
- Depends on: `pack-primitive-resurface`, `pack-bundle-model`. Relates to:
  `pack-entitlement-per-line` (each depth pack is a per-line product).
