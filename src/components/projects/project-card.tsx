"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, FolderKanban, FolderOpen, Pencil } from "lucide-react";
import { FlagshipMetadataPill } from "@/components/shared/flagship-card";
import { CardStatusToolbar } from "@/components/shared/card-status-toolbar";

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
        className="surface-card gap-0 overflow-hidden rounded-xl py-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <CardHeader className="flex flex-row items-center justify-between gap-2 p-4 pb-2">
          <CardTitle className="min-w-0 truncate text-base font-medium">{project.name}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          {project.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {project.description}
            </p>
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
        </CardContent>
        <CardStatusToolbar
          status={project.status}
          family="lifecycle"
          meta={
            <>
              <span className="inline-flex items-center gap-1">
                <FolderKanban className="h-3 w-3" aria-hidden="true" />
                {project.taskCount} task{project.taskCount !== 1 ? "s" : ""}
              </span>
              {project.docCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <FileText className="h-3 w-3" aria-hidden="true" />
                  {project.docCount} doc{project.docCount !== 1 ? "s" : ""}
                </span>
              )}
            </>
          }
          actions={
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
          }
        />
      </Card>
    </Link>
  );
}
