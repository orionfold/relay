---
name: commit-push-pr-overrides
description: "Project-level overrides for the commit-commands commit-push-pr skill. Adds auto version-bump heuristic and bisectable commit guidance."
---

# Commit Push PR — Project Overrides

These overrides augment the base `commit-commands:commit-push-pr` skill. Apply these rules IN ADDITION to the plugin's base behavior.

## Bisectable Commit Guidance

If staging multiple files across different concerns, suggest grouping into logical commits that each pass tests independently. Each commit should be a coherent unit of change (e.g., separate "add schema migration" from "add UI component"). Ask the user before splitting if unsure.

## Auto Version-Bump Heuristic

Check if `package.json` exists and suggest a version bump:

- **PATCH** — fewer than 50 changed lines, bug fixes, or chore changes
- **MINOR** — new features, new files added, or significant enhancements
- **MAJOR** — breaking changes (requires explicit user confirmation, never auto-bump)

Present the suggestion and wait for confirmation before bumping. Skip if user declines or if no `package.json`.
