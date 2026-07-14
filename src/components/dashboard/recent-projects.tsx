"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FolderPlus } from "lucide-react";
import { SectionHeading } from "@/components/shared/section-heading";
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
      <div>
        <SectionHeading>Recent Projects</SectionHeading>
        <Card className="surface-card p-6 text-center">
          <FolderPlus className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground mb-3">No active projects yet.</p>
          <Link href="/projects">
            <Button variant="outline" size="sm">Create your first project</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <SectionHeading className="mb-0">Recent Projects</SectionHeading>
        <Link href="/projects" className="text-xs text-muted-foreground underline hover:text-foreground">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => {
          const pct = project.totalTasks > 0
            ? Math.round((project.completedTasks / project.totalTasks) * 100)
            : 0;
          return (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="surface-card transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <DonutRing
                      value={pct}
                      size={28}
                      strokeWidth={3}
                      color="var(--chart-1)"
                      label={`${project.name}: ${pct}% complete`}
                    />
                    <CardTitle className="min-w-0 truncate text-base font-medium">{project.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <Progress value={pct} className="h-1.5 mb-2" />
                  <p className="text-xs text-muted-foreground">
                    {project.completedTasks}/{project.totalTasks} tasks completed
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
