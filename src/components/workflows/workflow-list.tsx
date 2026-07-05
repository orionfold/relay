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
import { GitBranch, Pencil, Copy, RotateCcw, Trash2, FileCog, Play } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { workflowStatusVariant, patternLabels } from "@/lib/constants/status-colors";
import { getWorkflowIconFromName } from "@/lib/constants/card-icons";
import { StatusChip } from "@/components/shared/status-chip";

interface Workflow {
  id: string;
  name: string;
  status: string;
  projectId: string | null;
  definition: string;
  createdAt: string;
  updatedAt: string;
  taskCount?: number;
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

  async function handleRerun(id: string) {
    const res = await fetch(`/api/workflows/${id}/execute`, { method: "POST" });
    if (res.ok) {
      toast.success("Workflow re-started");
      router.push(`/workflows/${id}`);
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to re-run workflow");
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
            return (
              <Card
                key={wf.id}
                tabIndex={0}
                tone="blueprint"
                watermark={wfIcon.icon}
                watermarkColor={wfIcon.colors.icon}
                className="elevation-1 cursor-pointer transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
                onClick={() => router.push(`/workflows/${wf.id}`)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/workflows/${wf.id}`); } }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="min-w-0 truncate text-base font-medium">{wf.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{patternLabels[pattern] ?? pattern}</span>
                    <span>&middot;</span>
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
                      <Badge variant={workflowStatusVariant[wf.status] ?? "secondary"}>
                        {wf.status}
                      </Badge>
                      {wf.runNumber != null && wf.runNumber > 0 && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          Run #{wf.runNumber}
                        </Badge>
                      )}
                    </div>
                    <TooltipProvider>
                      <div className="flex items-center gap-1">
                        {(wf.status === "draft" || wf.status === "completed" || wf.status === "failed") && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Edit workflow"
                                onClick={(e) => { e.stopPropagation(); router.push(`/workflows/${wf.id}/edit`); }}
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
                              onClick={(e) => { e.stopPropagation(); router.push(`/workflows/${wf.id}/edit?clone=true`); }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Clone</TooltipContent>
                        </Tooltip>
                        {(wf.status === "completed" || wf.status === "failed") && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Re-run workflow"
                                onClick={(e) => { e.stopPropagation(); handleRerun(wf.id); }}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Re-run</TooltipContent>
                          </Tooltip>
                        )}
                        {wf.status !== "active" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                aria-label="Delete workflow"
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(wf.id); }}
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
