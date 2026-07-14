---
title: List-item hover highlight consistency
status: completed
priority: P2
milestone: post-mvp
source: _IDEAS/backlog.md G-052; _IDEAS/triage.md TRIAGE-019; completed G-045
dependencies: [interaction-affordance-consistency]
---

# List-item hover highlight consistency

## Outcome

Dashboard Needs Attention rows, linked Settings-at-a-glance cells, and Tables
list rows use one shared fill-based hover and press treatment. The treatment is
clearly perceptible in both themes without drawing a second outline over a
row's existing divider, radius, or selected-state geometry.

The operating-system/browser cursor remains authoritative. Keyboard focus stays
stronger than hover, and the Tables row selection/open input contract remains
owned by G-047 rather than changing incidentally in this visual correction.

## Current evidence

- Needs Attention rows and linked Settings rail cells opt into the broad
  `data-interactive-surface` contract, whose dark hover adds a cyan inset
  outline that does not match their existing row edges.
- Their local light-theme fills differ (`accent/50` versus `accent/70`).
- Tables list rows inherit the generic table primitive's faint `muted/50` hover
  and do not opt into the stronger interaction treatment at all.
- G-047 records the separate Tables keyboard/select/open decision; this goal
  must not guess that contract.

## Technical approach

- Add one `.interactive-list-item` utility backed by
  `--interaction-hover-surface` and `--interaction-active-surface`, with the
  accepted 160ms ease and the global reduced-motion override.
- Keep `data-interactive-surface` for inventory and dark fill coverage, but add
  `data-interactive-outline="preserve"` to list items whose existing geometry
  must not receive the generic hover/press outline.
- Exclude that explicit opt-out only from the generic rest/hover/press outline
  selectors. Do not exclude it from the shared `focus-visible` ring.
- Apply the same utility and outline-preservation marker to Needs Attention
  links, every linked Settings glance cell including Open, and Tables body rows.
- Preserve nested checkbox event isolation, table selection state, link
  navigation, and all existing geometry.

## Acceptance criteria

- [x] All three representative surfaces use the same token-driven hover fill
  and 160ms ease in light and dark themes.
- [x] Dark hover adds no secondary outline to Needs Attention, Settings rail,
  or Tables list rows; existing dividers, radii, and structural edges remain.
- [x] Active feedback is visibly stronger without adding an outline or motion.
- [x] Focus-visible remains a distinct two-pixel semantic ring on native links
  and nested controls; the change does not claim G-047's unresolved Tables row
  keyboard contract.
- [x] Tables rows highlight on hover while checkbox selection/click isolation
  and single/double-click callbacks remain unchanged.
- [x] Disabled or inert list items receive no hover invitation, nested controls
  retain their existing event isolation, and reduced motion collapses transition
  duration through the existing global policy.
- [x] No hand-cursor utility, declaration, asset, or instruction is introduced.
- [x] Targeted component/style guards and real browser checks pass in light and
  dark themes for all three surfaces, with no page-level horizontal overflow.

## Verification run — 2026-07-14

- 29/29 targeted component and interaction-policy tests pass across the shared
  CSS contract, Needs Attention, Settings glance links, and Tables body rows.
  The Tables regression also preserves checked state, nested checkbox isolation,
  single-click selection, and double-click open callbacks.
- `npx tsc --noEmit` and `npm run validate:tokens` pass.
- Live localhost checks at 1440px found 8 Needs Attention links, 10 linked
  Settings rail items, and 33 Tables rows using the shared list-item contract.
  In light and dark themes, each surface computed the 160ms background/color
  transition, retained no injected rest outline, and resolved the theme-specific
  hover/active tokens from the loaded stylesheet.
- The loaded dark stylesheet excludes `data-interactive-outline="preserve"`
  from transparent-rest, hover-edge, press-duration, and active-edge rules while
  leaving the two-pixel `focus-visible` rule independent. Both `/` and `/tables`
  retained zero page-level horizontal overflow and the browser console remained
  free of warnings and errors.

## Error and rescue registry

| Failure | Impact | Rescue |
|---------|--------|--------|
| global outline removal | cards and controls lose accepted structural hover | require the explicit list-item opt-out marker |
| local hover classes drift again | three surfaces diverge | keep one shared utility and source guard |
| fill masks selected state | table selection becomes ambiguous | retain selected styling precedence and test checkbox state |
| visual fix changes Tables keyboard behavior | G-047 product decision is pre-empted | leave role/tab order/key activation unchanged |
| focus ring removed with hover outline | keyboard location becomes unclear | keep opt-out away from the focus-visible selector and browser-check it |

## Not in scope

- Resolving Tables row role, tab order, single-click selection, double-click
  open, or keyboard activation; G-047 owns that contract.
- Redesigning row geometry, dividers, selection colors, or Settings rail layout.
- Building G-051's broader compiled-CSS state fixture.
- Adding any cursor-switching code or guidance.
