"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Shield, MessageCircle, CheckCircle, XCircle, Eye, EyeOff, Trash2, Wallet, Brain, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PermissionAction } from "./permission-action";
import { MessageResponse, type Question } from "./message-response";
import { FailureAction } from "./failure-action";
import { formatTimestamp } from "@/lib/utils/format-timestamp";
import {
  buildPermissionSummary,
  parseNotificationToolInput,
  type PermissionToolInput,
} from "@/lib/notifications/permissions";
import { ContextProposalReview } from "@/components/profiles/context-proposal-review";
import { BatchProposalReview } from "./batch-proposal-review";
import { EmbeddedMarkdown } from "@/components/shared/embedded-markdown";
import { TaskAttachments } from "@/components/tasks/task-attachments";
import type { NotificationOutputDocument } from "@/lib/notifications/completion-context";
import { toast } from "sonner";

interface Notification {
  id: string;
  taskId: string | null;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  toolName: string | null;
  toolInput: string | null;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
  outputDocuments?: NotificationOutputDocument[];
  completionResultPreview?: string | null;
}

interface NotificationItemProps {
  notification: Notification;
  onRemoved?: (notificationId: string) => void;
  onUpdated: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  permission_required: <Shield className="h-4 w-4 text-chart-5" aria-hidden="true" />,
  agent_message: <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />,
  task_completed: <CheckCircle className="h-4 w-4 text-chart-2" aria-hidden="true" />,
  task_failed: <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />,
  budget_alert: <Wallet className="h-4 w-4 text-status-warning" aria-hidden="true" />,
  context_proposal: <Brain className="h-4 w-4 text-chart-4" aria-hidden="true" />,
  context_proposal_batch: <Brain className="h-4 w-4 text-chart-4" aria-hidden="true" />,
};

const typeLabels: Record<string, string> = {
  permission_required: "Permission required",
  agent_message: "Agent message",
  task_completed: "Task completed",
  task_failed: "Task failed",
  budget_alert: "Budget alert",
  context_proposal: "Self-learning",
  context_proposal_batch: "Self-learning batch",
};

function formatToolInput(
  toolName: string | null,
  input: PermissionToolInput
): React.ReactNode {
  // AskUserQuestion — show the question text directly
  if (toolName === "AskUserQuestion" || toolName === "ask_user_question") {
    const question = input.question ?? input.text ?? input.message;
    if (typeof question === "string") {
      return <p>{question}</p>;
    }
  }

  // Bash/shell — show the command
  if (toolName === "Bash" || toolName === "bash") {
    const cmd = input.command ?? input.cmd;
    if (typeof cmd === "string") {
      return <code className="text-xs font-mono break-all">{cmd}</code>;
    }
  }

  // Read/Write — show the file path
  if (toolName === "Read" || toolName === "Write" || toolName === "Edit") {
    const path = input.file_path ?? input.path;
    if (typeof path === "string") {
      return <span>File: <code className="text-xs font-mono">{path}</code></span>;
    }
  }

  // Fallback: show key-value pairs in a readable format
  const entries = Object.entries(input).slice(0, 4);
  if (entries.length === 0) return null;

  return (
    <dl className="text-xs space-y-0.5">
      {entries.map(([key, val]) => (
        <div key={key} className="flex gap-2">
          <dt className="font-medium shrink-0">{key}:</dt>
          <dd className="truncate">{typeof val === "string" ? val : JSON.stringify(val)}</dd>
        </div>
      ))}
    </dl>
  );
}

const navigableTypes = new Set(["task_completed", "task_failed", "permission_required", "agent_message"]);
const nestedInteractionSelector = [
  "a",
  "button",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='button']",
  "[role='link']",
  "[role='menuitem']",
  "[data-container-navigation='ignore']",
].join(",");

function hasActiveTextSelection(): boolean {
  const selection = window.getSelection();
  return !!selection && !selection.isCollapsed && !!selection.toString().trim();
}

function isNestedInteraction(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest(nestedInteractionSelector);
}

function parseBatchToolInput(toolInput: PermissionToolInput | null): {
  proposalIds: string[];
  profileIds: string[];
} {
  return {
    proposalIds: Array.isArray(toolInput?.proposalIds)
      ? toolInput.proposalIds.filter((id): id is string => typeof id === "string")
      : [],
    profileIds: Array.isArray(toolInput?.profileIds)
      ? toolInput.profileIds.filter((id): id is string => typeof id === "string")
      : [],
  };
}

