---
title: Shell Runtime Readiness Status
status: completed
priority: P0
milestone: post-mvp
source: _IDEAS/triage.md#triage-059
dependencies: [runtime-first-value-reliability]
---

# Shell Runtime Readiness Status

## Description

Relay's normalized runtime readiness now distinguishes configured, verified,
unreachable, rejected and capability-ineligible providers. The global shell
still renders the older `AuthStatusDot`, which reports only Anthropic
key/OAuth/environment state. A customer can therefore complete work through a
healthy Ollama runtime while every screen says **API Disconnected**.

This feature finishes the missing shell slice of G-119. The global status must
describe Relay's currently eligible runtime pool. Provider-specific
authentication remains visible inside the relevant provider card instead of
being promoted into an unlabeled product-wide failure.

## User Story

As a local-first customer, I want the global status to reflect whether Relay
has a ready runtime for my work so that a healthy Ollama, LM Studio, LiteLLM or
cloud provider is not contradicted by a red Disconnected label.

## Presentation Contract

- **Ready:** at least one selected, configured and recently verified eligible
  runtime.
- **Degraded:** selected runtimes exist but all are stale/unreachable, or only
  a fallback subset is ready.
- **Setup needed:** no configured eligible runtime.
- **Checking:** current readiness is loading and no retained authoritative
  observation is available.
- The label and tooltip name runtime readiness; they never use a generic
  `API Connected/Disconnected` phrase.
- Provider auth state stays provider-scoped in Settings.

## Technical Approach

1. Replace `AuthStatusDot` in `BarIdentityCluster` with a shell consumer of the
   normalized runtime-routing/readiness response already used by Settings
   glance and telemetry.
2. Share a pure classifier for ready, degraded, setup-needed and checking
   states; do not duplicate provider probing in the client.
3. Retain the last authoritative observation during refresh and reject stale
   responses so the shell does not flicker or roll back.
4. Link the status to `settings#settings-providers`, where the operator can see
   provider-specific evidence and repair actions.
5. Remove or confine `AuthStatusDot` to any genuinely Anthropic-specific
   surface; do not leave two competing global indicators.

## Acceptance Criteria

- [x] Healthy selected Ollama shows a named ready runtime status in the shell.
- [x] Healthy LM Studio, LiteLLM, Claude/Codex and direct cloud runtime fixtures
      produce the same provider-neutral ready state.
- [x] Multiple runtimes with a healthy fallback produce Ready or Degraded
      according to the documented classifier, not Disconnected.
- [x] No configured runtime displays Setup needed with a direct Settings link.
- [x] A previously ready runtime that becomes unreachable displays Degraded
      with retained named evidence and no false green state.
- [x] The shell, Settings glance, task-routing preview and workflow preflight
      agree for the same readiness fixture.
- [x] A clean packed Chrome walkthrough with healthy Ollama contains no global
      **API Disconnected** or unlabeled **Disconnected** status.

## Verification — 2026-07-23

- One pure classifier now derives Ready, Degraded and Setup needed from the
  eligible routing pool. The Settings glance API returns that summary, and the
  shell retains the last good response while rejecting stale requests.
- The legacy global Anthropic auth indicator was removed. Provider-specific
  authentication remains in provider setup, while the shell names the ready or
  unavailable runtime and links directly to provider Settings.
- Thirty-one focused classifier, API, shell and glance regressions passed.
  A further fourteen provider-event and shell checks proved that both successful
  and failed tests refresh readiness immediately. TypeScript and the production
  build passed.
- In rebuilt packed staging, healthy Ollama rendered **Ollama ready**. Changing
  its URL to a controlled unavailable endpoint and testing it changed the shell
  to **Ollama unavailable** without a reload or false green interval. Chrome
  reported no console errors. Evidence is retained under
  `output/staging/2026-07-23/o6-repair-proof/`.

## Regression Budget

- Pure classifier matrix for all readiness states.
- Shell component tests for loading, ready, degraded, setup-needed, stale
  response ordering and navigation.
- Existing Settings glance/routing/preflight contract suite.
- TypeScript and production build.
- Rebuilt customer-identical Chrome proof with Ollama healthy and with the
  endpoint deliberately unavailable.

## Scope Boundaries

**Included:**

- Global shell runtime-readiness semantics and link target.
- Reuse of normalized provider-neutral readiness.
- Removal of the misleading auth-only global status.

**Excluded:**

- Changing provider credential storage or OAuth flows.
- Altering runtime selection policy.
- Redesigning the Monitor log-stream connection indicator, which describes a
  separate SSE connection and requires independent evidence if it is broken.

## Stop / Rescue

If the existing readiness endpoint is too expensive for shell polling, expose a
small derived summary from the same persisted observations. Do not revive the
legacy `/api/settings` Anthropic-only shortcut.

## References

- `_IDEAS/triage.md` — TRIAGE-039 and TRIAGE-059
- `src/components/settings/auth-status-dot.tsx`
- `src/components/shell/bar-identity-cluster.tsx`
- `features/runtime-first-value-reliability.md`
- `features/runtime-readiness-truth-plan.md`
