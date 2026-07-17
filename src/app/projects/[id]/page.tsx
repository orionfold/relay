import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { customers, projects, tasks, workflows, documents } from "@/lib/db/schema";
import { eq, count, desc, getTableColumns } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COLUMN_ORDER } from "@/lib/constants/task-status";
import { PageShell } from "@/components/shared/page-shell";
import { ProjectDetailClient } from "@/components/projects/project-detail";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Sparkline } from "@/components/charts/sparkline";
import { getProjectCompletionTrend } from "@/lib/queries/chart-data";
import { ProjectBoundaryNotice } from "@/components/shared/relay-boundary-notice";
import {
  buildRelayExecutionContext,
  getRelayCellBoundary,
} from "@/lib/instance/cell-boundary";
import { ProjectContextBadges } from "@/components/projects/project-context-badges";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project] = await db
    .select({
      ...getTableColumns(projects),
      customerName: customers.name,
    })
    .from(projects)
    .leftJoin(customers, eq(projects.customerId, customers.id))
    .where(eq(projects.id, id));

  if (!project) notFound();

  const projectTasks = await db
    .select({
      ...getTableColumns(tasks),
      workflowName: workflows.name,
      workflowStatus: workflows.status,
    })
    .from(tasks)
    .leftJoin(workflows, eq(tasks.workflowId, workflows.id))
    .where(eq(tasks.projectId, id))
    .orderBy(tasks.priority, tasks.createdAt);

  // Document count and recent docs
  const [{ docCount }] = await db
    .select({ docCount: count(documents.id) })
    .from(documents)
    .where(eq(documents.projectId, id));

  const recentDocs = docCount > 0 ? await db
    .select({
      id: documents.id,
      originalName: documents.originalName,
      direction: documents.direction,
      version: documents.version,
      size: documents.size,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.projectId, id))
    .orderBy(desc(documents.createdAt))
    .limit(5)
  : [];

  // Status breakdown (standalone tasks only for headline metrics)
  const statusCounts: Record<string, number> = {};
  const standaloneForCounts = projectTasks.filter((t) => !t.workflowId);
  for (const status of COLUMN_ORDER) {
    statusCounts[status] = standaloneForCounts.filter((t) => t.status === status).length;
  }

  const completionTrend = await getProjectCompletionTrend(id, 14);
  const totalTasks = standaloneForCounts.length;

  const standaloneTasks = projectTasks.filter((t) => !t.workflowId);
  const workflowTasks = projectTasks.filter((t) => t.workflowId);

  const serializedTasks = projectTasks.map((t) => ({
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    workflowName: t.workflowName ?? null,
    workflowStatus: t.workflowStatus ?? null,
  }));

  const standaloneCount = standaloneTasks.length;
  const workflowCount = workflowTasks.length;
  const workflowGroupCount = new Set(workflowTasks.map((t) => t.workflowId)).size;

  const executionContext = buildRelayExecutionContext({
    cell: getRelayCellBoundary(),
    project: {
      id: project.id,
      name: project.name,
      workingDirectory: project.workingDirectory,
    },
  });

  return (
    <PageShell
      backHref="/projects"
      backLabel="Back to Projects"
      title={project.name}
      description={project.description ?? undefined}
      actions={
        <ProjectContextBadges
          customerId={project.customerId}
          customerName={project.customerName}
          status={project.status}
        />
      }
    >
      <div className="mb-6">
        <ProjectBoundaryNotice
          workingDirectory={executionContext.workingDirectory}
          source={executionContext.workingDirectorySource}
        />
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-6">
        {COLUMN_ORDER.map((status) => (
          <Card key={status}>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground capitalize">
                {status}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="text-xl font-bold">{statusCounts[status]}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stacked status bar + completion sparkline */}
      {totalTasks > 0 && (
        <div className="mb-6 space-y-3">
          <div className="flex h-1.5 rounded-full overflow-hidden" role="img" aria-label="Task status distribution">
            {COLUMN_ORDER.map((status) => {
              const pct = (statusCounts[status] / totalTasks) * 100;
              if (pct === 0) return null;
              // Status distribution = functional status tokens (not the chart
              // palette): cyan 'running' is the licensed live-state accent, the
              // rest stay functional green/amber/neutral/red.
              const statusColors: Record<string, string> = {
                planned: "var(--muted-foreground)",
                queued: "var(--status-warning)",
                running: "var(--status-running)",
                completed: "var(--status-completed)",
                failed: "var(--destructive)",
              };
              return (
                <div
                  key={status}
                  style={{ width: `${pct}%`, backgroundColor: statusColors[status] ?? "var(--muted)" }}
                  title={`${status}: ${statusCounts[status]}`}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground shrink-0">14-day completions</span>
            <Sparkline
              data={completionTrend}
              width={200}
              height={24}
              color="var(--chart-1)"
              label="14-day completion trend"
              className="flex-1"
            />
          </div>
        </div>
      )}

      {/* Recent documents */}
      {recentDocs.length > 0 && (
        <div className="mb-6">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Recent Documents</CardTitle>
                <Link href={`/documents?projectId=${id}`} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  View all &rarr;
                </Link>
              </div>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {recentDocs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/documents/${doc.id}`}
                  data-interactive-surface=""
                  data-interactive-outline="preserve"
                  className="interactive-list-item flex items-center gap-3 py-2 text-xs -mx-6 px-6"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{doc.originalName}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {doc.direction}
                  </Badge>
                  {doc.direction === "output" && (
                    <span className="text-muted-foreground">v{doc.version}</span>
                  )}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Task count summary */}
      {(standaloneCount > 0 || workflowCount > 0) && (
        <p className="text-xs text-muted-foreground mb-4">
          {standaloneCount} standalone task{standaloneCount !== 1 ? "s" : ""}
          {workflowCount > 0 && (
            <> &middot; {workflowCount} workflow task{workflowCount !== 1 ? "s" : ""} across {workflowGroupCount} workflow{workflowGroupCount !== 1 ? "s" : ""}</>
          )}
          {docCount > 0 && (
            <> &middot; {docCount} document{docCount !== 1 ? "s" : ""}</>
          )}
        </p>
      )}

      <ProjectDetailClient tasks={serializedTasks} projectId={id} />
    </PageShell>
  );
}
