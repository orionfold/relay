---
id: TDR-012
title: Epoch integer timestamps over ISO strings
date: 2026-03-30
status: accepted
category: data-layer
---

# TDR-012: Epoch integer timestamps over ISO strings

## Context

Need consistent timestamp storage across all tables. SQLite has no native datetime type.

## Decision

All timestamps stored as integer columns (epoch milliseconds or seconds depending on context). Drizzle schema uses integer("columnName", { mode: "timestamp" }) for type-safe access. Application code converts to/from Date objects at the boundary.

## Consequences

- Fast comparisons and range queries (integer comparison vs string parsing).
- Consistent across all tables — no mixed formats.
- Timezone-agnostic storage.
- Slightly less human-readable in raw database inspection (acceptable tradeoff).

## Alternatives Considered

- **ISO 8601 text strings** — human-readable but slower queries.
- **SQLite datetime functions** — inconsistent behavior, strftime overhead.
- **Mixed integer/text per table** — inconsistency.

## References

- `src/lib/db/schema.ts` (all createdAt, updatedAt, startedAt, completedAt columns)
