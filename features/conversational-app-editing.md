---
title: Conversational App Editing
status: deferred
priority: P2
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [chat-app-builder]
---

# Conversational App Editing

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

Natural-language edits to installed apps: "add conviction score column to
positions", "move daily review to 7am", "add a watchlist page with table
widget." The agent interprets the user's intent, maps it to structured
change operations, and applies them to the live AppInstance — modifying
the `app_instances` row's manifest/UI JSON, applying table schema changes,
and updating schedules.

This feature closes the loop on chat-native app management: users can
create apps via chat (`chat-app-builder`), remix them (`app-remix`), and
now iteratively refine them without leaving the conversation. Every change
is tracked with version numbers, making it possible to see what was
modified since the app was originally installed.

The agent supports a comprehensive set of change types that cover the
full surface area of an installed app:

- **Schema changes**: `addColumn`, `removeColumn`, `renameColumn`,
  `modifyColumnType`
- **Schedule changes**: `modifySchedule` (cron, prompt, enabled status),
  `addSchedule`, `removeSchedule`
- **Page changes**: `addPage`, `removePage`, `renamePage`
- **Widget changes**: `addWidget`, `removeWidget`, `modifyWidget`
  (props, position, data source)
- **Trigger changes**: `addTrigger`, `removeTrigger`, `modifyTrigger`

Each change is validated before application and the user sees a preview of
what will change before confirming.

## User Story

As a user with an installed app, I want to say "add a conviction score
column to the positions table" in chat and have it just work, so that I
can evolve my app incrementally without reinstalling or editing YAML files.

## Technical Approach

### 1. Modify chat tool

Add `modifyInstalledApp` to `src/lib/chat/tools/app-tools.ts`:

```ts
export const modifyInstalledAppTool = defineTool({
  name: "modifyInstalledApp",
  description: "Apply structured changes to an installed app's tables, schedules, pages, or widgets",
  parameters: z.object({
    appId: z.string().describe("The installed app ID to modify"),
    changes: z.array(z.discriminatedUnion("type", [
      z.object({
        type: z.literal("addColumn"),
        table: z.string(),
        column: z.object({
          name: z.string(),
          type: z.string(),
          defaultValue: z.any().optional(),
          description: z.string().optional(),
        }),
      }),
      z.object({
        type: z.literal("removeColumn"),
        table: z.string(),
        column: z.string(),
      }),
      z.object({
        type: z.literal("renameColumn"),
        table: z.string(),
        oldName: z.string(),
        newName: z.string(),
      }),
      z.object({
        type: z.literal("modifySchedule"),
        scheduleId: z.string(),
        updates: z.object({
          cron: z.string().optional(),
          prompt: z.string().optional(),
          enabled: z.boolean().optional(),
        }),
      }),
      z.object({
        type: z.literal("addSchedule"),
        schedule: z.object({
          name: z.string(),
          cron: z.string(),
          prompt: z.string(),
        }),
      }),
      z.object({
        type: z.literal("removeSchedule"),
        scheduleId: z.string(),
      }),
      z.object({
        type: z.literal("addPage"),
        page: z.object({
          name: z.string(),
          path: z.string(),
          widgets: z.array(z.any()).optional(),
        }),
      }),
      z.object({
        type: z.literal("removePage"),
        pageId: z.string(),
      }),
      z.object({
        type: z.literal("addWidget"),
        pageId: z.string(),
        widget: z.object({
          type: z.string(),
          props: z.record(z.any()),
          position: z.object({
            row: z.number(),
            col: z.number(),
            colSpan: z.number().optional(),
          }).optional(),
        }),
      }),
      z.object({
        type: z.literal("removeWidget"),
        pageId: z.string(),
        widgetId: z.string(),
      }),
      z.object({
        type: z.literal("modifyWidget"),
        pageId: z.string(),
        widgetId: z.string(),
        updates: z.record(z.any()),
      }),
      z.object({
        type: z.literal("addTrigger"),
        trigger: z.object({
          table: z.string(),
          event: z.enum(["insert", "update", "delete"]),
          action: z.string(),
        }),
      }),
      z.object({
        type: z.literal("removeTrigger"),
        triggerId: z.string(),
      }),
    ])),
    reason: z.string().describe("Human-readable summary of why these changes are being made"),
  }),
  requiresApproval: true,
  handler: async ({ appId, changes, reason }) => {
    const result = await applyAppChanges(appId, changes, reason);
    return {
      appId,
      changesApplied: result.applied.length,
      changesFailed: result.failed.length,
      newVersion: result.modifiedVersion,
      failures: result.failed,
    };
  },
});
```

