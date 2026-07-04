import { db } from "@/lib/db";
import {
  projects,
  tasks,
  workflows,
  documents,
  agentLogs,
  notifications,
  schedules,
  conversations,
  chatMessages,
  learnedContext,
  views,
  profileTestResults,
  repoImports,
  agentMemory,
  agentMessages,
  channelConfigs,
  channelBindings,
  environmentScans,
  environmentArtifacts,
  environmentCheckpoints,
  environmentTemplates,
  workflowExecutionStats,
  scheduleFiringMetrics,
  userTableViews,
  userTableTriggers,
  userTableRelationships,
} from "@/lib/db/schema";
import { clearAllData } from "./clear";
import { createProjects } from "./seed-data/projects";
import { createTasks } from "./seed-data/tasks";
import { createWorkflows } from "./seed-data/workflows";
import { createDocuments } from "./seed-data/documents";
import { createLogs } from "./seed-data/logs";
import { createNotifications } from "./seed-data/notifications";
import { createSchedules } from "./seed-data/schedules";
import { upsertSampleProfiles } from "./seed-data/profiles";
import { processDocument } from "@/lib/documents/processor";
import { createUsageLedgerSeeds } from "./seed-data/usage-ledger";
import { recordUsageLedgerEntry } from "@/lib/usage/ledger";
import { createConversations } from "./seed-data/conversations";
import { createLearnedContext } from "./seed-data/learned-context";
import { createViews } from "./seed-data/views";
import { createProfileTestResults } from "./seed-data/profile-test-results";
import { createRepoImports } from "./seed-data/repo-imports";
import { createUserTables } from "./seed-data/user-tables";
import { createAgentMemory } from "./seed-data/agent-memory";
import { createAgentMessages } from "./seed-data/agent-messages";
import { createChannels } from "./seed-data/channels";
import { createEnvironment } from "./seed-data/environment";
import {
  createWorkflowStats,
  createScheduleFiringMetrics,
} from "./seed-data/workflow-stats";
import { createTableExtras } from "./seed-data/table-extras";
import { createDocumentPools } from "./seed-data/document-pools";
import { createTable, addRows } from "@/lib/data/tables";

/**
 * Clear all data, then seed with realistic sample data.
 * Returns counts of seeded entities.
 */
