---
title: Version-Aware Relay Help In Chat — Implementation Plan
status: completed
specification: features/version-aware-relay-chat-help.md
goal: G-055
---

# Version-Aware Relay Help In Chat — Implementation Plan

## Scope Challenge

- **REDUCE rejected:** prompt-only injection would lose durable attribution,
  safe navigation, reload behavior, and provider parity required by G-055.
- **EXPAND rejected:** embeddings, a general documentation browser, remote
  refresh, and model-generated route handling add infrastructure without
  improving the release-matched trust boundary.
- **Proceed:** one verified lexical retriever and one shared knowledge-turn
  contract, consumed by every current Chat engine and rendered through the
  existing Quick Access completion surface.

## Affected Surfaces

- Knowledge runtime: new server-only loader, verifier, intent gate, ranker,
  context budget, receipt, and affordance derivation under `src/lib/knowledge/`.
- Chat contract: `src/lib/chat/types.ts`, dispatcher, Claude engine, Codex
  engine, Ollama engine, OpenAI-compatible engine, and session persistence.
- Chat UI: Quick Access parser/rendering and assistant-message metadata read.
- Verification: knowledge unit tests, engine contract tests, component tests,
  package/public-boundary guard, TypeScript, dev-runtime Chat smoke, and browser.
- Durable records: feature spec/plan, changelog, goal ledger, completion beacon
  only at the real completion boundary.

## Vertical Slices

1. **Pure intent/ranking/budget.** Add deterministic help classification and
   index ranking with positive/negative, exact-API, tie, dedup, and cap tests.
2. **Verified packaged retrieval.** Resolve the app root, validate manifest and
   index integrity/version/size, read only selected entries, and test every
   named unavailable state against temporary fixtures.
3. **Shared Chat turn.** Prepare once in the dispatcher; append the ready prompt
   to every engine; short-circuit unavailable/no-match help with one persisted,
   streamed deterministic response; preserve non-help behavior.
4. **Durable completion affordances.** Extend the Quick Access union, merge
   knowledge with entity actions under caps, persist receipt before `done`, and
   add provider/reload/branch regressions.
5. **Accessible UI.** Render sources as non-link badges and actions as local
   links; parse persisted metadata defensively; verify wrapping, labels, focus,
   dark/light behavior, and system cursor.
6. **Broader gates.** Typecheck, relevant suites, public/package checks, real
   `npm run dev` Chat task, and in-app browser evaluation at desktop and 390 px.
7. **Completion.** Update durable goal/changelog records, inspect and commit only
   Relay-owned changes, and close G-055. Do not commit the symlinked strategy
   repository or cut/push a release.

## Regression-Test Budget

- Pure runtime contract: about 18 assertions across intent, ranking, budgeting,
  integrity/version/size/route failures, and deterministic selection.
- Chat engines: at least one ready-knowledge completion assertion per engine,
  plus one dispatcher no-match/unavailable short-circuit and a non-help control.
- UI/persistence: existing entity compatibility, source/action distinction,
  invalid href rejection, terminal-only rendering, reload, and branch ancestry.
- Broader: TypeScript; targeted Chat/knowledge suites; npm public-boundary and
  package file contract. Full suite only if targeted changes expose shared-test
  failures or time/risk warrants it.

## Runtime Smoke Budget

This plan changes `src/lib/chat/engine.ts`, which is runtime-registry adjacent.
After unit/type verification, start the real app with `npm run dev`, create or
use an isolated local conversation, submit one product-help turn through the
HTTP Chat route, consume it through the terminal `done` event, and confirm the
persisted message contains the knowledge receipt and safe affordances. Repeat a
non-help turn to prove normal runtime dispatch still loads. Any module-load
`ReferenceError` blocks completion even if all mocked unit tests pass.

## Error & Rescue Registry

| Failure | Rescue |
|---|---|
| Runtime import cycle | Keep knowledge module leaf-like (`node:*`, types only); move preparation behind dynamic import in dispatcher if necessary |
| Provider prompt divergence | Pass one immutable turn object; do not re-rank inside engines |
| Corrupt/stale bundle | Deterministic unavailable response; never fall back to old or unverified prose |
| Over-broad intent | Tighten pure classifier fixtures before changing engine behavior |
| Weak ranking | Preserve deterministic lexical contract; add corpus-grounded query fixtures, not model ranking |
| Unsafe persisted href | Drop at server derivation and client parser; source badge remains non-clickable |
| Context budget overrun | Truncate selected Markdown and record truncation; never add a fourth section |
| Terminal event before persistence | Await metadata write before yielding `done` in every engine |
| UI regression in narrow/dark layouts | Keep the existing wrapping container and semantic tokens; browser-check 390 px and dark mode |
| Package cannot find bundle | Resolve from installed package root with `getAppRoot`; exercise packed artifact path |

## Rollback

The dispatcher is the single enablement boundary. If production-like smoke
finds an integration failure, remove knowledge-turn preparation/passing while
leaving the G-054 artifact and independent retriever tests intact. Existing
Quick Access entity items remain backward-compatible through the discriminated
parser, so the UI contract can stay without exposing knowledge items.

## Completion — 2026-07-15

All seven vertical slices completed. The over-broad-intent rescue was exercised
during fresh review by requiring a Relay/product/API signal before retrieval;
an unrelated-question regression now protects normal Chat dispatch. No rollback
was required.
