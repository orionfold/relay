---
title: Playbook Documentation
status: removed
priority: P2
milestone: post-mvp
source: conversation/2026-03-17-playbook-docs
removed-note: >-
  In-app User Guide deleted in Phase C (commit e6f532e9): the /user-guide route,
  playbook components, and DB-backed docs loader were removed. Documentation
  generation now lives outside this repo and reads the product repo read-only.
  Spec retained as a historical record of what shipped.
dependencies:
  - app-shell
  - command-palette-enhancement
---

# Playbook Documentation

## Description

Built-in documentation system at `/playbook` that surfaces product guides, workflow tutorials, and best practices directly inside the ainative UI. The system is usage-stage-aware — it adapts content prominence based on where the user is in their adoption journey (onboarding → active → advanced). Includes an adoption heatmap showing feature discovery progress, journey cards for guided walkthroughs, full markdown rendering, table of contents navigation, and command palette integration for quick doc access.

## User Story

As a ainative user, I want to access contextual product documentation without leaving the app, so I can learn features progressively and reference workflows at the point of need.

As a power user, I want the docs to reflect my adoption stage so that beginner content fades and advanced guides surface as I grow into the product.

## Technical Approach

### Content Infrastructure

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/docs/reader.ts` | Create | Markdown file reader with frontmatter parsing for playbook pages |
| `src/lib/docs/adoption.ts` | Create | Adoption stage tracking — maps feature usage to onboarding/active/advanced tiers |
| `src/lib/docs/journey-tracker.ts` | Create | Tracks user progress through guided journey sequences |
| `src/lib/docs/usage-stage.ts` | Create | Utility for determining current usage stage from activity signals |

### UI Components

| File | Action | Purpose |
|------|--------|---------|
| `src/components/playbook/playbook-browser.tsx` | Create | Main playbook index page with category navigation |
| `src/components/playbook/playbook-card.tsx` | Create | Card component for individual playbook entries |
| `src/components/playbook/journey-card.tsx` | Create | Guided journey step card with progress indicator |
| `src/components/playbook/adoption-heatmap.tsx` | Create | Visual heatmap of feature adoption coverage |
| `src/components/playbook/playbook-toc.tsx` | Create | Table of contents sidebar for long-form playbook pages |

### Routes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/playbook/page.tsx` | Create | Playbook index route |
| `src/app/playbook/[slug]/page.tsx` | Create | Individual playbook detail route |

### Integration

- Command palette registers playbook pages as searchable items
- App sidebar includes Playbook navigation entry
- Adoption heatmap pulls from existing feature usage signals

## Acceptance Criteria

- [x] `/playbook` route renders the playbook browser with categorized documentation cards
- [x] Individual playbook pages render full markdown with GFM support
- [x] Table of contents generates from heading structure and supports click-to-scroll
- [x] Adoption heatmap visualizes feature discovery progress across product areas
- [x] Journey cards show guided walkthrough sequences with completion state
- [x] Usage-stage awareness adjusts content prominence (beginner content demoted for advanced users)
- [x] Command palette includes playbook pages in search results
- [x] App sidebar includes Playbook navigation link

## Scope Boundaries

### In Scope

- Playbook content rendering and navigation
- Adoption heatmap and journey tracking
- Usage-stage-aware content ordering
- Command palette integration
- Markdown rendering with GFM

### Out of Scope

- User-editable documentation (read-only built-in content)
- External documentation hosting or CMS integration
- Video or interactive tutorial embeds
- Per-user progress persistence across devices

## References

- **Commits**: `1864f1c` (initial system), `cfab4f2` (workflow kanban integration)
- **Depends on**: [app-shell](app-shell.md), [command-palette-enhancement](command-palette-enhancement.md)
