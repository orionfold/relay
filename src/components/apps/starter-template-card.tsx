"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  TrendingUp,
  Library,
  Mail,
  Sparkles,
  Bot,
  Workflow,
  Table2,
  Clock,
  Wallet,
  CheckCircle,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { StarterTemplate } from "@/lib/apps/starters";

const ICONS: Record<string, LucideIcon> = {
  "trending-up": TrendingUp,
  "library": Library,
  "mail": Mail,
  "sparkles": Sparkles,
  "wallet": Wallet,
  "check-circle": CheckCircle,
};

interface Props {
  starter: StarterTemplate;
  className?: string;
  /**
   * Optional click override. When provided, replaces the default
   * sessionStorage-prefill + router.push("/chat") behavior. Use this when
   * rendering the card on the chat page itself, where router navigation is a
   * no-op and sessionStorage prefill never gets consumed — the caller should
   * seed the chat input directly via its own suggestion-click handler.
   */
  onClick?: (starter: StarterTemplate) => void;
}

/**
 * StarterTemplateCard — repo-shipped starter compositions (wealth-tracker-
 * style, research-digest, customer-follow-up). Clicking seeds the chat
 * composer via existing `chat:prefill:pending` sessionStorage channel,
 * then routes to /chat. Zero chat-input changes required.
 *
 * Pass `onClick` to override the default route-and-prefill behavior — the
 * chat hero uses this so clicking a card directly fills the visible textarea
 * instead of trying to navigate to a route the user is already on.
 */
export function StarterTemplateCard({ starter, className, onClick }: Props) {
  const router = useRouter();
  const Icon = ICONS[starter.icon] ?? Sparkles;

  const onPick = useCallback(() => {
    if (onClick) {
      onClick(starter);
      return;
    }
    try {
      window.sessionStorage.setItem("chat:prefill:pending", starter.starterPrompt);
    } catch {
      // sessionStorage unavailable — still navigate; user pastes manually.
    }
    router.push("/chat");
  }, [starter, router, onClick]);

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onPick();
      }
    },
    [onPick]
  );

  return (
    <Card
      role="button"
      tabIndex={0}
      tone="template"
      watermark={Icon}
      interactive
      onClick={onPick}
      onKeyDown={onKey}
      aria-label={`Start ${starter.name} in chat`}
      data-starter-id={starter.id}
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      <CardContent className="relative p-4 space-y-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium leading-tight">{starter.name}</p>
          {starter.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {starter.description}
            </p>
          )}
        </div>
        <PreviewRow preview={starter.preview} />
      </CardContent>
    </Card>
  );
}

function PreviewRow({ preview }: { preview: StarterTemplate["preview"] }) {
  const pills: { icon: React.ComponentType<{ className?: string }>; label: string }[] = [];
  if (preview.profiles > 0) pills.push({ icon: Bot, label: preview.profiles === 1 ? "Agent" : `${preview.profiles} agents` });
  if (preview.blueprints > 0) pills.push({ icon: Workflow, label: preview.blueprints === 1 ? "Blueprint" : `${preview.blueprints} blueprints` });
  if (preview.tables > 0) pills.push({ icon: Table2, label: preview.tables === 1 ? "1 table" : `${preview.tables} tables` });
  if (preview.schedules > 0) pills.push({ icon: Clock, label: preview.schedules === 1 ? "Schedule" : `${preview.schedules} schedules` });

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
      {pills.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          <p.icon className="h-3 w-3" aria-hidden="true" />
          {p.label}
        </span>
      ))}
    </div>
  );
}
