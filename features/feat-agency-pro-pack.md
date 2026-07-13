---
title: Agency Pro — first premium pack (PLG-2b)
status: planned
priority: P0
milestone: mvp
source: _SPECS/2026-07-01-200629_plg-refine.md §5 PLG-2b + Agency Pro brainstorm (2026-07-01 session)
dependencies: [feat-graduation-surface, feat-license-lifecycle]
---

# Agency Pro pack (PLG-2b): the first real premium pack

## Description

Every conversion mechanism shipped in 0.15–0.18 — offline Ed25519 verifier, license
lifecycle, `/packs` locked cards with price + Get-license CTA, `price`/`purchaseUrl`
manifest fields, 402 soft-gate install API — currently has a **null numerator**: no
pack declares `entitlement`. This feature authors the first paid pack, `relay-agency-pro`,
shipped in-tree beside the free `relay-agency` template.

**Positioning (the free/pro line).** The free pack is click-to-run: 8 blueprints you
trigger by hand, one at a time, one `clients` table, `schedules: []`, count-only KPIs.
Agency Pro sells the *operating system* on top of those verbs — triggered pipelines,
scheduled month-end operations, a ledger-kit finance cockpit, hardened client-safe
profiles, and deep per-vertical methodology. One-line pitch for the locked card:
**"Relay Agency runs a workflow. Agency Pro runs your agency."** Nothing in the free
pack regresses (D5 never-regress promise); Pro is strictly additive content.

**Why this is (almost) pure composition.** Every chapter below maps to a manifest
primitive that exists today: `row-insert` blueprint triggers
(`src/lib/apps/registry.ts:27-38`), cron `schedules`, the `ledger` view kit with
`tableSumWindowed` (MTD/QTD/YTD, signed) and `ratio` KPI sources
(`registry.ts:88-107`), `canUseToolPolicy` on profiles, and seeded tables. The
installer-semantics check (2026-07-01) found two latent engine gaps in the *pack
install path* for primitives no pack has used yet — both fixed here as free engine
work (D5: capabilities ship free for everyone; the pack sells the content exploiting
them). See "Prerequisite engine work" below.

## User Story

