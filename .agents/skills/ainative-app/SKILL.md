---
name: ainative-app
description: Scaffold an ainative-native app by composing existing primitives (agent profiles, workflow blueprints, user tables, schedules, document routing) from a YAML manifest instead of writing TypeScript. Use when the user asks to "create an ainative app", "scaffold an app", "build an app manifest", "design an app in ainative", "wealth-manager-style app", "app from config", "compose an ainative app", or when they want to package a workflow + profile + schedule + table combination as a reusable bundle. Also triggers when the user wants to turn an ad-hoc workflow into a shippable app or when a proposed feature can be built entirely by composition of existing primitives. Do NOT use for writing new TypeScript components, new DB migrations, new chat tools, or net-new primitive kinds — those are outside the config-over-code contract; route to `product-manager` or `architect` instead.
---

# ainative-app

Turn "I want an ainative app that does X" into a ready-to-register scaffold composed of ainative's shipped primitives. No TypeScript, no schema migrations — just YAML, markdown, and chat-tool invocations that wire into existing registries.

## Core Principle

**ainative apps are compositions of primitives, not new code.**

An app is a named, namespaced bundle of:

- one or more **agent profiles** (behavior + allowed tools)
- one or more **workflow blueprints** (multi-step pipelines)
- optional **user tables** (structured data with optional CSV seed)
- optional **schedules** (cron-driven automation)
- optional **document routing** (inputs/outputs wired to workflows)
- a top-level **manifest** describing the composition

If the user's idea requires a new DB table kind, a new chat tool, a new UI route, or a new runtime feature, **this skill is not the right tool**. Redirect to `product-manager` (for spec drafting) or `architect` (for system design).

## Inputs and Triggers

Invoke this skill when the user says things like:

- "scaffold a ainative app for X"
- "create an app that does Y"
- "build a wealth-manager-style app for Z"
- "turn this workflow into a reusable app"
- "compose an app from existing profiles + blueprints"
- "design a ainative app manifest"

Ignore triggers unrelated to composition (e.g., "build a feature", "write a component" — those belong to other skills).

## The Primitive Menu

What you can compose, and where it lives:

| Primitive | Registry path | Loader | User override |
|-----------|---------------|--------|---------------|
| Agent profile | `src/lib/agents/profiles/builtins/<id>/profile.yaml` + SKILL.md | `src/lib/agents/profiles/registry.ts` | `.Codex/skills/<id>/profile.yaml` + SKILL.md |
| Workflow blueprint | `src/lib/workflows/blueprints/builtins/<id>.yaml` | `src/lib/workflows/blueprints/registry.ts` | `~/.ainative/blueprints/<id>.yaml` (via `getStagentBlueprintsDir()` in `src/lib/utils/ainative-paths.ts:16`) |
| User table | `userTables`/`userTableRows` schema | chat tools `create_table`, `create_row`, `import_table_data` | — (DB-backed) |
| Schedule | `schedules` schema | chat tool `create_schedule` | — (DB-backed, no YAML registry YET — see Gap Awareness) |
| Document routing | `workflowDocumentInputs`, `taskTableInputs`, `projectDocumentDefaults` | Chat tools + `/documents` UI | — |
| Permission preset | Hardcoded at `src/lib/settings/permission-presets.ts:19-66` | N/A | — (3 presets only: `read-only`, `git-safe`, `full-auto`) |

**13 builtin profiles** ship today: `general`, `code-reviewer`, `researcher`, `document-writer`, `project-manager`, `technical-writer`, `data-analyst`, `devops-engineer`, `wealth-manager`, `health-fitness-coach`, `travel-planner`, `shopping-assistant`, `learning-coach`. Inspect `src/lib/agents/profiles/builtins/<id>/profile.yaml` to see the concrete shape.

**10 builtin blueprints** ship today: `business-daily-briefing`, `code-review-pipeline`, `content-marketing-pipeline`, `customer-support-triage`, `documentation-generation`, `financial-reporting`, `investment-research`, `lead-research-pipeline`, `meal-planning`, `product-research`. Inspect `src/lib/workflows/blueprints/builtins/<id>.yaml`.

## The 4-Phase Workflow

Follow these phases in order. Do not skip Phase 1 even when the user sounds sure — composition quality depends on a clear intent.

