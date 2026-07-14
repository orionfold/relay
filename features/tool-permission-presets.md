---
title: Tool Permission Presets
status: completed
priority: P2
milestone: post-mvp
layer: Platform
dependencies:
  - tool-permission-persistence
---

# Tool Permission Presets

## Summary

Pre-built permission bundles (e.g., "read-only", "git-safe", "full-auto") that users can enable with one click, reducing first-run friction and eliminating the need to encounter each tool individually before approving it.

## Problem

The current `tool-permission-persistence` feature requires users to encounter each tool during task execution and click "Always Allow" one at a time. New users face a flood of permission prompts on their first few tasks. Power users who know they want to allow all read operations must still approve `Read`, `Glob`, `Grep`, `LS`, etc. individually. This creates unnecessary friction — especially for the common case where users trust a well-defined category of tools.

## User Story

As a new ainative user, I want to enable a "read-only tools" preset so that my first agent task doesn't interrupt me with 5+ permission prompts for safe operations I'd always approve.

As a power user, I want to switch between permission profiles (e.g., "git-safe" for development, "full-auto" for trusted workflows) without managing individual tool permissions.

## Solution

### Permission Presets

| Preset | Tools Included | Risk Level |
|--------|---------------|------------|
| `read-only` | Read, Glob, Grep, LS, NotebookRead | Lowest — no mutations |
| `git-safe` | read-only + Bash(command:git *), Write, Edit | Medium — can modify files and run git |
| `full-auto` | All tools except AskUserQuestion | Highest — full agent autonomy |

### Architecture

- **Preset definitions**: `src/lib/settings/permission-presets.ts` — typed preset objects with tool lists, descriptions, and risk badges
- **Bulk apply**: When a user enables a preset, all its tool patterns are added to `permissions.allow` in the settings table (same storage as individual "Always Allow")
- **Settings UI**: New `PresetsSection` component above the existing `PermissionsSection` — shows preset cards with enable/disable toggle and risk indicator
- **API**: `POST /api/permissions/presets` — accepts preset ID, writes all patterns atomically
- **Defaults for new users**: On first launch (no permissions saved), suggest "read-only" preset via a one-time prompt or settings nudge

### Preset Composition

Presets are additive — enabling "git-safe" also includes all "read-only" tools. Disabling a preset removes only the tools unique to that preset (does not remove individually approved tools or tools from other active presets).

## Acceptance Criteria

- [ ] At least 3 permission presets defined (read-only, git-safe, full-auto)
- [ ] One-click enable/disable for each preset in Settings
- [ ] Enabling a preset adds all its tool patterns to the permission store
- [ ] Disabling a preset removes its unique patterns without affecting individually approved tools
- [ ] Risk level displayed per preset (low/medium/high badge)
- [ ] `AskUserQuestion` is excluded from all presets (always requires human input)
- [ ] New user experience suggests read-only preset on first task execution
- [ ] Presets compose correctly (git-safe includes read-only tools)
- [ ] API supports atomic preset apply/remove

## Scope Boundaries

### In Scope

- Preset definitions and bulk apply logic
- Settings UI for preset management
- New user onboarding nudge
- Preset composition (layered presets)

### Out of Scope

- Custom user-defined presets (use individual "Always Allow" for custom patterns)
- Per-project permission presets
- Per-runtime permission presets (same presets apply regardless of Claude/Codex)

## Technical Approach

### Key Files

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/settings/permission-presets.ts` | Create | Preset definitions, apply/remove logic |
| `src/components/settings/presets-section.tsx` | Create | Preset cards with enable/disable and risk badges |
| `src/app/api/permissions/presets/route.ts` | Create | POST (apply preset), DELETE (remove preset) |
| `src/lib/settings/permissions.ts` | Modify | Add `getActivePresets()` and `isPresetActive()` helpers |
| `src/components/settings/permissions-section.tsx` | Modify | Show preset origin tag on individual permissions |

## References

- **Origin**: internal Agent E2E Test Report, Recommendation #1 — "Tool pre-approval: Consider adding a bulk approve for common read-only tools to reduce friction"
- **Builds on**: [tool-permission-persistence](tool-permission-persistence.md) — individual "Always Allow" mechanism
- **Related**: Claude Code's `allowedTools` convention for permission patterns
