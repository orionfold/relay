"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldAlert, ShieldCheck, Zap } from "lucide-react";

interface PresetInfo {
  id: string;
  name: string;
  description: string;
  risk: "low" | "medium" | "high";
  patterns: string[];
  active: boolean;
}

const RISK_CONFIG = {
  low: {
    icon: ShieldCheck,
    variant: "success" as const,
    label: "Low Risk",
  },
  medium: {
    icon: Shield,
    variant: "default" as const,
    label: "Medium Risk",
  },
  high: {
    icon: ShieldAlert,
    variant: "destructive" as const,
    label: "High Risk",
  },
};

export function PresetsSection({ onPresetChange }: { onPresetChange?: () => void }) {
  const [presets, setPresets] = useState<PresetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    fetchPresets();
  }, []);

  async function fetchPresets() {
    try {
      const res = await fetch("/api/permissions/presets");
      if (res.ok) {
        const data = await res.json();
        setPresets(data.presets ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(presetId: string, currentlyActive: boolean) {
    setToggling(presetId);
    try {
      const res = await fetch("/api/permissions/presets", {
        method: currentlyActive ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId }),
      });
      if (res.ok) {
        await fetchPresets();
        onPresetChange?.();
      }
    } finally {
      setToggling(null);
    }
  }

  return (
    <Card className="surface-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Permission Presets
        </CardTitle>
        <CardDescription>
          One-click permission bundles for common use cases. Presets are additive.
          Enabling a higher-risk preset includes all lower-risk permissions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {presets.map((preset) => {
              const config = RISK_CONFIG[preset.risk];
              const Icon = config.icon;
              const isToggling = toggling === preset.id;

              return (
                <div
                  key={preset.id}
                  className={`rounded-lg border p-4 flex flex-col gap-3 transition-colors ${
                    preset.active
                      ? "border-primary/50 bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <h3 className="font-medium text-sm flex items-center gap-1.5">
                        <Icon className="h-4 w-4" />
                        {preset.name}
                      </h3>
                      <Badge variant={config.variant} className="text-[10px]">
                        {config.label}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {preset.description}
                  </p>

                  <div className="flex flex-wrap gap-1">
                    {preset.patterns.map((p) => (
                      <span
                        key={p}
                        className="inline-block font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded"
                      >
                        {p}
                      </span>
                    ))}
                  </div>

                  <Button
                    variant={preset.active ? "outline" : "default"}
                    size="sm"
                    className="w-full mt-auto"
                    disabled={isToggling}
                    onClick={() => handleToggle(preset.id, preset.active)}
                  >
                    {isToggling
                      ? "Updating..."
                      : preset.active
                        ? "Disable"
                        : "Enable"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