### 2. App modifier service

Create `src/lib/apps/modifier.ts` with the core change application logic:

```ts
interface ChangeResult {
  applied: AppChange[];
  failed: Array<{ change: AppChange; error: string }>;
  modifiedVersion: string;
}

export async function applyAppChanges(
  appId: string,
  changes: AppChange[],
  reason: string,
): Promise<ChangeResult> {
  const instance = await getInstalledApp(appId);
  if (!instance) throw new Error(`App ${appId} not found`);

  const applied: AppChange[] = [];
  const failed: Array<{ change: AppChange; error: string }> = [];

  // Apply each change in order
  for (const change of changes) {
    try {
      await applySingleChange(instance, change);
      applied.push(change);
    } catch (err) {
      failed.push({ change, error: (err as Error).message });
    }
  }

  // Bump modified version
  const newVersion = bumpPatchVersion(instance.modifiedVersion || instance.installedVersion);

  // Persist updated manifest + version to app_instances row
  await updateAppInstance(appId, {
    manifestJson: JSON.stringify(instance.manifest),
    modifiedVersion: newVersion,
    lastModifiedAt: new Date().toISOString(),
    lastModifiedReason: reason,
  });

  // Update .sap directory if it exists
  await updateSapDirectory(appId, instance.manifest);

  return { applied, failed, modifiedVersion: newVersion };
}
```

### 3. Individual change handlers

Each change type has a dedicated handler:

**`addColumn`** — Adds column to the table definition in the manifest JSON
and executes `ALTER TABLE ADD COLUMN` on the actual SQLite table:

```ts
async function handleAddColumn(instance: AppInstance, change: AddColumnChange): Promise<void> {
  const table = instance.manifest.tables.find(t => t.name === change.table);
  if (!table) throw new Error(`Table ${change.table} not found in app`);

  // Add to manifest
  table.columns.push(change.column);

  // Apply to live DB
  const fullTableName = `${instance.appId}--${change.table}`;
  await db.run(sql`ALTER TABLE ${sql.identifier(fullTableName)}
    ADD COLUMN ${sql.identifier(change.column.name)} ${sql.raw(change.column.type)}
    ${change.column.defaultValue !== undefined
      ? sql`DEFAULT ${change.column.defaultValue}`
      : sql``
    }`);
}
```

**`modifySchedule`** — Updates the schedule definition in the manifest and
the live `schedules` table row:

```ts
async function handleModifySchedule(
  instance: AppInstance,
  change: ModifyScheduleChange,
): Promise<void> {
  const schedule = instance.manifest.schedules.find(s => s.id === change.scheduleId);
  if (!schedule) throw new Error(`Schedule ${change.scheduleId} not found`);

  // Update manifest
  if (change.updates.cron) schedule.cron = change.updates.cron;
  if (change.updates.prompt) schedule.prompt = change.updates.prompt;
  if (change.updates.enabled !== undefined) schedule.enabled = change.updates.enabled;

  // Update live schedule in DB
  await db.update(schedules)
    .set({
      interval: change.updates.cron || schedule.cron,
      prompt: change.updates.prompt || schedule.prompt,
      enabled: change.updates.enabled ?? schedule.enabled,
    })
    .where(eq(schedules.id, change.scheduleId));
}
```

**`addPage`** and **`addWidget`** — Modify the manifest's UI section only
(pages and widgets are rendered from manifest JSON, not separate DB tables):

```ts
async function handleAddPage(instance: AppInstance, change: AddPageChange): Promise<void> {
  const pageId = slugify(change.page.name);
  instance.manifest.pages.push({
    id: pageId,
    name: change.page.name,
    path: change.page.path || `/${pageId}`,
    widgets: change.page.widgets || [],
  });
}
```

