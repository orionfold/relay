"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  Trash2,
  Unlink,
  ArrowUpRight,
  ArrowDownLeft,
  Link2,
  FolderKanban,
  GitBranch,
} from "lucide-react";
import {
  getFileIcon,
  formatSize,
  getStatusColor,
  getStatusDotColor,
  formatRelativeTime,
} from "./utils";
import type { DocumentWithRelations } from "./types";

interface DocumentChipBarProps {
  doc: DocumentWithRelations;
  onDelete: () => void;
  onUnlinkTask: () => void;
  onLinkProject: (projectId: string) => void;
  projects: { id: string; name: string }[];
  deleting: boolean;
  linking: boolean;
}

export function DocumentChipBar({
  doc,
  onDelete,
  onUnlinkTask,
  onLinkProject,
  projects,
  deleting,
  linking,
}: DocumentChipBarProps) {
  const router = useRouter();
  const Icon = getFileIcon(doc.mimeType);
  const DirectionIcon = doc.direction === "output" ? ArrowUpRight : ArrowDownLeft;

  return (
    <div className="surface-control rounded-lg p-4 space-y-3">
      {/* Row 1: Name + Actions */}
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
        <h1 className="text-lg font-semibold truncate flex-1 min-w-0">
          {doc.originalName}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/documents/${doc.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download
            </a>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            disabled={deleting}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      </div>

      {/* Row 2: Metadata chips */}
      <div className="flex flex-wrap items-center gap-2">
        {/* MIME type */}
        <Badge variant="outline" className="text-xs font-normal">
          {doc.mimeType}
        </Badge>

        {/* File size */}
        <Badge variant="outline" className="text-xs font-normal">
          {formatSize(doc.size)}
        </Badge>

        {/* Status */}
        <Badge variant="outline" className={`text-xs ${getStatusColor(doc.status)}`}>
          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${getStatusDotColor(doc.status)}`} />
          {doc.status}
        </Badge>

        {/* Direction */}
        <Badge variant="outline" className="text-xs font-normal">
          <DirectionIcon className="h-3 w-3 mr-1" />
          {doc.direction}
        </Badge>

        {/* Version (output only) */}
        {doc.direction === "output" && (
          <Badge variant="outline" className="text-xs font-normal">
            v{doc.version}
          </Badge>
        )}

        {/* Created date */}
        <Badge
          variant="outline"
          className="text-xs font-normal"
          title={new Date(doc.createdAt).toLocaleString()}
        >
          {formatRelativeTime(
            typeof doc.createdAt === "number"
              ? doc.createdAt
              : new Date(doc.createdAt).getTime()
          )}
        </Badge>
      </div>

      {/* Row 3: Links — workflow, task, project */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Workflow source */}
        {doc.workflowId && doc.workflowName && (
          <Badge
            variant="secondary"
            className="text-xs hover:bg-accent gap-1"
            onClick={() => router.push(`/workflows/${doc.workflowId}`)}
          >
            <GitBranch className="h-3 w-3" />
            {doc.workflowName}
            {doc.workflowRunNumber != null && doc.workflowRunNumber > 0 && (
              <span className="text-muted-foreground ml-1">Run #{doc.workflowRunNumber}</span>
            )}
          </Badge>
        )}

        {/* Task link */}
        {doc.taskTitle ? (
          <Badge
            variant="secondary"
            className="text-xs hover:bg-accent gap-1"
            onClick={() => doc.taskId && router.push(`/tasks/${doc.taskId}`)}
          >
            <Link2 className="h-3 w-3" />
            {doc.taskTitle}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnlinkTask();
              }}
              className="ml-1 hover:text-destructive"
              aria-label="Unlink from task"
            >
              <Unlink className="h-3 w-3" />
            </button>
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
            <Link2 className="h-3 w-3 mr-1" />
            No task
          </Badge>
        )}

        {/* Project selector */}
        <div className="flex items-center gap-1.5">
          <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
          <Select
            value={doc.projectId ?? "none"}
            onValueChange={onLinkProject}
            disabled={linking}
          >
            <SelectTrigger className="h-7 w-[220px] text-xs border-dashed">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No project</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
