/**
 * FK-safe cascade delete for a project and all its children.
 * Shared by the API DELETE route and the delete_project chat tool.
 */

import { db } from "@/lib/db";
import {
  projects,
  tasks,
  workflows,
  documents,
  schedules,
  agentLogs,
  notifications,
  learnedContext,
  usageLedger,
  environmentSyncOps,
  environmentCheckpoints,
  environmentArtifacts,
  environmentScans,
  chatMessages,
  conversations,
  projectDocumentDefaults,
  userTables,
  userTableColumns,
  userTableRows,
  userTableViews,
  userTableImports,
  userTableRelationships,
  tableDocumentInputs,
  taskTableInputs,
  workflowTableInputs,
  scheduleTableInputs,
  userTableTriggers,
  userTableRowHistory,
  workshopRuns,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Delete a project and all FK-dependent children in safe order.
 * Returns true if the project existed and was deleted, false if not found.
 */
export function deleteProjectCascade(projectId: string): boolean {
  const existing = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();

  if (!existing) return false;

  // 1. Collect child IDs for nested FK chains
  const taskIds = db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .all()
    .map((r) => r.id);

  const workflowIds = db
    .select({ id: workflows.id })
    .from(workflows)
    .where(eq(workflows.projectId, projectId))
    .all()
    .map((r) => r.id);

  const conversationIds = db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.projectId, projectId))
    .all()
    .map((r) => r.id);

  const scanIds = db
    .select({ id: environmentScans.id })
    .from(environmentScans)
    .where(eq(environmentScans.projectId, projectId))
    .all()
    .map((r) => r.id);

  const checkpointIds = db
    .select({ id: environmentCheckpoints.id })
    .from(environmentCheckpoints)
    .where(eq(environmentCheckpoints.projectId, projectId))
    .all()
    .map((r) => r.id);

  // 2. Environment tables (deepest children first)
  if (checkpointIds.length > 0) {
    db.delete(environmentSyncOps)
      .where(inArray(environmentSyncOps.checkpointId, checkpointIds))
      .run();
    db.delete(environmentCheckpoints)
      .where(inArray(environmentCheckpoints.id, checkpointIds))
      .run();
  }
  if (scanIds.length > 0) {
    db.delete(environmentArtifacts)
      .where(inArray(environmentArtifacts.scanId, scanIds))
      .run();
    db.delete(environmentScans)
      .where(inArray(environmentScans.id, scanIds))
      .run();
  }

  // 3. Chat tables (messages before conversations)
  if (conversationIds.length > 0) {
    db.delete(chatMessages)
      .where(inArray(chatMessages.conversationId, conversationIds))
      .run();
    db.delete(conversations)
      .where(inArray(conversations.id, conversationIds))
      .run();
  }

  // 4. Usage ledger
  db.delete(usageLedger).where(eq(usageLedger.projectId, projectId)).run();

  // 5. Task children (logs, notifications, documents, learned context)
  if (taskIds.length > 0) {
    db.delete(agentLogs).where(inArray(agentLogs.taskId, taskIds)).run();
    db.delete(notifications)
      .where(inArray(notifications.taskId, taskIds))
      .run();
    db.delete(documents).where(inArray(documents.taskId, taskIds)).run();
    db.delete(learnedContext)
      .where(inArray(learnedContext.sourceTaskId, taskIds))
      .run();
  }

  // 6. Junction tables
  db.delete(projectDocumentDefaults).where(eq(projectDocumentDefaults.projectId, projectId)).run();

  // 6b. User-defined tables — cascade-delete children before parent
  const tableIds = db
    .select({ id: userTables.id })
    .from(userTables)
    .where(eq(userTables.projectId, projectId))
    .all()
    .map((r) => r.id);

  if (tableIds.length > 0) {
    // Junction tables first
    db.delete(tableDocumentInputs).where(inArray(tableDocumentInputs.tableId, tableIds)).run();
    db.delete(taskTableInputs).where(inArray(taskTableInputs.tableId, tableIds)).run();
    db.delete(workflowTableInputs).where(inArray(workflowTableInputs.tableId, tableIds)).run();
    db.delete(scheduleTableInputs).where(inArray(scheduleTableInputs.tableId, tableIds)).run();
    // Children
    db.delete(userTableRowHistory).where(inArray(userTableRowHistory.tableId, tableIds)).run();
    db.delete(userTableTriggers).where(inArray(userTableTriggers.tableId, tableIds)).run();
    db.delete(userTableImports).where(inArray(userTableImports.tableId, tableIds)).run();
    db.delete(userTableViews).where(inArray(userTableViews.tableId, tableIds)).run();
    db.delete(userTableRelationships).where(inArray(userTableRelationships.fromTableId, tableIds)).run();
    db.delete(userTableRows).where(inArray(userTableRows.tableId, tableIds)).run();
    db.delete(userTableColumns).where(inArray(userTableColumns.tableId, tableIds)).run();
    db.delete(userTables).where(inArray(userTables.id, tableIds)).run();
  }

  // 7. Direct project children
  db.delete(workshopRuns).where(eq(workshopRuns.projectId, projectId)).run();
  db.delete(documents).where(eq(documents.projectId, projectId)).run();
  db.delete(tasks).where(eq(tasks.projectId, projectId)).run();
  if (workflowIds.length > 0) {
    db.delete(workflows).where(inArray(workflows.id, workflowIds)).run();
  }
  db.delete(schedules).where(eq(schedules.projectId, projectId)).run();

  // 8. Finally delete the project
  db.delete(projects).where(eq(projects.id, projectId)).run();

  return true;
}
