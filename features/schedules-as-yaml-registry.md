---
title: Schedules as YAML Registry
status: completed
priority: P0
milestone: post-mvp
source: ideas/self-extending-machine-strategy.md
dependencies: [primitive-bundle-plugin-kind-5, scheduled-prompt-loops]
---

# Schedules as YAML Registry

## Description

Schedules are today the only top-tier primitive that is DB-only. Profiles, blueprints, and tables are all authored as YAML files and loaded through registries (`src/lib/agents/profiles/registry.ts`, `src/lib/workflows/blueprints/registry.ts`, `src/lib/data/seed-data/table-templates.ts`). Kind 5 plugin bundles from Milestone 1 can ship profile + blueprint + table directories, but **cannot** ship `schedules/*.yaml` because there is no YAML schedule loader to wire them through. This feature closes the gap.

After this ships, Kind 5 bundles become functionally complete — a bundle like `finance-pack` can carry its own `monthly-close` schedule referencing its sibling `personal-cfo` profile, and the schedule is alive on the scheduler from the first boot. The strategy doc calls this out explicitly: the `finance-pack` bundle from Milestone 1 "stays half-complete (a personal-cfo profile that can't ship its own monthly-close schedule) until this lands."

The design constraint that makes this feature non-trivial (compared to blueprints, which is the shape this mirrors): schedules are **stateful DB entities**. The schedules table has 30+ columns split between configuration (`name`, `prompt`, `cronExpression`, `agentProfile`, `activeHoursStart`, etc.) and runtime state (`firingCount`, `lastFiredAt`, `nextFireAt`, `suppressionCount`, `failureStreak`, `heartbeatSpentToday`, etc.). A naive reload that upserts every field would reset `firingCount` to 0 and break the scheduler. The upsert must preserve runtime state while reconciling configuration fields in place — exactly the single-statement `onConflictDoUpdate` pattern shipped in Path C for `installPluginTables`.

## User Story

As a plugin author, I want to ship a `schedules/monthly-close.yaml` file inside my Kind 5 bundle so that a user who installs my bundle gets the profile, blueprint, table, **and** the recurring schedule that drives them — a complete primitives pack, not a kit of half-connected pieces.

As a power user, I want to drop a `~/.ainative/schedules/monthly-close.yaml` file and have it become a live, firing schedule the next time the loader runs — without opening the UI to click through a form.

As a developer, I want the schedule loader's shape to match the other three primitive registries so that reading one means I can read all four, and so that the architect's generic `scanBundleSection<T>` helper (Refinement 2, deferred from M1) can replace four near-identical scanners with one.

## Technical Approach

### Storage Layout

Three directories feed the registry, in override order:

- **Built-in**: `src/lib/schedules/builtins/*.yaml` — ships **zero** schedules in v1 (see Scope Boundaries for rationale)
- **User**: `~/.ainative/schedules/*.yaml`
- **Plugin**: `~/.ainative/plugins/<plugin-id>/schedules/*.yaml`

User schedules override built-ins by id; plugin schedules use the `<plugin-id>/<schedule-id>` namespace convention from TDR-034 and can never collide with user schedules.

### Schedule YAML Format

Two subtypes, discriminated by `type`:

**Scheduled (clock-driven):**
```yaml
id: monthly-close
name: Monthly Financial Close
description: Close the books on the 1st of each month at 9am local
version: "1.0.0"
type: scheduled

# Accept either shorthand or raw cron
interval: "1d"
# or: cronExpression: "0 9 1 * *"

prompt: |
  Run the monthly close procedure:
  1. Reconcile all transactions for the prior month
  2. Categorize unclassified entries
  3. Produce the P&L summary

agentProfile: personal-cfo
recurs: true
maxFirings: null
expiresAt: null
deliveryChannels: []
maxTurns: null
maxRunDurationSec: null
```

**Heartbeat (intelligence-driven):**
```yaml
id: inbox-triage
name: Inbox Triage
version: "1.0.0"
type: heartbeat

interval: "30m"
prompt: "Scan the inbox and surface items that need attention."

agentProfile: inbox-manager

activeHoursStart: 9
activeHoursEnd: 18
activeTimezone: America/Los_Angeles
heartbeatBudgetPerDay: 5000000  # microdollars (= $5.00/day cap)
heartbeatChecklist:
  - "New urgent emails from known stakeholders"
  - "Unreplied threads older than 24 hours"
  - "Calendar invites requiring a response"
```

