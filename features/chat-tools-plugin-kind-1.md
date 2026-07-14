---
title: Chat Tools Plugin (Kind 1) — MCP as Extension Surface
status: completed
shipped-date: 2026-04-20
priority: P0
milestone: post-mvp
source: ideas/self-extending-machine-strategy.md
dependencies: [primitive-bundle-plugin-kind-5, schedules-as-yaml-registry, chat-engine, provider-runtime-abstraction, runtime-capability-matrix]
---

> **Status: shipped (2026-04-20).** Milestone 3 final-acceptance gate passed.
> Phase 4 live smokes (`internal history record`)
> verified the two-path trust model end-to-end: echo-server self-extension
> classification (T19), `AINATIVE_PLUGIN_CONFINEMENT=1` seatbelt wrap
> activation (T20), `--safe-mode` + `plugin-trust-model = strict|off`
> Settings overrides (T21). TDR-037 promoted to `accepted` in the same
> session. See strategy §15 Amendment 2026-04-20 for the per-feature
> disposition (parked behind flags vs. retained vs. scheduled-for-removal).

# Chat Tools Plugin (Kind 1) — MCP as Extension Surface

## Description

M1 and M2 gave ainative a plugin system for **data-only** primitives — profiles, blueprints, tables, schedules. A bundle ships these as YAML and the loader merges them into existing registries with zero new execution surface. That ceiling is now the limiting factor: the most common "I want my agent to do X" request from early operators is a new **tool** (send a Slack message, query a Notion database, call a private API), not a new profile or blueprint. Today the only path is source modification on a git-clone checkout. Kind 1 plugins close that gap for npx users and git-clone users alike.

This milestone is re-scoped per `ideas/self-extending-machine-strategy.md` Amendment 2026-04-19 (II): **Kind 1 uses MCP as the extension surface**, not the custom `@ainative/plugin-sdk` proposed in original §5. Plugins ship a `.mcp.json` at the bundle root (matching Claude Code's `anthropics/claude-plugins-official` marketplace convention). The MCP server implementation is the plugin author's choice — stdio subprocess (Python / Rust / Node) or in-process SDK via `@modelcontextprotocol/sdk`. Registration reuses the existing `withAinativeMcpServer()` merge path at `src/lib/agents/claude-agent.ts:566`, meaning plugin-shipped MCP servers become one more merge source — not a new runtime surface. Cross-runtime support drops out of the runtime-capability matrix (`src/lib/agents/runtime/catalog.ts`) via a new `supportsPluginMcpServers: boolean` column.

Kind 1 is the **first plugin primitive that ships executable code**, which elevates the trust surface meaningfully. M1's YAML-only bundles could only cause harm through malformed data; a Kind 1 plugin can open sockets, read files, and spawn processes. Ainative's safety overlay — `capabilities: [fs, net, child_process]` declared in `plugin.yaml`, first-load click-accept, hash-pinned `~/.ainative/plugins.lock`, `--safe-mode` CLI flag — is the post-rollback tightening over MCP's install-time trust model (Claude's own `plugin.json` has no capability field). Strategy doc §11 Risk D's off-ramp (Docker for `child_process` capability) remains valid but becomes less urgent for typical plugins: **stdio transport gives free process isolation** — the plugin runs in a separate OS process and cannot read/write ainative's Node heap. In-process SDK MCP servers retain the pre-M3 risk profile; click-accept + lockfile still gates them.

## User Story

As a solo founder running ainative via npx to operate my business, I want to install a `gmail-triage` plugin from a teammate so my CFO profile can actually read unread threads and draft replies, so that ainative moves from "composes prompts" to "composes and executes" for my daily inbox loop — without me learning git, cloning a repo, or editing `src/`.

As a power user on a git-clone checkout who builds small Python utilities for my own workflows, I want to wrap an existing Python script in a stdio MCP server and drop it into `~/.ainative/plugins/my-tool/` so that I reuse the MCP pattern I already use with Claude Code and Codex CLI — ainative does not ask me to learn `@ainative/plugin-sdk` or rewrite my tool in TypeScript.

As a plugin author who cares about distribution, I want the plugin I ship via ainative to ALSO be installable via Claude Code (`/plugin install`) and Codex CLI (`~/.codex/config.toml mcp_servers`) because the `.mcp.json` surface is identical, so that I author once and distribute through whichever tool the user prefers — ainative becomes additive to the ecosystem, not a parallel island.

## Technical Approach

### Plugin manifest schema — additions for `kind: chat-tools`

