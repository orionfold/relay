---
id: TDR-035
title: Loader-Authority Cross-Runtime Contract (née Plugin-MCP Cross-Runtime Registration)
status: proposed
date: 2026-04-19
updated: 2026-04-20
category: runtime
---

# TDR-035: Loader-Authority Cross-Runtime Contract

> **Title-rescope 2026-04-20 (TDR-037):** Originally "Plugin-MCP Cross-Runtime Registration Contract". The six load-bearing decisions below apply to loader/adapter separation regardless of which trust path (self-extension or third-party) a plugin takes. The drift heuristic tests codify **loader authority** — that only `src/lib/plugins/*` reads `plugin.yaml` / `plugins.lock`, that adapters merge servers without parsing manifests — which remains true whether or not a given bundle has a lockfile entry. Existing content below preserved verbatim; see TDR-037 for the two-path trust model that sits on top of this contract.

## Context

Milestone 3 of the self-extending machine strategy (`features/chat-tools-plugin-kind-1.md`) adds **Kind 1 chat-tool plugins** — the first plugin kind that ships executable code. The original strategy §5 proposed a custom `@ainative/plugin-sdk` with `definePlugin` / `defineTool` / Zod-to-JSONSchema. The 2026-04-19 (II) amendment to the strategy doc re-scoped around **MCP as the extension surface** after live research and a codebase grep confirmed three independent signals:

1. **Claude Code ships plugin-bundled MCP servers via `.mcp.json`** (the `anthropics/claude-plugins-official` marketplace convention). No custom SDK surface.
2. **Codex CLI accepts MCP servers via `~/.codex/config.toml [mcp_servers]`** with per-tool approval modes.
3. **Ainative already merges MCP servers via `withAinativeMcpServer()` at `src/lib/agents/claude-agent.ts:70` (definition) and lines 566 / 724 (two call sites).** The helper takes profileServers + browserServers + externalServers + projectId, dynamically imports the ainative tool server, and merges all four into a single `mcpServers` object passed to the Claude Agent SDK.

Adopting MCP-as-surface means a **plugin-shipped MCP server becomes a 4th merge source** at that existing helper. The Ainative-as-last-merge spread order preserves builtin tool precedence: `{ ...profileServers, ...browserServers, ...externalServers, ...pluginServers, ainative: ainativeServer }`. One line of new code at the merge site for the Claude SDK runtime.

That sounds simple. It isn't. Ainative supports **five runtime adapters** today (Claude Agent SDK, Codex App Server, Anthropic direct, OpenAI direct, Ollama), each with a different mechanism for MCP registration — and the job of M3 is to wire plugin-MCP through four of them (Ollama opts out because its API doesn't accept MCP servers). Without a codified contract, each adapter's author will make three decisions independently: **how to discover plugin servers, where in the adapter's lifecycle to register them, and how to coordinate with the existing MCP merge sources already in each adapter.** A future sixth runtime (Gemini, DeepSeek, or an as-yet-unnamed local inference stack) will re-derive those three decisions yet again. The cost is not the per-adapter wiring — it's the drift that accumulates across adapters when each one invents its own merge order, error-isolation shape, and reload contract.

TDR-034 codified the Kind-5 loader's four load-bearing decisions (namespacing, composite-id table storage, sync loader with dynamic-import asymmetry, per-plugin error isolation). TDR-035's job is the parallel codification for Kind-1: the **cross-runtime registration contract** that every adapter MUST follow, the **capability-accept lockfile hash** that gates plugin loading, and the **transport-dispatch + reload semantics** that make stdio and in-process SDK plugins interoperate under a single lifecycle.

## Decision

**Six load-bearing decisions codified for Kind 1 and every future plugin kind that carries executable code.**

### 1. Five-source MCP merge contract (per runtime adapter)

Every runtime adapter with `supportsPluginMcpServers: true` in `src/lib/agents/runtime/catalog.ts` MUST construct its MCP server map by merging **exactly five sources, in this order**, with the ainative server LAST:

