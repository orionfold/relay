---
title: Cross-provider Chat and runtime boundary contracts
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md#G-072
dependencies: [provider-runtime-abstraction, chat-engine, codex-chat-engine, ollama-runtime-provider, openai-compatible-runtimes]
---

# Cross-provider Chat and runtime boundary contracts (G-072)

## Description

Relay ships seven runtime identities, but not every task runtime is a Chat
runtime and the supported Chat engines terminate with different wire-level
signals. A shared executable boundary contract must make those differences
explicit while preserving one application-level outcome: a Chat turn ends
once as completed, cancelled, or failed; its message, usage receipt, runtime
identity, and stream telemetry agree; and no provider silently becomes another
provider.

This goal adds an exhaustive runtime-to-Chat boundary inventory, derives the
conversation allow-list and dispatch policy from it, and protects the common
terminal behavior at the SSE route. Provider-specific tests retain protocol
details such as Claude SDK result frames, Codex `turn/completed`, Ollama
`done: true`, and OpenAI-compatible `[DONE]` markers.

## User story

As an operator, I want every configured Chat provider to fail, cancel, and
complete predictably so that a provider-specific stream cannot leave a stale
message, report the wrong runtime/model, or appear successful after an error.

## Runtime and exception matrix

| Runtime | Chat engine | Model identity | Success terminal | Tool mode | Usage/cost truth |
|---|---|---|---|---|---|
| Claude Code | Claude Agent SDK | catalog alias | successful SDK result | native + Relay MCP | SDK usage; catalog pricing |
| OpenAI Codex App Server | Codex app-server | selected/effective model | `turn/completed: completed` | native approvals | app-server usage; catalog pricing |
| Anthropic Direct | none in Chat | task adapter only | n/a | n/a | explicit unsupported exception |
| OpenAI Direct | none in Chat | task adapter only | n/a | n/a | explicit unsupported exception |
| Ollama | Ollama HTTP | `ollama:<model>` | NDJSON `done: true` | no provider tool loop | provider token counts; existing Ollama cost policy |
| LiteLLM | compatible SSE | `litellm:<model>` | SSE `[DONE]` | tool calls refused | endpoint usage; valid reported cost only |
| LM Studio | compatible SSE | `lmstudio:<model>` | SSE `[DONE]` | tool calls refused | endpoint usage; cost unknown |

Anthropic Direct and OpenAI Direct remain valid task runtimes. They are not
silently routed through the Claude or Codex Chat engines. Adding Chat support
for either requires a dedicated engine, model-discovery identity, terminal
protocol, persistence tests, and an update to this matrix.

## Common application contract

1. Every catalog runtime has exactly one boundary record. A record either
   names a Chat engine or gives a durable unsupported reason.
2. Conversation creation accepts only runtimes with a Chat engine. The route
   must not maintain a second handwritten allow-list.
3. Dispatch is exhaustive. An unsupported or newly added runtime cannot fall
   through to the Claude SDK.
4. A successful stream emits deltas as available, persists a non-empty
   assistant message, writes requested/effective runtime-model identity and a
   completed usage receipt, records `stream.completed`, then emits one `done`.
5. A failed or malformed terminal writes a named error, an error message row,
   a failed usage receipt when a turn was created, and
   `stream.finalized.error`; it never emits `done`.
6. Cancellation propagates into the provider where supported, persists a
   cancelled receipt and error-state message, and records the relevant client
   and provider signal reason. Cancellation never becomes completion.
7. Empty, nil, malformed, truncated, or terminal-free streams fail visibly.
   Partial content may be preserved, but it does not change a failed terminal
   into success.
8. Finalization is idempotent. Iterator abandonment and duplicate terminal
   attempts cannot leave a `streaming` row or duplicate a usage receipt.
9. The SSE route emits a terminal event even when an engine unexpectedly
   returns or throws without one, and stops consuming after the first terminal.

## Technical approach

- Add `src/lib/chat/runtime-contract.ts` as the exhaustive provider/exception
  registry. Keep it dependency-light so API routes and tests can consume it.
- Derive the conversation creation allow-list from the registry and use the
  same registry to make engine dispatch explicit.
- Repair Codex Chat finalization so provider terminal notifications wake the
  generator but do not emit `done` before durable message/usage writes.
