---
title: App and Schedule Budget Policies
status: completed
priority: P1
milestone: mvp
source: _IDEAS/backlog.md G-010; _IDEAS/reprioritze.md Gap #6
dependencies: [usage-metering-ledger, spend-budget-guardrails, scheduled-prompt-loops, app-runtime-bundle-foundation]
---

# App and Schedule Budget Policies

## Description

Relay already records metered usage by task, workflow, project, customer, and
schedule, and it can stop all work when an overall or runtime spend cap is
reached. That global stop does not isolate one unattended operation: a faulty
Pack schedule can consume most of the shared allowance before the rest of the
workspace is protected.

G-010 adds operator-owned effective cost policies at app and schedule scope.
Packs may declare recommendations in `AppManifest`, but recommendations do not
enforce anything until the operator accepts or edits them. Accepted policies
apply per-run, daily, and monthly metered-cost ceilings with an explicit
`pause` or `notify` action. A pause affects only the schedule attempting the
run; it never disables a runtime or unrelated app.

This specification supersedes the 2026-04-11 `AppBundle`/marketplace design.
It uses the current Pack/AppManifest, SQLite schedule, task-level run cap,
usage-ledger, notification, and global-budget architecture.

## Decisions and Invariants

- Pack-authored policies are recommendations, not effective defaults.
- The operator owns every effective policy and can accept, edit, disable, or
  remove it locally.
- `pause` is the recommended/default action. `notify` remains available for
  operators who want visibility without automatic suspension.
- App policies aggregate only schedules owned by that app. Schedule policies
  aggregate only the named schedule. When both match, the stricter remaining
  ceiling wins and both policies are evaluated.
- Per-run cost limits are copied onto direct schedule tasks so supported
  runtimes can stop during execution. Post-run reconciliation remains required
  for provider overshoot and multi-step app workflows.
- A hard-policy cost that cannot be measured is not reported as safe. `pause`
  policies pause the affected schedule; `notify` policies emit a named
  indeterminate-cost notification.
- Concurrent runs sharing a policy are serialized through an expiring atomic
  policy claim. A busy claim defers the later schedule without consuming a
  firing or silently dropping it.
- Budget notifications are deduplicated by policy, limit/window, and reset
  period while preserving a durable evidence trail in `notifications`.
- Existing global/runtime guardrails continue to apply independently. G-010
  narrows fault isolation; it does not weaken the workspace stop-loss.

## Policy Contract

Pack manifests may declare:

```yaml
budgetPolicies:
  - id: app-operations-budget
    scope: app
    maxCostPerDayUsd: 2
    maxCostPerMonthUsd: 30
    onExceed: pause
  - id: daily-analysis-budget
    scope: schedule
    schedule: daily-analysis
    maxCostPerRunUsd: 0.5
    maxCostPerDayUsd: 1
    onExceed: pause
```

Rules:

- `id` is a stable kebab-case recommendation identifier.
- `scope` is `app` or `schedule`; schedule scope requires a valid manifest
  schedule reference and app scope forbids one.
- At least one positive cost limit is required.
- USD values are converted to integer microdollars before persistence.
- The Pack installer/exporter rewrites schedule references between portable
  logical ids and installed composite ids exactly as it does view bindings.

The effective local policy stores one row per app and one per schedule. It
records limits, action, enabled state, optional recommendation lineage,
notification-dedup state, and an expiring active-run claim. Removing an app or
schedule removes its effective policies without touching usage history.

## User-visible States

- **No policy** — no accepted ceiling; show Configure. A Pack recommendation,
  when present, is visibly labeled Recommended and can be accepted.
- **Within budget** — effective policy, measured usage below 80%.
- **Approaching limit** — effective policy at or above 80% of its nearest
  daily/monthly limit; show measured and limit values.
- **Limit reached** — a ceiling is reached or exceeded. The UI names whether
  the schedule was paused or only notified.
- **Measurement unavailable** — matching usage lacks a trustworthy cost. The
  UI never substitutes `$0` or claims the policy is healthy.
- **Policy busy** — another run owns the expiring claim. The schedule is
  deferred and remains active; this transient state is logged, not presented
  as a budget breach.
- **Failure** — invalid policy, persistence failure, notification failure, or
  reconciliation failure produces a named response/log; it is never swallowed.

All controls use Relay semantic tokens, visible focus, keyboard operation, and
the system cursor. Status meaning is present in text, not color alone.

## Acceptance Criteria

