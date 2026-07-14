---
title: Interaction affordance consistency
status: in-verification
priority: P2
milestone: post-mvp
source: _IDEAS/backlog.md G-045; _IDEAS/triage.md TRIAGE-012
dependencies: [app-shell, ux-gap-fixes]
---

# Interaction affordance consistency

## Outcome

Enabled buttons, links, icon actions, interactive rows, and clickable cards use
one truthful hand-pointer policy. Dark-theme contained controls have clearly
perceptible hover/press feedback while the already-acceptable light theme stays
regression-free and keyboard focus remains at least as strong.

## What already exists

- The shared primitives and the global semantic-interaction policy now declare
  an enabled hand cursor across buttons, links, tabs, menu items, switches, and
  selectable controls. A versioned Lucide Pointer cursor asset avoids the
  platform-dependent rendering of the CSS `pointer` keyword.
- Flagship clickable cards already use pointer cursors, raised shadows, and a
  small hover translation; dense screens also contain one-off hover classes.
- Text links normally inherit the browser's pointer behavior, while custom
  `role=button` and full-row interactions vary by component.
- The design system already defines `accent`, `border`, `border-strong`, focus
  ring, raised-shadow, and reduced-motion tokens.

## Verification gate

The enabled-pointer policy and the dark-theme fill-plus-edge vocabulary are
accepted directions. Completion still requires the operator to confirm the
native result in both Chrome and Safari after the clean restart.

| Treatment | Hover signal | Tradeoff |
|-----------|--------------|----------|
| A — contrast fill | stronger semantic fill | quietest; can remain ambiguous on dense dark surfaces |
| B — fill + structural edge | stronger fill plus border/edge; link color/underline | recommended; clear without motion and aligned to Relay's border-centric system |
| C — fill + lift | fill plus shadow/translation | strongest, but adds motion and operational noise |

```text
rest ──hover──> perceptible hover ──press──> active
  │                 │
  └──keyboard────> focus ring (equal or stronger)
disabled/inert ──> no pointer claim and no hover invitation
```

## Failed approaches retained for diagnosis

- Adding `cursor-pointer` only to individual primitives produced partial,
  screen-dependent coverage and missed semantic links, nested paint nodes, and
  one-off interaction surfaces.
- A global semantic `cursor: pointer !important` policy, including descendant
  selectors, still rendered the normal arrow in native Safari; computed CSS was
  correct, so repeating utility and specificity changes could not solve it.
- A generated `button::after` hit surface and forced button positioning did not
  change Safari's cursor and collided with component-owned pseudo-elements such
  as tab indicators and the sidebar resize rail. It was removed.
- Clearing `.next`, restarting the server, hard-refreshing Chrome/Safari, and
  testing both browser families did not make the `pointer` keyword render as a
  hand. An isolated native control page proved this machine maps that keyword
  to an arrow while other cursor keywords render normally.
- The first custom cursor path was requested during hot reload before the file
  existed and returned 404; Safari retained the fallback on some controls. The
  production asset now uses a new versioned URL so a stale negative cache entry
  cannot survive.
- Ordinary dark-theme accent shifts were too close to the surrounding charcoal
  surface. Light theme was not part of that contrast defect.

## Implementation and remaining verification

- The enabled hand-pointer policy is applied to semantic roots and their painted
  descendants; disabled and inert subtrees reset to the normal cursor. This is
  intentionally stricter than relying on cursor inheritance from a parent.
  The cursor uses a versioned image-backed Lucide Pointer with the standards
  `pointer` fallback because the platform keyword alone is not reliable on the
  operator's Safari configuration. Component-owned pseudo-elements remain
  untouched.
- The decorative first-render boot veil never participates in pointer
  hit-testing, so controls underneath remain the cursor source during its fade.
- Dark-mode contained controls and interactive surfaces use a stronger tokenized
  fill plus cyan structural edge; press strengthens the surface and edge.
  Light-mode hover and text-only top navigation keep their accepted treatment.
