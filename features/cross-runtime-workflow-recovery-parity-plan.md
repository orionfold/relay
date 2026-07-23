---
title: Cross-runtime Workflow Recovery Parity Plan
status: completed
specification: features/runtime-first-value-reliability.md
goal: G-124
---

# Cross-runtime Workflow Recovery Parity Plan

## Contract

The runtime selected by workflow readiness must be the runtime used to resolve
the step profile and execute the task. When that runtime reports a transient
timeout, rate limit, or unreachable endpoint, the task must persist the same
machine-readable failure class that G-122 consumes. Terminal authentication,
capability, cancellation, budget, and turn-limit failures remain terminal.

## Affected surfaces

- Shared task query-context construction in `src/lib/agents/claude-agent.ts`.
- Ollama, Anthropic Direct, OpenAI Direct, LiteLLM, and LM Studio task adapters.
- Existing task failure classification in
  `src/lib/agents/runtime/launch-failure.ts`.
- Workflow child-task result propagation and G-122 sequence recovery.
- Runtime-adapter and real-SQLite workflow regressions.

## Vertical slices

1. Add an explicit runtime argument to the shared task-context builder and pass
   the executing adapter's runtime at every non-Claude call site.
2. Persist the shared failure classification in every non-Claude adapter catch
   path without changing cancellation behavior or retry policy.
3. Add adapter-level regressions proving runtime-specific profile payloads and
   failure-reason writes.
4. Add a real-SQLite sequence regression: an Ollama-only profile passes
   readiness, a controlled transient failure reaches `blocked_runtime`, and
   recovery resumes only the blocked suffix.
5. Run the runtime-registry graph smoke, a real task under `npm run dev`, the
   full suite/build, and the customer-identical G-025 browser recovery proof.

## Regression budget

- Shared context/profile compatibility: 4–6 cases.
- Adapter failure persistence: 5–8 cases across local/direct/compatible paths.
- Workflow recovery integration: 2–3 cases including completed-prefix
  preservation.
- Existing G-119–G-123 targeted suites, runtime graph smoke, full suite/build,
  and real browser proof.

## Rescue and rollback

If a provider SDK error cannot be classified without false recovery, leave that
specific failure terminal and add a provider-specific named classifier before
enabling recovery. The runtime-aware context signature is additive and can be
rolled back per adapter without changing persisted data. Do not broaden the
recoverable reason set or automatically replay a generation to make the live
proof pass.
