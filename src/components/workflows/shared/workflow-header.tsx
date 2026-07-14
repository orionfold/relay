"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle } from "@/components/ui/card";
import {
  Play,
  Pencil,
  Copy,
  RotateCcw,
  Trash2,
  FolderKanban,
  ArrowRight,
  Inbox as InboxIcon,
  Clock3,
  Loader2,
  Square,
} from "lucide-react";
import { patternLabels } from "@/lib/constants/status-colors";
import { IconCircle, getWorkflowIconFromName } from "@/lib/constants/card-icons";
import { StatusChip } from "@/components/shared/status-chip";
import type { WorkflowStatusResponse } from "@/lib/workflows/types";
import { getWorkflowExecutionInfoFromStatusResponse } from "@/lib/workflows/execution-status";

/**
 * FEAT-7/8: a status-aware signpost telling the user what to do next. After a
 * blueprint instantiates a draft, "Execute" is not obvious — so `draft` gets a
 * "click Execute to start" nudge. Once running/paused, activity lives on other
 * surfaces (Inbox for approvals, the steps below for progress) — so those
 * statuses point there. A paused HITL run must read as "waiting for you", not
 * "stuck".
 *
 * Distinguishing the two kinds of `paused`: a delay pause carries `resumeAt`
 * (it resumes on its own); a HITL pause (BUG-3) sets a step to
 * `waiting_approval` and has no resumeAt (it waits for your answer → Inbox).
 */
export type Signpost = {
  tone: "info" | "wait";
  icon: "arrow" | "inbox" | "clock" | "spinner";
  href?: string;
  text: string;
} | null;

export function computeSignpost(data: WorkflowStatusResponse): Signpost {
  const status = data.status;
  if (status === "draft") {
    return {
      tone: "info",
      icon: "arrow",
      text: "Ready to go. Click Execute to start this workflow.",
    };
  }
  // A live workflow is `active` at the top level (`running` is a step/run-state
  // value; the loop arm may report it too — accept both).
  if (status === "active" || status === "running") {
    const execution = getWorkflowExecutionInfoFromStatusResponse(data);
    if (execution.status === "waiting") {
      return {
        tone: "wait",
        icon: "inbox",
        href: "/inbox",
        text: "Waiting for approval. This workflow is not actively running.",
      };
    }
    if (execution.status === "stalled") {
      return {
        tone: "wait",
        icon: "arrow",
        text: "No live task is running. Re-run this workflow when you are ready.",
      };
    }
    return {
      tone: "info",
      icon: "spinner",
      text: "Working now. Watch the steps below as it goes.",
    };
  }
  if (status === "paused") {
    // A delay pause resumes on its own; the non-loop arm carries resumeAt.
    const resumeAt =
      "resumeAt" in data ? (data.resumeAt as number | null) : null;
    if (resumeAt != null) {
      return {
        tone: "wait",
        icon: "clock",
        text: "Paused for a scheduled step. It resumes on its own.",
      };
    }
    // Otherwise it is waiting for your answer (HITL checkpoint → Inbox).
    return {
      tone: "wait",
      icon: "inbox",
      href: "/inbox",
      text: "Waiting for your approval. Answer it in your Inbox.",
    };
  }
  return null;
}

/**
 * Pattern-agnostic header card for the workflow detail page. Renders the
 * workflow name, pattern label, project/run badges, status badge, and the
 * action buttons (Execute, Edit, Clone, Re-run, Delete). Each subview passes
 * callbacks and the narrowed-arm `data` object.
 *
 * This component is deliberately read-only with respect to polling state —
 * subviews own their own `executing` state so the Execute button can show
 * the "Starting..." label without a round-trip through the router.
 */
