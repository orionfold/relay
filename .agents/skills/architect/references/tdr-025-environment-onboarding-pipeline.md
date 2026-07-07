---
id: TDR-025
title: Environment onboarding scan/artifact/sync pipeline
date: 2026-04-02
status: accepted
category: infrastructure
---

# TDR-025: Environment onboarding scan/artifact/sync pipeline

## Context

Users work across multiple AI tools (Claude Code, Codex) with different configuration formats. Each tool has its own skills, MCP servers, permissions, and instructions scattered across home directories and project configs. The project needed a way to discover, catalog, and synchronize these configurations.

## Decision

Five tables implement a scan → catalog → checkpoint → sync pipeline:

- **`environmentScans`**: Records of discovery runs — `scanPath`, `persona` (JSON array of tool types scanned), `scanStatus`, `artifactCount`, `durationMs`, `errors`.
- **`environmentArtifacts`**: Individual discovered items — `tool` (claude-code/codex), `category` (skill/mcp-server/permission/instruction/config), `scope` (user/project), `contentHash` for change detection, `metadata` (JSON), `linkedProfileId` for profile association.
- **`environmentCheckpoints`**: Rollback points created before sync operations — `checkpointType` (pre-sync/manual/pre-onboard), `gitTag`, `backupPath`, `status` (active/rolled_back/superseded).
- **`environmentSyncOps`**: Per-artifact sync operations — `operation` (create/update/delete/sync), `targetTool`, `targetPath`, `diffPreview`, `status` (pending/applied/failed/rolled_back).
- **`environmentTemplates`**: Reusable environment configurations — `manifest` (JSON: skills, mcpServers, permissions, instructions), `scope` (user/shared).

Scanner implementations (`scanners/claude-code.ts`, `scanners/codex.ts`) discover tool-specific artifacts. Parsers (`parsers/`) extract structured data from various config formats (TOML, JSON, Markdown skill files, MCP configs). The sync engine (`sync-engine.ts`) applies operations with rollback support.

Auto-scan (`auto-scan.ts`) runs discovery on project open/change with content-hash-based change detection to avoid redundant scans.

## Consequences

- Environment state is fully auditable — every scan, artifact, and sync operation is tracked.
- Checkpoints enable safe rollback of cross-tool sync operations.
- Content hashing prevents unnecessary re-scans and enables drift detection.
- The pipeline follows fire-and-forget (TDR-001): scans run asynchronously, UI renders from persisted state.
- Adding support for a new tool requires only a scanner implementation and parser set.

## Alternatives Considered

- **Manual config copying** — error-prone, no audit trail, doesn't scale.
- **Git-based config sync** — requires all tools to use Git-compatible formats; some configs are binary or tool-specific.
- **Cloud-based sync service** — external dependency; conflicts with SQLite-first architecture.

## References

- `src/lib/environment/scanner.ts` — orchestrator
- `src/lib/environment/scanners/claude-code.ts`, `codex.ts` — tool-specific scanners
- `src/lib/environment/parsers/` — config format parsers
- `src/lib/environment/sync-engine.ts` — sync orchestration with rollback
- `src/lib/environment/auto-scan.ts` — change-detection-based auto-scanning
- `src/lib/environment/templates.ts` — reusable environment templates
- `src/lib/environment/data.ts` — data access layer
- `src/lib/db/schema.ts` — 5 environment tables
