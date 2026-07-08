"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { GitBranch, Pencil, Copy, RotateCcw, Trash2, FileCog, Play, Square } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { workflowStatusVariant, patternLabels } from "@/lib/constants/status-colors";
import { getWorkflowIconFromName } from "@/lib/constants/card-icons";
import { FlagshipBadge, FlagshipIconWell } from "@/components/shared/flagship-card";
import { getWorkflowExecutionInfo } from "@/lib/workflows/execution-status";

interface Workflow {
  id: string;
  name: string;
  status: string;
  projectId: string | null;
  definition: string;
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
  liveTaskCount?: number;
  outputDocCount?: number;
  runNumber?: number;
}

interface WorkflowListProps {
  projects: { id: string; name: string }[];
}

function getPattern(definitionJson: string): string {
  try {
    const def = JSON.parse(definitionJson);
    return def.pattern ?? "unknown";
  } catch {
    return "unknown";
  }
}

function getStepCount(definitionJson: string): number {
  try {
    const def = JSON.parse(definitionJson);
    return def.steps?.length ?? 0;
  } catch {
    return 0;
  }
}

function getPromptPreview(definitionJson: string): string {
  try {
    const def = JSON.parse(definitionJson);
    const prompt = def.steps?.[0]?.prompt ?? "";
    return prompt.length > 80 ? prompt.slice(0, 80) + "\u2026" : prompt;
  } catch {
    return "";
  }
}

export function WorkflowList({ projects }: WorkflowListProps) {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/workflows");
    if (res.ok) setWorkflows(await res.json());
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    const res = await fetch(`/api/workflows/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Workflow deleted");
      refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to delete workflow");
    }
  }

  async function handleRunWorkflow(id: string) {
    const res = await fetch(`/api/workflows/${id}/execute`, { method: "POST" });
    if (res.ok) {
      toast.success("Workflow started");
      router.push(`/workflows/${id}`);
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to run workflow");
    }
  }

  async function handleStopWorkflow(id: string) {
    const res = await fetch(`/api/workflows/${id}/stop`, { method: "POST" });
    if (res.ok) {
      toast.success("Workflow stopped");
      refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to stop workflow");
    }
  }

  const templates = workflows.filter((wf) => wf.status === "draft");
  const runs = workflows.filter((wf) => wf.status !== "draft");

  return (
    <div>
      {!loaded ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-live="polite">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={GitBranch}
          heading="No workflows yet"
          description="Create a workflow to chain agent tasks together."
        />
      ) : (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList>
            <TabsTrigger value="all" className="text-sm">
              All ({workflows.length})
            </TabsTrigger>
            <TabsTrigger value="templates" className="text-sm">
              <FileCog className="h-3.5 w-3.5 mr-1" />
              Templates ({templates.length})
            </TabsTrigger>
            <TabsTrigger value="runs" className="text-sm">
              <Play className="h-3.5 w-3.5 mr-1" />
              Runs ({runs.length})
            </TabsTrigger>
          </TabsList>

          {["all", "templates", "runs"].map((tab) => {
            const tabWorkflows = tab === "templates" ? templates : tab === "runs" ? runs : workflows;
            return (
              <TabsContent key={tab} value={tab}>
                {tabWorkflows.length === 0 ? (
                  <EmptyState
                    icon={tab === "templates" ? FileCog : Play}
                    heading={`No ${tab === "all" ? "workflows" : tab} yet`}
                    description={tab === "templates" ? "Create a draft workflow to use as a template." : "Run a workflow to see it here."}
                  />
                ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tabWorkflows.map((wf) => {
            const pattern = getPattern(wf.definition);
            const stepCount = getStepCount(wf.definition);
            const promptPreview = getPromptPreview(wf.definition);
            const wfIcon = getWorkflowIconFromName(wf.name, pattern);
            const parsedState = (() => {
              try {
                return JSON.parse(wf.definition)._state?.stepStates as Array<{ status: string }> | undefined;
              } catch {
                return undefined;
              }
            })();
            const execution = getWorkflowExecutionInfo({
              status: wf.status,
              liveTaskCount: wf.liveTaskCount,
              stepStates: parsedState,
            });
            const runLabel =
              wf.status === "completed" || wf.status === "failed"
                ? "Re-run"
                : wf.status === "active"
                  ? "Restart"
                  : "Run workflow";
            return (
              <Card
                key={wf.id}
                tabIndex={0}
                tone="blueprint"
                watermark={wfIcon.icon}
                watermarkColor={wfIcon.colors.icon}
                interactive
                className="elevation-1 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                onClick={() => router.push(`/workflows/${wf.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/workflows/${wf.id}`); } }}
              >
                <CardHeader className="pb-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <FlagshipIconWell icon={wfIcon.icon} color={wfIcon.colors.icon} />
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="min-w-0 truncate text-base font-semibold">
                        {wf.name}
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <FlagshipBadge icon={FileCog} tone={execution.status === "draft" ? "muted" : "primary"}>
                          {patternLabels[pattern] ?? pattern}
                        </FlagshipBadge>
                        <Badge variant={workflowStatusVariant[execution.status] ?? "secondary"}>
                          {execution.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{stepCount} step{stepCount !== 1 ? "s" : ""}</span>
                    {wf.taskCount != null && wf.taskCount > 0 && (
                      <>
                        <span className="text-muted-foreground">&middot;</span>
                        <span>{wf.taskCount} task{wf.taskCount !== 1 ? "s" : ""}</span>
                      </>
                    )}
                    {wf.outputDocCount != null && wf.outputDocCount > 0 && (
                      <>
                        <span className="text-muted-foreground">&middot;</span>
                        <span>{wf.outputDocCount} doc{wf.outputDocCount !== 1 ? "s" : ""}</span>
                      </>
                    )}
                  </div>
                  {promptPreview && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1.5">
                      {promptPreview}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      {wf.runNumber != null && wf.runNumber > 0 && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Run #{wf.runNumber}
                        </Badge>
                      )}
                    </div>
                    <TooltipProvider>
                      <div
                        className="flex flex-wrap items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {execution.canStop && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
                            aria-label={`Stop workflow ${wf.name}`}
                            onClick={() => handleStopWorkflow(wf.id)}
                          >
                            <Square className="h-3.5 w-3.5" />
                            Stop
                          </Button>
                        )}
                        {execution.canRun && !execution.canStop && (
                          <Button
                            type="button"
                            variant={wf.status === "draft" || wf.status === "paused" ? "default" : "outline"}
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-xs"
                            aria-label={`${runLabel} workflow ${wf.name}`}
                            onClick={() => handleRunWorkflow(wf.id)}
                          >
                            {runLabel === "Re-run" || runLabel === "Restart" ? (
                              <RotateCcw className="h-3.5 w-3.5" />
                            ) : (
                              <Play className="h-3.5 w-3.5" />
                            )}
                            {runLabel}
                          </Button>
                        )}
                        {(wf.status === "draft" || wf.status === "completed" || wf.status === "failed") && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Edit workflow"
                                onClick={() => router.push(`/workflows/${wf.id}/edit`)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Edit</TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label="Clone workflow"
                              onClick={() => router.push(`/workflows/${wf.id}/edit?clone=true`)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Clone</TooltipContent>
                        </Tooltip>
                        {!execution.canStop && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                aria-label="Delete workflow"
                                onClick={() => setConfirmDeleteId(wf.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TooltipProvider>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}
        title="Delete Workflow"
        description="This will permanently delete this workflow and cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        destructive
      />
    </div>
  );
}
