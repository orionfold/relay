"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScheduleCreateSheet } from "./schedule-create-sheet";
import { ScheduleDetailSheet } from "./schedule-detail-sheet";
import { ScheduleEditSheet } from "./schedule-edit-sheet";
import { ScheduleStatusBadge } from "./schedule-status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { describeCron } from "@/lib/schedules/interval-parser";
import { PackPill } from "@/components/shared/pack-pill";
import { packOf } from "@/lib/apps/pack-of";
import { Clock, Heart, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Schedule {
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
  lastFiredAt: string | null;
  nextFireAt: string | null;
  createdAt: string;
  type: "scheduled" | "heartbeat";
  suppressionCount: number;
}

interface ScheduleListProps {
  projects: { id: string; name: string }[];
  initialSelectedId?: string;
}

export function ScheduleList({ projects, initialSelectedId }: ScheduleListProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [installedPacks, setInstalledPacks] = useState<
    { id: string; name: string }[]
  >([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(
    initialSelectedId ?? null
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  // FEAT-7 — "all" or a specific installed pack id.
  const [packFilter, setPackFilter] = useState<string>("all");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/schedules");
    if (res.ok) setSchedules(await res.json());
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Installed packs — a pack schedule's id is `app:<packId>:<sid>`, so packOf
  // resolves provenance from the id alone (FEAT-8).
  useEffect(() => {
    fetch("/api/apps")
      .then((r) => (r.ok ? r.json() : []))
      .then((apps: Array<{ id: string; name: string }>) =>
        setInstalledPacks(apps.map((a) => ({ id: a.id, name: a.name })))
      )
      .catch(() => {});
  }, []);

  const installedPackIds = new Set(installedPacks.map((p) => p.id));
  const packNameById = new Map(installedPacks.map((p) => [p.id, p.name]));
  const packNameForSchedule = (id: string): string | null => {
    const packId = packOf({ kind: "schedule", id }, installedPackIds);
    return packId ? packNameById.get(packId) ?? null : null;
  };

  // FEAT-7 — filter by installed pack, resolved from the schedule id via packOf.
  const filteredSchedules =
    packFilter === "all"
      ? schedules
      : schedules.filter(
          (s) => packOf({ kind: "schedule", id: s.id }, installedPackIds) === packFilter
        );

  async function handlePauseResume(id: string, currentStatus: string) {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    const res = await fetch(`/api/schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      toast.success(
        newStatus === "paused" ? "Schedule paused" : "Schedule resumed"
      );
      refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to update schedule");
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Schedule deleted");
      refresh();
    } else {
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Failed to delete schedule");
    }
  }

  function formatRelative(dateStr: string | null): string {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const absDiff = Math.abs(diffMs);

    if (absDiff < 60_000) return diffMs > 0 ? "in <1m" : "<1m ago";
    if (absDiff < 3_600_000) {
      const mins = Math.round(absDiff / 60_000);
      return diffMs > 0 ? `in ${mins}m` : `${mins}m ago`;
    }
    if (absDiff < 86_400_000) {
      const hrs = Math.round(absDiff / 3_600_000);
      return diffMs > 0 ? `in ${hrs}h` : `${hrs}h ago`;
    }
    return date.toLocaleDateString();
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-4">
        {/* FEAT-7 — filter by installed pack. Only shown when a pack is
            installed, so the control never appears empty on a fresh instance. */}
        {installedPacks.length > 0 && (
          <select
            value={packFilter}
            onChange={(e) => setPackFilter(e.target.value)}
            aria-label="Filter by pack"
            className="surface-control h-9 rounded-md border border-input px-3 text-sm"
          >
            <option value="all">All packs</option>
            {installedPacks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <Button onClick={() => setCreateOpen(true)}>
          <Clock className="h-4 w-4 mr-2" />
          New Schedule
        </Button>
      </div>

      {!loaded ? (
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          aria-live="polite"
        >
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
      ) : schedules.length === 0 ? (
        <EmptyState
          icon={Clock}
          heading="No schedules yet"
          description="Create a schedule to run agent tasks on a recurring interval or one-time delay."
        />
      ) : filteredSchedules.length === 0 ? (
        <EmptyState
          icon={Clock}
          heading="No schedules in this pack"
          description="No schedules match the selected pack. Choose a different pack or show all."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSchedules.map((sched) => (
            <Card
              key={sched.id}
              tabIndex={0}
              tone="schedule"
              watermark={sched.type === "heartbeat" ? Heart : Clock}
              className="elevation-1 cursor-pointer transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
              onClick={() => setSelectedScheduleId(sched.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedScheduleId(sched.id);
                }
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <CardTitle className="min-w-0 truncate text-base font-medium flex items-center gap-1.5">
                    {sched.type === "heartbeat" && (
                      <Heart className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                    )}
                    {sched.name}
                  </CardTitle>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(() => {
                      const packName = packNameForSchedule(sched.id);
                      return packName ? <PackPill packName={packName} /> : null;
                    })()}
                    <ScheduleStatusBadge status={sched.status} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{describeCron(sched.cronExpression)}</span>
                  <span>·</span>
                  <span>
                    {sched.firingCount} firing
                    {sched.firingCount !== 1 ? "s" : ""}
                  </span>
                  {sched.type === "heartbeat" && sched.suppressionCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-600">
                        {sched.suppressionCount} suppressed
                      </span>
                    </>
                  )}
                  {!sched.recurs && (
                    <>
                      <span>·</span>
                      <span>One-shot</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1.5">
                  {sched.prompt.length > 80
                    ? sched.prompt.slice(0, 80) + "..."
                    : sched.prompt}
                </p>
                {(sched.assignedAgent || sched.agentProfile) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {sched.assignedAgent ? `Runtime: ${sched.assignedAgent}` : "Default runtime"}
                    {sched.agentProfile ? ` · Profile: ${sched.agentProfile}` : ""}
                  </p>
                )}
                {sched.status === "active" && sched.nextFireAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Next: {formatRelative(sched.nextFireAt)}
                  </p>
                )}
                <div className="flex items-center gap-1 mt-3">
                  {(sched.status === "active" || sched.status === "paused") && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={
                        sched.status === "active"
                          ? "Pause schedule"
                          : "Resume schedule"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePauseResume(sched.id, sched.status);
                      }}
                    >
                      {sched.status === "active" ? (
                        <Pause className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    aria-label="Delete schedule"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(sched.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ScheduleCreateSheet
        projects={projects}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refresh}
      />

      <ScheduleDetailSheet
        scheduleId={selectedScheduleId}
        open={selectedScheduleId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedScheduleId(null);
        }}
        onDeleted={refresh}
        onUpdated={refresh}
        onEdit={(id) => {
          setSelectedScheduleId(null);
          setEditingScheduleId(id);
        }}
      />

      <ScheduleEditSheet
        scheduleId={editingScheduleId}
        projects={projects}
        open={editingScheduleId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingScheduleId(null);
        }}
        onUpdated={refresh}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null);
        }}
        title="Delete Schedule"
        description="This will permanently delete this schedule. Child tasks will be kept."
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        destructive
      />
    </div>
  );
}
