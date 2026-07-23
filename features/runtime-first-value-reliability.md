---
title: Runtime First-Value Reliability
status: planned
priority: P0
milestone: post-mvp
source: _IDEAS/triage.md
dependencies: [npm-customer-install-integrity]
---

# Runtime First-Value Reliability

## Description

The walkthrough exposed contradictions at every runtime-to-workflow joint:
credential presence is labeled Connected before verification, ChatGPT sign-in
can fail silently, LM Studio inventory includes an embedding model in its
generation count, routing remains stale until manual refresh, Start run creates
drafts before it learns no runtime is eligible, Open run mutates history without
rendering the route, and a later ten-second Claude probe timeout terminally
fails a workflow after earlier steps created side effects.

This feature family defines one evidence-backed runtime presentation and carries
it through first execution and recovery. G-119 owns the shared truth contract;
G-120, G-121 and G-122 consume it. G-123 keeps related CLI profile discovery
fault-tolerant and concise.

## Runtime evidence model

Provider evidence must distinguish:

- Not configured.
- Credential saved but unverified.
- Verifying.
- Authentication verified, with timestamp/source.
- Authentication rejected.
- Provider transiently unreachable or timed out.
- Endpoint reachable.
- Installed/discovered model inventory.
- Model type and generation eligibility.
- Loaded/ready state when the provider exposes it.
- Runtime capability/profile compatibility.
- Current task-routing eligibility.

Provider-specific evidence remains intact beneath a normalized presentation.
For example, LM Studio loaded instances and Ollama model availability are not
forced into cloud API-key semantics.

## Authentication and connection behavior

- Replacing a credential clears prior verification.
- A failed test preserves the stored key for correction but removes Connected
  and routing-eligible claims.
- Environment and encrypted DB sources remain distinguishable.
- ChatGPT sign-in preflights Codex CLI/App Server availability and returns
  structured non-JSON/empty/non-OK failures.
- Relay's isolated Codex home is preserved; global authentication is not
  silently imported.
- Shell status describes eligible routed runtime health or labels its exact
  narrower scope; it is not an Anthropic-only global status.

## Provider setup and routing

- Compact provider authentication/connection appears before routing choice.
- Successful save-before-test and model discovery reconcile provider card,
  routing row and general-task preview in one state update.
- Generation defaults exclude embedding/reranking/unsupported model types.
- Capability/tool limitations stay visible.
- If a fully combined surface harms scanning, ordered provider-first sections
  with shared live status are the accepted fallback.

## Atomic Start run and navigation

- Executable readiness is preflighted before **Ready** and before draft creation.
- Runtime refusal retains variables and offers the shortest setup action.
- **Create workflow** remains the intentional draft-only verb.
- Start run uses one server-owned transaction or compensating rollback so a
  dispatch refusal creates no hidden draft.
- Duplicate activation has one result.
- Success returns one workflow ID and a semantic App Router/Link action opens
  that exact workflow detail.
- Mouse, keyboard, focus and back navigation are part of the regression.

## Step-scoped transient recovery

- Recent successful execution/verified-health evidence has an explicit bounded
  freshness policy.
- Transient probe timeouts receive bounded retry/recheck before terminal state.
- A still-unavailable runtime pauses the step with an actionable status.
- Authentication rejection and capability mismatch remain named failures.
- Retry resumes only the blocked step.
- Operation receipts/idempotency keys prevent completed document, schedule,
  message and other effects from replaying.
- Unsupported unreceipted side effects fail closed rather than replaying.

## Filesystem skill discovery

- Use filesystem inspection that safely distinguishes valid symlinks, dangling
  entries, non-directories and unreadable targets.
- Skip safe-to-ignore entries and aggregate a privacy-safe production summary.
- Preserve detailed paths in explicit diagnostics only.
- A root scanner failure remains named and visible.
- Registry precedence and fused-profile deduplication remain unchanged.

## Acceptance criteria

- [ ] Provider cards, shell, routing and workflow preflight agree for every
      credential/health state.
- [ ] ChatGPT sign-in exposes a named recovery path when Codex App Server is
      absent, broken, unauthenticated, cancelled or timed out.
- [ ] Local model totals and defaults reflect supported generation models and
      honest loaded/readiness evidence.
- [ ] Provider setup updates routing automatically without extra refresh.
- [x] No-ineligible-runtime Start run creates zero drafts.
- [x] Successful Open run renders `/workflows/{workflowId}`.
- [ ] Transient later-step timeout pauses/retries/resumes without replaying
      completed side effects.
- [ ] Authentication rejection and true outage remain distinct.
- [x] Dangling filesystem skills do not flood CLI output or hide a total failure.
- [ ] Real `npm run dev` task smoke covers runtime-registry import and execution
      paths in addition to unit/component tests.

## Regression budget

- Shared state-machine/helper tests and provider-specific evidence fixtures.
- Codex login route/control tests including empty response.
- Ollama, LM Studio and LiteLLM inventory/readiness fixtures.
- Settings component tests for save/test/discover/reconcile ordering.
- Workflow database tests for zero orphan, duplicate submit and idempotent resume.
- Rendered navigation integration test, not a `pushState` spy.
- Real compatible runtime task and multi-step Agency smoke.
- Desktop/390 px browser evidence and production CLI capture.