export async function seedSampleData() {
  // 1. Clear everything first
  clearAllData();

  // 2. Seed sample custom profiles used by the newer profiles/schedules flows
  const profileCount = upsertSampleProfiles();

  // 3. Insert projects
  const projectSeeds = createProjects();
  for (const p of projectSeeds) {
    db.insert(projects).values(p).run();
  }
  const projectIds = projectSeeds.map((p) => p.id);

  // 4. Insert workflows BEFORE tasks (tasks reference workflowId)
  const workflowSeeds = createWorkflows(projectIds);
  for (const w of workflowSeeds) {
    db.insert(workflows).values(w).run();
  }
  const workflowIds = workflowSeeds.map((w) => w.id);

  // 5. Insert schedules BEFORE tasks (tasks reference scheduleId)
  const scheduleSeeds = createSchedules(projectIds);
  for (const schedule of scheduleSeeds) {
    db.insert(schedules).values(schedule).run();
  }
  const scheduleIds = scheduleSeeds.map((s) => s.id);

  // 6. Insert tasks (with workflow/schedule/profile references)
  const taskSeeds = createTasks(projectIds, workflowIds, scheduleIds);
  for (const t of taskSeeds) {
    db.insert(tasks)
      .values({
        id: t.id,
        projectId: t.projectId,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        result: t.result,
        agentProfile: t.agentProfile,
        sourceType: t.sourceType,
        workflowId: t.workflowId,
        scheduleId: t.scheduleId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })
      .run();
  }
  const taskIds = taskSeeds.map((t) => t.id);

  // 7. Write document files + insert records
  const docSeeds = await createDocuments(projectIds, taskIds);
  for (const d of docSeeds) {
    db.insert(documents).values(d).run();
  }

  // 8. Process all documents (text extraction)
  await Promise.all(docSeeds.map((d) => processDocument(d.id)));

  // 9. Insert agent logs
  const completedTaskIds = taskSeeds
    .filter((t) => t.status === "completed")
    .map((t) => t.id);
  const failedTaskIds = taskSeeds
    .filter((t) => t.status === "failed")
    .map((t) => t.id);
  const runningTaskIds = taskSeeds
    .filter((t) => t.status === "running")
    .map((t) => t.id);

  const logSeeds = createLogs({
    completed: completedTaskIds,
    failed: failedTaskIds,
    running: runningTaskIds,
  });
  for (const l of logSeeds) {
    db.insert(agentLogs).values(l).run();
  }

  // 10. Insert notifications
  const notifSeeds = createNotifications(taskIds);
  for (const n of notifSeeds) {
    db.insert(notifications).values(n).run();
  }

  // 11. Insert normalized usage ledger rows for governance and analytics surfaces
  const usageSeeds = createUsageLedgerSeeds({
    tasks: taskSeeds,
    workflows: workflowSeeds,
    schedules: scheduleSeeds,
  });
  for (const seed of usageSeeds) {
    await recordUsageLedgerEntry(seed);
  }

  // 12. Insert conversations and chat messages
  const { conversations: convSeeds, messages: msgSeeds } =
    createConversations(projectIds);
  for (const c of convSeeds) {
    db.insert(conversations).values(c).run();
  }
  for (const m of msgSeeds) {
    db.insert(chatMessages).values(m).run();
  }

  // 13. Insert learned context entries
  const learnedContextSeeds = createLearnedContext(completedTaskIds);
  for (const lc of learnedContextSeeds) {
    db.insert(learnedContext).values(lc).run();
  }

  // 14. Insert saved views
  const viewSeeds = createViews();
  for (const v of viewSeeds) {
    db.insert(views).values(v).run();
  }

  // 15. Insert profile test results
  const testResultSeeds = createProfileTestResults();
  for (const tr of testResultSeeds) {
    db.insert(profileTestResults).values(tr).run();
  }

  // 16. Insert repo import records
  const repoImportSeeds = createRepoImports();
  for (const ri of repoImportSeeds) {
    db.insert(repoImports).values(ri).run();
  }

  // 17. Insert user-created tables with columns and rows
  const userTableSeeds = createUserTables(projectIds);
  let totalTableRows = 0;
  const tableIdByName = new Map<string, string>();
  const { listTables } = await import("@/lib/data/tables");
  for (const tableSeed of userTableSeeds) {
    await createTable({
      name: tableSeed.name,
      description: tableSeed.description,
      projectId: tableSeed.projectId,
      source: tableSeed.source,
      columns: tableSeed.columns.map((col, i) => ({
        name: col.name,
        displayName: col.displayName,
        dataType: col.dataType,
        position: i,
        required: col.required ?? false,
        config: col.config ?? undefined,
      })),
    });
    // createTable generates its own ID; retrieve it by name+project
    const tables = await listTables({ projectId: tableSeed.projectId });
    const created = tables.find((t) => t.name === tableSeed.name);
    if (created) {
      tableIdByName.set(tableSeed.name, created.id);
      if (tableSeed.rows.length > 0) {
        const { ids } = await addRows(
          created.id,
          tableSeed.rows.map((data) => ({ data }))
        );
        totalTableRows += ids.length;
      }
    }
  }

  // 18. Agent memory entries (fact/preference/pattern/outcome)
  const memorySeeds = createAgentMemory(completedTaskIds);
  for (const m of memorySeeds) {
    db.insert(agentMemory).values(m).run();
  }

  // 19. Inter-profile handoffs (pending/accepted/completed/expired mix)
  const messageSeeds = createAgentMessages(completedTaskIds, runningTaskIds);
  for (const msg of messageSeeds) {
    db.insert(agentMessages).values(msg).run();
  }

  // 20. Channel configs + bindings (multi-channel delivery / bidir chat)
  const conversationIds = convSeeds.map((c) => c.id);
  const { configs: channelConfigSeeds, bindings: channelBindingSeeds } =
    createChannels(conversationIds);
  for (const c of channelConfigSeeds) {
    db.insert(channelConfigs).values(c).run();
  }
  for (const b of channelBindingSeeds) {
    db.insert(channelBindings).values(b).run();
  }

  // 21. Environment scans + artifacts + checkpoints + templates
  const envSeeds = createEnvironment(projectIds);
  for (const s of envSeeds.scans) {
    db.insert(environmentScans).values(s).run();
  }
  for (const a of envSeeds.artifacts) {
    db.insert(environmentArtifacts).values(a).run();
  }
  for (const cp of envSeeds.checkpoints) {
    db.insert(environmentCheckpoints).values(cp).run();
  }
  for (const t of envSeeds.templates) {
    db.insert(environmentTemplates).values(t).run();
  }

  // 22. Workflow execution stats (rollups) + schedule firing metrics
  const workflowStatsSeeds = createWorkflowStats();
  for (const ws of workflowStatsSeeds) {
    db.insert(workflowExecutionStats).values(ws).run();
  }
  const firingMetricSeeds = createScheduleFiringMetrics(
    scheduleIds,
    completedTaskIds
  );
  for (const fm of firingMetricSeeds) {
    db.insert(scheduleFiringMetrics).values(fm).run();
  }

  // 23. User-table extras: views, triggers, relationships
  const tableExtras = createTableExtras();
  const now = new Date();
  let tableViewCount = 0;
  let tableTriggerCount = 0;
  let tableRelCount = 0;

  // Find workflow id by name for trigger actionConfig resolution
  const workflowIdByName = new Map<string, string>();
  for (const w of workflowSeeds) {
    workflowIdByName.set(w.name, w.id);
  }

  for (const v of tableExtras.views) {
    const tableId = tableIdByName.get(v.tableName);
    if (!tableId) continue;
    db.insert(userTableViews)
      .values({
        id: crypto.randomUUID(),
        tableId,
        name: v.name,
        type: v.type,
        config: JSON.stringify(v.config),
        isDefault: v.isDefault,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      })
      .run();
    tableViewCount++;
  }

  for (const t of tableExtras.triggers) {
    const tableId = tableIdByName.get(t.tableName);
    if (!tableId) continue;
    // Resolve workflowName → workflowId in action config
    const resolvedActionConfig: Record<string, unknown> = { ...t.actionConfig };
    if (
      t.actionType === "run_workflow" &&
      typeof resolvedActionConfig.workflowName === "string"
    ) {
      const wfId = workflowIdByName.get(
        resolvedActionConfig.workflowName as string
      );
      if (wfId) resolvedActionConfig.workflowId = wfId;
      delete resolvedActionConfig.workflowName;
    }
    db.insert(userTableTriggers)
      .values({
        id: crypto.randomUUID(),
        tableId,
        name: t.name,
        triggerEvent: t.triggerEvent,
        condition: t.condition ? JSON.stringify(t.condition) : null,
        actionType: t.actionType,
        actionConfig: JSON.stringify(resolvedActionConfig),
        status: t.status,
        fireCount: t.fireCount,
        lastFiredAt: t.lastFiredAt,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })
      .run();
    tableTriggerCount++;
  }

  for (const r of tableExtras.relationships) {
    const fromId = tableIdByName.get(r.fromTableName);
    const toId = tableIdByName.get(r.toTableName);
    if (!fromId || !toId) continue;
    db.insert(userTableRelationships)
      .values({
        id: crypto.randomUUID(),
        fromTableId: fromId,
        fromColumn: r.fromColumn,
        toTableId: toId,
        toColumn: r.toColumn,
        relationshipType: r.relationshipType,
        config: r.config ? JSON.stringify(r.config) : null,
        createdAt: r.createdAt,
      })
      .run();
    tableRelCount++;
  }

  // 24. Document + table input pools (junction wiring for context surfaces)
  const tableIdList = Array.from(tableIdByName.values());
  const documentIdList = docSeeds.map((d) => d.id);
  const pools = await createDocumentPools({
    projectIds,
    workflowIds,
    scheduleIds,
    taskIds,
    documentIds: documentIdList,
    tableIds: tableIdList,
  });

  // 25. Pack-aware seed — repopulate every installed pack's tables (BUG-6).
  // clearAllData() wiped the pack tables the customer just installed; re-apply
  // each pack's bundled seed data via the idempotent install path so e.g. the
  // Agency Pro ledger cockpit reads non-zero instead of "No transactions yet".
  const { reseedInstalledPacks } = await import(
    "./seed-data/installed-packs"
  );
  const packReseeds = await reseedInstalledPacks();
  const packTablesSeeded = packReseeds.reduce(
    (sum, p) => sum + p.tablesCreated,
    0
  );
  const packRowsSeeded = packReseeds.reduce((sum, p) => sum + p.rowsSeeded, 0);
  const packReseedErrors = packReseeds.filter((p) => p.error);

  // Quiet the unused-`now` flag; the helpers above reuse Date.now() inline.
  void now;

  return {
    packsReseeded: packReseeds.length,
    packTablesSeeded,
    packRowsSeeded,
    // Surface any per-pack failures (unlicensed premium pack, bad manifest)
    // rather than swallowing them — the route/UI can show what didn't seed.
    packReseedErrors: packReseedErrors.map((p) => ({
      packId: p.packId,
      error: p.error as string,
    })),
    profiles: profileCount,
    projects: projectSeeds.length,
    tasks: taskSeeds.length,
    workflows: workflowSeeds.length,
    schedules: scheduleSeeds.length,
    documents: docSeeds.length,
    agentLogs: logSeeds.length,
    notifications: notifSeeds.length,
    usageLedger: usageSeeds.length,
    conversations: convSeeds.length,
    chatMessages: msgSeeds.length,
    learnedContext: learnedContextSeeds.length,
    views: viewSeeds.length,
    profileTestResults: testResultSeeds.length,
    repoImports: repoImportSeeds.length,
    userTables: userTableSeeds.length,
    userTableRows: totalTableRows,
    agentMemory: memorySeeds.length,
    agentMessages: messageSeeds.length,
    channelConfigs: channelConfigSeeds.length,
    channelBindings: channelBindingSeeds.length,
    environmentScans: envSeeds.scans.length,
    environmentArtifacts: envSeeds.artifacts.length,
    environmentCheckpoints: envSeeds.checkpoints.length,
    environmentTemplates: envSeeds.templates.length,
    workflowExecutionStats: workflowStatsSeeds.length,
    scheduleFiringMetrics: firingMetricSeeds.length,
    tableViews: tableViewCount,
    tableTriggers: tableTriggerCount,
    tableRelationships: tableRelCount,
    projectDocumentDefaults: pools.projectDefaults,
    workflowDocumentInputs: pools.workflowInputs,
    scheduleDocumentInputs: pools.scheduleInputs,
    tableDocumentInputs: pools.tableDocInputs,
    workflowTableInputs: pools.workflowTableInputs,
    scheduleTableInputs: pools.scheduleTableInputs,
    taskTableInputs: pools.taskTableInputs,
  };
}
