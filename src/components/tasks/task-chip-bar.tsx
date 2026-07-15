"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  Square,
  RotateCcw,
  ArrowRight,
  FastForward,
  Trash2,
  Pencil,
  Bot,
  FolderKanban,
  GitBranch,
  Clock,
  Heart,
  ArrowUp,
  ArrowDown,
  Minus,
  CalendarClock,
  CalendarCheck,
} from "lucide-react";
import { taskStatusVariant } from "@/lib/constants/status-colors";
import { MAX_RESUME_COUNT } from "@/lib/constants/task-status";
import { formatTimestamp } from "@/lib/utils/format-timestamp";
import type { TaskItem } from "./task-card";
import { getRuntimeCatalogEntry } from "@/lib/agents/runtime/catalog";

const priorityConfig: Record<number, { icon: typeof ArrowUp; label: string }> = {
  0: { icon: ArrowUp, label: "P0 Critical" },
  1: { icon: ArrowUp, label: "P1 High" },
  2: { icon: Minus, label: "P2 Medium" },
  3: { icon: ArrowDown, label: "P3 Low" },
};

interface TaskChipBarProps {
  task: TaskItem;
  loading: boolean;
  onEdit: () => void;
  onQueue: () => void;
  onRun: () => void;
  onCancel: () => void;
  onResume: () => void;
  onRetry: () => void;
  onDelete: () => void;
  targetReady?: boolean | null;
}

export function TaskChipBar({
  task,
  loading,
  onEdit,
  onQueue,
  onRun,
  onCancel,
  onResume,
  onRetry,
  onDelete,
  targetReady = true,
}: TaskChipBarProps) {
  const priority = priorityConfig[task.priority] ?? priorityConfig[2];
  const PriorityIcon = priority.icon;
  const requestedRuntimeLabel = task.assignedAgent
    ? getRuntimeCatalogEntry(task.assignedAgent as never).label
    : null;
  const effectiveRuntimeLabel = task.effectiveRuntimeId
    ? getRuntimeCatalogEntry(task.effectiveRuntimeId as never).label
    : null;

  const hasRelationships = task.projectId || task.workflowId || task.scheduleId;

  return (
    <div className="surface-control rounded-lg p-4 space-y-3">
      {/* Row 1: Title + Actions */}
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-lg font-semibold truncate flex-1 min-w-0">
          {task.title}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          {(task.status === "planned" || task.status === "queued") && (
            <Button size="sm" variant="outline" onClick={onEdit} disabled={loading}>
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
          {task.status === "planned" && (
            <Button size="sm" onClick={onQueue} disabled={loading}>
              <ArrowRight className="h-3.5 w-3.5 mr-1" />
              {loading ? "Queueing..." : "Queue"}
            </Button>
          )}
          {task.status === "queued" && (
            <Button
              size="sm"
              onClick={onRun}
              disabled={loading || targetReady !== true}
              title={targetReady === false ? "Edit the execution target before running" : undefined}
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              {loading ? "Starting..." : "Run"}
            </Button>
          )}
          {task.status === "running" && (
            <Button size="sm" variant="destructive" onClick={onCancel} disabled={loading}>
              <Square className="h-3.5 w-3.5 mr-1" />
              {loading ? "Cancelling..." : "Cancel"}
            </Button>
          )}
          {(task.status === "failed" || task.status === "cancelled") && (
            <>
              {task.sessionId && task.resumeCount < MAX_RESUME_COUNT && (
                <Button size="sm" onClick={onResume} disabled={loading}>
                  <FastForward className="h-3.5 w-3.5 mr-1" />
                  {loading ? "Resuming..." : "Resume"}
                </Button>
              )}
              <Button
                size="sm"
                variant={task.sessionId ? "outline" : "default"}
                onClick={onRetry}
                disabled={loading}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                {loading ? "Retrying..." : "Retry"}
              </Button>
            </>
          )}
          {task.status !== "running" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              disabled={loading}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete
            </Button>
          )}
        </div>
      </div>

      {/* Row 2: Metadata Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={taskStatusVariant[task.status] ?? "secondary"} className="text-xs">
          {task.status}
        </Badge>

        <Badge variant="outline" className="text-xs gap-1">
          <PriorityIcon className="h-3 w-3" />
          {priority.label}
        </Badge>

        {task.agentProfile && (
          <Badge variant="outline" className="text-xs gap-1">
            <Bot className="h-3 w-3" />
            {task.agentProfile}
          </Badge>
        )}

        {task.assignedAgent && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Bot className="h-3 w-3" />
            {requestedRuntimeLabel ?? task.assignedAgent}
          </Badge>
        )}

        {task.effectiveRuntimeId &&
          task.effectiveRuntimeId !== task.assignedAgent && (
            <Badge
              variant="outline"
              className="text-xs gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              title={task.runtimeFallbackReason ?? undefined}
            >
              <Bot className="h-3 w-3" />
              Ran on {effectiveRuntimeLabel ?? task.effectiveRuntimeId}
            </Badge>
          )}

        {task.runtimeFallbackReason && (
          <Badge
            variant="outline"
            className="text-xs border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            title={task.runtimeFallbackReason}
          >
            Fallback applied
          </Badge>
        )}

        {task.resumeCount > 0 && (
          <Badge variant="outline" className="text-xs">
            Resume {task.resumeCount}/{MAX_RESUME_COUNT}
          </Badge>
        )}

        <Badge
          variant="outline"
          className="text-xs font-normal"
          title={new Date(task.createdAt).toLocaleString()}
        >
          Created {formatTimestamp(task.createdAt)}
        </Badge>

        <Badge
          variant="outline"
          className="text-xs font-normal"
          title={new Date(task.updatedAt).toLocaleString()}
        >
          Updated {formatTimestamp(task.updatedAt)}
        </Badge>

        {task.usage?.startedAt && (
          <Badge
            variant="outline"
            className="text-xs font-normal gap-1"
            title={new Date(task.usage.startedAt).toLocaleString()}
          >
            <CalendarClock className="h-3 w-3" />
            Started {formatTimestamp(task.usage.startedAt)}
          </Badge>
        )}

        {task.usage?.finishedAt && (
          <Badge
            variant="outline"
            className="text-xs font-normal gap-1"
            title={new Date(task.usage.finishedAt).toLocaleString()}
          >
            <CalendarCheck className="h-3 w-3" />
            Finished {formatTimestamp(task.usage.finishedAt)}
          </Badge>
        )}
      </div>

      {/* Row 3: Relationship Links (only if any FK exists) */}
      {hasRelationships && (
        <div className="flex flex-wrap items-center gap-2">
          {task.projectId && (
            <Link href={`/projects/${task.projectId}`}>
              <Badge variant="secondary" className="text-xs hover:bg-accent gap-1">
                <FolderKanban className="h-3 w-3" />
                {task.projectName ?? "Project"}
              </Badge>
            </Link>
          )}
          {task.workflowId && (
            <Link href={`/workflows/${task.workflowId}`}>
              <Badge variant="secondary" className="text-xs hover:bg-accent gap-1">
                <GitBranch className="h-3 w-3" />
                {task.workflowName ?? "Workflow"}
              </Badge>
            </Link>
          )}
          {task.scheduleId && (
            <Link href="/schedules">
              <Badge variant="secondary" className="text-xs hover:bg-accent gap-1">
                {task.sourceType === "heartbeat" ? (
                  <Heart className="h-3 w-3 text-rose-500" />
                ) : (
                  <Clock className="h-3 w-3" />
                )}
                {task.scheduleName ?? "Schedule"}
              </Badge>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
