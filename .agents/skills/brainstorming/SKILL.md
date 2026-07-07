---
name: brainstorming-overrides
description: "Project-level overrides for the superpowers brainstorming skill. Adds scope modes (EXPAND/HOLD/REDUCE) and required design artifacts to every brainstorming session."
---

# Brainstorming — Project Overrides

These overrides augment the base `superpowers:brainstorming` skill. Apply these rules IN ADDITION to the plugin's base behavior.

## Scope Modes

Before diving into questions, present the user with a scope mode choice. This frames the entire brainstorming session:

> **What scope mode fits this work?**
>
> - **EXPAND** — "What's the 10x version?" Push ambition, identify delight opportunities (aim for 5+ ideas), explore adjacent features and integrations
> - **HOLD** — Maximum rigor on current scope. Bulletproof edge cases, map every failure mode, build an Error & Rescue Registry
> - **REDUCE** — Surgical ruthlessness. Strip to minimum viable, defer everything non-essential with explicit rationale for each deferral

Default to **HOLD** if the user doesn't choose. The chosen mode influences questioning depth, approach count, and design scope throughout the session.

**Mode effects:**
- **EXPAND**: Ask "what else could this enable?" after each design section. Propose at least one ambitious stretch option.
- **HOLD**: For each component, ask "what happens when this fails?" Build an Error & Rescue Registry table.
- **REDUCE**: After each design section, challenge: "Can we ship without this?" Defer anything non-essential.

## Required Design Artifacts

Include in every design doc:

- **"NOT in scope" section** — list each deferred item with rationale for why it's deferred. This prevents scope creep by making exclusions explicit.
- **"What already exists" section** — reusable code, utilities, and patterns found during exploration. Prevents rebuilding what's already there.
- **Error & Rescue Registry** (for HOLD/REDUCE modes) — table of failure modes with recovery strategies:
  ```
  | Error | Trigger | Impact | Rescue |
  |-------|---------|--------|--------|
  | DB write fails | disk full, WAL lock | data loss | retry with backoff, surface to user |
  ```
- **ASCII diagrams** for data flows and state machines (mandatory for non-trivial features). Keep them simple — boxes and arrows, not art.
