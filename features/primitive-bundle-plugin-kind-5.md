---
title: Primitive Bundle Plugin (Kind 5)
status: completed
priority: P0
milestone: post-mvp
source: ideas/self-extending-machine-strategy.md
dependencies: [agent-profile-catalog, workflow-blueprints]
---

# Primitive Bundle Plugin (Kind 5)

## Description

ainative's users compose business primitives (profiles, blueprints, tables) today, but those artifacts live in three separate locations: `~/.claude/skills/` for profiles, `~/.ainative/blueprints/` for blueprints, `user_tables` DB rows for tables. There is no way to package a profile + its accompanying blueprint + a table schema as **one reusable unit** that a user can hand to a teammate, archive for later, or move between machines. The `ainative-app` skill emits `.claude/apps/<id>/manifest.yaml` as a documentation artifact, but the manifest is not executed — it only describes what to scaffold.

This feature introduces **primitive bundles** as a first-class plugin kind. A bundle is a directory under `~/.ainative/plugins/<plugin-id>/` containing a `plugin.yaml` manifest plus any combination of profile folders, blueprint YAML files, and table schema YAML files. A new plugin loader scans the plugins directory at boot, validates each bundle, and registers its contents with the existing profile and blueprint registries under a plugin-scoped namespace. Tables declared in a bundle become user_table schema templates the user can instantiate.

The bundle is the minimum viable plugin — zero new execution surface, zero new runtime behavior. It extends directory scanning that already happens in `src/lib/agents/profiles/registry.ts` and `src/lib/workflows/blueprints/registry.ts`. A bundle is portable by construction: send the directory, drop it in, call `reload_plugins`. This feature ships as Milestone 1 of the self-extending machine strategy, chosen first because it proves the plugin directory conventions, manifest validation, and reload mechanism in the lowest-risk possible context before Kind 1 (chat tools, real JS execution) arrives in Milestone 3.

## User Story

As a ainative operator who has composed a Personal-CFO profile, a monthly-close blueprint, and a transactions table schema for my own use, I want to package them as one bundle I can share with my accountant, so that dropping the folder into their `~/.ainative/plugins/` reproduces all three primitives at once — no copy-paste across three registries, no manual step-by-step instructions.

As a Claude Code refugee running ainative via `npx`, I want the plugin I assemble from chat to live in my data directory (not inside `node_modules/`), so that it survives `npx ainative-business@latest` upgrades and moves with me when I copy `~/.ainative-<folder>/` to another machine.

## Technical Approach

### Plugin directory layout

Plugins live under `$AINATIVE_DATA_DIR/plugins/<plugin-id>/`. With the default data dir, that resolves to `~/.ainative/plugins/<id>/`; with an isolated data dir (from the 0.13.2 first-run auto-writer), it resolves to `~/.ainative-<folder>/plugins/<id>/`. Either way, plugins are in user space — outside `node_modules/`, outside the package install dir.

```
~/.ainative/plugins/<plugin-id>/
  plugin.yaml                     # required: manifest (schema below)
  README.md                       # optional: user-facing description
  profiles/<profile-id>/
    profile.yaml                  # same schema as builtins
    SKILL.md                      # same schema as builtins
  blueprints/
    <blueprint-id>.yaml           # same schema as builtins
  tables/
    <table-id>.yaml               # user_table schema template (Included)
```

Each subdirectory is optional — a bundle may ship only profiles, only blueprints, only tables, or any mix. An empty bundle (just `plugin.yaml`, no primitives) is valid but a no-op; the loader logs a warning but does not fail.

### Manifest schema (plugin.yaml)

Kind 5 manifests are intentionally small. All Kind 1 fields (`entry`, `capabilities`) are rejected when `kind: primitives-bundle`.

```yaml
id: finance-pack                # required: kebab-case, unique
version: 0.1.0                  # required: semver
apiVersion: "0.14"              # required: ainative SDK compat window
kind: primitives-bundle         # required: literal "primitives-bundle"
name: Finance Pack              # optional: human-readable display name
description: |                  # optional: one-paragraph elevator
  Personal CFO profile with monthly-close blueprint and
  transactions table schema. Composes a lightweight finance
  automation from existing primitives.
author: ainative               # optional: free-text author handle
tags: [finance, personal]       # optional: for gallery filtering
```

