"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Plus, FolderOpen, AlignLeft, FolderCode } from "lucide-react";
import { toast } from "sonner";

interface ProjectCreateDialogProps {
  onCreated: () => void;
}

export function ProjectCreateDialog({ onCreated }: ProjectCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          workingDirectory: workingDirectory.trim() || undefined,
        }),
      });
      if (res.ok) {
        setName("");
        setDescription("");
        setWorkingDirectory("");
        setOpen(false);
        toast.success("Project created");
        onCreated();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Failed to create project (${res.status})`);
      }
    } catch (err) {
      setError("Network error. Could not reach server");
      console.error("Project creation failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button ref={triggerRef}>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Create a project workspace with optional context so tasks stay grouped and runnable in the right directory.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              Name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              required
            />
            <p className="text-xs text-muted-foreground">Short, memorable name</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description" className="flex items-center gap-1.5">
              <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Optional context for agents</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="working-dir" className="flex items-center gap-1.5">
              <FolderCode className="h-3.5 w-3.5 text-muted-foreground" />
              Working Directory
            </Label>
            <Input
              id="working-dir"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="/path/to/project (optional)"
            />
            <p className="text-xs text-muted-foreground">
              Agent tasks will execute in this directory. Defaults to the Orionfold Relay server directory if empty.
            </p>
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" disabled={loading || !name.trim()} className="w-full">
            {loading ? "Creating..." : "Create Project"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
