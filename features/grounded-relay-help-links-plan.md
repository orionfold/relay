# G-075 implementation plan — grounded Relay help links

**Status:** Completed 2026-07-15

**Specification:** `features/grounded-relay-help-links.md`

## Scope challenge

This goal extends the existing G-054 artifact and G-055 quick-access contract.
It does not require a new documentation store, retrieval engine, Chat provider
path, or guide UI. The smallest complete slice is generated source locators,
route parity validation, defensive persistence parsing, and grouped rendering.

## Affected surfaces

- `_ASSETS` Guide/API tracker slugs and screenshot product-route metadata
  (read-only generation inputs)
- `scripts/lib/knowledge-bundle.mjs` and bundle build/verify entry points
- committed `knowledge/` artifact schema and generated files
- `src/lib/knowledge/types.ts` and `src/lib/knowledge/chat-retrieval.ts`
- `src/lib/chat/types.ts` persisted quick-access validation
- `src/components/chat/chat-quick-access.tsx`
- generator, retrieval, renderer, and existing cross-runtime contract tests

## Vertical slices

1. Add canonical public source URLs to the generated knowledge contract, bump
   its schema, validate source-kind URL families, and regenerate deterministically.
2. Canonicalize the historical runtime locator and verify every bundled product
   page/fragment against the App Router source tree during build and verification.
3. Propagate source URLs into persisted quick-access metadata with fail-closed
   defensive parsing that degrades an invalid URL to a truthful non-link badge.
4. Render source citations and related Relay actions in distinct semantic rows,
   with external-link semantics and source-first keyboard order.
5. Run focused tests, knowledge/package guards, real grounded Chat smoke, then
   desktop and narrow browser verification.

## Regression-test budget

- Generator: canonical Guide/API URLs; unsafe/noncanonical URL rejection;
  static/dynamic route resolution; missing page/fragment rejection; runtime
  locator canonicalization; deterministic rebuild and tamper/version guards.
- Runtime retrieval: public source propagation, safe route, Ollama settings
  destination, malicious locator rejection, missing/stale bundle behavior.
- Renderer/persistence: valid linked source attributes/icon/name; invalid or
  missing source URL fallback; citation-only/action-only/mixed grouping and tab
  order; unsafe internal action rejection; pre-completion hiding.
- Existing Claude, Codex, Ollama, LiteLLM, and LM Studio contract tests remain
  the provider parity budget because all consume the shared knowledge turn.

## Broader verification

- `npm run test:knowledge`
- targeted Vitest knowledge/quick-access/provider contract lanes
- TypeScript and public/package/knowledge verification
- real task under `npm run dev` only if a runtime-registry-adjacent import graph
  is changed; otherwise a real grounded Chat request through the current server
- desktop and 390 px in-app Browser checks of a completed grounded response
- clean packed-instance smoke with `npm pack` artifact

## Rollback and rescue

No migration is required: old persisted source items omit `href` and remain
non-links. Reverting the renderer URL branch restores the former safe behavior.
The bundle is atomically reconciled, so a failed generation retains the last
verified artifact. After two materially different failures on one blocker,
stop with the failing command, named error, fixture/input, and last good state.
