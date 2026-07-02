---
title: Pack gallery PLG-marketing-grade cards (visual, full copy, two-phase price, scales to N packs)
status: completed
priority: P1
milestone: mvp
source: output/staging/2026-07-02/EVALUATION.md
dependencies: []
---

# Pack gallery PLG-marketing-grade cards

> Grooms **GitHub #21** (design, operator-raised) and **folds in #20** (founding intro-price
> mechanic) — the price render contract lives inside this card design and `meta.price` has exactly
> one consumer, so one implementation session closes both issues. This is a **frontend-design
> spec**: invoke the `frontend-design` + `taste` skills at implementation for creative execution;
> this spec fixes the information architecture and contracts, not the pixels.

## Description

The `/packs` gallery is the PLG-2 graduation surface — its conversion quality *is* the funnel —
and it currently under-sells. Observed on the 2026-07-02 fresh-install persona smoke (Naya, solo
agency founder) and code-verified:

- **Sparse 2-card row on a wide canvas.** `src/app/packs/page.tsx:32` renders a uniform
  `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` of compact `p-3` cards; with 2 bundled packs
  (`relay-agency` free, `relay-agency-pro` premium) most of the page is dead space.
- **The sales copy is clamped away.** Agency Pro's 6-chapter description
  (`src/lib/packs/templates/relay-agency-pro/pack.yaml:7-20`, explicitly authored as "sales copy,
  not an internal summary" — it ends on the "never phones home" trust line) is truncated behind
  `line-clamp-2` at `page.tsx:98`. The value story a buyer needs is invisible.
- **No per-pack visual identity.** Cards differ only by a lock-vs-package glyph and text.
- **The product can't express the live founding price (#20).** The card badge renders
  `meta.price ?? "Premium"` (`page.tsx:92`) from a flat `price: z.string()`
  (`src/lib/packs/format.ts:51`). The website the "Get license →" CTA opens
  (orionfold.com/relay/) correctly advertises **$349 founding for the first N buyers → $499
  normal**. The website is RIGHT; the product has no schema shape to say it, so a real buyer sees
  $499 in-app and $349 at checkout — a trust hit at the worst possible moment.
- **Won't scale.** "More packs coming soon" — the flat grid has no browse/filter affordance for a
  growing catalog.

## User Story

As a solo agency founder evaluating the free edition, I want the pack gallery to show me the full
value story and the real offer (founding price included) for each premium pack, so that I can make
the buy decision in-app without discovering a different price at checkout.

## Technical Approach

### Slice 1 — price schema: express intro/founding + list (#20)

- Widen `PackManifestSchema.price` (`format.ts:51`) to a union, back-compat with the flat string:
  ```ts
  price: z.union([
    z.string().min(1),
    z.object({
      list: z.string().min(1),      // "$499/year"
      intro: z.string().min(1).optional(),  // "$349/year"
      note: z.string().min(1).optional(),   // "Founding price for the first N buyers"
    }).strict(),
  ]).optional()
  ```
- Add a single normalizer in `format.ts` (e.g. `packPrice(meta): { list, intro?, note? } | null`)
  so every render site consumes one shape and never branches on string-vs-object. `meta.price`
  currently has exactly one consumer (`page.tsx:92`) — keep it that way: card and any future recap
  surface read the normalizer.
- Update `relay-agency-pro/pack.yaml` to the object shape with the founding price, copy matched to
  the website. **Stays offline and hand-maintained** — no live price fetch; the "never phones
  home" promise stands. When the founding window closes, the Website channel flags it and the
  `intro` field is removed in a normal release.
- No pack `version` bump required: the locked-card price renders from the **bundled template**
  (`listPackTemplates` reads the templates dir), which ships in lockstep with the npm package —
  installed users' cards show `InstalledActions`, which has no price. If a bump happens anyway,
  the pack `changelog:` line rule applies (template test enforces it for Agency Pro).
- Compat note: `PackManifestSchema` is `.strict()`, so an **older core** parsing an
  externally-distributed pack.yaml with an object `price` fails as `PackValidationError`. For the
  in-tree template this can't happen (same tarball); an externally-shipped pack adopting the shape
  must raise its `relayCore` range to the version that ships this union.

### Slice 2 — card + layout redesign (#21, frontend-design)

Information architecture the design must satisfy (creative execution belongs to the
`frontend-design`/`taste` skills at implementation):

- **The locked premium card is the conversion hero.** Surface the FULL sales description — no
  clamp on locked premium cards (free/installed cards may stay compact). The 6-chapter copy is
  long prose; give it typographic room rather than a schema restructure (a `highlights:` list
  field is a future option, not this slice).
- **Two-phase price block.** Render `intro` + `list` + `note` from the normalizer — e.g. founding
  price prominent, list price as the anchor ("$349 founding · $499 after" or a
  struck-through-list treatment; copy treatment is a design call). Flat-string packs render
  exactly as today.
- **Per-pack visual identity.** Add an optional `icon:` field (lucide token string) to
  `PackManifestSchema`; derive an accent treatment from the design system. Constraint: **no
  remote assets** — identity comes from bundled tokens/derivation, not fetched imagery. A
  cover-image asset pipeline is explicitly out of scope.
- **Free-vs-premium legibility at a glance** — distinct card treatments, not just a glyph swap.
- **Use the canvas at N=2, scale to N≥6.** A featured/hero placement for the premium pack at
  small catalog sizes; lightweight filter affordance (at minimum All · Free · Premium chips,
  derived from `entitlement` — no new schema) that earns its place as the catalog grows. A
  `category:` taxonomy is premature at N=2 — excluded, noted as the future browse axis.

### Preserve (working-as-designed, do not regress)

- **D6 visible-but-locked semantics** — premium packs always listed; only content install is
  gated. The page-level comment fence at `page.tsx:16` ("NOT a marketplace") stands.
- **Corrupt-template error card** (`page.tsx:49-67`) — a corrupt bundled pack is surfaced, never
  hidden.
- **Installed state** (`InstalledActions`, `page.tsx:134-175`): installed version, "Open app →",
  update button + the `changelogWindow` value-recap lines.
- **Install/CTA pairing**: `PackInstallButton` + "Get license →" (`purchaseUrl`) on locked cards.
- Server-component page with client-component buttons; decorative icons stay `aria-hidden`;
  keyboard focus states on all interactive elements.

### Verification

- Unit: schema union (flat string parses unchanged, object shape parses, junk shapes fail loudly
  as `PackValidationError`); normalizer; existing `pack-format` / `agency-pro-template` suites
  stay green.
- **Browser evaluation is required** (CLAUDE.md: visual change needs real verification): launch
  the `relay-staging` harness, walk the graduation surface as the persona, screenshot the locked
  card (full copy + two-phase price) and the N-pack layout to `output/`.
- Not runtime-registry-adjacent (packs catalog, not `agents/runtime`) — no launch-smoke budget
  triggered beyond the browser pass.

## Acceptance Criteria

- [x] `price` accepts both the flat string and `{ list, intro?, note? }`; every existing
      flat-string pack parses byte-identical behavior (back-compat test).
- [x] The Agency Pro locked card renders the two-phase founding→normal price matching
      orionfold.com/relay/ ($349 founding → $499 list), fed by a single normalizer — no
      site-local shape branching. Closes #20.
- [x] The locked premium card surfaces the full `pack.yaml` sales description — the 6-chapter
      copy and its closing "never phones home" line are readable without truncation.
- [x] Each pack card has a distinct visual identity (icon/accent), and free-vs-premium is legible
      at a glance.
- [x] The layout uses the canvas at N=2 (no sparse dead-space row) AND degrades gracefully at
      N≥6 with a browse/filter affordance (at minimum All/Free/Premium).
- [x] Preserved behaviors verified: corrupt-template card, installed state (version, Open app,
      update + changelog recap), install button gating, Get-license CTA.
- [x] No network fetch introduced anywhere on the surface — price and copy stay offline.
- [x] Browser-verified on the staging harness with screenshots in `output/`. Closes #21.

## Scope Boundaries

**Included:**
- Price schema union + normalizer in `format.ts`; `relay-agency-pro/pack.yaml` founding price.
- `/packs` card and layout redesign; optional `icon:` display field; free/premium filter chips.

**Excluded:**
- Any live price fetch or phone-home mechanism (promise stands; founding window stays
  hand-maintained).
- A real marketplace (feature-cut fence at `page.tsx:16`), pack publishing, reviews.
- `category:` taxonomy + search (future browse axis — premature at N=2).
- Cover-image asset pipeline (identity via icon token/accent only, this slice).
- Website changes — the website is CORRECT; do not touch its copy from here.
- Changing actual price values beyond expressing the existing founding mechanic.
- CLI price surfaces (none exist — `meta.price`'s sole consumer is the gallery card, verified).
- Restructuring the sales copy into schema fields (`highlights:` list is a noted future option).

## References

- GitHub issues: **#21** (enhancement+plg+design, operator-raised) and **#20** (bug+plg) — this
  spec closes both.
- `output/staging/2026-07-02/EVALUATION.md` F3/F4 — note F3's "website likely stale" line
  predates the operator's reframe; the issues carry the corrected framing (**website is
  CORRECT**, the product lacks the mechanic).
- `_SPECS/plg-refine.md` §2 (PLG-2 graduation surface) — program context (strategy repo,
  edit-only).
- Related features: `feat-graduation-surface.md` (the surface this refines),
  `feat-renewal-value-recap.md` (the `changelog:` recap lines the installed card renders).
- Implementation skills: `frontend-design` + `taste` (design), `relay-staging` (verification).
