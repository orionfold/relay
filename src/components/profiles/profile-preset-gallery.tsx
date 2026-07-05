"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Copy } from "lucide-react";
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
    <div className="surface-panel rounded-2xl p-4 space-y-3">
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            className="bg-muted text-left rounded-lg border border-border/60 p-3 cursor-pointer hover:border-primary/40 hover:bg-accent transition-colors"
            onClick={() => {
              onClose?.();
              router.push(`/agents/${p.id}/edit?duplicate=true`);
            }}
          >
            <p className="text-sm font-medium truncate">{p.name}</p>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {p.description}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