### Phase 1 — Intent

Ask the user 3 questions (via `AskUserQuestion` when available, otherwise as plain prompts). Don't write anything yet.

1. **Who is this for?** Persona of the primary user (e.g., "individual investor", "solo consultant", "hobby gardener"). One line.
2. **What are the 1–3 key tasks the agent should run?** Concrete verbs, not abstract goals. Examples: "summarize my portfolio every Monday morning", "review PRs and post a report", "plan meals from my fridge inventory".
3. **What data flows in?** Documents uploaded, tables of structured rows, feeds from schedules, none — whatever applies.

Do not proceed to Phase 2 until you have specific answers. If the user's answers are vague, restate your understanding and ask for confirmation.

### Phase 2 — Compose

For each key task from Phase 1:

1. **Match a blueprint first.** Search the 10 builtin blueprints for an 80%+ fit. If found, reuse its `id` verbatim in the manifest.
2. **If no fit, author a new blueprint YAML.** Minimum required fields: `id`, `name`, `description`, `version`, `pattern` (`sequence` | `parallel` | `checkpoint`), `variables[]`, `steps[]`. Mirror `src/lib/workflows/blueprints/builtins/business-daily-briefing.yaml` as your structural template.
3. **Pick or author the profile.** Search the 13 builtins for 80%+ fit. If none, author a new profile with `id`, `name`, `version`, `domain`, `tags[]`, `supportedRuntimes[]`, `allowedTools[]`, `canUseToolPolicy`, `maxTurns`, and a companion SKILL.md for the behavioral prompt. Mirror `src/lib/agents/profiles/builtins/customer-support-agent/profile.yaml`.
4. **Table step.** If the user named structured data (e.g., "positions", "leads", "recipes"), propose a `userTables` entry with columns and an optional CSV seed in `<app>/seed/`.
5. **Schedule step.** If the user used time-based language ("every Monday", "daily", "hourly"), propose a schedule entry with cron and the blueprint it runs.
6. **Permission preset.** Default to `read-only` unless the user's tasks explicitly write or delete data; escalate to `git-safe` for repo-touching apps.

Always **namespace every artifact id with `<app-id>--`** (two hyphens) so two apps can ship profiles or blueprints with similar names without colliding. Per `features/app-package-format.md:125`, this is the single-source namespacing convention for apps.

**Before adding any TABLE or SCHEDULE, reconcile against `features/pack-taxonomy.md`** — the shared registry of logical primitive ids and their single owners. Table/schedule ids are NOT namespaced (sharing them is how composition works: an automation pack attaches a trigger to a spine's table by referencing its id), so a logical id is a shared name with exactly ONE owner. Do not redeclare a table a peer pack already owns (e.g. a persona spine owns `clients`; an industry pack contributes its DISTINCT table like `rent_roll` and seeds its vertical clients into the spine's book via `seed/customers.yaml`, never a second `clients`). Redeclaring an owned id silently shadows it side-by-side and refuses a bundle flatten with `BundleCollisionError`. The registry is **codified in `src/lib/packs/taxonomy.ts`** (typed + Zod, mirrored to `taxonomy.json`) and the **`check:pack-taxonomy` build gate** (`scripts/check-pack-taxonomy.mjs`) fails a release on a drifted/unregistered/second-owner declaration — `pack-taxonomy.md` is the human-readable mirror. When you add or move an owned primitive, update `taxonomy.ts` (then run `node scripts/generate-taxonomy-json.mjs`) AND `pack-taxonomy.md` in the same change.

### Fall-through: when composition can't express the ask

If any required primitive can't be composed from the existing kit (profiles,
blueprints, tables, schedules), **do not** declare the app incomplete. Instead,
call the `create_plugin_spec` chat tool to scaffold a Kind 1 MCP plugin that
fills the gap, then compose around it.

Examples of asks that need a plugin fall-through:

- External HTTP API reads (GitHub, Linear, Notion) — composition has no
  outbound HTTP primitive.
- Custom file parsers or non-PDF document extractors.
- Domain-specific CLI wrappers (git, kubectl) that aren't in the built-in
  tool set.

When you invoke `create_plugin_spec`, always pass:

