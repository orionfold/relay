---
title: Promote Conversation to App
status: completed
priority: P1
milestone: post-mvp
source: brainstorm session 2026-04-11
dependencies: [chat-app-builder, app-seed-data-generation]
---

# Promote Conversation to App

## Description

After a multi-turn workflow chat session, the agent detects recurring patterns
and proactively offers: "Want me to package this as a reusable app?" This
feature bridges the gap between ad-hoc chat workflows and durable,
shareable applications — users don't need to think about app creation
upfront; the system recognizes when a conversation has produced enough
structure to be worth packaging.

The detection logic analyzes recent chat history for:

- **Tables referenced** in tool calls (create, query, insert operations)
- **Schedules created or implied** ("do this every Monday", "check daily")
- **Profiles used** (which agent profile handled the conversation)
- **Document pools touched** (uploads, references, context retrieval)

When the agent detects sufficient structure (at least 2 tables + 1 schedule
or 3+ distinct table operations), it offers to export the conversation's
artifacts as a reusable AppBundle.

A critical component is the **PII stripping pipeline**: real production data
from the user's tables cannot be shipped as seed data. Instead, the LLM
analyzes each column's semantics (name, email, dollar amount, date, etc.)
and generates synthetic rows that preserve:

- Column types and constraints
- Statistical distributions (means, ranges, cardinality)
- Referential integrity across foreign keys
- Realistic domain-specific values

The user reviews an export preview showing exactly what would be bundled —
tables, schedules, profiles, pages — and what the synthetic seed data looks
like, before confirming the export.

## User Story

As a user who's been doing weekly sales reviews in chat, I want ainative to
notice this pattern and offer to package it as a reusable app I can share,
so that my team can benefit from the same workflow without recreating it
from scratch.

## Technical Approach

### 1. Conversation analysis engine

The agent reviews recent chat history to extract recurring task patterns.
This is not a separate service but rather a prompt-driven analysis where
the agent is instructed to:

1. Scan the last N messages for tool calls that reference tables, schedules,
   profiles, and documents.
2. Identify recurring patterns: same tables queried repeatedly, similar
   prompts at regular intervals, consistent profile usage.
3. Propose a structured export plan:
   - Which tables to include (with column schemas)
   - Which schedules to create (with cron expressions derived from observed
     timing patterns)
   - Which profiles to bundle
   - Which pages to generate (based on the data model)

The analysis triggers automatically when the conversation exceeds a
threshold (e.g., 20+ messages with 5+ tool calls referencing the same
project), or can be triggered manually by the user saying "package this as
an app."

### 2. Export chat tool

Add `exportAppBundle` to `src/lib/chat/tools/app-tools.ts`:

```ts
export const exportAppBundleTool = defineTool({
  name: "exportAppBundle",
  description: "Export a project's artifacts as a reusable AppBundle with synthetic seed data",
  parameters: z.object({
    projectId: z.string(),
    options: z.object({
      includeTables: z.array(z.string()).optional(),
      includeSchedules: z.array(z.string()).optional(),
      includeProfiles: z.array(z.string()).optional(),
      includeDocuments: z.array(z.string()).optional(),
      seedDataRows: z.number().default(25),
      appName: z.string(),
      appDescription: z.string(),
    }),
  }),
  requiresApproval: true,
  handler: async ({ projectId, options }) => {
    const fingerprint = await introspectProject(projectId);
    const bundle = await exportProjectToBundle(fingerprint, options);
    const sanitizedBundle = await stripPII(bundle, options.seedDataRows);
    await saveSapDirectory(sanitizedBundle.manifest.id, sanitizedBundle);
    return {
      appId: sanitizedBundle.manifest.id,
      tables: sanitizedBundle.tables.length,
      schedules: sanitizedBundle.schedules.length,
      seedRows: options.seedDataRows,
      savedTo: `~/.ainative/apps/${sanitizedBundle.manifest.id}/`,
    };
  },
});
```

### 3. Project-to-bundle exporter

Create `src/lib/apps/exporter.ts` with the core conversion logic:

```ts
export async function exportProjectToBundle(
  fingerprint: ProjectFingerprint,
  options: ExportOptions,
): Promise<AppBundle> {
  // 1. Filter tables/schedules/profiles based on options.include* arrays
  // 2. Read full table schemas from DB metadata
  // 3. Read schedule definitions (prompt, interval, cron)
  // 4. Read profile SKILL.md content
  // 5. Generate page definitions based on table structure
  // 6. Assemble manifest with metadata (name, description, version, author)
  // 7. Return complete AppBundle
}
```

The exporter uses `introspectProject()` from the chat-app-builder feature
as its data source, then enriches the fingerprint with full schema details,
actual schedule prompts, and profile content.

### 4. PII stripping pipeline

Create `src/lib/apps/pii-stripper.ts`:

