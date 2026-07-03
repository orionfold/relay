"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { formatDuration } from "@/lib/workflows/delay";

/**
 * Body content for a delay step row in the workflow status view. Renders
 * three visual states keyed off the step's status:
 *
 *   - Pending (workflow hasn't reached this step yet): "Will wait 3d"
 *   - Active delay (workflow paused, waiting): absolute resume time +
 *     remaining duration + Resume Now button
 *   - Completed (workflow has already passed this step): "Delayed 3d — completed"
 *
 * Countdown is static on mount/focus — no per-second ticking, because live
 * aria-live updates would flood assistive tech users. Users needing a refresh
 * can reload or refocus the page.
 *
 * Extracted from workflow-status-view.tsx during the TDR-031 router refactor
 * so the non-loop subview can import it without a circular dependency on the
 * thin router file.
 */
export function DelayStepBody({
  workflowId,
  delayDuration,
  stepStatus,
  resumeAt,
}: {
  workflowId: string;
  delayDuration: string;
  stepStatus: string;
  resumeAt: number | null;
}) {
  const [resuming, setResuming] = useState(false);

  const handleResumeNow = useCallback(async () => {
    setResuming(true);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/resume`, { method: "POST" });
      if (res.status === 202) {
        toast.success("Resume dispatched");
      } else if (res.status === 409) {
        toast.info("Workflow already resumed by scheduler");
      } else {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Failed to resume workflow");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resume workflow");
    } finally {
      setResuming(false);
    }
  }, [workflowId]);

  if (stepStatus === "completed") {
    return (
      <p className="text-xs text-muted-foreground mt-0.5">
        Delayed {delayDuration}, completed
      </p>
    );
  }

  if (stepStatus === "delayed" && resumeAt) {
    const resumeDate = new Date(resumeAt);
    const remainingMs = Math.max(0, resumeAt - Date.now());
    const remainingLabel =
      remainingMs < 60_000
        ? "less than a minute"
        : formatDuration(Math.round(remainingMs / 60_000) * 60_000);
    return (
      <div className="mt-1 space-y-2">
        <p className="text-xs text-status-warning">
          Resumes{" "}
          <time dateTime={resumeDate.toISOString()}>
            {resumeDate.toLocaleString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </time>{" "}
          <span className="text-muted-foreground">({remainingLabel} remaining)</span>
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={handleResumeNow}
          disabled={resuming}
          aria-label="Resume workflow now"
        >
          <Play className="h-3 w-3 mr-1" />
          {resuming ? "Resuming..." : "Resume Now"}
        </Button>
      </div>
    );
  }

  // Pending / upcoming delay — workflow hasn't reached this step yet
  return (
    <p className="text-xs text-muted-foreground mt-0.5">
      Will wait {delayDuration}
    </p>
  );
}