The M1 manifest Zod schema at `src/lib/plugins/sdk/types.ts` already discriminates on `kind`. M3 adds the `chat-tools` variant via the `z.discriminatedUnion` pattern M2 de-risked:

```typescript
const ChatToolsPluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  apiVersion: z.string().regex(/^\d+\.\d+$/),
  kind: z.literal("chat-tools"),
  name: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
  capabilities: z.array(
    z.enum(["fs", "net", "child_process", "env"])
  ).default([]),
});

export const PluginManifestSchema = z.discriminatedUnion("kind", [
  PrimitivesBundleManifestSchema, // M1
  ChatToolsPluginManifestSchema,  // M3
]);
```

The `capabilities` array is Ainative's safety overlay. The four currently-defined capability strings cover the blast-radius axes that matter: filesystem read/write, outbound network, subprocess spawn, and env-var access. Capabilities are **declarative**, not enforced at runtime by a sandbox — they exist to drive click-accept UI and lockfile hashing. Strategy §10 and §11 are explicit that sandboxing is out of scope.

### Plugin disk layout — additions for Kind 1

M1 established `~/.ainative/plugins/<plugin-id>/plugin.yaml`. M3 adds three things: `.mcp.json`, an optional `server/` directory for in-process SDK servers, and an optional `bin/` directory for stdio server executables. Everything M1/M2 defined stays unchanged — a plugin may legitimately be both `kind: chat-tools` AND carry `profiles/` + `schedules/` as an inline bundle of both kinds.

Wait — actually no. A plugin is **one** kind. A "both kinds" plugin is two plugins in one directory. We do not split manifests. See Scope Boundaries.

```
~/.ainative/plugins/<plugin-id>/
  plugin.yaml                  # kind: chat-tools, capabilities: [net, fs]
  .mcp.json                    # REQUIRED for kind: chat-tools — MCP server config
  server/                      # OPTIONAL — in-process SDK MCP server source
    index.ts                   # exports createServer() using @modelcontextprotocol/sdk
    index.js                   # built output (plugin author's responsibility to build)
  bin/                         # OPTIONAL — stdio transport executables
    server                     # e.g., ./bin/server for a compiled Go/Rust binary
  README.md                    # user-facing install notes, capability rationale
  LICENSE                      # optional
```

The `.mcp.json` follows the MCP server config schema used by Claude Code's `.mcp.json` (consistent with the existing parser at `src/lib/environment/parsers/mcp-config.ts`):

```json
{
  "mcpServers": {
    "gmail-triage": {
      "command": "python",
      "args": ["-m", "gmail_triage_server"],
      "env": {
        "GMAIL_CREDS_PATH": "${HOME}/.ainative/gmail-triage/creds.json"
      }
    }
  }
}
```

For an in-process SDK MCP server, the config uses a transport indicator the plugin loader interprets (not a standard MCP field — this is Ainative-specific):

```json
{
  "mcpServers": {
    "gmail-triage": {
      "transport": "ainative-sdk",
      "entry": "./server/index.js"
    }
  }
}
```

The loader distinguishes transport by presence of `command` (stdio) vs. `transport: "ainative-sdk"` (in-process). Both ultimately reach the runtime adapter's MCP merge path.

### Runtime-capability matrix extension

`src/lib/agents/runtime/catalog.ts` gets a new boolean column:

```typescript
export interface RuntimeCapability {
  // ... existing fields ...
  supportsPluginMcpServers: boolean;
}
```

Per-runtime declared values:

