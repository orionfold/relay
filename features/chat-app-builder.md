---
title: Chat App Builder
status: completed
priority: P1
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [app-package-format, app-extended-primitives-tier1]
---

# Chat App Builder

## Description

The `/build-app` slash command enables non-technical users to create fully
functional ainative apps through guided multi-turn chat conversation. The agent
walks the user through a structured discovery flow — purpose, target users,
data model, automation needs, agent profile, and UI pages — then synthesizes
an `AppBundle`, presents it for review, and installs it on acceptance.

Two new chat tools power this feature:

1. **`introspectProject(projectId)`** — reads tables, schedules, profiles,
   and documents in an existing project and returns a structured fingerprint
   (table names + column schemas, active schedules, assigned profiles,
   document pools). This lets the agent understand what the user already has
   before proposing new primitives.

2. **`createAppBundle(manifest, tables, schedules, profiles, pages)`** —
   validates all inputs against the AppBundle schema, synthesizes the bundle,
   calls `service.ts installApp()` + `bootstrapApp()`, and saves the resulting
   `.sap` directory to `~/.ainative/apps/{app-id}/` for later export or
   sharing.

`createAppBundle` is permission-gated: it requires explicit user approval
before executing, following the same approval pattern used for task execution.
This ensures the user always reviews what will be created before any tables,
schedules, or profiles are provisioned.

The guided conversation follows a 6-step flow:

1. **Purpose** — "What problem does this app solve?" Agent extracts domain,
   key entities, and success metrics.
2. **Users** — "Who will use it?" Agent infers persona, frequency of use,
   and skill level to calibrate complexity.
3. **Data model** — Agent proposes tables with columns based on the domain.
   User can accept, modify, or add tables. Agent uses `introspectProject` if
   an existing project is selected as the base.
4. **Automation** — Agent proposes schedules (daily review, weekly report,
   etc.) with cron expressions and prompt templates.
5. **Agent profile** — Agent recommends a profile from the registry or
   proposes a custom SKILL.md based on the domain.
6. **UI pages** — Agent proposes pages with widget compositions (hero stats,
   data tables, action buttons, linked assets).

After step 6, the agent presents the complete AppBundle as a structured
summary and asks for confirmation before calling `createAppBundle`.

## User Story

As a non-technical user, I want to describe what I need in chat and have
ainative build me a working app in 5 minutes, so that I can go from idea to
functional tool without writing code or understanding YAML schemas.

## Technical Approach

### 1. Project introspection service

Create `src/lib/apps/introspector.ts` with a single exported function:

```ts
interface ProjectFingerprint {
  projectId: string;
  projectName: string;
  tables: Array<{ name: string; columns: ColumnSchema[]; rowCount: number }>;
  schedules: Array<{ id: string; prompt: string; interval: string; enabled: boolean }>;
  profiles: Array<{ id: string; name: string; description: string }>;
  documents: Array<{ id: string; filename: string; mimeType: string }>;
}

export async function introspectProject(projectId: string): Promise<ProjectFingerprint>;
```

The function queries the `tasks`, `schedules`, `documents`, and
`agent_profiles` tables filtered by `projectId`, plus reads table definitions
from the app's manifest if it's an installed app, or from dynamic table
metadata if it's a user-created project.

### 2. Chat tool definitions

Create `src/lib/chat/tools/app-tools.ts` as a new module exporting two tool
definitions following the existing `defineTool()` pattern:

```ts
// introspectProject tool
export const introspectProjectTool = defineTool({
  name: "introspectProject",
  description: "Examine an existing project's tables, schedules, profiles, and documents",
  parameters: z.object({
    projectId: z.string().describe("The project ID to introspect"),
  }),
  handler: async ({ projectId }) => {
    return introspectProject(projectId);
  },
});

// createAppBundle tool (permission-gated)
export const createAppBundleTool = defineTool({
  name: "createAppBundle",
  description: "Create and install a new app from a bundle specification",
  parameters: z.object({
    manifest: appManifestSchema,
    tables: z.array(tableDefinitionSchema),
    schedules: z.array(scheduleTemplateSchema),
    profiles: z.array(profileTemplateSchema),
    pages: z.array(pageDefinitionSchema),
  }),
  requiresApproval: true,
  handler: async ({ manifest, tables, schedules, profiles, pages }) => {
    const bundle = synthesizeBundle(manifest, tables, schedules, profiles, pages);
    const validated = appBundleSchema.parse(bundle);
    const instance = await installApp(validated);
    await bootstrapApp(instance.appId);
    await saveSapDirectory(instance.appId, validated);
    return { appId: instance.appId, status: "installed" };
  },
});
```

