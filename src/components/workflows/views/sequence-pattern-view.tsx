"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle,
  Circle,
  Loader2,
  XCircle,
  ShieldQuestion,
  Clock3,
  GitBranch,
  MessageSquareMore,
  FileText,
  Paperclip,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { SwarmDashboard } from "../swarm-dashboard";
import { WorkflowFullOutput } from "../workflow-full-output";
import { DelayStepBody } from "../delay-step-body";
import { WorkflowHeader } from "../shared/workflow-header";
import { ExpandableResult, DocumentList } from "../shared/step-result";
import type {
  WorkflowStatusResponse,
  WorkflowStatusDocument,
  StepWithState,
} from "@/lib/workflows/types";

const stepStatusIcons: Record<string, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  running: <Loader2 className="h-4 w-4 text-status-running animate-spin" />,
  completed: <CheckCircle className="h-4 w-4 text-status-completed" />,
  failed: <XCircle className="h-4 w-4 text-destructive" />,
  waiting_approval: <ShieldQuestion className="h-4 w-4 text-status-warning" />,
  waiting_dependencies: <Clock3 className="h-4 w-4 text-status-warning" />,
  delayed: <Clock3 className="h-4 w-4 text-status-warning" />,
};

/**
 * Non-loop workflow subview. Consumes the sequence/parallel/swarm/
 * planner-executor/checkpoint arm of the status API discriminated union.
 * Renders either a sequential step list (with delay-step support), a parallel
 * branches + synthesis layout, or delegates to SwarmDashboard — all three
 * share the same `steps: StepWithState[]` shape, so branching stays inside
 * this subview.
 *
 * Optimistic Execute/Rerun state is owned here so the Execute button can flip
 * immediately without a round-trip through the router. The hook's `setData`
 * is the mechanism for pushing optimistic state back into the shared polling
 * cache; subsequent poll ticks will overwrite it with authoritative data.
 *
 * Per TDR-031, this subview never touches `.state` on anything except
 * `StepWithState` (which by the union's type guarantees `.state` is present).
 */
