"use client";

import { useState, useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, Plus, CheckSquare, Square, ArrowRight, Play, Trash2 } from "lucide-react";
import { TaskCard, type TaskItem } from "./task-card";
import { WorkflowKanbanCard, type WorkflowKanbanItem } from "@/components/workflows/workflow-kanban-card";
import type { TaskStatus } from "@/lib/constants/task-status";
import type { SortOrder } from "./kanban-board";

type KanbanItem =
  | { kind: "task"; data: TaskItem }
  | { kind: "workflow"; data: WorkflowKanbanItem };

function itemName(item: KanbanItem): string {
  return item.kind === "task" ? item.data.title : item.data.name;
}

function mergedItems(
  tasks: TaskItem[],
  workflows: WorkflowKanbanItem[],
  sortOrder: SortOrder
): KanbanItem[] {
  const items: KanbanItem[] = [
    ...workflows.map((w) => ({ kind: "workflow" as const, data: w })),
    ...tasks.map((t) => ({ kind: "task" as const, data: t })),
  ];

  switch (sortOrder) {
    case "created-desc":
      return items.sort(
        (a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime()
      );
    case "created-asc":
      return items.sort(
        (a, b) => new Date(a.data.createdAt).getTime() - new Date(b.data.createdAt).getTime()
      );
    case "title-asc":
      return items.sort((a, b) => itemName(a).localeCompare(itemName(b)));
    case "priority":
      // Workflows lack priority — keep them at top, then sort tasks by priority
      return items.sort((a, b) => {
        if (a.kind === "workflow" && b.kind === "workflow") return 0;
        if (a.kind === "workflow") return -1;
        if (b.kind === "workflow") return 1;
        return a.data.priority - b.data.priority;
      });
  }
}

const columnLabels: Record<string, string> = {
  planned: "Planned",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
};

export function KanbanColumn({
  status,
  tasks,
  workflows = [],
  sortOrder = "priority",
  exitingIds,
  onTaskClick,
  onAddTask,
  onDeleteTask,
  onEditTask,
  onBulkDelete,
  onBulkStatusChange,
  onBulkExecute,
  onRunWorkflow,
  onStopWorkflow,
}: {
  status: TaskStatus;
  tasks: TaskItem[];
  workflows?: WorkflowKanbanItem[];
  sortOrder?: SortOrder;
  exitingIds?: Set<string>;
  onTaskClick: (task: TaskItem) => void;
  onAddTask?: () => void;
  onDeleteTask?: (taskId: string) => void;
  onEditTask?: (task: TaskItem) => void;
  onBulkDelete?: (taskIds: string[]) => void;
  onBulkStatusChange?: (taskIds: string[], newStatus: TaskStatus) => void;
  onBulkExecute?: (taskIds: string[]) => void;
  onRunWorkflow?: (workflow: WorkflowKanbanItem) => void;
  onStopWorkflow?: (workflow: WorkflowKanbanItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const label = columnLabels[status] ?? status;
  const totalCount = tasks.length + workflows.length;

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const canSelect = status !== "running";

  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);

  const handleSelect = useCallback((taskId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === tasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tasks.map((t) => t.id)));
    }
  }, [selectedIds.size, tasks]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkAction = useCallback(
    (action: "queue" | "run" | "delete") => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;

      if (action === "delete") {
        onBulkDelete?.(ids);
      } else if (action === "queue") {
        onBulkStatusChange?.(ids, "queued");
      } else if (action === "run") {
        onBulkExecute?.(ids);
      }

      exitSelectMode();
    },
    [selectedIds, onBulkDelete, onBulkStatusChange, onBulkExecute, exitSelectMode]
  );

  // Determine which bulk action button to show
  const bulkActionButton =
    status === "planned" ? (
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-xs gap-1"
        onClick={() => handleBulkAction("queue")}
        disabled={selectedIds.size === 0}
      >
        <ArrowRight className="h-3 w-3" />
        Queue
      </Button>
    ) : status === "queued" ? (
      <Button
        size="sm"
        variant="outline"
        className="h-6 text-xs gap-1"
        onClick={() => handleBulkAction("run")}
        disabled={selectedIds.size === 0}
      >
        <Play className="h-3 w-3" />
        Run
      </Button>
    ) : null;

  return (
    <div className="group/col flex flex-col min-w-64 max-w-80 flex-1 shrink-0" role="group" aria-label={`${label} column, ${totalCount} items`}>
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <h3 className="text-sm font-medium">{label}</h3>
        <Badge variant="secondary" className="text-xs">
          {totalCount}
        </Badge>
        <div className="flex-1" />
        {canSelect && tasks.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectMode}
            className={`p-1 rounded hover:bg-accent/50 transition-colors cursor-pointer ${
              selectMode ? "text-primary" : "text-muted-foreground opacity-0 group-hover/col:opacity-100"
            }`}
            aria-label={selectMode ? "Exit select mode" : "Enter select mode"}
            style={{ opacity: selectMode ? 1 : undefined }}
          >
            {selectMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectMode && (
        <div className="flex items-center gap-1 mb-2 px-1 py-1.5 rounded-md bg-muted/50 border border-border/40 overflow-hidden">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs px-1.5 shrink-0"
            onClick={toggleSelectAll}
          >
            {selectedIds.size === tasks.length ? "None" : "All"}
          </Button>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {selectedIds.size} sel.
          </span>
          <div className="flex-1" />
          {bulkActionButton}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => handleBulkAction("delete")}
            disabled={selectedIds.size === 0}
            aria-label="Delete selected"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        aria-label={`Drop zone for ${label}`}
        className={`surface-scroll flex-1 rounded-lg border border-dashed p-2 min-h-[200px] transition-colors ${
          isOver ? "bg-accent/50 border-primary" : "border-border/40"
        }`}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[120px] text-muted-foreground border-2 border-dashed border-border/50 rounded-lg bg-background/35">
                <Inbox className="h-5 w-5 mb-1 opacity-40" />
                <span className="text-xs">No items</span>
              </div>
            ) : (
              <>
                {mergedItems(tasks, workflows, sortOrder).map((item) =>
                  item.kind === "workflow" ? (
                    <WorkflowKanbanCard
                      key={item.data.id}
                      workflow={item.data}
                      onRun={onRunWorkflow}
                      onStop={onStopWorkflow}
                    />
                  ) : (
                    <div
                      key={item.data.id}
                      className={exitingIds?.has(item.data.id) ? "animate-card-exit pointer-events-none" : ""}
                    >
                      <TaskCard
                        task={item.data}
                        onClick={onTaskClick}
                        selectionMode={selectMode}
                        selected={selectedIds.has(item.data.id)}
                        onSelect={handleSelect}
                        onDelete={onDeleteTask}
                        onEdit={onEditTask}
                      />
                    </div>
                  )
                )}
              </>
            )}
          </div>
        </SortableContext>
        {onAddTask && (
          <Button
            variant="ghost"
            className="w-full mt-2 border border-dashed border-border/50 text-muted-foreground hover:text-foreground"
            onClick={onAddTask}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add task
          </Button>
        )}
      </div>
    </div>
  );
}
