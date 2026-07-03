"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUp,
  ArrowDown,
  Star,
  Trash2,
  Loader2,
  GitBranch,
  ListOrdered,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { FormSectionCard } from "@/components/shared/form-section-card";
import type { TaskAssistResponse } from "@/lib/agents/runtime/task-assist-types";
import type { WorkflowPattern } from "@/lib/workflows/types";
import { suggestProfileForStep } from "@/lib/agents/profiles/suggest";
import {
  loadAssistState,
  clearAssistState,
  saveTaskFormState,
} from "@/lib/workflows/assist-session";

const PATTERN_OPTIONS: { value: WorkflowPattern; label: string; description: string }[] = [
  { value: "sequence", label: "Sequence", description: "Steps run one after another" },
  { value: "planner-executor", label: "Planner → Executor", description: "First step plans, rest execute" },
  { value: "checkpoint", label: "Checkpoint", description: "Steps pause for human approval" },
  { value: "parallel", label: "Parallel", description: "Independent steps run concurrently" },
  { value: "loop", label: "Loop", description: "Single step repeats iteratively" },
  { value: "swarm", label: "Swarm", description: "Mayor coordinates workers" },
];

interface StepItem {
  title: string;
  description: string;
  profile: string;
  requiresApproval?: boolean;
}

interface ProfileOption {
  id: string;
  name: string;
}

interface WorkflowConfirmationViewProps {
  projects: { id: string; name: string }[];
  profiles: ProfileOption[];
}