```
1. profileServers   — profile-declared MCP servers from agent profile YAML
2. browserServers   — ainative-internal browser tool server (chrome-devtools MCP)
3. externalServers  — user-configured external MCP servers (settings UI)
4. pluginServers    — plugin-shipped MCP servers from loadPluginMcpServers()   [NEW, M3]
5. ainativeServer   — in-process ainative tool server (createToolServer(...))
```

The fifth position for the ainative server is **non-negotiable**. Later entries in a spread win collisions, so `ainative:` always wins a name collision against any plugin that tries to shadow a builtin ainative tool name. This is a safety invariant, not an ergonomic preference: a plugin declaring `mcpServers: { ainative: { ... } }` does NOT replace ainative's tool surface — it's silently dropped by the spread order.

Concrete contract for the Claude Agent SDK adapter (`src/lib/agents/claude-agent.ts:70`):

```typescript
async function withAinativeMcpServer(
  profileServers: Record<string, unknown>,
  browserServers: Record<string, unknown>,
  externalServers: Record<string, unknown>,
  pluginServers: Record<string, unknown>,  // NEW — 4th positional arg
  projectId?: string | null,
): Promise<Record<string, unknown>> {
  const { createToolServer } = await import("@/lib/chat/ainative-tools");
  const ainativeServer = createToolServer(projectId).asMcpServer();
  return {
    ...profileServers,
    ...browserServers,
    ...externalServers,
    ...pluginServers,     // NEW — before ainative
    ainative: ainativeServer,
  };
}
```

Both call sites (task execution at line 566 + resume at line 724) MUST pass the same `pluginServers` object, sourced from a single call to `loadPluginMcpServers()` earlier in the request path. A future reviewer seeing two different sources of `pluginServers` at the two sites MUST treat that as a bug — the resume path must see the same plugin set as the execution path, or a task that spawned while plugin A was installed would resume without it, silently dropping the tool call that originated the task.

Other adapters follow the same shape, translated to their native SDK surface:

| Adapter | Merge site | Native SDK param |
|---|---|---|
| `src/lib/agents/claude-agent.ts` | `withAinativeMcpServer` 5-source merge | Claude SDK `options.mcpServers` |
| `src/lib/agents/runtime/anthropic-direct.ts` | New `withAnthropicDirectMcpServers` helper | Anthropic Messages API `mcp_servers` |
| `src/lib/agents/runtime/openai-direct.ts` | New `withOpenAiDirectMcpServers` helper | OpenAI Responses API `tools: [{type: "mcp", ...}]` |
| `src/lib/agents/runtime/codex-app-server-client.ts` | Sync into `config.toml [mcp_servers]` via `src/lib/environment/sync/mcp-sync.ts` | Codex reads on process start |
| `src/lib/agents/runtime/ollama.ts` | Opt-out (`supportsPluginMcpServers: false`) | None — Ollama has no MCP surface |

Each helper MUST preserve the five-source order. Each helper MUST be async (it dynamically imports the ainative tools module per TDR-032). Codex is special: the "merge" happens on disk in `config.toml`, not in-memory in a request payload, because Codex App Server reads its MCP config at process startup — so the sync engine (`mcp-sync.ts`) is the right merge site. The resulting file content still represents a five-source merge conceptually, even though the assembly is serialized across file writes rather than object spreads.

### 2. Plugin-MCP loader is the authoritative source of `pluginServers`

**The fourth merge source MUST come from exactly one function:** `loadPluginMcpServers()` exported from `src/lib/plugins/mcp-loader.ts` (new file in M3). Every adapter MUST call this function — no adapter may build its plugin-MCP list by scanning disk, parsing `plugin.yaml`, or reading the plugin registry directly.

