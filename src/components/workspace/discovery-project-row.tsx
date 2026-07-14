"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { GitBranch, FolderOpen, Pencil, Check } from "lucide-react";
import type { DiscoveredProject } from "@/lib/environment/discovery";

interface DiscoveryProjectRowProps {
  project: DiscoveredProject;
  selected: boolean;
  customName: string;
  onSelectChange: (selected: boolean) => void;
  onNameChange: (name: string) => void;
}

function formatRelativeTime(epochMs: number): string {
  if (!epochMs) return "";
  const diff = Date.now() - epochMs;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function DiscoveryProjectRow({
  project,
  selected,
  customName,
  onSelectChange,
  onNameChange,
}: DiscoveryProjectRowProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      data-interactive-surface={project.alreadyImported ? undefined : ""}
      data-interactive-outline={project.alreadyImported ? undefined : "preserve"}
      className={`${project.alreadyImported ? "" : "interactive-list-item"} flex items-start gap-3 rounded-lg border p-3 ${
        project.alreadyImported
          ? "opacity-60 bg-muted/30"
          : selected
            ? "border-primary/30 bg-primary/5"
            : ""
      }`}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => onSelectChange(checked === true)}
        className="mt-0.5"
      />

      <div className="flex-1 min-w-0 space-y-1">
        {/* Name row */}
        <div className="flex items-center gap-2">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={customName}
                onChange={(e) => onNameChange(e.target.value)}
                className="h-6 text-sm px-1.5 w-48"
                autoFocus
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setEditing(false);
                }}
              />
              <button
                onClick={() => setEditing(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">{customName}</span>
              {!project.alreadyImported && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {project.alreadyImported && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
              Already Imported
            </Badge>
          )}
        </div>

        {/* Path */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <FolderOpen className="h-3 w-3 shrink-0" />
          <span className="truncate">{project.path}</span>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Marker badges */}
          {project.markers.map((m) => (
            <Badge
              key={m}
              variant={m === "claude" ? "default" : "secondary"}
              className="text-[10px] px-1.5 py-0"
            >
              .{m === "claude" ? "claude" : "codex"}/
            </Badge>
          ))}

          {/* Artifact count */}
          <span className="text-[11px] text-muted-foreground">
            {project.totalArtifactEstimate} artifact{project.totalArtifactEstimate !== 1 ? "s" : ""}
          </span>

          {/* Git branch */}
          {project.gitBranch && (
            <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
              <GitBranch className="h-3 w-3" />
              {project.gitBranch}
            </span>
          )}

          {/* Last modified */}
          {project.lastModified > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {formatRelativeTime(project.lastModified)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
