"use client";

import { useId, useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { KanbanColumn } from "./kanban-column";
import { TaskCard, type TaskItem } from "./task-card";
import { TaskEditDialog } from "./task-edit-dialog";
import { EmptyBoard } from "./empty-board";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { COLUMN_ORDER, isValidDragTransition, type TaskStatus } from "@/lib/constants/task-status";
import type { WorkflowKanbanItem } from "@/components/workflows/workflow-kanban-card";
import { getWorkflowExecutionInfo } from "@/lib/workflows/execution-status";

export type SortOrder = "priority" | "created-desc" | "created-asc" | "title-asc";

export const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "created-desc", label: "Newest first" },
  { value: "created-asc", label: "Oldest first" },
  { value: "title-asc", label: "Title A-Z" },
];

export function compareTasks(a: TaskItem, b: TaskItem, order: SortOrder): number {
  switch (order) {
    case "priority":
      return a.priority - b.priority;
    case "created-desc":
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    case "created-asc":
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    case "title-asc":
      return a.title.localeCompare(b.title);
  }
}

/** Map workflow status to kanban column */
function workflowStatusToColumn(status: string): TaskStatus {
  switch (status) {
    case "draft":
    case "paused":
      return "planned";
    case "active":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "planned";
  }
}

function workflowToColumn(workflow: WorkflowKanbanItem): TaskStatus {
  const effectiveStatus =
    workflow.effectiveStatus ??
    getWorkflowExecutionInfo({
      status: workflow.status,
      liveTaskCount: workflow.liveTaskCount,
    }).status;

  switch (effectiveStatus) {
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "draft":
    case "paused":
    case "waiting":
    case "stalled":
      return "planned";
    default:
      return workflowStatusToColumn(workflow.status);
  }
}

export type KanbanItem =
  | (TaskItem & { type?: "task" })
  | WorkflowKanbanItem;

interface KanbanBoardProps {
  initialTasks: TaskItem[];
  initialWorkflows?: WorkflowKanbanItem[];
  projects: { id: string; name: string }[];
  /** Filter state — controlled by parent (TaskSurface) */
  projectFilter: string;
  statusFilter: string;
  sortOrder: SortOrder;
  /** Open task detail sheet instead of navigating to full page */
  onTaskSelect?: (taskId: string) => void;
}

