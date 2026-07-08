"use client";

import { useState, useEffect, useRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Bot, ArrowUp, ArrowDown, Minus, Trash2, Check, X, Loader2, Square, CheckSquare, Pencil, FileText, Clock } from "lucide-react";
import { formatCompactDateTime } from "@/lib/utils/format-timestamp";
import { StatusChip } from "@/components/shared/status-chip";

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  assignedAgent: string | null;
  agentProfile: string | null;
  effectiveRuntimeId?: string | null;
  effectiveModelId?: string | null;
  runtimeFallbackReason?: string | null;
  projectId: string | null;
  projectName?: string;
  workflowId: string | null;
  scheduleId: string | null;
  sourceType: string | null;
  workflowName?: string;
  scheduleName?: string;
  result: string | null;
  sessionId: string | null;
  resumeCount: number;
  createdAt: string;
  updatedAt: string;
  docCount?: number;
  usage?: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
    costMicros: number | null;
    modelId: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  };
}

interface TaskCardProps {
  task: TaskItem;
  onClick: (task: TaskItem) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onSelect?: (taskId: string, selected: boolean) => void;
  onDelete?: (taskId: string) => void;
  onEdit?: (task: TaskItem) => void;
}

const priorityConfig: Record<number, { color: string; label: string; Icon: typeof ArrowUp }> = {
  0: { color: "text-priority-critical", label: "Critical", Icon: ArrowUp },
  1: { color: "text-priority-high", label: "High", Icon: ArrowUp },
  2: { color: "text-priority-medium", label: "Medium", Icon: Minus },
  3: { color: "text-priority-low", label: "Low", Icon: ArrowDown },
};

const priorityStripBg: Record<number, string> = {
  0: "bg-priority-critical/10 border-t-priority-critical/20",
  1: "bg-priority-high/10 border-t-priority-high/20",
  2: "bg-priority-medium/8 border-t-priority-medium/15",
  3: "bg-priority-low/6 border-t-priority-low/10",
};

