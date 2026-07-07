---
id: TDR-011
title: JSON in TEXT columns for flexible structured data
date: 2026-03-30
status: accepted
category: data-layer
---

# TDR-011: JSON in TEXT columns for flexible structured data

## Context

Several entities need semi-structured data that varies by type (workflow definitions, task metadata, profile configuration, notification payloads). SQLite doesn't have a native JSON column type with schema enforcement.

## Decision

Store JSON as TEXT columns. Application-level parsing and validation via Zod schemas at API boundaries.

Columns using this pattern (as of Sprint 37):
- **Core:** `workflows.definition`, `notifications.body` (structured payloads), `learnedContext.proposedAdditions`
- **Scheduling:** `schedules.heartbeatChecklist`, `schedules.deliveryChannels`
- **Chat:** `conversations.contextScope`, `chatMessages.metadata`
- **Channels:** `channelConfigs.config` (**SECURITY**: contains credentials — must be masked via `maskChannelConfig()` before API response)
- **Agent:** `agentMessages.attachments`, `agentMemory.tags`
- **Environment:** `environmentScans.persona/errors`, `environmentArtifacts.metadata`, `environmentTemplates.manifest`
- **Views:** `views.filters`, `views.sorting`, `views.columns`
- **Imports:** `repoImports.profileIds`

## Consequences

- Maximum flexibility — schema can evolve without migrations for nested structures.
- Application must handle parse errors gracefully.
- No database-level JSON validation (Zod catches at boundaries).
- JSON functions in SQLite (json_extract) available if needed for queries.

## Alternatives Considered

- **Normalize all structured data into separate tables** — explosion of tables, rigid schema.
- **SQLite JSON1 extension with CHECK constraints** — complex, still text underneath.
- **Separate document store** — unnecessary complexity.

## References

- `src/lib/db/schema.ts` (TEXT columns with JSON content)
- `src/app/api/` (Zod validation at boundaries)
