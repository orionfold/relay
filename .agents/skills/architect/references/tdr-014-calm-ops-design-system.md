---
id: TDR-014
title: Calm Ops design system — opaque surfaces, OKLCH, border elevation
date: 2026-03-30
status: accepted
category: frontend-architecture
---

# TDR-014: Calm Ops design system — opaque surfaces, OKLCH, border elevation

## Context

The application is an operational workspace for managing AI agents. Needs a design language that prioritizes clarity, density, and readability over decoration.

## Decision

"Calm Ops" design system: opaque surfaces (zero glassmorphism), OKLCH color space with accent hue ~250 (indigo/blue-violet), border-centric elevation (4 levels via borders + subtle shadows, not backdrop-blur), 3-tier surface hierarchy (surface-1/2/3). Forbidden: backdrop-filter, rgba(), glass-*, gradient-* utilities. Semantic status tokens (--status-running, --status-completed, etc.) instead of raw Tailwind color utilities.

## Consequences

- Consistent, calm visual language across all surfaces.
- No compositing jank from backdrop-blur.
- Clear elevation hierarchy via borders.
- OKLCH provides perceptually uniform color manipulation.
- Strict forbidden patterns prevent aesthetic drift.

## Alternatives Considered

- **Material Design** — too opinionated, not ops-focused.
- **Glassmorphism** — compositing overhead, readability issues in dense views.
- **Custom from scratch without system** — inconsistency over time.

## References

- `design-system/MASTER.md` (canonical source)
- `src/app/globals.css` (token implementation)
