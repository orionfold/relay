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

  return (
    <div className="border-t border-border mt-3 pt-3 flex flex-wrap gap-2">
      {items.map((item) => {
        if (item.kind === "knowledge-source") {
          const Icon = item.sourceKind === "api" ? Braces : BookOpen;
          return (
            <Badge
              key={`source:${item.sourceId}:${item.sectionId}`}
              variant="secondary"
              className="h-8 max-w-full gap-1.5 px-2.5 text-xs font-normal"
              aria-label={`Source: ${item.label}`}
            >
              <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.label}</span>
            </Badge>
          );
        }

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
  );
}
