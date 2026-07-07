---
title: Packs-first IA — reconcile Apps, Packs, and pack-owned primitives
status: planned
priority: P1
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [nav-redesign-ia, pack-bundle-model, composed-app-view-shell]
---

# Packs-First IA

## Description

The walkthrough made the Apps/Packs split confusing: `/packs` shows bundled templates and install
state, while `/apps` shows installed/materialized manifests. The operator direction is to present
the product as Packs-first. That means top navigation, app-builder copy, pack detail shell, and
primitive disclosure need one coherent information architecture instead of "Apps" and "Packs"
competing as separate concepts.

This feature keeps the underlying installed-app machinery, but reframes the user-facing surface:
Packs are the product object, installed pack instances are opened from the Packs surface, and the
detail shell explains owned primitives through clear sections.

## User Story

As a Relay operator, I want Packs to be the main surface so that I understand what is bundled,
installed, editable, and runnable without learning an Apps-vs-Packs distinction.

## Technical Approach

- Audit nav labels, `/apps`, `/packs`, Chat/app-builder copy, empty states, and docs for app/pack
  terminology.
- Decide whether URL migration is needed now or whether labels can change first while preserving
  route compatibility.
- Move top-level product language toward Packs and pack instances.
- Add pack-owned table disclosure in the detail shell with expandable table summaries and links to
  table/data views.
- Split primitive groups into section-specific layouts: Workflows, Schedules, Tables, Profiles,
  Publish, Gallery, and other declared primitives.
- Move workflow `1-2-3` explanation into the Workflows section.
- Reset scroll/focus to the pack heading when entering a pack detail route.

## Acceptance Criteria

- [ ] Primary navigation and Chat/app-builder copy use Packs-first language.
- [ ] Users can distinguish bundled, installed, locked, and openable packs without inspecting code.
- [ ] Pack detail shell lists owned tables with expandable summaries and drill-through links.
- [ ] Primitive types render in separate sections with section-appropriate card dimensions.
- [ ] App/pack detail route entry resets scroll and focuses or anchors the heading predictably.
- [ ] Existing `/apps/*` deep links remain compatible or redirect with no data loss.

## Scope Boundaries

**Included:**
- IA, labels, detail shell grouping, owned-table disclosure, route-entry focus behavior.

**Excluded:**
- Rewriting pack install/storage internals.
- New pack distribution mechanics.
- Full visual card redesign across every product surface; see `flagship-card-polish`.

## References

- `features/nav-redesign-ia.md`
- `features/composed-app-view-shell.md`
- `output/operator-walkthrough-feedback-2026-07-07.md`
