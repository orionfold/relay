"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FileText, Download, Trash2, Image, FileCode, File, Eye } from "lucide-react";
import { toast } from "sonner";
import type { DocumentRow } from "@/lib/db/schema";

export type TaskDocumentSummary = Pick<
  DocumentRow,
  "id" | "originalName" | "mimeType" | "size" | "version" | "direction"
>;

interface TaskAttachmentsProps {
  documents: TaskDocumentSummary[];
  title?: string;
  onDeleted?: () => void;
  showDelete?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.includes("python") ||
    mimeType.includes("json")
  )
    return FileCode;
  if (mimeType.startsWith("text/")) return FileText;
  return File;
}

export function TaskAttachments({
  documents,
  title = "Attachments",
  onDeleted,
  showDelete = true,
}: TaskAttachmentsProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);

  async function handleDelete(docId: string) {
    setDeleting(docId);
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Document removed");
        onDeleted?.();
      } else {
        toast.error("Failed to remove document");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeleting(null);
    }
  }

  if (documents.length === 0) return null;

  function openOutput(doc: TaskDocumentSummary) {
    if (doc.direction !== "output") return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;
    router.push(`/documents/${doc.id}`);
  }

  return (
    <div className="min-w-0">
      <h4 className="text-sm font-medium mb-2">{title}</h4>
      <div className="min-w-0 space-y-1.5">
        {documents.map((doc) => {
          const Icon = getFileIcon(doc.mimeType);
          return (
            <div
              key={doc.id}
              className={`group flex min-w-0 items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-ring ${
                doc.direction === "output" ? "cursor-pointer hover:bg-accent/50" : ""
              }`}
              onClick={() => openOutput(doc)}
            >
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              {doc.direction === "output" ? (
                <Link
                  href={`/documents/${doc.id}`}
                  className="min-w-0 flex-1 truncate rounded-sm font-medium hover:text-primary focus-visible:outline-none"
                  onClick={(event) => event.stopPropagation()}
                >
                  {doc.originalName}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 truncate">{doc.originalName}</span>
              )}
              {doc.direction === "output" && (
                <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
                  v{doc.version}
                </span>
              )}
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                {formatSize(doc.size)}
              </span>
              <div
                className="relative z-10 flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                onClick={(event) => event.stopPropagation()}
              >
                {doc.direction === "output" && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    asChild
                  >
                    <Link
                      href={`/documents/${doc.id}`}
                      aria-label={`View ${doc.originalName}`}
                      title="View document"
                    >
                      <Eye className="h-3 w-3" />
                    </Link>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  asChild
                >
                  <a
                    href={`/api/documents/${doc.id}/file`}
                    download
                    aria-label={`Download ${doc.originalName}`}
                    title="Download document"
                  >
                    <Download className="h-3 w-3" />
                  </a>
                </Button>
                {showDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDelete(doc.id)}
                    disabled={deleting === doc.id}
                    aria-label={`Delete ${doc.originalName}`}
                    title="Delete document"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
