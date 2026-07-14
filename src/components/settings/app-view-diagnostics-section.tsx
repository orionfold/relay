"use client";

import { useCallback, useEffect, useState } from "react";
import { AppWindow, ScanSearch } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormSectionCard } from "@/components/shared/form-section-card";

interface AppsSettings {
  showInferenceDiagnostics: boolean;
}

export function AppViewDiagnosticsSection() {
  const [settings, setSettings] = useState<AppsSettings>({ showInferenceDiagnostics: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/settings/apps", { cache: "no-store" });
      if (!response.ok) throw new Error("App diagnostics settings could not be loaded");
      setSettings(await response.json());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "App diagnostics settings could not be loaded");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setEnabled(enabled: boolean) {
    const previous = settings;
    setSettings({ showInferenceDiagnostics: enabled });
    setSaving(true);
    try {
      const response = await fetch("/api/settings/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showInferenceDiagnostics: enabled }),
      });
      if (!response.ok) throw new Error("App diagnostics setting could not be saved");
      setSettings(await response.json());
      toast.success(`App view diagnostics ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : "App diagnostics setting could not be saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AppWindow className="h-5 w-5" aria-hidden="true" />
          App authoring
        </CardTitle>
        <CardDescription>
          Inspect the deterministic rules Relay uses to choose an installed app&apos;s view.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormSectionCard
          icon={ScanSearch}
          title="View-kit diagnostics"
          hint="Adds an inspection link to each app's view badge. The page explains explicit versus inferred selection and provides the equivalent view declaration; it never changes the selected kit."
        >
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="app-view-diagnostics-toggle" className="text-sm">
              {loading ? "Loading…" : settings.showInferenceDiagnostics ? "Enabled" : "Disabled"}
            </Label>
            <Switch
              id="app-view-diagnostics-toggle"
              checked={settings.showInferenceDiagnostics}
              disabled={loading || saving}
              onCheckedChange={setEnabled}
              aria-label="View-kit diagnostics"
              aria-describedby="app-view-diagnostics-description"
            />
          </div>
          <p id="app-view-diagnostics-description" className="sr-only">
            When enabled, view badges link to a deterministic explanation page for app authors.
          </p>
        </FormSectionCard>
      </CardContent>
    </Card>
  );
}
