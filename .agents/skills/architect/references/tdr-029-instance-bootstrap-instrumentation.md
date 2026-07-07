---
id: TDR-029
title: Instance bootstrap runs from instrumentation.ts with layered dev-mode gates
status: accepted
date: 2026-04-07
category: infrastructure
---

# TDR-029: Instance bootstrap runs from instrumentation.ts with layered dev-mode gates

## Context

ainative is distributed as a git-cloneable repo that every end user is expected to customize via ainative chat itself. This means the same codebase must behave differently in two environments:

1. **End-user clones** — need a `local` branch auto-created for their customizations, a pre-push hook installed (with consent) to block accidental origin pushes, and machinery to pull upstream updates safely
2. **The canonical dev repo** — contributors push feature branches to main constantly, merge PRs, run visual E2E tests. If the instance bootstrap ran here, it would install a pre-push hook that blocks all `git push` operations, silently breaking contributor workflow on first `npm run dev` after the feature shipped

The first instinct during design was "just put the bootstrap behind a single `STAGENT_DEV_MODE=true` env var check." But that is fragile: env vars can be accidentally deleted during `.env.local` edits, copied across machines, or lost when a new contributor clones the repo. A single point of failure is not acceptable for a feature that breaks the contributor push workflow on failure.

The second instinct was "put everything behind a first-run wizard that asks for consent before any destructive op." That's more robust, but delaying even the *non-destructive* bits (instanceId generation, `local` branch creation) until after a UI prompt means the feature is useless on CLI-only or headless clones.

## Decision

Instance bootstrap lives in `src/lib/instance/bootstrap.ts` exporting an idempotent `ensureInstance()` function, called from `src/instrumentation.ts` alongside other startup services (license manager, scheduler, channel poller, auto-backup) inside the same `try/catch` block. Execution order inside `register()` matters: `ensureInstance()` runs **before** the scheduler so that instance config is available to any scheduled task that depends on it.

The function is gated by **three layers** that together prevent damage to the canonical dev repo:

1. **Primary gate:** `STAGENT_DEV_MODE=true` environment variable, read from `.env.local`. Per-developer, per-machine.
2. **Secondary gate:** `.git/ainative-dev-mode` sentinel file, a zero-byte marker inside the `.git` directory. `.git/` is never cloned, never committed, never synced. Survives `.env.local` edits and contributor onboarding onto fresh clones — once a contributor runs `touch .git/ainative-dev-mode` they are permanently protected until they explicitly remove it.
3. **Tertiary gate:** **Two-phase execution with explicit consent for destructive operations.**
   - **Phase A** (instanceId generation, `local` branch creation, consent state stamping) runs on every first boot without user consent because every action is non-destructive: `git checkout -b local` does not modify any existing branch, and writing settings rows is reversible via `Clear All Data` or direct SQL.
   - **Phase B** (pre-push hook installation, `branch.X.pushRemote=no_push` git config, writing guardrail state back to settings) runs only when `settings.instance.guardrails.consentStatus === 'enabled'`. First-boot default is `'not_yet'`; the user must explicitly opt in via the upgrade-session Settings → Instance UI.

**Override for feature testing:** `STAGENT_INSTANCE_MODE=true` wins over both dev-mode gates, so contributors can test the instance-bootstrap / upgrade-detection / upgrade-session features in the canonical dev repo without removing their safety gates.

The canonical dev repo sets `STAGENT_DEV_MODE=true` in its `.env.local` and has a `.git/ainative-dev-mode` sentinel file. Both gates are documented in `AGENTS.md` → "Instance Bootstrap Dev-Mode Gate" and `CLAUDE.md` as "do not remove" under any circumstance.

## Consequences

- **Four independent safety mechanisms** must all fail before the canonical dev repo takes damage: env var gate + sentinel gate + `STAGENT_INSTANCE_MODE` not set + user explicitly clicks "Enable guardrails" in the consent UI. In practice, the probability of all four aligning simultaneously on the dev repo is negligible.
- **Non-destructive operations run freely on every clone**, giving the upgrade-session feature a stable `instanceId` and `local` branch to target without requiring the user to click anything.
- **Consent is a *data* fact, not a *transient notification* fact.** `settings.instance.guardrails.consentStatus` is a durable property of the clone. `upgrade-session` renders the prompt UI when it ships; until then, users can manually enable guardrails via a SQL update if they want the pre-push protection early.
- **`Clear All Data` is compatible with the consent state** because the `settings` table is intentionally preserved by `clearAllData()` per the recent fix. A user who clears operational data keeps their instanceId, branch name, and consent decision.
- **No chat-based tooling leaks into bootstrap.** This is a hard startup routine, not a conversation. Boot order, failure tolerance, and dev-mode gates would be fragile if orchestrated through an agent.
- **Adding a new dev-mode gate is a 1-line change** in `src/lib/instance/detect.ts` because all gates funnel through `isDevMode()`.
- **Manual verification is straightforward:** grep the boot log for `[instance] bootstrap skipped: dev_mode_env` (or `dev_mode_sentinel`) and confirm zero side effects on branches, hooks, and settings.

## Alternatives Considered

- **Single env var, no sentinel, no consent.** Rejected as too fragile — a single accidentally-deleted env var breaks contributor workflow catastrophically.
- **Consent required for all operations.** Rejected because non-destructive state (instanceId, local branch) is genuinely safe and the upgrade-session feature needs this data to exist before its UI can render.
- **Bootstrap in a separate CLI command users must run manually** (e.g., `npx ainative init`). Rejected because the whole point of the self-modifying dev environment model is that users shouldn't have to run setup scripts — first `npm run dev` should "just work" with safe defaults.
- **Bootstrap in a Next.js middleware or API route.** Rejected because middleware runs on every request (wrong) and API routes run on demand (would delay instance setup until first page load, missing the scheduler-startup ordering requirement).
- **Sentinel file at the repo root instead of `.git/`.** Rejected because repo-root files get committed and propagate to clones — inverting the intended direction (the gate should stop the dev repo but not affect user clones).

## References

- `src/lib/instance/bootstrap.ts` — `ensureInstance()` orchestrator
- `src/lib/instance/detect.ts` — `isDevMode()` with env var + sentinel file checks
- `src/instrumentation.ts` — call site, inside `register()`'s existing `try/catch`
- `.env.local` (dev repo) — contains `STAGENT_DEV_MODE=true`
- `.git/ainative-dev-mode` (dev repo) — zero-byte sentinel
- `AGENTS.md` → "Instance Bootstrap Dev-Mode Gate" section
- `CLAUDE.md` — short pointer to AGENTS.md section
- `memory/instance-bootstrap-dev-gate.md` — cross-session project memory
- `features/instance-bootstrap.md` — full feature spec
- TDR-009 — idempotent database bootstrap (the pattern this TDR follows for startup routines)
