---
title: Learned Context UX Completion
status: completed
priority: P2
milestone: post-mvp
layer: UI Enhancement
dependencies:
  - agent-self-improvement
  - agent-profile-catalog
---

# Learned Context UX Completion

## Summary

Close the remaining user-facing gaps from the `agent-self-improvement` browser evaluation without reopening the completed base feature. This follow-up finishes the promised diff-view experience in learned context history, makes rollback and snapshot states easier to read, and ensures the `sweep` profile is discoverable through deterministic profile ordering.

## Problem

The underlying learned-context system shipped successfully, but the current UI does not yet match the full feature contract. The version timeline shows raw snapshot summaries rather than a true diff, rollback entries do not make the restored state obvious enough, and profile browse order depends on unsorted registry output. These gaps are small individually, but together they leave the feature feeling less complete than the shipped behavior underneath it.

This work should remain bounded. The report also mentioned cleanup tooling and additional enhancement ideas, but those are admin/testing concerns or optional follow-ons, not blockers for the user-facing learned-context flow.

## User Story

As a user reviewing agent learning history, I want to see exactly what changed between context versions and quickly understand what a rollback restored, so I can supervise learned context confidently without leaving the profile screen.

As a user browsing profiles, I want built-in profiles like `sweep` to appear in a predictable alphabetical order, so discoverability does not depend on filesystem ordering.

## Solution

### Learned Context Timeline

- Derive a unified inline diff in the client from the existing version history returned by `GET /api/profiles/[id]/context`
- Compare each snapshot-bearing version (`approved`, `rollback`, `summarization`) against the nearest earlier snapshot version
- Treat the first approved snapshot as an all-added diff
- Show the stored snapshot content directly for approved, rollback, and summarization rows so the restored state is visible without reading raw metadata
- Keep proposal and rejection rows lightweight, using their existing change summary content

### Profile Ordering

- Sort profile collections alphabetically by display name before rendering the profile browser
- Return `/api/profiles` in the same deterministic order so browser refreshes and client consumers stay aligned

## Acceptance Criteria

- [ ] Learned-context history includes a unified inline diff toggle for approved, rollback, and summarization versions
- [ ] The first snapshot version renders as all-added content in the diff view
- [ ] Rollback entries show the restored snapshot content directly in the timeline
- [ ] Version count uses correct singular/plural grammar
- [ ] Badge rendering remains driven by `changeType` for all timeline rows
- [ ] `/profiles` shows profiles in deterministic alphabetical order by display name
- [ ] `GET /api/profiles` returns profiles in deterministic alphabetical order by display name
- [ ] No reset/delete endpoint is added as part of this slice

## Scope Boundaries

### In Scope

- Learned-context diff rendering derived from existing API data
- Timeline clarity improvements for snapshot rows
- Deterministic profile ordering
- Regression coverage for badge rendering and version labeling

### Out of Scope

- `DELETE /api/profiles/[id]/context` or any learned-context reset flow
- Editing context proposals directly from the compact ambient approval toast
- Additional size-bar warning tiers
- Reworking the learned-context storage model or API contract

## Technical Approach

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/utils/learned-context-history.ts` | Create | Derive snapshot previews and unified diffs from version history |
| `src/components/profiles/learned-context-panel.tsx` | Modify | Add diff toggle, clearer snapshot previews, grammar fix |
| `src/lib/agents/profiles/sort.ts` | Create | Shared alphabetical profile ordering helper |
| `src/app/profiles/page.tsx` | Modify | Render the profile browser with deterministic ordering |
| `src/app/api/profiles/route.ts` | Modify | Return profile data in deterministic ordering |

## References

- **Origin**: internal Agent Self-Improvement E2E Report
- **Builds on**: [agent-self-improvement](agent-self-improvement.md)
- **Builds on**: [agent-profile-catalog](agent-profile-catalog.md)
