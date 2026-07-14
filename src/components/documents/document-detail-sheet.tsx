"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  Trash2,
  Unlink,
  ArrowUpRight,
  ArrowDownLeft,
  Link2,
  FolderKanban,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { DocumentContentRenderer } from "./document-content-renderer";
import {
  getFileIcon,
  formatSize,
  getStatusColor,
  getStatusDotColor,
  formatRelativeTime,
} from "./utils";
import type { DocumentWithRelations } from "./types";

interface DocumentDetailSheetProps {
  documentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; name: string }[];
  onDeleted?: () => void;
  onUpdated?: () => void;
}

export function DocumentDetailSheet({
  documentId,
  open,
  onOpenChange,
  projects,
  onDeleted,
  onUpdated,
}: DocumentDetailSheetProps) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentWithRelations | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linking, setLinking] = useState(false);

  const refresh = useCallback(async () => {
    if (!documentId) return;
    try {
      const res = await fetch(`/api/documents/${documentId}`);
      if (res.ok) setDoc(await res.json());
    } catch {
      // silent
    }
    setLoaded(true);
  }, [documentId]);

  useEffect(() => {
    if (!open || !documentId) {
      setDoc(null);
      setLoaded(false);
      return;
    }
    refresh();
  }, [open, documentId, refresh]);

  async function handleDelete() {
    if (!doc) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Document deleted");
        onOpenChange(false);
        onDeleted?.();
      } else {
        toast.error("Failed to delete document");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeleting(false);
    }
  }

  async function handleLinkProject(projectId: string) {
    if (!doc) return;
    setLinking(true);
    try {
      const value = projectId === "none" ? null : projectId;
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: value }),
      });
      if (res.ok) {
        toast.success(value ? "Linked to project" : "Unlinked from project");
        refresh();
        onUpdated?.();
      }
    } catch {
      toast.error("Failed to update link");
    } finally {
      setLinking(false);
    }
  }

  async function handleUnlinkTask() {
    if (!doc) return;
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: null }),
      });
      if (res.ok) {
        toast.success("Unlinked from task");
        refresh();
        onUpdated?.();
      }
    } catch {
      toast.error("Failed to unlink");
    }
  }

  const Icon = doc ? getFileIcon(doc.mimeType) : null;
  const DirectionIcon = doc?.direction === "output" ? ArrowUpRight : ArrowDownLeft;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 text-muted-foreground" />}
            <SheetTitle className="truncate">
              {doc?.originalName ?? "Document"}
            </SheetTitle>
          </div>
          <SheetDescription>
            {doc ? `${doc.mimeType} · ${formatSize(doc.size)}` : "Loading..."}
          </SheetDescription>
        </SheetHeader>

        {/* Body — px-6 pb-6 per project convention (SheetContent has NO body padding) */}
        <div className="px-6 pb-6 space-y-5 overflow-y-auto">
          {!loaded ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : !doc ? (
            <p className="text-muted-foreground">Document not found.</p>
          ) : (
            <>
              {/* Actions */}
              <div className="flex items-center gap-2">
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
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
              </div>

              {/* Metadata chips */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`text-xs ${getStatusColor(doc.status)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${getStatusDotColor(doc.status)}`} />
                  {doc.status}
                </Badge>
                <Badge variant="outline" className="text-xs font-normal">
                  <DirectionIcon className="h-3 w-3 mr-1" />
                  {doc.direction}
                </Badge>
                {doc.direction === "output" && (
                  <Badge variant="outline" className="text-xs font-normal">
                    v{doc.version}
                  </Badge>
                )}
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

              {/* Links — task + project */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Links</p>
                <div className="flex flex-wrap items-center gap-2">
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
                          handleUnlinkTask();
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

                  <div className="flex items-center gap-1.5">
                    <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                    <Select
                      value={doc.projectId ?? "none"}
                      onValueChange={handleLinkProject}
                      disabled={linking}
                    >
                      <SelectTrigger className="h-7 w-[180px] text-xs border-dashed">
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

              {/* Content preview */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Content</p>
                <div className="prose-reader-surface max-h-96 overflow-y-auto rounded-lg border p-3">
                  <DocumentContentRenderer doc={doc} />
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