export function WorkflowHeader({
  data,
  executing,
  canExecute,
  onExecute,
  onRerun,
  onStop,
  onDelete,
}: {
  data: WorkflowStatusResponse;
  executing: boolean;
  /** Subviews decide when Execute makes sense (e.g. loop workflows hide it in favour of the loop's own start/pause controls). */
  canExecute: boolean;
  onExecute: () => void;
  onRerun: () => void;
  onStop: () => void;
  onDelete: () => void;
}) {
  const router = useRouter();
  const hasDefinition = !!data.definition;
  const execution = getWorkflowExecutionInfoFromStatusResponse(data);
  const primaryRunLabel =
    data.status === "active"
      ? "Re-run workflow"
      : data.status === "paused"
        ? "Resume workflow"
        : "Run workflow";

  return (
    <CardHeader>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <IconCircle
            icon={getWorkflowIconFromName(data.name, data.pattern).icon}
            colors={getWorkflowIconFromName(data.name, data.pattern).colors}
          />
          <div>
            <CardTitle>{data.name}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {patternLabels[data.pattern] ?? data.pattern}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {data.projectId && (
                <Badge
                  variant="outline"
                  className="text-xs hover:bg-accent gap-1"
                  onClick={() => router.push(`/projects/${data.projectId}`)}
                >
                  <FolderKanban className="h-3 w-3" />
                  Project
                </Badge>
              )}
              {data.runNumber != null && data.runNumber > 0 && (
                <Badge variant="outline" className="text-xs font-normal">
                  Run #{data.runNumber}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={execution.status} family="lifecycle" />

          {canExecute && execution.canRun && !["completed", "failed"].includes(data.status) && (
            <Button size="sm" onClick={onExecute} disabled={executing}>
              <Play className="h-3 w-3 mr-1" />
              {executing ? "Starting..." : primaryRunLabel}
            </Button>
          )}

          {execution.canStop && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onStop}
              disabled={executing}
            >
              <Square className="h-3.5 w-3.5 mr-1.5" />
              Stop
            </Button>
          )}

          {["draft", "completed", "failed"].includes(data.status) && hasDefinition && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/workflows/${data.id}/edit`)}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
          )}

          {hasDefinition && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/workflows/${data.id}/edit?clone=true`)}
            >
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Clone
            </Button>
          )}

          {(data.status === "completed" || data.status === "failed") && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRerun}
              disabled={executing}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Re-run
            </Button>
          )}

          {!execution.canStop && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete
            </Button>
          )}
        </div>
      </div>
      <SignpostBanner signpost={computeSignpost(data)} />
    </CardHeader>
  );
}

/**
 * FEAT-7/8: renders the status-aware "what to do next" banner. `wait` tone
 * (waiting on the user) is emphasized; `info` tone is quiet. When a signpost
 * has an href, the whole banner is a link (e.g. paused HITL → /inbox).
 */
function SignpostBanner({ signpost }: { signpost: Signpost }) {
  const router = useRouter();
  if (!signpost) return null;

  const Icon =
    signpost.icon === "inbox"
      ? InboxIcon
      : signpost.icon === "clock"
        ? Clock3
        : signpost.icon === "spinner"
          ? Loader2
          : ArrowRight;

  const tone =
    signpost.tone === "wait"
      ? "border-status-warning/40 bg-status-warning/10 text-foreground"
      : "border-border bg-muted/40 text-muted-foreground";

  const body = (
    <div
      className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tone} ${
        signpost.href ? "hover:bg-accent transition-colors" : ""
      }`}
    >
      <Icon
        className={`h-4 w-4 shrink-0 ${
          signpost.icon === "spinner" ? "animate-spin" : ""
        }`}
      />
      <span>{signpost.text}</span>
      {signpost.href && <ArrowRight className="h-3.5 w-3.5 ml-auto shrink-0" />}
    </div>
  );

  if (signpost.href) {
    const href = signpost.href;
    return (
      <div role="link" tabIndex={0} onClick={() => router.push(href)}>
        {body}
      </div>
    );
  }
  return body;
}
