---
id: TDR-009
title: Idempotent database bootstrap alongside migrations
date: 2026-03-30
status: accepted
category: infrastructure
---

# TDR-009: Idempotent database bootstrap alongside migrations

## Context

Drizzle migrations may not be applied automatically in all deployment scenarios (npx distribution, fresh installs). Need a safety net for table creation.

## Decision

bootstrap.ts runs CREATE TABLE IF NOT EXISTS for all tables on every application startup. This runs alongside (not instead of) the migration system. The STAGENT_TABLES constant lists all tables for clear.ts and health checks. New tables must be added to both migration SQL AND bootstrap.ts.

## Consequences

- Application self-heals missing tables on startup.
- No "table not found" errors in deployed environments.
- Slight startup cost for the IF NOT EXISTS checks (negligible for SQLite).
- Dual maintenance burden: must keep bootstrap.ts and migrations in sync.

## Alternatives Considered

- **Migration-only** — breaks on missed migrations.
- **Auto-migration on startup** — risky in production.
- **Manual setup scripts** — poor DX.

## References

- `src/lib/db/bootstrap.ts`
- `src/lib/db/migrations/`
- `src/lib/data/clear.ts` (uses STAGENT_TABLES)
