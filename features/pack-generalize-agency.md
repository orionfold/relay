---
title: Generalize Agency — split persona (relay-agency) from industry (relay-cre, relay-nonprofit)
status: built
priority: P0
milestone: post-mvp
source: _IDEAS/packs-evolution.md §1 + §4 + §8.1
dependencies: []
---

> **Built 2026-07-05.** Free `relay-agency` neutralized + fattened (7 agents · 7 blueprints
> · 4 tables), two paid industry packs authored (`relay-cre` 3·3·1, `relay-nonprofit` 3·4·2,
> both `entitlement: product:orionfold-relay`), `relay-agency-pro` reshaped to vertical-neutral
> automation (6·4·2, v0.5.0). All 4 packs parse clean; free installs unlicensed, paid gate +
> install with one license; `relay-agency`+`relay-cre` coexist isolated (AC #3); row-triggers
> rewrite on install; every blueprint schema-valid. Tests + npx-prod-smoke Case L updated to the
> new shape; full suite green (only the 8 pre-existing non-regression failures remain). Dev-server
> `/packs` gallery verified live (All 4 · Free 1 · Premium 3). NOT yet released (version bump +
> tag is a separate step). Industry-pack `price` is a PLACEHOLDER ($199/year) pending operator +
> Website coordination. Enables `pack-bundle-model` → `pack-agency-bundle`.

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

## Generalized design — from scratch (2026-07-05)

Operator directive: design the Agency pack "from scratch, no prior-art / prior-marketing
constraints, most generalized, largest TAM" — get the *content* right first; bundling
(free vs. paid) and which vertical bundles first are downstream packaging calls.

**First principle — what an agency structurally IS.** Strip every vertical and every agency
is the same machine: *a business running a book of clients on retainers + projects, whose
own margin is the sum of many small per-client P&Ls.* The domain-agnostic parts — the money
spine, new business, intake routing, governance, the client book — are exactly the parts an
owner would pay for; the *delivery* work (lease abstraction, grant cycles, listing writing) is
the thinnest part and the only part that changes by vertical. So the persona pack is designed
**fat on money + new-business + governance + intake**, and **carries zero delivery verticals**.

**The free/pro line is drawn at manual vs. automated — NOT basic vs. advanced.**

> **Free `relay-agency` = the manual client-book operating system. Paid `relay-agency-pro` =
> it runs itself. Industry packs (`relay-cre`, `relay-nonprofit`, …) = what you deliver.**

This "I do it (free) vs. it does itself (Pro)" line keeps the free pack genuinely fat (max TAM)
while giving Pro an obvious reason to exist (automation, not gated basics). **This manual/automated
split is a repeatable pattern intended to apply to EVERY future persona pack** (Marketing/
Marketing-Pro, Consultant/Consultant-Pro, …); whether all Pro tiers share one base price or each
earns its own upgrade value is an open packaging decision, deferred.

**Tiering (operator-locked 2026-07-05): the ONLY free/community pack is base `relay-agency`.
Everything else is license-gated** — `relay-agency-pro` AND both industry packs (`relay-cre`,
`relay-nonprofit`) carry an `entitlement`. Per the deferral of per-line entitlements to
`pack-entitlement-per-line`, all paid packs share the **single existing
`entitlement: product:orionfold-relay`**, so one license unlocks Pro + CRE + nonprofit together
(`assertEntitled` matches the string against the license `entitlements[]`; no engine change). Deep
vertical automation (CRE renewal-engine, nonprofit grant-pipeline-deep) therefore lives in the paid
industry packs — the industry pack is the home of ALL delivery, basic and deep.

### FREE `relay-agency` (persona spine — designed fat, all domain-neutral)

- **Tables** (the data spine): `clients` (name, engagement_type=retainer|project|hybrid, tier,
  status, health) · `engagements` (per-client signed P&L: client, date, category, description,
  amount, status) · `intake` (work queue: client, service, source, status, notes — manual routing
  in free) · `pipeline` (new business: prospect, stage=lead|qualified|proposal|won|lost, value).
- **Profiles (7):** Account Manager (health/status — *new*) · Bookkeeper (*generalize the
  property-bookkeeper off GL/property language*) · Intake Coordinator (classify+route — *new to
  free*) · New-Business Researcher (*pulled down from Pro*) · Proposal Writer (*pulled down from
  Pro*) · Governance Officer (*neutral already*) · Onboarding Runner (*neutral already*).
- **Blueprints (7):** Client Onboarding Runbook · Per-Client Cost & Billing · Expense Intake
  (*generalize bookkeeping*) · Intake Routing (*new*) · New-Business Machine (*pulled from Pro*) ·
  Month-End Close (**on-demand/manual** — the free version) · Client Status Digest (*new*).
- **View:** Workflow Hub home; `engagements` ledger is the money hero; per-client margin / billed /
  cost KPIs. The cockpit is FREE. **Seed:** ~6 neutral clients (engagement_type, NOT `industry:CRE`),
  a current-month engagements ledger so margin reads non-zero on install; intake/pipeline ship empty
  (they are trigger queues).

### PAID `relay-agency-pro` (automation layer — gates NO basics)

Scheduled Month-End Close (cron) · row-triggered Intake Pipeline · row-triggered New-Business
pipeline · Finance Controller + Governance Auditor (deeper hardened agents) · Client Audit Export.
**Vertical depth NO LONGER lives here** — CRE/nonprofit content moves to industry packs. This
supersedes the earlier "Agency Pro parity = keep verticals in Pro" reading: parity now means the
*free/pro line survives* (manual→automated), not that Pro stays vertical. Domain-neutral automation only.

### Industry pack contract — thin by construction, LICENSE-GATED

Both industry packs are paid (`entitlement: product:orionfold-relay`). `relay-cre` carries ALL its
delivery — basic AND deep: CRE Analyst + Listing Writer + Renewal Analyst profiles; Lease Abstraction
+ Listing/Market + **Renewal Engine** blueprints; `industry:CRE` seed clients; optional rent-roll
delivery table; `[cre,…]` tags. It plugs into the spine because the spine owns
`clients`/`engagements`/`intake`. Same shape for `relay-nonprofit` (Grant Researcher + Impact Writer +
Grants Analyst; Grant Cycle + Impact Reporting + **Grant Pipeline Deep**; grants table).

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