As an agency operator (Naya's agency-shaped sibling) already running the free pack for
a handful of clients, I want my client book to process itself — intake that triggers
work, month-end that closes itself, margin I can see per client, and agents I can
trust with client data — so that paying for the pack is cheaper than the four days a
month I spend doing this by hand.

## Technical Approach

### 0. Prerequisite engine work (free for everyone, D5)

Both gaps are in the pack-install path and latent only because the free pack uses
neither triggers nor schedules. Fix BEFORE authoring content; both are TDD-able.

- **(a) Row-insert triggers authored in a pack never fire.** Dispatch matches
  `trigger.table` against the **real table UUID**
  (`src/lib/apps/manifest-trigger-dispatch.ts:153`), but `rewriteTableRefs`
  (`src/lib/packs/install.ts:354`) rewrites only `tables[]` and `view` refs — a
  pack-authored `trigger: {table: intake}` keeps its logical id in the dropped
  manifest and silently never matches. Fix: extend the rewrite to
  `blueprints[].trigger.table` + unit test. Small.
- **(b) Pack install never registers manifest schedules.** `installPack` skips
  `manifest.schedules` entirely; `scheduleNextFire` resolves against the `schedules`
  DB table by id (`src/lib/apps/view-kits/kpi-context.ts:161-172`), which nothing
  populates on install. Fix: register manifest schedules as real schedule rows at
  install (reuse the state-preserving upsert discipline of
  `src/lib/schedules/installer.ts`; define what a manifest schedule *runs* — the
  `runs` field naming a blueprint id, instantiated like the trigger path's
  `dispatchBlueprintForRow`). Rewrite the manifest schedule ids to the real DB ids
  so `scheduleNextFire` bindings resolve (same discipline as table refs). Keep
  DB-touching imports dynamic (TDR-032) and budget the real-launch smoke
  (CLAUDE.md) — this touches the engine.ts-adjacent dispatch chain.

### 1. Pack wrapper (`src/lib/packs/templates/relay-agency-pro/pack.yaml`)

```yaml
id: relay-agency-pro
version: "0.1.0"
name: Relay Agency Pro
author: Orionfold
description: <what-you-get preview copy — renders on the locked card>
relayCore: ">=0.18.0"          # needs price/purchaseUrl-aware surfaces
entitlement: product:orionfold-relay
price: "$499/year"              # Stripe live: $499 standard / $349 founding / $149 renewal
purchaseUrl: https://orionfold.com/relay/
customers: []                   # Pro adds no demo customers; it operates real ones
```

The `description` doubles as the locked-card what-you-get preview (D6) — write it as
sales copy naming the five chapters, not as an internal summary.

### 2. Chapter 1 — Finance cockpit (the flagship locked-card tile)

- `engagements` table (client, period, retainer, billed, status) + seed.
- `client-month-end-close` blueprint: per-client cost rollup → branded client report →
  draft invoice line items into `engagements`. Iteration across clients happens at
  the **agent level, not the engine level** — blueprint steps are sequential prompt
  templates with no loop construct, but workflow tasks get relay MCP table tools
  injected (`features/task-runtime-ainative-mcp-injection.md`), so one close run's
  agent reads the clients/engagements tables and produces per-client sections in a
  single run. Author the step prompts and profile `allowedTools` around this.
- Schedule: monthly cron firing the close run (requires engine work 0b).
- **View: `kit: ledger`** — KPIs: retainer billed vs AI spend (`tableSumWindowed`,
  `mtd`), margin % (`ratio`), close-run count (`blueprintRunCount`, 30d), next close
  (`scheduleNextFire`). This is the "nobody copies a YAML to get a margin dashboard"
  moat — the curation is the product.

### 3. Chapter 2 — Intake pipelines (row-insert triggers)

- `intake` table (client, kind, source, status) as the work queue.
- Triggered blueprints (`trigger: {kind: row-insert, table: intake}`): route by `kind`
  to lease-abstraction-deep, grant-intake, or bookkeeping-entry flows. Drop a row →
  the right workflow fires under the right client.

### 4. Chapter 3 — New-business machine

- Profiles: `prospect-researcher`, `proposal-writer`.
- Blueprints: prospect research → capability pitch → proposal → engagement letter →
  a Pro-owned `client-kickoff` closing step. **No references to free-pack artifact
  ids** — the pack is standalone (see resolved decision 1): blueprint steps
  reference `profileId` strings resolved from the shared profiles dir at run time,
  so a dependency on a free-pack profile would fail silently-late only when the
  step runs. Pro ships every profile and blueprint it names.

### 5. Chapter 4 — Governance (governance as content)

- All Pro profiles ship hardened: explicit `allowedTools`, `canUseToolPolicy` with
  `autoDeny: [Bash]` and read-only `autoApprove`, capped `maxTurns` — "client-safe
  agents" is a stated guarantee on the card, not a vibe.
- `client-audit-export` blueprint: run/spend/approval trail per client, client-ready.
- Sensitive-client profile variants with `preferredRuntime: ollama` (local-only /
  donor-PII story) where output quality tolerates it.

### 6. Chapter 5 — Vertical deep chapter: CRE (the renewal engine)

- **v0.1.0 ships CRE only** (resolved decision 4): deep abstraction schema (critical
  dates, escalations, renewal options, CAM), comp analysis, LOI drafting, portfolio
  rent-roll rollup.
- **Nonprofit deep chapter ships in the first paid update (v0.2.0)** — teased on the
  locked card, and deliberately sequenced so the first content update exercises the
  pack-update path the D4 "renewal buys updates" pitch depends on.
- Depth lives in each profile's **SKILL.md** — this is the maintained-IP that makes
  "renewal buys a year of updates" (D4) an honest pitch. The `overrides/` layer
  (`src/lib/packs/format.ts:187`) is what makes those updates safe to take.

### 7. Ship mechanics

- Delete the temporary uncommitted premium fixture protocol — `/packs` locked-card
  states render from the real template from now on.
- Content authoring order: Chapter 1 (finance cockpit) is the vertical slice — wire
  pack.yaml + one table + one blueprint + schedule + ledger view end-to-end and run
  the gate before authoring the remaining chapters.

## Resolved Decisions (2026-07-01 — installer-semantics check + operator)

1. **Standalone, not add-on** (decided by code evidence). Tables are project-scoped:
   `installPack` creates and reuses tables under the pack's OWN project id
   (`install.ts:182,201`), and the logical→real view rewrite covers only the pack's
   own declared tables — a binding to an undeclared table stays a logical name and
   its KPIs silently read 0 (`install.ts:366-368`). Pro therefore cannot
   declaratively read the free pack's `clients` table; it ships its own tables and
   every profile/blueprint it references. The upsell relationship is narrative, not
   structural.
2. **Price/purchaseUrl** — decided at program level, Stripe prices LIVE
   (`strategy/relay/_RELAY.md` 2026-07-01): `price: "$499/year"` ($349 founding /
   $149 renewal are Website-side display), `purchaseUrl: https://orionfold.com/relay/`.
3. **Batch-across-clients = agent-level iteration** (decided by code evidence).
   Blueprints have no loop construct; workflow-step agents DO get relay MCP table
   tools injected, so one run iterates the table inside a single agent turn. No
   engine-level batch in v0.1.0; blueprint prompts are authored for agent-level
   iteration (Chapter 1).
4. **CRE-first** (operator, 2026-07-01). Nonprofit deep chapter is the first paid
   update (v0.2.0), exercising the D4 update path.
5. **Schedule gap: ship installer support in this scope** (operator, 2026-07-01) —
   engine work 0b above, free for everyone per D5.

## Acceptance Criteria

- [ ] `relay-agency-pro` appears on `/packs` as a real locked card: what-you-get
      preview, price, Get-license CTA from `purchaseUrl` — no fixture involved.
- [ ] `relay pack add relay-agency-pro` without an entitled license refuses with the
      named 402/license-required path (CLI and install API); with the real
      prod-signed license persisted, it installs store-consult (no proof re-supplied).
- [ ] Install materializes all declared primitives: profiles (hardened tool policies
      verifiable in materialized `profile.yaml`), triggered + scheduled blueprints,
      tables + seeds, and the ledger view renders its windowed/ratio KPIs.
- [ ] Dropping a row into `intake` fires the routed blueprint (row-insert trigger
      proven in the installed instance — i.e., engine fix 0a verified end-to-end,
      not just schema-valid).
- [ ] Install registers the month-end schedule as a real schedule row: it appears in
      the Schedules surface, and the cockpit's `scheduleNextFire` KPI is non-null
      (engine fix 0b verified end-to-end). Re-install preserves scheduler runtime
      state (upsert discipline).
- [ ] **Full Naya-path Mode C staging run** from the packed tarball: install →
      community first-run → Pro visible-locked in `/packs` → license add (real
      fixture) → ceremony → licensed banner → no-flag premium install → D4 proof
      (remove license, pack stays). BOTH loopback and `--hostname 0.0.0.0` LAN.
- [ ] Publish smoke (Case L) exercises the real pack; CI green.
- [ ] D7 parity: `pack list` marks `[premium]`; Settings → License and CLI agree.

## Scope Boundaries

**Included:** the two prerequisite engine fixes (0a trigger-table rewrite, 0b
manifest-schedule registration — free for everyone, D5), the `relay-agency-pro`
template (pack.yaml + manifest + chapters 1–4 + CRE deep chapter), fixture-protocol
retirement, unit tests (engine fixes; catalog lists it as premium; gated-install
paths), the Mode C acceptance run.

**Excluded:**
- The nonprofit deep chapter — v0.2.0, the first paid update (resolved decision 4).
- Any OTHER engine change (new trigger kinds, KPI sources, kits, engine-level
  batch iteration) — separate free-shipping specs if needed (D5).
- Website relay items — pricing page copy, fulfilment email rewrite,
  gating-philosophy page (same S4 session, separate track via
  `strategy/relay/_RELAY.md`).
- Seat enforcement, reverse trials, registration keys (PLG-4, operator-gated).
- Managed `base/` updates machinery — the `overrides/` layer exists; the update
  *workflow* is future work tied to the first paid update.
- A third vertical — depth over breadth while this is the only premium pack.

## References

- Program decision record: `_SPECS/2026-07-01-200629_plg-refine.md` §1 (Naya), §4 (D4/D5/D6/D7), §5 PLG-2b.
- Pack format: `src/lib/packs/format.ts` (PackManifestSchema, overrides layering);
  primitive palette: `src/lib/apps/registry.ts` (triggers, schedules, ledger kit,
  tableSumWindowed/ratio KPIs).
- Free-pack baseline: `src/lib/packs/templates/relay-agency/` (what Pro must not
  regress and what it upsells from).
- Mode C protocol + real license fixture: `features/feat-license-lifecycle.md`
  verification section; Mode B capture precedent `output/staging/2026-07-01/`.
- Positioning brainstorm: 2026-07-01 session (free = verbs, Pro = operating system;
  WTP filter: revenue-touching > recurring > hard-to-DIY).