Zod schema (`src/lib/plugins/sdk/types.ts`):

```typescript
const PluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  apiVersion: z.string().regex(/^\d+\.\d+$/),
  kind: z.literal("primitives-bundle"),
  name: z.string().optional(),
  description: z.string().optional(),
  author: z.string().optional(),
  tags: z.array(z.string()).optional(),
});
```

### Namespace convention

Every primitive a plugin ships is registered under a `<plugin-id>/` namespace. A plugin `finance-pack` shipping a profile folder `personal-cfo/` registers it as id `finance-pack/personal-cfo`. A blueprint `monthly-close.yaml` becomes id `finance-pack/monthly-close`.

Namespacing prevents shadowing of builtin primitives (21 builtin profiles, 13 builtin blueprints, 12 builtin table templates). Collisions between plugins are likewise prevented: two plugins cannot both ship `personal-cfo` because their full ids differ by plugin-id prefix. Explicit shadowing (*"this plugin replaces builtin profile X"*) is **not supported in v1** — revisit if real demand surfaces.

### Plugin registry module

**New file: `src/lib/plugins/registry.ts`**

```typescript
import { z } from "zod";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { parse as parseYaml } from "yaml";
import { getAinativePluginsDir } from "@/lib/utils/ainative-paths";

export interface LoadedPlugin {
  id: string;
  manifest: PluginManifest;
  rootDir: string;
  profiles: string[];      // plugin-namespaced profile ids
  blueprints: string[];    // plugin-namespaced blueprint ids
  tables: string[];        // plugin-namespaced table template ids
  status: "loaded" | "disabled";
  error?: string;          // populated if status === "disabled"
}

export function loadPlugins(): LoadedPlugin[];
export function reloadPlugin(id: string): LoadedPlugin;
export function getPlugin(id: string): LoadedPlugin | null;
export function listPlugins(): LoadedPlugin[];
```

Responsibilities:
- Scan `getAinativePluginsDir()` for subdirectories containing `plugin.yaml`
- Validate each manifest against `PluginManifestSchema`
- Check `apiVersion` against a compatibility window (e.g., `"0.14"` accepted for ainative 0.14.x–0.15.x; outside window → `disabled` with `reason: apiVersion_mismatch`)
- For each bundle, enumerate primitives in `profiles/`, `blueprints/`, `tables/` and pass them to existing registries with plugin-id scoping
- Log per-plugin outcomes to `$AINATIVE_DATA_DIR/logs/plugins.log` (same pattern as instance-bootstrap)
- Never throw to the caller — a malformed plugin is disabled, boot continues

### Reuse of existing primitive loaders

**`src/lib/agents/profiles/registry.ts`** — extend `loadProfiles()` to accept an optional `pluginScope` parameter. The plugin loader calls `loadProfiles({ rootDir: "<plugin-dir>/profiles", namespace: "<plugin-id>" })` for each bundle. Registry stores profiles under `<plugin-id>/<profile-id>` keys. The existing `getProfile(id)` and `listProfiles()` functions transparently surface plugin profiles alongside builtins.

**`src/lib/workflows/blueprints/registry.ts`** — same pattern. Accept `pluginScope`, namespace returned ids, append to internal map. `validateBlueprint()` must also validate that any `profileId` reference inside a plugin blueprint either (a) resolves to a plugin-namespaced id from the same plugin, or (b) resolves to a builtin/user-profile id. Cross-plugin profile references are **not supported in v1** — emit validation error.

**`src/lib/data/seed-data/table-templates.ts`** — remains a one-time DB seeder that inserts into `userTableTemplates` with `scope: "system"` at DB-module-load time. Plugin tables ride the same table via composite primary keys: `id = "plugin:<plugin-id>:<table-id>"`, `scope: "system"`. The plugin's display `name` is suffixed with `(<plugin-id>)` to disambiguate from same-named builtins in the picker UI. Reload removes plugin rows by `LIKE 'plugin:<plugin-id>:%'` predicate via `removePluginTables(pluginId)`. **No DB schema change** — honors strategy doc §10 ("no new DB columns via plugin"). The pre-existing `seedTableTemplates()` function and the 12 builtin templates are untouched.

