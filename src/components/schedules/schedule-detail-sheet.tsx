"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleStatusBadge } from "./schedule-status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { describeCron } from "@/lib/schedules/interval-parser";
import { taskStatusVariant } from "@/lib/constants/status-colors";
import { Pause, Play, Trash2, Clock, Zap, Hash, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  OperationsReceiptHistory,
  type OperationsReceiptHistoryItem,
} from "@/components/operations/operations-receipt-history";
import { ScheduleBudgetPolicyPanel } from "@/components/budgets/schedule-budget-policy-panel";
import type { ScheduleBudgetSnapshot } from "@/lib/schedules/budget-policies";

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
  budget: ScheduleBudgetSnapshot;
}

interface ScheduleDetailSheetProps {
  scheduleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
  onUpdated?: () => void;
  onEdit?: (scheduleId: string) => void;
}

export function ScheduleDetailSheet({
  scheduleId,
  open,
  onOpenChange,
  onDeleted,
  onUpdated,
  onEdit,
}: ScheduleDetailSheetProps) {
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refresh = useCallback(async () => {
    if (!scheduleId) return;
    const res = await fetch(`/api/schedules/${scheduleId}`);
    if (res.ok) setSchedule(await res.json());
    setLoaded(true);
  }, [scheduleId]);

  useEffect(() => {
    if (!open || !scheduleId) {
      setSchedule(null);
      setLoaded(false);
      return;
    }
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [open, scheduleId, refresh]);

  async function handlePauseResume() {
    if (!schedule || !scheduleId) return;
    const newStatus = schedule.status === "active" ? "paused" : "active";
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      toast.success(newStatus === "paused" ? "Schedule paused" : "Schedule resumed");
      refresh();
      onUpdated?.();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to update schedule");
    }
  }

  async function handleDelete() {
    if (!scheduleId) return;
    setConfirmDelete(false);
    const res = await fetch(`/api/schedules/${scheduleId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      toast.success("Schedule deleted");
      onOpenChange(false);
      onDeleted?.();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to delete schedule");
    }
  }

  function formatDate(val: string | null): string {
    if (!val) return "—";
    return new Date(val).toLocaleString();
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <SheetTitle className="truncate">
                {schedule?.name ?? "Schedule"}
              </SheetTitle>
            </div>
            <SheetDescription>
              {schedule ? describeCron(schedule.cronExpression) : "Loading..."}
              {schedule?.assignedAgent && ` · Runtime: ${schedule.assignedAgent}`}
              {schedule?.agentProfile && ` · Profile: ${schedule.agentProfile}`}
            </SheetDescription>
          </SheetHeader>

          {/* Body — px-6 pb-6 per project convention (SheetContent has NO body padding) */}
          <div className="px-6 pb-6 space-y-5 overflow-y-auto">
            {!loaded ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : !schedule ? (
              <p className="text-muted-foreground">Schedule not found.</p>
            ) : (
              <>
                {/* Status + Actions */}
                <div className="flex items-center gap-2">
                  <ScheduleStatusBadge status={schedule.status} />
                  {(schedule.status === "active" || schedule.status === "paused") && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          onOpenChange(false);
                          onEdit?.(schedule.id);
                        }}
                        aria-label="Edit schedule"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
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
                    </>
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

                <ScheduleBudgetPolicyPanel initialSnapshot={schedule.budget} />

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="surface-control rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Hash className="h-3 w-3" />
                      Firings
                    </div>
                    <p className="text-lg font-semibold">
                      {schedule.firingCount}
                      {schedule.maxFirings && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {" "}/ {schedule.maxFirings}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="surface-control rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Zap className="h-3 w-3" />
                      Last Fired
                    </div>
                    <p className="text-xs font-medium">
                      {formatDate(schedule.lastFiredAt)}
                    </p>
                  </div>
                  <div className="surface-control rounded-lg p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                      <Clock className="h-3 w-3" />
                      Next Fire
                    </div>
                    <p className="text-xs font-medium">
                      {schedule.status === "active"
                        ? formatDate(schedule.nextFireAt)
                        : "—"}
                    </p>
                  </div>
                </div>

                {/* Prompt */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Prompt</p>
                  <div className="bg-muted rounded-lg p-3">
                    <p className="text-sm whitespace-pre-wrap">{schedule.prompt}</p>
                  </div>
                </div>

                {/* Firing History */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Operations Receipts ({schedule.receipts?.length ?? 0})
                  </p>
                  <OperationsReceiptHistory
                    receipts={schedule.receipts ?? []}
                    reconciliationErrors={schedule.receiptReconciliationErrors}
                  />
                </div>

                {/* Firing History */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Firing History ({schedule.firingHistory.length})
                  </p>
                  {schedule.firingHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No firings yet. The scheduler checks every 60 seconds.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {schedule.firingHistory.map((task) => (
                        <div
                          key={task.id}
                          data-interactive-surface=""
                          data-interactive-outline="preserve"
                          className="interactive-list-item flex items-center justify-between border rounded-lg p-2.5 text-xs"
                          tabIndex={0}
                          onClick={() => router.push(`/monitor?taskId=${task.id}`)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              router.push(`/monitor?taskId=${task.id}`);
                            }
                          }}
                        >
                          <div className="min-w-0">
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
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Schedule"
        description="This will permanently delete this schedule. Child tasks will be kept."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        destructive
      />
    </>
  );
}
