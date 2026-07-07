---
title: Fix app-detail row cache invalidation after API updates
status: planned
priority: P1
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [tables-data-layer, composed-app-view-shell, pack-web-designer]
---

# Fix App-Detail Row Cache Invalidation

## Description

During the Web Designer walkthrough, API row updates sometimes required a cache-busting reload
before the app detail UI or generated preview reflected changes. App-owned table rows are now part
of pack detail screens, preview generation, and publish approval, so stale row state can cause users
to approve the wrong content.

This feature makes row updates invalidate the app-detail data paths that render gallery cards,
owned primitive sections, and preview/publish inputs.

## User Story

As a Web Designer operator, I want row edits to appear immediately in the app detail and preview
flow so that the page I publish reflects my latest table changes.

## Technical Approach

- Trace row update routes and the app detail data loaders for cached server reads.
- Identify whether stale state comes from `unstable_cache`, router cache, client state, preview
  artifact reuse, or app registry cache.
- Emit or reuse an app/table changed event after successful row mutations.
- Invalidate affected app-detail, table, gallery, and preview source fingerprints.
- Add tests for row update → app detail refresh and row update → stale preview state.

## Acceptance Criteria

- [ ] Updating an app-owned table row is reflected in the app detail route without manual
      cache-busting reload.
- [ ] Existing preview artifacts become visibly stale when source rows change.
- [ ] Gallery cards and publish inputs read the same fresh row data.
- [ ] Cache invalidation is scoped to affected app/table data, not a global full reload.
- [ ] Tests cover row update, stale preview marking, and no-op updates.

## Scope Boundaries

**Included:**
- Row mutation invalidation for app-owned table data and preview source freshness.

**Excluded:**
- Rebuilding the table editor.
- Live collaborative editing.

## References

- `features/publish-preview-artifacts.md`
- `features/pack-web-designer.md`
- `output/operator-walkthrough-feedback-2026-07-07.md`