export function KanbanBoard({
  initialTasks,
  initialWorkflows = [],
  projects,
  projectFilter,
  statusFilter,
  sortOrder,
  onTaskSelect,
}: KanbanBoardProps) {
  const dndId = useId();
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    if (typeof window === "undefined") return initialTasks;
    const raw = sessionStorage.getItem("deletedTask");
    if (!raw) return initialTasks;
    try {
      const deleted = JSON.parse(raw) as TaskItem;
      if (initialTasks.some((t) => t.id === deleted.id)) return initialTasks;
      return [...initialTasks, deleted];
    } catch {
      return initialTasks;
    }
  });
  const [workflowItems, setWorkflowItems] = useState<WorkflowKanbanItem[]>(initialWorkflows);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const [activeTask, setActiveTask] = useState<TaskItem | null>(null);

  const totalItems = tasks.length + workflowItems.length;
  const [announcement, setAnnouncement] = useState(
    `Showing ${totalItems} item${totalItems === 1 ? "" : "s"} on the kanban board.`
  );
  const hasAnnouncedFilters = useRef(false);

  // Edit dialog
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

  // Bulk delete confirmation
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);

  // Scroll indicators
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollIndicators = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollIndicators();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(updateScrollIndicators);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateScrollIndicators, tasks]);

  // Ghost card exit animation
  useEffect(() => {
    const raw = sessionStorage.getItem("deletedTask");
    if (!raw) return;
    sessionStorage.removeItem("deletedTask");
    try {
      const deleted = JSON.parse(raw) as TaskItem;
      requestAnimationFrame(() => {
        setExitingIds(new Set([deleted.id]));
        setTimeout(() => {
          setTasks((prev) => prev.filter((t) => t.id !== deleted.id));
          setExitingIds(new Set());
        }, 500);
      });
    } catch {
      // invalid data — ignore
    }
  }, []);

  // Sync local state when server re-renders with fresh data (e.g. after router.refresh())
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  useEffect(() => {
    setWorkflowItems(initialWorkflows);
  }, [initialWorkflows]);

  // Filter tasks by project and status
  const filteredTasks = tasks.filter((t) => {
    if (projectFilter !== "all" && t.projectId !== projectFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  // Filter workflows by project and status (mapped to column)
  const filteredWorkflows = workflowItems.filter((w) => {
    if (projectFilter !== "all" && w.projectId !== projectFilter) return false;
    if (statusFilter !== "all" && workflowToColumn(w) !== statusFilter) return false;
    return true;
  });

  useEffect(() => {
    if (!hasAnnouncedFilters.current) {
      hasAnnouncedFilters.current = true;
      return;
    }

    const total = filteredTasks.length + filteredWorkflows.length;
    const projectName =
      projectFilter === "all"
        ? "all projects"
        : projects.find((project) => project.id === projectFilter)?.name ?? "the selected project";
    const statusName = statusFilter === "all" ? "all statuses" : statusFilter;
    setAnnouncement(
      `Showing ${total} item${total === 1 ? "" : "s"} for ${projectName} with ${statusName}.`
    );
  }, [filteredTasks.length, filteredWorkflows.length, projectFilter, projects, statusFilter]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const refresh = useCallback(async () => {
    const res = await fetch("/api/tasks");
    if (res.ok) setTasks(await res.json());
  }, []);

  function handleDragStart(event: DragStartEvent) {
    const task = tasks.find((t) => t.id === event.active.id);
    setActiveTask(task ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = event;
    if (!over) return;

    const task = tasks.find((t) => t.id === active.id);
    if (!task) return;

    const targetStatus = over.id as TaskStatus;
    if (task.status === targetStatus) return;

    if (!isValidDragTransition(task.status as TaskStatus, targetStatus)) {
      setAnnouncement(`Cannot move ${task.title} from ${task.status} to ${targetStatus}.`);
      return;
    }

    // Optimistic update
    const prevTasks = [...tasks];
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: targetStatus } : t))
    );
    setAnnouncement(`Moved ${task.title} to ${targetStatus}.`);

    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (!res.ok) {
        setTasks(prevTasks);
        setAnnouncement(`Move failed. ${task.title} returned to ${task.status}.`);
      }
    } catch {
      setTasks(prevTasks);
      setAnnouncement(`Move failed. ${task.title} returned to ${task.status}.`);
    }
  }

  // Single task delete
  const handleDeleteTask = useCallback(async (taskId: string) => {
    const prevTasks = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Task deleted");
        setAnnouncement("Task deleted.");
      } else if (res.status === 404) {
        toast.success("Task deleted");
      } else {
        setTasks(prevTasks);
        toast.error("Failed to delete task");
      }
    } catch {
      setTasks(prevTasks);
      toast.error("Failed to delete task");
    }
  }, [tasks]);

  // Bulk delete — triggered after modal confirmation
  const handleBulkDeleteConfirm = useCallback(async () => {
    if (!bulkDeleteIds) return;
    const ids = bulkDeleteIds;
    setBulkDeleteIds(null);

    const prevTasks = tasks;
    setTasks((prev) => prev.filter((t) => !ids.includes(t.id)));

    const results = await Promise.allSettled(
      ids.map((id) => fetch(`/api/tasks/${id}`, { method: "DELETE" }))
    );

    const failed = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok && r.value.status !== 404)
    );

    if (failed.length === 0) {
      toast.success(`Deleted ${ids.length} task${ids.length === 1 ? "" : "s"}`);
      setAnnouncement(`Deleted ${ids.length} tasks.`);
    } else if (failed.length < ids.length) {
      const succeeded = ids.length - failed.length;
      toast.error(`Deleted ${succeeded}/${ids.length}, ${failed.length} failed`);
      refresh();
    } else {
      setTasks(prevTasks);
      toast.error("Failed to delete tasks");
    }
  }, [bulkDeleteIds, tasks, refresh]);

  // Bulk status change
  const handleBulkStatusChange = useCallback(async (taskIds: string[], newStatus: TaskStatus) => {
    const prevTasks = tasks;
    setTasks((prev) =>
      prev.map((t) => (taskIds.includes(t.id) ? { ...t, status: newStatus } : t))
    );
    setAnnouncement(`Moving ${taskIds.length} tasks to ${newStatus}.`);

    const results = await Promise.allSettled(
      taskIds.map((id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        })
      )
    );

    const failed = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)
    );

    if (failed.length === 0) {
      toast.success(`${taskIds.length} task${taskIds.length === 1 ? "" : "s"} moved to ${newStatus}`);
    } else {
      toast.error(`${failed.length} of ${taskIds.length} updates failed`);
      refresh();
    }
  }, [tasks, refresh]);

  // Bulk execute: actually run queued tasks via POST /execute
  const handleBulkExecute = useCallback(async (taskIds: string[]) => {
    const prevTasks = tasks;
    setTasks((prev) =>
      prev.map((t) => (taskIds.includes(t.id) ? { ...t, status: "running" as TaskStatus } : t))
    );
    setAnnouncement(`Running ${taskIds.length} task${taskIds.length === 1 ? "" : "s"}.`);

    const results = await Promise.allSettled(
      taskIds.map((id) =>
        fetch(`/api/tasks/${id}/execute`, { method: "POST" })
      )
    );

    const failed = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)
    );

    if (failed.length === 0) {
      toast.success(`${taskIds.length} task${taskIds.length === 1 ? "" : "s"} started`);
    } else {
      toast.error(`${failed.length} of ${taskIds.length} tasks failed to start`);
      refresh();
    }
  }, [tasks, refresh]);

  const handleRunWorkflow = useCallback((workflow: WorkflowKanbanItem) => {
    router.push(`/workflows/${workflow.id}`);
  }, [router]);

  const handleStopWorkflow = useCallback(async (workflow: WorkflowKanbanItem) => {
    const prevItems = workflowItems;
    setWorkflowItems((prev) =>
      prev.map((item) =>
        item.id === workflow.id
          ? { ...item, status: "failed", effectiveStatus: "failed", liveTaskCount: 0 }
          : item
      )
    );

    const res = await fetch(`/api/workflows/${workflow.id}/stop`, { method: "POST" });
    if (res.ok) {
      toast.success("Workflow stopped");
      router.refresh();
    } else {
      setWorkflowItems(prevItems);
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to stop workflow");
    }
  }, [router, workflowItems]);

  function handleTaskClick(task: TaskItem) {
    onTaskSelect ? onTaskSelect(task.id) : router.push(`/tasks/${task.id}`);
  }

  const sortedTasks = [...filteredTasks].sort((a, b) => compareTasks(a, b, sortOrder));

  // Group tasks by column
  const groupedTasks = COLUMN_ORDER.reduce(
    (acc, status) => {
      acc[status] = sortedTasks.filter((t) => t.status === status);
      return acc;
    },
    {} as Record<TaskStatus, TaskItem[]>
  );

  // Group workflows by mapped column
  const groupedWorkflows = COLUMN_ORDER.reduce(
    (acc, status) => {
      acc[status] = filteredWorkflows.filter(
        (w) => workflowToColumn(w) === status
      );
      return acc;
    },
    {} as Record<TaskStatus, WorkflowKanbanItem[]>
  );

  if (tasks.length === 0 && workflowItems.length === 0) {
    return <EmptyBoard />;
  }

  return (
    <div>
      <p id={`${dndId}-announcements`} className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      <DndContext
        id={dndId}
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="relative">
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollRef.current?.scrollBy({ left: -280, behavior: "smooth" })}
            className={`surface-control absolute left-1 top-[-2px] z-20 h-8 w-8 rounded-full flex items-center justify-center transition-opacity duration-200 hover:bg-accent/50 ${canScrollLeft ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <ChevronLeft className="h-4 w-4 text-foreground" />
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollRef.current?.scrollBy({ left: 280, behavior: "smooth" })}
            className={`surface-control absolute right-1 top-[-2px] z-20 h-8 w-8 rounded-full flex items-center justify-center transition-opacity duration-200 hover:bg-accent/50 ${canScrollRight ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          >
            <ChevronRight className="h-4 w-4 text-foreground" />
          </button>
          <div
            ref={scrollRef}
            onScroll={updateScrollIndicators}
            className="flex gap-4 overflow-x-auto pb-4"
            role="region"
            aria-label="Kanban board"
            aria-describedby={`${dndId}-announcements`}
          >
            {COLUMN_ORDER.map((status) => (
              <KanbanColumn
                key={status}
                status={status}
                tasks={groupedTasks[status]}
                workflows={groupedWorkflows[status]}
                sortOrder={sortOrder}
                exitingIds={exitingIds}
                onTaskClick={handleTaskClick}
                onAddTask={status === "planned" ? () => router.push("/tasks/new") : undefined}
                onDeleteTask={handleDeleteTask}
                onEditTask={setEditingTask}
                onBulkDelete={(ids) => setBulkDeleteIds(ids)}
                onBulkStatusChange={handleBulkStatusChange}
                onBulkExecute={handleBulkExecute}
                onRunWorkflow={handleRunWorkflow}
                onStopWorkflow={handleStopWorkflow}
              />
            ))}
          </div>
        </div>
        <DragOverlay>
          {activeTask ? (
            <div className="w-64">
              <TaskCard task={activeTask} onClick={() => {}} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Bulk delete confirmation modal */}
      <ConfirmDialog
        open={bulkDeleteIds !== null}
        onOpenChange={(open) => { if (!open) setBulkDeleteIds(null); }}
        title={`Delete ${bulkDeleteIds?.length ?? 0} task${(bulkDeleteIds?.length ?? 0) === 1 ? "" : "s"}?`}
        description="This action cannot be undone. All selected tasks will be permanently deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={handleBulkDeleteConfirm}
      />

      {/* Task edit dialog */}
      <TaskEditDialog
        task={editingTask}
        open={!!editingTask}
        onOpenChange={(open) => { if (!open) setEditingTask(null); }}
        onUpdated={refresh}
      />
    </div>
  );
}
