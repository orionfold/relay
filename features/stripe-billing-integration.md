---
title: Stripe Billing Integration
status: completed
priority: P0
milestone: post-mvp
source: plans/lucky-fluttering-flute.md
dependencies: [supabase-cloud-backend]
---

# Stripe Billing Integration

> **Superseded by `community-edition-simplification` (2026-04-13).** This feature shipped but was later fully reverted when ainative pivoted to a 100% free Community Edition with no tiers, billing, or cloud dependency. Kept as historical record.

## Description

Configures complete Stripe billing — 3 products × 2 prices (monthly + annual), Payment Links (for marketing site), Checkout Sessions (for in-app), Customer Portal, and wires both payment paths through a single Supabase webhook handler. Supports two acquisition entry points: (1) marketing site Stripe Payment Links for users who want to pay before installing, and (2) in-app Stripe Checkout for users who hit limits and upgrade organically. Both paths create the same license row in Supabase, keyed by email. Includes Resend email integration for license delivery and install instructions.

## User Story

As a visitor on orionfold.com/relay, I want to purchase a plan via Stripe Payment Link and then receive install instructions + automatic license activation when I run `npx ainative` and sign in with the same email.

As an existing ainative user, I want to upgrade from within the app via Stripe Checkout and have my premium features unlock immediately when I return.

## Technical Approach

### Two Entry Points, One Backend

```
Marketing site (orionfold.com/relay)              Product (/settings/subscription)
         │                                         │
    Stripe Payment Link                    Stripe Checkout Session
         │                                         │
         └─────────── Stripe webhook ──────────────┘
                          │
              Supabase Edge Function (stripe-webhook)
                          │
                  INSERT INTO licenses
                          │
              ┌───────────┴────────────┐
              │                        │
    Resend welcome email         Return URL redirect
    "Install npx ainative,       → /settings/subscription?success=true
     sign in with this email"   → auto-activate via LicenseManager
```

### Stripe Products & Prices