### 3. Tool registration

Register both tools in the chat tool system:

- **`src/lib/chat/ainative-tools.ts`** — import `app-tools.ts` and add both
  tools to `collectAllTools()`.
- **`src/lib/chat/tool-catalog.ts`** — add entries to `TOOL_CATALOG` under a
  new `"Apps"` group with appropriate descriptions and permission levels.

### 4. Bundle synthesis

The `createAppBundle` handler calls a `synthesizeBundle()` function that:

1. Generates a unique `app-id` from the manifest name (slugified + random
   suffix).
2. Namespaces all table names, schedule IDs, and profile IDs with the
   `{app-id}--` prefix per the namespace isolation convention.
3. Assigns default widget compositions to pages if the agent didn't specify
   layout details.
4. Sets `minVersion` to the current platform version.
5. Returns a complete `AppBundle` ready for validation.

### 5. SAP directory persistence

After successful install, write the bundle as a `.sap` directory under
`~/.ainative/apps/{app-id}/`:

```
~/.ainative/apps/{app-id}/
  manifest.yaml
  tables/
    {table-name}.yaml
  schedules/
    {schedule-id}.yaml
  profiles/
    {profile-id}/
      SKILL.md
  pages/
    {page-id}.yaml
```

This enables later export, sharing, or publishing to the marketplace.

### 6. Guided conversation system prompt

The `/build-app` command injects a system prompt segment that instructs the
agent to follow the 6-step discovery flow. The prompt includes:

- Step transitions ("After the user confirms the data model, move to
  automation")
- Domain-aware defaults ("For a finance app, suggest positions, transactions,
  and watchlist tables")
- Validation rules ("Each table must have at least an id and name column")
- The instruction to call `introspectProject` when the user references an
  existing project
- The instruction to present a structured summary before calling
  `createAppBundle`

## Acceptance Criteria

- [ ] `/build-app` in chat initiates a guided 6-step conversation flow.
- [ ] `introspectProject` tool returns accurate fingerprint for existing
      projects including tables, schedules, profiles, and documents.
- [ ] `createAppBundle` tool validates inputs, creates the app, and installs
      it — project appears in sidebar, tables are queryable, schedules are
      registered.
- [ ] `createAppBundle` requires explicit user approval before execution.
- [ ] Installed app is persisted as `.sap` directory under
      `~/.ainative/apps/{app-id}/`.
- [ ] Both tools appear in `TOOL_CATALOG` under the "Apps" group.
- [ ] Agent follows guided flow and presents structured summary before
      install.
- [ ] `npm test` passes; `npx tsc --noEmit` clean.

## Scope Boundaries

**Included:**
- `introspectProject` and `createAppBundle` chat tools
- Project introspection service (`src/lib/apps/introspector.ts`)
- Chat tool registration in `ainative-tools.ts` and `tool-catalog.ts`
- Guided conversation system prompt for `/build-app`
- SAP directory persistence for created apps
- Permission gate on `createAppBundle`

**Excluded:**
- Marketplace publishing (separate feature: `marketplace-app-publishing`)
- PII stripping / seed data generation (separate: `app-seed-data-generation`)
- Promoting existing conversations to apps (separate: `promote-conversation-to-app`)
- Visual studio editor (separate: `visual-app-studio`)
- App remixing / forking (separate: `app-remix`)
- CLI `ainative app` subcommands (separate: `app-cli-tools`)

## References

- Source: brainstorm session 2026-04-11 (EXPAND scope)
- Plan: `internal implementation plan` §4a
- Related features: `app-package-format`, `app-extended-primitives-tier1`,
  `promote-conversation-to-app`, `app-remix`, `conversational-app-editing`
- Files to create:
  - `src/lib/apps/introspector.ts` — project fingerprint extraction
  - `src/lib/chat/tools/app-tools.ts` — chat tool definitions
- Files to modify:
  - `src/lib/chat/ainative-tools.ts` — register new tools in `collectAllTools()`
  - `src/lib/chat/tool-catalog.ts` — add "Apps" group to `TOOL_CATALOG`
  - `src/lib/apps/service.ts` — add `saveSapDirectory()` helper
