---
title: G-010 Implementation Plan
status: completed
specification: features/app-budget-policies.md
---

# G-010 Implementation Plan

## Scope challenge

**REDUCE to the current goal outcome.** Reuse metered-cost attribution,
task-level `maxBudgetUsd`, global guardrails, notifications, schedule claims,
and Pack schedule identity. Do not rebuild the obsolete `AppBundle` bootstrap
layer or add token caps, charts, external alerts, or bundled example policy.

## What already exists

- `usage_ledger.schedule_id`, integer `cost_micros`, completeness metadata, and
  schedule-aware write paths.
- Overall/runtime daily and monthly status, warning, blocking, and notification
  patterns in `settings/budget-guardrails.ts`.
- `tasks.max_budget_usd` and provider/runtime run-loop enforcement.
- Atomic schedule due claims, bounded concurrency slots, expiring task leases,
  and queued-run draining.
- Composite `app:<appId>:<scheduleId>` identity plus Pack install/export
  schedule-reference rewriting.
- App detail, schedule cards/detail sheets, semantic badges, forms, and toasts.

## Implementation slices

1. **Contract and persistence** — add manifest recommendation schema and
   cross-reference validation; add effective-policy schema/bootstrap/migration;
   update Clear Data and app-delete cleanup.
2. **Policy service and API** — normalize USD→microdollars, CRUD effective
   policies, derive app ownership, compute status/measurement completeness,
   expose app and schedule endpoints.
3. **Runtime enforcement** — atomically claim all matching policies, evaluate
   pre-run totals, defer busy claims, propagate strictest per-run cap, reconcile
   direct tasks and app workflows, pause/notify/deduplicate, release stale/live
   claims on every terminal path.
4. **Attribution and portability** — carry schedule id through blueprint
   workflow definition into child tasks; round-trip recommendation schedule
   references through Pack install/export.
5. **UI** — shared policy editor/status, app recommendation/effective panel,
   schedule list badge and detail configuration, responsive/error/empty states.
6. **Verification and closure** — targeted suites, static checks, real fixture,
   runtime-registry smoke, browser evidence, spec/roadmap/changelog/goal audit.

## Specification and acceptance mapping

- Contract/round-trip ACs 1–2 → slice 1 + Pack regression tests.
- Persistence/API ACs 3–5 → slices 1–2 + schema/API tests.
- Enforcement/attribution ACs 6–12 → slices 3–4 + policy/scheduler/workflow tests.
- UI AC 13 → slice 5 + component/API/browser checks.
- Lifecycle AC 14 → slices 1–2 + Clear Data/delete tests.
- Verification ACs 15–16 → slice 6.

## NOT in scope

- Token ceilings: existing turn limits are the bounded-execution primitive.
- Exact mid-request cancellation: provider cost often arrives after completion.
- Non-schedule policy scopes: they do not serve G-010 fault isolation.
- External alert channels and analytics: notification Inbox plus current status
  is the smallest trustworthy loop.
- Default recommendations in bundled Packs: mechanism ships first; product
  policy values require independent domain evidence.

## Regression test budget

- `src/lib/apps/__tests__/budget-policy-schema.test.ts`: valid app/schedule,
  missing/negative limit, missing/extra schedule ref, invalid cross-reference.
- Pack install/export tests: logical↔composite schedule round-trip.
- `src/lib/schedules/__tests__/budget-policies.test.ts`: CRUD, status windows,
  app/schedule matching, strictest run cap, pause, notify/dedup, unavailable
  cost, atomic collision, stale claim recovery, cleanup.
- Scheduler tests: blocked firing does not create/increment; busy app claim
  defers second schedule; direct completion reconciles and releases.
- Workflow/dispatcher tests: `_scheduleId` reaches child task and completion
  finalizer.
- API tests: validation, 404, GET/POST/DELETE, recommendation acceptance.
- Component tests: recommendation versus configured grammar, status text,
  save/remove failures, keyboard-accessible controls.
- Commands: targeted Vitest files, impacted schedule/app/usage suites,
  `npx tsc --noEmit`, token validator, then risk-based broader Vitest.
- Runtime smoke: start isolated `npm run dev` on port 3010, install/seed a tiny
  app schedule, accept a $0.000001 policy, execute a real scheduled workflow,
  confirm schedule attribution, pause + notification, and no runtime-registry
  `ReferenceError`/missing-tools error. Record task/workflow/runtime evidence in
  the specification.
- Browser: in-app Browser on the isolated instance; app and schedule surfaces
  at desktop/390px, light/dark, recommendation acceptance, edit/remove, warning,
  exceeded, measurement-unavailable, and error states. Save under `output/`.

## Error & Rescue Registry

| Failure mode | Visible behavior | Rescue |
|---|---|---|
| Invalid Pack recommendation | Pack validation fails with policy id/path | Correct manifest; no partial install |
| Policy write fails | API returns named 500; editor retains input | Retry after DB diagnosis |
| Usage cost unavailable | Status says unavailable; configured action runs | Configure metered runtime or remove policy |
| Shared policy already claimed | Later schedule is deferred, not fired | Expiry/release allows next tick |
| Process dies with claim | Claim expires after bounded lease | Next pre-run reaps stale claim |
| Notification write fails | Scheduler logs named error after enforcing pause | Repair DB; schedule remains safely paused |
| Workflow dispatch fails after claim | Failure notification; claim released | Existing retry/auto-pause path |
| Module-load cycle via chat-tools import | First real task crashes with adapter TDZ | Keep dynamic imports; remove static edge; rerun smoke |
| Browser/API contract drift | UI shows named fetch/save error | Repair typed response and rerun component/browser checks |

## Rescue and rollback

- The new policy table is additive. Disabling/removing policies restores prior
  scheduling behavior without deleting usage history.
- Manifest recommendations are optional and non-enforcing, preserving old
  Packs and manifests.
- If workflow attribution destabilizes runtime loading, revert only the
  `_scheduleId` propagation slice; direct schedule enforcement remains isolated.
- After two materially different failures on the same blocker, stop with the
  failing command, relevant logs, touched files, and safest remaining option.

## Completion

All six slices completed on 2026-07-14. The implementation stayed within the
reduced scope; no token ceilings, marketplace/AppBundle compatibility layer,
external alerts, analytics charts, or bundled default recommendation values
were added. See the specification verification run for executable evidence.
