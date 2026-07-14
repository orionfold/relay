---
title: Marketing Site Pricing & Landing Page Update
status: completed
priority: P1
milestone: plg-growth
source: plans/lucky-fluttering-flute.md
dependencies: [stripe-billing-integration]
---

# Marketing Site Pricing & Landing Page Update

> **Superseded by `community-edition-simplification` (2026-04-13).** This feature shipped but was later fully reverted when ainative pivoted to a 100% free Community Edition with no tiers, billing, or cloud dependency. Kept as historical record.

## Description

Updates the existing ainative.github.io marketing site (Astro 5 + React + Tailwind v4) to reflect the PLG monetization strategy. The site already has a `Pricing.astro` section with outdated tiers (Community Free / Pro $149 / Team $499 + Advisory Services). This feature rewrites Pricing.astro with the new 4-tier structure (Community / Solo / Operator / Scale), adds marketplace creator economics as a primary selling point, updates Hero copy to shift from "waitlist" to "live product + upgrade path," and replaces the Advisory Services block with a marketplace creator pitch.

The site lives at `legacy marketing repository` and deploys to orionfold.com/relay via GitHub Pages.

## User Story

As a potential ainative user visiting orionfold.com/relay, I want to see clear pricing tiers with specific value at each level — especially the marketplace earning potential — so I can understand why upgrading from free makes economic sense.

As an existing Community user, I want the pricing page to show me exactly what I gain at each tier, with emphasis on the marketplace creator opportunity at Operator, so I'm motivated by income potential rather than just feature unlocks.

## Technical Approach

### Site Architecture (existing)

```
ainative.github.io/
├── src/
│   ├── pages/index.astro           ← Main landing page (imports all sections)
│   ├── components/sections/
│   │   ├── Hero.astro              ← UPDATE: shift from waitlist to live product
│   │   ├── Pricing.astro           ← REWRITE: new 4-tier + marketplace pitch
│   │   ├── PersonaLanes.astro      ← UPDATE: align CTAs with new tiers
│   │   ├── CTAFooter.astro         ← UPDATE: shift from waitlist to install/upgrade
│   │   └── ... (others unchanged)
│   ├── components/ui/
│   │   ├── WaitlistForm.astro      ← KEEP: still used for email capture
│   │   └── SectionLabel.astro
│   └── styles/global.css
├── public/ (fonts, screenshots, logos)
└── astro.config.mjs
```

**Tech stack**: Astro 5, React 19, Tailwind v4, TypeScript, MDX
**Design**: OKLCH colors (primary hue ~250), Geist Sans/Mono fonts, dark-first with light mode
**Existing patterns**: SectionLabel component, WaitlistForm with source tracking, data-animate stagger

### 1. Pricing.astro — Full Rewrite

Replace the current 3-tier + Advisory block with:

**New tier data structure:**

```typescript
const tiers = [
  {
    name: 'Community',
    price: 'Free',
    period: 'forever',
    target: 'For getting started',
    features: [
      'Full local workspace — unlimited tasks & workflows',
      '21+ agent profiles, 5 AI runtimes',
      '50 agent memories per profile',
      '5 active heartbeat schedules',
      '30-day execution history',
      'Community support',
    ],
    cta: { type: 'command', text: 'npx ainative' },
  },
  {
    name: 'Solo',
    price: '$19',
    period: '/mo',
    annualPrice: '$15',
    annualPeriod: '/mo billed annually',
    target: 'For daily operators',
    features: [
      'Everything in Community',
      'Unlimited agent memory — agents never forget',
      'Unlimited schedules & context history',
      '90-day execution history',
      'Marketplace: buy blueprints',
    ],
    cta: { type: 'stripe', text: 'Get Solo', priceId: 'price_solo_monthly' },
  },
  {
    name: 'Operator',
    price: '$49',
    period: '/mo',
    annualPrice: '$39',
    annualPeriod: '/mo billed annually',
    target: 'For creators & power users',
    highlight: true,
    badge: 'Most Popular',
    features: [
      'Everything in Solo',
      'Cloud sync — encrypted backup across devices',
      'Outcome analytics dashboard + ROI calculator',
      'Marketplace: sell blueprints (earn 70%)',
      'Creator analytics — track your revenue',
      '10 concurrent workflows',
    ],
    cta: { type: 'stripe', text: 'Get Operator', priceId: 'price_operator_monthly' },
  },
  {
    name: 'Scale',
    price: '$99',
    period: '/mo',
    annualPrice: '$79',
    annualPeriod: '/mo billed annually',
    target: 'For marketplace earners',
    features: [
      'Everything in Operator',
      'Marketplace: earn 80% (vs 70%)',
      'Featured blueprint listings',
      'Unlimited concurrent workflows',
      'Priority support',
    ],
    cta: { type: 'stripe', text: 'Get Scale', priceId: 'price_scale_monthly' },
  },
];
```

