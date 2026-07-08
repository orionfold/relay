"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText } from "lucide-react";
import { workflowStatusVariant, patternLabels } from "@/lib/constants/status-colors";
import { getWorkflowIconFromName } from "@/lib/constants/card-icons";
import { FlagshipBadge, FlagshipIconWell } from "@/components/shared/flagship-card";

export interface WorkflowKanbanItem {
  type: "workflow";
  id: string;
  name: string;
  status: string;
  pattern: string;
  projectId?: string | null;
  projectName?: string;
  stepProgress: { current: number; total: number };
  currentStepName?: string;
  outputDocCount?: number;
  createdAt: string;
  updatedAt?: string;
}

interface WorkflowKanbanCardProps {
  workflow: WorkflowKanbanItem;
}

const statusStripBg: Record<string, string> = {
  draft: "bg-muted/40 border-t-border/30",
  active: "bg-status-running/8 border-t-status-running/15",
  completed: "bg-status-completed/10 border-t-status-completed/20",
  failed: "bg-status-failed/10 border-t-status-failed/20",
  paused: "bg-status-warning/8 border-t-status-warning/15",
};

export function WorkflowKanbanCard({ workflow }: WorkflowKanbanCardProps) {
  const isActive = workflow.status === "active";
  const isFailed = workflow.status === "failed";
  const wfIcon = getWorkflowIconFromName(workflow.name, workflow.pattern);
  const progressPct =
    workflow.stepProgress.total > 0
      ? (workflow.stepProgress.current / workflow.stepProgress.total) * 100
      : 0;

  return (
    <Link href={`/workflows/${workflow.id}`} className="block">
      <Card
        role="button"
        tone="blueprint"
        watermark={wfIcon.icon}
        watermarkColor={wfIcon.colors.icon}
        aria-label={`${workflow.name}, ${patternLabels[workflow.pattern] ?? workflow.pattern}, ${workflow.status}`}
        className={`surface-card group cursor-pointer gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md ${
          isFailed
            ? "border-l-4 border-l-destructive"
            : isActive
              ? "border-l-4 border-l-primary"
              : ""
        }`}
      >
        <div className="p-3">
          <div className="flex items-start gap-2">
            <FlagshipIconWell icon={wfIcon.icon} color={wfIcon.colors.icon} className="h-7 w-7" />
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
            </div>
          </div>
        </div>

        {/* Status strip */}
        <div className={`flex items-center h-7 px-3 border-t transition-colors ${statusStripBg[workflow.status] ?? statusStripBg.draft}`}>
          <Badge
            variant={workflowStatusVariant[workflow.status] ?? "secondary"}
            className="text-[11px] h-5"
          >
            {workflow.status}
          </Badge>
          {workflow.outputDocCount != null && workflow.outputDocCount > 0 && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
              <FileText className="h-3 w-3" />
              {workflow.outputDocCount}
            </span>
          )}
          <div className="flex-1" />
          <span className="text-[11px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            View →
          </span>
        </div>
      </Card>
    </Link>
  );
}
