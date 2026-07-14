"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { LightMarkdown } from "@/components/shared/light-markdown";
import type { RuntimeTaskSummary } from "@/lib/apps/view-kits/types";

interface MonthlyCloseSummaryProps {
  task: RuntimeTaskSummary | null;
}

export function MonthlyCloseSummary({ task }: MonthlyCloseSummaryProps) {
  const [expanded, setExpanded] = useState(false);

  if (!task) {
    return (
      <div className="text-sm text-muted-foreground p-4 border border-dashed rounded-lg">
        No monthly-close blueprint configured for this app
      </div>
    );
  }

  return (
    <div className="surface-card rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((b) => !b)}
        data-interactive-surface=""
        data-interactive-outline="preserve"
        className="interactive-list-item w-full flex items-center gap-2 p-3 text-left rounded-lg"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-medium text-sm">{task.title}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(task.createdAt).toLocaleDateString()}
        </span>
      </button>
      {expanded && task.result && (
        <div className="px-4 pb-4">
          <LightMarkdown content={task.result} textSize="sm" />
        </div>
      )}
    </div>
  );
}