- 3 Products: Solo, Operator, Scale
- 6 Prices: monthly + annual for each ($19/$190, $49/$490, $99/$990)
- 3 Payment Links: one per product (monthly default, annual toggle on Stripe's hosted page) — used by marketing site
- Checkout Sessions: created via Supabase Edge Function — used by in-app upgrade flow

### Payment Links (Marketing Site Entry)

Stripe Payment Links are static URLs that can be embedded directly in Pricing.astro:
- `https://orionfold.com/relay/checkout/SOLO_LINK` — Solo monthly
- `https://orionfold.com/relay/checkout/OPERATOR_LINK` — Operator monthly
- `https://orionfold.com/relay/checkout/SCALE_LINK` — Scale monthly
- Each Payment Link collects email (required) — this is the identity anchor
- After payment, Stripe redirects to `https://orionfold.com/relay/confirmed?session_id={CHECKOUT_SESSION_ID}`
- The `/confirmed` page (already exists in site) shows: "Welcome! Install `npx ainative` and sign in with {email} to activate your subscription."

### Checkout Sessions (In-App Entry)

- Edge Function: `create-checkout-session` — accepts `{ tier, billingPeriod, returnUrl }`
- Creates Stripe Checkout Session with `customer_email` pre-filled from Supabase Auth
- `returnUrl`: `http://localhost:{PORT}/settings/subscription?success=true`
- `src/lib/cloud/billing.ts` — `createCheckoutSession(tier, billingPeriod)` calls Edge Function, returns checkout URL; `createPortalSession()` same pattern

### Webhook Handler (Shared)

The `stripe-webhook` Supabase Edge Function handles events from BOTH Payment Links and Checkout Sessions:
- `checkout.session.completed` → look up or create Supabase Auth user by email → INSERT license row
- `customer.subscription.updated` → update license tier/status
- `customer.subscription.deleted` → deactivate license
- `invoice.payment_failed` → set license status to `past_due`

### Email-Based Identity Matching

The key insight: Stripe captures email on both Payment Links and Checkout Sessions. The Supabase `licenses` table is keyed by `user_id` (Supabase Auth). The webhook handler:
1. Extracts `customer_email` from the Stripe event
2. Looks up Supabase Auth user by email (`supabase.auth.admin.listUsers({ email })`)
3. If user exists → creates license linked to that user
4. If user doesn't exist → creates Supabase Auth user (magic link, no password) → creates license
5. Sends welcome email via Resend with install instructions (if from Payment Link) or activation confirmation (if from Checkout Session)

When the user later runs `npx ainative` and signs in with Supabase Auth using the same email, `LicenseManager.validate()` finds their license row and activates automatically. No license key copy-paste needed.

### Email Module

`src/lib/cloud/email.ts` — thin Resend API wrappers called via Supabase Edge Functions:
- `sendWelcomeWithInstall(email, tier)` — for marketing site purchasers: "Install npx ainative, sign in with this email"
- `sendUpgradeConfirmation(email, tier)` — for in-app upgraders: "Your {tier} features are now active"
- `sendMemoryWarning(email, profileName, count, limit)` — memory cap approaching

### Stripe Customer Portal

- Configured for: plan changes, cancellation, payment method updates
- Accessed from in-app `/settings/subscription` via "Manage Subscription" button
- `createPortalSession()` → Edge Function → returns portal URL

## Acceptance Criteria

- [ ] 3 Stripe Products with 6 Price objects (monthly + annual for each tier)
- [ ] 3 Stripe Payment Links created (one per product) for marketing site
- [ ] Stripe Customer Portal configured with plan change and cancellation
- [ ] Webhook endpoint handles events from both Payment Links and Checkout Sessions
- [ ] `checkout.session.completed` creates license row linked to Supabase Auth user by email
- [ ] If no Supabase user exists for email, auto-creates one
- [ ] `subscription.deleted` deactivates license
- [ ] `invoice.payment_failed` sets license status to `past_due`
- [ ] `createCheckoutSession()` returns valid Stripe Checkout URL (for in-app flow)
- [ ] `createPortalSession()` returns valid Stripe Portal URL
- [ ] All Stripe API calls go through Edge Functions (no Stripe secret key in local app)
- [ ] Marketing site purchasers receive "Install + sign in" email via Resend
- [ ] In-app purchasers receive "Features activated" email via Resend
- [ ] User who pays on marketing site, then installs and signs in, auto-activates without entering a key

## Scope Boundaries

**Included:**
- Stripe products/prices/Payment Links, Customer Portal, webhook handler
- Dual-entry support (marketing site + in-app)
- Email-based identity matching via Supabase Auth
- billing.ts and email.ts modules
- Resend welcome/upgrade/install emails

**Excluded:**
- Subscription management UI (subscription-management-ui)
- Upgrade banners (upgrade-cta-banners)
- Stripe Connect for marketplace creator payouts (marketplace-access-gate)

## References

- Dependencies: [supabase-cloud-backend](supabase-cloud-backend.md)
- Related: [local-license-manager](local-license-manager.md)
- Related: [marketing-site-pricing-page](marketing-site-pricing-page.md) — embeds Payment Link URLs
- Follow-on: [subscription-management-ui](subscription-management-ui.md), [upgrade-cta-banners](upgrade-cta-banners.md)
- Marketing site confirmed page: `ainative.github.io/src/pages/confirmed.astro`

## Acceptance Criteria

- [ ] 3 Stripe Products with 6 Price objects (monthly + annual for each tier)
- [ ] Stripe Customer Portal configured with plan change and cancellation
- [ ] Webhook endpoint points to Supabase Edge Function URL
- [ ] subscription.created event creates license row and sends welcome email
- [ ] subscription.deleted event deactivates license
- [ ] invoice.payment_failed event sets license status to past_due
- [ ] createCheckoutSession() returns valid Stripe Checkout URL
- [ ] createPortalSession() returns valid Stripe Portal URL
- [ ] All Stripe API calls go through Edge Functions (no Stripe secret key in local app)
- [ ] Resend sends welcome/upgrade emails with correct license key

## Scope Boundaries

**Included:**
- Stripe products/prices, Customer Portal, webhook handler, billing module, email module

**Excluded:**
- Subscription management UI (subscription-management-ui), upgrade banners (upgrade-cta-banners)

## References

- Dependencies: [supabase-cloud-backend](supabase-cloud-backend.md)
- Related features: [local-license-manager](local-license-manager.md)
- Follow-on features: [subscription-management-ui](subscription-management-ui.md), [upgrade-cta-banners](upgrade-cta-banners.md)
