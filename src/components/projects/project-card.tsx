"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, FolderKanban, FolderOpen, Pencil } from "lucide-react";
import { FlagshipMetadataPill } from "@/components/shared/flagship-card";
import { projectStatusVariant } from "@/lib/constants/status-colors";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    workingDirectory: string | null;
    status: string;
    taskCount: number;
    docCount: number;
  };
  onEdit: (id: string, trigger: HTMLElement | null) => void;
}

export function ProjectCard({ project, onEdit }: ProjectCardProps) {
  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card
        tabIndex={0}
        watermark={FolderKanban}
        interactive
        className="surface-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="min-w-0 truncate text-base font-medium">{project.name}</CardTitle>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(project.id, e.currentTarget);
              }}
              aria-label={`Edit ${project.name}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Badge variant={projectStatusVariant[project.status] ?? "secondary"}>
              {project.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {project.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {project.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <FlagshipMetadataPill icon={FolderKanban} tone="primary">
              {project.taskCount} task{project.taskCount !== 1 ? "s" : ""}
            </FlagshipMetadataPill>
            {project.docCount > 0 && (
              <FlagshipMetadataPill icon={FileText} tone="success">
                {project.docCount} doc{project.docCount !== 1 ? "s" : ""}
              </FlagshipMetadataPill>
            )}
            {project.workingDirectory && (
              <FlagshipMetadataPill
                icon={FolderOpen}
                tone="muted"
                className="max-w-full"
                title={project.workingDirectory}
              >
                {project.workingDirectory}
              </FlagshipMetadataPill>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