### TypeScript Interface

```typescript
interface ScheduleSpecBase {
  id: string;
  name: string;
  description?: string;
  version: string;
  prompt: string;

  // Exactly one of these is required
  interval?: string;         // e.g., "5m", "2h", "1d"
  cronExpression?: string;   // 5-field cron

  // Exactly one of these is optional (both can be absent → default agent)
  agentProfile?: string;
  assignedAgent?: string;

  recurs?: boolean;          // default: true
  maxFirings?: number | null;
  expiresAt?: string | null; // ISO8601
  deliveryChannels?: string[];
  maxTurns?: number | null;
  maxRunDurationSec?: number | null;
}

interface ScheduledSpec extends ScheduleSpecBase {
  type: "scheduled";
}

interface HeartbeatSpec extends ScheduleSpecBase {
  type: "heartbeat";
  heartbeatChecklist?: string[];
  activeHoursStart?: number;   // 0–23
  activeHoursEnd?: number;     // 0–23
  activeTimezone?: string;     // IANA tz id
  heartbeatBudgetPerDay?: number | null;
}

type ScheduleSpec = ScheduledSpec | HeartbeatSpec;
```

### Zod Schema (Discriminated Union)

```typescript
const ScheduleBaseFields = {
  id: z.string().regex(/^[a-z][a-z0-9-]*$/).min(2),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  prompt: z.string(),
  interval: z.string().optional(),
  cronExpression: z.string().optional(),
  agentProfile: z.string().optional(),
  assignedAgent: z.string().optional(),
  recurs: z.boolean().default(true),
  maxFirings: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  deliveryChannels: z.array(z.string()).optional(),
  maxTurns: z.number().int().positive().nullable().optional(),
  maxRunDurationSec: z.number().int().positive().nullable().optional(),
};

const intervalOrCron = (s: z.infer<typeof BaseObj>) =>
  Boolean(s.interval) !== Boolean(s.cronExpression);

const ScheduledSchema = z.object({
  type: z.literal("scheduled"),
  ...ScheduleBaseFields,
}).refine(intervalOrCron, { message: "must specify exactly one of interval or cronExpression" });

const HeartbeatSchema = z.object({
  type: z.literal("heartbeat"),
  ...ScheduleBaseFields,
  heartbeatChecklist: z.array(z.string()).optional(),
  activeHoursStart: z.number().int().min(0).max(23).optional(),
  activeHoursEnd: z.number().int().min(0).max(23).optional(),
  activeTimezone: z.string().optional(),
  heartbeatBudgetPerDay: z.number().int().positive().nullable().optional(),
}).refine(intervalOrCron, { message: "must specify exactly one of interval or cronExpression" });

export const ScheduleSpecSchema = z.discriminatedUnion("type", [ScheduledSchema, HeartbeatSchema]);
```

Adopting `z.discriminatedUnion` here also previews the shape M3's plugin manifest schema will use (architect Refinement 1, deferred to M3 start). Landing it here first de-risks M3.

### Registry — `src/lib/schedules/registry.ts` (new)

Mirrors the blueprints registry shape:

- `loadSchedules()` — scans built-in + user dirs, validates with Zod, returns `Map<string, ScheduleSpec>`
- `getSchedule(id)` / `listSchedules()` / `reloadSchedules()` / `isBuiltinSchedule(id)`
- `createScheduleFromYaml(yaml)` / `deleteSchedule(id)` — user CRUD path
- `mergePluginSchedules(entries)` / `clearPluginSchedules(pluginId)` / `clearAllPluginSchedules()` / `listPluginScheduleIds(pluginId)` — mirrors blueprints plugin injection
- `validateScheduleRefs(spec, { pluginId, siblingProfileIds })` — cross-ref validator

### Cron Resolution

Reuse `parseInterval()` from `src/lib/schedules/interval-parser.ts` — it already accepts both shorthand (`5m`, `2h`, `1d`) and raw 5-field cron. No new parser. The resolver layer:

1. If `spec.interval` set → `parseInterval(spec.interval)` → cron string
2. Else if `spec.cronExpression` set → validate as 5-field cron → return as-is
3. Persist the resolved cron string to `schedules.cronExpression` regardless of authored form

### DB Upsert with State Preservation — the critical section

