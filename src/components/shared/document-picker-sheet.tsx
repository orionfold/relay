"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Search, Loader2, ChevronRight, X } from "lucide-react";
import { getFileIcon, formatSize, getStatusDotColor } from "@/components/documents/utils";
import { cn } from "@/lib/utils";

export interface PickerDocument {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  direction: string;
  status: string;
  category: string | null;
  taskTitle: string | null;
  projectName: string | null;
  /** Source workflow name (if document was produced by a workflow task) */
  sourceWorkflow?: string;
  /** Parent workflow name (joined from tasks → workflows) */
  workflowName?: string | null;
  createdAt: number;
}

/** Lightweight metadata for a selected document (survives project switches) */
export interface PickerSelectedDoc {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  projectName?: string | null;
}

interface DocumentPickerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Scope documents to a project. Null = show all ready documents. */
  projectId: string | null;
  /** Currently selected document IDs (to pre-check) */
  selectedIds: Set<string>;
  /** Called when user confirms selection. Second arg provides metadata for display (avoids re-fetch). */
  onConfirm: (selectedIds: string[], selectedMeta: PickerSelectedDoc[]) => void;
  /** Optional: scope to a step ID label */
  stepLabel?: string;
  /** Grouping mode: "workflow" groups by source workflow, "project" by project name, "source" by direction */
  groupBy?: "workflow" | "project" | "source";
  /** Override the sheet title */
  title?: string;
  /** Enable cross-project browsing with a project dropdown. Default: false */
  allowCrossProject?: boolean;
  /** Metadata for pre-selected docs (enables tray display across project switches) */
  selectedDocumentMeta?: Array<{ id: string; originalName: string; mimeType: string; size?: number; projectName?: string | null }>;
}

