---
title: Runtime Capability Matrix
status: completed
priority: P1
milestone: post-mvp
source: ideas/chat-context-experience.md §2.7, §11 (architect)
dependencies: [provider-runtime-abstraction]
---

# Runtime Capability Matrix

## Description

ainative's chat dispatcher routes to three parallel runtime engines (Claude Agent SDK, Codex App Server, Ollama HTTP) that have genuinely uneven capability: Claude and Codex support skills natively with progressive disclosure; Ollama needs ainative-level injection. Claude supports the full filesystem tool suite; Ollama supports none. Today, the chat UI hard-codes a few runtime conditionals and the `engine.ts` dispatcher at `src/lib/chat/engine.ts:152-166` is the only structural abstraction. As Phase 1a/1b/1c land, the number of per-runtime differences will explode (skills, filesystem tools, hooks, TodoWrite, subagents, progressive disclosure) and scattered conditionals will rot quickly.

This feature makes capability **a first-class artifact**: every runtime in `src/lib/agents/runtime/catalog.ts` declares an explicit capability bag (booleans + small enums). Chat UI, task execution, and command popovers all read this bag to decide what to render, what to hide, and what to filter. It is a small, surgical refactor that unblocks clean implementation of Phase 1a/1b/1c, the Q8a skill compatibility filter, and the Q9 capability hint banner.

## User Story

As a ainative engineer adding a new runtime-aware feature, I want one place to declare "runtime X supports capability Y" and have the UI and engine paths react correctly, so I'm not hunting through six files for runtime conditionals every time a vendor ships a new SDK feature.

## Technical Approach

### 1. Capability type

Extend the runtime descriptor in `src/lib/agents/runtime/catalog.ts`:

```typescript
export interface RuntimeCapabilities {
  hasNativeSkills: boolean;         // SDK-provided skill invocation
  hasProgressiveDisclosure: boolean; // skill metadata loaded first, full SKILL.md on demand
  hasFilesystemTools: boolean;      // Read/Grep/Glob/Edit/Write
  hasBash: boolean;
  hasTodoWrite: boolean;
  hasSubagentDelegation: boolean;   // Task tool or Codex multi-agent
  hasHooks: boolean;                // filesystem hook loading
  autoLoadsInstructions: "CLAUDE.md" | "AGENTS.md" | null;
  stagentInjectsSkills: boolean;    // ainative must inject SKILL.md into prompt
}

export interface RuntimeDescriptor {
  id: RuntimeId;
  // ...existing fields
  capabilities: RuntimeCapabilities;
}
```

### 2. Populate per runtime

Initial values per §2.7 of the ideas doc:

| Capability | claude-code | openai-codex-app-server | ollama |
|---|:---:|:---:|:---:|
| hasNativeSkills | true (after 1a) | true (after 1b) | false |
| hasProgressiveDisclosure | true | true | false |
| hasFilesystemTools | true (after 1a) | true via App Server | false |
| hasBash | true (permission-gated) | true | false |
| hasTodoWrite | true (after 1a) | true (App Server todo/*) | ainative MCP only |
| hasSubagentDelegation | false (ainative replaces) | false (ainative replaces) | false |
| hasHooks | false (excluded per Q2) | false | false |
| autoLoadsInstructions | `"CLAUDE.md"` | `"AGENTS.md"` | null |
| stagentInjectsSkills | false | false | true |

Capability values reflect post-Phase-1 state. During the transition, Phase 1a/1b/1c land together with the matching capability flag flip.

### 3. Consumers

- **Popover filtering (`chat-command-namespace-refactor`):** Hide tools/skills whose required capability is false. Drives Q8a filter.
- **Capability hint banner (`chat-command-namespace-refactor`):** Builds the "Features like X, Y, Z… not available on Ollama runtime" subtext automatically from the capability matrix (Q9a).
- **Chat engine dispatch:** `engine.ts`, `codex-engine.ts`, `ollama-engine.ts` read their own capabilities to decide whether to pass `settingSources`, invoke `turn/start` with skill params, or inject via context builder.
- **Task execution:** `claude-agent.ts` reads capabilities to mirror chat behavior (`task-runtime-skill-parity`).
- **Settings onboarding:** `onboarding-runtime-provider-choice` surfaces capability deltas during provider selection.

### 4. DRY `getRuntimeForModel`

`src/lib/agents/runtime/types.ts:98` already maps models to runtime IDs. Add a thin helper `getCapabilitiesForModel(modelId)` that looks up the runtime and returns its capability bag, used by the chat input and settings UI without knowing internal runtime IDs.

### 5. Tests

- Unit test: every runtime in the catalog must declare every capability key (fails if a new key is added and a runtime missed)
- Unit test: Ollama's `stagentInjectsSkills` is true; Claude/Codex are false
- Snapshot test: capability matrix table matches the expected state (catches accidental regressions)

## Acceptance Criteria

- [x] `RuntimeFeatures` type exists in `src/lib/agents/runtime/catalog.ts` with the nine fields above — shipped as a sibling of the pre-existing operational `RuntimeCapabilities` bag to avoid a breaking rename
- [x] All five runtimes declare a complete feature bag (`anthropic-direct` and `openai-direct` use conservative all-false defaults pending direct-API skill-injection design)
- [x] `getFeaturesForModel(modelId)` helper returns the correct bag, with a typed default for unknown models
- [ ] Exhaustiveness test fails when a new capability key is added and any runtime forgets to declare it
- [ ] `chat-command-namespace-refactor` popover and hint banner consume the matrix (no hard-coded runtime conditionals remain in those components)
- [ ] No circular import between `catalog.ts` and higher-level chat modules

## Scope Boundaries

**Included:**
- Capability type + per-runtime declarations
- `getFeaturesForModel` helper
- Exhaustiveness test harness

**Excluded:**
- Actually shipping Phase 1a/1b/1c — capability flags flip when those land, not here
- A UI to edit capabilities at runtime (they are source-of-truth in code)
- Capability negotiation with the vendor SDK (static declarations are enough for now)

## References

- Source: `ideas/chat-context-experience.md` §2.7 (capability matrix), §11 (architect's drift concern)
- Depends on: `provider-runtime-abstraction` (existing)
- Consumers: `chat-claude-sdk-skills`, `chat-codex-app-server-skills`, `chat-ollama-native-skills`, `chat-command-namespace-refactor`, `task-runtime-skill-parity`, `onboarding-runtime-provider-choice`
- Existing code: `src/lib/agents/runtime/catalog.ts`, `src/lib/agents/runtime/types.ts:98`
- Implementation: commits `98681bf` → `9a07da5` (plan: `internal implementation plan`). Added `RuntimeFeatures` sibling to the existing operational `RuntimeCapabilities` bag (rather than renaming) to avoid collateral damage across ~7 consumer files.
- Smoke test (2026-04-13): curled `GET /api/chat/models` against the running dev server — 2.44s cold-compile response, HTTP 200, valid JSON payload. Exercises the modified module chain (`chat/types.ts` → `agents/runtime/catalog.ts` → `agents/runtime/index.ts`) at first request after file changes, which is where a TDR-032 module-load cycle would surface. No `ReferenceError` observed. Runtime catalog loads cleanly with the new `features` field on all five runtimes.
