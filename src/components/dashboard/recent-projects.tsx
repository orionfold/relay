"use client";

import Link from "next/link";
import { FolderPlus } from "lucide-react";
import { DonutRing } from "@/components/charts/donut-ring";

export interface RecentProject {
  id: string;
  name: string;
  totalTasks: number;
  completedTasks: number;
}

interface RecentProjectsProps {
  projects: RecentProject[];
}

export function RecentProjects({ projects }: RecentProjectsProps) {
  if (projects.length === 0) {
    return (
      <div className="py-4 text-center">
        <FolderPlus className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No active projects yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {projects.map((project) => {
          const pct = project.totalTasks > 0
            ? Math.round((project.completedTasks / project.totalTasks) * 100)
            : 0;
          return (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              data-interactive-surface=""
              data-interactive-outline="preserve"
              className="interactive-list-item -mx-1 flex min-w-0 items-center gap-3 rounded-md px-1 py-2"
            >
              <DonutRing
                value={pct}
                size={34}
                strokeWidth={3}
                color="var(--chart-1)"
                label={`${project.name}: ${pct}% complete`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{project.name}</p>
                <p className="text-xs text-muted-foreground">
                  {project.completedTasks}/{project.totalTasks} tasks · {pct}%
                </p>
              </div>
            </Link>
          );
      })}
    </div>
  );
}
