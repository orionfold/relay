---
id: TDR-033
title: Route Semantics — Object-Label Convention for List Routes
status: accepted
date: 2026-04-18
category: frontend-architecture
---

# TDR-033: Route Semantics — Object-Label Convention for List Routes

## Context

The App Router layout at `src/app/` grew one list route at a time as features shipped: `/projects`, `/workflows`, `/profiles`, `/schedules`, `/documents`, `/tables`. Every one followed the same implicit rule — the route is named after the object it lists, in plural form. One route violated this rule: `/dashboard`, which hosted the kanban task board. The route was named after a view type, not the object, and the corresponding object route `/tasks` existed only as a redirect stub. This inconsistency confused the sidebar IA (the real dashboard at `/` had no nav entry) and left future contributors with no written rule to reference.

## Decision

List routes name the object, not the view type:

- **List routes**: plural object name. `/tasks`, `/projects`, `/workflows`, `/profiles`, `/schedules`, `/documents`, `/tables`.
- **Detail routes**: object singular + id. `/tasks/[id]`, `/projects/[id]`.
- **Create routes**: `/<object>/new` where applicable. `/tasks/new`.
- **Root `/`**: reserved for the cross-cutting home overview (Dashboard).
- **View-type selection** (board vs. table vs. grid vs. kanban): an in-page toggle via `TaskViewToggle` or equivalent — never a separate route.

Routes named after view types (`/dashboard`, `/kanban`, `/board`, `/grid`) are prohibited. If a future feature introduces a new list surface, the route follows this convention from day one.

## Consequences

- **Easier:** Naming new routes requires zero deliberation — the object name is the route name.
- **Easier:** Cross-referencing a route in docs and chat tools is predictable (`@task` entity → `/tasks`, `@project` → `/projects`).
- **Harder:** Any future desire to promote a specific view (e.g. "Timeline") to a route must go through a TDR update — single-route convention resists drift.
- **Historical cost paid once:** `/dashboard` was renamed to `/tasks` in the sidebar-ia-route-restructure feature (2026-04-18). No back-compat redirect was preserved (alpha audience).

## Alternatives Considered

- **"View-type routes are OK if the view is canonical"** — rejected. Leads to drift where every new view gets a route, blowing up the sitemap.
- **"Keep `/dashboard` as an alias to `/tasks`"** — rejected. Two URLs for one page doubles the maintenance surface with no user benefit for an alpha product.
- **"Use `/tasks/board` and `/tasks/table` for views"** — rejected. Flips the mental model from object-first to view-first and breaks the sibling pattern across other list routes.

## References

- `features/sidebar-ia-route-restructure.md` — the feature that enforced this convention
- `features/architect-report.md` — blast-radius analysis including the `isItemActive` root-path guard correctness check
- `src/components/shared/app-sidebar.tsx` — NavItem registry now follows this convention for all list routes
