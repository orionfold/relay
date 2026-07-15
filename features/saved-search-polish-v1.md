---
title: Saved Search Polish v1 — Clean filterInput + Cross-Component Revalidation
status: completed
priority: P2
milestone: post-mvp
source: Historical dogfood session 2026-04-14, observations 2-3
dependencies:
  - chat-pinned-saved-searches
---

# Saved Search Polish v1

## Description

Two small polish items from dogfood observations on the already-shipped `chat-pinned-saved-searches` v2. Bundled because both are one-file fixes that address real friction surfaced during real use.

## Technical Approach

### Bug #1 — `SaveViewFooter` captures mention prefix in `filterInput`

When a user types `@task: #priority:high` and saves the view, the persisted `filterInput` is stored as `task: #priority:high`. The `@` is stripped by the outer regex but the `task: ` prefix leaks into storage.

**Symptom:** the palette's "Saved searches" row shows cruft like `task: #priority:high` in the filter column, and re-applying the search to a list page passes `?filter=task: %23priority:high` (functional but ugly).

**Root cause:** `chat-command-popover.tsx` passes `filterInput: query` to `<SaveViewFooter>`, where `query` is the raw popover input including the mention trigger prefix.

**Fix:** rebuild `filterInput` from `parsed.clauses` + `parsed.rawQuery` inside the SaveViewFooter call site, discarding anything that preceded the first `#`:

```tsx
const cleanFilterInput = [
  ...parsed.clauses.map((c) => `#${c.key}:${c.value}`),
  ...(parsed.rawQuery ? [parsed.rawQuery] : []),
].join(" ");
```

Pass `cleanFilterInput` instead of `query`. Regression test: assert the persisted `filterInput` contains no `:` not immediately preceded by `#`.

### Bug #2 — `useSavedSearches` state doesn't revalidate across hook instances

The chat popover and the `⌘K` command palette each call `useSavedSearches()` independently. Saving a search in the popover (optimistic update) updates THAT hook's state, but the palette's hook fetched once on mount and stays stale until page reload.

**Fix (cheapest):** in `src/components/shared/command-palette.tsx`, add a `refetch()` method to `useSavedSearches` and call it from `CommandDialog`'s `onOpenChange` handler when transitioning closed → open.

Expose refetch from the hook:

```typescript
interface UseSavedSearchesReturn {
  searches: SavedSearch[];
  loading: boolean;
  save: (entry: Omit<SavedSearch, "id" | "createdAt">) => SavedSearch;
  remove: (id: string) => void;
  forSurface: (surface: SavedSearchSurface) => SavedSearch[];
  refetch: () => Promise<void>;                         // new
}
```

## Acceptance Criteria

- [x] Saving `@task: #priority:high` produces a persisted record with `filterInput = "#priority:high"` (no `task: ` prefix)
- [x] Saving `@task: foo #priority:high` produces `filterInput = "#priority:high foo"` — clause order + free text preserved
- [x] Regression tests assert no mention-trigger cruft (7 unit tests in `src/lib/chat/__tests__/clean-filter-input.test.ts`)
- [x] Saving in the chat popover, then opening `⌘K` triggers a refetch so new saved search appears in palette's Saved group without page reload
- [x] Palette-open refetch fires only on closed→open transition (not on every keystroke)
- [x] Hook backwards-compatible — `refetch` is an additional field; consumers that didn't call it still work (pins-hook pattern preserved)

## Scope Boundaries

**Included:**
- `filterInput` sanitization at the popover call site
- `refetch` exposure on the hook + invocation from palette on open
- Regression tests for both

**Excluded:**
- Per-saved-search rename/delete CRUD (future v2)
- Cross-tab revalidation (future)
- Migration of existing saved searches with cruft (users can re-save; cruft is cosmetic)

## References

- Observation source: historical dogfood session 2026-04-14, proposals 2 and 3 (session output intentionally not retained)
- Shipped feature: `chat-pinned-saved-searches.md` (v2 completed)
- Affected files: `src/components/chat/chat-command-popover.tsx`, `src/components/shared/command-palette.tsx`, `src/hooks/use-saved-searches.ts`
