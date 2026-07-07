---
id: TDR-004
title: Server Components for reads, API routes for mutations only
date: 2026-03-30
status: accepted
category: frontend-architecture
---

# TDR-004: Server Components for reads, API routes for mutations only

## Context

Next.js App Router supports React Server Components (RSC) that can query data sources directly on the server. Need a clear data-fetching strategy.

## Decision

Server Components query the SQLite database directly for all read operations. API routes (src/app/api/) exist only for client-initiated mutations (create, update, delete, execute). No read-only API endpoints for page rendering.

## Consequences

- Zero-latency reads (no HTTP round-trip for initial page data).
- Clearer separation: pages are read-only views, API routes are write actions.
- Cannot share read logic between server and client easily.
- Client-side data refreshing requires router.refresh() or revalidation.

## Alternatives Considered

- **Full API layer for everything** — unnecessary latency for reads.
- **tRPC** — extra abstraction layer.
- **GraphQL** — over-engineered for local-first SQLite.

## References

- `AGENTS.md` (line 42)
- `src/app/` (page.tsx files query DB directly)
- `src/app/api/` (mutation routes)