`installSchedulesFromSpecs(specs: ScheduleSpec[], opts?: { pluginId?: string })` maps each spec to a DB row id and issues one `onConflictDoUpdate` per row. The `.values()` block carries **defaults for new rows**; the `.set()` block carries **config-only fields** (never state):

```typescript
db.insert(schedulesTable)
  .values({
    id,
    name: spec.name,
    prompt: spec.prompt,
    cronExpression: resolvedCron,
    agentProfile: spec.agentProfile ?? null,
    assignedAgent: spec.assignedAgent ?? null,
    recurs: spec.recurs ?? true,
    maxFirings: spec.maxFirings ?? null,
    expiresAt: spec.expiresAt ? new Date(spec.expiresAt) : null,
    type: spec.type,
    heartbeatChecklist: spec.type === "heartbeat" ? JSON.stringify(spec.heartbeatChecklist ?? []) : null,
    activeHoursStart: spec.type === "heartbeat" ? (spec.activeHoursStart ?? null) : null,
    activeHoursEnd:   spec.type === "heartbeat" ? (spec.activeHoursEnd ?? null)   : null,
    activeTimezone:   spec.type === "heartbeat" ? (spec.activeTimezone ?? "UTC") : "UTC",
    heartbeatBudgetPerDay: spec.type === "heartbeat" ? (spec.heartbeatBudgetPerDay ?? null) : null,
    deliveryChannels: JSON.stringify(spec.deliveryChannels ?? []),
    maxTurns: spec.maxTurns ?? null,
    maxRunDurationSec: spec.maxRunDurationSec ?? null,
    // Defaults applied ONLY on first insert:
    status: "active",
    firingCount: 0,
    suppressionCount: 0,
    failureStreak: 0,
    heartbeatSpentToday: 0,
    turnBudgetBreachStreak: 0,
    nextFireAt: computeNextFire(resolvedCron),
    createdAt: now,
    updatedAt: now,
  })
  .onConflictDoUpdate({
    target: schedulesTable.id,
    set: {
      // Config fields ONLY. Runtime state (firingCount, lastFiredAt,
      // suppressionCount, failureStreak, heartbeatSpentToday,
      // turnBudgetBreachStreak, avgTurnsPerFiring, lastTurnCount,
      // lastFailureReason, lastActionAt, heartbeatBudgetResetAt,
      // maxTurnsSetAt, createdAt, STATUS) is preserved.
      name: spec.name,
      prompt: spec.prompt,
      cronExpression: resolvedCron,
      agentProfile: spec.agentProfile ?? null,
      assignedAgent: spec.assignedAgent ?? null,
      recurs: spec.recurs ?? true,
      maxFirings: spec.maxFirings ?? null,
      expiresAt: spec.expiresAt ? new Date(spec.expiresAt) : null,
      type: spec.type,
      heartbeatChecklist: spec.type === "heartbeat" ? JSON.stringify(spec.heartbeatChecklist ?? []) : null,
      activeHoursStart: spec.type === "heartbeat" ? (spec.activeHoursStart ?? null) : null,
      activeHoursEnd:   spec.type === "heartbeat" ? (spec.activeHoursEnd ?? null)   : null,
      activeTimezone:   spec.type === "heartbeat" ? (spec.activeTimezone ?? "UTC") : "UTC",
      heartbeatBudgetPerDay: spec.type === "heartbeat" ? (spec.heartbeatBudgetPerDay ?? null) : null,
      deliveryChannels: JSON.stringify(spec.deliveryChannels ?? []),
      maxTurns: spec.maxTurns ?? null,
      maxRunDurationSec: spec.maxRunDurationSec ?? null,
      updatedAt: now,
      // NOTE: `status` is NOT in this set. A user who pauses a schedule in
      // the UI keeps it paused across reloads. The loader never un-pauses.
      // NOTE: `nextFireAt` is also NOT here. Recomputing it on every reload
      // would shift fire windows. The scheduler engine already tolerates a
      // stale nextFireAt — it re-derives on the next tick from the current
      // cronExpression. See "Race with scheduler" below.
    },
  })
  .run();
```

Fields explicitly excluded from the `.set()` clause and why:

