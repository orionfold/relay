# G-072 implementation plan

Authoritative specification:
`features/cross-provider-chat-runtime-contracts.md`

## Scope challenge

Keep this goal at the Chat/runtime boundary. Do not turn it into new direct-API
Chat engines or a full provider transport rewrite. The valuable slice is an
exhaustive contract, a repaired Codex terminal path, and deterministic evidence
that the provider-specific engines satisfy the shared application invariants.

## Affected surfaces

- Runtime-to-Chat capability/exception registry
- Conversation creation allow-list and Chat engine dispatch
- Codex app-server Chat stream, persistence, cancellation, usage, and telemetry
- Route-level SSE terminal enforcement
- Ollama and OpenAI-compatible provider regression suites
- Chat reconciliation/finalization and active-stream guards
- Runtime module-graph smoke, quality policy, product ledger, and changelog

## Vertical slices

1. **Contract inventory:** add the exhaustive runtime boundary record; derive
   accepted conversation runtimes; add common matrix and explicit direct-
   runtime exception tests.
2. **Codex terminal repair:** separate provider terminal notification from the
   public terminal event; persist message/metadata/usage/telemetry before
   yielding `done`; name failed/interrupted/empty cases; forward cancellation;
   add finalization and active-stream protection.
3. **SSE boundary:** make unexpected generator EOF/throw visible, stop after the
   first terminal, and verify request cancellation propagation.
4. **Provider matrix:** run the existing Ollama and compatible protocol suites;
   add any missing identity/finalization cases revealed by the common matrix.
5. **Broader verification:** run focused tests, test-project membership,
   TypeScript, fixed-seed/default Vitest, the PR/release quality profile as
   appropriate, production build, and real runtime-module-graph smoke.

## Regression-test budget

- Runtime registry/allow-list/dispatch: 8-12 parameterized cases.
- Codex Chat terminal matrix: 6-8 cases over completed, failed, interrupted,
  empty output, process error, abort, metadata/usage, and finalizer state.
- SSE route boundary: 5-7 cases over done, error, EOF, throw, duplicate
  terminal, and client cancellation.
- Reuse rather than duplicate the existing 9 Ollama engine cases, 15 compatible
  transport cases, 3 compatible engine cases, 6 finalizer cases, and 4 stale
  reconciliation cases.

## Broader verification

- `npx vitest run` for the new contract/Codex/route suites and affected
  provider/finalization/target suites.
- `npm run test:projects` and `npx tsc --noEmit`.
- `npm test -- --sequence.shuffle=false --sequence.seed=...` or the repository
  fixed-seed/default lane selected by `quality:gate`.
- `npm run quality:gate -- --profile pr` and the release profile if this goal
  changes release-blocking quality policy.
- `npm run build`.
- `npm run test:runtime-graph` because `engine.ts` is transitively adjacent to
  the runtime registry and its dispatch imports must remain cycle-safe.

## Rescue and rollback

- After two materially different harness failures at the same boundary, retain
  explicit provider tests and close with the exact unshared invariant rather
  than weakening the assertion.
- If a protocol mismatch is discovered, change only that provider's exception
  record and adapter test; do not widen the shared transport.
- If the Codex repair cannot interrupt a live turn reliably, persist
  cancellation and close the client while keeping the terminal receipt
  truthful.
- Rollback is localized to the registry-derived allow-list/dispatch and Codex
  terminal flow; no schema or data migration is involved.
