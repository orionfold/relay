---
title: App Remix
status: dropped
dropped: "Not pursuing — app distribution/marketplace ambition cut per _IDEAS/reprioritze.md §4 (concentration cutline, 2026-06-29)."
priority: P2
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [chat-app-builder]
---

# App Remix

> **Deferred 2026-04-14.** Part of the marketplace / apps-distribution vision, which has no active plan after the pivot to 100% free Community Edition. Kept in the backlog pending future product direction.

## Description

App Remix enables 30-second app derivation via chat: "Take Wealth Manager
and make it a crypto tracker." The agent deep-copies an installed app's
bundle, applies domain transformations to the schema, regenerates sample
data for the new domain using LLM, and installs the result as a new
independent app with lineage tracking back to its source.

This is a key enabler for the community ecosystem — instead of building
apps from scratch, users start from existing apps that are structurally
similar to what they need and transform them into new domains. A real
estate tracker becomes a vehicle fleet manager. A content calendar becomes
a product launch tracker. The structural primitives (tables, schedules,
profiles, pages) stay the same; the domain-specific details change.

The remix flow is conversational: the agent identifies which parts of the
source app map to the new domain, proposes specific schema transformations,
and generates contextually appropriate sample data. The user reviews and
confirms before the fork is created.

## User Story

As a user who likes an existing app but needs it for a different domain,
I want to remix it via chat without starting from scratch, so that I can
get a working app in 30 seconds by leveraging someone else's structural
design.

## Technical Approach

### 1. Fork chat tool

Add `forkApp` to `src/lib/chat/tools/app-tools.ts`:

```ts
export const forkAppTool = defineTool({
  name: "forkApp",
  description: "Create a new app by forking and transforming an existing installed app",
  parameters: z.object({
    sourceAppId: z.string().describe("The installed app ID to fork from"),
    newManifest: z.object({
      name: z.string().describe("Name for the new app"),
      description: z.string().describe("Description of the new app's purpose"),
      domain: z.string().describe("Target domain (e.g., 'crypto', 'real-estate')"),
    }),
    schemaTransforms: z.array(z.object({
      tableName: z.string(),
      columnMappings: z.array(z.object({
        oldColumn: z.string(),
        newColumn: z.string(),
        newType: z.string().optional(),
      })),
      newColumns: z.array(z.object({
        name: z.string(),
        type: z.string(),
        description: z.string(),
      })).optional(),
      removedColumns: z.array(z.string()).optional(),
    })).optional(),
  }),
  requiresApproval: true,
  handler: async ({ sourceAppId, newManifest, schemaTransforms }) => {
    const forked = await forkApp(sourceAppId, newManifest, schemaTransforms);
    return {
      appId: forked.appId,
      forkedFrom: sourceAppId,
      tables: forked.tables.length,
      schedules: forked.schedules.length,
      status: "installed",
    };
  },
});
```

### 2. Fork service logic

The core fork logic in `src/lib/apps/service.ts` (or a new
`src/lib/apps/forker.ts`):

```ts
export async function forkApp(
  sourceAppId: string,
  newManifest: { name: string; description: string; domain: string },
  schemaTransforms?: SchemaTransform[],
): Promise<AppInstance> {
  // 1. Load source app's installed bundle
  const source = await getInstalledApp(sourceAppId);
  if (!source) throw new Error(`App ${sourceAppId} not found`);

  // 2. Deep-copy the bundle
  const forkedBundle = structuredClone(source.manifest);

  // 3. Assign new identity
  const newAppId = slugify(newManifest.name) + "-" + randomSuffix();
  forkedBundle.id = newAppId;
  forkedBundle.name = newManifest.name;
  forkedBundle.description = newManifest.description;
  forkedBundle.forkedFrom = sourceAppId;
  forkedBundle.version = "1.0.0";

  // 4. Apply schema transformations
  if (schemaTransforms) {
    for (const transform of schemaTransforms) {
      applySchemaTransform(forkedBundle, transform);
    }
  }

  // 5. Re-namespace all primitives with new app-id prefix
  renamespacePrimitives(forkedBundle, sourceAppId, newAppId);

  // 6. Regenerate sample data via LLM
  forkedBundle.seedData = await regenerateSeedData(
    forkedBundle.tables,
    newManifest.domain,
  );

  // 7. Update schedule prompts for new domain
  for (const schedule of forkedBundle.schedules) {
    schedule.prompt = await rewritePromptForDomain(
      schedule.prompt,
      newManifest.domain,
    );
  }

  // 8. Update profile SKILL.md for new domain
  for (const profile of forkedBundle.profiles) {
    profile.skillMd = await rewriteSkillMdForDomain(
      profile.skillMd,
      newManifest.domain,
    );
  }

  // 9. Install the forked bundle
  const instance = await installApp(forkedBundle);
  await bootstrapApp(newAppId);
  await saveSapDirectory(newAppId, forkedBundle);

  return instance;
}
```

### 3. Schema diff and transform

The `applySchemaTransform` function handles column-level transformations:

