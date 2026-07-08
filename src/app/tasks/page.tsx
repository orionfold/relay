import { Suspense } from "react";
import { db } from "@/lib/db";
import { tasks, projects, workflows } from "@/lib/db/schema";
import { desc, getTableColumns, isNull, sql } from "drizzle-orm";
import { parseWorkflowState } from "@/lib/workflows/engine";
import { TaskSurface } from "@/components/tasks/task-surface";
import { SkeletonBoard } from "@/components/tasks/skeleton-board";
import type { TaskItem } from "@/components/tasks/task-card";
import type { WorkflowKanbanItem } from "@/components/workflows/workflow-kanban-card";

export const dynamic = "force-dynamic";

async function BoardContent() {
  // Only show parent/standalone tasks — hide workflow step tasks
  const allTasks = await db
    .select({
      ...getTableColumns(tasks),
      docCount: sql<number>`(SELECT COUNT(*) FROM documents d WHERE d.task_id = "tasks"."id")`.as("docCount"),
    })
    .from(tasks)
    .where(isNull(tasks.workflowId))
    .orderBy(tasks.priority, desc(tasks.createdAt));

  const allProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(projects.name);

  // Build project name lookup
  const projectMap = new Map(allProjects.map((p) => [p.id, p.name]));

  // Fetch all workflows for kanban display
  const allWorkflows = await db
    .select()
    .from(workflows)
    .orderBy(desc(workflows.updatedAt));

  // Serialize tasks
  const serializedTasks: TaskItem[] = allTasks.map((t) => ({
    ...t,
    projectName: t.projectId ? projectMap.get(t.projectId) ?? undefined : undefined,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  // Build workflow kanban items with step progress
  const serializedWorkflows: WorkflowKanbanItem[] = allWorkflows.map((w) => {
    let stepProgress = { current: 0, total: 0 };
    let currentStepName: string | undefined;

    try {
      const { definition, state } = parseWorkflowState(w.definition);
      if (definition.steps) {
        stepProgress.total = definition.steps.length;
        if (state) {
          stepProgress.current = state.stepStates.filter(
            (s) => s.status === "completed"
          ).length;
          const running = state.stepStates.find((s) => s.status === "running");
          if (running) {
            currentStepName = definition.steps.find(
              (step) => step.id === running.stepId
            )?.name;
          }
        }
      }
    } catch {
      /* skip parse errors */
    }

    return {
      type: "workflow" as const,
      id: w.id,
      name: w.name,
      status: w.status,
      pattern: (() => {
        try {
          return JSON.parse(w.definition).pattern ?? "sequence";
        } catch {
          return "sequence";
        }
      })(),
      projectId: w.projectId,
      projectName: w.projectId ? projectMap.get(w.projectId) ?? undefined : undefined,
      stepProgress,
      currentStepName,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    };
  });

  return (
    <TaskSurface
      initialTasks={serializedTasks}
      initialWorkflows={serializedWorkflows}
      projects={allProjects}
    />
  );
}

export default function TasksPage() {
  return (
    <div className="bg-background min-h-screen">
      <div className="surface-page-shell min-h-screen p-5 sm:p-6 lg:p-7">
        <Suspense fallback={<SkeletonBoard />}>
          <BoardContent />
        </Suspense>
      </div>
    </div>
  );
}
