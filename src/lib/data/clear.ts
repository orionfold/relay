import { db } from "@/lib/db";
import {
  agentLogs,
  notifications,
  documents,
  learnedContext,
  agentMemory,
  tasks,
  workflows,
  schedules,
  projects,
  customers,
  usageLedger,
  views,
  environmentSyncOps,
  environmentCheckpoints,
  environmentArtifacts,
  environmentScans,
  environmentTemplates,
  chatMessages,
  conversations,
  profileTestResults,
  repoImports,
  channelBindings,
  channelConfigs,
  agentMessages,
  workflowDocumentInputs,
  scheduleDocumentInputs,
  projectDocumentDefaults,
  userTables,
  userTableColumns,
  userTableRows,
  userTableViews,
  userTableRelationships,
  userTableImports,
  userTableTemplates,
  userTableTriggers,
  userTableRowHistory,
  tableDocumentInputs,
  taskTableInputs,
  workflowTableInputs,
  scheduleTableInputs,
  workflowExecutionStats,
  scheduleFiringMetrics,
  operationsReceipts,
  workflowReceiptRuns,
  deployments,
  publishTargets,
} from "@/lib/db/schema";
import { readdirSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { dataDir as getDataDir } from "@/lib/config/env";
import { clearSampleProfiles } from "./seed-data/profiles";

const dataDir = getDataDir();
const uploadsDir = join(dataDir, "uploads");
const screenshotsDir = join(dataDir, "screenshots");

/**
 * Wipe all data tables (FK-safe order) and uploaded files.
 * Preserves the settings table (auth config) — clearing operational
 * data should never silently reset user auth preferences.
 */
export function clearAllData() {
  const sampleProfilesDeleted = clearSampleProfiles();

  const step = (label: string, fn: () => number) => {
    try {
      return fn();
    } catch (e) {
      console.error(`[clear] failed at step "${label}":`, e);
      throw e;
    }
  };

  // Delete in FK-safe order: children before parents
  // Environment tables (sync_ops → checkpoints → artifacts → scans)
  const envSyncOpsDeleted = step("environmentSyncOps", () => db.delete(environmentSyncOps).run().changes);
  const envCheckpointsDeleted = step("environmentCheckpoints", () => db.delete(environmentCheckpoints).run().changes);
  const envArtifactsDeleted = step("environmentArtifacts", () => db.delete(environmentArtifacts).run().changes);
  const envScansDeleted = step("environmentScans", () => db.delete(environmentScans).run().changes);
  const envTemplatesDeleted = step("environmentTemplates", () => db.delete(environmentTemplates).run().changes);

  // Document junction tables — delete before documents (they reference documents).
  // Also referenced by projects/workflows/schedules/tables, deleted later.
  const workflowDocInputsDeleted = step("workflowDocumentInputs", () => db.delete(workflowDocumentInputs).run().changes);
  const scheduleDocInputsDeleted = step("scheduleDocumentInputs", () => db.delete(scheduleDocumentInputs).run().changes);
  const projectDocDefaultsDeleted = step("projectDocumentDefaults", () => db.delete(projectDocumentDefaults).run().changes);
  // tableDocumentInputs + userTableImports also reference documents — must
  // delete BEFORE documents. Previously they were sequenced with the other
  // table-junction cleanup, which broke once tableDocumentInputs had rows.
  const tableDocInputsDeleted = step("tableDocumentInputs", () => db.delete(tableDocumentInputs).run().changes);
  const userTableImportsDeleted = step("userTableImports", () => db.delete(userTableImports).run().changes);
  // Documents reference conversations (documents.conversation_id) — must delete
  // before conversations to avoid FK violation when chat-attached documents exist.
  const documentsDeleted = step("documents", () => db.delete(documents).run().changes);

  // Chat tables: channel_bindings + chat_messages + documents all reference
  // conversations — delete them before conversations.
  const channelBindingsDeleted = step("channelBindings", () => db.delete(channelBindings).run().changes);
  const chatMessagesDeleted = step("chatMessages", () => db.delete(chatMessages).run().changes);
  const conversationsDeleted = step("conversations", () => db.delete(conversations).run().changes);

  // Agent messages reference tasks — delete before tasks
  const agentMessagesDeleted = step("agentMessages", () => db.delete(agentMessages).run().changes);
  const channelConfigsDeleted = step("channelConfigs", () => db.delete(channelConfigs).run().changes);

  // deployments references publish_targets — delete children first
  const deploymentsDeleted = step("deployments", () => db.delete(deployments).run().changes);
  const publishTargetsDeleted = step("publishTargets", () => db.delete(publishTargets).run().changes);

  // Snapshots are intentionally preserved — they are backups, not working data

  const repoImportsDeleted = step("repoImports", () => db.delete(repoImports).run().changes);
  const profileTestResultsDeleted = step("profileTestResults", () => db.delete(profileTestResults).run().changes);
  const viewsDeleted = step("views", () => db.delete(views).run().changes);
  const usageLedgerDeleted = step("usageLedger", () => db.delete(usageLedger).run().changes);
  const logsDeleted = step("agentLogs", () => db.delete(agentLogs).run().changes);
  const notificationsDeleted = step("notifications", () => db.delete(notifications).run().changes);

  // Table junction tables — delete before user_tables, tasks, workflows, schedules
  // (tableDocumentInputs + userTableImports already deleted above, pre-documents)
  const taskTableInputsDeleted = step("taskTableInputs", () => db.delete(taskTableInputs).run().changes);
  const workflowTableInputsDeleted = step("workflowTableInputs", () => db.delete(workflowTableInputs).run().changes);
  const scheduleTableInputsDeleted = step("scheduleTableInputs", () => db.delete(scheduleTableInputs).run().changes);

  // Table children — delete before user_tables
  const userTableViewsDeleted = step("userTableViews", () => db.delete(userTableViews).run().changes);
  const userTableRelationshipsDeleted = step("userTableRelationships", () => db.delete(userTableRelationships).run().changes);
  const userTableRowsDeleted = step("userTableRows", () => db.delete(userTableRows).run().changes);
  const userTableRowHistoryDeleted = step("userTableRowHistory", () => db.delete(userTableRowHistory).run().changes);
  const userTableTriggersDeleted = step("userTableTriggers", () => db.delete(userTableTriggers).run().changes);
  const userTableColumnsDeleted = step("userTableColumns", () => db.delete(userTableColumns).run().changes);
  const userTablesDeleted = step("userTables", () => db.delete(userTables).run().changes);
  const userTableTemplatesDeleted = step("userTableTemplates", () => db.delete(userTableTemplates).run().changes);

  const agentMemoryDeleted = step("agentMemory", () => db.delete(agentMemory).run().changes);
  const learnedContextDeleted = step("learnedContext", () => db.delete(learnedContext).run().changes);
  const executionStatsDeleted = step("workflowExecutionStats", () => db.delete(workflowExecutionStats).run().changes);
  // scheduleFiringMetrics references BOTH tasks and schedules — must delete
  // before either. Previously it was sequenced between tasks and schedules,
  // which hit a FOREIGN KEY error on re-seed once any firing metrics existed.
  const scheduleFiringMetricsDeleted = step("scheduleFiringMetrics", () => db.delete(scheduleFiringMetrics).run().changes);
  // Receipt rows retain source references for diagnostics, so clear them before
  // the task/schedule/workflow rows they describe. Run markers belong to a
  // workflow and must likewise be removed before workflows.
  const operationsReceiptsDeleted = step("operationsReceipts", () => db.delete(operationsReceipts).run().changes);
  const workflowReceiptRunsDeleted = step("workflowReceiptRuns", () => db.delete(workflowReceiptRuns).run().changes);
  const tasksDeleted = step("tasks", () => db.delete(tasks).run().changes);
  const workflowsDeleted = step("workflows", () => db.delete(workflows).run().changes);
  const schedulesDeleted = step("schedules", () => db.delete(schedules).run().changes);
  const projectsDeleted = step("projects", () => db.delete(projects).run().changes);
  // customers is referenced by projects.customerId + usageLedger.customerId — delete
  // after both (usageLedger line above, projects just above) to stay FK-safe.
  const customersDeleted = step("customers", () => db.delete(customers).run().changes);

  // Wipe uploaded files
  let filesDeleted = 0;
  mkdirSync(uploadsDir, { recursive: true });
  try {
    for (const file of readdirSync(uploadsDir)) {
      unlinkSync(join(uploadsDir, file));
      filesDeleted++;
    }
  } catch {
    // Directory may not exist yet — that's fine
  }

  // Wipe screenshot files
  let screenshotsDeleted = 0;
  try {
    mkdirSync(screenshotsDir, { recursive: true });
    for (const file of readdirSync(screenshotsDir)) {
      unlinkSync(join(screenshotsDir, file));
      screenshotsDeleted++;
    }
  } catch {
    // Directory may not exist yet — that's fine
  }

  return {
    sampleProfiles: sampleProfilesDeleted,
    views: viewsDeleted,
    customers: customersDeleted,
    projects: projectsDeleted,
    tasks: tasksDeleted,
    workflows: workflowsDeleted,
    scheduleFiringMetrics: scheduleFiringMetricsDeleted,
    schedules: schedulesDeleted,
    usageLedger: usageLedgerDeleted,
    agentLogs: logsDeleted,
    notifications: notificationsDeleted,
    documents: documentsDeleted,
    agentMemory: agentMemoryDeleted,
    learnedContext: learnedContextDeleted,
    environmentSyncOps: envSyncOpsDeleted,
    environmentCheckpoints: envCheckpointsDeleted,
    environmentArtifacts: envArtifactsDeleted,
    environmentScans: envScansDeleted,
    environmentTemplates: envTemplatesDeleted,
    chatMessages: chatMessagesDeleted,
    conversations: conversationsDeleted,
    repoImports: repoImportsDeleted,
    profileTestResults: profileTestResultsDeleted,
    agentMessages: agentMessagesDeleted,
    channelBindings: channelBindingsDeleted,
    channelConfigs: channelConfigsDeleted,
    deployments: deploymentsDeleted,
    publishTargets: publishTargetsDeleted,
    workflowDocumentInputs: workflowDocInputsDeleted,
    scheduleDocumentInputs: scheduleDocInputsDeleted,
    projectDocumentDefaults: projectDocDefaultsDeleted,
    userTables: userTablesDeleted,
    userTableColumns: userTableColumnsDeleted,
    userTableRows: userTableRowsDeleted,
    userTableViews: userTableViewsDeleted,
    userTableRelationships: userTableRelationshipsDeleted,
    userTableImports: userTableImportsDeleted,
    userTableTemplates: userTableTemplatesDeleted,
    userTableTriggers: userTableTriggersDeleted,
    userTableRowHistory: userTableRowHistoryDeleted,
    tableDocumentInputs: tableDocInputsDeleted,
    taskTableInputs: taskTableInputsDeleted,
    workflowTableInputs: workflowTableInputsDeleted,
    scheduleTableInputs: scheduleTableInputsDeleted,
    files: filesDeleted,
    screenshots: screenshotsDeleted,
    workflowExecutionStats: executionStatsDeleted,
    operationsReceipts: operationsReceiptsDeleted,
    workflowReceiptRuns: workflowReceiptRunsDeleted,
  };
}