```ts
function applySchemaTransform(
  bundle: AppBundle,
  transform: SchemaTransform,
): void {
  const table = bundle.tables.find(t => t.name === transform.tableName);
  if (!table) return;

  // Apply column renames
  for (const mapping of transform.columnMappings) {
    const col = table.columns.find(c => c.name === mapping.oldColumn);
    if (col) {
      col.name = mapping.newColumn;
      if (mapping.newType) col.type = mapping.newType;
    }
  }

  // Add new columns
  if (transform.newColumns) {
    table.columns.push(...transform.newColumns);
  }

  // Remove columns
  if (transform.removedColumns) {
    table.columns = table.columns.filter(
      c => !transform.removedColumns!.includes(c.name),
    );
  }
}
```

When the user doesn't provide explicit transforms, the agent uses LLM
reasoning to propose the mapping. For example, when remixing wealth-manager
to crypto-tracker:

| Source (wealth-manager) | Target (crypto-tracker) |
|---|---|
| `positions.ticker` | `positions.token` |
| `positions.costBasis` | `positions.entryPrice` |
| `positions.shares` | `positions.units` |
| `transactions.type` (buy/sell/dividend) | `transactions.type` (buy/sell/swap/stake) |
| `watchlist.targetPrice` | `watchlist.alertPrice` |

The agent presents these proposed mappings in chat and the user confirms
or adjusts before the fork proceeds.

### 4. LLM-powered sample data regeneration

Given the new schema and domain context, the LLM generates realistic
synthetic rows:

```ts
async function regenerateSeedData(
  tables: TableDefinition[],
  domain: string,
): Promise<SeedData> {
  // For each table, call LLM with:
  //   "Generate {rowCount} realistic sample rows for a {domain} app
  //    with this schema: {columns}. Ensure referential integrity
  //    across foreign keys."
  // Returns structured JSON matching the table schema.
}
```

For a crypto tracker, this produces rows like:
- positions: BTC at $67,450, ETH at $3,200, SOL at $145
- transactions: bought 0.5 BTC on 2026-03-15 at $65,000
- watchlist: AVAX alert at $40, DOT alert at $8

### 5. Lineage tracking

The `AppInstanceRecord` (stored in `app_instances` table) gets a
`forkedFrom` field:

```ts
// In src/lib/apps/types.ts
interface AppManifest {
  // ... existing fields
  forkedFrom?: string;  // source app ID, if this is a fork
}
```

This enables:
- Displaying lineage in the marketplace ("Forked from Wealth Manager")
- Future upstream contribution flow (user can generate a diff manifest
  showing what changed and submit it to the original creator)
- Fork count displayed on marketplace cards

### 6. Conversational remix flow

The agent guides the remix through a structured conversation:

1. **Source selection** — "Which app do you want to remix?" Agent lists
   installed apps.
2. **Domain mapping** — "What domain is the new app for?" Agent analyzes
   the source schema and proposes column mappings.
3. **Schema review** — Agent presents the proposed transformations. User
   can accept, modify, or add changes.
4. **Data preview** — Agent generates 3 sample rows per table and shows
   them for validation.
5. **Confirm and fork** — Agent calls `forkApp` with the approved
   transforms.

## Acceptance Criteria

- [ ] `forkApp` chat tool creates a new independent app by deep-copying
      and transforming an existing installed app.
- [ ] Schema transformations correctly rename, add, and remove columns
      across all tables in the forked bundle.
- [ ] All primitives (tables, schedules, profiles, pages) are re-namespaced
      with the new app ID prefix.
- [ ] LLM-generated sample data is domain-appropriate and maintains
      referential integrity across foreign keys.
- [ ] Schedule prompts and profile SKILL.md content are rewritten for the
      new domain.
- [ ] `forkedFrom` lineage field is set on the new app's manifest and
      persisted in `app_instances`.
- [ ] Forked app installs successfully — project in sidebar, tables
      queryable, schedules registered.
- [ ] User reviews proposed schema transformations and sample data before
      fork is executed.
- [ ] `forkApp` requires explicit user approval before execution.
- [ ] `npm test` passes; `npx tsc --noEmit` clean.

## Scope Boundaries

**Included:**
- `forkApp` chat tool with permission gate
- Deep-copy bundle logic with schema transformation
- Column mapping (rename, add, remove)
- Re-namespacing of all primitives
- LLM-powered sample data regeneration for new domain
- Schedule prompt and profile SKILL.md domain rewriting
- `forkedFrom` lineage field on AppManifest
- Conversational guided remix flow

**Excluded:**
- Marketplace fork/remix UI button (separate: `app-forking-remix`)
- Upstream contribution flow / diff manifest submission (future iteration)
- Visual schema diff viewer (separate: `visual-app-studio`)
- Partial forks (fork only some tables/schedules — full bundle only)
- Cross-app merging (combining two apps into one)

## References

- Source: brainstorm session 2026-04-11 (EXPAND scope)
- Plan: `.claude/plans/flickering-petting-hammock.md` §4c
- Related features: `chat-app-builder` (provides base chat tools),
  `app-forking-remix` (marketplace UI for forking),
  `conversational-app-editing` (post-fork modifications)
- Files to create:
  - `src/lib/apps/forker.ts` — fork logic (deep-copy, transform, regenerate)
- Files to modify:
  - `src/lib/chat/tools/app-tools.ts` — add `forkApp` tool
  - `src/lib/apps/types.ts` — add `forkedFrom` to `AppManifest`
  - `src/lib/chat/ainative-tools.ts` — register new tool
  - `src/lib/chat/tool-catalog.ts` — add to "Apps" group
