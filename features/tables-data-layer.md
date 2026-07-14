---
title: Tables Data Layer
status: completed
priority: P0
milestone: post-mvp
source: ideas/tables-brainstorm
dependencies: []
---

# Tables Data Layer

## Description

Foundation schema and CRUD operations for user-defined structured tables. Introduces 12 new database tables using the hybrid JSON rows pattern — fixed Drizzle schema for metadata, JSON TEXT columns for flexible row data. This is the bedrock that all other Tables features build on.

The design stores column definitions as a JSON schema array in the `user_tables` table, and each row as a JSON object in `user_table_rows.data`. SQLite's `json_extract()` enables filtering and sorting on any column without dynamic DDL. This fits ainative's existing bootstrap pattern (idempotent CREATE TABLE IF NOT EXISTS) and Drizzle ORM query model.

## User Story

As a developer building Tables features, I need a robust data layer with typed schemas, CRUD operations, query building, and API routes so that all upstream features (UI, import, agent tools) have a stable foundation.

## Technical Approach

### Schema (12 new tables in `src/lib/db/schema.ts`)

**Core tables:**
- `user_tables` — table metadata (name, project_id FK, column_schema JSON, settings JSON, template_id FK, source_document_id FK, source, row_count, status, created_by)
- `user_table_columns` — denormalized column definitions (table_id FK, name, display_name, data_type, position, config JSON, required)
- `user_table_rows` — row data (table_id FK, data JSON, sort_key, position, created_by, modified_by)

**Supporting tables:**
- `user_table_views` — saved filter/sort/group configs per table
- `user_table_relationships` — cross-table FK definitions (from_table_id, to_table_id, relationship_type)
- `user_table_templates` — template library (column_schema JSON, sample_data JSON, category, scope)
- `user_table_imports` — import audit trail (document_id FK, column_mapping JSON, rows_imported, errors JSON, status)

**Junction tables (agent integration):**
- `table_document_inputs` — links documents to tables
- `task_table_inputs` — links tables to tasks
- `workflow_table_inputs` — links tables to workflow steps
- `schedule_table_inputs` — links tables to schedules

All tables use TEXT UUIDs as PKs, INTEGER timestamps, and TEXT for JSON columns — consistent with ainative's existing 29 tables.

### Column Schema Format

```typescript
interface ColumnDef {
  name: string;           // snake_case machine name
  displayName: string;    // human label
  dataType: "text" | "number" | "boolean" | "date" | "select" | "url" | "email" | "relation" | "computed";
  position: number;
  required: boolean;
  defaultValue?: unknown;
  config: {
    // select: options[], allowMultiple?
    // number: format?, precision?, min?, max?
    // date: includeTime?, format?
    // relation: targetTableId, targetDisplayColumn, relationshipType
    // computed: formula, formulaType, resultType, dependencies[]
  };
}
```

### New files

- `src/lib/db/schema.ts` — 12 new table definitions with Drizzle ORM + type exports
- `src/lib/db/bootstrap.ts` — CREATE TABLE DDL + STAGENT_TABLES additions
- `src/lib/data/clear.ts` — FK-safe deletion (children before parents)
- `src/lib/data/tables.ts` — CRUD: createTable, getTable, listTables, updateTable, deleteTable, addRows, updateRow, deleteRows, queryRows
- `src/lib/tables/types.ts` — ColumnDef, RowData, TableTemplate, StructuredQuery interfaces
- `src/lib/tables/query-builder.ts` — translate filter/sort to `json_extract()` SQL
- `src/app/api/tables/route.ts` — GET (list with project filter), POST (create)
- `src/app/api/tables/[id]/route.ts` — GET, PATCH, DELETE
- `src/app/api/tables/[id]/rows/route.ts` — GET (paginated query), POST (batch add)
- `src/app/api/tables/[id]/rows/[rowId]/route.ts` — PATCH, DELETE
- `src/app/api/tables/[id]/columns/route.ts` — PATCH (update column schema)
- `src/app/api/tables/templates/route.ts` — GET (list templates)
- `src/lib/data/seed-data/table-templates.ts` — 12 built-in templates