export function TaskCard({
  task,
  onClick,
  selectionMode = false,
  selected = false,
  onSelect,
  onDelete,
  onEdit,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: task.id,
      data: { status: task.status },
      disabled: selectionMode,
    });

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const revertTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // Auto-revert inline confirmation after 3 seconds
  useEffect(() => {
    if (confirmingDelete) {
      revertTimer.current = setTimeout(() => setConfirmingDelete(false), 3000);
      return () => { if (revertTimer.current) clearTimeout(revertTimer.current); };
    }
  }, [confirmingDelete]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isFailed = task.status === "failed";
  const isRunning = task.status === "running";
  const priority = priorityConfig[task.priority] ?? priorityConfig[3];
  const showFooterStatus = task.status === "running" || task.status === "completed" || task.status === "failed";

  function handleTrashClick(e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmingDelete(true);
  }

  async function handleConfirmDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (revertTimer.current) clearTimeout(revertTimer.current);
    setDeleting(true);
    onDelete?.(task.id);
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (revertTimer.current) clearTimeout(revertTimer.current);
    setConfirmingDelete(false);
  }

  const showDeleteButton = onDelete && !isRunning;
  const isEditable = (task.status === "planned" || task.status === "queued") && !!onEdit;

  // Status-contextual date: planned→createdAt, running→startedAt, completed/failed→finishedAt
  const relevantDate =
    task.status === "planned" || task.status === "queued"
      ? task.createdAt
      : task.status === "running"
        ? task.usage?.startedAt ?? task.updatedAt
        : task.usage?.finishedAt ?? task.updatedAt;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...(selectionMode ? {} : { ...attributes, ...listeners })}
      role="button"
      aria-label={`${task.title}, ${priority.label} priority, ${task.status}`}
      className={`surface-card cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md group overflow-hidden py-0 gap-0 ${
        isDragging ? "opacity-50 shadow-lg" : ""
      } ${isFailed ? "border-l-4 border-l-destructive" : ""} ${
        selectionMode ? "cursor-pointer hover:bg-accent/50 hover:ring-1 hover:ring-primary/30" : ""
      } ${selected ? "ring-2 ring-primary" : ""}`}
      onClick={() => {
        if (selectionMode) {
          onSelect?.(task.id, !selected);
        } else {
          onClick(task);
        }
      }}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <priority.Icon
            className={`mt-1 h-3.5 w-3.5 shrink-0 ${priority.color}`}
            aria-label={`${priority.label} priority`}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium line-clamp-2">{task.title}</p>
            {task.projectName && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.projectName}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              {task.agentProfile && (
                <Badge variant="outline" className="text-xs gap-1 max-w-[120px]">
                  <Bot className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{task.agentProfile}</span>
                </Badge>
              )}
              {task.assignedAgent && (
                <Badge variant="secondary" className="text-xs gap-1 max-w-[120px]">
                  <Bot className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{task.assignedAgent}</span>
                </Badge>
              )}
              {task.docCount != null && task.docCount > 0 && (
                <Badge variant="outline" className="text-xs gap-1 h-5">
                  <FileText className="h-3 w-3 shrink-0" />
                  {task.docCount}
                </Badge>
              )}
              {isFailed && <AlertCircle className="h-3.5 w-3.5 text-destructive" aria-label="Task failed" />}
              {isRunning && (
                <span className="flex h-2 w-2" aria-label="Task running">
                  <span className="animate-ping absolute h-2 w-2 rounded-full bg-primary/60 opacity-75" />
                  <span className="relative rounded-full h-2 w-2 bg-primary" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Priority strip toolbar */}
      <div className={`flex items-center h-7 px-3 border-t transition-colors ${
        priorityStripBg[task.priority] ?? priorityStripBg[3]
      }`}>
        {selectionMode ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect?.(task.id, !selected); }}
            className={`p-0.5 rounded cursor-pointer transition-colors ${
              selected
                ? "text-primary"
                : "text-muted-foreground/70 hover:text-foreground"
            }`}
            aria-label={`Select ${task.title}`}
          >
            {selected ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        ) : (showDeleteButton || isEditable) ? (
          confirmingDelete ? (
            <div className="flex items-center gap-1.5 text-xs w-full">
              <span className="text-destructive font-medium">Delete?</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="p-0.5 rounded hover:bg-destructive/10 text-destructive cursor-pointer"
                aria-label="Confirm delete"
              >
                {deleting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={handleCancelDelete}
                className="p-0.5 rounded hover:bg-muted text-muted-foreground cursor-pointer"
                aria-label="Cancel delete"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              {isEditable && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEdit!(task); }}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-opacity cursor-pointer"
                  aria-label={`Edit ${task.title}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              <span
                className="flex min-w-0 flex-1 items-center gap-1 truncate text-[11px] font-medium tabular-nums text-muted-foreground"
                title={new Date(relevantDate).toLocaleString()}
              >
                <Clock className="h-3 w-3 shrink-0" />
                {formatCompactDateTime(relevantDate)}
              </span>
              {showFooterStatus && (
                <StatusChip
                  status={task.status}
                  family="lifecycle"
                  className="h-5 shrink-0 text-[11px] font-medium"
                />
              )}
              {showDeleteButton && (
                <button
                  type="button"
                  onClick={handleTrashClick}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity cursor-pointer"
                  aria-label={`Delete ${task.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )
        ) : (
          <>
            <span
              className="flex min-w-0 flex-1 items-center gap-1 truncate text-[11px] font-medium tabular-nums text-muted-foreground"
              title={new Date(relevantDate).toLocaleString()}
            >
              <Clock className="h-3 w-3 shrink-0" />
              {formatCompactDateTime(relevantDate)}
            </span>
            {showFooterStatus && (
              <StatusChip
                status={task.status}
                family="lifecycle"
                className="h-5 shrink-0 text-[11px] font-medium"
              />
            )}
          </>
        )}
      </div>
    </Card>
  );
}
