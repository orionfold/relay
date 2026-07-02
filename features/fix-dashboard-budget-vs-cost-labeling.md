---
title: Fix dashboard KPI strip — budget mislabeled as cost
status: completed
priority: P1
milestone: mvp
source: _IDEAS/backlog.md
dependencies: []
---

# Fix dashboard KPI strip — budget mislabeled as cost

## Description

On a fresh instance with zero usage, the dashboard KPI strip shows **"COST TO DATE $20.00 · monthly"**
and **"COST TODAY $0.6452"** — but these are NOT spend. The "$20.00" is the **default monthly budget
cap** ("$20.00 of Unlimited"; the `/costs` MONTH tile confirms it's "Budget basis for the current
month"), and "$0.6452" is a derived daily-budget figure. Real metered spend (sum of `usage_ledger`
cost) on a fresh instance is ~$0.00. So the first thing a new ICP sees directly contradicts the
product's "know what you spend" promise — it reads as "you've already spent $20" before doing anything.

The per-customer rollup path is honest ($0.00 correctly) — this bug is **isolated to the global KPI
strip's metrics source**, which is a shell element, so the fake numbers follow the user onto every
screen. There's also a related conflation: the "$20.00 / Plan priced" figure reflects a flat Claude
Pro/Max subscription, not metered API usage — an agency proving per-client margin needs these
distinguished.

## User Story

As a new user, I want the dashboard to show my actual metered spend (and label budget as budget), so
that the first number I see is trustworthy and matches "know what you spend."

## Technical Approach

- **Relabel the strip tiles:** distinguish **Budget** (the cap) from **Spend** (actual metered usage).
  The COST tiles should render `SUM(usage_ledger.cost)` for the period, not the budget cap.
- **Fix the empty-state:** with 0 `usage_ledger` rows, COST tiles show $0.00, not the budget-derived
  figures. Find the KPI-strip metrics source (dashboard shell / `/` metrics endpoint) and the `/costs`
  budget vs spend computation; ensure the strip pulls the spend aggregate.
- **Distinguish plan-priced vs API-priced spend** where a subscription runtime (Claude Pro/Max) is in
  play — a flat subscription is not per-run metered cost.
- **Also (polish, can bundle):** the pre-hydration flash where the strip briefly shows
  `RUNTIME: not configured` / `—` before `GET /api/settings/chat` + metrics resolve — SSR the values
  or show a skeleton, not a transient misleading state.

## Acceptance Criteria

- [x] On a fresh instance (0 usage_ledger rows), the strip's COST tiles show $0.00, not $20.00/$0.6452.
- [x] Budget cap is labeled as **Budget**; actual spend is labeled as **Spend/Cost** and equals the
      `usage_ledger` sum for the period.
- [x] Plan-priced subscription spend is visually distinguished from metered API spend.
- [x] No transient "not configured"/"—" flash on first `/` paint (skeleton or SSR).

## Scope Boundaries

**Included:**
- Relabel/repoint the dashboard KPI strip to real metered spend vs budget; fix the empty-state + flash.

**Excluded:**
- The per-customer/per-project cost table on `/costs` (opportunity — separate).
- Chat-metering diagnosis (`fix-chat-spend-metering-diagnose`) — separate; this unit assumes the
  ledger sum is the source of truth for spend.

## Verification run — 2026-07-02

Root cause (sharper than spec'd): `getUsageAggregates` (budget-guardrails.ts) REPLACES
claude-code's metered cost with the flat plan price under subscription billing — $20/mo Pro
→ monthly $20.00, daily 20/31 = $0.6452, the exact field numbers. That substitution is
correct for guardrail budgeting and unchanged; the fix is additive: the snapshot now also
exposes `meteredSpend` (pure ledger sums) + `planPricedMonthlyMicros`, and the telemetry
rail reads those. Rail tiles relabeled SPEND TODAY ("metered") / SPEND TO DATE (sub names
the plan "+ plan $20.00/mo", or "of $X budget" under usage billing). Loading state no
longer fabricates "not configured" in the Runtime sub-line.

**Verified live** (dev server, fresh scratch DB): fresh instance rail shows $0.00/$0.00
(previously $0.6452/$20.00); after real runs it showed $0.0001 = the exact ledger sum
(93µ). Screenshot `output/fix-dashboard-spend-rail-verify.png`. Unit:
`budget-guardrails.test.ts` (+2), `telemetry-rail.test.tsx` (3).

## References

- Source: `_IDEAS/backlog.md` — J0/J6 blocker #6 + the pre-hydration-flash polish entry.
- Related features: `cost-and-usage-dashboard.md`, `homepage-dashboard.md`, `spend-budget-guardrails.md`,
  `usage-metering-ledger.md`.
