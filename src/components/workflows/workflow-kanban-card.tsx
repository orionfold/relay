"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Loader2, FileText } from "lucide-react";
import { patternLabels } from "@/lib/constants/status-colors";
import { getWorkflowIconFromName } from "@/lib/constants/card-icons";
import { FlagshipBadge } from "@/components/shared/flagship-card";
import { CardStatusToolbar } from "@/components/shared/card-status-toolbar";
import { Button } from "@/components/ui/button";
import { Play, RotateCcw, Square } from "lucide-react";
import { getWorkflowExecutionInfo } from "@/lib/workflows/execution-status";

export interface WorkflowKanbanItem {
  type: "workflow";
  id: string;
  name: string;
  status: string;
  effectiveStatus?: string;
  liveTaskCount?: number;
  pattern: string;
  projectId?: string | null;
  projectName?: string;
  stepProgress: { current: number; total: number };
  currentStepName?: string;
  waitingStepName?: string;
  outputDocCount?: number;
  createdAt: string;
  updatedAt?: string;
}

interface WorkflowKanbanCardProps {
  workflow: WorkflowKanbanItem;
  onRun?: (workflow: WorkflowKanbanItem) => void;
  onStop?: (workflow: WorkflowKanbanItem) => void;
}

export function WorkflowKanbanCard({ workflow, onRun, onStop }: WorkflowKanbanCardProps) {
  const router = useRouter();
  const execution = getWorkflowExecutionInfo({
    status: workflow.status,
    liveTaskCount: workflow.liveTaskCount,
    stepStates: workflow.effectiveStatus === "waiting" ? [{ status: "waiting_approval" }] : [],
  });
  const isActive = execution.status === "running";
  const isFailed = workflow.status === "failed";
  const wfIcon = getWorkflowIconFromName(workflow.name, workflow.pattern);
  const progressPct =
    workflow.stepProgress.total > 0
      ? (workflow.stepProgress.current / workflow.stepProgress.total) * 100
      : 0;

  const openWorkflow = () => router.push(`/workflows/${workflow.id}`);
  const runLabel =
    execution.status === "draft" ? "Review & run" : "Review & re-run";

  return (
      <Card
        role="button"
        tabIndex={0}
        tone="blueprint"
        watermark={wfIcon.icon}
        watermarkColor={wfIcon.colors.icon}
        interactive
        aria-label={`${workflow.name}, ${patternLabels[workflow.pattern] ?? workflow.pattern}, ${execution.label}`}
        onClick={openWorkflow}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openWorkflow();
          }
        }}
        className={`surface-card group gap-0 overflow-hidden py-0 ${
          isFailed
            ? "border-l-4 border-l-destructive"
            : isActive
              ? "border-l-4 border-l-primary"
              : ""
        }`}
      >
        <div className="p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold">{workflow.name}</p>
              {workflow.projectName && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {workflow.projectName}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                <FlagshipBadge tone={isFailed ? "danger" : isActive ? "primary" : "muted"}>
                  {patternLabels[workflow.pattern] ?? workflow.pattern}
                </FlagshipBadge>
                {workflow.stepProgress.total > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {workflow.stepProgress.current}/{workflow.stepProgress.total}
                  </span>
                )}
              </div>

              {/* Progress bar */}
              {workflow.stepProgress.total > 0 && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isFailed ? "bg-destructive" : "bg-primary"
                    }`}
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              )}

              {/* Current step indicator */}
              {isActive && workflow.currentStepName && (
                <div className="flex items-center gap-1 mt-1.5">
                  <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">
                    {workflow.currentStepName}
                  </span>
                </div>
              )}
              {execution.status === "waiting" && workflow.waitingStepName && (
                <p className="mt-1.5 truncate text-xs text-status-warning">
                  Waiting: {workflow.waitingStepName}
                </p>
              )}
            </div>
          </div>
        </div>

        <CardStatusToolbar
          status={execution.status}
          family="lifecycle"
          meta={
            workflow.outputDocCount != null && workflow.outputDocCount > 0 ? (
            <span className="flex items-center gap-0.5">
              <FileText className="h-3 w-3" />
              {workflow.outputDocCount}
            </span>
            ) : null
          }
          actions={
          <div
            className="flex items-center gap-1"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {execution.canStop && onStop ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 gap-1 px-1.5 text-[11px] text-destructive hover:text-destructive"
                onClick={() => onStop(workflow)}
                aria-label={`Stop workflow ${workflow.name}`}
              >
                <Square className="h-3 w-3" />
                Stop
              </Button>
            ) : execution.canRun && onRun ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 gap-1 px-1.5 text-[11px]"
                onClick={() => onRun(workflow)}
                aria-label={`${runLabel} workflow ${workflow.name}`}
              >
                {runLabel === "Review & re-run" ? (
                  <RotateCcw className="h-3 w-3" />
                ) : (
                  <Play className="h-3 w-3" />
                )}
                {runLabel}
              </Button>
            ) : (
              <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                View →
              </span>
            )}
          </div>
          }
        />
      </Card>
  );
}
