---
title: Flagship card polish across pack and primitive surfaces
status: planned
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
light/dark treatment. This should be a systematic polish pass, not one-off decorative tweaks.

This feature defines and applies a restrained card recipe that keeps operational density while
making pack and primitive cards feel product-grade.

## User Story

As a Relay operator, I want cards to communicate type, status, and action at a glance so that dense
pack surfaces feel polished without becoming decorative or slow to scan.

## Technical Approach

- Audit card variants across Packs, app detail primitives, Blueprints, Profiles, Agents, Presets,
  Apps, and dashboard surfaces.
- Define card recipes by subtype: pack, workflow, schedule, table, profile, blueprint, preset,
  publish/deployment, gallery row.
- Add subtype badges/icons, subtle watermarks, restrained gradients, hover/click motion, and
  responsive layout rules using existing semantic tokens.
- Keep card radii, density, keyboard focus, and light/dark contrast aligned with the design system.
- Verify common cards on desktop and mobile viewports.

## Acceptance Criteria

- [ ] Pack and primitive cards have consistent subtype identity through icon, badge, and metadata
      treatment.
- [ ] Cards remain scan-dense and do not nest cards inside cards.
- [ ] Hover/click/focus states are visible and consistent across interactive cards.
- [ ] Light and dark themes preserve contrast and do not collapse into a one-note palette.
- [ ] Desktop and mobile browser screenshots show no text overlap or card content clipping.

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
