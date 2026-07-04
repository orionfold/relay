"use client";

import { useState, useEffect } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Calendar, Clock, Bot } from "lucide-react";
import { toast } from "sonner";
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

type ProfileOption = Pick<AgentProfile, "id" | "name" | "supportedRuntimes">;

interface ScheduleCreateDialogProps {
  projects: { id: string; name: string }[];
  onCreated: () => void;
}

const INTERVAL_PRESETS = [
  { label: "Every 5 minutes", value: "5m" },
  { label: "Every 15 minutes", value: "15m" },
  { label: "Every 30 minutes", value: "30m" },
  { label: "Every hour", value: "1h" },
  { label: "Every 2 hours", value: "2h" },
  { label: "Daily at 9 AM", value: "1d" },
  { label: "Custom", value: "custom" },
];

export function ScheduleCreateDialog({
  projects,
  onCreated,
}: ScheduleCreateDialogProps) {
  const runtimeOptions = listRuntimeCatalog();
  const runtimeLabelMap = new Map(
    runtimeOptions.map((runtime) => [runtime.id, runtime.label])
  );
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [intervalPreset, setIntervalPreset] = useState("5m");
  const [customInterval, setCustomInterval] = useState("");
  const [projectId, setProjectId] = useState("");
  const [assignedAgent, setAssignedAgent] = useState("");
  const [agentProfile, setAgentProfile] = useState("");
  const [recurs, setRecurs] = useState(true);
  const [maxFirings, setMaxFirings] = useState<number | "">("");
  const [expiresInHours, setExpiresInHours] = useState<number | "">("");
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: ProfileOption[]) => setProfiles(data))
      .catch(() => {});
  }, []);

  const selectedRuntimeId = (assignedAgent ||
    DEFAULT_AGENT_RUNTIME) as AgentRuntimeId;
  const selectedProfile = profiles.find((profile) => profile.id === agentProfile);
  const profileCompatibilityError =
    selectedProfile && !profileSupportsRuntime(selectedProfile, selectedRuntimeId)
      ? `${selectedProfile.name} does not support ${
          runtimeLabelMap.get(selectedRuntimeId) ?? selectedRuntimeId
        }`
      : null;

  function resetForm() {
    setName("");
    setPrompt("");
    setIntervalPreset("5m");
    setCustomInterval("");
    setProjectId("");
    setAssignedAgent("");
    setAgentProfile("");
    setRecurs(true);
    setMaxFirings("");
    setExpiresInHours("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !prompt.trim()) return;

    const interval =
      intervalPreset === "custom" ? customInterval : intervalPreset;
    if (!interval.trim()) {
      setError("Please enter an interval");
      return;
    }
    if (profileCompatibilityError) {
      setError(profileCompatibilityError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          prompt: prompt.trim(),
          interval,
          projectId: projectId || undefined,
          assignedAgent: assignedAgent || undefined,
          agentProfile: agentProfile || undefined,
          recurs,
          maxFirings: maxFirings || undefined,
          expiresInHours: expiresInHours || undefined,
        }),
      });

      if (res.ok) {
        resetForm();
        setOpen(false);
        toast.success("Schedule created");
        onCreated();
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Failed to create schedule (${res.status})`);
      }
    } catch {
      setError("Network error. Could not reach server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Schedule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            Create Schedule
          </DialogTitle>
          <DialogDescription>
            Define when the agent should run, what it should do, and which project context it should use.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Left column */}
            <div className="space-y-2">
              <Label htmlFor="sched-name">Name</Label>
              <Input
                id="sched-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Build status check"
                required
              />
              <p className="text-xs text-muted-foreground">Human-readable schedule name</p>
            </div>

            {/* Right column */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                Interval
              </Label>
              <Select value={intervalPreset} onValueChange={setIntervalPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {intervalPreset === "custom" && (
                <>
                  <Input
                    value={customInterval}
                    onChange={(e) => setCustomInterval(e.target.value)}
                    placeholder="e.g., 10m, 3h, or */5 * * * *"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground">Duration or cron expression</p>
                </>
              )}
            </div>

            {/* Prompt — spans full left column */}
            <div className="space-y-2">
              <Label htmlFor="sched-prompt">Prompt</Label>
              <Textarea
                id="sched-prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="What the agent does each firing"
                rows={3}
                required
              />
              <p className="text-xs text-muted-foreground">Instructions for each execution</p>
            </div>

            {/* Recurring + conditional fields */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="sched-recurs">Recurring</Label>
                <Switch
                  id="sched-recurs"
                  checked={recurs}
                  onCheckedChange={setRecurs}
                />
              </div>
              {recurs && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="sched-max">Max firings</Label>
                    <Input
                      id="sched-max"
                      type="number"
                      min={1}
                      value={maxFirings}
                      onChange={(e) =>
                        setMaxFirings(e.target.value ? Number(e.target.value) : "")
                      }
                      placeholder="Unlimited"
                    />
                    <p className="text-xs text-muted-foreground">Leave empty = unlimited</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sched-expires">Expires in (hours)</Label>
                    <Input
                      id="sched-expires"
                      type="number"
                      min={1}
                      value={expiresInHours}
                      onChange={(e) =>
                        setExpiresInHours(
                          e.target.value ? Number(e.target.value) : ""
                        )
                      }
                      placeholder="Never"
                    />
                    <p className="text-xs text-muted-foreground">Auto-pause timer</p>
                  </div>
                </>
              )}
            </div>

            {/* Project */}
            {projects.length > 0 && (
              <div className="space-y-2">
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
                <p className="text-xs text-muted-foreground">Context directory</p>
              </div>
            )}

            <div className="space-y-2">
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
                  <SelectItem value="default">Default runtime</SelectItem>
                  {runtimeOptions.map((runtime) => (
                    <SelectItem key={runtime.id} value={runtime.id}>
                      {runtime.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Which provider runtime each firing should use
              </p>
            </div>

            {/* Agent Profile */}
            {profiles.length > 0 && (
              <div className="space-y-2">
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
                        {p.name}
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            type="submit"
            disabled={loading || !name.trim() || !prompt.trim()}
            className="w-full"
          >
            {loading ? "Creating..." : "Create Schedule"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
