---
id: TDR-007
title: Agent profile as skill directory convention
date: 2026-03-30
status: accepted
category: agent-system
---

# TDR-007: Agent profile as skill directory convention

## Context

Agent profiles need system prompts, tool policies, and behavioral configuration. These should be user-editable and portable.

## Decision

Each agent profile IS a Claude Code skill directory. Builtins ship at src/lib/agents/profiles/builtins/ and are distributed to ~/.claude/skills/ on first run. Profile configuration comes from profile.yaml (ainative-specific: tools, MCP, policies, tests) and SKILL.md (system prompt source). The registry uses lazy loading with mtime-based cache invalidation to detect user edits.

## Consequences

- Users customize profiles by editing files in ~/.claude/skills/ — no UI needed for advanced customization.
- Same profiles work in both ainative UI and Claude Code CLI.
- Builtins never overwrite user edits (idempotent distribution).
- SKILL.md content doubles as both Claude Code skill and ainative system prompt.

## Alternatives Considered

- **Database-stored profiles** — not portable, hard to version.
- **JSON config files** — less expressive than Markdown.
- **UI-only profile editing** — limits power users.

## References

- `src/lib/agents/profiles/registry.ts`
- `src/lib/agents/profiles/types.ts`
- `src/lib/agents/profiles/builtins/`
