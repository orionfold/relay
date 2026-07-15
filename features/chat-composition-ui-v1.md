---
title: Chat — Skill Composition UI v1 (Skills-tab + Add)
status: completed
priority: P1
milestone: post-mvp
source: Historical dogfood session 2026-04-14, observation 1
dependencies:
  - chat-skill-composition
  - chat-command-namespace-refactor
---

# Chat — Skill Composition UI v1

## Description

Phase 2 shipped skill composition as a chat-tool API only: no UI, no `+ Add` button, no conflict modal. Dogfood evidence shows the feature is effectively undiscoverable without a UI — a non-engineer would need to ask an LLM to call `activate_skill mode:"add"` or edit SQLite directly. This is the top-ranked blocker for adoption of the already-shipped composition runtime.

This feature lifts the `chat-skill-composition` spec's v2-deferred UX into a discrete v1 UI surface. It does NOT change the runtime contract established in Phase 2.

## User Story

As a power user on Claude who has activated one skill for a conversation, I want to add a second skill by clicking `+ Add` in the Skills tab — with a clear inline modal if the two skills have conflicting directives — so I can compose `researcher` + `technical-writer` without reading any docs or calling MCP tools by hand.

## Technical Approach

### Skills tab enhancements

Modify `src/components/chat/chat-command-popover.tsx` in the `/skills` tab render:

- Currently-active skills (derived from `conversations.activeSkillId` + `activeSkillIds[]`, merged via `mergeActiveSkillIds`) render a compact "active" badge at the right of their row with a hover-revealed `×` to deactivate (calls existing `deactivate_skill` tool).
- Inactive skills on composition-capable runtimes render a compact `+ Add` pill at the right of their row. Hidden on `ollama` with tooltip "Single skill only on Ollama — switch runtime to compose".
- An active-count indicator at the top of the tab: "N of M active" using `features.maxActiveSkills` from the runtime catalog.

### Add flow

Clicking `+ Add` calls `activate_skill` with `mode: "add"`. Three outcomes:

1. **Success** — refresh active badges; close popover; show a brief "toast" via existing toast pattern ("Added <skill> — 2 skills active").
2. **Conflict response** (`{ requiresConfirmation: true, conflicts: [...] }`) — render inline `SkillCompositionConflictDialog` with excerpts from each conflict, an "Add anyway" button (re-calls with `force: true`), and "Cancel". Dialog uses the existing shadcn `Dialog` component, not a custom component.
3. **Error** (capacity, Ollama, unknown runtime) — toast the error string from the tool. No modal.

### Data flow for "is this skill active?"

The popover already reads `enrichedSkills` via `useEnrichedSkills(open && mode === "slash")`. Extend the query to also pull the current conversation's merged active skill IDs. Either:

- Add a new hook `useActiveSkills(conversationId)` that fetches `GET /api/conversations/:id` once on popover-open and returns `{ activeIds: string[], runtimeId: string, maxActive: number }`, OR
- Pipe the current-conversation state down from the chat root component via the existing chat-context provider.

Prefer the hook (isolated, reusable in other surfaces that may need the same state later).

### Acceptance criteria

- [x] `/skills` popover tab renders a `+ Add` button on each inactive skill for Claude/Codex/direct runtimes
- [x] `+ Add` on Ollama is rendered in disabled state (capability gate via `useActiveSkills`)
- [x] Active skills show an "active" badge + deactivate button (delegates to `/api/chat/conversations/[id]/skills/deactivate`)
- [x] Active-count indicator renders "N of M active" at top of Skills tab; `+ Add` hidden/disabled when N === M
- [x] Adding a compatible skill succeeds with a toast via sonner
- [x] Adding a conflicting skill opens `SkillCompositionConflictDialog`; "Add anyway" retries with `force: true`
- [x] Dialog's "Cancel" leaves state unchanged
- [x] HTTP smoke verifies replace → add+force → merged state → deactivate end-to-end against live dev server
- [ ] Keyboard accessibility (Tab focus, Esc dismiss) — inherits from shadcn Dialog; not separately verified

## Scope Boundaries

**Included:**
- Skills-tab `+ Add` action (inactive skills)
- Deactivate action on active skills (reuse existing `deactivate_skill`)
- Conflict dialog (new component, shadcn Dialog)
- Active-count indicator
- Runtime-gated disable state on Ollama

**Excluded:**
- Token-budget oldest-first trim (remains deferred — separate v2 of `chat-skill-composition`)
- Reordering composed skills
- Per-skill override of `maxActiveSkills`
- Composition presets (saved combinations)
- Composing across conversations

## References

- Observation source: historical dogfood session 2026-04-14, proposal 1 (session output intentionally not retained)
- Runtime contract: `chat-skill-composition.md` (v1 shipped)
- UI scaffold: `src/components/chat/chat-command-popover.tsx`
- Conflict heuristic (already shipped): `src/lib/chat/skill-conflict.ts`
- Capability flags (already shipped): `src/lib/agents/runtime/catalog.ts` (`supportsSkillComposition`, `maxActiveSkills`)