| Field | Why preserved |
|---|---|
| `status` | User-controlled pause/resume must survive reload |
| `firingCount`, `suppressionCount`, `failureStreak`, `turnBudgetBreachStreak`, `heartbeatSpentToday` | Counters are scheduler-owned runtime state |
| `lastFiredAt`, `lastActionAt`, `heartbeatBudgetResetAt`, `maxTurnsSetAt` | Timestamps are scheduler-owned |
| `avgTurnsPerFiring`, `lastTurnCount`, `lastFailureReason` | Computed after each firing |
| `nextFireAt` | Scheduler re-derives from `cronExpression` on next tick; reload-side recomputation risks double-firing |
| `createdAt` | Preserved across all upserts (M1 pattern) |

### Plugin Schedule Integration

Mirrors M1's table composite-id strategy. Plugin schedules land in the shared `schedules` DB table with a composite id:

```
plugin:<plugin-id>:<schedule-id>
```

- `installPluginSchedules(pluginId, specs)` — calls `installSchedulesFromSpecs(specs, { pluginId })`
- `removePluginSchedules(pluginId)` — `DELETE FROM schedules WHERE id LIKE 'plugin:<pluginId>:%'`
- `listPluginScheduleIds(pluginId)` — introspection, mirrors `listPluginTableIds`

Display-name disambiguation: like tables, a plugin-owned schedule's `name` column gets the ` (<plugin-id>)` suffix so the schedules page doesn't show two indistinguishable rows when a plugin ships a schedule whose name collides with a user's.

### Cross-Reference Validator

```typescript
validateScheduleRefs(spec, {
  pluginId?: string;
  siblingProfileIds: Set<string>;  // namespaced profile ids in the same bundle
})
```

Mirrors `validateBlueprintRefs`. Checks:

1. If `spec.agentProfile` is set:
   - Namespaced (`contains "/"`): must be in `siblingProfileIds` for the same `pluginId`; cross-plugin refs are rejected
   - Unnamespaced: must resolve via `getProfile(id)` in the builtin profile registry
2. If `spec.cronExpression` or resolved `interval` produces an invalid cron, reject with the parser's error
3. If `spec.deliveryChannels` references a channel, warn-but-accept when unresolved (channels may be configured after load)

### Loader Boot Sequence

Plugin loader wiring, per M1 boot-order invariants (TDR-034) in `src/instrumentation-node.ts`:

```
bootstrap → migrations → plugin loader (profiles + blueprints + tables + SCHEDULES)
          → scheduler.start() → channel-poller → auto-backup
```

Schedules must land in the DB **before** `scheduler.start()` so that first-boot plugin schedules fire on their normal cadence rather than waiting for the next loader pass. This is a strictly-ordered invariant that the M1 boot-order comment already protects.

### Generic `scanBundleSection<T>` Helper (Architect Refinement 2)

M1 shipped three near-identical per-section scanners in `src/lib/plugins/registry.ts`: `scanBundleProfiles`, `scanBundleBlueprints`, `scanBundleTables`. M2 would make that four. The architect's Refinement 2 deferral (from `features/architect-report.md`) explicitly calls for extracting a generic helper **at the moment the fourth user is added**, not before:

```typescript
function scanBundleSection<T>(
  root: string,
  section: "profiles" | "blueprints" | "tables" | "schedules",
  parse: (filePath: string) => T | null,
  namespace: (pluginId: string, entity: T) => T,
): T[]
```

The four current scanners collapse into four thin adapters that supply the `parse` and `namespace` closures. This is a **plan-level** concern, not a spec-level one; the spec calls it out so the implementation plan knows to do it before adding the fourth scanner, and so the commit sequence can bundle the refactor + M2 scanner in one reviewable step.

### Dogfood — `finance-pack/schedules/monthly-close.yaml`

