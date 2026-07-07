"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { TaskDetailSheet } from "@/components/tasks/task-detail-sheet";
import { KanbanBoard, type SortOrder, SORT_OPTIONS } from "@/components/tasks/kanban-board";
import { TaskTableView } from "@/components/tasks/task-table-view";
import { TaskViewToggle, useTaskView } from "@/components/tasks/task-view-toggle";
import { DensityToggle } from "@/components/tasks/density-toggle";
import type { TaskItem } from "@/components/tasks/task-card";
import type { WorkflowKanbanItem } from "@/components/workflows/workflow-kanban-card";
import type { Density } from "@/components/data-table";
import { usePersistedState } from "@/hooks/use-persisted-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, Plus } from "lucide-react";
import { COLUMN_ORDER } from "@/lib/constants/task-status";

interface TaskSurfaceProps {
  initialTasks: TaskItem[];
  initialWorkflows: WorkflowKanbanItem[];
  projects: { id: string; name: string }[];
}

/**
 * TaskSurface — unified dashboard surface with shared header controls.
 * Renders board or table view with the same title, filters, and actions.
 */
export function TaskSurface({
  initialTasks,
  initialWorkflows,
  projects,
}: TaskSurfaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useTaskView();
  const [sheetTaskId, setSheetTaskId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = usePersistedState("ainative-project-filter", "all");
  const [statusFilter, setStatusFilter] = usePersistedState<string>("ainative-status-filter", "all");
  const [sortOrder, setSortOrder] = usePersistedState<SortOrder>("ainative-sort-order", "priority");
  const [density, setDensity] = usePersistedState<Density>("ainative-table-density", "comfortable");

  // Reset stale project filter (e.g. project was deleted between sessions)
  useEffect(() => {
    if (projectFilter !== "all" && !projects.some((p) => p.id === projectFilter)) {
      setProjectFilter("all");
    }
  }, [projectFilter, projects, setProjectFilter]);

  useEffect(() => {
    const requestedStatus = searchParams.get("status");
    if (
      requestedStatus &&
      (requestedStatus === "all" || COLUMN_ORDER.includes(requestedStatus as typeof COLUMN_ORDER[number])) &&
      requestedStatus !== statusFilter
    ) {
      setStatusFilter(requestedStatus);
    }
  }, [searchParams, setStatusFilter, statusFilter]);

  const newTaskHref = projectFilter !== "all"
    ? `/tasks/new?project=${projectFilter}`
    : "/tasks/new";

  return (
    <div className="space-y-4">
      {/* Header row: title + filters + controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filters */}
          {projects.length > 0 && (
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {COLUMN_ORDER.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
            <SelectTrigger className="w-[150px]">
              <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View toggle + density (table only) */}
          <div className="flex items-center gap-1">
            <TaskViewToggle view={view} onViewChange={setView} />
            {view === "table" && (
              <DensityToggle density={density} onDensityChange={setDensity} />
            )}
          </div>

          {/* New Task button */}
          <Link href={newTaskHref}>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Task
            </Button>
          </Link>
        </div>
      </div>

      {/* Content */}
      {view === "board" ? (
        <KanbanBoard
          initialTasks={initialTasks}
          initialWorkflows={initialWorkflows}
          projects={projects}
          projectFilter={projectFilter}
          statusFilter={statusFilter}
          sortOrder={sortOrder}
          onTaskSelect={setSheetTaskId}
        />
      ) : (
        <TaskTableView
          tasks={initialTasks}
          workflows={initialWorkflows}
          projects={projects}
          projectFilter={projectFilter}
          statusFilter={statusFilter}
          sortOrder={sortOrder}
          density={density}
          onTaskSelect={setSheetTaskId}
        />
      )}

      <TaskDetailSheet
        taskId={sheetTaskId}
        open={sheetTaskId !== null}
        onOpenChange={(open) => { if (!open) setSheetTaskId(null); }}
        onDeleted={() => { setSheetTaskId(null); router.refresh(); }}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}