### 4. Version tracking

Each installed app tracks two versions:

- **`installedVersion`** — the version at install time, never changes
- **`modifiedVersion`** — bumped on each `modifyInstalledApp` call

This enables:

```ts
// Check if app has been modified
const isModified = instance.modifiedVersion !== instance.installedVersion;

// View modification history (stored as JSON array in manifest)
const changes = instance.manifest.changeLog || [];
```

The modification change log is stored as a JSON array in the manifest,
recording each change with timestamp, reason, and the structured change
objects. This enables a full audit trail and diff viewing.

### 5. Change preview

Before applying changes, the agent presents a structured preview:

```
🔧 Proposed changes to "Wealth Manager" (v1.0.0 → v1.0.1):

Schema:
  • positions: +conviction_score (integer, default: 0)
  • positions: +thesis (text)

Schedules:
  • daily-review: cron changed "0 9 * * *" → "0 7 * * *"

Pages:
  • +watchlist (new page with table widget)

Apply these changes? (yes/no)
```

### 6. Optional upstream contribution

After modifying an installed app, the user can ask: "Submit my changes to
the creator." This generates a diff manifest:

```ts
interface DiffManifest {
  sourceAppId: string;
  sourceVersion: string;
  changes: AppChange[];
  reason: string;
  contributor: string;
}
```

The diff manifest can be exported as a `.diff.yaml` file or submitted
through the marketplace (future feature). This is informational in this
feature — the actual submission flow is part of `app-forking-remix`.

## Acceptance Criteria

- [ ] `modifyInstalledApp` chat tool accepts structured changes and applies
      them to live installed apps.
- [ ] `addColumn` changes modify both the manifest JSON and the live SQLite
      table schema.
- [ ] `modifySchedule` changes update both the manifest and the live
      `schedules` table row.
- [ ] `addPage` and `addWidget` changes modify the manifest UI section
      and the new page renders correctly.
- [ ] `removeColumn`, `removeSchedule`, and `removePage` changes clean up
      both manifest and live resources.
- [ ] `modifiedVersion` is bumped on each change; `installedVersion`
      remains unchanged.
- [ ] Change log is persisted in the manifest with timestamps and reasons.
- [ ] Agent presents a structured change preview before applying.
- [ ] `modifyInstalledApp` requires explicit user approval.
- [ ] `.sap` directory is updated after changes (if it exists).
- [ ] `npm test` passes; `npx tsc --noEmit` clean.

## Scope Boundaries

**Included:**
- `modifyInstalledApp` chat tool with all change types
- App modifier service (`src/lib/apps/modifier.ts`)
- Live schema changes via `ALTER TABLE`
- Live schedule updates via `schedules` table
- Manifest UI (pages/widgets) modifications
- Version tracking (installedVersion vs modifiedVersion)
- Change log persistence
- Change preview before application
- Diff manifest generation (informational)

**Excluded:**
- Visual diff viewer UI (separate: `visual-app-studio`)
- Upstream contribution submission flow (separate: `app-forking-remix`)
- Bulk changes across multiple apps
- Rollback / undo of changes (future iteration)
- Migration scripts for complex schema changes (e.g., column type changes
  that require data transformation)

## References

- Source: brainstorm session 2026-04-11 (EXPAND scope)
- Plan: `internal implementation plan` §4d
- Related features: `chat-app-builder` (provides base chat tools),
  `app-remix` (fork-then-edit flow), `visual-app-studio` (visual editor
  alternative), `app-forking-remix` (upstream contribution)
- Files to create:
  - `src/lib/apps/modifier.ts` — change application service
- Files to modify:
  - `src/lib/chat/tools/app-tools.ts` — add `modifyInstalledApp` tool
  - `src/lib/apps/types.ts` — add `modifiedVersion`, `changeLog` fields
  - `src/lib/db/schema.ts` — add `modifiedVersion`, `lastModifiedAt`,
    `lastModifiedReason` columns to `app_instances`
  - `src/lib/chat/ainative-tools.ts` — register new tool
  - `src/lib/chat/tool-catalog.ts` — add to "Apps" group
