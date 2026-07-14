---
title: Interaction affordance consistency
status: completed
priority: P2
milestone: post-mvp
source: _IDEAS/backlog.md G-045; _IDEAS/triage.md TRIAGE-012
dependencies: [app-shell, ux-gap-fixes]
---

# Interaction affordance consistency

## Outcome

Enabled buttons, links, icon actions, interactive rows, and clickable cards
carry their affordance through clearly perceptible, smoothly eased hover/press
highlight. Cursors are native browser behavior only; no code switches the
arrow to a hand. The already-acceptable light theme stays regression-free and
keyboard focus remains at least as strong.

**Direction change — 2026-07-13 walkthrough.** The operator retired the entire
arrow-to-hand cursor approach after watching it live: the image-backed cursor
flickered on click areas and never settled, after both Claude Code and Codex
top models had repeatedly failed to make any variant reliable. Decision: remove
all cursor-switching code and carry affordance with highlight alone. Highlight
must be consistent (settings glance rail and dashboard Needs Attention rows
included) and eased in/out rather than sudden.

## What already exists

- Relay leaves cursor rendering entirely to the browser and operating system.
  Shared primitives, one-off interactions, and contributor guidance contain no
  hand-cursor declarations.
- Flagship clickable cards use raised shadows and a small hover translation;
  dense screens also contain one-off hover classes.
- Text links retain browser defaults, while custom `role=button` and full-row
  interactions vary by component.
- The design system already defines `accent`, `border`, `border-strong`, focus
  ring, raised-shadow, and reduced-motion tokens.

## Verification gate

The system-cursor policy and the dark-theme fill-plus-edge vocabulary are
accepted and verified in Chromium plus native Safari after a clean restart.

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

- Adding component-local hand utilities only to individual primitives produced partial,
  screen-dependent coverage and missed semantic links, nested paint nodes, and
  one-off interaction surfaces.
- A global semantic hand-cursor policy, including descendant
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
- The versioned image-backed cursor itself, though it passed computed-style
  checks and cold-start screenshots, flickered during real pointer use in the
  operator walkthrough. This closed the cursor line of work entirely: no
  keyword, image, or pseudo-element variant is acceptable. Native cursors only.

## Implementation and remaining verification

- All hand-cursor utilities, declarations, assets, tests, and contributor
  instructions are removed. A repository-wide source guard covers product code,
  design guidance, feature specs, plans, and repo-local agent assets.
- Disabled, inert, text-entry, drag, resize, and busy states may retain truthful
  non-hand system cursors; Relay never assigns a hand cursor to interaction.
- The decorative first-render boot veil never participates in pointer
  hit-testing, so controls underneath remain the cursor source during its fade.
- Dark-mode contained controls and interactive surfaces use a stronger tokenized
  fill plus cyan structural edge; press strengthens the surface and edge.
  Light-mode hover and text-only top navigation keep their accepted treatment.
- Audit non-semantic clickable cards/rows before screen-local exceptions; their
  explicit highlight contract should accompany correct keyboard semantics.
- The independent audit split the broader semantic/keyboard debt to G-047. It
  changes DOM roles and activation behavior (including the Tables select/open
  contract), while this feature remains responsible for truthful visual states
  and focus treatment on elements that are already interactive.
- Preserve distinct active, disabled, focus-visible, nested-action, and
  reduced-motion behavior; do not infer clickability from visual containment.
- Repair only representative one-off interactions not covered by a shared
  primitive, then add a class-contract regression inventory.

## Acceptance criteria

- [x] The dark-theme fill-plus-edge scope is operator-approved; the earlier
  hand-pointer approval was withdrawn on 2026-07-13 and every cursor-switching
  rule plus the cursor asset is removed with a regression test guarding
  against reintroduction.
- [x] Interactive-state highlight eases in and out (~160ms, transparent rest
  outline so the edge can interpolate) with a crisp press, and the settings
  glance rail and dashboard Needs Attention rows join the strong shared
  treatment.
- [x] Chromium and native Safari confirmation shows that highlight alone makes
  interactive surfaces unmistakable, smooth, and consistent in both themes.
- [x] Hover is clearly perceptible in dark theme without relying on decorative
  motion; light theme remains regression-free.
- [x] Focus-visible feedback is at least as strong as hover, and active state is
  distinguishable from both.
- [x] Nested actions do not make disabled or non-navigable descendants claim the
  parent interaction.
- [x] Component/class-contract tests cover shared primitives and representative
  main-content/top-right-toolbar consumers.
- [x] System-cursor source guards and before/hover/focus screenshots pass on
  dashboard, detail, table, workflow, and settings surfaces in both themes.
- [x] Keyboard, disabled, nested-action, and reduced-motion regressions pass.
- [x] Inert telemetry cells remain visually inert; only linked telemetry cells
  receive the dark hover fill and structural edge.

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
ancestor leakage, disabled destructive-menu hover, selectable-label behavior,
and `Button asChild` Link hover/disabled-anchor drift. Web preview confirms
disabled before/after styles are identical, text inputs retain the I-beam,
disabled subtrees remain neutral, and enabled controls retain the fill/edge
treatment. The targeted interaction/telemetry suite now passes 43/43 tests. The
audit also recorded the remaining source-test
limitation as TRIAGE-018 and split composite keyboard semantics to TRIAGE-017 /
G-047.

A 2026-07-13 cold-start Playwright matrix
(`output/interaction-audit/2026-07-13/cold-matrix/`) closed the remaining
automated criterion: after killing and cold-starting the dev server (cursor
asset 200 on first request), 932 element checks across dashboard, project
detail, tables list, table spreadsheet, workflows, and settings in light and
dark themes found zero violations — every enabled interactive element resolves
the image-backed hand (900/900), inert telemetry cells stay handless (12/12),
text entry keeps the I-beam (14/14), and disabled controls never claim the
pointer (6/6). Hover deltas confirm fill-plus-edge on buttons, cards, and
linked telemetry cells on every dark surface, fill-based hover intact in
light, and keyboard focus resolves to the 2px cyan ring in both themes.
Screenshots and `report.json` sit beside the rerunnable `g045-matrix.cjs`.
Note: the matrix's hand-cursor assertions predate the 2026-07-13 direction
change and are historical; its highlight, focus, inert, and disabled evidence
remains valid.

The 2026-07-13 live operator walkthrough (Claude in Chrome, dark theme) then
found cursor flicker, an unlit settings glance rail, barely visible Needs
Attention hovers, and sudden flashy highlight. The same session removed the
cursor machinery, put the glance rail and priority queue on the shared
`data-interactive-surface` treatment, and added eased transitions; 44/44
interaction/telemetry/glance tests pass after the change.

The final Codex closure pass removed every remaining hand-shape utility from
product code, shared primitives, historical build plans, design guidance, and
repo-local agent tooling. A repository-wide regression test covers those
surfaces. The focused interaction/telemetry/glance suite passes 35/35, TypeScript
and token validation pass, and the production build succeeds with only the known
`fix-data-dir` trace warnings. A fresh Chromium matrix evaluated 924 interaction
states across dashboard, project detail, tables list/detail, workflows, and
settings in light/dark themes with zero violations; hover and focus captures
remain visually consistent. Native Safari then loaded the same cold-started app
cleanly in dark and light themes, confirming the dashboard, telemetry links,
settings glance rail, and Needs Attention interaction surfaces.

## Error & Rescue Registry

| Failure | Impact | Rescue |
|---------|--------|--------|
| blanket cursor selector | inert/disabled surfaces lie about clickability | keep cursor rendering under system/browser control |
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