Rationale:
- **Capability gating happens inside the loader.** A plugin whose capability set is not accepted in `plugins.lock` is excluded from the loader's return value. Adapters that scan disk independently would leak capability-denied servers into requests.
- **Transport dispatch happens inside the loader.** stdio children are spawned and owned by the loader; in-process SDK servers are imported and cached by the loader. Adapters receive a uniform `Record<serverName, NormalizedMcpConfig>` regardless of transport. No adapter needs to know whether a plugin is stdio or in-process.
- **Reload consistency is the loader's job.** When a plugin reloads, the loader's in-memory state changes; the next adapter call sees the updated state. If an adapter scanned disk, reloads would be adapter-ordered.
- **`--safe-mode` short-circuits inside the loader.** Setting `AINATIVE_SAFE_MODE=true` makes `loadPluginMcpServers()` return `{}`. Adapters need zero awareness of safe mode.

The loader's signature:

```typescript
export async function loadPluginMcpServers(opts?: {
  runtime?: AgentRuntimeId;   // filter by supportsPluginMcpServers column
}): Promise<Record<string, NormalizedMcpConfig>>;
```

The optional `runtime` parameter lets the loader return an empty map when called from an adapter whose capability flag is false (defensive: Ollama adapter calling the loader should get `{}`, not a non-empty map it would then discard). Claude SDK, Anthropic direct, OpenAI direct, and Codex pass their runtime id; the loader filters plugins whose declared-compatibility list excludes that runtime (a future per-plugin opt-in). For M3, all M3-era plugins are runtime-agnostic, so the filter passes everything.

### 3. Capability-accept lockfile hash derivation

`~/.ainative/plugins.lock` records an accepted capability set per plugin. The hash MUST be **deterministic over the canonical form of `plugin.yaml`** — not over the file bytes, not over the on-disk `.mcp.json`, not over any piece of user-controlled state.

Canonical-form derivation (implemented in `src/lib/plugins/capability-check.ts`, new file in M3):

```
1. Read plugin.yaml as UTF-8 text.
2. YAML.load() into a JS object.
3. Sort object keys recursively (lexicographic) — guarantees deterministic
   serialization regardless of author's key order.
4. Exclude optional display-only fields from the hashed subset:
   - name (cosmetic)
   - description (cosmetic)
   - tags (cosmetic)
   - author (not security-relevant)
5. JSON.stringify(sortedSubset) with no whitespace.
6. sha256 of the resulting string. Output prefixed "sha256:".
```

The excluded fields are deliberately narrow: a user who accepts `[net]` capability for a plugin called "Gmail Triage v0.1" shouldn't have to re-accept when the author updates the description from "Gmail" to "Read Gmail". But the security-relevant fields — `id`, `version`, `apiVersion`, `kind`, `capabilities[]`, and the MCP server configuration reference (implicitly via `kind: chat-tools` requiring a sibling `.mcp.json`) — MUST all affect the hash. A plugin that bumps `capabilities: [net]` to `capabilities: [net, fs]` MUST produce a different hash, suspending the plugin until the user re-accepts.

Why not hash `.mcp.json` too? A plugin might legitimately change server config (`command`, `args`, `env` template) without expanding capabilities. Re-hashing on every `.mcp.json` edit would suspend plugins every time an author tweaks their own server's env-var reference. The capability array in `plugin.yaml` is the user-facing trust surface; `.mcp.json` is implementation detail. If an attacker swaps `.mcp.json` without touching `plugin.yaml`, the capability set still gates what the plugin can reach — `[net]` cannot be escalated to `[child_process]` through `.mcp.json` alone.

Stored entry shape:

```yaml
version: 1
accepted:
  gmail-triage:
    manifestHash: "sha256:a3f4b5c6d7e8f9..."
    capabilities: [net]
    acceptedAt: "2026-04-20T09:00:00Z"
    acceptedBy: "user@laptop"  # os.userInfo().username — identification, not authentication
```

The `acceptedAt` and `acceptedBy` fields are audit-trail only. They are NOT part of the hashed subset. A `plugins.lock` with stale `acceptedBy` (e.g., after migrating laptops) still validates as long as `manifestHash` matches.

