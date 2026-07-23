---
title: Provider-first Settings Implementation Plan
status: completed
goal: G-120
specification: features/runtime-first-value-reliability.md
---

# Provider-first Settings Implementation Plan

## Goal contract

**Outcome:** Settings presents provider connection and verification before task
routing, and routing updates from the same G-119 readiness evidence without a
manual refresh.

**Constraints:** Preserve provider-specific controls, capability limits,
explicit overrides, model discovery, keyboard order, existing deep links, and
narrow-screen readability. Do not create a wizard or duplicate provider state.

**Verification:** Component order and live-refresh regressions; existing
save-before-test/model-discovery suites; TypeScript and production build;
desktop and 390 px light/dark browser inspection covering empty, mixed, failed,
and ready states where locally reproducible.

**Operator gates:** Only a material unresolved choice between fused and ordered
layouts. The goal contract's rescue path authorizes the lower-risk ordered
provider-first layout when it remains more scannable.

**Stop/rescue:** Keep provider setup as ordered cards with shared live readiness
and place routing last if visual fusion makes the surface denser or obscures
provider-specific controls.

## Vertical slices

1. Reorder the Settings information architecture so all local and cloud
   provider setup precedes routing while preserving existing anchors.
2. Place task routing after the compact cloud-provider rows in the shared card.
3. Prove save/test/discovery events refresh routing eligibility immediately.
4. Verify responsive reading and keyboard order in real browser states.

## Regression budget

- Extend the provider/routing component suite with DOM-order and event-refresh
  assertions.
- Run the existing Ollama and OpenAI-compatible setup suites.
- Run TypeScript, the production build, and focused browser verification.

## Rescue and rollback

The change does not migrate settings or credentials. Reverting the component
order restores the prior information architecture without changing the G-119
readiness records or routing policy.
