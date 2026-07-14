---
title: Interactive container keyboard parity
status: planned
priority: P2
milestone: post-mvp
source: _IDEAS/triage.md TRIAGE-017; _IDEAS/backlog.md G-047
dependencies: [interaction-affordance-consistency, accessibility]
---

# Interactive container keyboard parity

## Description

Relay now gives enabled interactive surfaces an unmistakable highlight and a
strong dark-theme hover state while leaving cursors to the system. That visual contract has exposed a semantic gap:
some composite rows and cards are still mouse-only, while others are focusable
and key-activated but remain generic containers in the accessibility tree.

This feature makes the input contract match the visual claim. It covers the
bounded set of row/card consumers found by the interaction audit and establishes
one reusable rule for future composite interactions without changing static
cards or ordinary text/input behavior.

## User story

As a keyboard or assistive-technology user, I want every row or card that looks
clickable to expose its purpose and activate predictably so that mouse affordance
improvements do not leave my interaction path behind.

## Current evidence

- Documents table rows expose `onClick` and hover highlight but remain
  `tabIndex=-1` with no interactive role in the live browser.
- Documents grid cards, Tables spreadsheet rows, and Tables list rows use
  non-semantic containers with pointer-only activation.
- Workflow, Blueprint, and Schedule flagship cards add focus and key handlers
  but do not consistently expose a button/link role and accessible name.
- The shared `Card interactive` prop adds visual classes only; it does not
  enforce semantics or activation.
- Tables list rows overload single click for selection and double click for
  open, so a blanket Enter/Space handler would encode an arbitrary product
  decision and can double-fire nested controls.

## Technical approach

1. Inventory composite interactions by combining `onClick`, `interactive`,
   `data-interactive-surface`, `role`, `tabIndex`, and `onKeyDown` searches. Classify each
   as navigate, open detail, select/toggle, or mixed/nested.
2. Prefer native `Link` or `button` when the whole surface has one action and
   does not contain nested interactive descendants.
3. For composite containers that must retain nested actions, add an explicit
   accessible role/name, focus target, and a shared activation helper that
   handles Enter/Space once and ignores events originating from nested controls.
4. Resolve Tables row semantics before implementation. Single-click selection,
   double-click open, checkbox selection, and keyboard activation must not share
   an ambiguous key path; an explicit Open action is acceptable if it produces
   the clearest contract.
5. Keep cursor policy and dark hover styling owned by G-045. This feature consumes
   that policy and changes only semantic/input behavior plus the minimum focus
   classes needed by newly focusable elements.

## Acceptance criteria

- [ ] Every in-scope highlight-advertised composite is reachable in logical tab
  order or contains a native focusable destination that covers the same action.
- [ ] Every focusable composite exposes a truthful button/link role and an
  accessible name that describes its result.
- [ ] Enter and Space behavior is documented per interaction family and fires
  the intended action exactly once.
- [ ] Nested checkboxes, edit/delete buttons, links, and text selection do not
  activate the parent container.
- [ ] Documents table/grid, Tables spreadsheet/list, Workflow list, Blueprint
  gallery, and Schedule list have focused component coverage.
- [ ] Live accessibility-tree and keyboard checks pass on Documents, Tables,
  Workflows, Blueprints, and Schedules at desktop and 390px.
- [ ] Cursor, hover, disabled, and focus-visible behavior from G-045 remains
  unchanged for existing shared primitives.

## Scope boundaries

**Included:**

- Composite rows/cards that already advertise clickability.
- Shared activation/event-isolation logic only after the audited third use.
- The explicit Tables select/open keyboard decision.

**Excluded:**

- New navigation, card layouts, hover vocabulary, or cursor assets.
- Making static informational cards focusable.
- A repository-wide accessibility rewrite or unrelated drag-and-drop behavior.
- Changing the meaning of existing row selection without the operator gate.

## Error and rescue registry

| Failure | Impact | Rescue |
|---------|--------|--------|
| blanket role/key handler | nested controls double-fire or expose invalid semantics | classify consumers first and prefer native elements |
| Enter/Space both map to mixed Tables behavior | selection/open becomes unpredictable | approve one explicit Tables key contract or add a named Open action |
| focus lands on both parent and every nested action unnecessarily | tab order becomes noisy | expose one primary focus path and retain only essential nested actions |
| source-only tests pass while DOM stays generic | accessibility gap survives | assert rendered role/name/tab order and confirm the live accessibility tree |

## References

- `_IDEAS/triage.md` — TRIAGE-017
- `_IDEAS/backlog.md` — G-047
- `features/interaction-affordance-consistency.md`
- `features/accessibility.md`
- `design-system/MASTER.md` — Interactive Cards
