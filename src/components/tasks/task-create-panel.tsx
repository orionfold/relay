"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, FileText, Settings, Paperclip, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { AIAssistPanel } from "./ai-assist-panel";
import type { TaskAssistResponse } from "@/lib/agents/runtime/task-assist-types";
import { Badge } from "@/components/ui/badge";
import { DocumentPickerSheet } from "@/components/shared/document-picker-sheet";
import { getFileIcon, formatSize } from "@/components/documents/utils";
import { FormSectionCard } from "@/components/shared/form-section-card";
import {
  saveAssistState,
  loadTaskFormState,
  clearTaskFormState,
} from "@/lib/workflows/assist-session";
import {
  type AgentRuntimeId,
  DEFAULT_AGENT_RUNTIME,
  listRuntimeCatalog,
} from "@/lib/agents/runtime/catalog";
import {
  getSupportedRuntimes,
  profileSupportsRuntime,
} from "@/lib/agents/profiles/compatibility";
import type { AgentProfile } from "@/lib/agents/profiles/types";

type ProfileOption = Pick<
  AgentProfile,
  "id" | "name" | "description" | "supportedRuntimes"
> & {
  origin?: string;
  scope?: string;
  isBuiltin?: boolean;
};

interface SelectedDoc {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
}

interface TaskCreatePanelProps {
  projects: { id: string; name: string }[];
  defaultProjectId?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  "0": "bg-[var(--priority-critical)]",
  "1": "bg-[var(--priority-high)]",
  "2": "bg-[var(--priority-medium)]",
  "3": "bg-[var(--priority-low)]",
};