## Scope boundaries

**Included:** runtime readiness presentation, provider setup/routing,
blueprint/workflow start, exact run handoff, transient step recovery, fused-skill
diagnostics.

**Excluded:** new runtime providers, provider-hosted credential service, Fleet
routing, general workflow compensation for unbounded external tools, global
Claude/Codex configuration repair.

## References

- TRIAGE-039, TRIAGE-046, TRIAGE-047, TRIAGE-048, TRIAGE-050–TRIAGE-054
- G-119, G-120, G-121, G-122, G-123
- TDR-032 runtime-registry smoke requirement

## Implementation receipt — G-119

Accepted 2026-07-23. Relay now persists a provider-neutral readiness
observation while retaining provider-specific evidence. The normalized phases
are not configured, saved/unverified, verified, authentication rejected,
unreachable, model required, and invalid response; only verified is
routing-ready. Credential
or endpoint replacement invalidates prior evidence, explicit tests and
execution preflight refresh it, and concurrent shell/Settings reads share one
bounded probe set.

Provider cards, routing preview/suggestion, workflow execution preflight,
Settings-at-a-glance, instance identity, and telemetry now consume that truth.
ChatGPT sign-in names empty, non-JSON, invalid, cancelled, process-exit and
five-minute timeout failures while preserving Relay's isolated Codex home.
LM Studio/LiteLLM discovery excludes embedding and other non-generation
inventory from generation totals/defaults while retaining model type and loaded
instance evidence.

Verification passed: 3,870 tests across 528 files (one intentional skip),
TypeScript, the production build, the deterministic real-task runtime-graph
smoke under `npm run dev` across Ollama/LiteLLM/LM Studio, and desktop plus
390 px dark-browser inspection with no console errors. Existing Turbopack
dynamic file-tracing warnings remain unrelated.

## Implementation receipt — G-120

Accepted 2026-07-23. Settings now reads in customer action order: compact
Ollama, LiteLLM and LM Studio summaries first; compact Anthropic/OpenAI setup
next; task routing last. Each local-provider summary exposes the exact
G-119 readiness state, endpoint and model selection, then expands
keyboard-accessibly without hiding provider-specific authentication, transport,
model acquisition, discovery or capability controls. Existing provider anchors
remain valid.

The layout uses the goal's ordered-section rescue path because it preserved
scan speed better than nesting all provider forms inside the routing card.
Provider save/test/discovery events force-refresh the shared routing snapshot,
so newly verified runtimes appear without a manual second refresh. Initial
verified state now says **Verified** until inventory has actually been
discovered rather than falsely displaying zero models.

Verification passed: 3,874 tests across 528 files (one intentional skip),
TypeScript, production build, focused save-before-test/discovery/order/event
tests, and desktop plus 390 px light/dark browser inspection with zero console
errors. Existing Turbopack dynamic file-tracing warnings remain unrelated.

## Implementation receipt — G-123

Accepted 2026-07-23. Filesystem skill discovery now classifies dangling,
unreadable and malformed entries without interrupting valid registry, user or
project profiles. Valid directory symlinks still load, registry/user/project
precedence is unchanged, and a failure to scan an entire existing root throws
the named `FilesystemSkillDiscoveryError` instead of disappearing.

Routine CLI output aggregates and rate-limits entry failures into one
privacy-safe line. A bounded process-local diagnostics surface returns only
counts by default; local paths and reasons require the explicit
`includePaths=1` request.

Verification passed: 3,881 tests across 529 files (one intentional skip),
TypeScript, production build, dangling/valid symlink and failure-matrix
fixtures, diagnostics redaction checks, and the real customer skill tree
through the `list_profiles` chat tool. That customer-state proof returned 91
valid profiles with one path-free summary for 31 unavailable/malformed entries.

## Implementation receipt — G-121

Accepted 2026-07-23. Runnable blueprint surfaces now show **Ready** only when
the first declared executable step has a profile-, capability-, model- and
routing-compatible target backed by persisted verified provider evidence.
Unready cards expose a semantic **Setup needed** link, and provider readiness
events refresh the state without reloading. Gallery rendering does not perform
live provider probes; the observed-readiness response was 55 ms warm in the
real app.

**Start run** now sends one idempotent request. The server resolves variables
and conditions, live-preflights every executable step before mutation, then one
SQLite transaction inserts the exact active workflow and its first run receipt.
A refused preflight creates zero workflow rows. Concurrent/retried request
identities converge on the same workflow and dispatch only once, while
**Create workflow** remains draft-only. Success toasts use semantic App Router
links to `/workflows/{workflowId}` instead of mutating native history.

Verification passed: 3,894 tests across 532 files (one intentional skip),
TypeScript, production build, 89 focused atomic/readiness/navigation and
existing-card regressions, desktop and 390 px dark-browser inspection with no
console warnings/errors, and the deterministic loopback runtime-graph smoke
covering real task, workflow, chat, Ollama, LiteLLM, LM Studio and receipt
paths. A live external-provider workflow was deliberately not used because
agent profiles may read project context; the loopback smoke provides the
required execution proof without transmitting it.