export function NotificationItem({
  notification,
  onRemoved,
  onUpdated,
}: NotificationItemProps) {
  const router = useRouter();
  const [toggling, setToggling] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isUnread = !notification.read;
  const hasResponse = !!notification.response;
  const parsedToolInput = parseNotificationToolInput(notification.toolInput);
  const isNavigable = !!notification.taskId && navigableTypes.has(notification.type);
  const renderedBody = notification.completionResultPreview ?? notification.body;

  function handleNavigate() {
    if (!isNavigable) return;
    // Navigate immediately — don't block on mark-as-read
    router.push(`/tasks/${notification.taskId}`);
    // Fire-and-forget: mark as read in the background
    if (isUnread) {
      void fetch(`/api/notifications/${notification.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: true }),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`mark-as-read returned HTTP ${response.status}`);
          }
          onUpdated();
        })
        .catch((error) => {
          console.error(
            "[notification-item] Task navigation succeeded, but mark-as-read failed:",
            error
          );
          toast.warning(
            "Task opened, but this notification could not be marked as read."
          );
        });
    }
  }

  function handleContainerClick(event: React.MouseEvent<HTMLElement>) {
    if (isNestedInteraction(event.target) || hasActiveTextSelection()) return;
    handleNavigate();
  }

  function handleContainerKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleNavigate();
    }
  }

  async function toggleRead() {
    setToggling(true);
    try {
      await fetch(`/api/notifications/${notification.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: !notification.read }),
      });
      onUpdated();
    } finally {
      setToggling(false);
    }
  }

  async function dismiss() {
    setDismissing(true);
    try {
      await fetch(`/api/notifications/${notification.id}`, {
        method: "DELETE",
      });
      onUpdated();
    } finally {
      setDismissing(false);
    }
  }

  return (
    <Card
      className={`p-4 ${
        isNavigable
          ? "border-l-4 border-l-primary cursor-pointer hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          : ""
      } ${
        isUnread
          ? "surface-card"
          : "surface-card-muted"
      }`}
      role="article"
      aria-label={`${isNavigable ? "Open task details" : (typeLabels[notification.type] ?? "Notification")}: ${notification.title}${isUnread ? " (unread)" : ""}`}
      tabIndex={isNavigable ? 0 : undefined}
      onClick={isNavigable ? handleContainerClick : undefined}
      onKeyDown={isNavigable ? handleContainerKeyDown : undefined}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{typeIcons[notification.type]}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4
              className={`text-sm ${isUnread ? "font-semibold" : "font-normal"}`}
            >
              {notification.title}
            </h4>
            {hasResponse && (
              <Badge variant="secondary" className="text-xs">
                Responded
              </Badge>
            )}
          </div>

          {/* Tool name for permission requests */}
          {notification.type === "permission_required" && notification.toolName && (
            <div className="mb-2">
              <Badge variant="outline" className="text-xs font-mono">
                {notification.toolName}
              </Badge>
              {parsedToolInput && (
                <div className="text-sm text-muted-foreground bg-muted/60 p-2 rounded mt-1">
                  <p className="mb-1 break-all font-medium text-foreground">
                    {buildPermissionSummary(notification.toolName, parsedToolInput)}
                  </p>
                  {formatToolInput(notification.toolName, parsedToolInput)}
                </div>
              )}
            </div>
          )}

          {/* Body for non-tool notifications */}
          {(renderedBody || (notification.outputDocuments?.length ?? 0) > 0) &&
            notification.type !== "permission_required" &&
            notification.type !== "agent_message" &&
            notification.type !== "context_proposal" &&
            notification.type !== "context_proposal_batch" && (
              <div className="mt-1">
                {renderedBody && (
                  <div
                    className={
                      expanded
                        ? "surface-scroll max-h-[48rem] overflow-auto rounded-lg p-3"
                        : renderedBody.length > 200
                          ? "max-h-20 overflow-hidden mask-fade-bottom"
                          : ""
                    }
                  >
                    <EmbeddedMarkdown content={renderedBody} hierarchy="compact" />
                  </div>
                )}
                {(notification.outputDocuments?.length ?? 0) > 0 && (
                  <div
                    className="mt-3 rounded-lg border border-border p-3"
                    data-container-navigation="ignore"
                  >
                    <TaskAttachments
                      documents={notification.outputDocuments ?? []}
                      title={`Generated Outputs (${notification.outputDocuments?.length ?? 0})`}
                      showDelete={false}
                    />
                  </div>
                )}
                {renderedBody && renderedBody.length > 200 && (
                  <button
                    type="button"
                    className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                    aria-expanded={expanded}
                  >
                    {expanded ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            )}

          {/* Actions based on type */}
          {notification.type === "permission_required" &&
            parsedToolInput && (
              <PermissionAction
                taskId={notification.taskId}
                notificationId={notification.id}
                toolName={notification.toolName ?? ""}
                toolInput={parsedToolInput}
                responded={hasResponse}
                response={notification.response}
                onResponded={onUpdated}
              />
            )}

          {notification.type === "agent_message" &&
            notification.taskId &&
            parsedToolInput && (
              <MessageResponse
                taskId={notification.taskId}
                notificationId={notification.id}
                toolInput={parsedToolInput as { questions: Question[] }}
                responded={hasResponse}
                response={notification.response}
                onResponded={onUpdated}
              />
            )}

          {notification.type === "task_failed" && notification.taskId && (
            <FailureAction taskId={notification.taskId} onRetried={onUpdated} />
          )}

          {notification.type === "context_proposal" && (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <ContextProposalReview
                notificationId={notification.id}
                profileId={
                  typeof parsedToolInput?.profileId === "string"
                    ? parsedToolInput.profileId
                    : (notification.toolName ?? "")
                }
                proposedAdditions={
                  typeof parsedToolInput?.additions === "string"
                    ? parsedToolInput.additions
                    : (notification.body ?? "")
                }
                onResponded={onUpdated}
              />
            </div>
          )}

          {notification.type === "context_proposal_batch" && (
            <div className="mt-3" onClick={(e) => e.stopPropagation()}>
              <BatchProposalReview
                notificationId={notification.id}
                proposalIds={parseBatchToolInput(parsedToolInput).proposalIds}
                profileIds={parseBatchToolInput(parsedToolInput).profileIds}
                body={notification.body ?? ""}
                onResponded={() => onRemoved?.(notification.id)}
                onRequestFailed={onUpdated}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-2">
            {formatTimestamp(notification.createdAt)}
            {notification.respondedAt && (
              <span>
                {" "}
                · Responded{" "}
                {formatTimestamp(notification.respondedAt)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isNavigable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary"
              onClick={handleNavigate}
              aria-label="View task details"
            >
              <ArrowUpRight className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={toggleRead}
            disabled={toggling}
            aria-label={isUnread ? "Mark as read" : "Mark as unread"}
          >
            {isUnread ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={dismiss}
            disabled={dismissing}
            aria-label="Dismiss notification"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
