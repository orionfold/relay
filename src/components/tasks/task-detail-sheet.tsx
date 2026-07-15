"use client";

import Link from "next/link";
import { useState } from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ExternalLink, X } from "lucide-react";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ExecutionTargetPreview } from "@/components/shared/execution-target-preview";
import { TaskChipBar } from "./task-chip-bar";
import { TaskBentoGrid } from "./task-bento-grid";
import { TaskAttachments } from "./task-attachments";
import { TaskResultRenderer } from "./task-result-renderer";
import { TaskEditDialog } from "./task-edit-dialog";
import { useTaskDetail } from "@/hooks/use-task-detail";
import { useTaskRunHistory } from "@/hooks/use-task-run-history";
import { TaskRunHistory } from "./task-run-history";

interface TaskDetailSheetProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
}

export function TaskDetailSheet({
  taskId,
  open,
  onOpenChange,
  onDeleted,
  onUpdated,
}: TaskDetailSheetProps) {
  const [targetReady, setTargetReady] = useState<boolean | null>(null);
  const {
    task,
    docs,
    loaded,
    loading,
    error,
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
    refresh,
  } = useTaskDetail({
    taskId,
    enabled: open,
    onDeleted: () => {
      onOpenChange(false);
      onDeleted?.();
    },
    onMutated: onUpdated,
  });

  const inputDocs = docs.filter((doc) => doc.direction === "input");
  const outputDocs = docs.filter((doc) => doc.direction === "output");
  const { history: runHistory, error: runHistoryError } = useTaskRunHistory({
    taskId,
    enabled: open && loaded && !!task,
    taskStatus: task?.status,
    taskUpdatedAt: task?.updatedAt,
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-2xl flex flex-col" showCloseButton={false}>
          <SheetHeader>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <SheetTitle>Task summary</SheetTitle>
                <SheetDescription className="mt-1 truncate">
                  {task?.title ?? (loaded ? "Task not found" : "Loading task…")}
                </SheetDescription>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {taskId && (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/tasks/${taskId}`}
                      aria-label="Open task details"
                      title="Open task details"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="hidden sm:inline">Open task details</span>
                    </Link>
                  </Button>
                )}
                <SheetPrimitive.Close asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Close task summary"
                    title="Close task summary"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </SheetPrimitive.Close>
              </div>
            </div>
          </SheetHeader>

          {/* Body — px-6 pb-6 per project convention (SheetContent has NO body padding) */}
          <div className="px-6 pb-6 space-y-4 overflow-y-auto flex-1">
            {!loaded ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : !task ? (
              <p className="text-muted-foreground">Task not found.</p>
            ) : (
              <>
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

                {taskId && (
                  <TaskRunHistory
                    taskId={taskId}
                    history={runHistory}
                    error={runHistoryError}
                  />
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

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
        onUpdated={() => {
          refresh();
          onUpdated?.();
        }}
      />
    </>
  );
}