- `id`: kebab-case, derived from the app slug with a suffix (e.g. for
  `wealth-tracker`, plugin might be `wealth-tracker-tools`).
- `language: "python"`, `transport: "stdio"` — v1 scaffolds these only;
  `node` or `inprocess` writes a TODO stub until Phase 6.5.
- `tools: [...]` — one entry per gap-filling tool; each gets a handler
  stub in `server.py` the user (or a follow-up chat turn) fills in.

The scaffold carries `author: ainative` AND `origin: ainative-internal`,
routing it onto the TDR-037 self-extension trust path — **no
capability-accept prompt, no `plugins.lock` entry**.

### Phase 3 — Emit Artifacts

Write these files (absolute paths from repo root, unless noted):

- **One new profile directory per new profile:**
  `.Codex/skills/<app-id>--<profile-id>/SKILL.md` + `.Codex/skills/<app-id>--<profile-id>/profile.yaml`
  The SKILL.md holds the system-prompt behavior (frontmatter `name:`, `description:` — mirror existing project skills). The profile.yaml holds metadata + tool policy.

- **One new blueprint YAML per new blueprint:**
  `~/.ainative/blueprints/<app-id>--<blueprint-id>.yaml`
  (Absolute home-dir path. Do NOT write into `src/lib/workflows/blueprints/builtins/` — that's reserved for upstream ainative itself. User blueprints load via `getStagentBlueprintsDir()`.)

- **One app-level manifest:**
  `~/.ainative/apps/<app-id>/manifest.yaml` — see schema below.
  (Absolute home-dir path — this is the canonical apps location per
  TDR-037 and the registry scan in `src/lib/apps/registry.ts`. Do NOT
  write to `.Codex/apps/<app-id>/` — the registry only sees
  `getAinativeAppsDir()`.)

- **Optional seed data:**
  `~/.ainative/apps/<app-id>/seed/<table-id>.csv` per seeded table.

- **A short human README:**
  `~/.ainative/apps/<app-id>/README.md` — persona, purpose, install instructions, inventory of artifacts.

### Dual-target emit when a plugin is scaffolded

When Phase 2 fall-through invoked `create_plugin_spec`, the app emits **two**
artifact targets:

1. **Plugin dir** — `~/.ainative/plugins/<plugin-id>/{plugin.yaml,.mcp.json,server.py,README.md}`
   (written by `create_plugin_spec`; do not duplicate).

2. **App manifest** — `~/.ainative/apps/<app-id>/manifest.yaml` that *references*
   the plugin id under a `plugins:` key, so the `/apps` registry surfaces the
   composed app (not just the bare plugin).

Example app manifest with a plugin reference:

```yaml
id: wealth-tracker
name: Wealth Tracker
description: Weekly portfolio check-in with external API data.
profiles: [wealth-analyst]
blueprints: [weekly-checkin]
tables: [positions, holdings]
schedules: [monday-7am]
plugins:
  - wealth-tracker-tools   # scaffolded by create_plugin_spec
```

**Do NOT** collapse plugins and apps into a single directory —
`~/.ainative/plugins/` is for executable code, `~/.ainative/apps/` is for
composition manifests. The `/apps` registry scan only reads from `apps/`.

### Phase 4 — Wire + Verify

1. Call chat tool `reload_profiles` so the newly-written profile.yaml is registered.
2. Call chat tool `reload_blueprints` so the newly-written blueprint YAML is registered.
3. Call `list_profiles` — verify the new `<app-id>--<profile-id>` appears.
4. Call `list_blueprints` — verify the new `<app-id>--<blueprint-id>` appears.
5. For each table in the manifest, call `create_table` with the columns + optional CSV import via `import_table_data`.
6. For each schedule, call `create_schedule` (see Gap Awareness — this primitive is DB-only today).
7. Produce a **verification checklist** for the user:
   - How to instantiate the blueprint (chat tool `instantiate_blueprint` or the `/workflows/blueprints` UI)
   - How to assign the profile to an ad-hoc task or a workflow step
   - Where to view the schedule (`/schedules`) and the seeded table (`/tables`)
   - Expected first-run outcomes

Do NOT auto-run the app. The user decides when to trigger the first task.

## Manifest Schema

`~/.ainative/apps/<app-id>/manifest.yaml`:

```yaml
id: wealth-tracker                  # unique app id, kebab-case
version: 0.1.0
name: Wealth Tracker
description: Personal portfolio check-ins with weekly summaries.
persona: individual-investor
author: user                        # or a concrete name / team

profiles:
  - id: wealth-tracker--portfolio-coach
    source: .Codex/skills/wealth-tracker--portfolio-coach/

blueprints:
  - id: wealth-tracker--weekly-review
    source: ~/.ainative/blueprints/wealth-tracker--weekly-review.yaml

tables:
  - id: wealth-tracker--positions
    columns: [ticker, qty, cost_basis, account]
    seed: ~/.ainative/apps/wealth-tracker/seed/positions.csv

schedules:
  - id: wealth-tracker--monday-8am
    cron: "0 8 * * 1"
    runs: blueprint:wealth-tracker--weekly-review

permissions:
  preset: read-only                 # or: git-safe, full-auto, custom

documents:
  inputs:
    - kind: any                     # scoped to workflows the app installs
      mimeTypes: [application/pdf, text/csv]
```

This schema is **forward-compatible** with `.sap` per `features/app-package-format.md:§§76-150`. When that format lands, `sapToBundle()` will consume this exact shape.

## When NOT to use this skill

Refuse and redirect if the user needs:

- A net-new DB table kind beyond `userTables` → use `architect` (new schema requires code)
- A new chat tool → use `architect` (new MCP tool requires code)
- A new UI route or component → implement directly using `AGENTS.md`, `design-system/MASTER.md`, and `src/app/globals.css` (this skill emits no React)
- A new runtime feature, new catalog flag, or new provider adapter → use `architect`
- A new primitive kind entirely (e.g., "app-level pricing plans") → use `product-manager` to spec it first

It's OK to return empty-handed — "this is outside config-over-code; route to X" is a valid completion.

## Worked Example — "Wealth Tracker" app

Illustrative; adapt to the user's real intent.

### Phase 1 — Intent (answers to the 3 questions)

1. **Persona:** Individual investor managing a self-directed portfolio.
2. **Key tasks:**
   - Every Monday 8am, summarize last week's portfolio performance and surface 3 watchlist items.
   - On-demand, ingest a broker CSV and update positions table.
3. **Data in:** Broker CSV (weekly), portfolio positions table (persistent), watchlist notes (stored in the same table or a sibling).

### Phase 2 — Compose decisions

- **Blueprint match:** `investment-research` is close but focuses on research, not position tracking. Author new `wealth-tracker--weekly-review`.
- **Profile match:** `wealth-manager` builtin is 90% right. Reuse verbatim (no new profile). If the user wants tighter allowedTools, fork to `wealth-tracker--portfolio-coach` (shown below for fullness).
- **Table:** `wealth-tracker--positions` with columns `[ticker, qty, cost_basis, account, last_price]`.
- **Schedule:** `wealth-tracker--monday-8am`, cron `0 8 * * 1`, runs the new blueprint.
- **Permissions:** `read-only` (app never writes outside its own tables).

### Phase 3 — Artifacts to emit

`.Codex/skills/wealth-tracker--portfolio-coach/profile.yaml`:

```yaml
id: wealth-tracker--portfolio-coach
name: Portfolio Coach
version: "0.1.0"
domain: home
tags: [wealth, portfolio, weekly-review]
supportedRuntimes: [Codex, openai-codex-app-server, anthropic-direct, openai-direct]
preferredRuntime: anthropic-direct
allowedTools: [Read, Grep, WebSearch, WebFetch]
canUseToolPolicy:
  autoApprove: [Read, Grep, WebSearch]
  autoDeny: [Bash, Write]
maxTurns: 10
author: user
tests:
  - task: "Given this positions table, what moved most last week?"
    expectedKeywords: [percent, ticker, commentary]
```

`.Codex/skills/wealth-tracker--portfolio-coach/SKILL.md`:

```markdown
---
name: wealth-tracker--portfolio-coach
description: Weekly portfolio commentary — reads positions from user table, fetches current prices, summarizes movers and watchlist items in plain language.
---

# Portfolio Coach

Produce a concise weekly portfolio review from the positions in the user's
wealth-tracker--positions table. Fetch latest prices, compute week-over-week
changes, and flag the top 3 movers and up to 5 watchlist candidates.

Always explain WHY a position moved in one sentence. Never give specific buy/sell
advice. If the user asks for trade ideas, explicitly decline and suggest consulting
a licensed advisor.
```

`~/.ainative/blueprints/wealth-tracker--weekly-review.yaml`:

```yaml
id: wealth-tracker--weekly-review
name: Weekly Portfolio Review
description: Summarize last week's portfolio performance and surface watchlist items.
version: "0.1.0"
domain: home
tags: [wealth, portfolio, weekly]
pattern: sequence
estimatedDuration: "5-10 min"
difficulty: beginner
author: user

variables:
  - id: review_week_ending
    type: text
    label: Review Week Ending
    description: Date of the Friday to review (YYYY-MM-DD). Defaults to last Friday.
    required: false
    placeholder: "2026-04-11"

steps:
  - name: Pull Positions
    profileId: wealth-tracker--portfolio-coach
    promptTemplate: |
      Read the wealth-tracker--positions table. Summarize the rows and compute
      rough week-over-week delta for each ticker.

      Week ending: {{review_week_ending}}

  - name: Compose Briefing
    profileId: wealth-tracker--portfolio-coach
    promptTemplate: |
      Compose a 1-page briefing with:
      - Top 3 movers (ticker, % change, one-line why)
      - Watchlist (up to 5 candidates to monitor next week)
      - Plain-language summary paragraph
```

`~/.ainative/apps/wealth-tracker/manifest.yaml`:

```yaml
id: wealth-tracker
version: 0.1.0
name: Wealth Tracker
description: Personal portfolio check-ins with weekly summaries.
persona: individual-investor
author: user

profiles:
  - id: wealth-tracker--portfolio-coach
    source: .Codex/skills/wealth-tracker--portfolio-coach/

blueprints:
  - id: wealth-tracker--weekly-review
    source: ~/.ainative/blueprints/wealth-tracker--weekly-review.yaml

tables:
  - id: wealth-tracker--positions
    columns: [ticker, qty, cost_basis, account, last_price]
    seed: ~/.ainative/apps/wealth-tracker/seed/positions.csv

schedules:
  - id: wealth-tracker--monday-8am
    cron: "0 8 * * 1"
    runs: blueprint:wealth-tracker--weekly-review

permissions:
  preset: read-only
```

`~/.ainative/apps/wealth-tracker/seed/positions.csv`:

```csv
ticker,qty,cost_basis,account,last_price
AAPL,50,14500,brokerage,0
MSFT,30,12000,brokerage,0
VTI,100,22000,ira,0
```

`~/.ainative/apps/wealth-tracker/README.md`:

```markdown
# Wealth Tracker

Personal portfolio check-ins for a self-directed investor.

## Install
1. Reload profiles: call `reload_profiles` chat tool.
2. Reload blueprints: call `reload_blueprints` chat tool.
3. Create the positions table: call `create_table` with id `wealth-tracker--positions` + columns from manifest.
4. Seed: call `import_table_data` with `seed/positions.csv`.
5. Create the Monday schedule: call `create_schedule` with the cron + blueprint from manifest.

## Use
- Manual: instantiate `wealth-tracker--weekly-review` from `/workflows/blueprints`.
- Automatic: Monday 8am via the scheduled trigger.

## Artifacts
- Profile: `.Codex/skills/wealth-tracker--portfolio-coach/`
- Blueprint: `~/.ainative/blueprints/wealth-tracker--weekly-review.yaml`
- Table: `wealth-tracker--positions`
- Schedule: `wealth-tracker--monday-8am`
```

### Phase 4 — Wire + Verify checklist

```
[ ] reload_profiles called; list_profiles includes wealth-tracker--portfolio-coach
[ ] reload_blueprints called; list_blueprints includes wealth-tracker--weekly-review
[ ] create_table executed for wealth-tracker--positions
[ ] import_table_data executed from seed/positions.csv (3 rows)
[ ] create_schedule executed for wealth-tracker--monday-8am
[ ] /tables UI shows the seeded positions
[ ] /schedules UI shows the new cron entry
[ ] /workflows/blueprints UI lists the new blueprint
```

## Gap Awareness (v0 limitations)

These limits reflect what the PLATFORM supports today. None require this skill to change — they shape what artifacts emit.

1. **Schedules have no YAML registry.** This skill uses the `create_schedule` chat tool in Phase 4 instead of writing a `~/.ainative/schedules/<id>.yaml`. Re-evaluate this only when the shipped schedule registry contract changes; the historical 2026-04-14 dogfood output is intentionally not retained.

2. **Permission rules are not declarative.** `src/lib/settings/permission-presets.ts:19-66` hardcodes 3 presets. This skill picks from those three or leaves `permissions.preset: custom` as a signal for the user to configure via `/settings` after install.

3. **Conversation templates have no loader.** Reaching for a "seeded conversation with system prompt X and first turn Y" means emitting a blueprint entry with a single step whose `promptTemplate` carries the seed, rather than a dedicated conversation-template YAML.

4. **`.sap` portable format is not yet readable.** The emitted `manifest.yaml` is **documentation only today**. Runtime registration flows through each primitive's own loader (profile registry, blueprint registry, chat tools for tables/schedules). When `sapToBundle()` ships per `features/app-package-format.md`, the same manifest will round-trip.

## Style Notes

- Keep all generated YAML ≤120 lines per file. Split into multiple blueprints if a step list grows beyond 8.
- Always include `version: 0.1.0` on a first scaffold — don't skip versioning.
- Always include at least one `tests:` entry on a new profile — this is how `profile-tests` verifies behavior later.
- Use `domain:` values from the existing builtins: `work`, `home`, `learn`, `health`, `finance` — don't invent new domains.
- Skill frontmatter `description` MUST include concrete trigger phrases; the system uses this string to decide when to activate the skill.

## View-Editing (override auto-inferred layout)

Auto-inference picks a layout kit from manifest shape. When a user wants explicit control, three chat tools mutate `manifest.view` atomically:

- **`set_app_view_kit(appId, kit)`** — lock the kit (`auto`/`tracker`/`coach`/`inbox`/`research`/`ledger`/`workflow-hub`).
- **`set_app_view_bindings(appId, bindings)`** — set hero/secondary/cadence/runs bindings to manifest primitive ids. Replaces (not merges) the bindings object.
- **`set_app_view_kpis(appId, kpis)`** — declare 1-6 KPI tiles with discriminated source kinds (`tableCount`, `tableSum`, `tableLatest`, `blueprintRunCount`, `scheduleNextFire`, `tableSumWindowed`).

Trigger phrases the planner detects:
- *"switch my habit-tracker to workflow-hub layout"* → `set_app_view_kit("habit-tracker", "workflow-hub")`
- *"add a savings-rate KPI to my finance-tracker"* → `set_app_view_kpis(...)`
- *"use this table as hero on my coach-app"* → `set_app_view_bindings(...)`
- *"render as ledger"* → `set_app_view_kit(<active-app>, "ledger")`

All three tools validate against the strict `ViewSchema` (rejecting hallucinated kit ids, unknown KPI source kinds, or wrong binding shapes) and write atomically (temp-file + rename) so a mid-write failure cannot corrupt the manifest. After a successful write, `ainative-apps-changed` fires and the dispatcher picks up the new layout immediately.

The view-editing path is for power users; default-path apps work fine on auto-inference and never need these calls.

## References

- `src/lib/agents/profiles/registry.ts` — profile loader. Reuse `loadProfiles()` and `getProfile(id)`; never write a parallel loader.
- `src/lib/workflows/blueprints/registry.ts` — blueprint loader. Reuse `getBlueprint(id)` and `listBlueprints()`.
- `src/lib/utils/ainative-paths.ts:16` — `getStagentBlueprintsDir()` returns the user's `~/.ainative/blueprints/`.
- `features/app-package-format.md` — deferred spec for the portable `.sap` format this skill is forward-compatible with.
- `features/app-runtime-bundle-foundation.md` — already-shipped `AppBundle` runtime.
- `src/lib/apps/builtins.ts` — code-defined builtin apps (do not modify).
- `features/workflow-blueprints.md` + `features/agent-profile-catalog.md` — shipped YAML registries this skill composes.
