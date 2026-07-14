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

Actionable list rows across Relay—including Chat history, table catalog and
record rows, history/timeline rows, related-record lists, and expandable log or
settings rows—use one shared fill-based hover and press treatment. The treatment
is clearly perceptible in both themes without drawing a second outline over a
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
- Table record rows under `/tables/[id]` use the same primitive but were not
  included in the original representative-route verification.
- Chat history and other native button/`role="button"` rows are included in the
  broad dark interaction selector, so they receive a structural hover outline
  instead of the accepted fill-only list highlight.
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
- Make the shared `TableRow` primitive opt clickable rows into the utility and
  outline-preservation marker while leaving headers, empty states, and other
  static rows inert.
- Apply the same utility and outline-preservation marker to the app-wide
  inventory of full-row list interactions: Chat conversation/branch history,
  inbox queues, document/version/related-record lists, run/firing/log histories,
  expandable iteration/provider rows, and existing dashboard/settings rows.
- Preserve nested checkbox event isolation, table selection state, link
  navigation, and all existing geometry.

## Implementation plan

1. Put clickable/static row classification in `TableRow`, then remove the
   catalog-only opt-in so table catalog and record rows cannot drift.
2. Migrate the audited non-table row inventory to the shared class plus explicit
   fill-only marker, preserving each component's selected, disabled, keyboard,
   nested-control, and navigation behavior.
3. Add component tests for clickable versus static `TableRow`, Chat history
   selection/callback behavior, and a source-level inventory guard for the
   migrated row families.
4. Run targeted tests, TypeScript and token validation, then browser-check the
   supplied `/tables/[id]` route and Chat history in both themes.

### Regression-test budget

- Shared primitive: four assertions for clickable/static classification,
  callback preservation, and caller class merging.
- Chat history: one behavioral test covering active state, selection, and the
  fill-only contract.
- Inventory: one source guard covering every audited full-row family without
  claiming cards, compact controls, menus, or static rows.
- Runtime: representative table-record and Chat-history browser checks in light
  and dark themes, including computed outline/background transition and page
  overflow.

## Acceptance criteria

- [x] All audited app-wide list-row surfaces use the same token-driven hover fill
  and 160ms ease in light and dark themes.
- [x] Dark hover adds no secondary outline to Chat history, Needs Attention,
  Settings rows, table catalog/record rows, or other audited list rows; existing
  dividers, radii, and structural edges remain.
- [x] Active feedback is visibly stronger without adding an outline or motion.
- [x] Focus-visible remains a distinct two-pixel semantic ring on native links
  and nested controls; the change does not claim G-047's unresolved Tables row
  keyboard contract.
- [x] Tables catalog and record rows highlight on hover while checkbox
  selection/click isolation and single/double-click callbacks remain unchanged.
- [x] Disabled or inert list items receive no hover invitation, nested controls
  retain their existing event isolation, and reduced motion collapses transition
  duration through the existing global policy.
- [x] No hand-cursor utility, declaration, asset, or instruction is introduced.
- [x] Targeted component/style guards and real browser checks pass in light and
  dark themes for the supplied table-record route and Chat history, with no
  page-level horizontal overflow.

## Verification run — 2026-07-14

### App-wide correction

- Reproduction on `/tables/cc59ceef-e485-4e17-b8ba-8e520968e1f8` found four
  record rows using the generic `hover:bg-muted/50` primitive with no shared
  list-item marker; Chat history independently used `hover:bg-muted/50` and was
  receiving the dark structural outline through `role="button"`.
- The shared `TableRow` now classifies rows by the presence of `onClick`: all
  four record rows on the supplied route receive the fill-only contract, while
  headers, empty states, previews, audit tables, and other static rows remain
  inert. The generic data table now omits its callback when no row action exists.
- The source inventory migrated 17 full-row interaction instances across 16
  non-table component files, covering conversation/branch history, inbox and
  document/workspace selection, run/log/firing/version/related-record histories,
  expandable iteration/provider rows, and monthly-close history. Cards/tiles,
  compact controls, menus, radio choices, and static rows remain separate.
- 30/30 targeted tests pass, including new shared `TableRow` classification and
  Chat history callback regressions plus the app-wide inventory guard.
  `npx tsc --noEmit`, local token validation, and `git diff --check` pass.
- Live dark/light checks found four supplied-route record rows and seven Chat
  history rows, all marked with the shared class and outline-preservation
  attribute. Both surfaces computed the 160ms background/color transition,
  resolved distinct theme hover/active tokens, retained no injected outline,
  and had zero page-level horizontal overflow. Browser logs contained no
  warnings or errors, and the original dark theme was restored afterward.

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
- Converting cards, tiles, compact toolbar controls, menus, radio choices, or
  static/informational rows into list-item interactions.
- Building G-051's broader compiled-CSS state fixture.
- Adding any cursor-switching code or guidance.
