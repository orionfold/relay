"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import { DonutRing } from "@/components/charts/donut-ring";

interface Milestone {
  id: string;
  label: string;
  completed: boolean;
}

interface ProgressData {
  milestones: Milestone[];
  completedCount: number;
  totalCount: number;
}

/**
 * Activation checklist showing 6 milestones for new users.
 * Disappears when all milestones are complete.
 */
export function ActivationChecklist() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/onboarding/progress")
      .then((response) => {
        if (!response.ok) throw new Error("Activation progress could not be loaded");
        return response.json();
      })
      .then((progress) => setData(progress))
      .catch((loadError) => {
        console.error("[dashboard] activation progress loader failed:", loadError);
        setError(true);
      });
  }, []);

  if (error) {
    return (
      <div className="surface-card-muted flex items-start gap-2 rounded-md border p-3 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" />
        <p>Activation progress could not be loaded.</p>
      </div>
    );
  }

  if (!data) {
    return <div className="h-16 animate-pulse rounded-md bg-muted" aria-label="Loading activation progress" />;
  }

  if (data.completedCount >= data.totalCount) {
    return (
      <div className="surface-card-muted flex items-center gap-2 rounded-md border p-3 text-sm">
        <CheckCircle2 className="h-4 w-4 text-status-completed" />
        <span>Activation complete.</span>
      </div>
    );
  }

  const completion = data.totalCount > 0
    ? Math.round((data.completedCount / data.totalCount) * 100)
    : 0;

  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
      <DonutRing
        value={completion}
        size={44}
        strokeWidth={4}
        label={`${data.completedCount} of ${data.totalCount} activation milestones complete`}
      />
      <ul className="space-y-1.5">
        {data.milestones.map((milestone) => (
          <li key={milestone.id} className="flex items-center gap-2">
            {milestone.completed ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-status-completed" />
            ) : (
              <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span
              className={`text-xs ${
                milestone.completed ? "text-muted-foreground line-through" : ""
              }`}
            >
              {milestone.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
