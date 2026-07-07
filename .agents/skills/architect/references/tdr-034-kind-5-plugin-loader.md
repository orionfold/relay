---
id: TDR-034
title: Kind 5 Plugin Loader Architecture
status: accepted
date: 2026-04-19
category: agent-system
---

# TDR-034: Kind 5 Plugin Loader Architecture

## Context

Milestone 1 of the self-extending machine strategy (`features/primitive-bundle-plugin-kind-5.md`) shipped Kind 5 — primitive bundles that package an agent profile, a workflow blueprint, and a user-table template as a single user-portable unit under `$AINATIVE_DATA_DIR/plugins/<plugin-id>/`. The implementation reused the existing profile registry (`src/lib/agents/profiles/registry.ts`), blueprint registry (`src/lib/workflows/blueprints/registry.ts`), and user-table-template store (`userTableTemplates`) by extending each with namespace-aware merge/clear hooks instead of introducing a parallel "plugin primitive" runtime path.

That decision — extend the existing primitive surfaces rather than fork them — created four architecturally load-bearing micro-decisions during T1–T19:

1. **How are plugin-contributed primitives named?** A registry-style namespace (`<plugin-id>/<primitive-id>` for profiles + blueprints; `plugin:<plugin-id>:<table-id>` for tables) was chosen over a dedicated `pluginId` registry column.

2. **Where do plugin tables live in the data layer?** As ordinary `userTableTemplates` rows with `scope: "system"` and a composite id, NOT via a new `pluginId` column on the existing schema.

3. **Sync vs async at the loader boundary.** `src/lib/plugins/registry.ts` is fully synchronous and statically imports both the profile and blueprint registries. The dynamic-import discipline mandated by TDR-032 was applied surgically only to the chat-tools surface (`src/lib/chat/tools/plugin-tools.ts`) and the boot path (`src/instrumentation-node.ts`).

4. **What happens when a plugin is malformed?** A per-plugin `status: "disabled"` with a populated `error` field, and the loader logs and continues. No exception propagates out of `loadPlugins()` / `reloadPlugins()` / `reloadPlugin()`.

These decisions surfaced during implementation across commits `f05d1f98` (manifest schema) → `57e2633a` (profile namespace extension) → `113360e5` (blueprint namespace extension) → `94f0d0ac` (table install with composite ids) → `f9153148` (registry skeleton) → `4b979061` / `7c14d8f8` / `719d3a37` (per-primitive integration) → `89821c3a` (boot integration) → `e1c90527` (chat-tools surface) → `043130c2` (single-plugin reload). Several were not in the original spec and were made under implementation pressure when the simpler "let's add a `pluginId` column" or "let's await everything" paths were rejected for reasons that deserve to be written down before the patterns drift.

The job of this TDR is to codify those four decisions so Kind 1 (chat tools, Milestone 3) and any future plugin kind reuses the same conventions instead of re-deriving them under different pressures.

## Decision

**The Kind 5 plugin loader's four load-bearing decisions become the canonical pattern for every future plugin kind ainative ships.**

### 1. Plugin-namespacing convention

Every primitive a plugin contributes to a registry-style surface is registered as `<plugin-id>/<primitive-id>`:

- Profiles: `finance-pack/personal-cfo` (see `LoadedPlugin.profiles: string[]` in `src/lib/plugins/sdk/types.ts:22`)
- Blueprints: `finance-pack/monthly-close` (see `LoadedPlugin.blueprints: string[]` in `src/lib/plugins/sdk/types.ts:23`)

Tables ride a different shape because their identifier surface is a database PK rather than a registry key — a slash would collide with downstream URL routing and SQL identifier conventions. They use a triple-segment composite id:

- Tables: `plugin:finance-pack:transactions` (see `LoadedPlugin.tables: string[]` in `src/lib/plugins/sdk/types.ts:24` and `pluginTableId` in `src/lib/data/seed-data/table-templates.ts:239-241`)

The `<plugin-id>/` and `plugin:<plugin-id>:` namespaces are reserved and MUST NOT be used by builtins. The profile and blueprint registries' merge functions (`mergePluginProfiles`, `mergePluginBlueprints`) accept a `pluginId` per entry and the namespace is constructed by the loader, not by the plugin author — bundles MUST author their primitives with bare local ids (e.g., `id: personal-cfo`) and the loader rewrites them.

