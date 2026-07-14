# Marketing Site Pricing Page — Implementation Reference

This file documents what needs to be implemented in the external `ainative.github.io` repository.
The main ainative codebase provides the constants; this page consumes them.

## Pricing Tiers

| Tier | Monthly | Annual | Stripe Payment Link |
|------|---------|--------|---------------------|
| Community | Free | Free | N/A |
| Solo | $19 | $190 ($15.83/mo) | `https://orionfold.com/relay/checkout/SOLO_LINK` |
| Operator | $49 | $490 ($40.83/mo) | `https://orionfold.com/relay/checkout/OPERATOR_LINK` |
| Scale | $99 | $990 ($82.50/mo) | `https://orionfold.com/relay/checkout/SCALE_LINK` |

## Files to Modify in ainative.github.io

1. **`src/components/sections/Pricing.astro`** — Full rewrite with 4-tier cards, monthly/annual toggle
2. **`src/components/sections/Hero.astro`** — Reframe email form as "State of AI Agents report"
3. **`src/components/sections/PersonaLanes.astro`** — CTA alignment (Agency Owner → Operator, PE → Scale)
4. **`src/components/sections/CTAFooter.astro`** — Add "View Pricing" link
5. **New `src/pages/pricing.astro`** — Standalone pricing page importing Pricing component

## Design Notes

- Operator tier highlighted with "Most Popular" badge
- Community tier shows `npx ainative` command block
- Annual toggle shows "Save ~20%" label
- Marketplace creator pitch replaces Advisory Services section
- FAQ accordion below marketplace pitch (6 items)

## Payment Link URLs

Replace placeholder URLs with actual Stripe Payment Link URLs after creating them in the Stripe dashboard. Each link collects email (required) as the identity anchor.
