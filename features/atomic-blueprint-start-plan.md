---
title: Atomic Blueprint Start Plan
status: completed
goal: G-121
specification: features/runtime-first-value-reliability.md
---

# Atomic Blueprint Start Plan

## Goal contract

**Outcome:** Relay calls a blueprint ready only when its first executable step
has an eligible target; Start run creates and claims exactly one workflow only
after execution preflight passes, and success opens that workflow through the
App Router.

**Constraints:** Preserve profile, capability, model and routing guardrails.
Keep draft-only Create workflow behavior distinct. Keep entered variables after
recoverable failure. Do not weaken the execute route's authoritative target
claim or introduce a runtime-registry import cycle.

**Verification:** Readiness across compatible and incompatible profiles,
configuration changes while a surface is open, no-runtime refusal with zero
workflow rows, repeated idempotency key and double-submit, missing/invalid
workflow identity, exact semantic navigation from mouse and keyboard, focused
database/component tests, production build, real task execution under
`npm run dev`, and responsive browser proof.

**Operator gates:** None.

**Stop/rescue:** If client composition cannot prevent an instantiate/execute
race, replace it with one server-owned start route that prepares and preflights
before a transaction atomically inserts the active workflow and run receipt.

## Vertical slices

1. Separate blueprint preparation from draft persistence so readiness and Start
   can inspect the exact resolved workflow without creating a row.
2. Add a shared readiness probe for the first executable blueprint step and
   expose it to runnable surfaces.
3. Add an idempotent start boundary that preflights all executable steps, then
   atomically persists the active workflow and first run receipt.
4. Route Run through that boundary while retaining variables on failure and
   keeping Create workflow draft-only.
5. Replace native history mutation with an actual App Router action to the
   returned workflow ID.

## Regression budget

- Blueprint preparation/instantiation compatibility tests.
- Readiness route and mixed target/profile fixtures.
- Start-route zero-orphan, duplicate, missing-ID and receipt assertions.
- Run controls for in-flight double action, failure retention and refresh.
- Rendered router navigation tests for both toast actions.
- Runtime-registry graph smoke with a real compatible workflow under dev.

## Rescue and rollback

The new start route is additive and stores no new schema. The client can fall
back to the existing draft route for Create workflow. If atomic launch proves
unsafe, disable only Start while retaining drafts and diagnostics; no migration
or data rewrite is required.
