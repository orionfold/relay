---
title: Version-Aware Relay Help In Chat
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/backlog.md G-055
dependencies: [G-054]
---

# Version-Aware Relay Help In Chat

## Goal Contract

**Outcome.** When an operator asks how Relay works, in-app Chat answers from a
small set of verified sections in the knowledge bundle for the running Relay
version. After the assistant message completes, it shows exact versioned source
attribution and, where the cited section declares a safe product route, a
clickable `Open ...` action.

**Constraints.** Runtime reads only the packaged `knowledge/` artifact. It does
not read `_ASSETS`, strategy, roadmap, feature specs, the removed User Guide UI,
or the network. It never treats API paths as product links and never turns
model-generated URLs into actions. Existing Quick Access entity actions remain
compatible. All affordances use the system cursor.

**Executable verification.** Intent, ranking, budget, integrity, prompt,
metadata, provider parity, reload/branch durability, component accessibility,
package boundary, typecheck, and a real dev-runtime Chat request must pass.

**Operator gates.** Exact visible language, route vocabulary, and context budget
are product-taste gates. This implementation reuses the established Quick
Access placement and `Open ...` language, derives labels from allowlisted route
families, and adopts the conservative limits below. Release, push, and strategy
repository writes remain separate gates.

**Stop/rescue.** If the shared turn contract creates a runtime-registry import
cycle or two materially different integration approaches fail, preserve the
G-054 bundle, disable retrieval at the single dispatcher boundary, and report
the evidence rather than adding provider-specific fallbacks.

## User Behavior

- Product-help questions such as “How do I publish a Pack?”, “Where do I set the
  Ollama host?”, or “What does `POST /api/tasks` do?” receive current bundled
  context.
- Direct execution requests such as “publish my Pack”, “create a workflow”, and
  ordinary troubleshooting reports do not receive documentation context merely
  because they contain a Relay noun.
- Retrieval selects at most three sections and at most 1,200 approximate tokens
  of Markdown. It loads only the entry files referenced by those selections.
- The model is told that the passages are the only verified Relay product
  knowledge for the turn, to cite source labels in prose, and not to invent UI
  routes or claim unsupported behavior.
- A completed assistant message persists a compact knowledge receipt plus at
  most two source badges and two safe product actions. Source badges are text,
  not links. Product actions are local links declared in the selected bundle
  records.
- Missing, stale, malformed, corrupt, oversized, or unsupported artifacts
  produce a deterministic current-knowledge-unavailable answer. A well-formed
  bundle with no relevant section produces a distinct no-current-answer reply.
  Neither path silently asks a model to improvise.

## Shared Turn Contract

The Chat dispatcher prepares one `RelayKnowledgeTurn` before selecting a model
engine. It contains one of:

- `not-requested` — the deterministic intent gate did not identify product help;
- `ready` — release version, selected bounded passages, prompt block, receipt,
  and affordances; or
- `unavailable` — a named failure code and deterministic user-facing response.

The same value is passed into Claude, Codex, Ollama, LiteLLM, and LM Studio.
Engines append only the supplied prompt block, persist only the supplied receipt
and affordances, and expose them only in the terminal `done` event. This keeps
streaming deltas free of navigation metadata and keeps reloads provider-neutral.

## Retrieval And Ranking

1. Detect explicit instructional, location, explanation, or API-reference
   intent. Normalize Unicode and case; extract exact `/api/...` paths and
   meaningful terms.
2. Resolve the package root with the existing packaged/source-tree helper.
3. Parse and validate `package.json`, `knowledge/manifest.json`, and
   `knowledge/index.json`; require schema 1 and exact release-version equality.
4. Verify the index hash, manifest root hash, safe declaration paths, counts,
   and size caps before ranking.
5. Rank exact API-path matches first, then heading/title phrases, then weighted
   query-token overlap with indexed search terms. Reject zero-signal records and
   resolve ties deterministically by kind, source id, and ordinal.
6. Load only selected declared entry files; validate their byte size, content
   hash, identity, source-state hash, and selected section identity.
7. Deduplicate source/section pairs and routes before applying the context and
   affordance caps.

Approximate tokens are `ceil(characters / 4)`. A single section may be truncated
at a Markdown-safe character boundary to keep the total under 1,200 tokens; the
receipt records that truncation.