### Path utility

**`src/lib/utils/ainative-paths.ts`** — add one function, mirror existing helpers like `getAinativeBlueprintsDir()`:

```typescript
export function getAinativePluginsDir(): string {
  return join(getAinativeDataDir(), "plugins");
}
```

### Boot sequence integration

**`src/instrumentation-node.ts`** — plugin loader runs **after** builtin registries load, **before** scheduler startup:

```
0. Next.js spawn
1. migrateLegacyData()
2. ensureInstance()
3. runPendingMigrations()
4. loadProfiles() — builtins + ~/.claude/skills + ~/.ainative/profiles
5. loadBlueprints() — builtins + ~/.ainative/blueprints
6. loadPlugins() — ~/.ainative/plugins/* [NEW, this feature]
   - per plugin: validate, check apiVersion, enumerate primitives,
     dispatch to step-4/step-5 loaders with plugin namespace
   - failures: log, mark plugin disabled, continue
7. startUpgradePoller()
8. startScheduler()
9. startChannelPoller()
10. startAutoBackup()
11. startHistoryCleanup()
```

### Reload mechanism

**`reload_plugins` chat tool** (new, registered in `src/lib/chat/tools/plugin-tools.ts`):
- No arguments. Rescans the plugins directory, re-validates all manifests, re-registers all primitives. Idempotent — safe to call repeatedly.
- Returns a summary: `{ loaded: [...], disabled: [{ id, reason }...] }`
- Removes plugin-namespaced entries from profile / blueprint / table registries before rescanning — prevents stale entries from a deleted plugin directory.

**`reload_plugin` chat tool** (same file):
- Takes one argument: `id`. Targets a single plugin for reload. Falls back to no-op if the plugin directory was removed (with a log note).

Both tools are registered through the existing tool-catalog mechanism and appear in the chat command palette under the **Explore** and **Automate** categories.

### API routes

Minimal surface. The chat tools cover authoring; the `/apps` route (Milestone 2+) will add UI, but this feature ships without UI:

- `GET /api/plugins` — returns `{ plugins: LoadedPlugin[] }`. Used later by `/apps` gallery. Available in v1 for debugging and CLI introspection.
- `POST /api/plugins/reload` — triggers `loadPlugins()`. Same surface as the chat tool; useful for scripting.

No install / uninstall API in v1. Users install by copying a directory in; uninstall by deleting it. Matches the rollback's copy-paste-a-directory sharing model.

### Finance-pack dogfood bundle

Ship `src/lib/plugins/examples/finance-pack/` as a **reference bundle** that gets copied to `$AINATIVE_DATA_DIR/plugins/finance-pack/` on first boot if the plugins directory is empty (mirroring how builtin profiles seed `~/.claude/skills/` on first boot). Users who don't want it can delete the directory — the first-boot copier only fires when `plugins/` has no subdirectories at all.

The dogfood bundle contents:

```
finance-pack/
  plugin.yaml                    # id: finance-pack, version: 0.1.0
  README.md                      # how to use, what each primitive does
  profiles/personal-cfo/
    profile.yaml                 # role: "Personal CFO", tools: [read_doc, summarize]
    SKILL.md                     # behavioral instructions
  blueprints/
    monthly-close.yaml           # pattern: sequence, 3 steps, references finance-pack/personal-cfo
  tables/
    transactions.yaml            # 8 columns: date, merchant, amount, category, ...
```

Running `reload_plugins` must surface:
- `finance-pack/personal-cfo` in the profile gallery
- `finance-pack/monthly-close` in the blueprint gallery
- `finance-pack/transactions` in the table template picker

### Security posture (v1)

Kind 5 bundles contain no executable JavaScript. The loader parses YAML (via the existing `yaml` dep), validates schemas (via Zod), and calls existing registry functions. There is no dynamic `require`, no `vm`, no `child_process`, no `net` access. The only way a Kind 5 plugin can cause harm is through malformed YAML that slips past Zod validation — which the schema is designed to prevent — or by containing a table template with a multi-gigabyte `sampleRows` CSV that balloons memory at load time. Mitigation: cap inline `sampleRows` at 10,000 rows, cap referenced CSV files at 10 MB.

