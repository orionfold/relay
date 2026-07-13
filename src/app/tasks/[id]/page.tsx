import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { tasks, projects, workflows, schedules } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PageShell } from "@/components/shared/page-shell";
import { TaskDetailView } from "@/components/tasks/task-detail-view";
import { getTaskRunHistory } from "@/lib/tasks/run-history";
import { getTaskUsageSummary } from "@/lib/usage/task-summary";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, id));

  if (!task) notFound();

  // Join relationship names server-side for initial render
  let projectName: string | undefined;
  let workflowName: string | undefined;
  let scheduleName: string | undefined;

  if (task.projectId) {
    const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, task.projectId));
    projectName = p?.name;
  }
  if (task.workflowId) {
    const [w] = await db.select({ name: workflows.name }).from(workflows).where(eq(workflows.id, task.workflowId));
    workflowName = w?.name;
  }
  if (task.scheduleId) {
    const [s] = await db.select({ name: schedules.name }).from(schedules).where(eq(schedules.id, task.scheduleId));
    scheduleName = s?.name;
  }

  // Serialize Date timestamps to ISO strings for client component
  const usage = await getTaskUsageSummary(id);
  const initialTask = {
    ...task,
    createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : String(task.createdAt),
    updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt),
    projectName,
    workflowName,
    scheduleName,
    usage,
  };
  const initialRunHistory = await getTaskRunHistory(id);

  return (
    <PageShell backHref="/tasks" backLabel="Back to Tasks">
      <TaskDetailView
        taskId={id}
        initialTask={initialTask}
        initialRunHistory={initialRunHistory ?? undefined}
      />
    </PageShell>
  );
}
