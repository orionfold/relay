"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen, AlignLeft, FolderCode, Trash2, Paperclip, Plus, X, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DocumentPickerSheet } from "@/components/shared/document-picker-sheet";
import { getFileIcon, formatSize } from "@/components/documents/utils";

interface Project {
  id: string;
  name: string;
  description: string | null;
  workingDirectory: string | null;
  customerId: string | null;
  status: string;
}

interface CustomerOption {
  id: string;
  name: string;
}

// Radix Select cannot use an empty-string value; this sentinel maps to null.
const NO_CUSTOMER = "__none__";

interface ProjectFormSheetProps {
  mode: "create" | "edit";
  project?: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ProjectFormSheet({
  mode,
  project,
  open,
  onOpenChange,
  onSaved,
}: ProjectFormSheetProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [status, setStatus] = useState("active");
  const [customerId, setCustomerId] = useState<string>(NO_CUSTOMER);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [selectedDocs, setSelectedDocs] = useState<Array<{ id: string; originalName: string; mimeType: string; size: number }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Load selectable customers whenever the sheet opens
  useEffect(() => {
    if (!open) return;
    fetch("/api/customers")
      .then((r) => r.json())
      .then((rows: Array<{ id: string; name: string }>) => {
        setCustomers(rows.map((c) => ({ id: c.id, name: c.name })));
      })
      .catch(() => setCustomers([]));
  }, [open]);

  // Pre-fill form in edit mode
  useEffect(() => {
    if (mode === "edit" && project) {
      setName(project.name);
      setDescription(project.description ?? "");
      setWorkingDirectory(project.workingDirectory ?? "");
      setStatus(project.status);
      setCustomerId(project.customerId ?? NO_CUSTOMER);
      // Load existing default documents
      fetch(`/api/projects/${project.id}/documents`)
        .then((r) => r.json())
        .then((docs: Array<Record<string, unknown>>) => {
          const ids = new Set(docs.map((d) => d.id as string));
          setSelectedDocIds(ids);
          setSelectedDocs(
            docs.map((d) => ({
              id: d.id as string,
              originalName: d.originalName as string,
              mimeType: d.mimeType as string,
              size: d.size as number,
            }))
          );
        })
        .catch(() => {
          setSelectedDocIds(new Set());
          setSelectedDocs([]);
        });
    } else if (mode === "create") {
      setName("");
      setDescription("");
      setWorkingDirectory("");
      setStatus("active");
      setCustomerId(NO_CUSTOMER);
      setSelectedDocIds(new Set());
      setSelectedDocs([]);
    }
    setError(null);
  }, [mode, project, open]);

  const handleDocPickerConfirm = useCallback(
    (ids: string[], meta: Array<{ id: string; originalName: string; mimeType: string; size: number }>) => {
      setSelectedDocIds(new Set(ids));
      setSelectedDocs(meta);
    },
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);

    try {
      if (mode === "create") {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            workingDirectory: workingDirectory.trim() || undefined,
            customerId: customerId === NO_CUSTOMER ? null : customerId,
            documentIds: selectedDocIds.size > 0 ? [...selectedDocIds] : undefined,
          }),
        });
        if (res.ok) {
          toast.success("Project created");
          onOpenChange(false);
          onSaved();
        } else {
          const data = await res.json().catch(() => null);
          setError(data?.error ?? `Failed to create project (${res.status})`);
        }
      } else if (project) {
        const res = await fetch(`/api/projects/${project.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || undefined,
            workingDirectory: workingDirectory.trim() || undefined,
            status,
            customerId: customerId === NO_CUSTOMER ? null : customerId,
            documentIds: [...selectedDocIds],
          }),
        });
        if (res.ok) {
          toast.success("Project saved");
          onOpenChange(false);
          onSaved();
        } else {
          toast.error("Failed to save project");
        }
      }
    } catch (err) {
      setError("Network error. Could not reach server");
      console.error("Project save failed:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!project) return;
    setConfirmDelete(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Failed to delete project");
        return;
      }
      toast.success("Project deleted");
      onOpenChange(false);
      await onSaved();
    } finally {
      setLoading(false);
    }
  }

  const isEdit = mode === "edit";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{isEdit ? "Edit Project" : "Create Project"}</SheetTitle>
            <SheetDescription>
              {isEdit
                ? "Update the project name, status, and execution context without changing its associated tasks."
                : "Create a project workspace with optional context so tasks stay grouped and runnable in the right directory."}
            </SheetDescription>
          </SheetHeader>

          {/* Body — px-6 pb-6 per project convention (SheetContent has NO body padding) */}
          <div className="px-6 pb-6 overflow-y-auto">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="proj-name" className="flex items-center gap-1.5">
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  Name
                </Label>
                <Input
                  id="proj-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Project name"
                  required
                />
                <p className="text-xs text-muted-foreground">Short, memorable name</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="proj-desc" className="flex items-center gap-1.5">
                  <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                  Description
                </Label>
                <Textarea
                  id="proj-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Optional context for agents</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="proj-dir" className="flex items-center gap-1.5">
                  <FolderCode className="h-3.5 w-3.5 text-muted-foreground" />
                  Working Directory
                </Label>
                <Input
                  id="proj-dir"
                  value={workingDirectory}
                  onChange={(e) => setWorkingDirectory(e.target.value)}
                  placeholder="/path/to/project (optional)"
                />
                <p className="text-xs text-muted-foreground">
                  Agent tasks will execute in this directory. Defaults to the Orionfold Relay server directory if empty.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="proj-customer" className="flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Customer
                </Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger id="proj-customer">
                    <SelectValue placeholder="No customer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CUSTOMER}>
                      <span className="text-muted-foreground">No customer</span>
                    </SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {customers.length === 0
                    ? "No customers yet. Create one to attribute this project's AI spend."
                    : "Link to a customer so this project's AI spend rolls up per customer."}
                </p>
              </div>

              {isEdit && (
                <div className="space-y-2">
                  <Label htmlFor="proj-status">Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-[var(--status-completed)] inline-block" />
                          Active
                        </span>
                      </SelectItem>
                      <SelectItem value="paused">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-[var(--status-warning)] inline-block" />
                          Paused
                        </span>
                      </SelectItem>
                      <SelectItem value="completed">
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-[var(--status-running)] inline-block" />
                          Completed
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Paused projects won&apos;t accept task executions</p>
                </div>
              )}

              {/* Default Documents */}
              {(isEdit || selectedDocs.length > 0) && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    Default Documents
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Auto-attached to new tasks and workflows in this project
                  </p>
                  {selectedDocs.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {selectedDocs.map((doc) => {
                        const Icon = getFileIcon(doc.mimeType);
                        return (
                          <Badge
                            key={doc.id}
                            variant="secondary"
                            className="flex items-center gap-1.5 pl-2 pr-1 py-1"
                          >
                            <Icon className="h-3 w-3" />
                            <span className="text-xs max-w-[140px] truncate">
                              {doc.originalName}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatSize(doc.size)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDocIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(doc.id);
                                  return next;
                                });
                                setSelectedDocs((prev) => prev.filter((d) => d.id !== doc.id));
                              }}
                              className="ml-0.5 rounded-full p-0.5 hover:bg-muted transition-colors"
                              aria-label={`Remove ${doc.originalName}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPickerOpen(true)}
                    className="gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {selectedDocs.length > 0 ? "Add More" : "Select Documents"}
                  </Button>
                </div>
              )}

              <DocumentPickerSheet
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                projectId={project?.id ?? null}
                selectedIds={selectedDocIds}
                onConfirm={handleDocPickerConfirm}
                groupBy="source"
                title="Select Default Documents"
              />

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" disabled={loading || !name.trim()} className="w-full">
                {loading
                  ? isEdit ? "Saving..." : "Creating..."
                  : isEdit ? "Save Project" : "Create Project"}
              </Button>

              {isEdit && (
                <div className="pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-destructive"
                    onClick={() => setConfirmDelete(true)}
                    disabled={loading}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete Project
                  </Button>
                </div>
              )}
            </form>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete project?"
        description="This will permanently delete the project. Tasks associated with it will not be deleted."
        confirmLabel="Delete Project"
        destructive
        onConfirm={handleDelete}
      />
    </>
  );
}
