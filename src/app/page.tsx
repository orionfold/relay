import Link from "next/link";
import { db } from "@/lib/db";
import {
  tasks,
  projects,
  agentLogs,
  notifications,
  workflows,
  documents,
  usageLedger,
} from "@/lib/db/schema";
import { eq, count, and, desc, inArray, sql } from "drizzle-orm";
import { parseWorkflowState } from "@/lib/workflows/engine";
import { PriorityQueue } from "@/components/dashboard/priority-queue";
import type { PriorityTask } from "@/components/dashboard/priority-queue";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import type { ActivityEntry } from "@/components/dashboard/activity-feed";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import type { RecentProject } from "@/components/dashboard/recent-projects";
import { WelcomeLanding } from "@/components/dashboard/welcome-landing";
import { ActivationChecklist } from "@/components/onboarding/activation-checklist";
import { listStarters } from "@/lib/apps/starters";
import { getAgentActivityByHour } from "@/lib/queries/chart-data";
import { listApps, type AppSummary } from "@/lib/apps/registry";
import { getRuntimeSetupStates } from "@/lib/settings/runtime-setup";
import { getDashboardPreferences } from "@/lib/settings/dashboard";
import {
  DASHBOARD_MODULES,
  arrangeDashboardModules,
  hiddenUrgentCount,
  rankDashboardModules,
  type DashboardModuleDefinition,
  type DashboardModuleId,
  type DashboardSignals,
} from "@/lib/dashboard/modules";
import { DashboardModuleCard } from "@/components/dashboard/dashboard-module-card";
import { InstalledAppsModule } from "@/components/dashboard/installed-apps-module";
import {
  RecentOutputsModule,
  type RecentOutput,
} from "@/components/dashboard/recent-outputs-module";
import {
  CostHealthModule,
  RuntimeHealthModule,
} from "@/components/dashboard/cost-health-module";
import { WorkshopProgressModule } from "@/components/dashboard/workshop-progress-module";
import { getCurrentWorkshopRun } from "@/lib/workshop/runs";
import { DashboardMasonry } from "@/components/dashboard/dashboard-masonry";
import { AlertTriangle } from "lucide-react";
import { RecentFeaturesModule } from "@/components/dashboard/recent-features-module";
import { RECENT_FEATURES } from "@/lib/dashboard/recent-features";

export const dynamic = "force-dynamic";

interface LoadResult<T> {
  data: T;
  error: string | null;
}

async function loadModule<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    console.error(`[dashboard] ${label} loader failed:`, error);
    return {
      data: fallback,
      error: `${label} could not be loaded`,
    };
  }
}

