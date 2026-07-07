---
title: Dashboard and Settings drill-down affordances
status: planned
priority: P1
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [homepage-dashboard, settings-interactive-controls]
---

# Dashboard and Settings Drill-Down Affordances

## Description

Dashboard telemetry cards and Settings rail values currently read as inert summaries even when the
operator expects them to drill into the relevant view. The walkthrough explicitly called for
clicking `Projects` telemetry to open Projects and for Settings key-value rows to open Settings at
the corresponding setting with scroll/focus.

This feature turns summary cards into clear, keyboard-accessible navigation affordances without
making operational dashboards feel like marketing tiles.

## User Story

As a Relay operator, I want dashboard and settings summary values to open their source views so
that I can move from signal to action in one click.

## Technical Approach

- Inventory dashboard telemetry cards and map each metric to a target route, query, or hash.
- Add visible affordance treatment for navigable cards without overwhelming dense dashboards.
- Add Settings rail row targets with stable anchors for specific settings sections or controls.
- Ensure navigation scrolls and focuses the destination control/section.
- Preserve keyboard activation, focus rings, and screen-reader labels.

## Acceptance Criteria

- [ ] Dashboard telemetry cards that imply a route navigate to the correct view.
- [ ] `Projects` telemetry opens Projects; equivalent task, workflow, inbox, cost, and failure
      telemetry map to their matching views where available.
- [ ] Settings rail key-value rows open `/settings` and focus/scroll the corresponding setting.
- [ ] Navigable summary elements are visually distinguishable from inert readouts.
- [ ] Keyboard and screen-reader behavior is covered by tests or browser verification.

## Scope Boundaries

**Included:**
- Dashboard telemetry and Settings rail drill-down links.

**Excluded:**
- New analytics dashboards.
- Telemetry collection or external reporting.

## References

- `features/homepage-dashboard.md`
- `features/settings-interactive-controls.md`
- `output/operator-walkthrough-feedback-2026-07-07.md`
