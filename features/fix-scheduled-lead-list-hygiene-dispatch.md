---
title: Fix scheduled lead-list hygiene dispatch variables and firing status
status: planned
priority: P1
milestone: post-mvp
source: output/operator-walkthrough-feedback-2026-07-07.md
dependencies: [scheduled-prompt-loops, row-trigger-blueprint-execution]
---

# Fix Scheduled Lead-List Hygiene Dispatch

## Description

The walkthrough logs showed scheduled lead-list hygiene dispatches failing with
`Missing required variables: "Lead" is required`, while the scheduler still logged the app schedule
as fired. That is a double failure: the scheduled blueprint lacks a fillable variable path, and the
firing record appears successful even though dispatch threw.

This feature makes scheduled app dispatch truthful and fixes the lead-list hygiene schedule
contract for `relay-crm` and `relay-marketing`.

## User Story

As a Relay operator, I want scheduled pack workflows to either run with valid variables or visibly
fail, so that a "fired" schedule does not hide a skipped workflow.

## Technical Approach

- Trace `fireAppSchedule` and `dispatchScheduledBlueprint` error handling.
- Decide whether a dispatch exception should prevent the "fired" log/metric or record a failed
  firing with error details.
- Fix `relay-crm--outreach-loop` schedule defaults so required variables are row-fillable or
  optional according to the pack convention.
- Add regression coverage for required scheduled variables and failure status logging.
- Verify both `relay-crm` and `relay-marketing` schedule paths.

## Acceptance Criteria

- [ ] Lead-list hygiene schedules no longer throw `Missing required variables: "Lead" is required`
      in normal seeded installs.
- [ ] If scheduled dispatch throws, the schedule is not logged as a successful firing.
- [ ] Failure state/error details are visible in logs or scheduler history.
- [ ] Pack install validation catches future scheduled blueprint variables that cannot be filled.
- [ ] Tests cover success and thrown-dispatch paths.

## Scope Boundaries

**Included:**
- Scheduled pack dispatch variable binding and truthful firing status.

**Excluded:**
- Redesigning scheduler cadence or schedule UI.
- New schedule authoring tools.

## References

- `output/operator-walkthrough-feedback-2026-07-07.md`
- `AGENTS.md` row-insert trigger variable convention
