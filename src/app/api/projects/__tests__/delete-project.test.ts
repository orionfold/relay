import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import * as schema from "@/lib/db/schema";

/**
 * Safety-net regression tests for project cascade deletion.
 *
 * These verify that the shared deleteProjectCascade function in
 * src/lib/data/delete-project.ts properly handles all FK relationships
 * before deleting a project. This prevents "Failed to delete project"
 * FK constraint errors when related records exist.
 */
describe("project DELETE cascade coverage", () => {
  const deleteRouteSource = readFileSync(
    join(__dirname, "..", "..", "..", "..", "lib", "data", "delete-project.ts"),
    "utf-8"
  );

  // Tables that have a direct projectId FK to projects
  const TABLES_WITH_PROJECT_FK = [
    "tasks",
    "workflows",
    "documents",
    "schedules",
    "usageLedger",
    "environmentScans",
    "environmentCheckpoints",
    "conversations",
    "projectDocumentDefaults",
    "userTables",
    "workshopRuns",
  ];

  // Tables that are indirect children (FK to a table that has projectId)
  // These must be deleted before their parent tables
  const INDIRECT_CHILDREN = [
    { table: "agentLogs", parent: "tasks", via: "taskId" },
    { table: "notifications", parent: "tasks", via: "taskId" },
    { table: "learnedContext", parent: "tasks", via: "sourceTaskId" },
    { table: "chatMessages", parent: "conversations", via: "conversationId" },
    { table: "environmentArtifacts", parent: "environmentScans", via: "scanId" },
    { table: "environmentSyncOps", parent: "environmentCheckpoints", via: "checkpointId" },
    { table: "userTableColumns", parent: "userTables", via: "tableId" },
    { table: "userTableRows", parent: "userTables", via: "tableId" },
    { table: "userTableViews", parent: "userTables", via: "tableId" },
    { table: "userTableImports", parent: "userTables", via: "tableId" },
    { table: "userTableRelationships", parent: "userTables", via: "fromTableId" },
    { table: "tableDocumentInputs", parent: "userTables", via: "tableId" },
    { table: "taskTableInputs", parent: "userTables", via: "tableId" },
    { table: "workflowTableInputs", parent: "userTables", via: "tableId" },
    { table: "scheduleTableInputs", parent: "userTables", via: "tableId" },
    { table: "userTableTriggers", parent: "userTables", via: "tableId" },
    { table: "userTableRowHistory", parent: "userTables", via: "tableId" },
  ];

  it("handles all tables with direct projectId FK", () => {
    const missing = TABLES_WITH_PROJECT_FK.filter(
      (table) => !deleteRouteSource.includes(`db.delete(${table})`)
    );

    expect(
      missing,
      `Project DELETE route missing cascade for tables: ${missing.join(", ")}. ` +
      `These have projectId FK and will cause constraint violations.`
    ).toEqual([]);
  });

  it("handles all indirect child tables", () => {
    const missing = INDIRECT_CHILDREN.filter(
      ({ table }) => !deleteRouteSource.includes(`db.delete(${table})`)
    );

    expect(
      missing.map((m) => `${m.table} (child of ${m.parent} via ${m.via})`),
      `Project DELETE route missing cascade for indirect children. ` +
      `These must be deleted before their parent tables.`
    ).toEqual([]);
  });

  it("imports all required schema tables", () => {
    const allTables = [
      ...TABLES_WITH_PROJECT_FK,
      ...INDIRECT_CHILDREN.map((c) => c.table),
    ];

    const missingImports = allTables.filter(
      (table) => !deleteRouteSource.includes(table)
    );

    expect(
      missingImports,
      `Project DELETE route source does not reference these tables: ${missingImports.join(", ")}`
    ).toEqual([]);
  });

  it("deletes children before parents (FK-safe order)", () => {
    // Verify that child deletes appear BEFORE parent deletes in the source
    const orderPairs = [
      // chatMessages must come before conversations
      { child: "chatMessages", parent: "conversations" },
      // agentLogs, notifications, documents must come before tasks
      { child: "agentLogs", parent: "tasks" },
      { child: "notifications", parent: "tasks" },
      // environmentArtifacts must come before environmentScans
      { child: "environmentArtifacts", parent: "environmentScans" },
      // environmentSyncOps must come before environmentCheckpoints
      { child: "environmentSyncOps", parent: "environmentCheckpoints" },
      // tasks, workflows, schedules must come before projects
      { child: "tasks", parent: "projects" },
      { child: "workflows", parent: "projects" },
      { child: "schedules", parent: "projects" },
      { child: "workshopRuns", parent: "projects" },
    ];

    const violations = orderPairs.filter(({ child, parent }) => {
      // Find the LAST occurrence of db.delete(child) and FIRST occurrence of db.delete(parent)
      // within the DELETE function (not the import section)
      const deleteSection = deleteRouteSource.slice(
        deleteRouteSource.indexOf("export function deleteProjectCascade")
      );
      const childPos = deleteSection.lastIndexOf(`db.delete(${child})`);
      const parentPos = deleteSection.indexOf(`db.delete(${parent})`);
      // child must appear before parent (lower index)
      return childPos === -1 || parentPos === -1 || childPos > parentPos;
    });

    expect(
      violations.map((v) => `${v.child} must be deleted before ${v.parent}`),
      `FK-safe ordering violated — children must be deleted before parents`
    ).toEqual([]);
  });

  it("checks project existence before deleting", () => {
    const deleteSection = deleteRouteSource.slice(
      deleteRouteSource.indexOf("export function deleteProjectCascade")
    );
    // The shared function checks if the project exists and returns false if not
    expect(deleteSection).toContain("if (!existing) return false");
  });

  /**
   * Meta-test: ensures all schema tables with a projectId column
   * are accounted for in TABLES_WITH_PROJECT_FK above.
   * If you add a new table with projectId to schema.ts, this test
   * will fail and remind you to update both the delete handler
   * and this test file.
   */
  it("test coverage includes all schema tables with projectId", () => {
    const tablesWithProjectId = Object.entries(schema)
      .filter(([, value]) => {
        if (
          value == null ||
          typeof value !== "object" ||
          !("getSQL" in (value as Record<string, unknown>))
        ) {
          return false;
        }
        // Check if the table object has a projectId column
        const tableObj = value as Record<string, unknown>;
        return "projectId" in tableObj;
      })
      .map(([name]) => name)
      .filter((name) => name !== "projects"); // Exclude projects itself

    const untested = tablesWithProjectId.filter(
      (name) => !TABLES_WITH_PROJECT_FK.includes(name)
    );

    expect(
      untested,
      `New tables with projectId FK not covered in delete test: ${untested.join(", ")}. ` +
      `Add them to TABLES_WITH_PROJECT_FK and update the DELETE handler.`
    ).toEqual([]);
  });
});
