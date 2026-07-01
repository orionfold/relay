---
title: Fix chat MCP namespace (ainative→relay) + persisted-approval migration
status: done
priority: P0
milestone: mvp
source: _IDEAS/backlog.md
dependencies: []
---

# Fix chat MCP namespace (ainative→relay) + persisted-approval migration

## Description

The ainative→relay rebrand renamed the chat/compose MCP server key to `relay` in every runtime
adapter **except** `src/lib/chat/engine.ts:508`, which still registers the server under the map key
`ainative`. The Agent SDK derives the tool namespace from the **map key**, so chat/compose publishes
tools as `mcp__ainative__*` — but the same file's allow-list (`engine.ts:510`) and auto-approve /
permission-gating set (`engine.ts:522-533`) only match `mcp__relay__*`. Result: **the auto-allow
branch (`engine.ts:533`) never fires for compose/chat tools, so every tool falls through to a manual
permission prompt.** This is the confirmed root cause behind the J4 compose blockers (constant
Allow-Once gates, no auto-advance — the headline "describe an app → Relay builds it" flow can't
complete through the normal UI).

The fix is **two parts, and shipping them apart silently breaks saved approvals.** Part 1: flip the
`engine.ts:508` key from `ainative:` to `relay:`. Part 2: ship a DB migration rewriting persisted
`agent_profiles.allowed_tools` **and** saved "Always Allow" permission records from `mcp__ainative__*`
→ `mcp__relay__*`. Saved permissions are matched by **exact string** (`permissions.ts:57-65`), and the
existing `stagent→ainative` migration (`migrate-to-ainative.ts:126`) already rewrote these to
`mcp__ainative__*` — there is no `ainative→relay` migration, so flipping the runtime without migrating
the data makes every previously-saved allow-list and "Always Allow" record stop matching.

_Verified 2026-07-01 against current tree: all cited line numbers CONFIRMED accurate._

## User Story

As an agency owner composing an app in chat, I want approved tools to auto-advance and my saved
"Always Allow" choices to persist, so that a multi-artifact compose completes without me re-approving
every tool on every run.

## Technical Approach

- **`src/lib/chat/engine.ts:508`** — change the map key `ainative:` → `relay:` in the `mcpServers`
  object. (The variable is still named `ainativeServer`; renaming it is optional/cosmetic. The
  allow-list at `:510` and gating set at `:522-533` already use `mcp__relay__` — only line 508 is
  stale, so the fix aligns the file with itself.)
- **New migration** — mirror `src/lib/utils/migrate-to-ainative.ts:126` for the ainative→relay hop:
  - `UPDATE agent_profiles SET allowed_tools = REPLACE(allowed_tools, 'mcp__ainative__', 'mcp__relay__') WHERE allowed_tools LIKE '%mcp__ainative__%'`
  - Rewrite saved "Always Allow" permission records the same way (stored via
    `src/lib/settings/permissions.ts:21` `addAllowedPermission`, matched exactly at `permissions.ts:57-65`;
    written on click at `src/lib/chat/tools/notification-tools.ts:108-111`).
  - Wire the migration into the same boot path as the existing one (`src/instrumentation-node.ts`).
- **Cosmetic (optional, separate commit):** rename `src/lib/chat/ainative-tools.ts` module.
- **Smoke-test budget applies** (CLAUDE.md): `engine.ts` is runtime-registry-adjacent. Unit tests that
  `vi.mock` the chat-tools module cannot catch this — must smoke under `npm run dev`.

## Acceptance Criteria

- [x] `engine.ts:508` registers the server under key `relay`; compose tools publish as `mcp__relay__*`.
      _(Done — server key flipped; file now self-consistent: key :511 = allow-list :513 = gate :536 all `relay`.)_
- [x] Auto-allow branch (`engine.ts:533`) fires for non-gated compose tools — verified live: a compose
      run does NOT prompt for an already-allowed tool.
      _(2026-07-01 browser smoke: "list_projects" in chat executed + rendered a projects table with NO
      Allow-Once gate. Pre-fix this tool published as mcp__ainative__* and would have fallen through.)_
- [x] Migration rewrites saved "Always Allow" records from `mcp__ainative__*` → `mcp__relay__*`; a
      pre-fix allow-list still matches post-fix.
      _(2026-07-01 DB smoke: seeded settings.permissions.allow=["mcp__ainative__upload_document","Read"];
      after boot → ["mcp__relay__upload_document","Read"]. Log: "0 profile(s), 1 permission set(s)".)_
      **CORRECTION vs spec:** current Relay has **no `agent_profiles` table** — profiles are file-based
      (`profile.yaml` on disk), and no shipped profile references `mcp__ainative__` (verified). The DB
      profile-column migration is therefore a guarded no-op (kept as defensive future-proofing). The
      only persisted store carrying the namespace is `settings → permissions.allow`.
- [x] `npm run dev` smoke: real chat task auto-advances past a previously-approved tool (no silent
      hang, no re-prompt). _(Verified — see AC #2. No module-load cycle from the engine.ts change.)_

## Scope Boundaries

**Included:**
- The `engine.ts:508` key flip and the ainative→relay data migration for profiles + saved approvals.

**Excluded:**
- The broader compose orchestration bugs (duplicate `create_project`, next-gate-doesn't-auto-surface,
  parallel-tool tangle) — those are `fix-compose-approval-orchestration.md`. This unit unblocks them
  by removing the spurious manual prompts, but does not itself rework the tool loop.
- Idempotent-compose / reuse-existing-project — separate.

## References

- Source: `_IDEAS/backlog.md` — J4 blocker #2 (root-cause entry) + "Code-claim verification".
- Related features: `chat-tools-plugin-kind-1.md`, `chat-engine.md`, `tool-permission-persistence.md`,
  `provider-agnostic-tool-layer.md`.
