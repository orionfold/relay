---
title: Fix app-detail row cache invalidation after API updates
status: completed
priority: P1
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [tables-data-layer, composed-app-view-shell, pack-web-designer]
---

# Fix App-Detail Row Cache Invalidation

> Built 2026-07-07. Table row add/update/delete API mutations now revalidate the
> scoped `app-runtime:<appId>` cache tags for apps that own the changed table,
> no-op row updates skip cache churn, and the publish panel marks stored preview
> artifacts stale when their source-row fingerprint no longer matches current
> rows.

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

- [x] Updating an app-owned table row is reflected in the app detail route without manual
      cache-busting reload.
- [x] Existing preview artifacts become visibly stale when source rows change.
- [x] Gallery cards and publish inputs read the same fresh row data.
- [x] Cache invalidation is scoped to affected app/table data, not a global full reload.
- [x] Tests cover row update, stale preview marking, and no-op updates.

## Verification

- `npm test -- 'src/app/api/tables/[id]/rows/[rowId]/__tests__/route.test.ts' 'src/app/api/apps/[id]/preview/__tests__/route.test.ts' src/lib/publishers/__tests__/app-publish.test.ts src/components/apps/__tests__/app-publish-panel.test.tsx`
- `npx tsc --noEmit`

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