### 4. Transport dispatch via `.mcp.json` shape

The loader distinguishes transport by **presence of fields**, not an explicit `transport:` enum for stdio (which is the MCP default). This matches the existing parser at `src/lib/environment/parsers/mcp-config.ts`, which accepts Claude Code's `.mcp.json` verbatim.

```json5
{
  "mcpServers": {
    // stdio transport (default — matches MCP standard)
    "gmail-triage": {
      "command": "python",
      "args": ["-m", "gmail_triage_server"],
      "env": { "CREDS_PATH": "${HOME}/.ainative/gmail-triage/creds.json" }
    },

    // in-process SDK transport (Ainative extension)
    "finance-local": {
      "transport": "ainative-sdk",
      "entry": "./server/index.js"
    }
  }
}
```

Dispatch rule:
- `"command"` present → stdio (spawn child process, pipe stdin/stdout/stderr)
- `"transport": "ainative-sdk"` present → in-process (dynamic-import the entry, construct an SDK MCP server, register in-process)
- Neither present → validation error (plugin disabled with reason `invalid_mcp_transport`)
- Both present → validation error (plugin disabled with reason `ambiguous_mcp_transport`)

The `ainative-sdk` transport is Ainative-specific and **will not be honored by Claude Code or Codex CLI** when they parse the same `.mcp.json`. That's acceptable: a plugin author who wants cross-tool distribution ships stdio (the lowest common denominator); a plugin author who wants fastest possible in-process calls on Ainative-only deployments ships `ainative-sdk`. The loader's failure mode for `ainative-sdk` in a foreign tool is "no server registered" — the plugin's tools simply don't appear. The plugin author is responsible for communicating this to their users via README.

### 5. Reload semantics per transport

**Kind 5's `reload_plugin({ id })` (M1, TDR-034) is extended, not replaced.** The existing chat tool's handler branches on plugin kind:

- `kind: primitives-bundle` → re-scan profiles/blueprints/tables/schedules, re-merge into registries. No process lifecycle. (M1/M2 unchanged)
- `kind: chat-tools` → transport-aware reload:
  - **stdio:** SIGTERM the child process. Wait up to 5000ms for clean exit (process emits `exit` event). SIGKILL if the wait times out. Respawn with the refreshed `.mcp.json` config. New child's stdio pipes are attached to ainative's log aggregator. The merged `pluginServers` map returned by `loadPluginMcpServers()` now points at the new child's stdio transport.
  - **ainative-sdk (in-process):** `delete require.cache[require.resolve(absPath)]`. Re-require the entry. Verify the new module exports a `createServer()` that returns an MCP SDK server. Replace the cached registration. No OS-level state change.

The 5000ms grace period for SIGTERM is a balance: short enough that a wedged plugin doesn't block other plugin reloads for minutes, long enough that a well-behaved plugin can flush its logs and close sockets. Plugins MUST NOT be authored assuming an unlimited graceful-shutdown window. The `SIGKILL` fallback is logged but not surfaced as a user-visible error unless it exceeds a threshold (e.g., three consecutive SIGKILL exits → plugin marked `disabled, reason: repeated_hang`).

A reload failure (new child fails to spawn, new in-process entry fails to export correctly) MUST NOT leave the plugin in a half-reloaded state. The contract is atomic: either the plugin's `pluginServers` entry points at the new server, or it points at the previous server and `plugins.log` records the failure. The loader achieves this by staging the new server before replacing the cached entry — only after the new server's `initialize` message returns successfully does the swap happen. A future contributor tempted to "optimize" by replacing first and rolling back on failure MUST NOT: a rollback window between replace and re-initialize is observable to concurrent requests and violates the atomic contract.

### 6. Process ownership and lifecycle

All stdio child processes spawned by `loadPluginMcpServers()` are **owned by ainative's process lifecycle**. Specifically:

