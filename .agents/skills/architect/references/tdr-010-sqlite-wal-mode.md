---
id: TDR-010
title: SQLite WAL mode with better-sqlite3
date: 2026-03-30
status: accepted
category: data-layer
---

# TDR-010: SQLite WAL mode with better-sqlite3

## Context

Need a database that's zero-config, local-first, and fast for a developer tool. Must handle concurrent reads from Server Components and writes from API routes.

## Decision

SQLite via better-sqlite3 (synchronous driver) with WAL (Write-Ahead Logging) mode enabled. Foreign keys enforced via PRAGMA. Database file stored at ~/.ainative/ainative.db. Drizzle ORM for typed queries.

## Consequences

- Zero external dependencies — no database server to install.
- WAL mode allows concurrent readers with a single writer.
- Synchronous driver avoids async complexity.
- Single-file database is easy to backup/move.
- Limited to single-machine deployment (acceptable for local-first tool).

## Alternatives Considered

- **PostgreSQL** — requires server, over-kill for local tool.
- **libsql/Turso** — adds cloud dependency.
- **Prisma** — heavier ORM, less SQLite-native.

## References

- `src/lib/db/index.ts` (PRAGMA statements)
- `package.json` (better-sqlite3, drizzle-orm)