**Monthly/Annual toggle:**
- Client-side `<script>` toggles between `price`/`annualPrice` on all cards
- Annual toggle shows "Save ~20%" pill badge
- Toggle uses existing site styling (font-mono, border-primary, etc.)
- Default: monthly (lower initial sticker shock)

**Stripe CTA buttons:**
- `type: 'stripe'` buttons link to Stripe Payment Links (static URLs, no API call needed)
- Payment Links collect email (required) — this is the identity anchor for license matching
- After payment, Stripe redirects to `https://orionfold.com/relay/confirmed?session_id={ID}`
- The existing `/confirmed` page is updated to show: "Install `npx ainative` and sign in with {email} to activate"
- Community tier keeps `npx ainative` command block (existing pattern)

**Dual-entry flow (how marketing site payment connects to the product):**
```
orionfold.com/relay → user clicks "Get Operator" → Stripe Payment Link
  → pays with email → Stripe webhook → Supabase license row created
  → redirect to /confirmed → "Install npx ainative, sign in with {email}"
  → user installs → signs in with same email → license auto-activates
```

**Replace Advisory block with Marketplace Creator Pitch:**

```typescript
// Replace advisoryServices with marketplace pitch
const marketplacePitch = {
  headline: 'Build Workflows. Earn Revenue.',
  subheading: 'Your best automations are worth money. Publish to the marketplace and let your subscription pay for itself.',
  stats: [
    { value: '70%', label: 'Creator revenue share (80% on Scale)' },
    { value: '$5-25', label: 'Per blueprint, you set the price' },
    { value: '0', label: 'Platform fees beyond your subscription' },
  ],
  example: {
    text: 'A creator with 3 blueprints at $5 each, selling 20 copies per quarter:',
    math: '$300 gross × 70% = $210 earned — your $147/quarter Operator subscription is free.',
  },
  cta: { text: 'Start Creating', href: '#pricing' },
};
```

This replaces the Advisory Services dark-themed block with a marketplace-focused block using the same visual pattern (dark bg, inverted text). The math example makes the self-funding economics concrete.

### 2. Hero.astro — Copy Refresh

Current state: "Get early access to Pro features, advisory services" with waitlist form.

**Changes:**
- **Keep** the email capture form (still valuable for pre-launch list)
- **Change** label from "Get early access to Pro features, advisory services" to "Get the weekly State of AI Agents report"
- **Change** button from "Get Early Access" to "Subscribe" (framing as value delivery, not waitlist)
- **Keep** the `npx ainative` terminal block and all other Hero elements unchanged
- **Keep** value pills (Local-First, Multi-Model AI, Human-in-the-Loop)

Minimal change — just the email capture framing shifts from "waitlist" to "ongoing value."

### 3. PersonaLanes.astro — CTA Alignment

Current: All three personas link to `#pricing` with "Try Community Edition" or "Book a Conversation."

**Changes:**
- Solo Founder CTA: keep "Try Community Edition" → `#pricing` (correct)
- Agency Owner CTA: change to "Start with Operator" → `#pricing` (they need marketplace selling)
- PE Operating Partner: change from "Book a Conversation" → `#advisory` to "Start with Scale" → `#pricing` (remove advisory dependency; PE partners are Scale tier targets)

### 4. CTAFooter.astro — Shift from Waitlist to Install

Current: "Ready to build an AI-native business?" with waitlist form.

**Changes:**
- **Keep** headline: "Ready to build an AI-native business?"
- **Add** a secondary line: "Free forever. Upgrade when your agents outgrow the limits."
- **Keep** the email form (reframe: "Get the State of AI Agents report")
- **Keep** the terminal `npx ainative` block
- **Add** links: "View Pricing" → `#pricing`, "Read the Docs" → `/docs`

### 5. Optional: Dedicated `/pricing` Page

Create `src/pages/pricing.astro` that renders the Pricing section as a standalone page for direct linking from README, upgrade banners, and external references. This page imports and renders the same `Pricing.astro` component within the site Layout.

