---
title: Adaptive Home Command Center
status: completed
priority: P1
milestone: workshop-enablement
source: _IDEAS/backlog.md G-062
dependencies:
  - homepage-dashboard
  - dashboard-settings-drilldowns
---

# Adaptive Home Command Center

## Outcome

Home is a dense, configurable command center rather than a fixed four-panel
summary. A typed module registry covers Relay's main capability families while
keeping each module bounded, independently recoverable and directly linked to
its authoritative route.

## Module contract

Each module declares:

- stable id and title;
- default visibility and fixed-order index;
- desktop span (`wide` or `narrow`);
- source route;
- eligibility rule;
- urgency, active and recency signals;
- empty and error copy.

Initial modules are:

1. operator attention;
2. autonomous activity;
3. installed Packs/apps;
4. tasks, projects and workflows;
5. recent documents/outputs;
6. cost and budget;
7. runtime/environment health;
8. quick actions and onboarding;
9. active workshop progress when a local run exists.

Host/cell health remains excluded until G-083 exposes a typed content-free
lifecycle API.

## Settings and ordering

`dashboard.preferences.v1` stores:

```json
{
  "version": 1,
  "smartOrdering": true,
  "visible": {
    "attention": true
  }
}
```

Unknown keys and malformed payloads are refused. Missing module keys inherit
registry defaults, enabling forward-compatible additions. Reset deletes the
stored override and returns registry defaults.

Smart rank is deterministic:

1. unresolved operator action;
2. active autonomous work;
3. failed/budget/runtime health;
4. recent autonomous output in bounded age buckets;
5. installed-Pack relevance;
6. fixed registry order.

Scores use integer buckets and stable id tie-breaks. Fixed mode uses registry
order only. Disabled modules never render. The page summary must still say
that hidden modules contain unresolved signals when applicable.

## Layout

- desktop: five-column grid; wide modules span three, narrow span two;
- tablet: two equal columns;
- mobile: one column in keyboard/DOM order;
- modules retain stable keys during reordering;
- no masonry or Pack-authored component injection.

## Failure states

One module loader failure produces a named module error card and does not fail
or silently remove the dashboard. Empty modules explain the source state and
offer a deep link where useful.

## Acceptance criteria

- [x] A typed registry maps every agreed capability family to a module or an
      explicit exclusion.
- [x] Settings can toggle each module, toggle smart ordering and restore
      defaults through a validated API.
- [x] Ranking prioritizes unresolved action over active work, health, recency
      and installed-Pack relevance with deterministic ties.
- [x] Hidden urgent sources are acknowledged without rendering their contents.
- [x] Fresh-instance welcome remains available.
- [x] Partial module failures do not fail the whole page.
- [x] Desktop/tablet/mobile layouts preserve keyboard order, system cursor,
      direct navigation and semantic-token styling.

## Regression disposition

- Pure registry/ranking tests cover visibility, fixed order, urgency,
  recency buckets, installed Packs, equal scores and hidden urgent signals.
- Settings route tests cover defaults, partial updates, malformed/unknown
  payloads, persistence and reset.
- Component tests cover toggles, reset and module error/empty states.
- Browser verification covers fresh, standard, action-heavy and multi-Pack
  fixtures at 1440px, 944px and 390px in light/dark themes.

## Completion evidence

- Registry and settings route tests pass.
- The production build and design-token validator pass.
- An isolated real-data-dir browser run verified Home and Dashboard Settings at
  desktop light and 390px dark with no overflow, console errors, page errors,
  HTTP 5xx responses or authored hand-cursor overrides.
- Browser artifacts are under `output/workshop/2026-07-16/`.