export default async function HomePage() {
  const [
    attention,
    activity,
    projectSummary,
    appsResult,
    outputsResult,
    costResult,
    healthResult,
    preferencesResult,
    workshopResult,
  ] = await Promise.all([
    loadModule(
      "attention",
      async () => {
        const [
          [running],
          [failed],
          [completed],
          [awaiting],
          [totalTasks],
          [totalWorkflows],
          priorityTasks,
          activeWorkflows,
          [activeWorkflowCount],
          allProjects,
        ] = await Promise.all([
          db.select({ count: count() }).from(tasks).where(eq(tasks.status, "running")),
          db.select({ count: count() }).from(tasks).where(eq(tasks.status, "failed")),
          db.select({ count: count() }).from(tasks).where(eq(tasks.status, "completed")),
          db.select({ count: count() }).from(notifications).where(
            and(
              eq(notifications.read, false),
              inArray(notifications.type, [
                "permission_required",
                "agent_message",
                "budget_alert",
              ])
            )
          ),
          db.select({ count: count() }).from(tasks),
          db.select({ count: count() }).from(workflows),
          db
            .select()
            .from(tasks)
            .where(inArray(tasks.status, ["failed", "running", "queued"]))
            .orderBy(tasks.priority, desc(tasks.updatedAt))
            .limit(8),
          db.select().from(workflows).orderBy(desc(workflows.updatedAt)).limit(8),
          db
            .select({ count: count() })
            .from(workflows)
            .where(eq(workflows.status, "active")),
          db
            .select({ id: projects.id, name: projects.name })
            .from(projects)
            .orderBy(projects.name),
        ]);
        return {
          running,
          failed,
          completed,
          awaiting,
          totalTasks,
          totalWorkflows,
          priorityTasks,
          activeWorkflows,
          activeWorkflowCount,
          allProjects,
        };
      },
      {
        running: { count: 0 },
        failed: { count: 0 },
        completed: { count: 0 },
        awaiting: { count: 0 },
        totalTasks: { count: 0 },
        totalWorkflows: { count: 0 },
        priorityTasks: [],
        activeWorkflows: [],
        activeWorkflowCount: { count: 0 },
        allProjects: [],
      }
    ),
    loadModule(
      "activity",
      async () => {
        const [recentLogs, hourly] = await Promise.all([
          db.select().from(agentLogs).orderBy(desc(agentLogs.timestamp)).limit(6),
          getAgentActivityByHour(),
        ]);
        const taskIds = [
          ...new Set(recentLogs.filter((log) => log.taskId).map((log) => log.taskId!)),
        ];
        const logTasks =
          taskIds.length > 0
            ? await db
                .select({ id: tasks.id, title: tasks.title })
                .from(tasks)
                .where(inArray(tasks.id, taskIds))
            : [];
        return { recentLogs, hourly, logTasks };
      },
      { recentLogs: [], hourly: [], logTasks: [] }
    ),
    loadModule(
      "projects",
      async () => {
        const recent = await db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(eq(projects.status, "active"))
          .orderBy(desc(projects.updatedAt))
          .limit(3);
        return Promise.all(
          recent.map(async (project) => {
            const [[total], [completed]] = await Promise.all([
              db
                .select({ count: count() })
                .from(tasks)
                .where(eq(tasks.projectId, project.id)),
              db
                .select({ count: count() })
                .from(tasks)
                .where(
                  and(
                    eq(tasks.projectId, project.id),
                    eq(tasks.status, "completed")
                  )
                ),
            ]);
            return {
              id: project.id,
              name: project.name,
              totalTasks: total.count,
              completedTasks: completed.count,
            };
          })
        );
      },
      [] as RecentProject[]
    ),
    loadModule(
      "packs",
      async () => listApps(),
      [] as AppSummary[]
    ),
    loadModule(
      "documents",
      async () => {
        const rows = await db
          .select({
            id: documents.id,
            name: documents.originalName,
            status: documents.status,
            createdAt: documents.createdAt,
          })
          .from(documents)
          .where(eq(documents.direction, "output"))
          .orderBy(desc(documents.createdAt))
          .limit(5);
        return rows.map(
          (row): RecentOutput => ({
            ...row,
            createdAt: row.createdAt.toISOString(),
          })
        );
      },
      [] as RecentOutput[]
    ),
    loadModule(
      "cost",
      async () => {
        const [row] = await db
          .select({
            costMicros: sql<number>`coalesce(sum(${usageLedger.costMicros}), 0)`,
            runs: count(),
            unknownPricingRuns: sql<number>`coalesce(sum(case when ${usageLedger.status} = 'unknown_pricing' then 1 else 0 end), 0)`,
          })
          .from(usageLedger);
        return row;
      },
      { costMicros: 0, runs: 0, unknownPricingRuns: 0 }
    ),
    loadModule(
      "health",
      async () => {
        const states = await getRuntimeSetupStates();
        const values = Object.values(states);
        return {
          configured: values.filter((state) => state.configured).length,
          unconfigured: values.filter((state) => !state.configured).length,
        };
      },
      { configured: 0, unconfigured: 0 }
    ),
    loadModule(
      "preferences",
      getDashboardPreferences,
      {
        version: 1,
        smartOrdering: true,
        visible: {},
      } as const
    ),
    loadModule("workshop", getCurrentWorkshopRun, null),
  ]);

  const {
    running,
    failed,
    awaiting,
    totalTasks,
    totalWorkflows,
    priorityTasks,
    activeWorkflows,
    activeWorkflowCount,
    allProjects,
  } = attention.data;

  const isFreshInstance =
    totalTasks.count === 0 &&
    totalWorkflows.count === 0 &&
    appsResult.data.length === 0 &&
    outputsResult.data.length === 0;

  if (isFreshInstance) {
    // listStarters reads YAML files from disk synchronously — only loaded on
    // the welcome path so we don't pay the read on every dashboard hit.
    const starters = listStarters();
    return (
      <div className="bg-background min-h-screen">
        <div className="surface-page-shell min-h-screen p-5 sm:p-6 lg:p-7 space-y-6">
          <WelcomeLanding starters={starters} />
        </div>
      </div>
    );
  }

  // Build project name lookup for priority tasks
  const projectMap = new Map(allProjects.map((p) => [p.id, p.name]));

  // Serialize priority tasks (no more workflow linkage via parent task)
  const serializedPriorityTasks: PriorityTask[] = priorityTasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    projectName: t.projectId ? projectMap.get(t.projectId) ?? undefined : undefined,
  }));

  // Build workflow priority items directly
  const workflowPriorityItems: PriorityTask[] = activeWorkflows.map((w) => {
    let workflowProgress: PriorityTask["workflowProgress"];

    try {
      const { definition: def, state } = parseWorkflowState(w.definition);
      if (state && def.steps) {
        const completed = state.stepStates.filter((s) => s.status === "completed").length;
        const running = state.stepStates.find((s) => s.status === "running");
        const runningStep = running
          ? def.steps.find((step) => step.id === running.stepId)
          : undefined;
        workflowProgress = {
          current: completed,
          total: def.steps.length,
          currentStepName: runningStep?.name,
          workflowId: w.id,
          workflowStatus: w.status,
        };
      }
    } catch { /* skip parse errors */ }

    return {
      id: w.id,
      title: w.name,
      status: w.status,
      priority: 1, // Workflows always high priority in the attention queue
      projectName: w.projectId ? projectMap.get(w.projectId) ?? undefined : undefined,
      workflowProgress,
      isWorkflow: true,
    };
  });

  // Urgency ranking: actionable items surface first
  const urgencyRank: Record<string, number> = {
    failed: 0, running: 1, active: 1, queued: 2, paused: 3, draft: 4, completed: 5,
  };

  // Merge, sort by urgency, and keep the dashboard queue compact.
  const allPriorityItems = [...workflowPriorityItems, ...serializedPriorityTasks]
    .sort((a, b) => (urgencyRank[a.status] ?? 6) - (urgencyRank[b.status] ?? 6))
    .slice(0, 5);

  // Get task titles for log entries
  const taskTitleMap = new Map(activity.data.logTasks.map((task) => [task.id, task.title]));

  const serializedLogs: ActivityEntry[] = activity.data.recentLogs.map((l) => ({
    id: l.id,
    event: l.event,
    payload: l.payload,
    timestamp: l.timestamp.toISOString(),
    taskTitle: l.taskId ? taskTitleMap.get(l.taskId) ?? undefined : undefined,
  }));

  const recentActivityAt = activity.data.recentLogs[0]?.timestamp?.getTime() ?? null;
  const signals: DashboardSignals = {
    attention: {
      urgentCount: failed.count + awaiting.count,
      activeCount: running.count + activeWorkflowCount.count,
      failureCount: failed.count,
      recentAt: priorityTasks[0]?.updatedAt?.getTime() ?? null,
    },
    activity: {
      activeCount: running.count + activeWorkflowCount.count,
      recentAt: recentActivityAt,
    },
    packs: {
      relevanceCount: appsResult.data.length,
      recentAt: appsResult.data[0]?.createdAt ?? null,
    },
    projects: { relevanceCount: projectSummary.data.length },
    documents: {
      relevanceCount: outputsResult.data.length,
      recentAt: outputsResult.data[0]
        ? new Date(outputsResult.data[0].createdAt).getTime()
        : null,
    },
    features: {
      relevanceCount: RECENT_FEATURES.length,
      recentAt: new Date(RECENT_FEATURES[0]?.launchedAt ?? 0).getTime(),
    },
    costs: {
      failureCount: costResult.data.unknownPricingRuns > 0 ? 1 : 0,
      relevanceCount: costResult.data.runs,
    },
    health: {
      failureCount: healthResult.error ? 1 : 0,
      relevanceCount: healthResult.data.configured,
    },
    quickActions: {},
    workshop: {
      eligible: Boolean(workshopResult.data),
      urgentCount:
        workshopResult.data?.checkpoints.filter(
          (checkpoint) => checkpoint.status === "failed"
        ).length ?? 0,
      activeCount:
        workshopResult.data &&
        !["completed", "at_risk"].includes(workshopResult.data.status)
          ? 1
          : 0,
      recentAt: workshopResult.data
        ? new Date(workshopResult.data.updatedAt).getTime()
        : null,
    },
  };
  const modules = arrangeDashboardModules(
    rankDashboardModules(preferencesResult.data, signals)
  );
  const hiddenUrgent = hiddenUrgentCount(preferencesResult.data, signals);
  const moduleById = new Map(
    DASHBOARD_MODULES.map((definition) => [definition.id, definition])
  );

  const moduleError = (id: DashboardModuleId): string | null => {
    if (id === "attention") return attention.error;
    if (id === "activity") return activity.error;
    if (id === "packs") return appsResult.error;
    if (id === "projects") return projectSummary.error;
    if (id === "documents") return outputsResult.error;
    if (id === "costs") return costResult.error;
    if (id === "health") return healthResult.error;
    if (id === "workshop") return workshopResult.error;
    return null;
  };

  const renderModule = (definition: DashboardModuleDefinition) => {
    const error = moduleError(definition.id);
    if (error) {
      return (
        <DashboardModuleCard
          key={definition.id}
          definition={definition}
          error={error}
        >
          {null}
        </DashboardModuleCard>
      );
    }
    switch (definition.id) {
      case "attention":
        return (
          <DashboardModuleCard key={definition.id} definition={definition}>
            <PriorityQueue tasks={allPriorityItems} />
          </DashboardModuleCard>
        );
      case "activity":
        return (
          <DashboardModuleCard key={definition.id} definition={definition}>
            <ActivityFeed
              entries={serializedLogs}
              hourlyActivity={activity.data.hourly}
            />
          </DashboardModuleCard>
        );
      case "packs":
        return (
          <DashboardModuleCard key={definition.id} definition={definition}>
            <InstalledAppsModule apps={appsResult.data} />
          </DashboardModuleCard>
        );
      case "projects":
        return (
          <DashboardModuleCard key={definition.id} definition={definition}>
            <RecentProjects projects={projectSummary.data} />
          </DashboardModuleCard>
        );
      case "documents":
        return (
          <DashboardModuleCard key={definition.id} definition={definition}>
            <RecentOutputsModule outputs={outputsResult.data} />
          </DashboardModuleCard>
        );
      case "features":
        return (
          <DashboardModuleCard key={definition.id} definition={definition}>
            <RecentFeaturesModule features={RECENT_FEATURES} />
          </DashboardModuleCard>
        );
      case "costs":
        return (
          <DashboardModuleCard key={definition.id} definition={definition}>
            <CostHealthModule {...costResult.data} />
          </DashboardModuleCard>
        );
      case "health":
        return (
          <DashboardModuleCard key={definition.id} definition={definition}>
            <RuntimeHealthModule {...healthResult.data} />
          </DashboardModuleCard>
        );
      case "quickActions":
        return (
          <DashboardModuleCard key={definition.id} definition={definition}>
            <ActivationChecklist />
          </DashboardModuleCard>
        );
      case "workshop":
        return workshopResult.data ? (
          <DashboardModuleCard key={definition.id} definition={definition}>
            <WorkshopProgressModule run={workshopResult.data} />
          </DashboardModuleCard>
        ) : null;
    }
  };

  return (
    <div className="bg-background min-h-screen">
      <div className="surface-page-shell min-h-screen p-4 sm:p-5">
        {hiddenUrgent > 0 && (
          <div
            role="status"
            className="surface-card-muted mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
          >
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <AlertTriangle
                className="h-4 w-4 shrink-0 text-status-warning"
                aria-hidden="true"
              />
              <span className="truncate">
                {hiddenUrgent} unresolved item{hiddenUrgent === 1 ? "" : "s"} exist
                in hidden dashboard modules.
              </span>
            </div>
            <Link
              href="/settings#settings-dashboard"
              className="shrink-0 text-xs text-primary underline underline-offset-2"
            >
              Review modules
            </Link>
          </div>
        )}
        <DashboardMasonry>
          {modules.map((module) =>
            renderModule(moduleById.get(module.id) ?? module)
          )}
        </DashboardMasonry>
      </div>
    </div>
  );
}