export function WorkflowConfirmationView({
  projects,
  profiles,
}: WorkflowConfirmationViewProps) {
  const router = useRouter();
  const [workflowName, setWorkflowName] = useState("");
  const [pattern, setPattern] = useState<WorkflowPattern>("sequence");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [steps, setSteps] = useState<StepItem[]>([]);
  const [maxIterations, setMaxIterations] = useState(5);
  const [workerConcurrencyLimit, setWorkerConcurrencyLimit] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [priority, setPriority] = useState(2);
  const [assignedAgent, setAssignedAgent] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);

  // Load state from sessionStorage on mount
  useEffect(() => {
    const state = loadAssistState();
    if (!state) {
      router.replace("/tasks/new");
      return;
    }

    const { assistResult, formState } = state;
    const recommended = assistResult.recommendedPattern;
    const validPattern = recommended === "single" ? "sequence" : (recommended as WorkflowPattern);

    setPattern(validPattern);
    setWorkflowName(`Workflow: ${formState.title}`);
    setSelectedProjectId(formState.projectId);
    setPriority(parseInt(formState.priority, 10) || 2);
    setAssignedAgent(formState.assignedAgent || undefined);
    setMaxIterations(assistResult.suggestedLoopConfig?.maxIterations ?? 5);
    setWorkerConcurrencyLimit(assistResult.suggestedSwarmConfig?.workerConcurrencyLimit ?? 2);

    const profileIds = profiles.map((p) => p.id);

    const newSteps: StepItem[] = [
      {
        title: formState.title,
        description: formState.description,
        profile: formState.agentProfile || "auto",
      },
      ...assistResult.breakdown.map((sub) => ({
        title: sub.title,
        description: sub.description,
        profile: sub.suggestedProfile || suggestProfileForStep(sub.title, sub.description, profileIds),
        requiresApproval: sub.requiresApproval,
      })),
    ];

    setSteps(newSteps);
    setLoaded(true);
  }, [router, profiles]);

  function navigateBackToTask() {
    // Save form state so task form can restore
    const state = loadAssistState();
    if (state) {
      saveTaskFormState(state.formState);
    }
    clearAssistState();
    router.push("/tasks/new?restore=1");
  }

  function moveStep(index: number, direction: -1 | 1) {
    if (index === 0) return;
    const newIndex = index + direction;
    if (newIndex < 1 || newIndex >= steps.length) return;
    const newSteps = [...steps];
    [newSteps[index], newSteps[newIndex]] = [newSteps[newIndex], newSteps[index]];
    setSteps(newSteps);
  }

  function removeStep(index: number) {
    if (index === 0 || steps.length <= 2) return;
    setSteps(steps.filter((_, i) => i !== index));
  }

  function updateStepProfile(index: number, profile: string) {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], profile };
    setSteps(newSteps);
  }

  async function handleSubmit(executeImmediately: boolean) {
    if (!workflowName.trim() || steps.length < 2) return;
    setSubmitting(true);

    try {
      const definitionSteps = steps.map((step, i) => ({
        id: `step_${i + 1}`,
        name: step.title,
        prompt: step.description,
        agentProfile: step.profile === "auto" ? undefined : step.profile,
        requiresApproval: pattern === "checkpoint" ? step.requiresApproval : undefined,
        ...(pattern === "parallel" && i === steps.length - 1
          ? { dependsOn: steps.slice(0, -1).map((_, j) => `step_${j + 1}`) }
          : {}),
      }));

      const definition: Record<string, unknown> = {
        pattern,
        steps: definitionSteps,
      };

      if (pattern === "loop") {
        definition.loopConfig = {
          maxIterations,
          agentProfile: steps[0]?.profile === "auto" ? undefined : steps[0]?.profile,
        };
      }

      if (pattern === "swarm") {
        definition.swarmConfig = { workerConcurrencyLimit };
      }

      const res = await fetch("/api/workflows/from-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: workflowName.trim(),
          projectId: selectedProjectId || undefined,
          definition,
          priority,
          assignedAgent: assignedAgent || undefined,
          executeImmediately,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Failed to create workflow");
        return;
      }

      const data = await res.json();
      toast.success(
        executeImmediately
          ? `Workflow started (${data.taskIds.length} steps)`
          : `Workflow created as draft (${data.taskIds.length} steps)`,
        {
          action: {
            label: "View workflow",
            onClick: () => window.open(`/workflows/${data.workflow.id}`, "_self"),
          },
        }
      );
      clearAssistState();
      router.push("/tasks");
    } catch {
      toast.error("Network error. Could not create workflow");
    } finally {
      setSubmitting(false);
    }
  }

  const isReorderDisabled = pattern === "parallel";

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading workflow data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create Workflow from AI Assist</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and customize the AI-suggested workflow before creating it.
        </p>
      </div>

      {/* Workflow Identity */}
      <FormSectionCard icon={GitBranch} title="Workflow Identity">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="workflow-name">Name</Label>
            <Input
              id="workflow-name"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="Workflow name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Pattern</Label>
              <Select value={pattern} onValueChange={(v) => setPattern(v as WorkflowPattern)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PATTERN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {PATTERN_OPTIONS.find((o) => o.value === pattern)?.description}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select
                value={selectedProjectId || "none"}
                onValueChange={(v) => setSelectedProjectId(v === "none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </FormSectionCard>

      {/* Steps */}
      <FormSectionCard icon={ListOrdered} title={`Steps (${steps.length})`}>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-2 p-2.5 rounded-md border bg-card text-sm"
            >
              <span className="text-xs text-muted-foreground w-5 shrink-0">
                {i + 1}.
              </span>
              {i === 0 && (
                <Badge variant="outline" className="text-xs shrink-0 px-1">
                  <Star className="h-2.5 w-2.5" />
                </Badge>
              )}
              <div className="flex-1 min-w-0">
                <span className="font-medium block truncate">{step.title}</span>
                {step.description && (
                  <span className="text-xs text-muted-foreground block truncate">
                    {step.description}
                  </span>
                )}
              </div>

              {/* Profile selector */}
              <Select
                value={step.profile}
                onValueChange={(v) => updateStepProfile(i, v)}
              >
                <SelectTrigger className="w-32 h-7 text-xs shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Reorder buttons */}
              {!isReorderDisabled && (
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    onClick={() => moveStep(i, -1)}
                    disabled={i <= 1}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                    aria-label="Move step up"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(i, 1)}
                    disabled={i === 0 || i === steps.length - 1}
                    className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
                    aria-label="Move step down"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
              )}

              {/* Remove button */}
              {i > 0 && steps.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove step ${step.title}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </FormSectionCard>

      {/* Pattern-specific config */}
      {(pattern === "loop" || pattern === "swarm") && (
        <FormSectionCard icon={Settings} title="Configuration">
          {pattern === "loop" && (
            <div className="space-y-1.5">
              <Label htmlFor="max-iterations">Max Iterations</Label>
              <Input
                id="max-iterations"
                type="number"
                min={1}
                max={50}
                value={maxIterations}
                onChange={(e) => setMaxIterations(parseInt(e.target.value, 10) || 5)}
                className="w-32"
              />
            </div>
          )}
          {pattern === "swarm" && (
            <div className="space-y-1.5">
              <Label htmlFor="concurrency-limit">Worker Concurrency Limit</Label>
              <Input
                id="concurrency-limit"
                type="number"
                min={1}
                max={5}
                value={workerConcurrencyLimit}
                onChange={(e) => setWorkerConcurrencyLimit(parseInt(e.target.value, 10) || 2)}
                className="w-32"
              />
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground opacity-50 mt-2">
            <input type="checkbox" disabled />
            <span>Save as Blueprint (coming soon)</span>
          </div>
        </FormSectionCard>
      )}

      {/* Action bar */}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          variant="ghost"
          onClick={navigateBackToTask}
          disabled={submitting}
        >
          Dismiss
        </Button>
        <Button
          variant="outline"
          onClick={() => handleSubmit(false)}
          disabled={submitting || !workflowName.trim() || steps.length < 2}
        >
          {submitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
          Accept
        </Button>
        <Button
          onClick={() => handleSubmit(true)}
          disabled={submitting || !workflowName.trim() || steps.length < 2}
        >
          {submitting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
          Accept & Run
        </Button>
      </div>
    </div>
  );
}
