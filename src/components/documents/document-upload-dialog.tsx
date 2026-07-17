"use client";

import { useEffect, useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DocumentUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
  restoreFocusElement?: HTMLElement | null;
  projects?: { id: string; name: string }[];
  defaultProjectId?: string | null;
}

export function DocumentUploadDialog({
  open,
  onClose,
  onUploaded,
  restoreFocusElement,
  projects = [],
  defaultProjectId = null,
}: DocumentUploadDialogProps) {
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "none");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setProjectId(defaultProjectId ?? "none");
  }, [defaultProjectId, open]);

  async function handleFiles(files: FileList) {
    setUploading(true);
    const names: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        if (projectId !== "none") formData.append("projectId", projectId);

        const res = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          names.push(file.name);
        } else {
          const body = await res.json().catch(() => null);
          toast.error(body?.error ?? `Failed to upload ${file.name} (${res.status})`);
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    setUploaded((prev) => [...prev, ...names]);
    setUploading(false);

    if (names.length > 0) {
      toast.success(`Uploaded ${names.length} file${names.length !== 1 ? "s" : ""}`);
      onUploaded();
    }
  }

  function handleClose() {
    setUploaded([]);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(event) => {
          if (!restoreFocusElement) return;
          event.preventDefault();
          restoreFocusElement.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>
            Add one or more files to the document library for processing and task attachment.
          </DialogDescription>
        </DialogHeader>

        {projects.length > 0 && (
          <div className="space-y-1.5">
            <Label htmlFor="document-upload-project">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="document-upload-project">
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Project documents appear in that project&apos;s workflow picker.
            </p>
          </div>
        )}

        <div
          role="button"
          tabIndex={0}
          aria-label="Upload files. Click or drag and drop"
          className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 mx-auto text-muted-foreground mb-2 animate-spin" />
          ) : (
            <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          )}
          <p className="text-sm text-muted-foreground">
            {uploading ? "Uploading..." : "Click or drop files here"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Max 50MB per file. Multiple files supported.
          </p>
          <div className="flex flex-wrap justify-center gap-1 mt-2">
            {["PDF", "DOCX", "XLSX", "TXT", "Images"].map((type) => (
              <Badge key={type} variant="outline" className="text-xs">
                {type}
              </Badge>
            ))}
          </div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {uploaded.length > 0 && (
          <div className="space-y-1">
            {uploaded.map((name, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="truncate">{name}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={handleClose}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
