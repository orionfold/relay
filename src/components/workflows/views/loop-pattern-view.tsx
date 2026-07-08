"use client";

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { LoopStatusView } from "../loop-status-view";
import { WorkflowFullOutput } from "../workflow-full-output";
import { WorkflowHeader } from "../shared/workflow-header";
import type {
  WorkflowStatusResponse,
} from "@/lib/workflows/types";

/**
 * Loop workflow subview. Consumes the `pattern: "loop"` arm of the status
 * API discriminated union. Delegates iteration rendering to the existing
 * LoopStatusView component; adds the loop-prompt display and the Full Output
 * sheet (which reads from `loopState.iterations[].result` rather than from
 * `steps[].state.result` — the latter doesn't exist on the loop arm).
 *
 * Per TDR-031: this is the only place in the view layer that is allowed to
 * read `data.loopState`, because it is the only place narrowed to the loop
 * arm.
 *
 * The Full Output sheet fix is the spec's headline behavior change: before
 * this refactor, `completedStepOutputs` was computed in the god component
 * BEFORE the pattern dispatch, so loop workflows either crashed (pre-PR #6)
 * or got an empty array (post-PR #6). Now the loop subview reads iterations
 * directly, so a completed table enrichment workflow actually shows its
 * per-iteration outputs.
 */
export function LoopPatternView({
  data,
  onRefresh,
  onRequestDelete,
}: {
  data: Extract<WorkflowStatusResponse, { pattern: "loop" }>;
  onRefresh: () => Promise<void>;
  onRequestDelete: () => void;
}) {
  const [executing, setExecuting] = useState(false);

  const handleExecute = useCallback(async () => {
    setExecuting(true);
    try {
      const res = await fetch(`/api/workflows/${data.id}/execute`, { method: "POST" });
      if (res.ok) {
        toast.success("Workflow started");
        await onRefresh();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to start workflow");
      }
    } finally {
      setExecuting(false);
    }
  }, [data.id, onRefresh]);

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

  // Loop workflows expose their completed outputs as `loopState.iterations[]`
  // rather than `steps[].state`. Map each completed iteration to the shape
  // `WorkflowFullOutput` expects. This is the bug fix — previously the Full
  // Output sheet was silently empty for every table enrichment run because
  // the old god component only read from `steps[].state` (which doesn't
  // exist on loop responses).
  const completedIterationOutputs = useMemo(() => {
    const iterations = data.loopState?.iterations ?? [];
    return iterations
      .filter((iter) => iter.status === "completed" && iter.result && iter.result.trim() !== "")
      .map((iter) => ({
        name: `Iteration ${iter.iteration}`,
        result: iter.result!,
      }));
  }, [data.loopState]);

  const loopPromptText = data.steps[0]?.prompt;
  const showFullOutput =
    data.status === "completed" && completedIterationOutputs.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <WorkflowHeader
          data={data}
          executing={executing}
          // Loop workflows have their own start/pause controls inside
          // LoopStatusView — the header's Execute button would be redundant
          // and confusing.
          canExecute={false}
          onExecute={handleExecute}
          onRerun={handleRerun}
          onStop={handleStop}
          onDelete={onRequestDelete}
        />
        <CardContent>
          {loopPromptText && (
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Loop Prompt</p>
              <div className="rounded-md border bg-muted/50 p-3">
                <p className="text-sm whitespace-pre-wrap">{loopPromptText}</p>
              </div>
            </div>
          )}
          {data.loopConfig && (
            <LoopStatusView
              workflowId={data.id}
              workflowStatus={data.status}
              loopConfig={data.loopConfig}
              loopState={data.loopState ?? null}
              onRefresh={() => void onRefresh()}
            />
          )}
        </CardContent>
      </Card>

      {showFullOutput && (
        <WorkflowFullOutput
          workflowName={data.name}
          steps={completedIterationOutputs}
        />
      )}
    </div>
  );
}
