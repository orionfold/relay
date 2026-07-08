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
import {
  CheckCircle2,
  ListChecks,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { FlagshipBadge, FlagshipIconWell } from "@/components/shared/flagship-card";
import { cn } from "@/lib/utils";

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
    tone: "success" as const,
    label: "Low Risk",
    color: "var(--status-completed)",
  },
  medium: {
    icon: Shield,
    tone: "warning" as const,
    label: "Medium Risk",
    color: "var(--status-warning)",
  },
  high: {
    icon: ShieldAlert,
    tone: "danger" as const,
    label: "High Risk",
    color: "var(--destructive)",
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
    <Card tone="preset" watermark={Zap} className="surface-card">
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
                <article
                  key={preset.id}
                  className={cn(
                    "group relative flex min-h-[248px] flex-col gap-3 overflow-hidden rounded-xl border p-4 transition-[background-color,border-color,box-shadow]",
                    "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
                    preset.active
                      ? "border-primary/50 bg-primary/8 shadow-[var(--shadow-raised)] ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-primary/30 hover:bg-accent/35"
                  )}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <FlagshipIconWell icon={Icon} color={config.color} />
                      <div className="min-w-0 space-y-1">
                        <h3 className="min-w-0 truncate text-sm font-semibold leading-tight">
                          {preset.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <FlagshipBadge icon={Zap} tone="primary">
                            Preset
                          </FlagshipBadge>
                          <FlagshipBadge icon={Icon} tone={config.tone}>
                            {config.label}
                          </FlagshipBadge>
                        </div>
                      </div>
                    </div>
                    {preset.active ? (
                      <Badge variant="default" className="shrink-0 gap-1 text-[10px]">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Available
                      </Badge>
                    )}
                  </div>

                  <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {preset.description}
                  </p>

                  <div className="surface-control space-y-2 rounded-lg p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                        Permission patterns
                      </span>
                      <FlagshipBadge icon={ListChecks} tone="muted">
                        {preset.patterns.length}
                      </FlagshipBadge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {preset.patterns.map((p) => (
                        <span
                          key={p}
                          className="inline-flex max-w-full items-center rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                          title={p}
                        >
                          <span className="truncate">{p}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <Button
                    variant={preset.active ? "outline" : "default"}
                    size="sm"
                    className="mt-auto w-full gap-1.5"
                    disabled={isToggling}
                    onClick={() => handleToggle(preset.id, preset.active)}
                  >
                    {preset.active ? (
                      <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {isToggling
                      ? "Updating..."
                      : preset.active
                        ? "Disable"
                        : "Enable"}
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