export function TaskCreatePanel({ projects, defaultProjectId }: TaskCreatePanelProps) {
  const runtimeOptions = listRuntimeCatalog();
  const runtimeLabelMap = new Map(
    runtimeOptions.map((runtime) => [runtime.id, runtime.label])
  );
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");
  const [assignedAgent, setAssignedAgent] = useState<string>("");
  const [priority, setPriority] = useState("2");
  const [agentProfile, setAgentProfile] = useState<string>("");
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [selectedDocs, setSelectedDocs] = useState<SelectedDoc[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedRuntime, setSuggestedRuntime] = useState<{
    runtimeId: string;
    reason: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/profiles")
      .then((r) => r.json())
      .then((data: ProfileOption[]) => setProfiles(data))
      .catch(() => {});
  }, []);

  // Load project default documents when project changes
  useEffect(() => {
    if (!projectId) {
      setSelectedDocIds(new Set());
      setSelectedDocs([]);
      return;
    }
    fetch(`/api/projects/${projectId}/documents`)
      .then((r) => r.json())
      .then((docs: Array<Record<string, unknown>>) => {
        if (Array.isArray(docs) && docs.length > 0) {
          setSelectedDocIds(new Set(docs.map((d) => d.id as string)));
          setSelectedDocs(
            docs.map((d) => ({
              id: d.id as string,
              originalName: d.originalName as string,
              mimeType: d.mimeType as string,
              size: d.size as number,
            }))
          );
        }
      })
      .catch(() => {});
  }, [projectId]);

  // Restore form state when returning from workflow confirmation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("restore") !== "1") return;
    const saved = loadTaskFormState();
    if (saved) {
      setTitle(saved.title);
      setDescription(saved.description);
      setProjectId(saved.projectId);
      setPriority(saved.priority);
      setAgentProfile(saved.agentProfile);
      setAssignedAgent(saved.assignedAgent);
      clearTaskFormState();
    }
    // Clean up URL param without triggering navigation
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // Fetch runtime suggestion when title changes (debounced)
  useEffect(() => {
    if (!title.trim() || assignedAgent) {
      setSuggestedRuntime(null);
      return;
    }
    const timer = setTimeout(() => {
      fetch("/api/runtimes/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, profileId: agentProfile || undefined }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.runtimeId) setSuggestedRuntime(data);
        })
        .catch(() => {});
    }, 500);
    return () => clearTimeout(timer);
  }, [title, description, agentProfile, assignedAgent]);

  const selectedRuntimeId = (assignedAgent ||
    suggestedRuntime?.runtimeId ||
    DEFAULT_AGENT_RUNTIME) as AgentRuntimeId;
  const selectedProfile = profiles.find((profile) => profile.id === agentProfile);
  const profileCompatibilityError =
    selectedProfile && !profileSupportsRuntime(selectedProfile, selectedRuntimeId)
      ? `${selectedProfile.name} does not support ${
          runtimeLabelMap.get(selectedRuntimeId) ?? selectedRuntimeId
        }`
      : null;

  const handleDocPickerConfirm = useCallback(
    (ids: string[], meta: Array<{ id: string; originalName: string; mimeType: string; size: number }>) => {
      setSelectedDocIds(new Set(ids));
      setSelectedDocs(meta);
    },
    []
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (profileCompatibilityError) {
      setError(profileCompatibilityError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          projectId: projectId || undefined,
          priority: parseInt(priority, 10),
          assignedAgent: assignedAgent || undefined,
          agentProfile: agentProfile || undefined,
          documentIds: selectedDocIds.size > 0 ? [...selectedDocIds] : undefined,
        }),
      });
      if (res.ok) {
        toast.success("Task created");
        router.push("/tasks");
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Failed to create task (${res.status})`);
      }
    } catch (err) {
      setError("Network error. Could not reach server");
      console.error("Task creation failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Create Task</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <FormSectionCard icon={FileText} title="Task Details">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="task-title">Title</Label>
                    <Input
                      id="task-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="What needs to be done?"
                      required
                    />
                    <p className="text-xs text-muted-foreground">Concise task summary</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="task-desc">Description</Label>
                    <Textarea
                      id="task-desc"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Detailed instructions for the agent"
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">Detailed agent instructions</p>
                  </div>
                </div>
              </FormSectionCard>

              <FormSectionCard icon={Settings} title="Configuration">
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Project</Label>
                      <Select
                        value={projectId || "none"}
                        onValueChange={(value) =>
                          setProjectId(value === "none" ? "" : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {projects.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Working directory · Select a project to scope document context</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Priority</Label>
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[
                            { value: "0", label: "P0 - Critical" },
                            { value: "1", label: "P1 - High" },
                            { value: "2", label: "P2 - Medium" },
                            { value: "3", label: "P3 - Low" },
                          ].map((p) => (
                            <SelectItem key={p.value} value={p.value}>
                              <span className="flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${PRIORITY_COLORS[p.value]} inline-block`} />
                                {p.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                      Runtime
                    </Label>
                    <Select
                      value={assignedAgent || "default"}
                      onValueChange={(value) =>
                        setAssignedAgent(value === "default" ? "" : value)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Default runtime" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">
                          Auto{suggestedRuntime ? ` → ${runtimeLabelMap.get(suggestedRuntime.runtimeId as AgentRuntimeId) ?? suggestedRuntime.runtimeId}` : " (recommended)"}
                        </SelectItem>
                        {runtimeOptions.map((runtime) => (
                          <SelectItem key={runtime.id} value={runtime.id}>
                            {runtime.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {suggestedRuntime && !assignedAgent && (
                      <p className="text-xs text-muted-foreground">
                        {suggestedRuntime.reason}
                      </p>
                    )}
                    {!suggestedRuntime && (
                      <p className="text-xs text-muted-foreground">
                        Which provider runtime should execute this task
                      </p>
                    )}
                  </div>
                  {profiles.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="flex items-center gap-1.5">
                        <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                        Agent Profile
                      </Label>
                      <Select
                        value={agentProfile || "auto"}
                        onValueChange={(value) =>
                          setAgentProfile(value === "auto" ? "" : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Auto-detect" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto-detect</SelectItem>
                          {profiles.map((p) => (
                            <SelectItem
                              key={p.id}
                              value={p.id}
                              disabled={!profileSupportsRuntime(p, selectedRuntimeId)}
                            >
                              <span className="flex items-center gap-1.5">
                                <Bot className="h-3 w-3" />
                                {p.name}
                                {p.scope === "project" ? (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500/60" title="Project" />
                                ) : p.isBuiltin ? (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/60" title="Built-in" />
                                ) : p.origin === "environment" ? (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500/60" title="Discovered" />
                                ) : p.origin === "import" ? (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500/60" title="Imported" />
                                ) : (
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/40" title="Custom" />
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Auto-detect only considers profiles compatible with the selected runtime
                      </p>
                      {selectedProfile && (
                        <p
                          className={`text-xs ${
                            profileCompatibilityError
                              ? "text-destructive"
                              : "text-muted-foreground"
                          }`}
                        >
                          {profileCompatibilityError ??
                            `Supports ${getSupportedRuntimes(selectedProfile)
                              .map(
                                (runtimeId) =>
                                  runtimeLabelMap.get(runtimeId) ?? runtimeId
                              )
                              .join(", ")}`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </FormSectionCard>

              <FormSectionCard icon={Paperclip} title="Context Documents">
                <div className="space-y-3">
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
                            <span className="text-xs max-w-[180px] truncate">
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
                    {selectedDocs.length > 0 ? "Add More Documents" : "Select Documents"}
                  </Button>
                  {selectedDocs.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {selectedDocs.length} document{selectedDocs.length !== 1 ? "s" : ""} will be provided as context
                    </p>
                  )}
                </div>

                <DocumentPickerSheet
                  open={pickerOpen}
                  onOpenChange={setPickerOpen}
                  projectId={projectId || null}
                  selectedIds={selectedDocIds}
                  onConfirm={handleDocPickerConfirm}
                  groupBy="project"
                  title="Select Context Documents"
                  allowCrossProject
                  selectedDocumentMeta={selectedDocs}
                />
              </FormSectionCard>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" disabled={loading || !title.trim()} className="w-full">
                {loading ? "Creating..." : "Create Task"}
              </Button>
            </div>
            <div className="surface-card-muted rounded-lg">
              <AIAssistPanel
                title={title}
                description={description}
                assignedAgent={assignedAgent || undefined}
                onApplyDescription={(d) => setDescription(d)}
                onCreateSubtasks={async (subtasks) => {
                  let created = 0;
                  const failures: string[] = [];
                  for (const sub of subtasks) {
                    toast.info(`Creating sub-task ${created + 1}/${subtasks.length}...`);
                    try {
                      const res = await fetch("/api/tasks", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          title: sub.title,
                          description: sub.description,
                          projectId: projectId || undefined,
                          priority: parseInt(priority, 10),
                          assignedAgent: assignedAgent || undefined,
                          agentProfile: agentProfile || undefined,
                        }),
                      });
                      if (res.ok) {
                        created++;
                      } else {
                        failures.push(sub.title);
                      }
                    } catch {
                      failures.push(sub.title);
                    }
                  }
                  if (failures.length > 0) {
                    toast.error(`Failed to create ${failures.length} sub-task(s): ${failures.join(", ")}`);
                  }
                  if (created > 0) {
                    toast.success(`Created ${created} sub-task(s)`);
                  }
                  router.push("/tasks");
                }}
                onCreateWorkflow={(result) => {
                  saveAssistState({
                    assistResult: result as TaskAssistResponse,
                    formState: {
                      title,
                      description,
                      projectId,
                      priority,
                      agentProfile,
                      assignedAgent,
                    },
                  });
                  router.push("/workflows/from-assist");
                }}
              />
            </div>

          </div>
        </form>
      </CardContent>
    </Card>
  );
}
