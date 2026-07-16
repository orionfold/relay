"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Shield, Workflow as WorkflowIcon, FilePen, Pause, CheckCircle2 } from "lucide-react";
import { taskStatusVariant, workflowStatusVariant } from "@/lib/constants/status-colors";

export interface PriorityTask {
  id: string;
  title: string;
  status: string;
  priority: number;
  projectName?: string;
  isWorkflow?: boolean;
  workflowProgress?: {
    current: number;
    total: number;
    currentStepName?: string;
    workflowId: string;
    workflowStatus: string;
  };
}

interface PriorityQueueProps {
  tasks: PriorityTask[];
}

const statusIcon: Record<string, typeof AlertTriangle> = {
  failed: AlertTriangle,
  running: Clock,
};

const workflowStatusIcon: Record<string, typeof AlertTriangle> = {
  draft: FilePen,
  active: WorkflowIcon,
  paused: Pause,
  completed: CheckCircle2,
  failed: AlertTriangle,
};

const priorityColors = ["text-priority-critical", "text-priority-high", "text-status-warning", "text-muted-foreground"];

export function PriorityQueue({ tasks }: PriorityQueueProps) {
  if (tasks.length === 0) {
    return (
      <p
        className="py-4 text-center text-sm text-muted-foreground"
        aria-live="polite"
      >
        No tasks or workflows need attention right now.
      </p>
    );
  }

  return (
    <div className="space-y-0.5" aria-live="polite">
      {tasks.map((task) => {
              // Workflow items use workflow-specific status icons; tasks use task status icons
              const Icon = task.isWorkflow
                ? workflowStatusIcon[task.status] ?? WorkflowIcon
                : statusIcon[task.status] ?? Shield;
              const linkHref = task.isWorkflow
                ? `/workflows/${task.workflowProgress?.workflowId ?? task.id}`
                : `/tasks/${task.id}`;

              return (
                <Link
                  key={task.id}
                  href={linkHref}
                  data-interactive-surface=""
                  data-interactive-outline="preserve"
                  className="interactive-list-item -mx-1 flex items-center gap-2.5 rounded-md border-b border-border/50 px-1 py-2 last:border-b-0"
                >
                  <Icon className={`h-4 w-4 flex-shrink-0 ${
                    task.isWorkflow ? "text-primary" : priorityColors[task.priority] ?? priorityColors[3]
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    {task.projectName && (
                      <p className="text-xs text-muted-foreground">{task.projectName}</p>
                    )}
                    {task.workflowProgress && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {task.workflowProgress.current}/{task.workflowProgress.total}
                        </span>
                        {task.workflowProgress.currentStepName && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            {task.workflowProgress.currentStepName}
                          </span>
                        )}
                        {/* Mini progress bar */}
                        <div className="h-1 flex-1 max-w-16 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${(task.workflowProgress.current / task.workflowProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <Badge variant={
                    task.isWorkflow
                      ? workflowStatusVariant[task.status] ?? "secondary"
                      : taskStatusVariant[task.status] ?? "secondary"
                  } className="shrink-0 text-[10px]">
                    {task.status}
                  </Badge>
                </Link>
              );
      })}
    </div>
  );
}