export function DocumentPickerSheet({
  open,
  onOpenChange,
  projectId,
  selectedIds,
  onConfirm,
  stepLabel,
  groupBy = "source",
  title,
  allowCrossProject = false,
  selectedDocumentMeta,
}: DocumentPickerSheetProps) {
  const [documents, setDocuments] = useState<PickerDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());

  // Cross-project state
  const [activeProjectId, setActiveProjectId] = useState<string | null>(projectId);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedDocMeta, setSelectedDocMeta] = useState<Map<string, PickerSelectedDoc>>(new Map());
  const [trayExpanded, setTrayExpanded] = useState(true);
  const initializedRef = useRef(false);

  // Initialize state when sheet opens
  useEffect(() => {
    if (open) {
      setActiveProjectId(projectId);
      setLocalSelected(new Set(selectedIds));
      setSearch("");
      setTrayExpanded(true);

      // Seed selectedDocMeta from the prop
      if (selectedDocumentMeta && selectedDocumentMeta.length > 0) {
        const metaMap = new Map<string, PickerSelectedDoc>();
        for (const doc of selectedDocumentMeta) {
          if (selectedIds.has(doc.id)) {
            metaMap.set(doc.id, {
              id: doc.id,
              originalName: doc.originalName,
              mimeType: doc.mimeType,
              size: doc.size ?? 0,
              projectName: doc.projectName,
            });
          }
        }
        setSelectedDocMeta(metaMap);
      } else {
        setSelectedDocMeta(new Map());
      }

      // Fetch projects list for the dropdown
      if (allowCrossProject) {
        fetchProjects();
      }
      initializedRef.current = true;
    } else {
      initializedRef.current = false;
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch documents when activeProjectId changes (and sheet is open)
  useEffect(() => {
    if (open && initializedRef.current) {
      fetchDocuments(activeProjectId);
    }
  }, [activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial document fetch when sheet opens
  useEffect(() => {
    if (open) {
      fetchDocuments(projectId);
    }
  }, [open, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchDocuments(forProjectId: string | null) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: "ready" });
      if (forProjectId) params.set("projectId", forProjectId);
      const res = await fetch(`/api/documents?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch {
      // Silently fail — empty list shown
    } finally {
      setLoading(false);
    }
  }

  async function fetchProjects() {
    setProjectsLoading(true);
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        setProjects(data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })));
      }
    } catch {
      // Silently fail — no project dropdown options
    } finally {
      setProjectsLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return documents;
    const q = search.toLowerCase();
    return documents.filter(
      (doc) =>
        doc.originalName.toLowerCase().includes(q) ||
        doc.category?.toLowerCase().includes(q) ||
        doc.taskTitle?.toLowerCase().includes(q)
    );
  }, [documents, search]);

  // Group documents based on the groupBy mode
  const grouped = useMemo(() => {
    const groups: Record<string, PickerDocument[]> = {};
    for (const doc of filtered) {
      let key: string;
      switch (groupBy) {
        case "workflow":
          key =
            doc.direction === "output"
              ? doc.workflowName
                ? `From: ${doc.workflowName}`
                : doc.taskTitle
                  ? `From: ${doc.taskTitle}`
                  : "Agent Generated"
              : "Uploaded";
          break;
        case "project":
          key = doc.projectName ?? "No Project";
          break;
        case "source":
        default:
          key =
            doc.direction === "output"
              ? doc.taskTitle
                ? "Task Output"
                : "Agent Generated"
              : "Uploaded";
          break;
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(doc);
    }
    return groups;
  }, [filtered, groupBy]);

  // Compute cross-project tray items
  const currentDocIds = useMemo(() => new Set(documents.map((d) => d.id)), [documents]);
  const crossProjectSelected = useMemo(
    () => [...selectedDocMeta.values()].filter((d) => localSelected.has(d.id) && !currentDocIds.has(d.id)),
    [selectedDocMeta, localSelected, currentDocIds]
  );
  const showTray = allowCrossProject && crossProjectSelected.length > 0;

  function toggleDocument(id: string) {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        setSelectedDocMeta((m) => {
          const n = new Map(m);
          n.delete(id);
          return n;
        });
      } else {
        next.add(id);
        const doc = documents.find((d) => d.id === id);
        if (doc) {
          setSelectedDocMeta((m) =>
            new Map(m).set(id, {
              id: doc.id,
              originalName: doc.originalName,
              mimeType: doc.mimeType,
              size: doc.size,
              projectName: doc.projectName,
            })
          );
        }
      }
      return next;
    });
  }

  function handleConfirm() {
    const ids = [...localSelected];
    // Build metadata array from cached meta + current documents
    const meta: PickerSelectedDoc[] = ids.map((id) => {
      const cached = selectedDocMeta.get(id);
      if (cached) return cached;
      const doc = documents.find((d) => d.id === id);
      if (doc) return { id: doc.id, originalName: doc.originalName, mimeType: doc.mimeType, size: doc.size, projectName: doc.projectName };
      return { id, originalName: "Unknown", mimeType: "application/octet-stream", size: 0 };
    });
    onConfirm(ids, meta);
    onOpenChange(false);
  }

  function handleProjectChange(value: string) {
    setActiveProjectId(value === "__all__" ? null : value);
  }

  const sheetTitle = title
    ? title
    : stepLabel
      ? `Select Documents for "${stepLabel}"`
      : "Select Input Documents";

  const effectiveProjectId = allowCrossProject ? activeProjectId : projectId;
  const emptyMessage = search
    ? "No documents match your search."
    : effectiveProjectId
      ? "No documents available in this project."
      : "No documents available. Upload files in the Documents view.";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader className="p-4">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {sheetTitle}
          </SheetTitle>
          <SheetDescription>
            Choose documents to provide as context.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-6 flex flex-col gap-4 flex-1 min-h-0">
          {/* Project selector (cross-project mode only) */}
          {allowCrossProject && (
            <Select
              value={activeProjectId ?? "__all__"}
              onValueChange={handleProjectChange}
              disabled={projectsLoading}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.id === projectId ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
/>
          </div>

          {/* Cross-project selected tray */}
          {showTray && (
            <div className="border rounded-lg p-2 space-y-1">
              <button
                type="button"
                onClick={() => setTrayExpanded((v) => !v)}
                className="w-full text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 transition-transform",
                    trayExpanded && "rotate-90"
                  )}
                />
                {crossProjectSelected.length} selected from other projects
              </button>
              {trayExpanded && (
                <div className="max-h-[120px] overflow-y-auto space-y-1">
                  {crossProjectSelected.map((doc) => {
                    const Icon = getFileIcon(doc.mimeType);
                    return (
                      <div
                        key={doc.id}
                        className="flex items-center gap-2 text-xs py-1.5 px-1"
                      >
                        <Icon className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        <span className="truncate flex-1">
                          {doc.originalName}
                        </span>
                        {doc.projectName && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 flex-shrink-0"
                          >
                            {doc.projectName}
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleDocument(doc.id)}
                          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={`Remove ${doc.originalName}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Document list */}
          <ScrollArea className="flex-1 min-h-0 -mx-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : Object.keys(grouped).length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-12">
                {emptyMessage}
              </div>
            ) : (
              <div className="space-y-4 px-2">
                {Object.entries(grouped).map(([source, docs]) => (
                  <div key={source}>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      {source}
                    </p>
                    <div className="space-y-1">
                      {docs.map((doc) => {
                        const Icon = getFileIcon(doc.mimeType);
                        const isChecked = localSelected.has(doc.id);
                        return (
                          <div
                            key={doc.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleDocument(doc.id)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDocument(doc.id); } }}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                              isChecked
                                ? "bg-accent/50 border border-accent"
                                : "hover:bg-muted/50 border border-transparent"
                            }`}
                          >
                            <Checkbox
                              checked={isChecked}
                              aria-label={`Select ${doc.originalName}`}
                            />
                            <Icon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {doc.originalName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatSize(doc.size)}
                                {doc.category && ` · ${doc.category}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div
                                className={`h-2 w-2 rounded-full ${getStatusDotColor(doc.status)}`}
                              />
                              {doc.direction === "output" && (
                                <Badge variant="outline" className="text-[10px] px-1.5">
                                  output
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-sm text-muted-foreground">
              {localSelected.size} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirm}>
                Confirm
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
