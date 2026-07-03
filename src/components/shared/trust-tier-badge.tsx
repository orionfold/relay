"use client";

import { useEffect, useState } from "react";
import { Eye, GitBranch, BotIcon, Shield, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type TrustTier = "observer" | "collaborator" | "autonomous" | "custom";

interface TierInfo {
  id: TrustTier;
  label: string;
  description: string;
  icon: typeof Eye;
  variant: "outline" | "secondary" | "destructive" | "default";
  presetId: string;
}

const TIERS: TierInfo[] = [
  {
    id: "observer",
    label: "Observer",
    description: "Read-only. Agent can read but not modify",
    icon: Eye,
    variant: "outline",
    presetId: "read-only",
  },
  {
    id: "collaborator",
    label: "Collaborator",
    description: "Git-safe. Agent can edit files and use git",
    icon: GitBranch,
    variant: "secondary",
    presetId: "git-safe",
  },
  {
    id: "autonomous",
    label: "Autonomous",
    description: "Full auto. All tools approved automatically",
    icon: BotIcon,
    variant: "destructive",
    presetId: "full-auto",
  },
];

const presetToTier: Record<string, TrustTier> = {
  "read-only": "observer",
  "git-safe": "collaborator",
  "full-auto": "autonomous",
};

function deriveTierFromPresets(activePresetIds: string[]): TrustTier {
  if (activePresetIds.includes("full-auto")) return "autonomous";
  if (activePresetIds.includes("git-safe")) return "collaborator";
  if (activePresetIds.includes("read-only")) return "observer";
  return "custom";
}

/**
 * TrustTierBadge — shows current trust level in sidebar footer.
 * Fetches active presets from API and allows switching tiers.
 */
export function TrustTierBadge() {
  const [tier, setTier] = useState<TrustTier>("observer");
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchTier = () => {
    fetch("/api/permissions/presets")
      .then((res) => res.json())
      .then((data: { presets: { id: string; active: boolean }[] }) => {
        const activeIds = (data.presets ?? [])
          .filter((p) => p.active)
          .map((p) => p.id);
        setTier(deriveTierFromPresets(activeIds));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTier();
  }, []);

  const handleSwitch = async (target: TierInfo) => {
    if (target.id === tier || switching) return;
    setSwitching(true);

    try {
      // Remove current preset first (if it maps to a known tier)
      const currentTierInfo = TIERS.find((t) => t.id === tier);
      if (currentTierInfo) {
        await fetch("/api/permissions/presets", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presetId: currentTierInfo.presetId }),
        });
      }

      // Apply the new preset
      await fetch("/api/permissions/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId: target.presetId }),
      });

      setTier(target.id);
      setOpen(false);
    } catch {
      // Re-fetch to get the actual state on error
      fetchTier();
    } finally {
      setSwitching(false);
    }
  };

  const info = TIERS.find((t) => t.id === tier) ?? {
    id: "custom" as TrustTier,
    label: "Custom",
    description: "Custom permission configuration",
    icon: Shield,
    variant: "outline" as const,
    presetId: "",
  };

  if (loading) return null;

  const Icon = info.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          aria-label={`Trust tier: ${info.label}`}
        >
          <Shield className="h-3.5 w-3.5" />
          <span className="group-data-[collapsible=icon]:hidden">
            {info.label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" className="w-64 p-3">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <span className="text-sm font-medium">{info.label}</span>
            <Badge variant={info.variant} className="text-xs ml-auto">
              Active
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{info.description}</p>
          <div className="space-y-0.5 pt-1 border-t border-border">
            {TIERS.map((t) => {
              const isActive = t.id === tier;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={switching || isActive}
                  onClick={() => handleSwitch(t)}
                  className={`flex items-center gap-2 text-xs py-1.5 px-1.5 w-full rounded-md transition-colors ${
                    isActive
                      ? "text-foreground font-medium bg-accent/50"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/30 cursor-pointer"
                  } disabled:opacity-50`}
                >
                  <t.icon className="h-3 w-3 shrink-0" />
                  <span>{t.label}</span>
                  {isActive && (
                    <span className="ml-auto text-primary">●</span>
                  )}
                  {switching && !isActive && (
                    <Loader2 className="ml-auto h-3 w-3 animate-spin" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
