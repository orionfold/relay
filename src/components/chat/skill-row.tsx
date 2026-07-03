"use client";
import { Sparkles, Star, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CommandItem } from "@/components/ui/command";
import type { EnrichedSkill } from "@/lib/environment/skill-enrichment";
import type { ReactNode } from "react";

interface SkillRowProps {
  skill: EnrichedSkill;
  recommended?: boolean;
  onSelect: () => void;
  onDismissRecommendation?: () => void;
  /** Whether this skill is currently active on the conversation. */
  isActive?: boolean;
  /** Optional "+ Add" / disabled "+ Add" button rendered to the right. */
  addButton?: ReactNode;
  /** Called when the user wants to deactivate this (active) skill. */
  onDeactivate?: () => void;
}

function healthVariant(
  h: EnrichedSkill["healthScore"]
): "default" | "secondary" | "destructive" | "outline" {
  if (h === "healthy") return "default";
  if (h === "stale") return "outline";
  if (h === "aging" || h === "broken") return "destructive";
  return "secondary";
}

function syncLabel(s: EnrichedSkill["syncStatus"]): string {
  switch (s) {
    case "synced":
      return "synced";
    case "claude-only":
      return "claude-only";
    case "codex-only":
      return "codex-only";
    case "shared":
      return "shared";
  }
}

export function SkillRow({
  skill,
  recommended,
  onSelect,
  onDismissRecommendation,
  isActive,
  addButton,
  onDeactivate,
}: SkillRowProps) {
  return (
    <CommandItem
      key={skill.id}
      value={`${skill.name} ${skill.preview} ${skill.tool}`}
      onSelect={onSelect}
    >
      <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col min-w-0 gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{skill.name}</span>
          {isActive && (
            <Badge variant="default" className="text-[10px] shrink-0">
              active
            </Badge>
          )}
          {recommended && (
            <Star
              className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500"
              aria-label="Recommended for this conversation"
            />
          )}
          {recommended && onDismissRecommendation && (
            <button
              type="button"
              aria-label="Dismiss recommendation"
              className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(e) => {
                e.stopPropagation();
                onDismissRecommendation();
              }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {skill.preview}
        </span>
        <div className="flex flex-wrap items-center gap-1 mt-0.5">
          <Badge
            variant={healthVariant(skill.healthScore)}
            className="text-[10px]"
          >
            {skill.healthScore}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {syncLabel(skill.syncStatus)}
          </Badge>
          {skill.linkedProfileId && (
            <Badge variant="secondary" className="text-[10px]">
              {skill.linkedProfileId}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {skill.scope}
          </Badge>
        </div>
      </div>
      {/* Right-side slot: the Add or Deactivate button. */}
      {isActive && onDeactivate ? (
        <button
          type="button"
          aria-label={`Deactivate ${skill.name}`}
          title="Deactivate skill"
          className="ml-auto shrink-0 text-[10px] text-muted-foreground hover:text-foreground rounded px-1 py-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            onDeactivate();
          }}
        >
          <X className="h-3 w-3" />
        </button>
      ) : addButton ? (
        addButton
      ) : null}
    </CommandItem>
  );
}