## Metadata And UI Contract

`metadata.knowledge` stores the release version, status, selected source id,
section id, source kind, heading, word count, and truncation state. It stores no
passage prose. Quick Access becomes a discriminated persisted union:

- existing `entity` actions retain their entity type, id, label, and local href;
- `knowledge-source` carries source kind/id, section id, heading, and release;
- `knowledge-action` carries a manifest-derived local href and `Open ...` label.

The client parses this union defensively. Invalid or non-local persisted links
are ignored. Source badges use semantic neutral styling and readable labels;
actions retain keyboard focus, route through Next navigation, and carry no hand
cursor override.

Branch ancestry already reads persisted message content and metadata from the
same message rows; branch/reload coverage must demonstrate that no regeneration
or network lookup is needed to render completed-message affordances.

## Failure States

| Name | Trigger | Visible behavior |
|---|---|---|
| `KnowledgeBundleMissingError` | Required bundle file is absent | Current Relay knowledge is unavailable; name release |
| `KnowledgeBundleVersionError` | Bundle and package versions differ | Refuse stale substitution; name both versions internally |
| `KnowledgeBundleSchemaError` | JSON/shape/path/schema is invalid | Refuse retrieval and actions |
| `KnowledgeBundleIntegrityError` | Hash, count, identity, or selected entry mismatches | Refuse retrieval and actions |
| `KnowledgeBundleSizeError` | Manifest, index, or selected entry exceeds cap | Refuse oversized context |
| `KnowledgeNoMatchError` | Intent is help but no record has query signal | Say no verified current answer exists |

Failures are logged server-side with their specific names. User-facing replies
do not expose machine paths or hashes.

## Acceptance Criteria

- [x] Positive and negative intent fixtures prove help injection is bounded and
  does not intercept direct actions, scaffolding, or ordinary support turns.
- [x] Ranking is deterministic, exact API paths win, ties are stable, and the
  three-section/1,200-token budget cannot be exceeded.
- [x] Runtime rejects missing, malformed, stale-version, tampered, oversized,
  unsafe-route, and unknown-schema fixtures without stale fallback.
- [x] All Chat engines receive the identical prompt contract and persist the
  identical knowledge receipt/affordance shape.
- [x] Source badges and `Open ...` actions appear only after completion, survive
  reload and branch context, and invalid persisted routes do not render.
- [x] Existing Quick Access entity actions still render and deduplicate.
- [x] Component tests cover source/action distinction, keyboard-visible links,
  narrow wrapping, and accessible labels; browser checks cover light/dark and
  a 390 px viewport with the system cursor.
- [x] Targeted tests, typecheck, public-boundary/package checks, and a real Chat
  request under `npm run dev` pass without a runtime module-load cycle.

## Completion Evidence — 2026-07-15

- The affected Chat, knowledge, UI, and branch suites passed 475 tests across 57
  files; the focused implementation tranche passed 47 tests before final
  hardening.
- TypeScript, the public-boundary guard, knowledge artifact verifier, npm package
  file contract, and the real runtime-graph check passed.
- A real help request through the running Next.js Chat route reached `done` and
  persisted its named knowledge receipt before the terminal event; temporary
  conversations were removed afterward.
- In-app browser checks proved completed source/action rendering in light and
  dark themes at desktop and 390 px with no horizontal overflow. The UI adds no
  cursor-switching code and leaves cursor behavior to the system/browser.

## Scope Boundaries

### Included

- Deterministic local intent, verified lexical retrieval, prompt grounding,
  provider-neutral persistence, source badges, and safe local actions.
- Restoration of the useful post-answer action pattern from `fc45d07e` using
  current routes and the G-054 artifact contract.

### Not included

- Embeddings, vector databases, full-corpus prompt injection, network search,
  remote documentation, or model-authored navigation.
- Reintroducing `/user-guide`, copying deleted docs, or exposing private source
  paths and authoring metadata.
- A release/version bump, push, publish, or strategy repository commit.

## References

- `features/release-synchronized-knowledge-bundle.md`
- Historical Quick Access commit `fc45d07e`
- Historical User Guide removal commit `e6f532e9`
- `src/components/chat/chat-quick-access.tsx`
- `src/lib/chat/engine.ts`
- Implementation plan: `features/version-aware-relay-chat-help-plan.md`
