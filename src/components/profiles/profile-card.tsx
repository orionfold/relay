"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";
import type { AgentRuntimeId } from "@/lib/agents/runtime/catalog";
import { getSupportedRuntimes } from "@/lib/agents/profiles/compatibility";
import { getProfileIcon, getDomainColors } from "@/lib/constants/card-icons";
import { PackPill } from "@/components/shared/pack-pill";
import type { AgentProfile } from "@/lib/agents/profiles/types";

interface ProfileCardProps {
  profile: AgentProfile;
  isBuiltin?: boolean;
  /** Display name of the pack that installed this profile, or null (FEAT-8). */
  packName?: string | null;
  onClick: () => void;
}

/**
 * Short chip labels for the compact runtime-coverage row. Distinct from the
 * catalog's full `label` (used in profile-detail-view) — a card needs one word.
 * Keyed by runtime id, NOT provider: claude-code vs anthropic-direct share a
 * provider, as do openai-codex vs openai-direct, so a provider-based (or the old
 * `label.includes("Codex")`) heuristic collapses distinct runtimes — notably
 * Ollama, the $0-local differentiator, which used to render as "Claude".
 */
const RUNTIME_SHORT_LABEL: Record<AgentRuntimeId, string> = {
  "claude-code": "Claude",
  "openai-codex-app-server": "Codex",
  "anthropic-direct": "Anthropic",
  "openai-direct": "OpenAI",
  ollama: "Ollama (Local)",
};

export function ProfileCard({ profile, isBuiltin = false, packName = null, onClick }: ProfileCardProps) {

  return (
    <Card
      tabIndex={0}
      role="button"
      tone="agent"
      watermark={getProfileIcon(profile.id)}
      watermarkColor={getDomainColors(profile.domain, isBuiltin).icon}
      className="surface-card cursor-pointer rounded-xl transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <CardTitle className="min-w-0 truncate text-base font-medium">{profile.name}</CardTitle>
          <Badge
            variant={profile.domain === "work" ? "default" : "secondary"}
          >
            {profile.domain}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {profile.description}
        </p>

        {profile.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profile.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {getSupportedRuntimes(profile).map((runtimeId) => (
            <Badge key={runtimeId} variant="secondary" className="text-xs">
              {RUNTIME_SHORT_LABEL[runtimeId] ?? runtimeId}
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {/* Pack provenance outranks every other origin: a pack-installed
              profile is never "Custom"/"Discovered" — it belongs to its pack. */}
          {packName ? (
            <PackPill packName={packName} />
          ) : profile.importMeta ? (
            <span className="flex items-center gap-1.5">
              <Badge variant="outline" className="border-purple-200 text-purple-600 dark:border-purple-800 dark:text-purple-400">
                <Download className="mr-1 h-3 w-3" />
                Imported
              </Badge>
              <span className="text-muted-foreground">
                {profile.importMeta.repoOwner}/{profile.importMeta.repoName}
              </span>
            </span>
          ) : profile.origin === "environment" ? (
            <Badge variant="outline" className="border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400">
              Discovered
            </Badge>
          ) : profile.origin === "ai-assist" ? (
            <Badge variant="outline" className="border-violet-200 text-violet-600 dark:border-violet-800 dark:text-violet-400">
              AI Generated
            </Badge>
          ) : isBuiltin ? (
            <Badge variant="outline" className="border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400">
              Built-in
            </Badge>
          ) : (
            <Badge variant="outline" className="border-gray-200 text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Custom
            </Badge>
          )}
          {profile.version && <span>v{profile.version}</span>}
          {profile.allowedTools && profile.allowedTools.length > 0 && (
            <span>
              {profile.allowedTools.length} tool
              {profile.allowedTools.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
