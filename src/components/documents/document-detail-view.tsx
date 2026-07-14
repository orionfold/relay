"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { DocumentChipBar } from "./document-chip-bar";
import { DocumentContentRenderer } from "./document-content-renderer";
import { formatSize, formatRelativeTime } from "./utils";
import type { DocumentWithRelations } from "./types";

/** Serialized version of DocumentWithRelations (Date fields become strings from server) */
type SerializedDocument = Omit<DocumentWithRelations, "createdAt" | "updatedAt"> & {
  createdAt: string | Date;
  updatedAt: string | Date;
};

interface DocumentDetailViewProps {
  documentId: string;
  initialDocument?: SerializedDocument;
}

export function DocumentDetailView({ documentId, initialDocument }: DocumentDetailViewProps) {
  const router = useRouter();
  const [doc, setDoc] = useState<DocumentWithRelations | null>(
    initialDocument ? (initialDocument as unknown as DocumentWithRelations) : null
  );
  const [loaded, setLoaded] = useState(!!initialDocument);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [versions, setVersions] = useState<Array<{
    id: string;
    version: number;
    size: number;
    status: string;
    createdAt: string;
    workflowRunNumber: number | null;
  }>>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/documents/${documentId}`);
      if (res.ok) {
        setDoc(await res.json());
      }
    } catch {
      // silent
    }
    setLoaded(true);
  }, [documentId]);

  useEffect(() => {
    // If server provided initial data, only fetch supplementary data (projects list)
    // and enrich with relation names in the background
    if (!initialDocument) {
      refresh();
    } else {
      // Background refresh to fill in taskTitle/projectName relation fields
      refresh();
    }
    fetch("/api/projects")
      .then((r) => r.ok ? r.json() : [])
      .then(setProjects)
      .catch(() => {});
  }, [refresh, initialDocument]);

  // Fetch version history for output documents
  useEffect(() => {
    if (doc?.direction === "output") {
      fetch(`/api/documents/${documentId}/versions`)
        .then((r) => r.ok ? r.json() : [])
        .then(setVersions)
        .catch(() => {});
    }
  }, [doc?.direction, documentId]);

  async function handleDelete() {
    if (!doc) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Document deleted");
        router.push("/documents");
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
      }
    } catch {
      toast.error("Failed to unlink");
    }
  }

  if (!loaded) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  if (!doc) {
    return <p className="text-muted-foreground">Document not found.</p>;
  }

  return (
    <div className="space-y-4" aria-live="polite">
      <DocumentChipBar
        doc={doc}
        onDelete={handleDelete}
        onUnlinkTask={handleUnlinkTask}
        onLinkProject={handleLinkProject}
        projects={projects}
        deleting={deleting}
        linking={linking}
      />
      {/* Version History */}
      {doc.direction === "output" && versions.length > 1 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Version History</h3>
          <div className="surface-control rounded-lg divide-y divide-border">
            {versions.map((v) => (
              <button
                key={v.id}
                data-interactive-surface=""
                data-interactive-outline="preserve"
                className={`interactive-list-item w-full flex items-center gap-3 px-3 py-2 text-xs ${v.id === doc.id ? "bg-accent/30" : ""}`}
                onClick={() => v.id !== doc.id && router.push(`/documents/${v.id}`)}
                disabled={v.id === doc.id}
              >
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-medium">v{v.version}</span>
                {v.id === doc.id && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">current</Badge>
                )}
                <span className="text-muted-foreground">{formatSize(v.size)}</span>
                {v.workflowRunNumber != null && v.workflowRunNumber > 0 && (
                  <span className="text-muted-foreground">Run #{v.workflowRunNumber}</span>
                )}
                <span className="text-muted-foreground ml-auto">
                  {formatRelativeTime(typeof v.createdAt === "number" ? v.createdAt : new Date(v.createdAt).getTime())}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="prose-reader-surface">
        <DocumentContentRenderer doc={doc} />
      </div>
    </div>
  );
}