### Query Builder

The query builder translates structured filter objects to SQLite JSON queries:

```sql
SELECT id, data, created_at FROM user_table_rows
WHERE table_id = ?
  AND json_extract(data, '$.status') = 'active'
  AND CAST(json_extract(data, '$.mrr') AS REAL) > 100
ORDER BY json_extract(data, '$.name') ASC
LIMIT 50 OFFSET 0;
```

Supported operators: eq, neq, gt, gte, lt, lte, contains, starts_with, in, is_empty, is_not_empty.

### FK-Safe Deletion Order (clear.ts)

Insert BEFORE `documentsDeleted`:
```
table_document_inputs → task_table_inputs → workflow_table_inputs →
schedule_table_inputs → user_table_imports → user_table_views →
user_table_relationships → user_table_rows → user_table_columns →
user_tables → user_table_templates
```

### Built-in Templates (12)

| Template | Category | Columns |
|----------|----------|---------|
| CRM Tracker | business | name, email, company, status, mrr, notes, created_date |
| Sales Pipeline | business | deal_name, contact, stage, amount, close_date, owner, probability |
| Team Directory | business | name, email, role, department, phone, location, start_date, skills |
| Meeting Notes | business | date, attendees, topic, decisions, action_items, owner, due_date |
| Reading List | personal | title, author, status, rating, genre, notes |
| Habit Tracker | personal | habit_name, category, streak, last_done, target_frequency |
| Recipe Collection | personal | recipe_name, cuisine, prep_time, servings, difficulty, url, notes |
| Sprint Board | pm | task, assignee, status, priority, story_points, sprint, due_date, labels |
| OKR Tracker | pm | objective, key_result, owner, progress, status, quarter, notes |
| Budget Tracker | finance | category, budgeted, actual, difference (computed), month, notes |
| Invoice Tracker | finance | invoice_num, client, amount, date_sent, due_date, status, payment_date |
| Content Calendar | content | title, platform, status, publish_date, author, topic, url |

## Acceptance Criteria

- [ ] All 12 tables defined in schema.ts with Drizzle definitions and TypeScript types exported
- [ ] Bootstrap creates tables idempotently on startup (no errors on existing DB)
- [ ] clear.ts deletes all table data in FK-safe order; clear.test.ts safety-net passes
- [ ] Create table with column schema, verify columns denormalized to user_table_columns
- [ ] Add rows with JSON data, retrieve via query with filters and sorting
- [ ] Query builder supports all 11 operators via json_extract()
- [ ] Pagination (limit/offset) works correctly on row queries
- [ ] API routes return proper status codes (201 create, 200 read, 204 delete, 400 validation errors)
- [ ] Zod validation on all mutation endpoints
- [ ] 12 built-in templates seeded and retrievable via GET /api/tables/templates
- [ ] Templates filterable by category
- [ ] Row count auto-updated on insert/delete
- [ ] Delete table cascades to rows, columns, views, relationships, imports, junction records

## Scope Boundaries

**Included:**
- Full schema for all 12 tables with indexes
- CRUD data layer and API routes
- Query builder with json_extract() translation
- Template seeding
- Zod validators

**Excluded:**
- UI components (see tables-list-page, tables-spreadsheet-editor)
- Document import logic (see tables-document-import)
- Agent tool definitions (see tables-agent-integration)
- Computed column evaluation (see tables-computed-columns)
- NL query translation (see tables-chat-queries)

## References

- Source: Plan file `internal implementation plan`
- Pattern: `src/lib/data/chat.ts` — CRUD operations pattern
- Pattern: `src/lib/db/bootstrap.ts` — bootstrap DDL pattern
- Pattern: `src/lib/data/clear.ts` — FK-safe deletion pattern
- Pattern: `src/lib/data/seed-data/` — template seeding pattern
