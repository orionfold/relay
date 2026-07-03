---
title: Fix — /packs card can drift from canonical pricing between releases (runtime hardcoded, gate is release-only)
status: proposed
priority: P3
milestone: post-mvp
source: staging Mode A+C run 2026-07-03, bundle output/staging/2026-07-03/ (F3 verified CORRECTED → residual)
dependencies: []
---

# Fix: /packs price is hardcoded in pack.yaml at runtime; drift only caught at release

## Description

The /packs card renders the **hand-maintained `price` strings from `pack.yaml`** at runtime.
It does NOT read the canonical `orionfold.com/relay/pricing.json` live. Divergence between the
product price and the website price is caught by the publish gate `scripts/check-price-drift.mjs`
at **release time only** (and that gate fails open when offline). Between releases, a website
price edit leaves the running product showing stale numbers with no signal to anyone.

This is the residual after the loud "$499 vs $349 at purchase" contradiction was resolved. Today
`relay-agency-pro/pack.yaml:44-48` carries `price: { intro: "$349/year", list: "$499/year", note }`
and the card (`src/app/packs/page.tsx:170-188`, `:305`) shows $349 (intro) with $499 struck
through — matching the website founding price. There is **no live mismatch right now**; this fix
closes the *mechanism* by which one could reappear mid-cycle without detection.

Verified 2026-07-03 (staging bundle, Explore agent): the drift gate covers the release path but the
runtime path has no canonical source (CLAUDE.md #3, shadow paths). This is the same "canonical-source
read" the `plg-persona-smoke-findings` memory already flagged as the remaining drift risk after the
intro-price mechanic shipped (2026-07-02, #20).

## Severity rationale (why P3, not P1)

The raw field observation read as P1 conversion-critical. Code-verification downgraded it: the
release gate bounds staleness to a single release cycle, and the current values already match. The
defect is a *latent* drift window, not a live wrong price. Groomed at its verified severity.

## Repro

1. (Hypothetical, no live repro today) Edit the website `pricing.json` founding price mid-cycle
   without a Relay release.
2. Running product `/packs` card continues to show the old `pack.yaml` intro string.
3. No warning surfaces until the next release runs `check-price-drift.mjs`.

## Proposed fix

Optional runtime canonical-price read, cached and **fails-open** to the hardcoded `pack.yaml`
string (never blocks render, never phones home user data — a read-only pull FROM the canonical
Orionfold source is allowed per memory `phone-home-definition`):

- On the /packs server component, attempt a short-timeout GET of `pricing.json` (the same canon
  `check-price-drift.mjs` already reads); cache it (build-time or a short TTL).
- If reachable and it disagrees with `pack.yaml`, prefer the canon for display (or surface a
  dev-only warning) — decide during design which is safer for the buyer.
- If unreachable, render the hardcoded `pack.yaml` string exactly as today (no regression).

Keep the publish gate as the belt-and-suspenders release check. This fix removes the *runtime*
shadow path; the gate keeps the *release* path honest.

## Out of scope

- Changing the price values (they are code-true and match the website).
- The pack-gallery visual redesign (`fix-packs-gallery-plg-cards.md`, separate F4 concern).
