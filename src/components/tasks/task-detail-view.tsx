"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExecutionTargetPreview } from "@/components/shared/execution-target-preview";
import { TaskAttachments } from "./task-attachments";
import { TaskChipBar } from "./task-chip-bar";
import { TaskBentoGrid } from "./task-bento-grid";
import { TaskResultRenderer } from "./task-result-renderer";
import { TaskEditDialog } from "./task-edit-dialog";
import { useTaskDetail } from "@/hooks/use-task-detail";
import type { TaskItem } from "./task-card";
import { TaskRunHistory } from "./task-run-history";
import type { TaskRunHistory as TaskRunHistoryData } from "@/lib/tasks/run-history";
import { useTaskRunHistory } from "@/hooks/use-task-run-history";

interface TaskDetailViewProps {
  taskId: string;
  initialTask?: TaskItem;
  initialRunHistory?: TaskRunHistoryData;
}

export function TaskDetailView({ taskId, initialTask, initialRunHistory }: TaskDetailViewProps) {
  const router = useRouter();
  const [targetReady, setTargetReady] = useState<boolean | null>(null);
  const [siblings, setSiblings] = useState<Array<{
    id: string;
    title: string;
    status: string;
    createdAt: string;
  }>>([]);

  const {
    task,
    docs,
    loaded,
    loading,
    error,
    refresh,
    fetchDocs,
    handleStatusChange,
    handleExecute,
    handleResume,
    handleCancel,
    handleDelete,
    confirmCancel,
    setConfirmCancel,
    confirmDelete,
    setConfirmDelete,
    editOpen,
    setEditOpen,
    performCancel,
    performDelete,
  } = useTaskDetail({
    taskId,
    initialTask,
    enabled: true,
    onDeleted: () => router.push("/tasks"),
  });

  const { history: runHistory, error: runHistoryError } = useTaskRunHistory({
    taskId,
    enabled: true,
    taskStatus: task?.status,
    taskUpdatedAt: task?.updatedAt,
    initialHistory: initialRunHistory,
  });

  useEffect(() => {
    if (task?.workflowId) {
      fetch(`/api/tasks/${taskId}/siblings`)
        .then((r) => r.ok ? r.json() : [])
        .then(setSiblings)
        .catch(() => {});
    }
  }, [task?.workflowId, taskId]);

  if (!loaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!task) {
    return <p className="text-muted-foreground">Task not found.</p>;
  }

  const inputDocs = docs.filter((doc) => doc.direction === "input");
  const outputDocs = docs.filter((doc) => doc.direction === "output");

  return (
    <div className="space-y-4" aria-live="polite">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <TaskChipBar
        task={task}
        loading={loading}
        onEdit={() => setEditOpen(true)}
        onQueue={() => handleStatusChange("queued")}
        onRun={handleExecute}
        onCancel={handleCancel}
        onResume={handleResume}
        onRetry={() => handleStatusChange("queued")}
        onDelete={handleDelete}
        targetReady={targetReady}
      />

      <ExecutionTargetPreview
        kind="task"
        id={task.id}
        enabled={task.status === "queued"}
        revision={task.updatedAt}
        onReadyChange={setTargetReady}
      />

      <TaskBentoGrid task={task} docs={docs} />

      {/* Sibling tasks from same workflow run */}
      {siblings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Related Tasks ({siblings.length})
          </h3>
          <div className="surface-control rounded-lg divide-y divide-border">
            {siblings.map((s) => (
              <Link
                key={s.id}
                href={`/tasks/${s.id}`}
                data-interactive-surface=""
                data-interactive-outline="preserve"
                className="interactive-list-item flex items-center gap-3 px-3 py-2 text-xs"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  s.status === "completed" ? "bg-status-completed" :
                  s.status === "failed" ? "bg-destructive" :
                  s.status === "running" ? "bg-status-running" :
                  "bg-muted-foreground"
                }`} />
                <span className="truncate flex-1">{s.title}</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {s.status}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {docs.length > 0 && (
        <div className="surface-card-muted rounded-lg p-4 space-y-4">
          {inputDocs.length > 0 && (
            <TaskAttachments
              documents={inputDocs}
              title={`Input Attachments (${inputDocs.length})`}
              onDeleted={fetchDocs}
            />
          )}
          {outputDocs.length > 0 && (
            <TaskAttachments
              documents={outputDocs}
              title={`Generated Outputs (${outputDocs.length})`}
              onDeleted={fetchDocs}
            />
          )}
        </div>
      )}

      {(task.description || task.result) && (
        <TaskResultRenderer
          description={task.description}
          result={task.result}
          status={task.status}
        />
      )}

      <TaskRunHistory
        taskId={taskId}
        history={runHistory}
        error={runHistoryError}
      />

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="Cancel task?"
        description="This will stop the running agent. Any partial progress may be lost."
        confirmLabel="Cancel Task"
        destructive
        onConfirm={performCancel}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete task?"
        description="This action cannot be undone. The task and its history will be permanently deleted."
        confirmLabel="Delete Task"
        destructive
        onConfirm={performDelete}
      />
      <TaskEditDialog
        task={task}
        open={editOpen}
        onOpenChange={setEditOpen}
        onUpdated={refresh}
      />
    </div>
  );
}
