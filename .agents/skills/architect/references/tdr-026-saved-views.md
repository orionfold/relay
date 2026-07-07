---
id: TDR-026
title: Saved views with persistent filter/sort/column state
date: 2026-04-02
status: accepted
category: frontend-architecture
---

# TDR-026: Saved views with persistent filter/sort/column state

## Context

Users configure table views (filters, sorting, column visibility, density) but lose these preferences on page reload. The project needed a way to persist view configurations without server-side user accounts.

## Decision

The `views` table stores per-surface (tasks, documents, workflows) user-configured view state:

- **`surface`**: Which data table this view applies to (e.g., "tasks", "documents", "workflows").
- **`filters`**: JSON-serialized filter state.
- **`sorting`**: JSON-serialized sort state (column + direction).
- **`columns`**: JSON-serialized column visibility state.
- **`density`**: Enum (`compact` | `comfortable` | `spacious`).
- **`isDefault`**: Boolean — one view per surface can be the default.

This codifies the project's approach to UI state persistence: ephemeral state (hover, selection, scroll position) stays in React state; durable preferences (which columns to show, how to sort, what to filter) go to SQLite. This aligns with TDR-004's Server Component pattern — views are loaded server-side and passed as props.

## Consequences

- View preferences survive page reloads and browser restarts.
- Multiple named views per surface enable different workflows (e.g., "My Active Tasks" vs "All Failed Tasks").
- JSON-in-TEXT for filter/sort/column state follows TDR-011 — application-level validation, schema flexibility.
- No user accounts needed — views are per-installation, consistent with single-user SQLite architecture (TDR-010).

## Alternatives Considered

- **localStorage** — doesn't survive browser clears; not accessible from Server Components.
- **URL query parameters** — clutters URLs; doesn't support complex filter state.
- **React Context + state management** — ephemeral; lost on reload.

## References

- `src/lib/db/schema.ts` — `views` table
