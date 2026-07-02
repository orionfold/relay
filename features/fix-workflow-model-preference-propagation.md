---
title: Propagate model preference to workflow/task execution
status: completed
priority: P1
milestone: mvp
source: _IDEAS/backlog.md
dependencies: []
---

# Propagate model preference to workflow/task execution

## Description

The user's onboarding model choice ("Balanced/Sonnet") is honored by chat but **not** by workflow/task
execution — a live workflow ran on an Opus model despite the Balanced preference, silently billing the
more expensive tier to a cost-conscious user (a direct hit to the margin promise and "your rules,
enforced").

**Root cause confirmed 2026-07-01:** `chat.defaultModel` / `chat.modelPreference` are read ONLY by
chat UI + settings code (`chat-session-provider.tsx:143-145`, `settings/chat/route.ts`, `helpers.ts:99`);
**no workflow/agent file reads them.** The workflow engine resolves only the *runtime*
(`engine.ts:856-865` `resolveStepRuntime`, off the separate `default_runtime` key), then the concrete
model falls to the runtime-catalog default (`execution-target.ts:440`
`getRuntimeCatalogEntry(...).models.default`). So the preference never reaches execution.

_Note: the backlog's observed model id `claude-opus-4-7` is stale — the current catalog default is
`claude-opus-4-8` (`catalog.ts:217`); balanced tier = `claude-sonnet-4-6` (`catalog.ts:221`)._

## User Story

As a cost-conscious agency owner, I want my "Balanced" model choice to apply to workflow and task runs,
so that I'm not silently billed for Opus on work I intended to run on Sonnet.

## Technical Approach

- **Make model resolution honor the preference.** At `src/lib/agents/runtime/execution-target.ts:440`,
  before falling back to `getRuntimeCatalogEntry(...).models.default`, consult the user's model
  preference (map the `chat.modelPreference` tier → the runtime's model for that tier, or read a shared
  setting). Decide whether the preference is global (applies to chat + workflows) or introduce a
  parallel `execution.modelPreference` — recommend reusing the existing tier so "Balanced" means Sonnet
  everywhere.
- **Respect explicit per-profile/per-step pins.** If a profile or step pins a model, that should still
  win — surface the *effective* model so the override is visible (avoid the current silent Opus).
- **Surface effective model per step** in the task/workflow detail so the routing is inspectable.
- **Smoke-test budget applies** (CLAUDE.md): `execution-target.ts` + `engine.ts` are runtime-registry-
  adjacent — verify with a real `npm run dev` workflow run and check `usage_ledger.model_id`.

## Acceptance Criteria

- [x] With "Balanced" selected, a workflow step runs on the Sonnet-tier model (DB: `usage_ledger.model_id`
      is the balanced model, not Opus) unless a profile/step explicitly pins otherwise.
- [x] The effective model per step is visible in the UI (task/workflow detail or monitor).
- [x] An explicit per-profile/per-step model pin still overrides the preference (documented behavior).

## Scope Boundaries

**Included:**
- Making workflow/task model resolution consult the user's model preference; surfacing effective model.

**Excluded:**
- Runtime (provider) routing changes — `resolveStepRuntime`/`default_runtime` already works; only the
  *model within the runtime* is unrouted.
- A full per-step model-picker UI (enhancement).

## Verification run — 2026-07-02

Shipped as `src/lib/agents/runtime/model-preference.ts` (`resolvePreferredModel`: profile
pin > preference tier > quality default; "privacy" = runtime-level, no within-runtime
opinion). Wired into: `claude-agent.ts` (task execute + resume now pass `model:` explicitly
— the SDK was silently choosing Opus when no model was passed), `runtime/claude.ts` aux
calls (task-assist/profile-assist/meta — previously hardcoded quality tier), and both
direct runtimes' task paths (`anthropic-direct.ts`, `openai-direct.ts` — explicit
`*_direct_model` setting still wins). Note: the spec's `catalog.ts:217/221` cite was
anthropic-direct's entry; claude-code uses bare family aliases (haiku/sonnet/opus).

**Smoke (mandatory per CLAUDE.md, real `npm run dev` + fresh scratch DB):** preference set
to "balanced" via PUT /api/settings/chat → claude-code task completed on
`claude-sonnet-4-6` (task.effectiveModelId + ledger row + monitor feed all show it; 69µ
metered); anthropic-direct task also resolved `claude-sonnet-4-6` (previously
`claude-opus-4-8`). Aux `pattern_extraction` ran Sonnet. Unit:
`model-preference.test.ts` (6).

**Found during smoke (separate defect, spec'd):** anthropic-direct task execution fails
with "Converting circular structure to JSON" — pre-existing, unrelated to model
resolution; see `fix-anthropic-direct-task-serialization.md`.

## References

- Source: `_IDEAS/backlog.md` — J6 blocker #5 (mechanism-verified entry).
- Related features: `profile-runtime-default-resolution.md`, `smart-runtime-router.md`,
  `runtime-capability-matrix.md`, `onboarding-runtime-provider-choice.md`, `workflow-runtime-configuration.md`.