Capability declarations (`capabilities: [fs, net]`) and user click-accept flows are **not required for Kind 5** — they apply to Kind 1 when it lands. Kind 5 is effectively a data-only plugin kind.

### Cross-platform

Plugin IDs normalized to lowercase at read (Windows case-insensitive FS + Linux/macOS case-sensitive FS). All paths constructed via `path.join`. `fs.readdirSync` used with `withFileTypes: true` to distinguish files from directories portably.

## Acceptance Criteria

- [ ] `getAinativePluginsDir()` added to `src/lib/utils/ainative-paths.ts` and returns `$AINATIVE_DATA_DIR/plugins`
- [ ] `PluginManifestSchema` exported from `src/lib/plugins/sdk/types.ts` — Zod schema accepting `kind: "primitives-bundle"` manifests and rejecting Kind 1 fields
- [ ] `loadPlugins()` in `src/lib/plugins/registry.ts` scans the plugins directory, validates each manifest, returns a `LoadedPlugin[]` with status + error fields populated
- [ ] Profiles in `<plugin>/profiles/` are registered with `<plugin-id>/<profile-id>` namespaced keys
- [ ] Blueprints in `<plugin>/blueprints/*.yaml` are registered with namespaced keys; `profileId` references inside plugin blueprints are validated to resolve
- [ ] Table schemas in `<plugin>/tables/*.yaml` are registered as new table templates alongside the existing 12 builtins
- [ ] Plugin with invalid manifest is disabled (not skipped silently) — status=`disabled`, `error` populated, logged to `plugins.log`, does not break boot
- [ ] Plugin with apiVersion outside the compatibility window is disabled with `reason: apiVersion_mismatch`
- [ ] `reload_plugins` chat tool exists, appears in the command palette, and rescans the plugins directory
- [ ] `reload_plugin({ id })` chat tool reloads a single bundle
- [ ] Removing a plugin directory followed by `reload_plugins` removes its namespaced entries from all registries
- [ ] `GET /api/plugins` returns the current loaded plugins list
- [ ] Finance-pack dogfood bundle ships at `src/lib/plugins/examples/finance-pack/` and is copied to the user's plugins directory on first boot when `plugins/` is empty
- [ ] After first boot with the dogfood bundle: `finance-pack/personal-cfo` appears in profile registry, `finance-pack/monthly-close` in blueprint registry, `finance-pack/transactions` in table templates
- [ ] Plugin boot failures never cause ainative to fail to start — verified by a test with a deliberately malformed plugin
- [ ] Plugin loading works identically on npx (data dir = `~/.ainative-<folder>/`) and git-clone (data dir = `~/.ainative/`) — no install-path branches in the loader

## Verification

### Smoke 1 — install finance-pack from scratch

```bash
rm -rf ~/.ainative-smoke/plugins
mkdir -p /tmp/ainative-smoke && cd /tmp/ainative-smoke
AINATIVE_DATA_DIR=~/.ainative-smoke node /path/to/ainative/dist/cli.js --port 3410 --no-open &
# On first boot, finance-pack should auto-copy into ~/.ainative-smoke/plugins/
ls ~/.ainative-smoke/plugins/finance-pack/                   # expect: plugin.yaml, profiles/, blueprints/, tables/, README.md
curl http://localhost:3410/api/plugins | jq '.plugins[].id'  # expect: ["finance-pack"]
curl http://localhost:3410/api/profiles | jq '.[] | select(.id == "finance-pack/personal-cfo")'  # expect: non-empty
curl http://localhost:3410/api/blueprints | jq '.[] | select(.id == "finance-pack/monthly-close")'  # expect: non-empty
```

### Smoke 2 — reload after adding a second plugin

```bash
# With the server still running from Smoke 1:
cp -r /path/to/ainative/features/fixtures/test-pack ~/.ainative-smoke/plugins/test-pack
curl -X POST http://localhost:3410/api/plugins/reload
curl http://localhost:3410/api/plugins | jq '.plugins[].id'  # expect: ["finance-pack", "test-pack"]
# Remove it and reload:
rm -rf ~/.ainative-smoke/plugins/test-pack
curl -X POST http://localhost:3410/api/plugins/reload
curl http://localhost:3410/api/plugins | jq '.plugins[].id'  # expect: ["finance-pack"]
```

