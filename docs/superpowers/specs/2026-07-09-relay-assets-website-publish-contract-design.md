# Relay `_ASSETS` → Website Publish Contract — Design Spec

_Date: 2026-07-09 · Stage: `_ASSETS` (cross-cutting IA + ownership contract) · Status: design approved, pre-plan · Scope mode: HOLD_

> Sibling context: this spec sits above the individual `_ASSETS` deliverables (docs, api,
> demo, memos). It defines **where each asset lands on the marketing website and who owns
> what** across the Relay↔website boundary. It does **not** authorize building any asset
> ahead of the existing `_ASSETS` priority ladder (enforcement → docs/demo false-greens →
> consolidation → memos). See `HANDOFF.md` → `_ASSETS` and the operator origin instruction
> pinned at the top of `_ASSETS/README.md`.

## 0. The scope change this spec captures

Operator decision (2026-07-09): extend the single-source, copy-verbatim publish model —
already chosen for articles/field-notes — to **all four** website-bound `_ASSETS`
deliverables: **docs (user guide), api (API reference), demo, and memos** (the renamed
articles/field-notes). Relay produces website-ready artifacts at the source and verifies
their fidelity there; the website copies them verbatim with zero re-skin.

Two naming/identity decisions locked here:
- **"Relay Field Notes" / "articles" → "Memos", route `/relay/memos/`.** Worked backwards
  from ICP job-to-be-done (a builder/operator whose intent is "show me someone really doing
  this so I can do it myself"); a *memo* is a first-hand note from the work, made public.
  Distinct from Proof's "Receipts" (evidence) and the site's site-wide "Story" blog.
- Publish mechanism for all four: **single-source, copy verbatim** (not Proof/receipts'
  two-step raw→polish, which re-introduces the drift the single-source model kills).

## 1. Two websites — reference vs publish target

A recurring confusion this spec ends. There are **two** websites; only one is a publish target.

| Repo | Role | Relationship to `_ASSETS` |
|---|---|---|
| `~/ainative-business.github.io/` | **REFERENCE / quality bar / prior art.** The Arena product demo is the app-like-demo bar; its IA is *inspiration*. | Read for inspiration + as the demo fidelity bar. **Never a publish target.** |
| `~/orionfold/website/` (**orionfold.com**) | **PUBLISH TARGET.** Hosts `/relay/` landing + `/story/` building-in-public stories; will host the new `/relay/{demo,docs,api,memos}/`. | The destination `_ASSETS` deliverables land on. Astro 5 → GitHub Pages, `CNAME orionfold.com`. |

Both are strategy-owned peer repos: **read-only** from Relay; Relay commits/pushes to neither.

## 2. The ownership contract (the heart of this spec)

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  RELAY  (_ASSETS/ pipeline) │  READ   │  WEBSITE (orionfold.com)     │
│  strategy-owned SSOT        │────────▶│  ~/orionfold/website          │
│                             │(website-│                              │
│  OWNS: docs, api, demo,     │  ready) │  OWNS: IA, nav, CTAs, design  │
│        memos — as           │         │        system, routing,      │
│        website-ready,       │         │        build/deploy, and the │
│        rendered /           │◀────────│        verbatim copy step    │
│        schema-valid,        │  NEVER  │                              │
│        verified-at-source   │  writes │  copies _ASSETS → publishes  │
└─────────────────────────────┘         └──────────────────────────────┘
```

**Three-line contract:**
1. **Relay never writes into the website.** `_ASSETS` produces artifacts; a human/website-side
   step copies them in. Relay's git never touches `~/orionfold/website`.
2. **Website never writes into `_ASSETS`.** The website consumes; it never edits, re-skins, or
   writes back to the source. No downstream polish pass.
3. **Relay MAY read the website — read-only, one direction — but only to prepare
   website-ready assets** (vendor its design-system tokens/schemas, match collection
   frontmatter, path-scope a bundle).

**Corollary — the "much better than receipts" rule.** Because the website copies **verbatim**
with zero re-skin, **all render-fidelity enforcement lives at the source**, in `_ASSETS`, via a
vendored design-system snapshot + a drift-check that fails closed. This single-source model is
what beats Proof's two-step raw→polish. Invariant across the whole corpus: **green = behaviorally
/ claim verified, never structurally present.**

## 3. Where each asset lands + publish rail

Two publish rails already exist on the website; each asset picks the right one.

- **Rail A — static bundle → `public/`** (verbatim files, no Astro processing). Precedent:
  Arena demo at `public/arena/demo/`.
- **Rail B — schema-valid markdown → content collection** (`src/content/*`, rendered by the
  site's own layout). Precedent: `story`, `receipts`, `productDetail`.

```
_ASSETS ASSET      RAIL   WEBSITE LANDING            SITE-SIDE COPY STEP
─────────────────  ─────  ─────────────────────────  ──────────────────────────
demo/dist/         A      public/relay/demo/         cp bundle → public/ (verbatim)
memos/<slug>/      B      src/content/memos/ +       cp .md + assets → collection
                          /relay/memos/[slug]/
docs/guides/       B      src/content/relay-docs/ +  cp .md → collection
                          /relay/docs/[slug]/
api/reference/     B      src/content/relay-api/ +   cp .md → collection
                          /relay/api/[slug]/
```

### The render boundary (Rail A vs Rail B)

```
Rail A (demo):   Relay renders 100% ──────────────▶ public/ (served as-is)
Rail B (memos/   Relay renders CONTENT ─┐
docs/api):                              ├─▶ site layout renders CHROME ─▶ page
                 site owns the shell ───┘
   ▲ fidelity seam: Relay = content truth; website = chrome/design system
```

- **Demo (Rail A):** Relay renders 100%. `dist/relay/demo/` is already base-pathed
  (`window.__RELAY_DEMO_BASE_PATH__ = "/relay/demo/"`). Website copies verbatim into
  `public/relay/demo/`. Nothing on the site renders it. **This is the model artifact.**
- **Memos / Docs / API (Rail B):** Relay ships **schema-valid markdown + assets**, copied
  byte-for-byte; the **website's Astro collection layout renders the chrome** (nav, footer,
  typography, TOC). Relay guarantees *content fidelity* (every claim true, every number traced,
  frontmatter schema-valid, screenshots resolve); the website guarantees *chrome fidelity*.

**Why not ship final HTML for docs/api/memos too:** that would force Relay to vendor and
re-implement the entire site layout and re-verify it on every redesign — brittle, and it fights
the website's ownership of its own chrome. Markdown-into-collection is the site's native,
already-proven ingestion path. Relay enforces only what it is authoritative for: the content.

### Per-asset landing detail

- **Demo → `public/relay/demo/`** — net-new site route (no Relay demo exists today). Fidelity
  enforced at source by `verify-relay-demo.mjs` (behavioral B1–B5). Ships the moment it's green;
  independent of the collection-schema coordination below.
- **Memos → `/relay/memos/`** — net-new `memos` content collection (mirrors `story`/`receipts`
  shape). Relay authors publication-ready `.md` + hero SVG + screenshots in
  `_ASSETS/memos/<slug>/`; website copies `.md` → `src/content/memos/` and assets →
  `src/assets/memos/<slug>/`.
- **Docs → `/relay/docs/`** — net-new `relay-docs` collection + `/relay/docs/` index +
  permalinks. Generalizes the existing `/trust/*`-mirrors-Relay-repo-markdown precedent.
- **API → `/relay/api/`** — net-new `relay-api` collection, 8 reference groups → permalinks +
  index. Machine-readable spec feed deferred (see §7).

## 4. CTA + nav coexistence (protect the buy-funnel)

`/relay/` is a tuned conversion funnel (hero → LicenseBand → RelayBox → sticky bar all drive the
license buy; free-book email is the secondary axis). The site already demoted the Constellation
(Proof/Arena) links to low-prominence tertiary — that is the precedent for how "explore" links
coexist with "buy."

**Principle: assets are a SECONDARY, mid-to-lower conversion axis. They feed the buy; they never
outrank it.** Flow: *land → intrigued → explore an asset → return more convinced → buy.*

```
TIER 1  BUY          hero CTA · LicenseBand · RelayBox · sticky bar   ← UNTOUCHED
TIER 2  CAPTURE      free-book email opt-in (OfferSlot)               ← UNTOUCHED
TIER 3  EXPLORE      Demo · Memos · Docs · API                        ← NEW, tertiary
        (same prominence band as the existing demoted Constellation)
```

| Asset | CTA placement | Prominence |
|---|---|---|
| Demo | "Try the demo" link inside existing `RelayShowcase` ("See it running") | Tertiary, mid-page |
| Memos | `/relay/` "Latest memos" strip + optional site footer band | Tertiary |
| Docs | Quiet link in `/relay/` security/trust cluster + section footer | Tertiary |
| API | Paired with Docs; developer-ICP only | Tertiary/low |

**Hero stays sacred** — no asset CTA enters the hero CTA row or the sticky bar (recommendation
explicitly *against* a hero "Try the demo" secondary; it splits hero single-action clarity).

**Nav decision — product-scoped sub-nav, not four new global-nav items:**

```
GLOBAL NAV   Relay · Proof · Arena │ Models · Books │ Story     ← UNCHANGED
                │
                └── /relay/ SECTION SUB-NAV (new, local):
                    Overview · Demo · Docs · API   (+ Memos strip)
```

Rationale: four new global items would dilute the deliberately Relay-led nav, imply site-wide
docs/api (we chose product-scoped `/relay/docs`, not `/docs`), and compete for top-bar attention
with the buy path. Memos may earn a global/footer slot **only if** it proves out (YAGNI on nav
real estate until there's a body of memos).

## 5. Which website pages/sections change, and why

These are changes the **website team** makes (Relay never writes the site). This is the
coordination contract the website consumes via `_RELAY`.

### Net-new on the website

| # | New surface | Files (website side) | Why |
|---|---|---|---|
| N1 | `/relay/demo/` static route | copy `_ASSETS/demo/dist/relay/demo/` → `public/relay/demo/` | No Relay demo; Arena demo is the precedent. Rail A. |
| N2 | `memos` collection + `/relay/memos/` routes | `src/content.config.ts`; `src/content/memos/*.md`; `src/pages/relay/memos/{index,[slug]/index}.astro`; `src/assets/memos/<slug>/` | Memos have no home. Mirrors `story`/`receipts`. Rail B. |
| N3 | `relay-docs` collection + `/relay/docs/` routes | new collection; `src/content/relay-docs/*.md`; `src/pages/relay/docs/{index,[slug]/index}.astro` | No user-guide surface exists. 9 guides → permalinks + index. Rail B. |
| N4 | `relay-api` collection + `/relay/api/` routes | new collection; `src/content/relay-api/*.md`; `src/pages/relay/api/{index,[slug]/index}.astro` | No API-reference surface exists. 8 groups → permalinks + index. Rail B. |
| N5 | `/relay/` section sub-nav | new `RelaySubNav.astro` (Overview · Demo · Docs · API) | §4 decision: product-scoped sub-nav, not global-nav items. |

### Modified existing surfaces

| # | Existing surface | File | Change | Why |
|---|---|---|---|---|
| M1 | `/relay/` `RelayShowcase` | `src/components/product/RelayShowcase.astro` | Add Tier-3 "Try the demo" → `/relay/demo/` | Natural host for highest-intent explore CTA. |
| M2 | `/relay/` security/trust cluster | `src/pages/relay.astro` | Add quiet Docs + API links | Evaluation reassurance, tertiary. |
| M3 | `/relay/` Memos strip | `src/pages/relay.astro` | Add "Latest memos" strip | Discovery without funnel real estate. |
| M4 | Global footer directory | `src/components/Footer.astro` | Optional "Latest memos" band (like "Latest stories") | Site-wide discovery, YAGNI-gated. |
| M5 | Redirects / sitemap | `astro.config.mjs` | Sitemap auto-covers new collections; redirects only if a path retires | Housekeeping. |

### Explicitly NOT changed (scope-creep guard)

- **Global header nav** — unchanged. No new top-level items.
- **Hero CTA row + sticky bar + LicenseBand + RelayBox + email capture** — untouched. Buy-funnel
  stays sacred.
- **`/story/`, `/receipts/`, `/proof/`** — untouched. Memos is a *new* collection, not a graft.
- **The website's live design system** — Relay vendors a snapshot for verification; never edits it.

### The vendored-contract surface (Relay side — what makes N2/N3/N4 safe)

For each Rail-B collection, Relay vendors the website's frontmatter schema + tokens into
`_ASSETS/<area>/_design-system/` and runs a drift-check (generalizing the field-notes §3 pattern
and the catalog drift-guard). This lets the website's copy step be dumb and verbatim: Relay has
already proven the markdown is schema-valid against the site's *actual* collection schema before
handing it over.

```
Relay side (_ASSETS)                     Website side (orionfold.com)
────────────────────                     ────────────────────────────
docs/_design-system/  ◀── drift-check ──  src/content.config.ts (relay-docs schema)
api/_design-system/   ◀── drift-check ──  src/content.config.ts (relay-api schema)
memos/_design-system/ ◀── drift-check ──  src/content.config.ts (memos schema)
demo/ (self-contained, base-pathed)  ──▶  public/relay/demo/ (verbatim)
        │                                          ▲
        └── verify-at-source gates ────────────────┘  website copies only what passed
```

### Coordination order (schemas-first)

The website's collection **schemas must exist first** (N2/N3/N4 config), because Relay vendors
*from* them and verifies *against* them. First `_RELAY` message to the website defines the three
frontmatter schemas; Relay then vendors those and produces conformant content. **Demo (N1) is
independent** — it ships the moment its behavioral verifier is green.

## 5.5 Website-side handoff via `_RELAY` (the cross-repo coordination step)

Relay never writes the website, so every website-side change (N1–N5, M1–M5) is requested — not
performed — via the peer channel. Channel + conventions (house format):

- **Channel:** `~/orionfold/strategy/orionfold-website/_RELAY.md` (the **publish-target** website's
  channel — *not* `ainative-business.github.io`). Dated `## YYYY-MM-DD — Relay→Website — <title>
  [status]`, prose body, signed `— Relay-side (dev), <date>`, **newest-at-bottom, edit-only**.
- **Git rule:** the strategy repo is **read/write only** — Relay *edits* the `_RELAY.md` file but
  **never commits/pushes/merges** there; the owner's CC instance owns git ops on the strategy repo.
  Posting the message is therefore an **operator-gated outward comm**, not a silent side effect.

**Where this sits in the sequence:** the `_RELAY` handoff is authored **once the Relay-side
producer for an asset is real and its at-source gate is green** — never as a speculative ask ahead
of having something to hand over. Order per asset:

```
1. Relay builds the asset in _ASSETS + its at-source gate exits 0
        (memos/docs/api additionally: vendor the site schema + drift-check green)
2. Relay AUTHORS the _RELAY handoff (drafted below) — operator posts it
3. Website implements N#/M# (schemas first for Rail-B assets), copies the verified output
4. Website confirms live on _RELAY; Relay marks the handoff [done]
```

Two staged handoffs (avoids one giant ask, matches the schemas-first order):

- **Handoff A — Rail-B schemas (blocks nothing Relay-side; unblocks memos/docs/api production).**
  Asks the website to define the three collection schemas (N2/N3/N4 config only) so Relay can
  vendor + verify against real schemas. Sent early, because Relay's content production *depends on
  it*.
- **Handoff B — per-asset publish (one per asset, as each goes green).** Asks the website to add
  the routes/sub-nav/CTAs (remaining N#/M#) and copy the specific verified output. Demo (N1) can
  be its own Handoff B the moment `verify-relay-demo.mjs` is green, independent of A.

**Drafted Handoff A (post when Rail-B production is about to begin):**

```
## <date> — Relay→Website — Define 3 Relay collection schemas for the _ASSETS publish contract [open]

Relay is standardizing how _ASSETS deliverables land on orionfold.com: single-source,
copy-verbatim. Full contract: relay repo docs/superpowers/specs/2026-07-09-relay-assets-website-publish-contract-design.md.

Ask (schemas-first — Relay vendors + verifies against these before producing content):
- `memos`     collection → routes /relay/memos/{index,[slug]}   (mirror the `story`/`receipts` shape)
- `relay-docs` collection → routes /relay/docs/{index,[slug]}    (net-new user-guide surface)
- `relay-api`  collection → routes /relay/api/{index,[slug]}     (net-new API-reference surface)

Just the `src/content.config.ts` schema definitions for now (fields + route stubs). Relay copies
in schema-valid .md + assets later, per-asset, only after our at-source gate is green — you do a
verbatim copy, no re-skin. Reply with the final field names so we vendor the exact schema.
— Relay-side (dev), <date>
```

**Drafted Handoff B (template, one per asset as it goes green):**

```
## <date> — Relay→Website — Publish Relay <asset> (verbatim) [open]

<asset> is built + its at-source gate is green (<verifier> exits 0). Please:
- <Rail A:> copy _ASSETS/demo/dist/relay/demo/ → public/relay/demo/  (served as-is; do not re-skin)
- <Rail B:> copy _ASSETS/<area>/<slug>/*.md → src/content/<collection>/, assets → src/assets/<...>/
- Add routes/sub-nav/CTAs per N#/M# in the contract spec (Tier-3 EXPLORE; do not touch the buy-funnel)
Nothing downstream re-checks fidelity — it's enforced at our source. Confirm live and I'll mark [done].
— Relay-side (dev), <date>
```

## 6. Error & Rescue Registry (HOLD mode)

| Error | Trigger | Impact | Rescue |
|---|---|---|---|
| Verbatim copy lands broken | Copied `.md` frontmatter doesn't match the live collection schema | Build fails / page renders wrong | At-source drift-check fails CLOSED before copy is offered; copy runs only on assets that passed the gate. |
| Silent schema drift | Website edits a collection schema; Relay's vendored snapshot goes stale | Relay produces to an old contract; false green | Drift-check re-derives from live site schema, fails loud; when website repo not on disk, loud SKIP-with-warning, never silent pass. Resync is a deliberate human act. |
| Demo false-green | Bundle passes existence checks but is a mock / mutations don't change the DOM | A "working demo" that lies | `verify-relay-demo.mjs` B1–B5 behavioral gate (real shim, stream replay, mutation → visible DOM change, all persona lanes). Copy on green only. |
| Docs/API claim rot | Product evolves; a claim is now false but structural checks still pass | Customer-facing lie (the "false green") | Per-claim accuracy pass vs live source + `features-catalog.md` boundary; extend `verify-*.mjs` toward claim-attribution. Untraceable claim = fail. |
| CTA cannibalization | An asset CTA promoted into a Tier-1 surface | Buy-funnel conversion drop | Tier discipline (§4) documented as contract; hero/LicenseBand/RelayBox/sticky/email off-limits. Promotion is a deliberate measured decision, not a default. |
| Relay writes website (or reverse) | A session commits generated output into the website, or website writes into `_ASSETS` | Ownership broken; SSOT ambiguity; two-way drift | One-direction rule pinned in `_ASSETS/README.md` + HANDOFF + memory; Relay git scope excludes the website; coordination via `_RELAY`, human-gated. |
| Number/prose desync (memos) | A memo cites a metric absent from its `metrics.json` | Unverifiable claim | Field-notes gate: every prose number ∈ `metrics.json` or verifier fails. |
| Orphaned asset | Website route deleted/renamed but `_ASSETS` keeps producing (or reverse) | Dead content / 404s / wasted production | `features-catalog.md` is the live-product boundary; schemas-first order + `_RELAY` keep route ownership synced; retirement is an explicit `_RELAY` message, never silent. |

**Cross-cutting invariant:** green = behaviorally / claim verified, never structurally present.
Every gate enforces truth-at-source, because the website copies verbatim and nothing downstream
re-checks.

## 7. NOT in scope (deferred, with rationale)

| Deferred item | Why deferred |
|---|---|
| Building any of the assets | This is the IA + contract spec. Asset production stays on the existing `_ASSETS` priority ladder; this spec shapes the target, it does not move work up the queue. |
| The website-side implementation (collections, routes, sub-nav, copy step) | Peer repo, strategy-owned. Relay never writes it — it is **requested** via the staged `_RELAY` handoffs in §5.5 (operator-posted); the website team implements N1–N5 / M1–M5. |
| Global-nav promotion for Memos | YAGNI until a body of memos exists. Footer + `/relay/` strip first. |
| Cross-listing memos into site-wide `/story/` | Possible later discovery nicety; not required for launch. |
| Machine-readable API spec feed (`/relay/api.json`, OpenAPI-style) | The `/relay/pricing.json` precedent exists, but the human-readable reference is the deliverable now; a spec feed is a later add. |
| Renaming `_ASSETS/articles/` → `memos/` on disk | Mechanical, happens during the memos build; the naming decision (Memos, `/relay/memos/`) IS locked here. Update the field-notes design spec accordingly at build time. |
| Book compilation (T6) | Downstream of memos; already deferred. |

## 8. What already exists (reuse, don't rebuild)

- **Rail A** — Arena demo (`public/arena/demo/`) is the exact static-bundle publish precedent;
  Relay demo already base-paths to `/relay/demo/`.
- **Rail B** — `story` / `receipts` / `productDetail` collections are the exact
  markdown-into-collection precedent; `/trust/*` already mirrors Relay-repo markdown
  (`src/data/trust-pages.ts` ← `~/orionfold/relay/docs/trust/*.md`).
- **Drift-check pattern** — the catalog drift-guard (`derive/verify` + fails-closed) and the
  field-notes `_design-system/` vendoring are the exact pattern to generalize to docs/api/memos.
- **Behavioral verify pattern** — `verify-relay-demo.mjs` (B1–B5) is the fidelity-at-source model.
- **Re-sync contract precedent** — `productDetail.sources[] + lastSynced` and `/relay/pricing.json`
  show the website already models re-syncable generated content between product and site.

## 9. Relationship to the Field Notes design spec

`docs/superpowers/specs/2026-07-09-relay-field-notes-design.md` already chose the single-source,
copy-verbatim model for one deliverable (articles/field-notes). This spec:
- **Generalizes** that model to docs, api, and demo.
- **Renames** the deliverable: Field Notes / articles → **Memos**, route `/relay/memos/`.
- **Adds** the two-website distinction, the CTA/nav coexistence contract, and the concrete
  website page/section change list (N1–N5, M1–M5).

At memos build time, reconcile the field-notes spec's naming (`_ASSETS/articles/` →
`_ASSETS/memos/`, "Field Notes" → "Memos", route `/relay/memos/`) — see §7.

## End-to-end check

This contract is "working" when, for any one asset:
1. Relay produces it in `_ASSETS`, and its at-source gate (drift-check + behavioral/claim verify)
   **exits 0**.
2. A website-side verbatim copy of exactly that output builds and renders correctly on
   orionfold.com **with no re-skin and no website-side edit to the content**.
3. Removing the source's fidelity guarantee (delete a mined number, mock the demo, drift the
   schema) makes the at-source gate **exit non-zero** — the copy is never offered.
4. The website receives the request through the §5.5 `_RELAY` handoff (operator-posted) and does
   a verbatim copy; Relay never wrote the website directly.

That proves the single-source, copy-verbatim contract end-to-end: fidelity enforced where the
content is authored, coordination flowing one direction through `_RELAY`, the website a dumb
faithful publisher.