- **Spawn happens at boot step 7** (after migrations, after plugin loader's Kind-5 pass, before `startScheduler()`). Documented in `src/instrumentation-node.ts`. This is a strictly-ordered invariant — plugin MCP servers MUST be registered before schedules fire (a schedule's first tick may invoke a plugin tool).
- **A graceful shutdown handler** in `src/instrumentation-node.ts` MUST SIGTERM every spawned child on ainative process exit (SIGINT, SIGTERM, or Node's `beforeExit`). The handler uses the same 5000ms wait + SIGKILL fallback as reload. Children that outlive ainative's exit become orphaned processes — this is a bug, NOT a feature, and the SIGTERM handler is the remediation.
- **A plugin MUST NOT detach** via double-fork, `detached: true` in the spawn options, or explicit `process.daemon()`. The loader enforces this via `spawn(command, args, { detached: false, stdio: ["pipe", "pipe", "pipe"] })` — `detached: false` is the default, named here for clarity.
- **Per-plugin `env` isolation:** each child inherits `process.env` by default, merged with the plugin's declared `env` dictionary. The loader MUST NOT leak ainative-specific secrets (ANTHROPIC_API_KEY, OPENAI_API_KEY, AINATIVE_DATA_DIR) into plugin children unless the plugin's declared `env` explicitly references them via `${VAR}` templates. This is a soft boundary — a plugin with `fs` capability can read `process.env` via its own implementation — but it prevents accidental secret propagation in the common case.

Plugins that need long-lived state between invocations MUST own that state themselves (write to disk under `${HOME}/.ainative/plugins/<id>/state/`, which the plugin author's README must document). Ainative does NOT provide plugin-owned persistent storage — the composite-id table strategy from TDR-034 is reserved for `kind: primitives-bundle`.

## Consequences

**Positive:**
- A future runtime adapter (Gemini, DeepSeek, local-inference-stack) has a concrete six-step recipe for plugin-MCP wiring: (1) declare `supportsPluginMcpServers: true` in catalog, (2) call `loadPluginMcpServers({ runtime: "<id>" })` in the request path, (3) merge per the five-source contract with ainative last, (4) handle capability-denied as a silent no-op (the loader already filtered them), (5) no reload concerns (the loader owns lifecycle), (6) no transport awareness needed (loader normalizes). One adapter file, ~20 lines of net-new code for the merge site plus test fixtures.
- Capability-accept lockfile hash derivation is deterministic and auditable. A user can recompute the hash from `plugin.yaml` alone and verify their `plugins.lock` entry matches without running ainative. Third-party security tools can do the same.
- The five-source order guarantees ainative tool precedence. A plugin named "ainative" in `.mcp.json` cannot hijack the ainative namespace — the spread order silently drops it. This is the architectural complement to TDR-034's namespacing decision: plugins are visibly distinct at every layer that displays them, AND cannot shadow ainative-owned names.
- Transport dispatch via `.mcp.json` shape (rather than a new `transport:` field for stdio) keeps the file format forward-compatible with Claude Code's and Codex CLI's parsers. A plugin author writing one `.mcp.json` works across all three tools for stdio — which covers the 95% case.
- Reload atomicity eliminates the "half-reloaded plugin" failure mode that would otherwise require a defensive reader at every adapter's merge site.

**Neutral:**
- The `ainative-sdk` transport is a deliberate fork from MCP standard. Plugins using it cannot be installed in Claude Code / Codex CLI. The alternative (a runtime-shim that translates SDK calls to stdio) was rejected as premature — no M3-era plugin has needed it. Reconsider when a plugin's measured latency on stdio is a complaint, not a theoretical concern.
- Lockfile hash excluded fields (`name`, `description`, `tags`, `author`) are a judgment call. A more conservative rule (hash everything) would re-prompt users on every cosmetic update. A more permissive rule (hash only `capabilities[]`) would miss version bumps that changed the security surface. The current exclusion set is tight and explicit — a future contributor adding a new cosmetic field to `plugin.yaml` MUST explicitly decide whether to hash it, and the capability-check test suite MUST assert the inclusion/exclusion list explicitly.
- The five-source merge order is a runtime contract that every adapter MUST enforce. A drift where one adapter merges in a different order is silent (tests may pass, production collisions are rare) but breaks the ainative-precedence invariant. The drift heuristic at the bottom of this TDR catches it.

**Negative / watch for:**
- stdio children are OS-level processes. On Windows, the process-group semantics for SIGTERM are different (Windows has no SIGTERM; Node sends `CTRL_BREAK_EVENT`). The loader's graceful-shutdown handler MUST test on Windows — a regression where children survive ainative exit would surface as accumulating orphaned processes over multiple dev-server restarts. The M1 install-path-parity test suite (`src/lib/plugins/__tests__/install-path-parity.test.ts`) does not yet cover Windows; M3's plan MUST add a Windows-specific smoke for the shutdown path.
- `require.cache` bust for `ainative-sdk` in-process plugins relies on Node's CommonJS module system. When ainative moves to ESM (future), this breaks. The mitigation is per-plugin `vm.SourceTextModule` or worker-thread isolation — both are significantly more complex. Revisit when ESM migration is on the roadmap, NOT before; the drift heuristic tracks this by flagging any new uses of `require.cache` outside the plugin-MCP loader.
- A plugin author who ships a slow-starting stdio server (e.g., Python with heavy imports, cold-starts at 3s+) blocks boot. The loader's step-7 position in the boot sequence means scheduler start is delayed by the slowest plugin. For M3, a plugin whose initialize step exceeds 10s is logged as `slow_plugin_init` (warning, not fatal). For M4/M5, a lazy-initialize mode deserves consideration — spawn children on first tool use rather than at boot. Tracked as a deferred open decision in strategy §13.

## Alternatives Considered

1. **Adapter-owned plugin discovery.** Each adapter calls its own disk scanner. Rejected. Three duplications of manifest parsing, three divergent capability-gating implementations, three reload-coordination stories. The loader-centric design is mandatory for consistency.

2. **A `transport: "stdio"` explicit enum for MCP stdio servers.** Rejected. Would break compatibility with Claude Code's `.mcp.json` parser (which expects `command` at the top level with no `transport` field). The "presence of `command` implies stdio" rule is the MCP community convention; diverging buys nothing.

3. **Custom `@ainative/plugin-sdk` (original strategy §5).** Rejected by strategy amendment 2026-04-19 (II). Would require inventing a parallel surface to what Claude Code + Codex CLI + MCP community already ship. Code size, maintenance burden, and plugin-author learning curve all worse than MCP-as-surface. Memory note: `memory/project-m3-mcp-as-plugin-surface.md` captures the five-vector justification (existing `withAinativeMcpServer` merge path, cross-runtime parity, stdio process isolation, MCP elicitation, strategy §10 alignment).

4. **Hash the entire `plugin.yaml` file bytes for lockfile.** Rejected. Would re-prompt users on whitespace changes, comment edits, and cosmetic field updates. The canonical-form approach (sorted keys, excluded cosmetic fields, deterministic JSON stringify) tracks only security-relevant state.

5. **Sandbox Kind 1 plugins via Node `vm.Module` or worker threads.** Rejected by strategy §10 and §11. Node's `vm` is not a security boundary (CVE-class escapes documented in the `vm2` deprecation history). Worker threads isolate CPU/memory but share the filesystem — fs capability would still need the lockfile gate. Real isolation requires seccomp, gVisor, or a separate runtime — out of scope for a Node + Next.js app. stdio transport buys free process isolation; in-process SDK accepts the trust cost, gated by click-accept. The strategy is explicit that we follow Claude Code's and Codex CLI's model here.

6. **Adapter-specific MCP merge helpers with different signatures.** Rejected. The five-source order is a uniform contract; each adapter's helper signature may differ in its 6th-arg (Claude SDK takes `projectId`, Anthropic direct doesn't), but the first five positional args MUST match. This is a naming convention that the drift heuristic can check.

## References

**Feature spec:** `features/chat-tools-plugin-kind-1.md` (status: planned, 2026-04-19)

**Strategy doc:** `ideas/self-extending-machine-strategy.md` §9 Milestone 3, §5 (revised by Amendment 2026-04-19 (II)), §10 (non-goals), §11 Risk D (plugin trust model — materially reduced for stdio).

**Project memory:** `memory/project-m3-mcp-as-plugin-surface.md` — the five-vector rationale for adopting MCP as the extension surface.

**Reference implementations (existing, to be extended in M3):**
- `src/lib/agents/claude-agent.ts:70` — `withAinativeMcpServer` (current 4-arg signature, gets 5th arg for `pluginServers` in M3)
- `src/lib/agents/claude-agent.ts:566` — primary call site (task execution)
- `src/lib/agents/claude-agent.ts:724` — secondary call site (task resume). BOTH sites must pass the same `pluginServers`
- `src/lib/environment/parsers/mcp-config.ts` — canonical `.mcp.json` parser (reused, not duplicated, by `src/lib/plugins/mcp-loader.ts`)
- `src/lib/environment/sync/mcp-sync.ts` — bi-directional Claude ↔ Codex MCP sync (the pattern Codex App Server plugin-MCP sync extends)
- `src/lib/agents/runtime/catalog.ts:33-67` — `RuntimeFeatures` interface (gains `supportsPluginMcpServers: boolean` in M3)

**New files introduced in M3 to implement this TDR:**
- `src/lib/plugins/mcp-loader.ts` — authoritative `loadPluginMcpServers()` implementation
- `src/lib/plugins/capability-check.ts` — canonical-form manifest-hash derivation, `plugins.lock` read/write
- `src/lib/agents/runtime/anthropic-direct.ts` — new `withAnthropicDirectMcpServers` helper following the five-source contract
- `src/lib/agents/runtime/openai-direct.ts` — new `withOpenAiDirectMcpServers` helper

**Related TDRs:**
- TDR-006 (multi-runtime adapter registry) — the capability-matrix surface TDR-035 extends with `supportsPluginMcpServers`
- TDR-032 (runtime ainative MCP injection / module-load cycle) — the dynamic-import discipline every merge helper inherits; TDR-035's capability-check module and every new adapter's helper MUST follow TDR-032's pattern
- TDR-034 (Kind 5 plugin loader architecture) — the per-plugin error-isolation failure model that TDR-035 extends with three M3-specific failure modes (capability_denied, lock_mismatch, safe_mode)
- TDR-009 (idempotent database bootstrap) — the "self-heal at the producing boundary" principle TDR-035's loader inherits for plugin-level failures

**Drift heuristic addition to `/architect`:**

The architect skill's drift detection checks (under "Drift Heuristics → Runtime Checks") gain three new checks:

> **Plugin-MCP five-source merge order.** For every runtime adapter with `supportsPluginMcpServers: true`, grep for the merge site and verify the spread order places `pluginServers` in position 4 and the ainative tool server in position 5 (last). Flag any adapter that places pluginServers after ainative — that inversion lets a plugin shadow ainative's tool surface.

> **Plugin-MCP loader authority.** Grep every runtime adapter for direct reads of `plugin.yaml` or direct scans of `$AINATIVE_DATA_DIR/plugins/`. The ONLY code path that reads plugin manifests for MCP purposes MUST be `src/lib/plugins/mcp-loader.ts`. An adapter that opens a plugin manifest directly is a bug — the loader owns discovery, capability gating, transport dispatch, and lifecycle.

> **Plugin stdio detachment.** Grep every spawn call in `src/lib/plugins/` for `detached: true`, `daemon()`, or double-fork patterns. All plugin children MUST be owned by ainative's process lifecycle per Decision 6. The graceful-shutdown handler in `src/instrumentation-node.ts` depends on non-detached children.

These checks run automatically in architecture review mode and as a sub-step of architecture health mode.
