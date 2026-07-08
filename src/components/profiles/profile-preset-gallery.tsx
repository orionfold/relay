"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Bot, Copy, Sparkles, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { getProfileIcon, getDomainColors } from "@/lib/constants/card-icons";
import {
  FlagshipBadge,
  FlagshipCardActionRow,
  FlagshipIconWell,
} from "@/components/shared/flagship-card";
import type { AgentProfile } from "@/lib/agents/profiles/types";

interface ProfilePresetGalleryProps {
  /** Built-in agent profiles offered as starting points. */
  presets: AgentProfile[];
  /**
   * When provided, renders a "Close" affordance — used by the in-/agents
   * toggle. Omitted on the standalone /presets route (nothing to close).
   */
  onClose?: () => void;
}

/**
 * FEAT-13: the gallery of built-in "preset" agents a user can clone as a
 * starting point. Selecting one opens the new-agent form pre-filled from that
 * preset (duplicate flow). Rendered two ways:
 *  - the standalone /presets route (peer of Agents under Compose), always on;
 *  - a toggle-reveal inside ProfileBrowser on /agents (passes onClose).
 *
 * Mirrors the Tables → Schemas (TableTemplateGallery) elevation pattern.
 */
export function ProfilePresetGallery({
  presets,
  onClose,
}: ProfilePresetGalleryProps) {
  const router = useRouter();

  if (presets.length === 0) {
    return (
      <EmptyState
        icon={Copy}
        heading="No presets available"
        description="Install a pack or built-in agents to start from a preset."
      />
    );
  }

  return (
    <div className="surface-panel space-y-3 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          Use a preset agent as a starting point
        </p>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <span className="text-xs">Close</span>
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {presets.map((p) => {
          const Glyph = getProfileIcon(p.id);
          const profileColors = getDomainColors(p.domain);
          const domainIcon = p.domain === "work" ? Bot : UserCheck;
          const visibleTags = p.tags.slice(0, 3);
          const extraTagCount = Math.max(0, p.tags.length - visibleTags.length);
          return (
            <button
              key={p.id}
              type="button"
              className={cn(
                "surface-card flagship-card-tone flagship-card-tone-preset flagship-card-interactive group relative flex min-h-[190px] flex-col gap-3 overflow-hidden rounded-xl border p-4 text-left",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
              onClick={() => {
                onClose?.();
                router.push(`/agents/${p.id}/edit?duplicate=true`);
              }}
            >
              <Glyph
                aria-hidden
                className="pointer-events-none absolute -right-3 -top-3 h-[9.6rem] w-[9.6rem] select-none"
                style={{ color: profileColors.icon, opacity: 0.1 }}
              />
              <div className="relative flex min-w-0 items-start gap-3">
                <FlagshipIconWell icon={Glyph} color={profileColors.icon} />
                <div className="min-w-0 space-y-1">
                  <p className="min-w-0 truncate text-sm font-semibold leading-tight">
                    {p.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FlagshipBadge icon={Sparkles} tone="primary">
                      Preset
                    </FlagshipBadge>
                    <FlagshipBadge
                      icon={domainIcon}
                      tone={p.domain === "work" ? "primary" : "warning"}
                    >
                      {p.domain}
                    </FlagshipBadge>
                  </div>
                </div>
              </div>
              <p className="relative line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {p.description}
              </p>

              {visibleTags.length > 0 && (
                <div className="relative flex flex-wrap gap-1">
                  {visibleTags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                  {extraTagCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      +{extraTagCount}
                    </Badge>
                  )}
                </div>
              )}

              <FlagshipCardActionRow
                context="Built-in agent starter"
                action="Use preset"
                icon={Copy}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