- Audit non-semantic clickable cards/rows before screen-local exceptions; their
  explicit pointer contract should accompany correct keyboard semantics.
- The independent audit split the broader semantic/keyboard debt to G-047. It
  changes DOM roles and activation behavior (including the Tables select/open
  contract), while this feature remains responsible for truthful visual states
  and focus treatment on elements that are already interactive.
- Preserve distinct active, disabled, focus-visible, nested-action, and
  reduced-motion behavior; do not infer clickability from visual containment.
- Repair only representative one-off interactions not covered by a shared
  primitive, then add a class-contract regression inventory.

## Acceptance criteria

- [x] The operator approves the hand policy and dark-theme fill-plus-edge scope.
- [ ] Native hand pointer is visibly confirmed by the operator on enabled
  buttons, links, icon actions, rows, and cards in Chrome and Safari; inputs,
  disabled controls, and inert surfaces retain the normal cursor.
- [x] Hover is clearly perceptible in dark theme without relying on decorative
  motion; light theme remains regression-free.
- [x] Focus-visible feedback is at least as strong as hover, and active state is
  distinguishable from both.
- [x] Nested actions do not make disabled or non-navigable descendants claim the
  parent interaction.
- [x] Component/class-contract tests cover shared primitives and representative
  main-content/top-right-toolbar consumers.
- [ ] Browser-computed cursor and before/hover/focus screenshots pass on
  dashboard, detail, table, workflow, and settings surfaces in both themes.
- [x] Keyboard, disabled, nested-action, and reduced-motion regressions pass.
- [x] Inert telemetry cells remain visually inert; only linked telemetry cells
  receive the hand, dark hover fill, and structural edge.

## Verification evidence

The current native captures, root-cause record, cold-start checks, and remaining
operator gate are consolidated in
`output/interaction-audit/2026-07-13/README.md`. These artifacts support review
but do not replace the explicit operator confirmation required above.

An independent 2026-07-13 web-preview pass reproduced an inert-cell false
affordance, narrowed every telemetry hover/active selector to
`[data-telemetry-card][href]`, and confirmed the corrected inert/linked states.
A fresh review then reproduced a disabled Button retaining enabled hover styles,
plus over-broad label cursors, incomplete inert/focus coverage, and destructive
menu color drift. The shared state guards and primitive variants now close those
gaps. A final subtree/polymorphism pass also closed inert/ARIA/data-disabled
ancestor leakage, disabled destructive-menu hover, enabled selectable-label
cursor loss, and `Button asChild` Link hover/disabled-anchor drift. Web preview
confirms disabled before/after styles are identical, text inputs retain the
I-beam, disabled subtrees remain neutral, adjacent selectable labels and enabled
Link buttons retain the hand, and enabled controls retain the fill/edge
treatment. The targeted interaction/telemetry suite now passes 43/43 tests. The
audit also recorded the remaining source-test
limitation as TRIAGE-018 and split composite keyboard semantics to TRIAGE-017 /
G-047.

## Error & Rescue Registry

| Failure | Impact | Rescue |
|---------|--------|--------|
| blanket pointer selector | inert/disabled surfaces lie about clickability | scope pointer rules to enabled interactive primitives and explicit roles |
| stronger fill collapses in dark mode | hover remains unnoticed | pair fill with the approved structural signal and dark semantic tokens |
| hover outranks focus | keyboard users lose location | retain explicit focus ring and verify computed styles/screenshots |
| parent card leaks pointer to nested disabled action | child appears actionable | stop pointer styling at the nested control and test event isolation |
| motion used as the only signal | reduced-motion state loses hover | make color/edge sufficient; motion, if any, stays nonessential |
| one-off repair drifts later | inconsistency returns | prefer shared primitives and retain representative contract tests |

## NOT in scope

- New navigation, information architecture, control placement, or card families.
- Blanket cursor styling for every element with an event handler.
- Decorative glow, autoplay, spring motion, or hover-only disclosure of required
  actions.
- Replacing visible focus rings or changing disabled behavior semantics.
