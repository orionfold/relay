"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "sonner";
import {
  Loader2,
  Camera,
  RotateCcw,
  Trash2,
  HardDrive,
  Clock,
  AlertTriangle,
} from "lucide-react";

interface Snapshot {
  id: string;
  label: string;
  type: "manual" | "auto";
  status: "in_progress" | "completed" | "failed";
  filePath: string;
  sizeBytes: number;
  dbSizeBytes: number;
  filesSizeBytes: number;
  fileCount: number;
  error: string | null;
  createdAt: string;
  filesMissing: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function DatabaseSnapshotsSection() {
  const [snapshotList, setSnapshotList] = useState<Snapshot[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoreComplete, setRestoreComplete] = useState(false);

  // Auto-backup settings
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoInterval, setAutoInterval] = useState("1d");
  const [maxCount, setMaxCount] = useState("10");
  const [maxAgeWeeks, setMaxAgeWeeks] = useState("4");
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchSnapshots = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshots");
      const data = await res.json();
      setSnapshotList(data.snapshots || []);
      setTotalBytes(data.totalBytes || 0);
    } catch {
      // Silent fail on fetch
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/snapshots/settings");
      if (res.ok) {
        const settings = await res.json();
        setAutoEnabled(settings.enabled === "true");
        setAutoInterval(settings.interval || "1d");
        setMaxCount(settings.maxCount || "10");
        setMaxAgeWeeks(settings.maxAgeWeeks || "4");
      }
    } catch {
      // Use defaults
    }
  }, []);

  useEffect(() => {
    fetchSnapshots();
    fetchSettings();
  }, [fetchSnapshots, fetchSettings]);

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await fetch("/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: snapshotLabel.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `Snapshot created. ${formatBytes(data.sizeBytes)} (${data.fileCount} files)`
        );
        setSnapshotLabel("");
        fetchSnapshots();
      } else {
        toast.error(data.error || "Failed to create snapshot");
      }
    } catch {
      toast.error("Failed to create snapshot. Network error");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/snapshots/${deleteId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Snapshot deleted");
        fetchSnapshots();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to delete snapshot");
      }
    } catch {
      toast.error("Failed to delete. Network error");
    } finally {
      setDeleteId(null);
    }
  }

  async function handleRestore() {
    if (!restoreId) return;
    setRestoring(true);
    try {
      const res = await fetch(`/api/snapshots/${restoreId}/restore`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setRestoreComplete(true);
        toast.success("Restore complete. Please restart the server");
      } else {
        toast.error(data.error || "Restore failed");
      }
    } catch {
      toast.error("Restore failed. Network error");
    } finally {
      setRestoring(false);
      setRestoreId(null);
    }
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      const res = await fetch("/api/snapshots/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: autoEnabled ? "true" : "false",
          interval: autoInterval,
          maxCount,
          maxAgeWeeks,
        }),
      });
      if (res.ok) {
        toast.success("Snapshot settings saved");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings. Network error");
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <>
      <Card className="surface-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="h-5 w-5" />
                Database Snapshots
              </CardTitle>
              <CardDescription>
                Create, schedule, and restore full-state backups of your database
                and files
              </CardDescription>
            </div>
            {totalBytes > 0 && (
              <Badge variant="secondary">{formatBytes(totalBytes)} used</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Restart banner */}
          {restoreComplete && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Restart required
                </p>
                <p className="text-amber-700 dark:text-amber-300">
                  The database has been restored. Please restart the server to
                  load the restored data.
                </p>
              </div>
            </div>
          )}

          {/* Create snapshot */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Manual Snapshot</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Optional label (e.g., Before migration)"
                value={snapshotLabel}
                onChange={(e) => setSnapshotLabel(e.target.value)}
                className="max-w-sm"
                disabled={creating}
              />
              <Button
                onClick={handleCreate}
                disabled={creating || restoreComplete}
              >
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="mr-2 h-4 w-4" />
                )}
                {creating ? "Creating..." : "Create Snapshot"}
              </Button>
            </div>
          </div>

          <Separator />

          {/* Auto-backup settings */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Auto-Backup</Label>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm">Enable automatic backups</p>
                <p className="text-xs text-muted-foreground">
                  Snapshots are created at the configured interval
                </p>
              </div>
              <Switch
                checked={autoEnabled}
                onCheckedChange={setAutoEnabled}
              />
            </div>

            {autoEnabled && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Interval
                  </Label>
                  <Input
                    value={autoInterval}
                    onChange={(e) => setAutoInterval(e.target.value)}
                    placeholder="1d"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    e.g., 6h, 1d, 1w
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Keep last N snapshots
                  </Label>
                  <Input
                    type="number"
                    value={maxCount}
                    onChange={(e) => setMaxCount(e.target.value)}
                    min={1}
                    max={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    Keep last N weeks
                  </Label>
                  <Input
                    type="number"
                    value={maxAgeWeeks}
                    onChange={(e) => setMaxAgeWeeks(e.target.value)}
                    min={1}
                    max={52}
                  />
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Clock className="mr-2 h-4 w-4" />
              )}
              {savingSettings ? "Saving..." : "Save Settings"}
            </Button>
          </div>

          <Separator />

          {/* Snapshot list */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">
              Snapshots ({snapshotList.length})
            </Label>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading snapshots...
              </div>
            ) : snapshotList.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No snapshots yet. Create one to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {snapshotList.map((snap) => (
                  <div
                    key={snap.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {snap.label}
                        </p>
                        <Badge
                          variant={
                            snap.type === "auto" ? "secondary" : "default"
                          }
                          className="shrink-0 text-xs"
                        >
                          {snap.type}
                        </Badge>
                        {snap.status === "failed" && (
                          <Badge variant="destructive" className="shrink-0 text-xs">
                            failed
                          </Badge>
                        )}
                        {snap.status === "in_progress" && (
                          <Badge variant="outline" className="shrink-0 text-xs">
                            in progress
                          </Badge>
                        )}
                        {snap.filesMissing && (
                          <Badge
                            variant="destructive"
                            className="shrink-0 text-xs"
                          >
                            files missing
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatRelativeTime(snap.createdAt)} ·{" "}
                        {formatBytes(snap.sizeBytes)} ·{" "}
                        {snap.fileCount} files
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRestoreId(snap.id)}
                        disabled={
                          snap.status !== "completed" ||
                          snap.filesMissing ||
                          restoring ||
                          restoreComplete
                        }
                        title="Restore from this snapshot"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteId(snap.id)}
                        title="Delete this snapshot"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete snapshot?"
        description="This will permanently delete the snapshot and its files from disk. This action cannot be undone."
        confirmLabel="Delete Snapshot"
        onConfirm={handleDelete}
        destructive
      />

      {/* Restore confirmation */}
      <ConfirmDialog
        open={restoreId !== null}
        onOpenChange={(open) => !open && setRestoreId(null)}
        title="Restore from snapshot?"
        description="This will replace your current database and all files with the snapshot's contents. A safety snapshot of your current state will be created first. The server must be restarted after restore."
        confirmLabel="Restore"
        onConfirm={handleRestore}
        destructive
      />
    </>
  );
}