The finance-pack bundle that auto-seeds on first boot (per M1's first-boot seeder) gets a new `schedules/monthly-close.yaml` that references the sibling `finance-pack/personal-cfo` profile. After first boot, the schedule is live on the scheduler; `GET /api/plugins` reports it in the plugin's schedule list. This closes the strategy doc's "half-complete finance-pack" gap and acts as the end-to-end smoke proof.

### Chat Tools (Three New)

Mirrors the M1 plugin-tools pattern (three tools: list + reload-all + reload-one). Adapted for schedules:

- `list_schedule_specs` — lists all loaded specs with source (builtin / user / plugin id)
- `install_schedule_from_yaml({ yaml })` — user CRUD; writes to `~/.ainative/schedules/<id>.yaml` and reloads
- `reload_schedules` — re-scans all sources, reconciles DB with state preservation

Each tool **must** use dynamic `await import("@/lib/schedules/registry")` inside the handler body (not static) — TDR-032 module-load-cycle discipline. This discipline is load-bearing and is the reason M1 T18 smoke ran; M2 implementation plan must budget an equivalent real `npm run dev` smoke step.

## Acceptance Criteria

- [ ] Registry loads schedules from `~/.ainative/schedules/*.yaml` and `~/.ainative/plugins/<id>/schedules/*.yaml`, validated by a `z.discriminatedUnion` Zod schema
- [ ] Both `type: scheduled` and `type: heartbeat` are accepted, with type-specific fields rejected when they appear on the wrong subtype
- [ ] `interval: "5m"` and `cronExpression: "0 9 * * *"` are both accepted; the loader rejects YAML that specifies neither or both
- [ ] User schedules land in the DB as `schedules` rows on loader pass
- [ ] Plugin schedules land with composite id `plugin:<plugin-id>:<schedule-id>` and display-name suffix `(<plugin-id>)`
- [ ] Upsert preserves runtime state across reloads: `status`, `firingCount`, `suppressionCount`, `failureStreak`, `turnBudgetBreachStreak`, `heartbeatSpentToday`, `lastFiredAt`, `lastActionAt`, `heartbeatBudgetResetAt`, `maxTurnsSetAt`, `avgTurnsPerFiring`, `lastTurnCount`, `lastFailureReason`, `nextFireAt`, `createdAt`
- [ ] Upsert updates config fields in place on subsequent reloads: `name`, `prompt`, `cronExpression`, `agentProfile`, `assignedAgent`, `recurs`, `maxFirings`, `expiresAt`, `type`, heartbeat fields, `deliveryChannels`, `maxTurns`, `maxRunDurationSec`, `updatedAt`
- [ ] Cross-ref validator rejects schedules whose `agentProfile` does not resolve (unknown builtin id OR cross-plugin reference OR unresolved sibling)
- [ ] `removePluginSchedules(pluginId)` deletes plugin-owned schedule rows on plugin disable/removal without orphaning in-flight child tasks
- [ ] finance-pack bundle ships `schedules/monthly-close.yaml` referencing `finance-pack/personal-cfo`; first-boot dogfood seeder auto-installs it; `GET /api/plugins` reports `schedules: ["plugin:finance-pack:monthly-close"]`
- [ ] Three new chat tools: `list_schedule_specs`, `install_schedule_from_yaml`, `reload_schedules` — all use dynamic `await import()` for the registry per TDR-032
- [ ] Generic `scanBundleSection<T>` helper in `src/lib/plugins/registry.ts` replaces the three M1 per-section scanners; all four primitive kinds (profiles, blueprints, tables, schedules) use it
- [ ] Self-enforcing invariant test asserts that every column in the `schedules` table is explicitly categorized as either **in `.values()` + `.set()`** (config) or **in `.values()` only** (state) — no column accidentally lands in neither, and no column accidentally lands in both with divergent semantics
- [ ] `npm run dev` smoke confirms: boot emits `[schedules] N loaded` after `[plugins] N loaded`; a newly-added YAML schedule appears as a firing DB row within one loader pass; editing the YAML and reloading updates `prompt` in place while preserving `firingCount`

## Scope Boundaries

**Included:**
- YAML registry, Zod discriminated-union schema, DB upsert with state preservation
- Both `scheduled` and `heartbeat` subtypes
- Plugin integration via composite id, cross-ref validator, display-name disambiguation
- Generic `scanBundleSection<T>` helper refactor (bundled with this milestone per architect Refinement 2)
- finance-pack dogfood `monthly-close` schedule
- Three new chat tools for parity with M1
- Regression test confirming the state-preservation invariant per-column

**Excluded:**
- **Built-in schedules** — v1 ships zero. Schedules are inherently domain-specific (a builtin "Monthly Close" would be noise for a user who isn't running finance). Leave them to user YAML and plugin bundles.
- **Visual schedule editor UI** — the existing DB-driven schedules UI plus a plain YAML-textarea form is sufficient; no drag-and-drop designer in v1
- **GitHub import flow for bare schedule YAML** — reuse plugin import instead; there is no `ainative import --schedule <url>` command in v1
- **DB → YAML export** — one-way flow only (YAML → DB). Round-tripping a running schedule's runtime state to YAML would leak state into config files; avoid by design.
- **Schedule versioning / migration UI** — version is tracked in frontmatter; no migration UI ships in v1
- **Multi-timezone for scheduled (non-heartbeat) type** — `cronExpression` is evaluated in the server timezone for `type: scheduled`. `activeTimezone` is heartbeat-only and only governs active-hours windowing.
- **Partial reload** — reload either reconciles everything or nothing. No per-schedule targeted reload in v1 (the M1 `reload_plugin(id)` tool handles plugin-scoped targeted reload already).

## Verification run — 2026-04-19

**Commit SHA verified:** `51308a56` (state-preservation bug fix applied on top of T10 wiring)
**Port:** 3010
**Data dir:** `~/.ainative-smoke-m2` (isolated, fresh)

**Boot sequence** (from `/tmp/m2-smoke-2.log`):
- `[instance] bootstrap skipped: dev_mode_sentinel` ✅
- `[db] Recovered legacy database — all migrations stamped.` ✅
- `[plugins] 1 loaded, 0 disabled` ✅ (finance-pack auto-seeded)
- `[scheduler] started — polling every 60s` (AFTER plugins, ordering invariant intact) ✅
- No `ReferenceError` / `Cannot access ... before initialization` / `claudeRuntimeAdapter` errors ✅

**Dogfood schedule present** (`GET /api/plugins`):
- `finance-pack.schedules: ["plugin:finance-pack:monthly-close"]` ✅
- DB row: `plugin:finance-pack:monthly-close|Monthly Financial Close (finance-pack)|finance-pack/personal-cfo|active|0` ✅ (composite id + `(finance-pack)` suffix + sibling profile ref)

**State preservation (T18 Step 7)**:
```
SET:    status=paused, firing_count=17
RELOAD: POST /api/plugins/reload (200 in 172ms)
AFTER:  status=paused, firing_count=17  ← PRESERVED ✅
```

**Reload path (T18 Step 6)**:
- Added user pack `test-m2/schedules/daily-digest.yaml`, reload → DB row `plugin:test-m2:daily-digest` appeared ✅
- Removed `test-m2` dir, reload → orphan row dropped, `finance-pack:monthly-close` row survived ✅
- After 3 cumulative reloads, finance-pack state still `paused|17` — preservation holds across multiple reload cycles ✅

**Bug surfaced by this smoke run**: initial T10 wiring had `removePluginSchedules` before `installPluginSchedules`, defeating the `onConflictDoUpdate` upsert. The fix at `51308a56` deletes orphans POST-install via new `removeOrphanSchedules(pluginId, keepIds)` helper. Regression tests in `schedule-integration.test.ts` (state preservation + orphan cleanup) and `installer.test.ts` (helper unit tests) guard against regression. This is precisely the failure mode T18 is designed to catch — unit tests structurally cannot verify it because they don't exercise the full `loadOneBundle` → DB → reload cycle against a shared row.

---

## References

- Source: internal self-extending-machine strategy §9 Milestone 2, §5 (plugin disk layout), §10 (non-goals)
- Depends on: [`primitive-bundle-plugin-kind-5`](primitive-bundle-plugin-kind-5.md) — the plugin loader, composite-id strategy, per-plugin error isolation, boot-order invariants
- Depends on: [`scheduled-prompt-loops`](scheduled-prompt-loops.md) — scheduler engine, interval parser, cron semantics, schedules DB table
- Shape-parent: [`workflow-blueprints`](workflow-blueprints.md) — the YAML + Zod + registry + loader pattern this mirrors (registry.ts, plugin injection surface, cross-ref validator)
- Architectural: [TDR-034](../.agents/skills/architect/references/tdr-034-kind-5-plugin-loader.md) — namespacing convention, composite-id strategy, sync loader / dynamic-import asymmetry (applies to chat tools)
- Plan-level: `features/architect-report.md` Refinement 2 — generic `scanBundleSection<T>` helper extraction, mandatory on fourth user
- Related M3: `chat-tools-plugin-kind-1` (not yet groomed — strategy doc §9 Milestone 3) — will also adopt `z.discriminatedUnion` at the manifest-schema layer; this spec de-risks the M3 schema shape by introducing the pattern here first
