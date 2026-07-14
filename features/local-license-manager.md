---
title: Local License Manager
status: completed
priority: P0
milestone: post-mvp
source: plans/lucky-fluttering-flute.md
dependencies: []
---

# Local License Manager

## Description

Adds a `license` table to local SQLite and builds `src/lib/license/manager.ts` — the single module all premium feature gates call. Stores activation state locally after first cloud validation, implements 7-day offline grace period, exposes `isPremium()`, `getTier()`, `isFeatureAllowed(feature)` helpers. Mirrors the `budget-guardrails.ts` enforcement pattern.

## User Story

As a ainative user, I want my license tier to be enforced locally with offline resilience so that premium features work reliably even without constant internet.

## Technical Approach

- Add `license` table to `src/lib/db/schema.ts`: id (text PK), supabaseUserId, tier (community/solo/operator/scale), status (active/inactive/grace), activatedAt, expiresAt, lastValidatedAt, gracePeriodExpiresAt, encryptedToken, createdAt, updatedAt
- Add bootstrap DDL in `src/lib/db/index.ts` (idempotent CREATE TABLE IF NOT EXISTS)
- Update `src/lib/data/clear.ts` with FK-safe delete
- Create `src/lib/license/manager.ts` — singleton class: initialize() at app boot (in instrumentation.ts), getTier() from in-memory cache (synchronous, zero-latency like getSettingSync), validate() daily against Supabase, activate(jwt), deactivate()
- Create `src/lib/license/tier-limits.ts` with TIER_LIMITS constants per tier (community: 50 memory, 10 context versions, 5 schedules, 3 parallel, 30-day history)
- Create `src/lib/license/features.ts` — LicenseFeature union type mapping features to minimum tiers
- Create `src/lib/license/notifications.ts` — createTierLimitNotification() and TierLimitExceededError (mirrors BudgetLimitExceededError)
- Wire licenseManager.initialize() into src/instrumentation.ts alongside startScheduler()
- API routes: GET /api/license/status, POST /api/license/activate, DELETE /api/license

## Acceptance Criteria

- [ ] `license` table exists in schema.ts with correct column types following text PK convention (TDR-013)
- [ ] Bootstrap DDL in index.ts creates table idempotently
- [ ] `clear.ts` updated with license delete in FK-safe order
- [ ] LicenseManager.getTier() returns "community" for fresh installs
- [ ] LicenseManager.isPremium() returns false when no license row exists
- [ ] LicenseManager.isFeatureAllowed() correctly maps features to minimum tiers
- [ ] Offline grace period: cached tier persists for 7 days without network
- [ ] After grace period expires without validation, tier degrades to "community"
- [ ] Daily validation timer runs in instrumentation.ts
- [ ] GET /api/license/status returns current tier and feature flags
- [ ] POST /api/license/activate validates and stores license locally
- [ ] Network failures in validate() never throw — silently use cached state

## Scope Boundaries

**Included:**
- Local license table, manager class, tier constants, enforcement helpers, API routes

**Excluded:**
- Supabase cloud tables (supabase-cloud-backend), Stripe integration (stripe-billing-integration), any UI

## References

- Related features: [spend-budget-guardrails](spend-budget-guardrails.md), [usage-metering-ledger](usage-metering-ledger.md)
- Follow-on features: [supabase-cloud-backend](supabase-cloud-backend.md), [stripe-billing-integration](stripe-billing-integration.md)