```ts
interface ColumnSemantics {
  columnName: string;
  inferredType: "name" | "email" | "phone" | "currency" | "date" | "id" |
    "address" | "url" | "text" | "number" | "enum" | "boolean";
  strategy: "faker" | "randomize" | "shift" | "redact" | "keep" | "derive";
  distribution?: { min: number; max: number; mean: number };
  enumValues?: string[];
}

export async function stripPII(
  bundle: AppBundle,
  rowCount: number,
): Promise<AppBundle> {
  // For each table in the bundle:
  // 1. Read actual rows from the source project's table
  // 2. Send column names + sample values to LLM for semantic analysis
  // 3. LLM returns ColumnSemantics[] with inferred types and strategies
  // 4. Generate synthetic rows using the strategies:
  //    - faker: use domain-appropriate fake data (faker.js patterns)
  //    - randomize: shuffle values within column
  //    - shift: add random offset to numeric/date values
  //    - redact: replace with "[REDACTED]"
  //    - keep: preserve as-is (safe columns like status enums)
  //    - derive: compute from other synthetic columns (e.g., total = qty * price)
  // 5. Validate referential integrity across tables
  // 6. Replace real rows with synthetic rows in the bundle
}
```

The LLM call is a single structured-output request per table, asking:
"Given these column names and 3 sample rows, classify each column's
semantic type and recommend a sanitization strategy."

### 5. Export preview

Before the agent calls `exportAppBundle`, it presents a structured preview:

```
📦 App Export Preview: "Weekly Sales Review"

Tables (3):
  • deals (7 columns, 45 rows → 25 synthetic rows)
  • contacts (5 columns, 120 rows → 25 synthetic rows)
  • pipeline_stages (3 columns, 6 rows → kept as-is, enum table)

Schedules (2):
  • weekly-review: "Every Monday 9am" — Review pipeline health
  • daily-digest: "Every weekday 6pm" — Summarize day's activity

Profiles (1):
  • sales-analyst — Custom SKILL.md with sales domain expertise

Seed Data Preview (deals):
  | company      | amount   | stage     | close_date |
  | Acme Corp    | $45,000  | proposal  | 2026-05-15 |
  | TechStart    | $12,500  | discovery | 2026-06-01 |
  | GlobalFin    | $89,000  | closing   | 2026-04-30 |

Confirm export? (yes/no)
```

The user can modify inclusions or request changes to synthetic data before
confirming.

## Acceptance Criteria

- [ ] Agent detects recurring patterns in conversation and proactively
      offers to package as an app (threshold: 20+ messages, 5+ tool calls
      referencing same project).
- [ ] `exportAppBundle` chat tool creates a valid AppBundle from an existing
      project's artifacts.
- [ ] PII stripping pipeline generates synthetic seed data that preserves
      column types, distributions, and referential integrity.
- [ ] LLM-based column semantic analysis correctly classifies common PII
      types (names, emails, phones, addresses) and assigns appropriate
      sanitization strategies.
- [ ] Export preview is presented before execution, showing tables,
      schedules, profiles, and sample synthetic data.
- [ ] User can modify export options before confirming.
- [ ] Exported bundle is saved as `.sap` directory under
      `~/.ainative/apps/{app-id}/`.
- [ ] Exported bundle can be installed on a fresh project via
      `installApp()` and produces a working app.
- [ ] `npm test` passes; `npx tsc --noEmit` clean.

## Scope Boundaries

**Included:**
- Conversation pattern detection and proactive offer
- `exportAppBundle` chat tool with permission gate
- Project-to-bundle exporter (`src/lib/apps/exporter.ts`)
- LLM-based PII stripping pipeline (`src/lib/apps/pii-stripper.ts`)
- Export preview with synthetic data samples
- SAP directory persistence for exported bundles

**Excluded:**
- Marketplace publishing of exported apps (separate: `marketplace-app-publishing`)
- CLI export command (separate: `app-cli-tools`)
- Visual editing of exported bundles (separate: `visual-app-studio`)
- App remixing from exported bundles (separate: `app-remix`)
- Multi-project aggregation (export from multiple projects into one app)

## References

- Source: brainstorm session 2026-04-11 (EXPAND scope)
- Plan: `internal implementation plan` §4b
- Related features: `chat-app-builder` (provides `introspectProject`),
  `app-seed-data-generation` (provides sanitization strategy library),
  `marketplace-app-publishing` (downstream consumer)
- Files to create:
  - `src/lib/apps/exporter.ts` — project → AppBundle conversion
  - `src/lib/apps/pii-stripper.ts` — LLM-based synthetic data generation
- Files to modify:
  - `src/lib/chat/tools/app-tools.ts` — add `exportAppBundle` tool
  - `src/lib/chat/ainative-tools.ts` — register new tool
  - `src/lib/chat/tool-catalog.ts` — add to "Apps" group
