# Changelog

## Renamed from stagent

This project was formerly published as `stagent` on npm and hosted at `github.com/manavsehgal/stagent`. As of 2026-04-17 it is `ainative`. The old GitHub URL redirects permanently; `stagent` on npm is deprecated with an upgrade pointer to `ainative`.

## [0.15.3] — 2026-07-01

### Added

- **`--hostname` flag** — the CLI can now bind to a host other than loopback, e.g. `npx orionfold-relay --hostname 0.0.0.0` to expose Relay on the LAN (requested for headless/Alpine deployments). Defaults to `127.0.0.1`. Because Relay is local-first with no network authentication, binding to a non-loopback host prints a security warning, and the auto-open browser step opens the loopback URL (a `0.0.0.0` address isn't browsable). The host is forwarded to Next's `--hostname` and reflected in the startup URL.

## [0.15.2] — 2026-07-01

### Fixed

- **WSL/UNC-path crash on first run** ([#1](https://github.com/orionfold/relay/issues/1)) — running `npx orionfold-relay` from a `\\wsl.localhost\...` UNC path made `CMD.EXE` silently reset the working directory to `C:\Windows`. The first-run `.env.local` auto-writer then threw an unhandled `EPERM` writing to that protected directory and crashed the CLI before it could start. The auto-write is now non-fatal: on failure it warns, falls back to the default `~/.relay` data directory, and (for a Windows-dir cwd) prints WSL-specific guidance to relaunch from the Linux filesystem.

## [0.14.0] — 2026-05-05

Batched release covering the Self-Extending Machine M1–M5 milestone arc plus three net-new product surfaces (Apps, Conversation Branches, Plugins). 247 commits, 731 files changed, +72,735 / −1,209 lines since 0.13.2. No breaking changes.

The unreleased `0.13.3` entry below is folded into this release — that fix shipped to `main` but was never published to npm, so end users move from `0.13.2` straight to `0.14.0`.

### Added — Apps platform

- **Composed apps** — a new top-level `/apps` route plus `/apps/[id]` detail view that bundles existing primitives (agent profiles, workflow blueprints, user tables, schedules, document routing) into focused, kit-aware experiences. There is no new code in an app — only a YAML manifest at `~/.ainative/apps/[id]/manifest.yaml` referencing existing primitives by slug.
- **Six kits** — Tracker, Coach, Ledger, Inbox, Research, Workflow Hub — each with a distinct visual layout and intent. The kit reflects the *purpose* of an app, not just its data shape.
- **Starters showcase** — one starter per kit on the Apps page; clicking a starter opens a chat conversation pre-seeded with a manifest-authoring prompt.
- **Manifest authoring tools** — three chat tools (`set_app_view_kit`, `set_app_view_bindings`, `set_app_view_kpis`) let users edit a composed app's view configuration via natural language without ever opening a YAML file.
- **Manifest trigger dispatch** — apps can fire a workflow blueprint on row-insert, with `{{row.<col>}}` template resolution and notification on dispatch failure.
- **Apps API** — `/api/apps`, `/api/apps/[id]` for CRUD; `listAppsCached` with 5-second TTL and invalidation on manifest mutations.
- **Apps registry seeded with 6 starters** (one per kit) plus dogfood examples for reading-radar and others.

### Added — Conversation Branches (chat)

- **Rewind / Redo / Branches** — a chat conversation can be rewound to any prior message (⌘Z), redone (⌘⇧Z), or branched at any turn. Branches are persisted with a tree visualization in the branches dialog.
- **API surface** — `/api/chat/conversations/[id]/rewind`, `/redo`, `/branches`, plus `/api/chat/branching/flag` for opt-in.

### Added — Plugins (Self-Extending Machine M3, kind-1)

- **MCP-as-extension surface** — third-party and self-authored plugins ship a `.mcp.json`; registration reuses the existing `withAinativeMcpServer()` plumbing instead of a custom plugin SDK.
- **Plugin API** — `/api/plugins`, `/api/plugins/scaffold`, `/api/plugins/reload`. Self-authored plugins get zero-ceremony registration; third-party plugins flow through the M3 trust pipeline (gated behind flags).

### Added — Self-Extending Machine M4.5 (nl-to-composition-v1)

- **Natural-language → composition pipeline** in chat: pattern-based 3-verdict intent classifier, primitive map (keyword → profile + blueprint), composition hint builder (advisory system-prompt block), scaffold-path short-circuit in `engine.sendMessage`, and `ExtensionFallbackCard` rendering for unhandled cases.

### Added — Self-Extending Machine M5 (install-parity-audit)

- **npm publish parity audit** — `npm files` array now includes `book/chapters/` and `ai-native-notes/*.md` so an `npx`-installed instance has feature parity with a `git clone` instance (book reader and notes browser both work).

### Added — Other

- **Onboarding runtime provider choice (P2)** — first-launch flow asks the user to pick OAuth vs. API key, then auto-writes `.env.local` accordingly.
- **Task turn observability** — `tasks` table gains `turnCount` and `tokenCount` columns; agent runs report cumulative turn and token usage per task.
- **Schedule auto-stagger** — collision prevention now active in the schedule UI; same-cadence schedules get auto-jittered start offsets.
- **App-composition guidance** for new users on dashboard + chat.
- **Relationship cards** on tasks/projects show document counts.
- **View-kit shape inference** — `hasMessageShape`, `hasNotificationShape`, hero-table consultation rules for inbox kit selection.
- **Profile synthesis from app manifests** — inline profile refs in app manifests are auto-registered.
- **Reading-radar dogfood plugin bundle** + smoke handoff scripts.

### Changed

- **Database schema** — additive only. New migration `0027_add_tasks_context_row_id.sql` adds `context_row_id` to `tasks`.
- **Workflows engine** — stamps `tasks.context_row_id` from workflow definition; `instantiateBlueprint()` accepts `metadata._contextRowId`.
- **Runtime errors** — `NoCompatibleRuntimeError` now names the profile + runtime gap so users see exactly which combination failed.
- **App view editor** — `AppViewEditorCard` renders proposed view changes; clicking Apply rewrites the manifest atomically.

### Fixed

- **Settings → Instance no longer shows a false "setup incomplete" warning on npx installs.** The bootstrap correctly skips when there's no `.git/` directory (per `ensureInstance()`'s decision tree), but the Settings UI was treating that skip as a failure. `GET /api/instance/config` now returns `skippedReason: "no_git"` in the npx case, and the `InstanceSection` component renders an accurate "npx install — upgrade via `npx ainative-business@latest`" notice instead of the amber warning and dead-end "Run setup" button. *(Originally prepared as 0.13.3; folded into this release.)*
- **Apps cache invalidation on manifest mutations** — manifest writes now correctly invalidate `listAppsCached` so the gallery never shows stale entries.
- **Apps dispatcher resilience** — tolerates `listAppsWithManifestsCached` failures and writes a notification on dispatch failure rather than silent drop.
- Various test-infrastructure fixes (40 enrichment-planner unit tests + 11 route tests, M4.5 compose-path Skill-deny coverage, etc.).

### Compatibility

- No breaking changes. Existing `~/.ainative/` data directories, agent profiles, workflow blueprints, and chat conversations continue to work without migration.
- `~/.ainative/apps/` is a new directory that is created lazily on first app install.
- Plugin trust for third-party MCPs remains gated behind flags pending future hardening.

## [0.13.2] — 2026-04-18

### Fixed

- **`npx ainative-business` isolated-data-dir Fix button now persists.** The CLI previously used Next.js-style env precedence (shell env wins over `.env.local`), so a stale `AINATIVE_DATA_DIR` shell export silently defeated the sidebar's Fix action on every restart. `bin/cli.ts` now treats the launch folder's `.env.local` as authoritative, matching a CLI launcher's semantics.

### Changed

- **First-run auto-writer.** The first `npx ainative-business` invocation in a non-dev folder now writes `.env.local` with `AINATIVE_DATA_DIR=~/.<folder>` automatically. New users see a green data-dir chip on first launch — no red badge, no manual Fix click, no restart cycle. Skipped in the main dev repo (`AINATIVE_DEV_MODE` / `.git/ainative-dev-mode` gates) and when the user has already chosen an explicit shell override.
- **Clearer post-Fix copy.** The sidebar's "restart to apply" hint now reads "Ctrl-C, then re-run npx ainative-business" so users know the exact action.

### Added

- Regression coverage: `src/lib/__tests__/cli-env-local.test.ts` — 6 subprocess tests for `.env.local` precedence, auto-writer happy path, and every skip condition.

## [0.12.1] — 2026-04-18

### Changed

- **npm package renamed** from `ainative` to `ainative-business`. Install with `npm i ainative-business` or run `npx ainative-business`. The CLI binary remains `ainative`.
- **Brand wordmark** added — new `AinativeWordmark` component used in dashboard welcome and sidebar header.
- **Icon set refreshed** — `public/icon-512.png`, `public/ainative-s-64.png`, `public/ainative-s-128.png` updated to the new visual identity.
- **Skill naming convention** documented in `book-updater`, `doc-generator`, and `user-guide-sync` SKILL.md files.

### Unchanged

- Runtime behavior, CLI subcommands, SQLite schema, agent contracts, workflow blueprint format.

## [0.12.0] — 2026-04-17

### Changed — BREAKING

- **Package renamed** from `stagent` to `ainative`. Install with `npm i ainative` or run `npx ainative`. The `stagent` npm package is deprecated.
- **GitHub repo renamed** to `manavsehgal/ainative`. Old URL redirects permanently.
- **Homepage** is now [ainative.business](https://ainative.business).
- **User data directory** auto-migrates from `~/.stagent/` to `~/.ainative/` on first boot. The database file inside is also renamed (`stagent.db` → `ainative.db`), and in-place SQL migrations rewrite `mcp__stagent__*` tool prefixes and `sourceFormat: "stagent"` enum values in `agent_profiles` rows. Pre-flight backup recommended: `cp -r ~/.stagent ~/.stagent.bak-pre-ainative`.
- **Environment variables renamed** to `AINATIVE_DATA_DIR`, `AINATIVE_DEV_MODE`, `AINATIVE_INSTANCE_MODE`, `AINATIVE_LAUNCH_CWD`. Clean break — update any shell aliases, `.env.local`, or CI configurations.
- **macOS Keychain service** renamed from `stagent` to `ainative`. The migration pass copies the existing entry best-effort; OpenAI Codex OAuth re-login may be required on failure.
- **MCP tool prefix** for Stagent's internal tool server changed from `mcp__stagent__*` to `mcp__ainative__*`. User-authored agent profiles referencing the old prefix are auto-migrated.
- **Agent profile `sourceFormat`** enum value `"stagent"` accepted as a read-side alias (normalized to `"ainative"` on parse) — externally-authored profile YAML files in other repos continue to import without modification.

### Unchanged

- Runtime behavior.
- CLI commands and subcommands (just the binary name changed: `stagent` → `ainative`).
- SQLite schema, migration numbering, and data layout.
- Agent runtime contracts, tool shapes, and workflow blueprint format.
