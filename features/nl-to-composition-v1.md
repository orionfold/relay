---
id: nl-to-composition-v1
name: Natural Language → App Composition v1
status: completed
shipped-date: 2026-04-21
milestone: M4.5
dependencies:
  - create-plugin-spec (M4, shipped 2026-04-20)
  - AppMaterializedCard (Phase 2+3, shipped 2026-04-20)
  - ExtensionFallbackCard (Phase 6, shipped 2026-04-20)
  - chat-tools-plugin-kind-1 (M3, shipped 2026-04-20)
design: docs/superpowers/specs/2026-04-21-m4.5-nl-to-composition-design.md
plan: docs/superpowers/plans/2026-04-21-m4.5-implementation.md
handoff: internal history record
---

# Natural Language → App Composition v1

A pattern-based chat-message classifier that nudges the LLM to compose `AppMaterializedCard`-emitting tool-call sequences when the user says "build me an app", and short-circuits to `ExtensionFallbackCard` with pre-inferred inputs when the ask is plugin-shaped.

See the design spec and implementation plan for full details. This file exists so the `features/` directory has a landing page for the milestone; the authoritative content lives in the linked design + plan + handoff.
