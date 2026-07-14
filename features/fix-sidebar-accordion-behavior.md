---
title: "Fix: Sidebar App Menus Accordion Behavior"
status: deferred
priority: P2
milestone: post-mvp
source: internal history record
dependencies: [app-runtime-bundle-foundation]
---

# Fix: Sidebar App Menus Accordion Behavior

## Description

App sidebar menus (e.g., Wealth, Growth) are always fully expanded, showing all sub-links at all times. They do not follow the accordion behavior used by ainative's native sidebar groups (Work, Manage, Configure), where expanding one section collapses the others. This wastes vertical space and creates inconsistent UX as more apps are installed.

## User Story

As a user with multiple installed apps, I want the sidebar app menus to follow the same accordion behavior as native sections so that the sidebar stays manageable and consistent.

## Technical Approach

- Extend `expandedGroup` state type from `GroupId | null` to `string | null` to accommodate app IDs alongside native group IDs
- Refactor `InstalledAppGroup` to accept `isExpanded` and `onToggle` props (matching `NavGroup` pattern)
- Add the same visual elements as `NavGroup`: clickable header button, ChevronDown with rotation, grid-rows collapse animation
- Include subtext preview (e.g., table/schedule count) that fades when expanded
- Auto-expand the app group containing the active route on navigation
- Unified accordion: expanding an app group collapses native groups and vice versa

## Acceptance Criteria

- [ ] App sidebar menus collapse/expand on header click
- [ ] Only one group (native or app) is expanded at a time (accordion behavior)
- [ ] Navigating to an app route auto-expands that app's group
- [ ] App group headers show chevron with rotation animation matching native groups
- [ ] Collapsed app groups show subtext preview (item count)
- [ ] Grid-rows transition animation matches native group behavior

## Scope Boundaries

**Included:**
- Accordion behavior for app groups unified with native groups
- Visual parity (chevron, animation, subtext)

**Excluded:**
- Pinnable/multi-expand mode (future enhancement)
- Drag-to-reorder app groups

## References

- Source: `internal history record`
- Related features: app-runtime-bundle-foundation
