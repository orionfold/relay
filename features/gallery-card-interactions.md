---
title: Gallery card interactions — thumbnails, click contract, and row focus
status: planned
priority: P1
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [pack-web-designer]
---

# Gallery Card Interactions

## Description

The Web Designer walkthrough found that `Page sections` and `Asset gallery` cards render blank
media slots and have inconsistent click behavior. Some cards look clickable because their content
contains CTA links; other cards do nothing. That makes the flagship Web Designer surface feel
unfinished and ambiguous.

This feature defines the card contract for gallery-backed app detail sections. Cards should either
show meaningful thumbnails or omit the media slot entirely, and interaction should be consistent:
clicking a row card must have a clear destination such as opening the row sheet, focusing the
matching preview section, or exposing explicit controls only.

## User Story

As a pack operator, I want gallery cards to show useful visual signals and behave consistently so
that I can understand and edit pack-owned rows without guessing what is clickable.

## Technical Approach

- Audit `GalleryPreviewView` and app-detail row/card rendering for media-slot assumptions.
- Add thumbnail derivation for Web section and asset rows where image/role data exists.
- Hide empty media frames when no meaningful thumbnail exists.
- Pick and implement one card-click contract for section rows and asset rows.
- Preserve keyboard access, visible focus, and explicit link semantics.
- Add UI tests for cards with thumbnail, without thumbnail, and with CTA text inside row content.

## Acceptance Criteria

- [ ] Gallery cards never show blank decorative thumbnail frames.
- [ ] Cards with available images or generated previews show meaningful thumbnails.
- [ ] Cards without images use a compact text-first layout.
- [ ] `Page sections` cards have one documented click behavior and expose it consistently.
- [ ] Keyboard users can reach the same action with visible focus state.
- [ ] CTA links inside row content do not create mixed accidental card navigation.

## Scope Boundaries

**Included:**
- Web Designer `Page sections` and `Asset gallery` cards.
- Shared gallery card contract if the component is reusable.

**Excluded:**
- Full app-wide card redesign.
- Generated visual thumbnails for every possible pack type.

## References

- `features/pack-web-designer.md`
- `output/operator-walkthrough-feedback-2026-07-07.md`
