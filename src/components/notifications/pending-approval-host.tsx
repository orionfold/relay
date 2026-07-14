"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Inbox,
  Layers3,
  ShieldAlert,
  Workflow,
} from "lucide-react";

import { PermissionResponseActions } from "@/components/notifications/permission-response-actions";
import { ContextProposalReview } from "@/components/profiles/context-proposal-review";
import { BatchProposalReview } from "@/components/notifications/batch-proposal-review";
import {
  MessageResponse,
  type Question,
} from "@/components/notifications/message-response";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROSE_NOTIFICATION } from "@/lib/constants/prose-styles";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  getPermissionDetailEntries,
  type PermissionToolInput,
} from "@/lib/notifications/permissions";
import { formatTimestamp } from "@/lib/utils/format-timestamp";
import { cn } from "@/lib/utils";
import type { PendingApprovalPayload } from "@/lib/notifications/actionable";
import { subscribeToResolvedApprovals } from "@/lib/notifications/approval-client";
import { toast } from "sonner";

const APPROVAL_SYNC_TOAST_ID = "pending-approval-sync";

function dedupePendingApprovals(items: PendingApprovalPayload[]) {
  return Array.from(
    new Map(items.map((item) => [item.notificationId, item])).values()
  ).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function isPendingApprovalSnapshot(value: unknown): value is PendingApprovalPayload[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { notificationId?: unknown }).notificationId === "string" &&
        typeof (item as { createdAt?: unknown }).createdAt === "string"
    )
  );
}

function parseBatchToolInput(toolInput: unknown): {
  proposalIds: string[];
  profileIds: string[];
} {
  try {
    const parsed =
      typeof toolInput === "string" ? JSON.parse(toolInput) : toolInput;
    return {
      proposalIds: Array.isArray(parsed?.proposalIds) ? parsed.proposalIds : [],
      profileIds: Array.isArray(parsed?.profileIds) ? parsed.profileIds : [],
    };
  } catch {
    return { proposalIds: [], profileIds: [] };
  }
}

function buildContextLabel(payload: PendingApprovalPayload) {
  if (payload.workflowName && payload.taskTitle) {
    return `${payload.workflowName} · ${payload.taskTitle}`;
  }

  return payload.taskTitle ?? payload.workflowName ?? "Approval request";
}

