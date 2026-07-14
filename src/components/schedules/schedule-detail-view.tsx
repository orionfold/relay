"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleStatusBadge } from "./schedule-status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { describeCron } from "@/lib/schedules/interval-parser";
import { taskStatusVariant } from "@/lib/constants/status-colors";
import { Pause, Play, Trash2, Clock, Zap, Hash } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  OperationsReceiptHistory,
  type OperationsReceiptHistoryItem,
} from "@/components/operations/operations-receipt-history";

interface TaskSummary {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  result: string | null;
}

interface ScheduleDetail {
  id: string;
  name: string;
  prompt: string;
  cronExpression: string;
  assignedAgent: string | null;
  agentProfile: string | null;
  recurs: boolean;
  status: string;
  maxFirings: number | null;
  firingCount: number;
  expiresAt: string | null;
  lastFiredAt: string | null;
  nextFireAt: string | null;
  createdAt: string;
  firingHistory: TaskSummary[];
  receipts: OperationsReceiptHistoryItem[];
  receiptReconciliationErrors?: string[];
}

interface ScheduleDetailViewProps {
  scheduleId: string;
  initialSchedule?: ScheduleDetail;
}

export function ScheduleDetailView({ scheduleId, initialSchedule }: ScheduleDetailViewProps) {
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(initialSchedule ?? null);
  const [loaded, setLoaded] = useState(!!initialSchedule);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/schedules/${scheduleId}`);
    if (res.ok) setSchedule(await res.json());
    setLoaded(true);
  }, [scheduleId]);

  useEffect(() => {
    // Always refresh to get enriched data (firingHistory), but don't block rendering
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handlePauseResume() {
    if (!schedule) return;
    const newStatus = schedule.status === "active" ? "paused" : "active";
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      toast.success(newStatus === "paused" ? "Schedule paused" : "Schedule resumed");
      refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to update schedule");
    }
  }

  async function handleDelete() {
    setConfirmDelete(false);
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Schedule deleted");
      router.push("/schedules");
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to delete schedule");
    }
  }

  if (!loaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!schedule) {
    return <p className="text-muted-foreground">Schedule not found.</p>;
  }

  function formatDate(val: string | null): string {
    if (!val) return "—";
    return new Date(val).toLocaleString();
  }

  return (
    <div className="space-y-6" aria-live="polite">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{schedule.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {describeCron(schedule.cronExpression)}
            {schedule.assignedAgent && ` · Runtime: ${schedule.assignedAgent}`}
            {schedule.agentProfile && ` · Profile: ${schedule.agentProfile}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ScheduleStatusBadge status={schedule.status} />
          {(schedule.status === "active" || schedule.status === "paused") && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePauseResume}
              aria-label={
                schedule.status === "active" ? "Pause schedule" : "Resume schedule"
              }
            >
              {schedule.status === "active" ? (
                <>
                  <Pause className="h-3.5 w-3.5 mr-1" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 mr-1" />
                  Resume
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete schedule"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Hash className="h-3.5 w-3.5" />
              Firings
            </div>
            <p className="text-2xl font-bold">
              {schedule.firingCount}
              {schedule.maxFirings && (
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {schedule.maxFirings}
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Zap className="h-3.5 w-3.5" />
              Last Fired
            </div>
            <p className="text-sm font-medium">
              {formatDate(schedule.lastFiredAt)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-3.5 w-3.5" />
              Next Fire
            </div>
            <p className="text-sm font-medium">
              {schedule.status === "active"
                ? formatDate(schedule.nextFireAt)
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Prompt */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{schedule.prompt}</p>
        </CardContent>
      </Card>

      {/* Firing History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Operations Receipts ({schedule.receipts?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OperationsReceiptHistory
            receipts={schedule.receipts ?? []}
            reconciliationErrors={schedule.receiptReconciliationErrors}
          />
        </CardContent>
      </Card>

      {/* Firing History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Firing History ({schedule.firingHistory.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {schedule.firingHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No firings yet. The scheduler checks every 60 seconds.
            </p>
          ) : (
            <div className="space-y-2">
              {schedule.firingHistory.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between border rounded-lg p-3 text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                  tabIndex={0}
                  onClick={() => router.push(`/monitor?taskId=${task.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/monitor?taskId=${task.id}`);
                    }
                  }}
                >
                  <div>
                    <span className="font-medium">{task.title}</span>
                    <span className="text-muted-foreground ml-2">
                      {formatDate(task.createdAt)}
                    </span>
                  </div>
                  <Badge variant={taskStatusVariant[task.status] ?? "secondary"}>
                    {task.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Schedule"
        description="This will permanently delete this schedule. Child tasks will be kept."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        destructive
      />
    </div>
  );
}