export function SequencePatternView({
  data,
  setData,
  onRefresh,
  onRequestDelete,
}: {
  data: Extract<WorkflowStatusResponse, { pattern: Exclude<WorkflowStatusResponse["pattern"], "loop"> }>;
  setData: (updater: (current: WorkflowStatusResponse | null) => WorkflowStatusResponse | null) => void;
  onRefresh: () => Promise<void>;
  onRequestDelete: () => void;
}) {
  const [executing, setExecuting] = useState(false);

  const handleExecute = useCallback(async () => {
    setExecuting(true);
    // Optimistic update — immediately show "active" status so the UI doesn't
    // feel laggy while the POST and next poll tick complete.
    setData((current) => {
      if (!current || current.pattern === "loop") return current;
      return {
        ...current,
        status: "active",
        steps: current.steps.map((step, index): StepWithState => {
          if (current.pattern === "swarm") {
            const lastIndex = current.steps.length - 1;
            return {
              ...step,
              state: {
                ...step.state,
                status:
                  index === 0
                    ? "running"
                    : index === lastIndex
                      ? "waiting_dependencies"
                      : "pending",
              },
            };
          }
          if (current.pattern === "parallel") {
            const isJoin = !!step.dependsOn?.length;
            return {
              ...step,
              state: {
                ...step.state,
                status: isJoin
                  ? "waiting_dependencies"
                  : index === 0
                    ? "running"
                    : "pending",
              },
            };
          }
          return index === 0
            ? { ...step, state: { ...step.state, status: "running" } }
            : step;
        }),
      };
    });
    try {
      const res = await fetch(`/api/workflows/${data.id}/execute`, { method: "POST" });
      if (res.ok) {
        toast.success("Workflow started");
        await onRefresh();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to start workflow");
        await onRefresh(); // Revert optimistic update on failure
      }
    } finally {
      setExecuting(false);
    }
  }, [data.id, onRefresh, setData]);

  const handleRerun = useCallback(async () => {
    setExecuting(true);
    try {
      const res = await fetch(`/api/workflows/${data.id}/execute`, { method: "POST" });
      if (res.ok) {
        toast.success("Workflow re-started");
        await onRefresh();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to re-run workflow");
      }
    } finally {
      setExecuting(false);
    }
  }, [data.id, onRefresh]);

  const handleStop = useCallback(async () => {
    setExecuting(true);
    try {
      const res = await fetch(`/api/workflows/${data.id}/stop`, { method: "POST" });
      if (res.ok) {
        toast.success("Workflow stopped");
        await onRefresh();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to stop workflow");
      }
    } finally {
      setExecuting(false);
    }
  }, [data.id, onRefresh]);

  // At this point on the non-loop arm, `state` is guaranteed present — no
  // optional chaining needed. This is the AC that PR #6's optional chaining
  // patched; the discriminated union makes the patch unnecessary.
  const completedStepOutputs = data.steps
    .filter((s) => s.state.result && s.state.status === "completed")
    .map((s) => ({ name: s.name, result: s.state.result! }));

  const hasStepDocs = !!data.stepDocuments && Object.keys(data.stepDocuments).length > 0;
  const hasParentDocs = !!data.parentDocuments && data.parentDocuments.length > 0;

  const parallelBranches =
    data.pattern === "parallel"
      ? data.steps.filter((step) => !step.dependsOn?.length)
      : [];
  const synthesisStep =
    data.pattern === "parallel"
      ? (data.steps.find((step) => step.dependsOn?.length) ?? null)
      : null;

  return (
    <div className="space-y-6">
      <Card>
        <WorkflowHeader
          data={data}
          executing={executing}
          canExecute={true}
          onExecute={handleExecute}
          onRerun={handleRerun}
          onStop={handleStop}
          onDelete={onRequestDelete}
        />
        <CardContent>
          {data.pattern === "swarm" ? (
            <SwarmDashboard
              workflowId={data.id}
              workflowStatus={data.status}
              steps={data.steps}
              swarmConfig={data.swarmConfig}
              onRefresh={onRefresh}
              stepStatusIcons={stepStatusIcons}
            />
          ) : (
            <div className="space-y-4" aria-live="polite">
              {data.pattern === "parallel" && parallelBranches.length > 0 ? (
                <>
                  <section className="space-y-3">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm font-medium">Parallel Branches</p>
                      <Badge variant="secondary" className="text-xs">
                        {parallelBranches.length}
                      </Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {parallelBranches.map((step, index) => (
                        <div
                          key={step.id}
                          className="surface-card-muted rounded-lg border border-border/50 p-4"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {stepStatusIcons[step.state.status] ?? stepStatusIcons.pending}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[11px]">
                                  Branch {index + 1}
                                </Badge>
                                <span className="text-sm font-medium">{step.name}</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {step.prompt}
                              </p>
                              {step.state.error && (
                                <p className="mt-2 text-xs text-destructive">
                                  {step.state.error}
                                </p>
                              )}
                              {step.state.result && step.state.status === "completed" && (
                                <ExpandableResult result={step.state.result} />
                              )}
                              {step.state.taskId && data.stepDocuments?.[step.state.taskId] && (
                                <DocumentList
                                  docs={data.stepDocuments[step.state.taskId]}
                                  label="Generated Files"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {synthesisStep && (
                    <section className="space-y-3">
                      <div className="flex items-center gap-2">
                        <MessageSquareMore className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">Synthesis Step</p>
                      </div>
                      <div className="surface-card-muted rounded-lg border border-border/50 p-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {stepStatusIcons[synthesisStep.state.status] ??
                              stepStatusIcons.pending}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[11px]">
                                join
                              </Badge>
                              <span className="text-sm font-medium">
                                {synthesisStep.name}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                              {synthesisStep.prompt}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Waits for all {parallelBranches.length} branches before running.
                            </p>
                            {synthesisStep.state.error && (
                              <p className="mt-2 text-xs text-destructive">
                                {synthesisStep.state.error}
                              </p>
                            )}
                            {synthesisStep.state.result &&
                              synthesisStep.state.status === "completed" && (
                                <ExpandableResult result={synthesisStep.state.result} />
                              )}
                            {synthesisStep.state.taskId && data.stepDocuments?.[synthesisStep.state.taskId] && (
                              <DocumentList
                                docs={data.stepDocuments[synthesisStep.state.taskId]}
                                label="Generated Files"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {data.steps.map((step, index) => {
                    const isDelayStep = !!step.delayDuration;
                    const isActiveDelay = isDelayStep && step.state.status === "delayed";
                    return (
                      <div key={`${step.id}-${index}`} className="flex items-start gap-3">
                        <div className="mt-0.5 flex flex-col items-center">
                          {isDelayStep && step.state.status === "pending" ? (
                            <Clock3 className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            stepStatusIcons[step.state.status] ?? stepStatusIcons.pending
                          )}
                          {index < data.steps.length - 1 && (
                            <div className="mt-1 h-6 w-px bg-border" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{step.name}</span>
                            {isDelayStep && (
                              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                                Delay
                              </Badge>
                            )}
                            {step.requiresApproval && !isDelayStep && (
                              <Badge variant="outline" className="text-xs">
                                checkpoint
                              </Badge>
                            )}
                          </div>
                          {isDelayStep ? (
                            <DelayStepBody
                              workflowId={data.id}
                              delayDuration={step.delayDuration!}
                              stepStatus={step.state.status}
                              resumeAt={isActiveDelay ? data.resumeAt ?? null : null}
                            />
                          ) : (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <p className="text-xs text-muted-foreground truncate">
                                {step.prompt.slice(0, 100)}
                                {step.prompt.length > 100 ? "..." : ""}
                              </p>
                              {step.state.taskId && (
                                <a
                                  href={`/tasks/${step.state.taskId}`}
                                  className="text-[10px] text-primary hover:underline shrink-0"
                                >
                                  view task
                                </a>
                              )}
                            </div>
                          )}
                          {hasParentDocs && index === 0 && !isDelayStep && (
                            <div className="flex items-center gap-1 mt-1">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {data.parentDocuments!.length} doc{data.parentDocuments!.length !== 1 ? "s" : ""} attached
                              </Badge>
                            </div>
                          )}
                          {step.state.error && (
                            <p className="text-xs text-destructive mt-1">
                              {step.state.error}
                            </p>
                          )}
                          {step.state.result && step.state.status === "completed" && !isDelayStep && (
                            <ExpandableResult result={step.state.result} />
                          )}
                          {step.state.taskId && data.stepDocuments?.[step.state.taskId] && (
                            <DocumentList
                              docs={data.stepDocuments[step.state.taskId]}
                              label="Generated Files"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {(hasParentDocs || hasStepDocs) && (
            <div className="mt-6 pt-4 border-t border-border/50">
              <div className="flex items-center gap-2 mb-3">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Documents</p>
              </div>
              {hasParentDocs && (
                <DocumentList docs={data.parentDocuments!} label="Input Files" />
              )}
              {hasStepDocs &&
                Object.entries(data.stepDocuments!).map(([taskId, docs]) => {
                  const step = data.steps.find((s) => s.state.taskId === taskId);
                  return (
                    <DocumentList
                      key={taskId}
                      docs={docs}
                      label={step ? `Output: ${step.name}` : "Output Files"}
                    />
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {data.status === "completed" && completedStepOutputs.length > 0 && (
        <WorkflowFullOutput workflowName={data.name} steps={completedStepOutputs} />
      )}

      {data.status === "completed" && hasStepDocs && (
        <OutputDock stepDocuments={data.stepDocuments!} steps={data.steps} />
      )}
    </div>
  );
}

/** Output Dock — selectable output documents for chaining into a new workflow */
function OutputDock({
  stepDocuments,
  steps,
}: {
  stepDocuments: Record<string, WorkflowStatusDocument[]>;
  steps: StepWithState[];
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allOutputDocs = Object.entries(stepDocuments).flatMap(([taskId, docs]) => {
    const step = steps.find((s) => s.state.taskId === taskId);
    return docs.map((doc) => ({
      ...doc,
      stepName: step?.name ?? "Unknown Step",
    }));
  });

  if (allOutputDocs.length === 0) return null;

  function toggleDoc(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(allOutputDocs.map((d) => d.id)));
  }

  function chainIntoNewWorkflow() {
    if (selectedIds.size === 0) return;
    const params = new URLSearchParams({ inputDocs: [...selectedIds].join(",") });
    router.push(`/workflows/new?${params}`);
  }

  return (
    <Card>
      <div className="px-6 pt-6 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ArrowRight className="h-4 w-4" />
            Chain Output Documents
          </div>
          <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">
            Select All
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Select output documents to use as inputs in a new workflow
        </p>
      </div>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {allOutputDocs.map((doc) => {
            const isChecked = selectedIds.has(doc.id);
            return (
              <div
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => toggleDoc(doc.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleDoc(doc.id);
                  }
                }}
                className={`flex items-center gap-3 p-3 rounded-lg text-left transition-colors border cursor-pointer ${
                  isChecked
                    ? "bg-accent/50 border-accent"
                    : "hover:bg-muted/50 border-border/50"
                }`}
              >
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => toggleDoc(doc.id)}
                />
                <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.originalName}</p>
                  <p className="text-xs text-muted-foreground truncate">{doc.stepName}</p>
                </div>
              </div>
            );
          })}
        </div>

        {selectedIds.size > 0 && (
          <Button onClick={chainIntoNewWorkflow} className="w-full gap-2" size="sm">
            <ArrowRight className="h-4 w-4" />
            Chain {selectedIds.size} Document{selectedIds.size !== 1 ? "s" : ""} Into New Workflow
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