| Runtime | `supportsPluginMcpServers` | Integration point |
|---|---|---|
| Claude Agent SDK | `true` | `withAinativeMcpServer()` at `src/lib/agents/claude-agent.ts:566` — plugin-MCP becomes 4th merge source |
| Codex App Server | `true` | `config.toml [mcp_servers]` via `src/lib/environment/sync/mcp-sync.ts` bi-directional sync |
| Anthropic direct | `true` | New MCP merge site in `src/lib/agents/runtime/anthropic-direct.ts` (uses Anthropic SDK's mcpServers option) |
| OpenAI direct | `true` | New MCP merge site in `src/lib/agents/runtime/openai-direct.ts` |
| Ollama | `false` | No MCP support in Ollama's API; plugins skip Ollama runs with a log note |

The plugin loader branches on this field when deciding whether to emit "plugin tool unavailable on current runtime" during runtime switches. `smart-runtime-router.ts` consumes the field for routing decisions.

### Plugin-MCP loader

**New file:** `src/lib/plugins/mcp-loader.ts`

Responsibilities:

1. For each loaded `kind: chat-tools` plugin, parse `<plugin-root>/.mcp.json`. Reuse shape/validation patterns from `src/lib/environment/parsers/mcp-config.ts` — do not duplicate.
2. Resolve `env` value templates (`${HOME}`, `${AINATIVE_DATA_DIR}`, `${PLUGIN_DIR}`) against current env.
3. For stdio transport: resolve the `command` to an absolute path (relative `./bin/server` → `<plugin-root>/bin/server`). Verify the file exists and is executable. On failure: mark plugin `disabled`, reason `server_not_found`.
4. For `transport: "ainative-sdk"`: resolve `entry` to `<plugin-root>/<entry>`, verify exists. On failure: mark `disabled`, reason `sdk_entry_not_found`.
5. Check capability accept: if `plugin.yaml` declares any `capabilities`, confirm a matching hash entry in `~/.ainative/plugins.lock`. On mismatch: mark `disabled`, reason `capability_not_accepted`.
6. Return a `PluginMcpRegistration[]` the runtime adapters consume:

```typescript
export interface PluginMcpRegistration {
  pluginId: string;
  serverName: string;          // key from .mcp.json mcpServers
  transport: "stdio" | "ainative-sdk";
  config: McpServerConfig;     // normalized — reuses type from existing parser
  status: "active" | "disabled";
  disabledReason?: string;
}
```

All failures are isolated per-plugin: one misconfigured plugin cannot prevent others from loading. Errors go to `$AINATIVE_DATA_DIR/logs/plugins.log` with the plugin id.

### Capability accept flow — `plugins.lock`

**New file format:** `~/.ainative/plugins.lock` (YAML, gitignored at user level, not by ainative)

```yaml
version: 1
accepted:
  gmail-triage:
    manifestHash: "sha256:a3f4b5..."     # SHA-256 of plugin.yaml canonical form
    capabilities: [net]
    acceptedAt: "2026-04-20T09:00:00Z"
    acceptedBy: "user@laptop"             # os.userInfo().username
```

Flow:

1. **Plugin discovered** — loader sees `plugin.yaml` with `capabilities: [net]` but no matching `plugins.lock` entry.
2. **Loader marks plugin `pending_capability_accept`** — plugin is **not** loaded. A notification appears on the Inbox page and a toast in the chat shell.
3. **User reviews** — the Inbox notification opens a sheet showing the plugin's manifest, capability list, README excerpt, and manifest hash. Two buttons: **Accept capabilities** and **Reject**.
4. **On accept** — loader writes a `plugins.lock` entry with the current manifest hash. Next reload passes capability-check and loads the plugin.
5. **On manifest change** — loader recomputes hash at boot. If hash mismatches the `plugins.lock` entry, plugin is suspended (status `capability_accept_stale`), user re-accepts via the same flow. Covers the agent-silently-swaps-bundle scenario from strategy §5.

`--safe-mode` CLI flag (bin/cli.ts) short-circuits this entire path: all `kind: chat-tools` plugins are marked `disabled, reason: safe_mode` and never registered. `--safe-mode` does not affect `kind: primitives-bundle` — data-only plugins carry no capability risk.

### Runtime registration — per adapter

**Claude Agent SDK** (`src/lib/agents/claude-agent.ts`): `withAinativeMcpServer()` currently merges `ctx.payload?.mcpServers + browserServers + externalServers`. Add `pluginServers` (4th source) loaded from `loadPluginMcpServers()`:

```typescript
const mergedMcpServers = await withAinativeMcpServer(
  ctx.payload?.mcpServers ?? {},
  browserServers,
  externalServers,
  pluginServers, // NEW
);
```

Existing precedent at lines 566 and 724.

**Codex App Server** (`src/lib/agents/runtime/codex-app-server-client.ts`): Codex reads MCP servers from `config.toml [mcp_servers]`. Reuse the existing `src/lib/environment/sync/mcp-sync.ts` bi-directional sync — add a third source (plugin) alongside the existing two. When plugins reload, sync runs; Codex App Server restarts pick up the new entries.

**Anthropic direct** (`src/lib/agents/runtime/anthropic-direct.ts`): Anthropic's Messages API accepts `mcp_servers` in request bodies. Merge `pluginServers` into the request payload. First runtime that needs new MCP plumbing.

**OpenAI direct** (`src/lib/agents/runtime/openai-direct.ts`): OpenAI's Responses API accepts `tools: [{type: "mcp", ...}]`. Transform `pluginServers` entries into this shape and merge.

**Ollama** (`src/lib/agents/runtime/ollama.ts`): `supportsPluginMcpServers: false` — plugins are skipped. Log once per session per plugin: `"plugin <id> skipped on ollama runtime"`.

### Reload mechanism — transport-dependent

`reload_plugin({ id })` and `reload_plugins` (M1 chat tools) get transport-aware logic for `kind: chat-tools`:

- **stdio transport:** the server is a managed child process owned by ainative. On reload: SIGTERM the existing process, wait up to 5s for clean exit, SIGKILL if needed, respawn from the new manifest. Runtime adapters see the new server on their next request.
- **ainative-sdk (in-process) transport:** `delete require.cache[require.resolve(absPath)]`, re-require, re-register. Same pattern M1 plans for but never needed (M1 has no code execution).

Both paths emit a `plugin:reloaded` log entry. Partial failure (one plugin's reload fails) does not abort the batch — the failed plugin goes to `disabled` and boot continues.

### `--safe-mode` CLI flag

**Modification:** `bin/cli.ts` parses `--safe-mode` (alongside existing `--port`, `--no-open`). When set, exports `AINATIVE_SAFE_MODE=true` into the spawned Next.js process. The plugin-MCP loader reads the env var and short-circuits all `kind: chat-tools` plugin loads.

`--safe-mode` is a boot-time flag. There is no runtime toggle in Settings in v1 — strategy §13 flags this as a follow-up consideration; deferring keeps M3 scope tight. The existing `npx ainative-business --safe-mode` invocation works identically on git-clone via `node dist/cli.js --safe-mode`.

### Chat tools — additions and modifications

M1 shipped three plugin chat tools (`list_plugins`, `reload_plugins`, `reload_plugin`). M3 **extends** these rather than adding a fourth tier of parallel tools:

- **`list_plugins` response adds:** per-plugin `toolCount`, `transport`, `capabilities[]`, `capabilityAcceptStatus` (`accepted` / `pending` / `stale`).
- **`reload_plugin({ id })` extends:** handles transport-aware reload for Kind 1 as described above.

**One new chat tool:** `grant_plugin_capabilities({ pluginId })`. Invoked from the Inbox notification sheet or directly by name. Writes the `plugins.lock` entry and triggers a `reload_plugin` for the now-accepted plugin. Logs the user + timestamp to `plugins.log`.

All chat tools use dynamic `await import("@/lib/plugins/registry")` and `await import("@/lib/plugins/mcp-loader")` inside handler bodies per TDR-032. Static imports would re-introduce the module-load cycle pattern the T18 smoke ship-verified in M1 and M2.

### `gmail-triage` dogfood plugin

The reference Kind 1 plugin. Ships a stdio MCP server implementing three tools:

- `gmail_list_unread({ limit })` → returns unread thread summaries
- `gmail_get_thread({ threadId })` → returns full thread content
- `gmail_draft_reply({ threadId, body })` → creates a draft in Gmail (does not send)

Manifest:

```yaml
id: gmail-triage
version: 0.1.0
apiVersion: "0.14"
kind: chat-tools
name: Gmail Triage
description: |
  Read unread Gmail threads and draft replies. Uses OAuth credentials
  stored at $AINATIVE_DATA_DIR/gmail-triage/creds.json.
author: ainative
capabilities: [net]        # Gmail API HTTPS calls
tags: [inbox, email]
```

Implementation shipped as a Python stdio server under `src/lib/plugins/examples/gmail-triage/` following the first-boot-copy pattern from M1's finance-pack. Users without Python installed see a graceful `disabled, reason: server_not_found` and a README link to `README.md` with setup instructions. The dogfood is proof-of-pattern, not a core product feature.

### Per-tool approval overlay (Codex-style)

Separate from install-time capability accept, **per-tool approval** gates each individual tool call at invocation time. Three modes stored in `plugins.lock` as `toolApprovals: Record<toolName, "never" | "prompt" | "approve">`:

- `"never"` — auto-allow (trusted), no user prompt
- `"prompt"` — elicitation-backed ask-each-time via MCP SEP-1036 form mode
- `"approve"` — blocking modal before invocation

Default for first install: all plugin tools land in `"prompt"` mode. User can flip individual tools to `"never"` after observing benign behavior (trust ramp). This reuses ainative's existing `tool-permission-persistence` UI surface and `handleToolPermission` hook in `src/lib/agents/claude-agent.ts:618` — no new UI from scratch.

Chat tool: `set_plugin_tool_approval({ pluginId, toolName, mode })`. Defaults adjustable globally via plugin-level `defaultToolApproval` field in `plugin.yaml`.

### Capability expiry (opt-in)

`plugins.lock` entries may carry an optional `expiresAt` field. When set and current time exceeds it, plugin transitions to `pending_capability_reaccept` (same suspended state as manifest-hash drift). Default: no expiry (matches Claude Code / Codex CLI conventions).

User opts in via chat tool `set_plugin_accept_expiry({ pluginId, days })` where days ∈ `{30, 90, 180, 365}`. Expiry is pure upside for paranoid users; notification fatigue prevention for everyone else keeps default off.

### Revocation flow

Chat tool `revoke_plugin_capabilities({ pluginId })` — inverse of `grant_plugin_capabilities`. Removes the `plugins.lock` entry, SIGTERMs any running stdio child, marks plugin `pending_capability_accept`. Inbox notification confirms revocation with re-accept prompt for next use.

### Confinement modes (OS-level subprocess isolation)

For stdio transport plugins, `plugin.yaml` may declare `confinementMode` to wrap the spawn with platform-appropriate isolation:

| Mode | Platform | Mechanism |
|---|---|---|
| `"none"` | all | Direct spawn. DEFAULT. Matches current behavior |
| `"seatbelt"` | macOS | `sandbox-exec -p <profile>` prefix. Capability-scoped policy |
| `"apparmor"` | Linux | AppArmor profile or `bwrap`. Capability-scoped policy |
| `"docker"` | all (requires Docker) | `docker run --rm -i <image> <command>`. Strategy §11 Risk D off-ramp |

Confinement is the *enforcement* layer — capabilities become actual scope constraints rather than labels. Ainative ships per-capability policy profiles under `src/lib/plugins/confinement/profiles/` (e.g., `seatbelt-net.sb` allows `*.googleapis.com`, denies fs writes and fork). Plugin authors may override with custom profile reference.

`confinementMode: "docker"` scopes the strategy §11 Risk D off-ramp before the leading indicator fires (first external plugin declaring `[child_process]`). Plugin author ships a `Dockerfile`; ainative does NOT build images (plugin author's release step). Pinning by sha256 digest is recommended; `:latest` tags rejected with a warning.

Unsupported mode on current platform → plugin `disabled, reason: confinement_unsupported_on_platform` with clear Inbox message. See `docs/plugin-security.md` for the full confinement matrix and policy-profile authoring guide.

### Core security posture (summary)

1. **Stdio transport process isolation** — OS-level, free with stdio. Plugins cannot touch ainative's heap.
2. **Capability declaration + click-accept + lockfile pinning** — Ainative's overlay on MCP's install-time trust model. Hash drift suspends the plugin.
3. **Per-tool approval overlay** — Codex-style `never`/`prompt`/`approve` per tool. Second gate beyond install-time.
4. **Confinement modes** — opt-in OS-level enforcement via seatbelt/AppArmor/Docker. Transforms capability labels into actual constraints.
5. **Namespacing is mandatory** — MCP's `mcp__<server>__<tool>` prevents collision with 87 builtin chat tools.
6. **`--safe-mode`** — boot-time kill switch. All plugins disabled. For audit and incident response.
7. **MCP elicitation (SEP-1036)** — form and url modes plug into the `canUseTool` callback. Per-invocation consent.
8. **Revocation** — chat-tool revoke removes lockfile entry, kills child, suspends plugin.
9. **Optional capability expiry** — opt-in re-prompt cadence for dormant plugins.
10. **Log trail** — every load/reload/disable/accept/revoke event to `plugins.log`. Post-incident reviewable.

Detailed layered-defense walkthrough + policy-profile authoring: see `docs/plugin-security.md`.

### Cross-platform notes

- Stdio server paths use `path.join` throughout. Windows `server.exe` vs. Unix `server` extensions handled by the plugin author (we do not auto-append `.exe`).
- Plugin IDs normalized to lowercase at read (M1 convention).
- `plugins.lock` path computation uses `os.homedir()`, works on all three platforms.
- Stdio child-process spawn uses `spawn` (not `exec`) to avoid shell-quoting issues; args are passed as an array.
- Long-running stdio children run with `stdio: ["pipe", "pipe", "pipe"]` so stderr logs stream into ainative's log aggregator.

### Boot sequence

Plugin MCP loading fits between M1's plugin loader and scheduler startup (M2's invariant):

```
0. Next.js spawn
1. migrateLegacyData()
2. ensureInstance()
3. runPendingMigrations()
4. loadProfiles()
5. loadBlueprints()
6. loadPlugins()                         — M1, unchanged
   - for each plugin: validate manifest, namespace primitives
7. loadPluginMcpServers()                — NEW, this feature
   - for each kind: chat-tools plugin: parse .mcp.json, resolve paths,
     check capability accept, spawn stdio children OR import SDK servers,
     register with runtime adapters via catalog matrix
   - failures: disable, log, continue
8. startUpgradePoller()
9. startScheduler()                      — M2 invariant: schedules loaded before this
10. startChannelPoller()
11. startAutoBackup()
12. startHistoryCleanup()
```

Stdio child processes are long-lived — they spawn once at step 7 and remain until reload or ainative shutdown. A graceful shutdown handler in `src/instrumentation-node.ts` SIGTERMs them on process exit.

## Acceptance Criteria

- [ ] `PluginManifestSchema` at `src/lib/plugins/sdk/types.ts` accepts `kind: "chat-tools"` via discriminated union, including `capabilities: []` and related fields; rejects `kind: chat-tools` manifests that lack `.mcp.json` at load time
- [ ] `src/lib/plugins/mcp-loader.ts` scans all `kind: chat-tools` plugins, parses `.mcp.json`, resolves env templates, verifies executables/entries exist, returns `PluginMcpRegistration[]` with per-plugin status
- [ ] Plugins with unaccepted capabilities land in status `pending_capability_accept` and are NOT started — appear in `GET /api/plugins` with that status and in the Inbox with a review sheet
- [ ] `plugins.lock` at `$AINATIVE_DATA_DIR/plugins.lock` stores `{ manifestHash, capabilities, acceptedAt, acceptedBy }` per accepted plugin; absent before first accept
- [ ] `grant_plugin_capabilities({ pluginId })` chat tool writes a `plugins.lock` entry and triggers `reload_plugin({ id })`; guards against hash drift between the sheet view and accept click
- [ ] Manifest-hash drift after acceptance suspends the plugin to status `capability_accept_stale` and surfaces a re-accept prompt
- [ ] `supportsPluginMcpServers: boolean` column added to `src/lib/agents/runtime/catalog.ts`; declared values are Claude SDK `true`, Codex App Server `true`, Anthropic direct `true`, OpenAI direct `true`, Ollama `false`
- [ ] Claude SDK runtime merges plugin-shipped MCP servers as a 4th argument to `withAinativeMcpServer()`; existing three merge sources unaffected
- [ ] Codex App Server picks up plugin MCP entries via `src/lib/environment/sync/mcp-sync.ts` — sync writes to `config.toml [mcp_servers]` on plugin load and strips them on disable
- [ ] Anthropic direct and OpenAI direct runtime adapters accept and forward plugin MCP servers via their respective SDK surfaces
- [ ] Ollama runtime logs `"plugin <id> skipped on ollama runtime"` once per plugin per session and runs without errors
- [ ] stdio transport plugins: child process spawns at boot (step 7), SIGTERMs on reload, respawns with new config, SIGKILLs after 5s if unresponsive
- [ ] In-process SDK transport plugins: `require.cache` bust on reload, re-import, re-register without restarting ainative
- [ ] `--safe-mode` CLI flag disables all `kind: chat-tools` plugin loading; `kind: primitives-bundle` plugins continue to load normally
- [ ] `list_plugins` response includes per-plugin `toolCount`, `transport`, `capabilities`, `capabilityAcceptStatus`; `reload_plugin` handles transport-aware reload
- [ ] `gmail-triage` dogfood plugin ships at `src/lib/plugins/examples/gmail-triage/`, first-boot-copies to `$AINATIVE_DATA_DIR/plugins/gmail-triage/`, registers three MCP tools when the user grants `[net]` capability
- [ ] Per-tool approval: `plugins.lock` `toolApprovals: Record<toolName, "never"|"prompt"|"approve">` — first install defaults to `"prompt"`; `set_plugin_tool_approval` chat tool flips modes; `canUseTool` honors the per-tool decision before invoking
- [ ] Capability expiry: `plugins.lock` optional `expiresAt` field; when set and past, plugin transitions to `pending_capability_reaccept`; `set_plugin_accept_expiry({ pluginId, days })` chat tool supports `{30, 90, 180, 365}`; default is no expiry
- [ ] Revocation: `revoke_plugin_capabilities({ pluginId })` chat tool removes `plugins.lock` entry, SIGTERMs stdio child (5s SIGKILL fallback per TDR-035), marks plugin `pending_capability_accept`, emits Inbox notification
- [ ] Confinement modes: `plugin.yaml` accepts `confinementMode: "none"|"seatbelt"|"apparmor"|"docker"` (default `"none"`); unsupported mode on current platform disables with `reason: confinement_unsupported_on_platform`
- [ ] Confinement profiles: `src/lib/plugins/confinement/profiles/` ships per-capability policy profiles for seatbelt + AppArmor; Docker path substitutes `docker run --rm -i <image> <command>` and labels containers `-l ainative-plugin=<id>` for orphan cleanup
- [ ] `docs/plugin-security.md` ships as the user-visible security model doc; linked from Inbox capability-accept sheet and `plugins.log` error messages
- [ ] Plugin tool names are prefixed `mcp__<server>__<tool>` via MCP's native convention; collision with a builtin ainative chat tool is rejected with a clear error, not silently shadowed
- [ ] Real `npm run dev` smoke (per CLAUDE.md runtime-registry-adjacent budget rule): install gmail-triage, grant capabilities, make a chat request that triggers `mcp__gmail-triage__gmail_list_unread`, observe the tool call fires and returns; edit the plugin's `.mcp.json`, reload, observe the new config without restarting ainative
- [ ] Plugin-MCP failures (unreachable binary, capability mismatch, .mcp.json parse error) do not prevent ainative boot — plugins individually land in status `disabled` with a reason
- [ ] Install-path parity: identical behavior on npx (`$AINATIVE_DATA_DIR=~/.ainative-<folder>/`) and git-clone (`$AINATIVE_DATA_DIR=~/.ainative/`) — no install-path branches in the loader or runtime adapters

## Scope Boundaries

**Included:**
- `kind: chat-tools` plugin manifest variant with `capabilities[]` overlay
- `.mcp.json` at plugin root as the MCP server configuration
- Both stdio and in-process SDK (ainative-sdk) transports
- Plugin-MCP loader at `src/lib/plugins/mcp-loader.ts`
- Runtime-capability matrix column for per-adapter plugin-MCP support
- Cross-runtime registration: Claude SDK, Codex App Server, Anthropic direct, OpenAI direct (4 of 5; Ollama opted out)
- `plugins.lock` hash-pinned capability accept flow with Inbox notification
- `grant_plugin_capabilities` chat tool
- `--safe-mode` CLI flag (boot-time kill switch)
- Transport-aware reload via existing `reload_plugin` / `reload_plugins`
- `gmail-triage` dogfood plugin (stdio Python server, `[net]` capability)
- MCP elicitation (SEP-1036, form + url modes) wired through Claude SDK's `canUseTool` callback

**Excluded:**
- **Mixed-kind plugins** — a bundle is ONE kind. A plugin wanting to ship both data primitives AND chat tools is authored as two side-by-side plugins (`finance-pack-data` + `finance-pack-tools`). Cross-plugin references are still forbidden per M1.
- **Node `vm`-isolation for in-process SDK plugins** — rejected. Perception ≠ reality. Node's `vm` module explicitly states it is NOT a security boundary. 2026 baseline doesn't change this. Strategy §10 binding.
- **Worker-thread isolation for in-process SDK plugins** — deferred post-M5. stdio transport covers isolation adequately for M3. Revisit if in-process SDK perf demands lower-overhead isolation.
- **Network-scope DNS allowlist per capability** — deferred. Requires confinement enforcement (shipped in M3) to be useful as policy. Manifest schema reserves `capabilities: [{ net: ["*.example.com"] }]` shape for future extension.
- **Plugin signing / code-signing / marketplace** — rolled back 2026-04-12, rejected by strategy §10. Users install by copying the plugin directory. Sharing is `rsync -a ~/.ainative/plugins/gmail-triage other-machine:~/.ainative/plugins/` plus manual capability accept on target.
- **PII sanitization pipeline for plugin I/O** — strategy §10 binding. Users sanitize or they don't. Ainative is not a middleman.
- **Plugin dependency deduplication** — each stdio MCP plugin is its own process tree with its own deps. Duplication is a plugin-author concern, not an ainative one.
- **Runtime Settings toggle for `--safe-mode`** — v1 is CLI-flag only. Strategy §13 flags this for later consideration.
- **Ollama plugin-MCP support** — Ollama's API does not accept MCP servers. Flag stays `false` until Ollama adds the surface.
- **Automatic plugin upgrade check** — no "newer version available" signal. Users replace the directory manually. Revisit if the plugin corpus grows.
- **Plugin-side tool permissions** — tools requested via MCP inherit ainative's permission system; plugins do NOT get to override `ask`/`allow`/`deny` per-tool. `canUseTool` callback owns this surface.
- **Cross-plugin `require()` from in-process SDK servers** — each in-process plugin gets its own `require.cache` namespace (via module-path manipulation) so one plugin cannot monkey-patch another's exports.
- **TypeScript source shipping** — plugins ship built artifacts (`server/index.js`). Authors may author in TypeScript but must build. Strategy Amendment 2026-04-19 (II) marks the TS-authoring open decision resolved.
- **`/apps` UI for Kind 1 plugin management** — UI work lives in M4 (nl-to-composition-v1) or later. v1 surfaces are: Inbox notification for capability accept, chat tools (`list_plugins`, `grant_plugin_capabilities`, `reload_plugin`), `GET /api/plugins` for debugging.
- **Tool-search lazy loading** — Claude Code's MCP Tool Search (95% context reduction via lazy load) is out of scope for v1; plugin tools eagerly register. Revisit if plugin corpus pushes context.
- **Anthropic's capability-free plugin.json format** — we deliberately diverge. Ainative's `plugin.yaml` with capabilities is stricter.

## References

- Source: internal self-extending-machine strategy §5 (plugin primitive — revised by Amendment 2026-04-19 (II)), §9 Milestone 3, §10 (non-goals), §11 Risk D (plugin trust model — reduced for stdio), §13 (open decisions — TS authoring resolved)
- Strategy amendment: §9 "Amendment 2026-04-19 (II) — MCP as the Kind 1 extension surface" — supersedes original §5 Kind 1 contract
- Security model EXPAND brainstorm (internal history) — sourced per-tool approval overlay, capability expiry, revocation flow, confinement modes, Docker off-ramp scope, 10-row Error & Rescue Registry, 5 delight opportunities. Its six M3 scope additions are incorporated above.
- Depends on: [`primitive-bundle-plugin-kind-5`](primitive-bundle-plugin-kind-5.md) — the plugin loader, manifest Zod discriminated union, boot integration, first-boot seeder pattern, `reload_plugin` / `reload_plugins` chat tools
- Depends on: [`schedules-as-yaml-registry`](schedules-as-yaml-registry.md) — the `scanBundleSection<T>` generic helper, `z.discriminatedUnion` manifest pattern
- Depends on: [`chat-engine`](chat-engine.md) — MCP server merge path via `withAinativeMcpServer()`
- Depends on: [`provider-runtime-abstraction`](provider-runtime-abstraction.md) — runtime adapter layer
- Depends on: [`runtime-capability-matrix`](runtime-capability-matrix.md) — the capability-matrix shape M3 extends with `supportsPluginMcpServers`
- Reuses: `src/lib/environment/parsers/mcp-config.ts` (.mcp.json parser), `src/lib/environment/sync/mcp-sync.ts` (cross-tool MCP sync), `src/lib/agents/claude-agent.ts:566` (`withAinativeMcpServer` merge site)
- Architecture: new files at `src/lib/plugins/mcp-loader.ts`, `src/lib/plugins/capability-check.ts`, `src/lib/plugins/examples/gmail-triage/`; modifications to `src/lib/plugins/sdk/types.ts`, `src/lib/plugins/registry.ts`, `src/lib/agents/runtime/catalog.ts`, `src/lib/agents/runtime/anthropic-direct.ts`, `src/lib/agents/runtime/openai-direct.ts`, `src/lib/agents/runtime/codex-app-server-client.ts`, `src/lib/chat/tools/plugin-tools.ts`, `src/instrumentation-node.ts`, `bin/cli.ts`
- Related (later milestones):
  - [`nl-to-composition-v1`](nl-to-composition-v1.md) (M4) — the chat flow that can now emit Kind 1 plugin scaffolds end-to-end
  - [`install-parity-audit`](install-parity-audit.md) (M5) — release gate
- TDR-032 (`.agents/skills/architect/references/tdr-032-*`) — module-load-cycle discipline; all new chat tool handlers and the plugin-MCP loader MUST use dynamic `await import()` at call site
- TDR-034 (`.agents/skills/architect/references/tdr-034-kind-5-plugin-loader.md`) — inherited load-bearing decisions from M1
- TDR-035 (`.claude/skills/architect/references/tdr-035-plugin-mcp-cross-runtime-contract.md`, drafted 2026-04-19) — plugin-MCP cross-runtime registration contract. Codifies the six load-bearing decisions: five-source merge order, plugin-MCP loader as authoritative source, capability-accept lockfile hash derivation, transport dispatch, reload semantics per transport, process ownership and lifecycle. Future runtime additions (Gemini, DeepSeek) follow the six-step recipe in the TDR
- Rolled-back precursor: `features/roadmap.md` "App Marketplace — Extended Primitives" section (`app-mcp-server-wiring` specifically, deferred 2026-04-12). This feature picks up the MCP-wiring pattern deliberately without the trust-ladder and marketplace chrome.
