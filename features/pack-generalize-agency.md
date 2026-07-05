---
title: Generalize Agency — split persona (relay-agency) from industry (relay-cre, relay-nonprofit)
status: planned
priority: P0
milestone: post-mvp
source: _IDEAS/packs-evolution.md §1 + §4 + §8.1
dependencies: []
---

# Generalize Agency — the persona/industry split

## Description

`relay-agency` / `relay-agency-pro` were invented forward from one prospect's CRE +
nonprofit agency. The machinery is excellent and general, but the **content** is
hardcoded to two verticals at every layer: pack descriptions (`src/lib/packs/templates/relay-agency/pack.yaml`
"CRE and nonprofit verticals"), profile ids (`cre-analyst`, `grant-researcher`), SKILL.md
prose, blueprint prompt templates, tags (`[cre, renewals, loi, rent-roll]`), and seeded
customers (`industry: CRE`). The *persona* underneath — one operator running a client book
that should process itself — is domain-agnostic and reusable.

This feature splits the fused Agency pack into a **domain-neutral persona pack**
(`relay-agency`, agency-operator) and two thin **industry packs** (`relay-cre`,
`relay-nonprofit`) that carry only the vertical content. An agency serving CRE installs
`relay-agency` + `relay-cre` — two coexisting apps today, the natural miniature of the
composition case that the bundle model (`pack-bundle-model`) formalizes tomorrow.

This is the **no-new-architecture warm-up** of the catalog build sequence (§8.1). It proves
the persona/industry separation on the proven single-app machinery with zero new seams — no
cross-pack resolution, no bundle format. It is P0 because every downstream catalog pack
(Marketing, Consultant, Retail Investor) reuses this persona-vs-content split as its template.

## Operator decisions (2026-07-05)

- **Generalize *powerfully* (additive, not just subtractive).** The split is not only "strip CRE
  content out of `relay-agency`." The persona pack must become the fully-realized, *deep*
  domain-neutral operating system — client book, engagements ledger, per-client margin,
  intake→work pipeline, month-end close, new-business/proposal/governance agents — so complete
  and rich that any vertical snaps on with **thin** industry content. "Powerful" lives in the
  persona spine; `relay-cre` / `relay-nonprofit` are deliberately thin, sharp content packs on
  top of it. This raises the ambition of the persona pack beyond §4's subtractive framing.
- **First bundle proof = Agency→CRE, not Marketing** (resolves `packs-evolution.md §10 Q1`).
  Rationale: published marketing assets already exist for the Agency persona (a GTM argument the
  strategy weighed only on harvest depth), so the Agency bundle has a warm audience and compounds
  existing work. Consequence: this split feeds directly into `pack-agency-bundle` (the new first
  bundle proof); `pack-marketing-line` demotes to a later depth pack.

## User Story

As an agency operator serving a vertical other than CRE or nonprofit, I want to install the
domain-neutral Agency persona pack and layer on my own industry pack, so that the client-book
operating system works for my agency without CRE lease-abstraction or grant-pipeline content
I do not use.

## Technical Approach

Split the three fused concerns per `packs-evolution.md §4`:

| Fused today | Moves to | Becomes |
|---|---|---|
| client book, engagements ledger, per-client margin, intake→work pipeline, month-end close, new-business/proposal agents, governance/audit | **Persona pack** | `relay-agency` (agency-operator, domain-neutral) |
| lease abstraction, CRE renewal engine, comps, LOI, rent roll | **Industry pack** | `relay-cre` |
| grant pipeline, LOI→award→compliance, impact reporting, restricted funds | **Industry pack** | `relay-nonprofit` |

- **Neutralize the persona pack content.** Rewrite `src/lib/packs/templates/relay-agency/pack.yaml`
  description, SKILL.md prose, and blueprint prompt templates to be vertical-agnostic. Rename
  vertical profile ids to persona ids (`cre-analyst` → e.g. `engagement-analyst`); keep the
  persona-level agents (new-business, proposal, governance/audit) unchanged.
- **Author two industry packs** in-tree beside the persona pack, each a pristine AppManifest
  wrapper carrying only its vertical primitives (profiles, blueprints, tables, seed rows) and
  its vertical tags. These are standalone apps today; they coexist with the persona pack.
- **Seed data.** Move `industry: CRE` seeded customers out of the persona pack; each industry
  pack seeds its own domain rows. The persona pack seeds a neutral client book.
- **Agency Pro parity.** Apply the same split to `relay-agency-pro` (the premium tier) so the
  free/pro line survives the generalization — Pro remains the triggered-pipeline + scheduled
  operating system on top of the persona verbs, with vertical depth moving to the industry packs.
- **No engine changes.** Every binding stays intra-app (`install.ts` schedule→blueprint
  validation, `manifest-trigger-dispatch.ts` row-insert triggers). Two installed packs =
  two isolated apps under the existing `<appId>--` namespacing.

**apiVersion / entitlement:** unchanged — persona and industry packs keep the current single
`entitlement` string until `pack-entitlement-per-line` migrates them to `product:relay-*`.

## Acceptance Criteria

- [ ] `src/lib/packs/templates/relay-agency/pack.yaml` and its SKILL.md, blueprint prompts, profile ids, and
      tags contain no CRE- or nonprofit-specific content — the persona pack installs and runs a
      vertical-neutral client book end to end.
- [ ] `relay-cre` and `relay-nonprofit` exist as standalone in-tree packs, each carrying only
      its vertical primitives + seed rows + tags, and each installs cleanly as its own app.
- [ ] Installing `relay-agency` + `relay-cre` together yields two coexisting apps with isolated
      namespaces; neither pack's blueprint/KPI silently reads the other's tables.
- [ ] `relay-agency-pro` retains the free/pro line post-split (triggered pipelines + scheduled
      month-end + ledger cockpit) with vertical depth relocated to the industry packs.
- [ ] All existing pack tests pass; the npx prod smoke Case L (which exercises the real
      Agency Pro) is updated to match the split and stays green.
- [ ] No engine/runtime-registry code changes — the split is pure pack content + manifest
      reorganization (verified by diff scope).

## Scope Boundaries

**Included:**
- Splitting the existing Agency pack(s) into persona + two industry packs.
- Neutralizing persona content; relocating vertical content and seed data.
- Preserving the free/pro line through the split.

**Excluded:**
- Bundling the persona + industry packs into one installed app (that is `pack-bundle-model`).
- Per-line entitlements (`product:relay-*`) — stays single-entitlement until
  `pack-entitlement-per-line`.
- Any new industry vertical beyond CRE and nonprofit.
- New analytics primitives (`pack-primitive-resurface`).

## References

- Source: `_IDEAS/packs-evolution.md` §1 (evolution), §4 (persona/industry split worked
  example), §8.1 (warm-up), Appendix (harvest map rows 1/7/8).
- Anchors: `src/lib/packs/templates/relay-agency/pack.yaml`, `src/lib/packs/install.ts` (intra-app schedule
  validation), `src/lib/apps/manifest-trigger-dispatch.ts`, `features/feat-agency-pro-pack.md`
  (free/pro line + standalone evidence).
- Enables: `pack-bundle-model` (the persona+industry pair is the first bundle candidate),
  `pack-entitlement-per-line`.
