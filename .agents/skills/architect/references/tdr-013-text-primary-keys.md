---
id: TDR-013
title: Text primary keys (UUIDs) over auto-increment integers
date: 2026-03-30
status: accepted
category: data-layer
---

# TDR-013: Text primary keys (UUIDs) over auto-increment integers

## Context

Need primary key strategy that supports client-side ID generation, avoids conflicts in distributed/offline scenarios, and works with the fire-and-forget execution pattern.

## Decision

All tables use text("id").primaryKey() with application-generated UUIDs (crypto.randomUUID()). No auto-increment integer IDs.

## Consequences

- IDs can be generated client-side before database insertion — essential for fire-and-forget pattern where the client needs the ID before the async operation completes.
- No sequential ID enumeration (security benefit).
- Slightly larger storage than integers.
- Foreign key references use text, not integer.

## Alternatives Considered

- **Auto-increment integers** — can't generate client-side, sequential enumeration risk.
- **ULID/nanoid** — non-standard, slight dependency.
- **Composite keys** — complex joins.

## References

- `src/lib/db/schema.ts` (all table definitions use text PK)
