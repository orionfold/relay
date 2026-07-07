---
title: Flagship card polish across pack and primitive surfaces
status: completed
priority: P2
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [packs-first-ia, operational-surface-foundation]
---

# Flagship Card Polish

## Description

Cards are Relay's flagship UI element across Packs, app detail, Blueprints, Profiles, Agents,
Presets, primitive sections, and dashboard-like surfaces. The walkthrough called for richer
badges/icons, stronger subtype identity, subtle motion, responsive content layouts, and polished
light/dark treatment. This pass applies the recipe to the pack browser and app-detail primitive
sections, which were the walkthrough surfaces still missing consistent subtype treatment.

This feature defines and applies a restrained card recipe that keeps operational density while
making pack and primitive cards feel product-grade.

## User Story

As a Relay operator, I want cards to communicate type, status, and action at a glance so that dense
pack surfaces feel polished without becoming decorative or slow to scan.

## Technical Approach

- Audited the committed card primitive support for `tone` and `watermark`, then applied missing
  subtype identity where the walkthrough still read flat.
- Added compact icon wells and `Pack`/`Installed`/`Premium` badges to standard pack cards so they
  match the featured-card identity treatment.
- Added primitive-section headers with icons and count badges for workflow, funnel, gallery,
  chart, and table sections.
- Fixed app-detail header actions to wrap on mobile instead of pushing manifest actions off-canvas.
- Verified `/packs` and `/apps/relay-marketing` on desktop and mobile viewports.

## Acceptance Criteria

- [x] Pack and primitive cards have consistent subtype identity through icon, badge, and metadata
      treatment.
- [x] Cards remain scan-dense and do not nest cards inside cards.
- [x] Hover/click/focus states are visible and consistent across interactive cards.
- [x] Light and dark themes preserve contrast and do not collapse into a one-note palette.
- [x] Desktop and mobile browser screenshots show no text overlap or card content clipping.

## Verification

- Focused tests: `npx vitest run src/components/apps/__tests__/pack-composition-strip.test.tsx src/lib/apps/view-kits/__tests__/workflow-hub.test.ts src/lib/apps/view-kits/__tests__/tracker.test.ts src/lib/apps/view-kits/__tests__/integration/workflow-hub-kit-view.test.tsx` → 34/34 passing.
- TypeScript: `npx tsc --noEmit` passed.
- Codex in-app Browser: `/packs` and `/apps/relay-marketing` rendered with pack badges and the
  `Workflows` primitive section header/count badge.
- OS Chrome Playwright smoke: `/packs` and `/apps/relay-marketing` at 1360×900 and 390×844 all
  reported `overflow: false`; screenshots saved under `output/flagship-card-polish/`.

## Scope Boundaries

**Included:**
- Card visual recipe and application to major pack/primitive surfaces.

**Excluded:**
- IA changes covered by `packs-first-ia`.
- Gallery-specific click contract covered by `gallery-card-interactions`.
- New product functionality.

## References

- `features/packs-first-ia.md`
- `features/operational-surface-foundation.md`
- `design-system/MASTER.md`
