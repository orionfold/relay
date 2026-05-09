import { defineTool } from "../tool-registry";
import { z } from "zod";
import { ok, err, type ToolContext } from "./helpers";
import {
  listTables,
  getTable,
  createTable,
  updateTable,
  deleteTable,
  listRows,
  addRows,
  updateRow,
  deleteRows,
  listTemplates,
  cloneFromTemplate,
  addColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
} from "@/lib/data/tables";
import { getTableHistory } from "@/lib/tables/history";
import {
  extractStructuredData,
  inferColumnTypes,
  importRows,
  createImportRecord,
} from "@/lib/tables/import";
import { createEnrichmentWorkflow } from "@/lib/tables/enrichment";
import type { ColumnDef } from "@/lib/tables/types";

export function tableTools(ctx: ToolContext) {
  return [
    // ── Read operations ──────────────────────────────────────────────

    defineTool(
      "list_tables",
      "List all user-defined tables, optionally filtered by project. Returns table name, description, column count, row count, and source.",
      {
        projectId: z
          .string()
          .optional()
          .describe("Filter by project ID. Omit to use active project."),
        source: z
          .enum(["manual", "imported", "agent", "template"])
          .optional()
          .describe("Filter by how the table was created"),
      },
      async (args) => {
        try {
          const effectiveProjectId = args.projectId ?? ctx.projectId ?? undefined;
          const tables = await listTables({
            projectId: effectiveProjectId,
            source: args.source,
          });
          return ok(
            tables.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              projectName: t.projectName,
              columnCount: t.columnCount,
              rowCount: t.rowCount,
              source: t.source,
            }))
          );
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to list tables");
        }
      }
    ),

    defineTool(
      "get_table_schema",
      "Get the full schema of a table including all column definitions, types, and configurations.",
      {
        tableId: z.string().describe("The table ID to inspect"),
      },
      async (args) => {
        try {
          const table = await getTable(args.tableId);
          if (!table) return err("Table not found");
          const columns = JSON.parse(table.columnSchema) as ColumnDef[];
          return ok({
            id: table.id,
            name: table.name,
            description: table.description,
            rowCount: table.rowCount,
            columns: columns.map((c) => ({
              name: c.name,
              displayName: c.displayName,
              dataType: c.dataType,
              required: c.required,
              config: c.config,
            })),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to get table schema");
        }
      }
    ),

    defineTool(
      "query_table",
      "Query rows from a table with optional filters and sorting. Filters use structured operators (eq, neq, gt, gte, lt, lte, contains, starts_with, in, is_empty, is_not_empty).",
      {
        tableId: z.string().describe("Table ID to query"),
        filters: z
          .array(
            z.object({
              column: z.string(),
              operator: z.enum([
                "eq", "neq", "gt", "gte", "lt", "lte",
                "contains", "starts_with", "in", "is_empty", "is_not_empty",
              ]),
              value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
            })
          )
          .optional()
          .describe("Filter conditions"),
        sorts: z
          .array(z.object({ column: z.string(), direction: z.enum(["asc", "desc"]) }))
          .optional()
          .describe("Sort order"),
        limit: z.number().min(1).max(500).optional().describe("Max rows to return (default 100)"),
      },
      async (args) => {
        try {
          const rows = await listRows(args.tableId, {
            filters: args.filters,
            sorts: args.sorts,
            limit: args.limit,
          });
          return ok(
            rows.map((r) => ({
              id: r.id,
              data: JSON.parse(r.data),
              position: r.position,
            }))
          );
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to query table");
        }
      }
    ),

    defineTool(
      "search_table",
      "Search table rows for text matching a query across all text columns.",
      {
        tableId: z.string().describe("Table ID to search"),
        query: z.string().describe("Search text"),
        limit: z.number().min(1).max(100).optional().describe("Max results (default 20)"),
      },
      async (args) => {
        try {
          const table = await getTable(args.tableId);
          if (!table) return err("Table not found");
          const columns = JSON.parse(table.columnSchema) as ColumnDef[];
          const textCols = columns.filter((c) =>
            ["text", "email", "url"].includes(c.dataType)
          );

          if (textCols.length === 0) return ok([]);

          // Search using contains filter on first text column (basic approach)
          const rows = await listRows(args.tableId, {
            filters: [{ column: textCols[0].name, operator: "contains", value: args.query }],
            limit: args.limit ?? 20,
          });

          return ok(
            rows.map((r) => ({
              id: r.id,
              data: JSON.parse(r.data),
            }))
          );
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to search table");
        }
      }
    ),

    defineTool(
      "aggregate_table",
      "Compute aggregate values (sum, avg, count, min, max) on a numeric column, with optional filters.",
      {
        tableId: z.string().describe("Table ID"),
        column: z.string().describe("Column name to aggregate (must be numeric)"),
        operation: z.enum(["sum", "avg", "count", "min", "max"]).describe("Aggregation operation"),
        filters: z
          .array(
            z.object({
              column: z.string(),
              operator: z.enum([
                "eq", "neq", "gt", "gte", "lt", "lte",
                "contains", "starts_with", "in", "is_empty", "is_not_empty",
              ]),
              value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
            })
          )
          .optional(),
      },
      async (args) => {
        try {
          const rows = await listRows(args.tableId, {
            filters: args.filters,
            limit: 10000,
          });

          const values = rows
            .map((r) => {
              const data = JSON.parse(r.data) as Record<string, unknown>;
              return Number(data[args.column]);
            })
            .filter((v) => !isNaN(v));

          if (values.length === 0) return ok({ result: null, count: 0 });

          let result: number;
          switch (args.operation) {
            case "sum":
              result = values.reduce((a, b) => a + b, 0);
              break;
            case "avg":
              result = values.reduce((a, b) => a + b, 0) / values.length;
              break;
            case "count":
              result = values.length;
              break;
            case "min":
              result = Math.min(...values);
              break;
            case "max":
              result = Math.max(...values);
              break;
          }

          return ok({ result, count: values.length, operation: args.operation, column: args.column });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to aggregate");
        }
      }
    ),

    // ── Write operations ─────────────────────────────────────────────

    defineTool(
      "add_rows",
      "Add one or more rows to a table. Each row is an object mapping column names to values.",
      {
        tableId: z.string().describe("Table ID"),
        rows: z
          .array(z.record(z.string(), z.unknown()))
          .min(1)
          .max(100)
          .describe("Array of row data objects"),
      },
      async (args) => {
        try {
          const { ids, skippedHashes } = await addRows(
            args.tableId,
            args.rows.map((data) => ({ data, createdBy: "agent" }))
          );
          // F10: surface dedupe count so the agent doesn't silently
          // believe it inserted N rows when M were deduped.
          return ok({
            added: ids.length,
            skipped: skippedHashes.length,
            rowIds: ids,
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to add rows");
        }
      }
    ),

    defineTool(
      "update_row",
      "Update specific fields of a row. Only the provided fields are changed; others are preserved.",
      {
        rowId: z.string().describe("Row ID to update"),
        data: z.record(z.string(), z.unknown()).describe("Fields to update"),
      },
      async (args) => {
        try {
          const row = await updateRow(args.rowId, { data: args.data });
          if (!row) return err("Row not found");
          return ok({ id: row.id, data: JSON.parse(row.data) });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to update row");
        }
      }
    ),

    defineTool(
      "delete_rows",
      "Delete one or more rows from a table by their IDs.",
      {
        rowIds: z.array(z.string()).min(1).describe("Row IDs to delete"),
      },
      async (args) => {
        try {
          await deleteRows(args.rowIds);
          return ok({ deleted: args.rowIds.length });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to delete rows");
        }
      }
    ),

    // ── Bulk row enrichment ──────────────────────────────────────────

    defineTool(
      "enrich_table",
      `Bulk-enrich rows in a user table by running an agent task per row and writing the result back to a target column. Creates a row-driven loop workflow that fans out one task per matching row.

The prompt may reference row fields with {{row.fieldName}} placeholders — they are passed to the agent as JSON context. To skip a row at agent-time, return the literal string "NOT_FOUND". Already-populated rows (target column has a non-empty value) are skipped automatically for idempotency.

Returns the workflowId so the caller can poll status, plus the rowCount that will actually be processed.`,
      {
        tableId: z.string().describe("Table ID to enrich"),
        prompt: z
          .string()
          .min(1)
          .max(8192)
          .describe(
            "Per-row prompt template. Use {{row.fieldName}} to reference row fields. Instruct the agent to return NOT_FOUND when no value can be determined."
          ),
        targetColumn: z
          .string()
          .min(1)
          .describe("Column name to write the agent's result into"),
        filter: z
          .object({
            column: z.string(),
            operator: z.enum([
              "eq", "neq", "gt", "gte", "lt", "lte",
              "contains", "starts_with", "in", "is_empty", "is_not_empty",
            ]),
            value: z
              .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
              .optional(),
          })
          .optional()
          .describe(
            "Optional row filter — typically {column: targetColumn, operator: 'is_empty'} to enrich only blank cells"
          ),
        agentProfile: z
          .string()
          .optional()
          .describe("Agent profile to use (defaults to 'sales-researcher')"),
        projectId: z
          .string()
          .optional()
          .describe("Project ID. Omit to use the active project."),
        batchSize: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Maximum rows to process in this run (default 50, capped at 200)"),
      },
      async (args) => {
        try {
          const effectiveProjectId = args.projectId ?? ctx.projectId ?? undefined;
          const result = await createEnrichmentWorkflow(args.tableId, {
            prompt: args.prompt,
            targetColumn: args.targetColumn,
            filter: args.filter,
            agentProfile: args.agentProfile,
            projectId: effectiveProjectId,
            batchSize: args.batchSize,
          });
          return ok(result);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to start enrichment");
        }
      }
    ),

    // ── Creation operations ──────────────────────────────────────────

    defineTool(
      "create_table",
      "Create a new empty table with specified columns. When creating a table as part of an app composition, pass appId so the table is linked to the app's project and listed in the app manifest.",
      {
        name: z.string().min(1).max(256).describe("Table name"),
        description: z.string().max(1024).optional().describe("Table description"),
        projectId: z.string().optional().describe("Project ID. Omit for active project."),
        appId: z
          .string()
          .refine((v) => !v.includes("--"), {
            message:
              "appId must be the app slug only (e.g., 'habit-loop'), not an artifact id like 'habit-loop--coach'. Strip everything from '--' onward — the appId is the prefix before '--'.",
          })
          .optional()
          .describe(
            "App composition ID — the app's slug, e.g. 'wealth-tracker'. Must NOT contain '--'. If you have an artifact id like 'wealth-tracker--coach', the appId is everything before '--' (i.e. 'wealth-tracker'). When provided, the table is linked to the app's project and added to the app manifest."
          ),
        columns: z
          .array(
            z.object({
              name: z.string(),
              displayName: z.string(),
              dataType: z.enum([
                "text", "number", "date", "boolean", "select", "url", "email",
              ]),
              config: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .min(1)
          .describe("Column definitions"),
      },
      async (args) => {
        try {
          let effectiveProjectId = args.projectId ?? ctx.projectId ?? undefined;
          if (args.appId) {
            const { ensureAppProject } = await import(
              "@/lib/apps/compose-integration"
            );
            const { projectId } = await ensureAppProject(args.appId);
            effectiveProjectId = projectId;
          }

          const table = await createTable({
            name: args.name,
            description: args.description,
            projectId: effectiveProjectId,
            columns: args.columns.map((c, i) => ({
              ...c,
              position: i,
            })),
            source: "agent",
          });

          if (args.appId) {
            const { upsertAppManifest } = await import(
              "@/lib/apps/compose-integration"
            );
            upsertAppManifest(args.appId, {
              kind: "table",
              id: table.id,
              columns: args.columns.map((c) => c.name),
            });
          }

          ctx.onToolResult?.("create_table", {
            id: table.id,
            name: table.name,
            ...(args.appId ? { appId: args.appId } : {}),
          });
          return ok({
            id: table.id,
            name: table.name,
            ...(args.appId ? { appId: args.appId } : {}),
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to create table");
        }
      }
    ),

    defineTool(
      "import_document_as_table",
      "Import a document (CSV, XLSX, TSV) into an existing table. Automatically detects column types from the document content.",
      {
        tableId: z.string().describe("Table ID to import into"),
        documentId: z.string().describe("Document ID to import from"),
      },
      async (args) => {
        try {
          const { headers, rows } = await extractStructuredData(args.documentId);
          const sampleRows = rows.slice(0, 100);
          const inferredColumns = inferColumnTypes(headers, sampleRows);
          const result = await importRows(args.tableId, rows, inferredColumns);
          await createImportRecord(args.tableId, args.documentId, result);
          return ok({
            importId: result.importId,
            rowsImported: result.rowsImported,
            rowsSkipped: result.rowsSkipped,
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to import document");
        }
      }
    ),

    defineTool(
      "list_table_templates",
      "List available table templates that can be used to quickly create pre-structured tables.",
      {
        category: z
          .enum(["business", "personal", "pm", "finance", "content"])
          .optional()
          .describe("Filter by template category"),
      },
      async (args) => {
        try {
          const templates = await listTemplates({ category: args.category });
          return ok(
            templates.map((t) => ({
              id: t.id,
              name: t.name,
              description: t.description,
              category: t.category,
            }))
          );
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to list templates");
        }
      }
    ),

    defineTool(
      "create_table_from_template",
      "Create a new table from a template, optionally including sample data.",
      {
        templateId: z.string().describe("Template ID to clone from"),
        name: z.string().min(1).max(256).describe("Name for the new table"),
        projectId: z.string().optional().describe("Project ID. Omit for active project."),
        includeSampleData: z.boolean().optional().describe("Whether to include sample rows"),
      },
      async (args) => {
        try {
          const effectiveProjectId = args.projectId ?? ctx.projectId ?? undefined;
          const table = await cloneFromTemplate({
            templateId: args.templateId,
            name: args.name,
            projectId: effectiveProjectId,
            includeSampleData: args.includeSampleData,
          });
          return ok({ id: table.id, name: table.name });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to create from template");
        }
      }
    ),

    // ── NL-to-schema creation ──────────────────────────────────────────

    defineTool(
      "create_table_from_description",
      `Create a table by inferring column schema from a natural language description. You (the LLM) should infer appropriate column names, data types, and constraints from the description.

Guidelines for schema inference:
- Use "email" type for email-like fields, "url" for URLs, "date" for dates, "number" for numeric fields, "boolean" for yes/no
- Use "select" type with options for fields with a known set of values (e.g., status, priority, category)
- Use "text" as the default for free-form text fields
- Always include a primary descriptive column (e.g., "name", "title") as the first column
- Include 5-10 columns that make sense for the described use case`,
      {
        description: z.string().min(3).describe("Natural language description of the table to create, e.g. 'a table for tracking job applications'"),
        name: z.string().min(1).max(256).describe("Table name inferred from the description"),
        columns: z.array(z.object({
          name: z.string().describe("Machine-readable column name (snake_case)"),
          displayName: z.string().describe("Human-readable column name"),
          dataType: z.enum(["text", "number", "date", "boolean", "select", "url", "email"]).describe("Inferred data type"),
          config: z.object({ options: z.array(z.string()).optional() }).optional().describe("Config for select columns"),
        })).describe("Inferred column definitions"),
        projectId: z.string().optional().describe("Project ID. Omit for active project."),
      },
      async (args) => {
        try {
          const effectiveProjectId = args.projectId ?? ctx.projectId ?? undefined;
          const table = await createTable({
            name: args.name,
            projectId: effectiveProjectId,
            columns: args.columns.map((c, i) => ({
              name: c.name,
              displayName: c.displayName,
              dataType: c.dataType,
              position: i,
              config: c.config,
            })),
            source: "agent",
          });
          return ok({
            id: table.id,
            name: table.name,
            columns: args.columns.length,
            description: `Created from: "${args.description}"`,
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to create table");
        }
      }
    ),

    // ── Export ──────────────────────────────────────────────────────────

    defineTool(
      "export_table",
      "Export a table's data as CSV, JSON, or XLSX. Returns the download URL.",
      {
        tableId: z.string().describe("Table ID to export"),
        format: z.enum(["csv", "json", "xlsx"]).describe("Export format"),
      },
      async (args) => {
        try {
          const table = await getTable(args.tableId);
          if (!table) return err("Table not found");
          const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          return ok({
            url: `${baseUrl}/api/tables/${args.tableId}/export?format=${args.format}`,
            table: table.name,
            format: args.format,
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to export");
        }
      }
    ),

    // ── Column CRUD ────────────────────────────────────────────────────

    defineTool(
      "add_column",
      "Add a new column to a table.",
      {
        tableId: z.string().describe("Table ID"),
        name: z.string().min(1).max(64).describe("Column name (snake_case)"),
        displayName: z.string().min(1).max(128).describe("Display name"),
        dataType: z.enum(["text", "number", "date", "boolean", "select", "url", "email", "relation", "computed"]).describe("Column data type"),
        required: z.boolean().optional().describe("Whether the column is required"),
        config: z.record(z.string(), z.unknown()).optional().describe("Type-specific config (options for select, formula for computed, targetTableId for relation)"),
      },
      async (args) => {
        try {
          const col = await addColumn(args.tableId, {
            name: args.name,
            displayName: args.displayName,
            dataType: args.dataType,
            required: args.required,
            config: args.config as ColumnDef["config"],
          });
          return ok({ id: col.id, name: col.name, displayName: col.displayName });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to add column");
        }
      }
    ),

    defineTool(
      "update_column",
      "Update an existing column's display name, type, or configuration.",
      {
        columnId: z.string().describe("Column ID to update"),
        displayName: z.string().optional().describe("New display name"),
        dataType: z.enum(["text", "number", "date", "boolean", "select", "url", "email", "relation", "computed"]).optional().describe("New data type"),
        config: z.record(z.string(), z.unknown()).optional().describe("Updated config"),
      },
      async (args) => {
        try {
          const col = await updateColumn(args.columnId, {
            displayName: args.displayName,
            dataType: args.dataType,
            config: args.config as ColumnDef["config"],
          });
          if (!col) return err("Column not found");
          return ok({ id: col.id, name: col.name });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to update column");
        }
      }
    ),

    defineTool(
      "delete_column",
      "Delete a column from a table. This removes the column definition but preserves row data.",
      {
        columnId: z.string().describe("Column ID to delete"),
      },
      async (args) => {
        try {
          await deleteColumn(args.columnId);
          return ok({ deleted: true });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to delete column");
        }
      }
    ),

    defineTool(
      "reorder_columns",
      "Reorder columns in a table by providing column IDs in the desired order.",
      {
        tableId: z.string().describe("Table ID"),
        columnIds: z.array(z.string()).min(1).describe("Column IDs in desired order"),
      },
      async (args) => {
        try {
          await reorderColumns(args.tableId, args.columnIds);
          return ok({ reordered: true, count: args.columnIds.length });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to reorder columns");
        }
      }
    ),

    // ── Table management ───────────────────────────────────────────────

    defineTool(
      "update_table",
      "Update a table's name or description.",
      {
        tableId: z.string().describe("Table ID to update"),
        name: z.string().optional().describe("New table name"),
        description: z.string().nullable().optional().describe("New description"),
      },
      async (args) => {
        try {
          const updated = await updateTable(args.tableId, {
            name: args.name,
            description: args.description,
          });
          if (!updated) return err("Table not found");
          return ok({ id: updated.id, name: updated.name });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to update table");
        }
      }
    ),

    defineTool(
      "delete_table",
      "Permanently delete a table and all its rows, columns, views, and triggers.",
      {
        tableId: z.string().describe("Table ID to delete"),
      },
      async (args) => {
        try {
          await deleteTable(args.tableId);
          return ok({ deleted: true });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to delete table");
        }
      }
    ),

    // ── Charts ─────────────────────────────────────────────────────────

    defineTool(
      "list_charts",
      "List saved chart views for a table.",
      {
        tableId: z.string().describe("Table ID"),
      },
      async (args) => {
        try {
          const res = await fetch(`${getBaseUrl()}/api/tables/${args.tableId}/charts`);
          if (!res.ok) return err("Failed to list charts");
          return ok(await res.json());
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to list charts");
        }
      }
    ),

    defineTool(
      "create_chart",
      "Create a chart visualization for a table. Supports bar, line, pie, and scatter chart types with aggregation.",
      {
        tableId: z.string().describe("Table ID"),
        type: z.enum(["bar", "line", "pie", "scatter"]).describe("Chart type"),
        title: z.string().min(1).describe("Chart title"),
        xColumn: z.string().describe("Column for X axis / categories"),
        yColumn: z.string().optional().describe("Column for Y axis / values"),
        aggregation: z.enum(["sum", "avg", "count", "min", "max"]).optional().describe("Aggregation operation"),
      },
      async (args) => {
        try {
          const res = await fetch(`${getBaseUrl()}/api/tables/${args.tableId}/charts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: args.type,
              title: args.title,
              xColumn: args.xColumn,
              yColumn: args.yColumn,
              aggregation: args.aggregation,
            }),
          });
          if (!res.ok) return err("Failed to create chart");
          return ok(await res.json());
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to create chart");
        }
      }
    ),

    defineTool(
      "update_chart",
      "Update an existing chart's title, type, columns, or aggregation.",
      {
        tableId: z.string().describe("Table ID"),
        chartId: z.string().describe("Chart ID to update"),
        title: z.string().optional().describe("New chart title"),
        type: z.enum(["bar", "line", "pie", "scatter"]).optional().describe("New chart type"),
        xColumn: z.string().optional().describe("New X axis column"),
        yColumn: z.string().optional().describe("New Y axis column"),
        aggregation: z.enum(["sum", "avg", "count", "min", "max"]).optional().describe("New aggregation"),
      },
      async (args) => {
        try {
          const res = await fetch(`${getBaseUrl()}/api/tables/${args.tableId}/charts/${args.chartId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: args.title,
              type: args.type,
              xColumn: args.xColumn,
              yColumn: args.yColumn,
              aggregation: args.aggregation,
            }),
          });
          if (!res.ok) return err("Failed to update chart");
          return ok(await res.json());
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to update chart");
        }
      }
    ),

    defineTool(
      "delete_chart",
      "Delete a chart from a table.",
      {
        tableId: z.string().describe("Table ID"),
        chartId: z.string().describe("Chart ID to delete"),
      },
      async (args) => {
        try {
          const res = await fetch(`${getBaseUrl()}/api/tables/${args.tableId}/charts/${args.chartId}`, {
            method: "DELETE",
          });
          if (!res.ok && res.status !== 204) return err("Failed to delete chart");
          return ok({ deleted: true, chartId: args.chartId });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to delete chart");
        }
      }
    ),

    defineTool(
      "render_chart",
      "Render a chart inline by fetching chart config and table data. Returns the chart configuration and aggregated data points for display.",
      {
        tableId: z.string().describe("Table ID"),
        chartId: z.string().describe("Chart ID to render"),
      },
      async (args) => {
        try {
          // Fetch chart config
          const chartsRes = await fetch(`${getBaseUrl()}/api/tables/${args.tableId}/charts`);
          if (!chartsRes.ok) return err("Failed to fetch charts");
          const charts = await chartsRes.json() as Array<{ id: string; name: string; config: { type: string; xColumn: string; yColumn?: string; aggregation?: string } }>;
          const chart = charts.find((c: { id: string }) => c.id === args.chartId);
          if (!chart) return err("Chart not found");

          // Fetch table rows
          const rowsRes = await fetch(`${getBaseUrl()}/api/tables/${args.tableId}/rows`);
          if (!rowsRes.ok) return err("Failed to fetch table rows");
          const rows = await rowsRes.json() as Array<{ data: string | Record<string, unknown> }>;

          // Parse row data
          const parsedRows = rows.map((r) => {
            const data = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
            return data as Record<string, unknown>;
          });

          // Aggregate data
          const { xColumn, yColumn, aggregation = "count" } = chart.config;
          const groups = new Map<string, number[]>();
          for (const row of parsedRows) {
            const key = String(row[xColumn] ?? "Unknown");
            if (!groups.has(key)) groups.set(key, []);
            if (yColumn && row[yColumn] != null) {
              groups.get(key)!.push(Number(row[yColumn]));
            } else {
              groups.get(key)!.push(1);
            }
          }

          const dataPoints = Array.from(groups.entries()).map(([label, values]) => {
            let value: number;
            switch (aggregation) {
              case "sum": value = values.reduce((a, b) => a + b, 0); break;
              case "avg": value = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0; break;
              case "min": value = Math.min(...values); break;
              case "max": value = Math.max(...values); break;
              case "count": default: value = values.length; break;
            }
            return { label, value: Math.round(value * 100) / 100 };
          });

          return ok({
            chart: { id: chart.id, name: chart.name, type: chart.config.type },
            xAxis: xColumn,
            yAxis: yColumn ?? "count",
            aggregation,
            dataPoints,
          });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to render chart");
        }
      }
    ),

    // ── Triggers ───────────────────────────────────────────────────────

    defineTool(
      "list_triggers",
      "List all triggers configured for a table.",
      {
        tableId: z.string().describe("Table ID"),
      },
      async (args) => {
        try {
          const res = await fetch(`${getBaseUrl()}/api/tables/${args.tableId}/triggers`);
          if (!res.ok) return err("Failed to list triggers");
          return ok(await res.json());
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to list triggers");
        }
      }
    ),

    defineTool(
      "create_trigger",
      "Create a trigger that fires when table rows change. Triggers can create tasks or start workflows.",
      {
        tableId: z.string().describe("Table ID"),
        name: z.string().min(1).describe("Trigger name"),
        triggerEvent: z.enum(["row_added", "row_updated", "row_deleted"]).describe("Event that fires the trigger"),
        condition: z.object({
          column: z.string(),
          operator: z.string(),
          value: z.string(),
        }).optional().describe("Optional condition — trigger only fires when this filter matches"),
        actionType: z.enum(["create_task", "run_workflow"]).describe("Action to perform"),
        actionConfig: z.record(z.string(), z.unknown()).describe("Action config: {title, description, projectId} for create_task, {workflowId} for run_workflow"),
      },
      async (args) => {
        try {
          const res = await fetch(`${getBaseUrl()}/api/tables/${args.tableId}/triggers`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: args.name,
              triggerEvent: args.triggerEvent,
              condition: args.condition ?? null,
              actionType: args.actionType,
              actionConfig: args.actionConfig,
            }),
          });
          if (!res.ok) return err("Failed to create trigger");
          return ok(await res.json());
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to create trigger");
        }
      }
    ),

    defineTool(
      "update_trigger",
      "Update a trigger's status (active/paused) or configuration.",
      {
        tableId: z.string().describe("Table ID"),
        triggerId: z.string().describe("Trigger ID to update"),
        status: z.enum(["active", "paused"]).optional().describe("New status"),
        name: z.string().optional().describe("New trigger name"),
      },
      async (args) => {
        try {
          const res = await fetch(`${getBaseUrl()}/api/tables/${args.tableId}/triggers/${args.triggerId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: args.status,
              name: args.name,
            }),
          });
          if (!res.ok) return err("Failed to update trigger");
          return ok(await res.json());
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to update trigger");
        }
      }
    ),

    defineTool(
      "delete_trigger",
      "Delete a trigger from a table.",
      {
        tableId: z.string().describe("Table ID"),
        triggerId: z.string().describe("Trigger ID to delete"),
      },
      async (args) => {
        try {
          const res = await fetch(`${getBaseUrl()}/api/tables/${args.tableId}/triggers/${args.triggerId}`, {
            method: "DELETE",
          });
          if (!res.ok) return err("Failed to delete trigger");
          return ok({ deleted: true });
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to delete trigger");
        }
      }
    ),

    // ── History ─────────────────────────────────────────────────────────

    defineTool(
      "get_table_history",
      "Get recent change history for a table, showing row updates and deletions with previous data snapshots.",
      {
        tableId: z.string().describe("Table ID"),
        limit: z.number().int().min(1).max(200).optional().describe("Max entries to return (default 50)"),
      },
      async (args) => {
        try {
          const history = getTableHistory(args.tableId, args.limit ?? 50);
          return ok(history.map((h) => ({
            id: h.id,
            rowId: h.rowId,
            changeType: h.changeType,
            changedBy: h.changedBy,
            createdAt: h.createdAt,
          })));
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to get history");
        }
      }
    ),

    // ── Save as template ───────────────────────────────────────────────

    defineTool(
      "save_as_template",
      "Save a table as a reusable user template, optionally including sample data from the first 5 rows.",
      {
        tableId: z.string().describe("Table ID to save as template"),
        name: z.string().min(1).describe("Template name"),
        category: z.enum(["business", "personal", "pm", "finance", "content"]).optional().describe("Template category (default: personal)"),
        includeSampleData: z.boolean().optional().describe("Include first 5 rows as sample data"),
      },
      async (args) => {
        try {
          const res = await fetch(`${getBaseUrl()}/api/tables/templates`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId: args.tableId,
              name: args.name,
              category: args.category ?? "personal",
              includeSampleData: args.includeSampleData ?? false,
            }),
          });
          if (!res.ok) return err("Failed to save template");
          return ok(await res.json());
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to save template");
        }
      }
    ),
  ];
}

function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
