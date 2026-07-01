# Relay — HANDOFF

_Last updated: 2026-07-01 (pt: shipped the 3 P0 ICP-walkthrough fixes — customer-link UI,
chat MCP namespace + migration, pack core-version. See git a61f8ad0/1fa0cfba/cdf66e94 +
changelog. Prior pt (backlog groom): git log.)_

## ▶️ NEXT SESSION — continue the ICP fixes
3 of 4 P0s shipped this session. Remaining, in leverage order (see `roadmap.md` → "ICP Walkthrough Fixes"):
1. **`fix-compose-approval-orchestration`** (P0) — NOW UNBLOCKED by the namespace fix (`1fa0cfba`
   removed the spurious manual prompts). Reworks the compose tool loop (dup `create_project`,
   next-gate auto-surface, parallel-tool tangle). Runtime-registry-adjacent → smoke budget applies.
2. **P1s:** `fix-workflow-model-preference-propagation` (smoke budget), `fix-dashboard-budget-vs-cost-labeling`,
   `fix-pack-install-discoverability` (dep: pack-core, now done), `fix-chat-spend-metering-diagnose`
   (reproduce the 0-rows observation — metering code exists).
3. **P2:** `fix-inbox-checkpoint-realtime`.

## Known caveats from this session
- **Profiles are file-based, no `agent_profiles` table** (memory `profiles-are-file-based-not-db`) —
  specs citing `agent_profiles.allowed_tools` are stale; persisted tool-perms live in `settings.permissions.allow`.
- **`fix-compose-approval-orchestration` spec** may carry the same stale `agent_profiles` assumption —
  verify against the tree before implementing (per `verify-walkthrough-findings-before-grooming`).

## Cleanup pending
- `~/.relay-isolated` (6.4M throwaway test DB) — safe to `rm -rf ~/.relay-isolated`.

## Not-started backlog (pre-existing)
- **`/relay/` free-vs-paid boundary not yet in README** — README predates licensing (Website `later 10`).
- **`feat-prepublish-tarball-smoke`** — CI tarball pack-install smoke so the pack-`0.0.0` class can't
  ship again (surfaced by `fix-pack-core-version-resolution`, excluded from its scope).
- **Optional:** npm Publishing → "require 2FA + disallow tokens" on `orionfold-relay` now OIDC works.

## Anchors
- **Strategy repo = read/write only** (memory `strategy-repo-readwrite-only`): edit, NEVER commit/push/merge.
- **Work directly on `main`** — no worktrees/branches unless operator asks (memory `work-on-main-no-worktrees`).
- **npm publishing SOLVED** via OIDC (`.github/workflows/publish.yml` on `vX.Y.Z` tag; `docs/RELEASING.md`).
- **Smoke-test budget** (CLAUDE.md): runtime-registry-adjacent import changes need a real `npm run dev` smoke.

## Recently shipped (durable in git + memory)
- This session: 3 P0 ICP fixes — `cdf66e94` customer-link UI, `1fa0cfba` chat MCP namespace + approval
  migration, `a61f8ad0` pack core-version (build-time embed + bundle-aware getAppRoot). All smoke-verified.
- Prior: ICP backlog verified + groomed → 9 `fix-*` specs; `0.15.1` via OIDC; `ainative-business`
  deprecated. Full detail: git + `_IDEAS/backlog.md` + memory `licensing-fulfilment-workstream`.