This namespacing is uniform across the three Kind 5 primitive types and MUST be reused for any new primitive a future plugin kind contributes to a registry-style surface. Kind 1 chat tools (Milestone 3) will need a different shape for SDK-level tool naming because the Anthropic / OpenAI tool-name regex disallows `/`; the working plan is `plugin_<id>_<tool>` for the tool's wire name, with `<plugin-id>/<tool-id>` retained for the chat-tool registry surface that surfaces in `/list_plugins` output. Either way, the principle is unchanged: **plugin primitives MUST be visibly distinguishable from builtins at every layer that displays them.**

### 2. Composite-id table strategy (no new DB columns)

Plugin tables are persisted as ordinary `userTableTemplates` rows with `scope: "system"` and a composite primary key id `plugin:<id>:<table>`. The schema is **not** extended with a `pluginId` foreign key column.

Concrete contract (see `src/lib/data/seed-data/table-templates.ts:237-311`):
- Insert: `installPluginTables(pluginId, templates)` writes one row per template with `id = "plugin:" + pluginId + ":" + template.id`
- Cleanup: `removePluginTables(pluginId)` issues `DELETE FROM userTableTemplates WHERE id LIKE 'plugin:<id>:%'`
- Display disambiguation: the `name` column is suffixed with `(<plugin-id>)` so a plugin shipping a "Customer List" template doesn't produce two indistinguishable picker rows alongside the builtin "Customer List"
- Sample data is capped at `MAX_PLUGIN_SAMPLE_ROWS = 10_000` to bound the JSON payload size

Why composite-id over a new column:
- Honors strategy doc §10 ("plugins MUST NOT add new DB columns or tables") — the only schema change a plugin can produce is rows in pre-existing tables
- Survives `npm run db:generate` cleanly — no migration is generated for plugin install/uninstall
- Enables LIKE-based bulk cleanup that's atomic at the DB level (one statement, no per-row scan + delete pattern)
- Plugin-uninstall is a `DELETE` predicate, not a multi-table cascade — keeps `clear.ts` (the test-fixture cleanup helper) from needing per-plugin awareness

**Future plugin kinds that need to persist data MUST follow the same pattern.** A future Kind 7 ("plugin-contributed schedules") would persist as `schedules` rows with id `plugin:<id>:<schedule>`, NOT a new `schedules.pluginId` column. A future Kind 9 ("plugin-contributed channels") would persist as `channelConfigs` rows with id `plugin:<id>:<channel>`. The composite-id shape is the universal contract; column additions are reserved for first-class ainative concerns.

### 3. Sync loader with dynamic-import asymmetry

The plugin loader at `src/lib/plugins/registry.ts` is **fully synchronous** and statically imports:
- `mergePluginProfiles`, `clearAllPluginProfiles`, `clearPluginProfiles`, `scanProfilesIntoMap` from `@/lib/agents/profiles/registry`
- `mergePluginBlueprints`, `clearAllPluginBlueprints`, `clearPluginBlueprints`, `validateBlueprintRefs` from `@/lib/workflows/blueprints/registry`
- `installPluginTables`, `removePluginTables` from `@/lib/data/seed-data/table-templates`

In particular, `scanBundleBlueprints` calls `validateBlueprintRefs` which itself synchronously imports `getProfile` from the profile registry to verify cross-references. This is **safe** despite TDR-032's no-static-chat-tools-import rule because TDR-032 applies specifically to the cycle `runtime/catalog → chat/ainative-tools → runtime/catalog`, not to the workflows→profiles direction. The plugin loader is reachable from `src/instrumentation-node.ts` (boot path) and from chat tools, neither of which sits inside the runtime registry's static import graph.

Dynamic imports ARE used — but only at the two call sites where the loader is reached from inside the runtime registry's reach:

