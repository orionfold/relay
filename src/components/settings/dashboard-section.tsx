"use client";

import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DASHBOARD_MODULES,
  DEFAULT_DASHBOARD_PREFERENCES,
  type DashboardModuleId,
  type DashboardPreferences,
} from "@/lib/dashboard/modules";

export function DashboardSection() {
  const [preferences, setPreferences] = useState<DashboardPreferences>(
    DEFAULT_DASHBOARD_PREFERENCES
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/dashboard", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Dashboard settings could not be loaded");
      setPreferences(await response.json());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Dashboard settings could not be loaded"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: DashboardPreferences) {
    const previous = preferences;
    setPreferences(next);
    setSaving(true);
    try {
      const response = await fetch("/api/settings/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("Dashboard settings could not be saved");
      setPreferences(await response.json());
    } catch (error) {
      setPreferences(previous);
      toast.error(
        error instanceof Error
          ? error.message
          : "Dashboard settings could not be saved"
      );
    } finally {
      setSaving(false);
    }
  }

  function setModuleVisible(id: DashboardModuleId, visible: boolean) {
    void save({
      ...preferences,
      visible: { ...preferences.visible, [id]: visible },
    });
  }

  async function reset() {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/dashboard", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Dashboard defaults could not be restored");
      setPreferences(await response.json());
      toast.success("Dashboard defaults restored");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Dashboard defaults could not be restored"
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          Dashboard
        </CardTitle>
        <CardDescription>
          Choose which local operational modules appear on Home and whether
          unresolved work and recent autonomous activity influence their order.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="surface-card-muted flex items-center justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="dashboard-smart-ordering">Smart ordering</Label>
            <p className="text-xs text-muted-foreground">
              Promotes operator action, active work, health issues and recent
              output using deterministic local signals.
            </p>
          </div>
          <Switch
            id="dashboard-smart-ordering"
            checked={preferences.smartOrdering}
            disabled={loading || saving}
            onCheckedChange={(smartOrdering) =>
              void save({ ...preferences, smartOrdering })
            }
          />
        </div>

        <div className="divide-y rounded-lg border">
          {DASHBOARD_MODULES.map((module) => {
            const checked =
              preferences.visible[module.id] ?? module.defaultVisible;
            return (
              <div
                key={module.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div className="min-w-0">
                  <Label htmlFor={`dashboard-module-${module.id}`}>
                    {module.title}
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {module.description}
                  </p>
                </div>
                <Switch
                  id={`dashboard-module-${module.id}`}
                  checked={checked}
                  disabled={loading || saving}
                  onCheckedChange={(visible) =>
                    setModuleVisible(module.id, visible)
                  }
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || saving}
            onClick={() => void reset()}
          >
            <RotateCcw className="h-4 w-4" />
            Restore defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