function PermissionDetailFields({
  toolName,
  toolInput,
}: {
  toolName: string | null;
  toolInput: PermissionToolInput | null;
}) {
  const entries = getPermissionDetailEntries(toolName, toolInput);

  if (entries.length === 0) return null;

  return (
    <dl className="space-y-2 text-sm">
      {entries.map((entry) => (
        <div
          key={`${entry.label}-${entry.value}`}
          className="rounded-xl border border-border/60 bg-background/50 px-3 py-2"
        >
          <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {entry.label}
          </dt>
          <dd className="mt-1 break-all font-mono text-xs text-foreground sm:text-sm">
            {entry.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function PendingApprovalDetail({
  selected,
  overflow,
  onResponded,
  onRequestFailed,
  onOpenInbox,
  onSelect,
}: {
  selected: PendingApprovalPayload;
  overflow: PendingApprovalPayload[];
  onResponded: () => void;
  onRequestFailed: () => void;
  onOpenInbox: () => void;
  onSelect: (notificationId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="font-mono text-xs">
          {selected.permissionLabel}
        </Badge>
        {selected.workflowName && (
          <Badge variant="secondary" className="text-xs">
            <Workflow className="h-3.5 w-3.5" />
            Workflow
          </Badge>
        )}
        {overflow.length > 0 && (
          <Badge variant="outline" className="text-xs">
            <Layers3 className="h-3.5 w-3.5" />
            {overflow.length} more pending
          </Badge>
        )}
      </div>

      <div className="surface-card-muted rounded-lg p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Context
        </p>
        <p className="mt-2 text-sm font-medium text-foreground">
          {buildContextLabel(selected)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {selected.compactSummary}
        </p>
        {selected.body &&
          selected.notificationType !== "context_proposal" &&
          selected.notificationType !== "context_proposal_batch" && (
          <div className="mt-3">
            <div className={PROSE_NOTIFICATION}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selected.body}
              </ReactMarkdown>
            </div>
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Requested {formatTimestamp(selected.createdAt)}
        </p>
      </div>

      {selected.notificationType === "agent_message" &&
      Array.isArray(selected.toolInput?.questions) ? (
        <MessageResponse
          taskId={selected.taskId ?? "_checkpoint"}
          notificationId={selected.notificationId}
          toolInput={{ questions: selected.toolInput.questions as Question[] }}
          responded={false}
          response={null}
          onResponded={onResponded}
        />
      ) : selected.notificationType === "context_proposal_batch" ? (
        (() => {
          const parsed = parseBatchToolInput(selected.toolInput);
          return (
            <BatchProposalReview
              notificationId={selected.notificationId}
              proposalIds={parsed.proposalIds}
              profileIds={parsed.profileIds}
              body={selected.body ?? ""}
              onResponded={onResponded}
              onRequestFailed={onRequestFailed}
            />
          );
        })()
      ) : selected.notificationType === "context_proposal" ? (
        <ContextProposalReview
          notificationId={selected.notificationId}
          profileId={selected.toolName ?? ""}
          proposedAdditions={selected.body ?? ""}
          onResponded={onResponded}
        />
      ) : (
        <>
          <PermissionDetailFields
            toolName={selected.toolName}
            toolInput={selected.toolInput}
          />

          {selected.toolName && selected.toolInput && (
            <PermissionResponseActions
              taskId={selected.taskId}
              notificationId={selected.notificationId}
              toolName={selected.toolName}
              toolInput={selected.toolInput}
              responded={false}
              response={null}
              onResponded={onResponded}
              buttonSize="default"
              layout="stacked"
            />
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={onOpenInbox}>
          <Inbox className="h-4 w-4" />
          Open Inbox
        </Button>
        {selected.deepLink !== "/inbox" && (
          <Button variant="ghost" asChild>
            <Link href={selected.deepLink}>
              <ArrowUpRight className="h-4 w-4" />
              View Context
            </Link>
          </Button>
        )}
      </div>

      {overflow.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Also pending
          </p>
          <div className="space-y-2">
            {overflow.map((item) => (
              <button
                key={item.notificationId}
                type="button"
                onClick={() => onSelect(item.notificationId)}
                className="surface-card-muted flex w-full items-start justify-between rounded-lg p-3 text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {buildContextLabel(item)}
                  </p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {item.compactSummary}
                  </p>
                </div>
                <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                  {formatTimestamp(item.createdAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function PendingApprovalHost() {
  const [items, setItems] = useState<PendingApprovalPayload[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const knownIdsRef = useRef<string[]>([]);
  const resolvedIdsRef = useRef(new Set<string>());
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();

  const applySnapshot = useCallback((snapshot: PendingApprovalPayload[]) => {
    toast.dismiss(APPROVAL_SYNC_TOAST_ID);
    const nextItems = dedupePendingApprovals(snapshot).filter(
      (item) => !resolvedIdsRef.current.has(item.notificationId)
    );
    const previousIds = new Set(knownIdsRef.current);
    const newestNew = nextItems.find(
      (item) => !previousIds.has(item.notificationId)
    );

    if (newestNew) {
      setAnnouncement(
        `Permission required for ${buildContextLabel(newestNew)}. ${newestNew.compactSummary}`
      );
    }

    knownIdsRef.current = nextItems.map((item) => item.notificationId);
    setItems(nextItems);
  }, []);

  const refreshApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/pending-approvals", {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`approval refresh returned HTTP ${res.status}`);
      }
      const snapshot: unknown = await res.json();
      if (!isPendingApprovalSnapshot(snapshot)) {
        throw new Error("approval refresh returned a malformed snapshot");
      }
      applySnapshot(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : "approval refresh failed";
      console.error("[pending-approval-host]", message);
      setAnnouncement(`Approval updates unavailable: ${message}. Retrying automatically.`);
      toast.error(`Approval updates unavailable: ${message}. Retrying automatically.`, {
        id: APPROVAL_SYNC_TOAST_ID,
      });
    }
  }, [applySnapshot]);

  const primary = items[0] ?? null;
  const selected = useMemo(() => {
    if (!items.length) return null;
    return items.find((item) => item.notificationId === selectedId) ?? items[0];
  }, [items, selectedId]);

  useEffect(() => {
    return subscribeToResolvedApprovals((notificationId) => {
      resolvedIdsRef.current.add(notificationId);
      removeNotification(notificationId);
    });
  }, []);

  useEffect(() => {
    if (!items.length) {
      setDetailOpen(false);
      setSelectedId(null);
      return;
    }

    if (!selectedId || !items.some((item) => item.notificationId === selectedId)) {
      setSelectedId(items[0].notificationId);
    }
  }, [items, selectedId]);

  useEffect(() => {
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let eventSource: EventSource | null = null;

    const startPolling = () => {
      if (pollId) return;
      pollId = setInterval(() => {
        refreshApprovals().catch(() => {
          // Fallback refresh should fail quietly.
        });
      }, 15_000);
    };

    refreshApprovals().catch(() => {
      // Initial refresh should fail quietly.
    });

    try {
      eventSource = new EventSource("/api/notifications/pending-approvals/stream");
      eventSource.onmessage = (event) => {
        try {
          const snapshot: unknown = JSON.parse(event.data);
          if (!isPendingApprovalSnapshot(snapshot)) {
            throw new Error("approval stream returned a malformed snapshot");
          }
          if (cancelled) return;
          applySnapshot(snapshot);
        } catch (error) {
          const message = error instanceof Error ? error.message : "approval stream parse failed";
          console.error("[pending-approval-host]", message);
          setAnnouncement(`Live approval updates failed: ${message}. Retrying automatically.`);
          toast.error(`Live approval updates failed: ${message}. Retrying automatically.`, {
            id: APPROVAL_SYNC_TOAST_ID,
          });
          startPolling();
        }
      };
      eventSource.onerror = () => {
        setAnnouncement(
          "Live approval updates disconnected. Retrying approval delivery automatically."
        );
        toast.error(
          "Live approval updates disconnected. Retrying approval delivery automatically.",
          { id: APPROVAL_SYNC_TOAST_ID }
        );
        eventSource?.close();
        eventSource = null;
        startPolling();
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "approval stream unavailable";
      console.error("[pending-approval-host]", message);
      setAnnouncement(`Live approval updates unavailable: ${message}. Retrying automatically.`);
      toast.error(`Live approval updates unavailable: ${message}. Retrying automatically.`, {
        id: APPROVAL_SYNC_TOAST_ID,
      });
      startPolling();
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      eventSource?.close();
    };
  }, [applySnapshot, refreshApprovals]);

  function removeNotification(notificationId: string) {
    setItems((current) =>
      current.filter((item) => item.notificationId !== notificationId)
    );
  }

  function openDetail(notificationId: string) {
    setSelectedId(notificationId);
    setDetailOpen(true);
  }

  function handleOpenInbox() {
    setDetailOpen(false);
    if (pathname !== "/inbox") {
      router.push("/inbox");
    }
  }

  if (!primary) {
    return <div className="sr-only" aria-live="polite">{announcement}</div>;
  }

  const overflowCount = Math.max(items.length - 1, 0);
  const overflowItems =
    selected == null
      ? []
      : items.filter((item) => item.notificationId !== selected.notificationId);

  const compactClassName = isMobile
    ? "inset-x-3 bottom-3"
    : "bottom-6 right-6 w-[min(26rem,calc(100vw-2rem))]";

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>

      <section
        className={cn(
          "fixed z-50 animate-in fade-in-0 duration-200",
          isMobile ? "slide-in-from-bottom-3" : "slide-in-from-right-3",
          compactClassName
        )}
        aria-label="Pending approval request"
      >
        <div className="elevation-3 rounded-xl border border-status-warning/30 bg-popover p-3 sm:p-4">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => openDetail(primary.notificationId)}
            className="w-full rounded-[20px] p-3 text-left transition-colors hover:bg-accent/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-status-warning/15 text-status-warning">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-status-warning">
                      Permission Required
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {buildContextLabel(primary)}
                    </p>
                  </div>
                  {overflowCount > 0 && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      +{overflowCount} more
                    </Badge>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {primary.permissionLabel}
                  </Badge>
                  {primary.workflowName && (
                    <Badge variant="secondary" className="text-xs">
                      Workflow
                    </Badge>
                  )}
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                  {primary.compactSummary}
                </p>
              </div>
            </div>
          </button>

          {primary.notificationType === "agent_message" &&
          Array.isArray(primary.toolInput?.questions) ? (
            <div className="mt-3">
              <MessageResponse
                taskId={primary.taskId ?? "_checkpoint"}
                notificationId={primary.notificationId}
                toolInput={{ questions: primary.toolInput.questions as Question[] }}
                responded={false}
                response={null}
                onResponded={() => removeNotification(primary.notificationId)}
              />
            </div>
          ) : primary.notificationType === "context_proposal_batch" ? (
            <div className="mt-3">
              {(() => {
                const parsed = parseBatchToolInput(primary.toolInput);
                return (
                  <BatchProposalReview
                    notificationId={primary.notificationId}
                    proposalIds={parsed.proposalIds}
                    profileIds={parsed.profileIds}
                    body={primary.body ?? ""}
                    onResponded={() => removeNotification(primary.notificationId)}
                    onRequestFailed={() => {
                      refreshApprovals().catch(() => {
                        // Refresh failures are surfaced by the batch review toast.
                      });
                    }}
                    compact
                  />
                );
              })()}
            </div>
          ) : primary.notificationType === "context_proposal" ? (
            <div className="mt-3">
              <ContextProposalReview
                notificationId={primary.notificationId}
                profileId={primary.toolName ?? ""}
                proposedAdditions={primary.body ?? ""}
                onResponded={() => removeNotification(primary.notificationId)}
                compact
              />
            </div>
          ) : (
            primary.toolName && primary.toolInput && (
              <PermissionResponseActions
                taskId={primary.taskId}
                notificationId={primary.notificationId}
                toolName={primary.toolName}
                toolInput={primary.toolInput}
                responded={false}
                response={null}
                onResponded={() => removeNotification(primary.notificationId)}
                className="mt-3"
              />
            )
          )}

          <div className="mt-3 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" onClick={handleOpenInbox}>
              <Inbox className="h-4 w-4" />
              Open Inbox
            </Button>
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(primary.createdAt)}
            </span>
          </div>
        </div>
      </section>

      {selected &&
        (isMobile ? (
          <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
            <SheetContent
              side="bottom"
              className="max-h-[85dvh] rounded-t-[28px] px-4 pb-6"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                triggerRef.current?.focus();
              }}
            >
              <SheetHeader className="px-0 pt-6">
                <SheetTitle>Permission required</SheetTitle>
                <SheetDescription>
                  Review and resolve this approval request without leaving the
                  current route.
                </SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto px-0 pb-2">
                <PendingApprovalDetail
                  selected={selected}
                  overflow={overflowItems}
                  onResponded={() => removeNotification(selected.notificationId)}
                  onRequestFailed={() => {
                    refreshApprovals().catch(() => {
                      // Refresh failures are surfaced by the batch review toast.
                    });
                  }}
                  onOpenInbox={handleOpenInbox}
                  onSelect={setSelectedId}
                />
              </div>
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogContent
              className="max-w-2xl max-h-[85dvh] flex flex-col"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                triggerRef.current?.focus();
              }}
            >
              <DialogHeader>
                <DialogTitle>Permission required</DialogTitle>
                <DialogDescription>
                  Review and resolve this approval request without switching to
                  the Inbox first.
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-y-auto -mx-6 px-6 pb-1">
                <PendingApprovalDetail
                  selected={selected}
                  overflow={overflowItems}
                  onResponded={() => removeNotification(selected.notificationId)}
                  onRequestFailed={() => {
                    refreshApprovals().catch(() => {
                      // Refresh failures are surfaced by the batch review toast.
                    });
                  }}
                  onOpenInbox={handleOpenInbox}
                  onSelect={setSelectedId}
                />
              </div>
            </DialogContent>
          </Dialog>
        ))}
    </>
  );
}
