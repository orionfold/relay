"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Eye, Inbox, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { NotificationItem } from "./notification-item";
import { EmptyState } from "@/components/shared/empty-state";
import { filterDefaultVisibleNotifications } from "@/lib/notifications/visibility";
import type { NotificationOutputDocument } from "@/lib/notifications/completion-context";
import { subscribeToResolvedApprovals } from "@/lib/notifications/approval-client";

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

function isNotificationSnapshot(value: unknown): value is Notification[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string" &&
        typeof (item as { type?: unknown }).type === "string" &&
        typeof (item as { response?: unknown }).response !== "undefined"
    )
  );
}

export function InboxList({
  initialNotifications,
}: {
  initialNotifications: Notification[];
}) {
  const [notifications, setNotifications] =
    useState<Notification[]>(() => filterDefaultVisibleNotifications(initialNotifications));
  const [tab, setTab] = useState("all");
  const [syncError, setSyncError] = useState<string | null>(null);
  const resolvedIdsRef = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error(`Inbox refresh returned HTTP ${res.status}`);
      const next: unknown = await res.json();
      if (!isNotificationSnapshot(next)) {
        throw new Error("Inbox refresh returned a malformed response");
      }
      setNotifications(
        filterDefaultVisibleNotifications(next).filter(
          (notification) => !resolvedIdsRef.current.has(notification.id)
        )
      );
      setSyncError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Inbox refresh failed";
      console.error("[inbox-list]", message);
      setSyncError(`${message}. Existing approvals remain actionable; retry refresh.`);
    }
  }, []);

  // Poll every 10 seconds (consolidated from 3s inbox + 5s badge). This is the
  // safety net for non-time-critical notification types (task_completed,
  // agent_message, …) that the approvals stream below does not carry.
  useEffect(() => {
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    return subscribeToResolvedApprovals((notificationId) => {
      resolvedIdsRef.current.add(notificationId);
      setNotifications((current) =>
        current.filter((notification) => notification.id !== notificationId)
      );
    });
  }, []);

  // Real-time surfacing for workflow-blocking checkpoints
  // (fix-inbox-checkpoint-realtime). A workflow stuck at a HITL checkpoint
  // shouldn't wait on the 10s poll — the user must act, and the UI going quiet
  // for ~15s undercuts the "governed, unattended" promise. We subscribe to the
  // existing pending-approvals SSE (~750ms server-side tail, already includes
  // WorkflowCheckpoint rows) and use each snapshot purely as an invalidation
  // signal: re-pull the authoritative /api/notifications list so a new
  // checkpoint (and the badge) surfaces within ~1-2s. On SSE failure we fall
  // back to the 10s poll already running above. Mirrors PendingApprovalHost.
  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource("/api/notifications/pending-approvals/stream");
      eventSource.onmessage = () => {
        // The snapshot content is not rendered here — its arrival means the
        // pending-approval set changed, so re-fetch the full list immediately.
        if (cancelled) return;
        void refresh();
      };
      eventSource.onerror = () => {
        setSyncError(
          "Live approval updates disconnected. Existing approvals remain actionable; polling will retry."
        );
        // Fall back to the 10s poll (still active) until the stream recovers.
        eventSource?.close();
        eventSource = null;
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "live approval updates unavailable";
      console.error("[inbox-list]", message);
      setSyncError(`${message}. Existing approvals remain actionable; polling will retry.`);
    }

    return () => {
      cancelled = true;
      eventSource?.close();
    };
  }, [refresh]);

  async function markAllRead() {
    await fetch("/api/notifications/mark-all-read", { method: "PATCH" });
    toast.success("All notifications marked as read");
    refresh();
  }

  async function dismissAllRead() {
    const readNotifications = notifications.filter((n) => n.read);
    if (readNotifications.length === 0) return;
    await Promise.all(
      readNotifications.map((n) =>
        fetch(`/api/notifications/${n.id}`, { method: "DELETE" })
      )
    );
    toast.success(`Dismissed ${readNotifications.length} read notification${readNotifications.length !== 1 ? "s" : ""}`);
    refresh();
  }

  const filtered =
    tab === "all"
      ? notifications
      : tab === "unread"
        ? notifications.filter((n) => !n.read)
        : tab === "permissions"
          ? notifications.filter((n) => n.type === "permission_required")
          : notifications.filter(
              (n) => n.type === "agent_message" || n.type === "budget_alert"
            );

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filteredCount = filtered.length;
  const readCount = notifications.length - unreadCount;

  return (
    <div className="space-y-4">
      <div className="surface-toolbar rounded-xl p-3 sm:p-4">
        {syncError && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            Approval sync failed: {syncError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <span>Notification Queue</span>
          <span className="rounded-full bg-background/75 px-2.5 py-1 text-[11px] font-medium normal-case tracking-normal text-foreground">
            {filteredCount} shown
          </span>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium normal-case tracking-normal text-primary">
              {unreadCount} unread
            </span>
          )}
          {readCount > 0 && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium normal-case tracking-normal text-muted-foreground">
              {readCount} read
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-xl bg-background/75 p-1 shadow-none">
              <TabsTrigger className="min-h-8 flex-none px-3 text-[13px]" value="all">
                All
              </TabsTrigger>
              <TabsTrigger className="min-h-8 flex-none px-3 text-[13px]" value="unread">
                Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
              </TabsTrigger>
              <TabsTrigger className="min-h-8 flex-none px-3 text-[13px]" value="permissions">
                Permissions
              </TabsTrigger>
              <TabsTrigger className="min-h-8 flex-none px-3 text-[13px]" value="messages">
                Messages
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={refresh}
              aria-label="Refresh notifications"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {unreadCount > 0 && (
              <Button variant="secondary" size="sm" onClick={markAllRead}>
                <Eye className="h-4 w-4" />
                Mark all read
              </Button>
            )}
            {readCount > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={dismissAllRead}
              >
                <Trash2 className="h-4 w-4" />
                Delete read
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3" aria-live="polite">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Inbox}
            heading="No notifications"
            description={tab === "all" ? "You're all caught up." : `No ${tab} notifications to show.`}
          />
        ) : (
          filtered.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onRemoved={(notificationId) =>
                setNotifications((current) =>
                  current.filter((item) => item.id !== notificationId)
                )
              }
              onUpdated={refresh}
            />
          ))
        )}
      </div>
    </div>
  );
}