- [x] `AppManifestSchema` validates app/schedule recommendations, rejects
      missing limits and invalid schedule cross-references, and exposes typed
      policy data to Pack install/export.
- [x] Pack install and export round-trip logical schedule references in budget
      recommendations.
- [x] SQLite/bootstrap/migration define effective policies with one app row or
      one schedule row, integer microdollar limits, recommendation lineage,
      notification state, and an expiring atomic claim.
- [x] API reads and mutates app and schedule policies with Zod boundary
      validation, not-found handling, and named persistence errors.
- [x] Pack recommendations remain non-enforcing until explicitly accepted.
- [x] Pre-run enforcement evaluates matching app and schedule daily/monthly
      totals before a scheduled or manual firing starts.
- [x] Direct schedule tasks receive the strictest matching per-run ceiling;
      post-run reconciliation catches overshoot.
- [x] App-scheduled workflow tasks retain `scheduleId` attribution and their
      completed workflow triggers post-run reconciliation.
- [x] `pause` pauses only the affected schedule, clears its next fire, and
      creates a `budget_alert` notification with policy and usage evidence.
- [x] `notify` creates a deduplicated `budget_alert` but permits execution.
- [x] Missing/untrustworthy cost follows the configured action and is visible
      as measurement unavailable rather than healthy `$0` usage.
- [x] Two schedules sharing an app policy cannot concurrently pass the same
      policy claim; the later firing is deferred without incrementing its
      firing count.
- [x] App detail exposes recommendations/effective app and schedule policies;
      schedule cards/detail expose effective status and configuration.
- [x] Deleting an app or schedule cleans effective policy state; Clear Data
      removes policy rows in foreign-key-safe order.
- [x] Regression tests, TypeScript, token validation, a real scheduled fixture
      crossing a small cap, and light/dark responsive browser checks pass.
- [x] A real runtime-registry smoke confirms the workflow attribution change
      introduces no module-load cycle.

## Scope Boundaries

### Included

- Metered USD cost policies for app-owned and standalone schedules.
- Per-run, local-calendar daily, and local-calendar monthly ceilings.
- Operator accept/edit/disable/remove and `pause`/`notify` actions.
- Pack recommendation schema and install/export portability.
- Schedule-local notification, pause, status, and configuration UI.
- Concurrent-policy claim and stale-claim recovery.

### Not in scope

- Token-count ceilings; task turn limits remain the token-independent control.
- Live cancellation at the exact dollar boundary when a provider reports cost
  only after a request completes.
- Chat, ad-hoc workflow, project, customer, or per-client billing policies.
- Email/Slack alerts, historical charts, forecasts, multi-currency, purchases,
  or changing provider billing.
- Pack capabilities, licensing, or marketplace enforcement.

## References

- Goal: `_IDEAS/backlog.md` G-010
- Priority rationale: `_IDEAS/reprioritze.md` Gap #6
- Existing global guard: `src/lib/settings/budget-guardrails.ts`
- Existing ledger: `src/lib/usage/ledger.ts`
- Schedule lifecycle: `src/lib/schedules/scheduler.ts`
- Pack contract: `src/lib/apps/registry.ts`

## Verification run — 2026-07-14

- Targeted schema, policy, scheduler, workflow, Pack install/export, and
  app-schedule regressions pass. They cover empty/invalid policy rejection,
  app+schedule matching, strictest per-run propagation, concurrent and stale
  claims, daily pause isolation, notify-only continuation, notification
  deduplication, unavailable measurement, workflow child attribution, and
  logical/composite Pack schedule round-tripping.
- `npx tsc --noEmit`, `npm run validate:tokens`, and `git diff --check` pass.
- The broader suite reached 3,210 passing tests. Its remaining failures are
  pre-existing or environment-bound (strategy privacy text, legacy router and
  auth-schema expectations, Web Designer fixture count, localhost binding,
  and E2E reachability); the one G-010 stale app-schedule assertion it exposed
  was updated and rerun green.
- A real `npm run dev` execution created and started a no-cost delay workflow,
  reached the expected paused/delayed state through the actual Next.js runtime
  graph, and produced no runtime-registry initialization or console error.
- Live API/browser verification accepted, rendered, edited, and removed a
  temporary schedule policy, then deleted the temporary schedule. App and
  schedule policy surfaces passed desktop light/dark and 390px dark checks;
  the 390px sheet reported no document or policy-panel horizontal overflow.
  Evidence is under `output/g010/` (gitignored).