- Propagate request cancellation to Codex with `turn/interrupt` when a turn ID
  exists. Treat provider `interrupted` as cancellation, not success.
- Add Codex Chat stream telemetry, active-stream accounting, and the existing
  idempotent message finalizer used by other engines.
- Strengthen the route-level SSE bridge for unexpected EOF/throw and duplicate
  terminal attempts.
- Use parameterized common-contract assertions plus provider-specific
  deterministic fixtures. Do not replace protocol tests with a lowest-common-
  denominator mock.

## Acceptance criteria

- [x] The boundary registry exhaustively covers all seven catalog runtimes and
      names the five supported Chat runtimes plus the two direct-runtime
      exceptions.
- [x] Conversation creation derives its accepted runtimes from the registry,
      accepts Claude/Codex/Ollama/LiteLLM/LM Studio, and rejects both direct
      task-only runtimes with a named 400 response.
- [x] Chat dispatch cannot fall through from an unsupported runtime to another
      provider.
- [x] Codex completed, failed, interrupted, empty-output, process-error, and
      request-abort cases produce matching event, message, receipt, runtime/
      model metadata, telemetry, and active-stream state.
- [x] Existing Ollama and compatible-provider tests continue to protect model
      namespaces, HTTP/protocol errors, malformed/truncated terminals, usage,
      cost, cancellation, and no-fallback behavior.
- [x] The route SSE suite protects successful completion, explicit engine
      error, unexpected EOF, unexpected throw, client cancellation, and
      first-terminal-wins behavior.
- [x] Reconciliation and finalization tests prove no terminal path leaves a
      `streaming` assistant row and duplicate finalization remains idempotent.
- [x] Targeted tests, fixed-seed/full Vitest, TypeScript, quality gates,
      production build, and the real runtime-module-graph smoke pass without
      live provider credentials.

## Scope boundaries

Included:

- Shared executable Chat boundary inventory and route/dispatch derivation.
- Codex Chat terminal correctness and cancellation/finalization repair.
- Credential-free provider and route regression matrices.
- Existing requested/effective target, usage, cost, and privacy assertions.

Excluded:

- Adding Chat engines for Anthropic Direct or OpenAI Direct.
- Declaring providers equivalent because they accept similar payloads.
- Live billable-provider tests, customer LAN validation, new CI services, or
  credentials.
- Changing automatic cross-provider fallback policy beyond preventing
  unsupported-runtime fallthrough.
- Refactoring all provider engines into one transport abstraction.

## Rescue and rollback

- If a shared assertion hides a real protocol distinction, retain the common
  application invariant and move the wire detail into the provider exception
  table/test.
- If Codex cancellation cannot send `turn/interrupt`, close the client and
  persist cancellation; never wait indefinitely or mark the turn complete.
- If registry imports create a runtime-catalog module cycle, keep the registry
  type-only and move provider imports behind function-local dynamic imports.
- The production changes are additive and reversible: restore the prior route
  allow-list/dispatch and retain the new tests as evidence of the lost guard.

## Verification receipt — 2026-07-14

- Focused Chat/runtime contract run: 7 files, 58 tests passed.
- Release quality profile: all 19 lanes passed in 64.01 seconds, including 431
  default test files with 3,334 passing tests and one intentional skip,
  TypeScript, all 11 coverage ratchets, 7/7 required mutants killed, public and
  documentation boundaries, pack compatibility, and the CLI bundle.
- Runtime-module-graph smoke executed real deterministic Ollama task/workflow/
  Chat paths plus LiteLLM task/Chat and LM Studio workflow/schedule/Chat paths,
  producing five compatible-provider receipts with matching identities.
- Production Next.js build passed separately. Its 41 existing Turbopack broad
  dynamic-path warnings remain unrelated to this goal.
- No live provider credentials or customer three-host LAN were required or
  claimed. G-070 and G-071 remain open independent regression investments.

## References

- Goal: `_IDEAS/backlog.md` G-072
- Predecessor: `features/openai-compatible-runtimes.md`
- Runtime target truth: `features/effective-execution-target.md`
- Stream recovery: `src/lib/chat/reconcile.ts`
- Runtime graph precedent: TDR-032 and `scripts/runtime-module-graph-smoke.mjs`