- `src/lib/chat/tools/plugin-tools.ts` — every handler imports `@/lib/plugins/registry` via `await import()` inside the function body. The file's leading comment (lines 1-12) makes the rule and its reason explicit. A static import would re-introduce the cycle TDR-032 broke, because the chat tool aggregator is statically reachable from `runtime/catalog`.
- `src/instrumentation-node.ts:42-52` — uses `await import("@/lib/plugins/seed")` and `await import("@/lib/plugins/registry")` inside the boot function. Boot ordering matters here (see commit `89821c3a`'s comment block: plugins MUST load AFTER `runPendingMigrations()` and BEFORE `startScheduler()` / `startChannelPoller()`), so async-by-default is the right shape regardless of cycle-safety.

**Future contributors should NOT defensively convert sync paths to async.** If a new caller of the plugin loader appears in a file that is statically reachable from `runtime/catalog`, the fix is a dynamic `await import()` at that specific call site, not an async refactor of the loader. Async cascades through APIs and complicates the React Server Component story; sync stays sync wherever it's safe.

### 4. Per-plugin error isolation as the failure model

A malformed plugin yields a `LoadedPlugin` record with `status: "disabled"` and a populated `error: string` field. The loader logs to `~/.ainative/logs/plugins.log` and continues. **No exception propagates out of `loadPlugins()`, `reloadPlugins()`, or `reloadPlugin()`.**

The failure modes Kind 5 already handles (see `src/lib/plugins/registry.ts:226-321`):
- Missing `plugin.yaml` → `error: "missing plugin.yaml"`
- YAML parse error → `error: "yaml_parse: <message>"`
- Schema validation failure → `error: "<zod issue messages joined>"`
- API version outside the supported window → `error: "apiVersion_mismatch"`
- Duplicate plugin id across two bundle directories → second occurrence gets `error: "duplicate_plugin_id"`
- Per-blueprint cross-reference failure (missing profile, cross-plugin reference) → blueprint dropped, bundle still loads (logged via `logToFile`)
- Per-table schema failure → table dropped, bundle still loads (logged via `logToFile`)

The pattern is intentionally analogous to TDR-009 (idempotent bootstrap self-heals missing tables): the plugin layer makes itself safe at the failure boundary so that **boot is never blocked by a single malformed input**. A user dropping a half-finished bundle into `~/.ainative/plugins/` should see ainative still come up, the bundle marked disabled in `/list_plugins` output, and the rest of the system unaffected.

**Kind 1 (Milestone 3) MUST extend this pattern** with three new failure modes:
- Capability-check failures (a plugin's manifest declares capabilities that the host runtime doesn't grant) → `status: "disabled"`, `error: "capability_denied: <list>"`
- `plugins.lock` mismatches (the bundle's recorded fingerprint doesn't match the on-disk content) → `status: "disabled"`, `error: "lock_mismatch"`
- `--safe-mode` boot flag explicitly disables all plugins → `status: "disabled"`, `error: "safe_mode"` (preserves the "you can see what would have loaded" debug surface)

All three MUST produce `disabled` entries in the loader's return value, never crash boot, never throw. The per-plugin isolation contract is the universal failure model for the entire plugin system.

## Consequences

**Positive:**
- New primitive types added to a future plugin kind have a copy-paste namespace template (`<plugin-id>/<primitive-id>` for registry primitives, `plugin:<plugin-id>:<primitive-id>` for DB-row primitives) — no per-feature naming-convention re-litigation
- Plugin uninstall remains a one-statement `LIKE` predicate forever, no cascade machinery
- The composite-id pattern keeps `clear.ts` (test-fixture cleanup) plugin-agnostic — any future plugin kind that follows the convention "just works" with existing test infrastructure
- The drift heuristic below catches the highest-risk regression class (static import of runtime modules from plugin code) before it ships
- The "disabled with error" failure model means support / triage flows can list malformed bundles without a stack trace — `/list_plugins` gives a tidy enumerated diagnosis

**Neutral:**
- The display-name suffix `(<plugin-id>)` for tables is mildly noisy in the picker UI when the plugin id is long; an alternative would have been a separate "plugin source" column, but that would require schema change rejected in Decision 2. Acceptable trade-off: users who care about cosmetic naming can rename the row after instantiation
- The registry loader being synchronous means tests can call `loadPlugins()` in a `beforeEach` without an `await`, but it also means future contributors who don't read this TDR may be tempted to add `await` at the call site "for safety." The drift heuristic does not catch this; code review must

**Negative / watch for:**
- Two namespace shapes coexist (`<id>/<primitive>` and `plugin:<id>:<primitive>`). A future contributor implementing a new primitive type may pick the wrong one. The rule is mechanical: **registry-style key → slash; DB primary key → colon prefix**. If in doubt, copy from `LoadedPlugin` in `src/lib/plugins/sdk/types.ts:18-27`
- The static-import-of-profile-registry-from-plugin-loader pattern (Decision 3) works only because the workflows→profiles direction is cycle-safe. If a future change makes `getProfile` indirectly depend on `runtime/catalog`, the loader breaks at boot. The drift heuristic at the bottom of this TDR catches the symmetric case (plugin code statically importing runtime code) but not this one — code review of any change to the profile registry's import graph must keep this in mind
- The "log and continue" failure model means a typo in a plugin author's YAML can silently produce a broken plugin that the user only notices when invoking `/list_plugins`. The trade-off vs. the alternative (boot crash) is intentional; the chat tools surface MUST keep `error` field exposure prominent so the user discovers the issue without having to grep `~/.ainative/logs/plugins.log`

## Alternatives Considered

1. **Add `pluginId` columns to every primitive table** (`agentProfiles.pluginId`, `workflowBlueprints.pluginId`, `userTableTemplates.pluginId`). Rejected. Three migrations to ship Kind 5 and another three for every future plugin kind. Plugin uninstall becomes a multi-statement transactional cascade. Plugin-agnostic test fixtures (`clear.ts`) would need per-table awareness. The composite-id approach achieves the same isolation guarantees with zero schema churn and one `LIKE` predicate per table.

2. **Async-by-default plugin loader.** Rejected. The cycle TDR-032 describes is specific to the `runtime/catalog → chat/ainative-tools` direction; mandating async at every plugin call site would propagate `Promise<T>` through every consumer (Server Components reading the plugin list, the API route at `GET /api/plugins`, the chat tool aggregator) for no defensive value. The surgical dynamic-import-at-the-cycle-boundary pattern keeps the loader's signature ergonomic for the 95% of callers that aren't in the runtime registry's reach.

3. **Cross-plugin references** (a plugin can name another plugin's profile in its blueprint via `<other-plugin-id>/<other-profile>`). Rejected for Kind 5. `validateBlueprintRefs` (in `src/lib/workflows/blueprints/registry.ts:190+`) explicitly rejects cross-plugin references with the rationale that they create implicit load-order dependencies between independently-distributed bundles. A blueprint may reference its own bundle's profiles or any builtin profile; that is the entire surface. Reconsider only if a clear use case emerges — at that point the dependency would need to be declared in `plugin.yaml` so the loader can topologically sort bundles before merge.

4. **Throw-on-malformed-plugin and let the boot handler decide.** Rejected. Pushing the "log and continue" responsibility from the loader to its caller means every caller needs the same try/catch shape (boot path, chat tools, API route, single-plugin reload). The loader-internal isolation produces a uniform `LoadedPlugin[]` contract that every caller can rely on without defensive wrapping. This mirrors TDR-009's idempotent-bootstrap self-healing — the right place for self-healing is at the data-producing boundary, not at every consumer.

5. **Single global "plugins" table for all plugin metadata.** Rejected. Would require a new schema migration (per Decision 2's rejection rationale) and would split a plugin's state across two persistence shapes (its primitive rows in their respective tables + its metadata in the global table), making cleanup non-atomic. The current design treats `LoadedPlugin[]` as in-memory derived state from disk + DB rows, with `plugin.yaml` on disk as the source of truth — no ainative-side metadata storage at all.

## References

**Feature spec:** `features/primitive-bundle-plugin-kind-5.md` (status: completed, 2026-04-19)

**Architect plan-vs-spec audit:** `features/architect-report.md` (overwritten on each `/architect` run; the Kind 5 audit was captured in commit `ae96bc5e`)

**Commits that implement this TDR (in implementation order):**
- `55c8364f` — `getAinativePluginsDir` + `getAinativePluginExamplesDir` path helpers (T1)
- `f05d1f98` — manifest schema (Zod) + `LoadedPlugin` types (T2)
- `57e2633a` — `mergePluginProfiles` / `clearPluginProfiles` for Kind 5 injection (T3)
- `113360e5` — `mergePluginBlueprints` + cross-ref validator (T4)
- `52abf161` — drop unnecessary cast in `validateBlueprintRefs` + namespacing comment
- `94f0d0ac` — `installPluginTables` + `removePluginTables` (composite-id strategy) (T5)
- `f9153148` — registry skeleton — manifest validation + apiVersion compat with self-enforcing window test (T6)
- `4b979061` — integrate profiles — scan + namespace + merge (T7)
- `7c14d8f8` — integrate blueprints + cross-ref validator (T8)
- `719d3a37` — integrate tables — DB upsert with composite-id strategy (T9)
- `043130c2` — true single-plugin reload (preserves other plugins' cache entries) (T9b)
- `38afbd8f` — consolidated reload contract test (T10)
- `f0f84f54` — finance-pack dogfood bundle (T11)
- `a33dc9b1` — first-boot dogfood seeder (T12)
- `89821c3a` — wire plugin loader into Next.js boot sequence (T13)
- `e1c90527` — `reload_plugins`, `reload_plugin`, `list_plugins` chat tools (T14)
- `e2b0e702` — `GET /api/plugins` (T15)
- `28db866b` — `POST /api/plugins/reload` (T16)
- `74feaf74` — install-path parity test (npx vs git-clone data dirs) (T17)
- `20a3ee5d` — M1 verification smoke run (T18)
- `ce507393` — mark spec shipped (T19)

**Reference implementations:**
- `src/lib/plugins/registry.ts:226-272` — `loadOneBundle` (the canonical per-bundle scan + merge + install)
- `src/lib/plugins/registry.ts:278-321` — `scanPlugins` (per-plugin error isolation in action)
- `src/lib/plugins/sdk/types.ts:18-42` — `LoadedPlugin` shape + namespacing contract on the type
- `src/lib/agents/profiles/registry.ts:454-481` — `mergePluginProfiles` / `clearPluginProfiles` / `clearAllPluginProfiles`
- `src/lib/agents/profiles/registry.ts:267+` — `scanProfilesIntoMap` (canonical scanner reused by plugin loader to ensure plugin profiles get IDENTICAL treatment to builtins)
- `src/lib/workflows/blueprints/registry.ts:150-205+` — `mergePluginBlueprints` / `clearPluginBlueprints` / `clearAllPluginBlueprints` / `validateBlueprintRefs`
- `src/lib/data/seed-data/table-templates.ts:237-311` — composite-id install/remove/list helpers
- `src/lib/chat/tools/plugin-tools.ts:1-89` — chat tools with the dynamic-import discipline (note the leading TDR-032 comment block)
- `src/instrumentation-node.ts:42-52` — boot integration with ordering invariants
- `src/lib/plugins/examples/finance-pack/` — canonical dogfood bundle exercising profiles, blueprints, and tables together

**Related TDRs:**
- TDR-007 (profile-as-skill-directory) — the reused profile registry that plugin profiles merge into. Plugin profiles use the same `profile.yaml` + `SKILL.md` layout as builtins, just under `~/.ainative/plugins/<id>/profiles/<profile-id>/` instead of `src/lib/agents/profiles/builtins/`
- TDR-009 (idempotent database bootstrap) — the architectural ancestor of Decision 4. Bootstrap self-heals missing tables; the plugin loader self-heals around malformed bundles. Same principle applied at a different layer
- TDR-011 (JSON-in-TEXT columns) — the plugin table install shape (`columnSchema`, `sampleData` as TEXT-encoded JSON) follows this pattern, not a structured-column alternative
- TDR-013 (text primary keys) — the composite id `plugin:<id>:<table>` is a text PK, consistent with all other ainative table id schemes; the alternative integer auto-increment was never considered
- TDR-032 (runtime ainative MCP injection / module-load cycle) — the source of the dynamic-import discipline applied surgically in Decision 3. The static-import-is-fine carve-out for the loader-to-profile-registry direction is justified above

**Drift heuristic addition to `/architect`:**

The architect skill's drift detection checks (under "Drift Heuristics → Runtime Checks") gains a new check:

> **Plugin loader cycle safety.** For every file under `src/lib/plugins/` and every chat-tool kit under `src/lib/chat/tools/`, grep for static `import` of any module under `@/lib/agents/runtime/` or `@/lib/agents/claude-agent`. Flag any matches as candidate cycle risks. The Kind 5 loader and its chat-tool surface MUST use dynamic `await import()` for runtime modules. Same rule applies to any future plugin kind's loader and chat-tool surface. The leading comment block in `src/lib/chat/tools/plugin-tools.ts:1-12` is the canonical example of how the discipline should be documented at the file level.

This check runs automatically in architecture review mode and as a sub-step of architecture health mode.
