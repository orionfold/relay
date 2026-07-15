"use client";

import Link from "next/link";
import type { QuickAccessItem } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FolderKanban,
  CheckSquare,
  GitBranch,
  FileText,
  Clock,
  LayoutDashboard,
  BookOpen,
  Braces,
  ArrowRight,
  ExternalLink,
} from "lucide-react";

const ENTITY_ICONS = {
  project: FolderKanban,
  task: CheckSquare,
  workflow: GitBranch,
  document: FileText,
  schedule: Clock,
};

interface ChatQuickAccessProps {
  items: QuickAccessItem[];
}

export function ChatQuickAccess({ items }: ChatQuickAccessProps) {
  if (items.length === 0) return null;

  const sources = items.filter((item) => item.kind === "knowledge-source");
  const related = items.filter((item) => item.kind !== "knowledge-source");

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {sources.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Sources"
          data-testid="chat-source-citations"
        >
          {sources.map((item) => {
            const Icon = item.sourceKind === "api" ? Braces : BookOpen;
            const content = (
              <>
                <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
                {item.href && (
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
              </>
            );
            if (item.href) {
              return (
                <Badge
                  key={`source:${item.sourceId}:${item.sectionId}`}
                  variant="secondary"
                  className="h-8 max-w-full gap-1.5 px-2.5 text-xs font-normal"
                  asChild
                >
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Source: ${item.label} (opens in a new tab)`}
                  >
                    {content}
                  </a>
                </Badge>
              );
            }
            return (
              <Badge
                key={`source:${item.sourceId}:${item.sectionId}`}
                variant="secondary"
                className="h-8 max-w-full gap-1.5 px-2.5 text-xs font-normal"
                aria-label={`Source: ${item.label}`}
              >
                {content}
              </Badge>
            );
          })}
        </div>
      )}
      {related.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Related Relay actions"
          data-testid="chat-related-actions"
        >
          {related.map((item) => {
            if (item.kind === "knowledge-action") {
              return (
                <Button
                  key={`action:${item.href}`}
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  data-interactive-outline="preserve"
                  asChild
                >
                  <Link href={item.href} aria-label={`${item.label} in Relay`}>
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    {item.label}
                  </Link>
                </Button>
              );
            }

            // Use LayoutDashboard icon for the Tasks kanban link
            const Icon =
              item.href === "/tasks"
                ? LayoutDashboard
                : ENTITY_ICONS[item.entityType] ?? CheckSquare;

            return (
              <Button
                key={`entity:${item.entityType}:${item.entityId}`}
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
                data-interactive-outline="preserve"
                asChild
              >
                <Link href={item.href}>
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
