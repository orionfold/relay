---
title: "Fix: Sidebar Reactive Update After App Install"
status: deferred
priority: P1
milestone: post-mvp
source: internal history record
dependencies: [app-runtime-bundle-foundation]
---

# Fix: Sidebar Reactive Update After App Install

## Description

When a marketplace app is installed, its sidebar menu entry does not appear until the user manually refreshes the page. The sidebar fetches installed app data from `/api/apps/sidebar` on mount only (empty useEffect dependency array). After `installApp()` inserts a new DB record, nothing triggers a re-fetch.

## User Story

As a user who installs an app from the marketplace, I want the app to immediately appear in the sidebar so that I know the installation succeeded and can start using it.

## Technical Approach

- In `src/components/shared/app-sidebar.tsx`, add `pathname` to the useEffect dependency array that fetches `/api/apps/sidebar` (line 282)
- This causes a re-fetch on any navigation, including the `router.push()` that happens after install completes
- No event bus, SWR, or custom pub/sub needed — leverages existing Next.js router navigation
- Consistent with Calm Ops: app appears naturally, no highlight animation

## Acceptance Criteria

- [ ] After installing an app, its sidebar entry appears without a full page refresh
- [ ] Sidebar re-fetches app data on route navigation
- [ ] No unnecessary re-fetches when pathname hasn't changed (React deduplication handles this)
- [ ] Existing sidebar behavior for native groups is unaffected

## Scope Boundaries

**Included:**
- Reactive sidebar update via pathname-triggered re-fetch

**Excluded:**
- Optimistic UI updates before DB write completes
- WebSocket/SSE-based real-time sidebar updates
- Highlight animation for newly installed apps

## References

- Source: `internal history record`
- Related features: app-runtime-bundle-foundation, fix-exported-bundle-registration
