import { db } from "@/lib/db";
import { tasks, projects, agentLogs, notifications, workflows } from "@/lib/db/schema";
import { eq, count, and, desc, inArray } from "drizzle-orm";
import { parseWorkflowState } from "@/lib/workflows/engine";
import { Greeting } from "@/components/dashboard/greeting";
import { PriorityQueue } from "@/components/dashboard/priority-queue";
import type { PriorityTask } from "@/components/dashboard/priority-queue";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import type { ActivityEntry } from "@/components/dashboard/activity-feed";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import type { RecentProject } from "@/components/dashboard/recent-projects";
import { WelcomeLanding } from "@/components/dashboard/welcome-landing";
import { ActivationChecklist } from "@/components/onboarding/activation-checklist";
import { listStarters } from "@/lib/apps/starters";
import { getAgentActivityByHour } from "@/lib/queries/chart-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Run all DB queries in parallel
  const [
    [runningResult],
    [failedResult],
    [completedAllTimeResult],
    [awaitingResult],
    priorityTasks,
    activeWorkflows,
    [activeWorkflowCountResult],
    recentLogs,
    allProjects,
    recentActiveProjects,
    agentActivityByHour,
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
    // Priority queue: failed + running tasks, sorted by priority
    db.select().from(tasks).where(
      inArray(tasks.status, ["failed", "running", "queued"])
    ).orderBy(tasks.priority, desc(tasks.updatedAt)).limit(8),
    // All workflows for priority queue (match kanban board behavior)
    db.select().from(workflows).orderBy(desc(workflows.updatedAt)).limit(8),
    // Count active workflows for stats
    db.select({ count: count() }).from(workflows).where(eq(workflows.status, "active")),
    // Recent agent logs
    db.select().from(agentLogs).orderBy(desc(agentLogs.timestamp)).limit(6),
    // All projects for quick actions
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(projects.name),
    // Recent active projects with task counts
    db.select({
      id: projects.id,
      name: projects.name,
    }).from(projects)
      .where(eq(projects.status, "active"))
      .orderBy(desc(projects.updatedAt))
      .limit(3),
    // 24h agent activity for the dashboard ActivityFeed.
    getAgentActivityByHour(),
  ]);

  // Fresh instance detection: show welcome landing if no tasks or workflows exist
  const isFreshInstance =
    completedAllTimeResult.count === 0 &&
    runningResult.count === 0 &&
    failedResult.count === 0 &&
    activeWorkflowCountResult.count === 0;

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

  // Merge, sort by urgency, and limit to 8 items
  const allPriorityItems = [...workflowPriorityItems, ...serializedPriorityTasks]
    .sort((a, b) => (urgencyRank[a.status] ?? 6) - (urgencyRank[b.status] ?? 6))
    .slice(0, 8);

  // Get task titles for log entries
  const logTaskIds = [...new Set(recentLogs.filter((l) => l.taskId).map((l) => l.taskId!))];
  const logTasks = logTaskIds.length > 0
    ? await db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(inArray(tasks.id, logTaskIds))
    : [];
  const taskTitleMap = new Map(logTasks.map((t) => [t.id, t.title]));

  const serializedLogs: ActivityEntry[] = recentLogs.map((l) => ({
    id: l.id,
    event: l.event,
    payload: l.payload,
    timestamp: l.timestamp.toISOString(),
    taskTitle: l.taskId ? taskTitleMap.get(l.taskId) ?? undefined : undefined,
  }));

  // Get task counts per project for recent projects
  const recentProjectData: RecentProject[] = await Promise.all(
    recentActiveProjects.map(async (p) => {
      const [total] = await db.select({ count: count() }).from(tasks).where(eq(tasks.projectId, p.id));
      const [completed] = await db.select({ count: count() }).from(tasks).where(
        and(eq(tasks.projectId, p.id), eq(tasks.status, "completed"))
      );
      return {
        id: p.id,
        name: p.name,
        totalTasks: total.count,
        completedTasks: completed.count,
      };
    })
  );

  return (
    <div className="bg-background min-h-screen">
      <div className="surface-page-shell min-h-screen p-5 sm:p-6 lg:p-7">
        <Greeting
          runningCount={runningResult.count}
          awaitingCount={awaitingResult.count}
          failedCount={failedResult.count}
          activeWorkflows={activeWorkflowCountResult.count}
        />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 mb-6">
          <div className="lg:col-span-3">
            <PriorityQueue tasks={allPriorityItems} />
          </div>
          <div className="lg:col-span-2">
            <ActivityFeed entries={serializedLogs} hourlyActivity={agentActivityByHour} />
          </div>
          <div className="lg:col-span-3">
            <RecentProjects projects={recentProjectData} />
          </div>
          <div className="lg:col-span-2 space-y-6">
            <QuickActions />
            <ActivationChecklist />
          </div>
        </div>
      </div>
    </div>
  );
}