```astro
---
import Layout from '../layouts/Layout.astro';
import Pricing from '../components/sections/Pricing.astro';
---
<Layout title="Pricing — ainative" description="Compare ainative pricing tiers">
  <main>
    <Pricing />
  </main>
</Layout>
```

### 6. FAQ Section (new, within Pricing.astro)

Add an FAQ accordion below the marketplace pitch block:

```typescript
const faqs = [
  {
    q: 'Is the Community edition really free forever?',
    a: 'Yes. Everything you see today stays free. Apache 2.0 open source. We never take features away.',
  },
  {
    q: 'What happens when I hit a soft limit?',
    a: 'Your agent memory fills up (50 items), and new learning overwrites old learning. Upgrade to Solo and your agents keep everything.',
  },
  {
    q: 'Can I switch or cancel anytime?',
    a: 'Yes. Pro-rated via Stripe. Cancel and you keep Community access with all your data.',
  },
  {
    q: 'Is my data sent to the cloud?',
    a: 'Only if you opt into Cloud Sync (Operator+). Your local database is always yours. Sync is AES-256 encrypted — we never see your data.',
  },
  {
    q: 'Can the marketplace really pay for my subscription?',
    a: 'Math check: 3 blueprints at $5 each, 20 sales per quarter = $210 earned at 70% split. Your Operator subscription costs $147/quarter. Net positive.',
  },
  {
    q: 'What AI providers can I use?',
    a: 'Claude, GPT, Codex, direct APIs, and Ollama (local, $0). You bring your own API keys — ainative never intermediates.',
  },
];
```

Render as collapsible `<details>/<summary>` elements (native HTML, no JS needed) styled with the site's existing classes.

## Acceptance Criteria

- [ ] Pricing.astro renders 4 tiers: Community (Free), Solo ($19), Operator ($49), Scale ($99)
- [ ] Monthly/annual toggle updates all price displays via client-side JS
- [ ] Annual prices show "Save ~20%" badge
- [ ] Community tier shows `npx ainative` command block (existing pattern preserved)
- [ ] Solo/Operator/Scale tiers link to Stripe Payment Links
- [ ] Operator tier highlighted with `border-primary/40 bg-primary/[0.03]` and "Most Popular" badge
- [ ] Marketplace creator pitch block replaces Advisory Services block
- [ ] Creator pitch includes concrete revenue math example
- [ ] FAQ section with 6 collapsible items renders below marketplace pitch
- [ ] `/pricing` standalone page exists and renders Pricing component
- [ ] Hero email form label updated to "State of AI Agents report" framing
- [ ] PersonaLanes CTAs aligned with new tier names
- [ ] CTAFooter includes "View Pricing" link
- [ ] All existing animations (`data-animate`, `data-animate-stagger`) preserved
- [ ] Site builds with `npm run build` and deploys to GitHub Pages without errors
- [ ] Responsive: 4-column → 2-column → 1-column grid on mobile

## Scope Boundaries

**Included:**
- Pricing.astro rewrite with 4 tiers, toggle, Stripe links, marketplace pitch, FAQ
- Hero.astro copy refresh (email form reframing)
- PersonaLanes.astro CTA alignment
- CTAFooter.astro copy refresh
- `/pricing` standalone page
- README.md Community vs Premium comparison table

**Excluded:**
- Full landing page redesign (only pricing-adjacent sections updated)
- New screenshots or product demos
- Blog/content marketing pages
- A/B testing infrastructure
- Multi-currency / localization
- Advisory services booking flow (removed, replaced with marketplace pitch)
- Changes to docs/, book/, research/ pages (unchanged)

## References

- Depends on: [`stripe-billing-integration`](stripe-billing-integration.md) — provides Stripe price IDs for payment links
- Related: [`edition-readme-update`](edition-readme-update.md) — README positioning
- Related: [`marketplace-access-gate`](marketplace-access-gate.md) — marketplace creator economics
- Related: [`upgrade-cta-banners`](upgrade-cta-banners.md) — in-app banners link to /pricing
- Marketing site repo: `legacy marketing repository`
- Existing Pricing component: `src/components/sections/Pricing.astro`
- Existing Hero: `src/components/sections/Hero.astro`
- Existing PersonaLanes: `src/components/sections/PersonaLanes.astro`
- Existing CTAFooter: `src/components/sections/CTAFooter.astro`
- Site tech: Astro 5, React 19, Tailwind v4, TypeScript, OKLCH design tokens
- Supabase waitlist endpoint: `https://ainative.supabase.co/functions/v1/waitlist-signup`
