---
title: Per-line entitlements — migrate to product:relay-*, all-access tier, foundation packs free
status: planned
priority: P2
milestone: post-mvp
source: _IDEAS/packs-evolution.md §7 + §8.4
dependencies: [pack-bundle-model, pack-agency-bundle]
---

# Per-line entitlements

## Description

One `entitlement` string unlocks **all** premium packs today. A catalog of distinct lines
(Agency, Marketing, Investing) needs a buyer to pay for the line they use — not one master key.
The good news (`packs-evolution.md §7`): the entitlement field is already "the unit of
entitlement, version- and pack-id-agnostic" (`src/lib/packs/format.ts`), so **per-line strings
need zero schema change** — this is a content migration + a pricing coordination, not new
licensing infrastructure.

The model:
- **Foundation/core packs are FREE** — capability, and D5 says capabilities never move behind a
  paywall; a `dependsOn`/bundle on a free core never gates a buyer.
- **Feature/depth packs carry a per-line entitlement** — `product:relay-marketing`,
  `product:relay-investing`, `product:relay-agency`. Buy the line you use.
- **Bundle price maps to the parent** — Marketing = one price unlocking the line.
- **All-access tier = a superset/wildcard entitlement**; today's single license grandfathers in
  (D4 never re-lock).

This is P2: it follows the bundle proof (a per-line price is meaningless until there is more than
one line), it needs Website `pricing.json` + `_RELAY.md` coordination, and no capability regresses
while it is pending (the current single entitlement keeps working).

## User Story

As a buyer who only needs the Marketing line, I want to purchase `product:relay-marketing` and
unlock exactly that line, so that I am not forced into an all-packs license for one function —
and as an existing single-license holder, I keep everything I already paid for.

## Technical Approach

- **Migrate pack entitlements to per-line strings.** Change each paid pack's `entitlement:` to
  `product:relay-<line>` (`format.ts` field, no schema change). Foundation/core packs (e.g. a
  free `relay-crm-core` once `pack-dependson-foundation` exists) carry no entitlement.
- **Bundle price → parent line.** A bundle pack's price maps to its parent line entitlement
  (Marketing bundle = `product:relay-marketing`, one price). Render via the existing
  `packPrice()` normalizer; render sites never branch on the raw price shape.
- **All-access tier.** Define a wildcard/superset entitlement the all-access license grants.
  The current single license must **grandfather in** — it keeps unlocking every pack (D4
  never-re-lock; principle: no capability moves behind a paywall for an existing holder).
- **Verifier + gate.** The offline Ed25519 verifier already matches entitlement strings; confirm
  per-line + wildcard strings verify correctly. Update the 402 soft-gate install path so a pack
  gated on `product:relay-marketing` refuses install without that line but not with the
  all-access wildcard.
- **Price-drift gate.** Each line's price is one more canonical entry checked against
  `pricing.json` by `scripts/check-price-drift.mjs`. Needs Website coordination via `_RELAY.md`
  **before any price ships** (decisions_open: bundle pricing mechanics).
- **Recap surfaces.** The pack `changelog:` map feeds every recap surface (license status, 402
  refusal, /packs card, renewal email); ensure per-line packs each carry their `changelog:`
  line (the template test requires it).

**Operator decisions_open (surface at grooming, not silently defer):** bundle pricing mechanics
— per-line list/intro vs all-access anchor — is a genuine product+Website call
(`packs-evolution.md §10 Q3`). This spec must NOT ship a price without that decision made.

## Acceptance Criteria

- [ ] Each paid pack declares a per-line `product:relay-<line>` entitlement; foundation/core
      packs declare none (free).
- [ ] A buyer with `product:relay-marketing` unlocks the Marketing line and is soft-gated (402)
      out of other lines; the all-access wildcard unlocks everything.
- [ ] The existing single license grandfathers in — it still unlocks every pack (D4 never-re-lock),
      verified by test.
- [ ] The offline verifier matches per-line and wildcard entitlements correctly; no online
      re-validation introduced (anti-pattern fence).
- [ ] Each line's price is a canonical `pricing.json` entry passing `check-price-drift.mjs`, and
      the Website coordination happened via `_RELAY.md` before any price shipped.
- [ ] Every per-line pack carries its `changelog:` line so all recap surfaces render correctly.

## Scope Boundaries

**Included:**
- Migrating entitlement strings to `product:relay-*`; defining the all-access wildcard.
- Grandfathering the current single license; bundle-price→parent mapping.
- Price-drift + Website coordination for each line.

**Excluded:**
- Any entitlement *schema* change (the string is already the unit — zero schema change).
- Building foundation/core packs (`pack-dependson-foundation`) — this spec only marks them free
  if/when they exist.
- New billing/checkout infrastructure — reuses the shipped Ed25519 verifier + 402 soft-gate.
- Deciding bundle pricing mechanics unilaterally — that is an operator + Website call (open Q3).

## References

- Source: `_IDEAS/packs-evolution.md` §7 (per-line entitlements, free foundations, all-access),
  §8.4, §10 Q3 (bundle pricing — needs Website).
- Anchors: `src/lib/packs/format.ts` (entitlement = version/pack-id-agnostic unit),
  `scripts/check-price-drift.mjs`, `packPrice()` normalizer, the offline Ed25519 verifier +
  402 soft-gate install path.
- Constraints: `_SPECS/2026-07-01-200629_plg-refine.md` D4 (never re-lock) / D5 (capabilities stay free).
- Depends on: `pack-bundle-model`, `pack-agency-bundle` (a per-line price needs a shipped bundle
  line — the Agency bundle is the first, per the 2026-07-05 operator decision).