### Smoke 3 — install-path parity

Repeat Smoke 1 from a git-clone checkout (`AINATIVE_DATA_DIR=~/.ainative-smoke-clone`) and confirm the API responses for `/api/plugins`, `/api/profiles?filter=finance-pack`, and `/api/blueprints?filter=finance-pack` are byte-identical to the npx run modulo data-dir paths.

### Unit tests

- `src/lib/plugins/__tests__/registry.test.ts` — manifest parsing, apiVersion compat matrix, namespace application, error isolation (one broken plugin doesn't break others)
- `src/lib/plugins/__tests__/reload.test.ts` — add plugin → reload → present; remove plugin → reload → absent; modify plugin → reload → changes visible
- `src/lib/plugins/__tests__/install-path-parity.test.ts` — same fixture plugin, different `AINATIVE_DATA_DIR` values, output registries are deeply equal modulo the directory path

## Scope Boundaries

**Included:**
- Kind 5 plugin kind only: YAML-based primitives bundles
- Plugin loader with manifest validation, apiVersion compatibility, namespace scoping
- Integration with existing profile, blueprint, and table-template registries
- Reload chat tools + minimal API surface (`GET /api/plugins`, `POST /api/plugins/reload`)
- Finance-pack dogfood bundle seeded on first boot
- Install-path parity (npx = git-clone)

**Excluded:**
- **Kind 1 chat tools** — plugins carrying executable JS. Separate feature (`chat-tools-plugin-kind-1`, Milestone 3). The manifest schema rejects Kind 1 fields for forward-compatibility.
- **Kind 2 data processors, Kind 3 workflow pattern helpers, Kind 4 profile runtimes** — deferred indefinitely per strategy doc §10.
- **Publishing / marketplace** — no upload flow, no remote registry, no trust tiers, no PII sanitization. Sharing happens by copy-pasting the plugin directory. See strategy doc §10 (post-rollback non-goals).
- **`/apps` gallery UI** — Milestone 1 ships loader + chat tools + API only. UI lives in a later milestone that consumes `GET /api/plugins`.
- **Plugin version upgrades** — no built-in "newer version available" check. Users replace the directory manually. Revisit if usage warrants.
- **Plugin dependency resolution** — a plugin cannot declare dependencies on other plugins. If `finance-pack/monthly-close` references `finance-pack/personal-cfo` that's fine (same bundle). Cross-plugin references are not supported.
- **Explicit shadowing of builtins** — a plugin cannot ship `personal-cfo` to override the builtin `personal-cfo` profile. Revisit if real demand surfaces.
- **Capability declaration and user click-accept flows** — these are Kind 1 concerns (Milestone 3) and don't apply to data-only bundles.
- **`--safe-mode` CLI flag** — Kind 1 concern (Milestone 3). Kind 5 bundles are inherently safe to load.

## Verification run — 2026-04-19

Real `npm run dev` smoke per CLAUDE.md's runtime-registry-adjacent budget rule. Goal: prove no module-load cycle (TDR-032 risk) introduced by the new chat-tool surface.

**Setup**
- Repo at commit `74feaf74` on `main` (post T1–T17, pre-T19/T20).
- Clean smoke data dir: `~/.ainative-smoke-plugins-m1` (empty before run).
- Server: `PORT=3010 AINATIVE_DATA_DIR=~/.ainative-smoke-plugins-m1 npm run dev`
- Runtime: Claude Agent SDK (default for the dev server).

**Boot sequence observed (from `/tmp/ainative-smoke-m1.log`)**

```
[bootstrap] ALTER TABLE failed: no such table: conversations  (pre-existing, harmless)
[instance] bootstrap skipped: dev_mode_sentinel
[db] Recovered legacy database — all migrations stamped.
[plugins] 1 loaded, 0 disabled
[upgrade-poller] skipped (dev mode or no .git)
[scheduler] started — polling every 60s
[channel-poller] started — polling every 5s
[auto-backup] Starting auto-backup timer (60s poll)
✓ Ready in 253ms
```

Plugin loader fired AFTER migrations, BEFORE scheduler — ordering invariants from T13 honored. Server reached ready state in 253ms.

**API verification (curl against http://localhost:3010)**

| Endpoint | Result |
|---|---|
| `GET /api/plugins` | `[{id: "finance-pack", status: "loaded", profiles: ["finance-pack/personal-cfo"], blueprints: ["finance-pack/monthly-close"], tables: ["plugin:finance-pack:transactions"]}]` |
| `GET /api/profiles` (filtered to plugin) | `finance-pack/personal-cfo` — name "Personal CFO", domain personal |
| `GET /api/blueprints` (filtered to plugin) | `finance-pack/monthly-close` — name "Monthly Close", pattern sequence |
| `GET /api/tables/templates` (filtered to plugin) | `plugin:finance-pack:transactions` — name "Transactions (finance-pack)", category finance |

The `(finance-pack)` suffix on the table-template `name` field is the architect-mandated picker-collision guard. Visible in production output as expected.

**Reload-flow verification**

```bash
# Add test-pack to disk
mkdir ~/.ainative-smoke-plugins-m1/plugins/test-pack
cat > ~/.ainative-smoke-plugins-m1/plugins/test-pack/plugin.yaml <<EOF
id: test-pack
version: 0.1.0
apiVersion: "0.14"
kind: primitives-bundle
EOF

# POST reload
curl -X POST :3010/api/plugins/reload
# → loaded: ["finance-pack", "test-pack"], disabled: []

# Remove and reload
rm -rf ~/.ainative-smoke-plugins-m1/plugins/test-pack
curl -X POST :3010/api/plugins/reload
# → loaded: ["finance-pack"]
```

Add → reload → present, remove → reload → absent. Reload contract intact end-to-end.

**Cycle / runtime error scan**

```
$ grep -E "ReferenceError|Cannot access.*before initialization|claudeRuntimeAdapter" /tmp/ainative-smoke-m1.log
(no output — clean)
```

**TDR-032 verdict: NO MODULE-LOAD CYCLE.** The dynamic `await import()` discipline in `src/lib/chat/tools/plugin-tools.ts` (T14) and in `src/instrumentation-node.ts` (T13) successfully avoided the cycle that unit tests cannot catch. The new chat-tool kit added 3 tools (`reload_plugins`, `reload_plugin`, `list_plugins`) and the runtime registry remained healthy.

**Per-plugin trace from `~/.ainative-smoke-plugins-m1/logs/plugins.log`** confirms each loader run logged the per-bundle summary with profile/blueprint/table counts. Reload firings are visible as separate timestamped lines.

**Cleanup**: Dev server stopped cleanly via PID kill + `pkill -f next-server` follow-up. Port 3010 freed. Smoke data dir left in place for follow-up inspection.

## References

- Source: `ideas/self-extending-machine-strategy.md` — §4 (composition ladder), §5 (plugin primitive), §9 Milestone 1, §10 (non-goals), §11 Risk A (coverage gap off-ramp)
- Plan: `internal implementation plan` — decisions D1–D6, verification section
- Depends on: [`agent-profile-catalog`](agent-profile-catalog.md) — profile registry and YAML schema reuse
- Depends on: [`workflow-blueprints`](workflow-blueprints.md) — blueprint registry and YAML schema reuse
- Related (later milestones):
  - `schedules-as-yaml-registry` (Milestone 2) — allows plugins to carry schedules too
  - `chat-tools-plugin-kind-1` (Milestone 3) — adds executable JS plugins with capability declarations
  - `nl-to-composition-v1` (Milestone 4) — the chat flow that emits Kind 5 bundles from natural language
  - `install-parity-audit` (Milestone 5) — release gate verifying npx = git-clone
- Architecture: plugin loader at `src/lib/plugins/registry.ts`; types at `src/lib/plugins/sdk/types.ts`; dogfood fixture at `src/lib/plugins/examples/finance-pack/`; boot integration at `src/instrumentation-node.ts`
- Rolled-back precursor: `features/roadmap.md` "App Marketplace" cluster (reverted 2026-04-12). This feature deliberately picks up only the directory-scan loader pattern from that work — no publish flow, no trust ladder, no PII sanitizer.
