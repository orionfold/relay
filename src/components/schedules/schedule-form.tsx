"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Clock, Bot, Heart, Plus, X, GripVertical, Sparkles, CheckCircle2, AlertCircle, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DocumentPickerSheet } from "@/components/shared/document-picker-sheet";
import { getFileIcon, formatSize } from "@/components/documents/utils";
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

export const INTERVAL_PRESETS = [
  { label: "Every 5 minutes", value: "5m" },
  { label: "Every 15 minutes", value: "15m" },
  { label: "Every 30 minutes", value: "30m" },
  { label: "Every hour", value: "1h" },
  { label: "Every 2 hours", value: "2h" },
  { label: "Daily at 9 AM", value: "1d" },
  { label: "Custom", value: "custom" },
];

export interface HeartbeatChecklistItem {
  id: string;
  instruction: string;
  priority: "high" | "medium" | "low";
}

export interface ScheduleFormValues {
  name: string;
  prompt: string;
  interval: string;
  projectId: string;
  assignedAgent: string;
  agentProfile: string;
  recurs: boolean;
  maxFirings: number | "";
  expiresInHours: number | "";
  type: "scheduled" | "heartbeat";
  heartbeatChecklist: HeartbeatChecklistItem[];
  activeHoursStart: number | "";
  activeHoursEnd: number | "";
  activeTimezone: string;
  heartbeatBudgetPerDay: number | "";
  documentIds: string[];
  maxTurns: number | null;
}

export interface ScheduleFormInitialValues {
  name: string;
  prompt: string;
  /** The cron expression or human-friendly interval string */
  interval: string;
  projectId: string;
  assignedAgent: string;
  agentProfile: string;
  recurs: boolean;
  maxFirings: number | null;
  expiresAt: string | null;
  maxTurns?: number | null;
}

interface ScheduleFormProps {
  projects: { id: string; name: string }[];
  initialValues?: ScheduleFormInitialValues;
  onSubmit: (values: ScheduleFormValues) => Promise<void>;
  submitLabel: string;
  loading: boolean;
  error: string | null;
  onError: (error: string | null) => void;
}

/** Reverse-map a cron expression to a preset value, or "custom" if no match */
function cronToPreset(cron: string): { preset: string; custom: string } {
  const presetMap: Record<string, string> = {
    "*/5 * * * *": "5m",
    "*/15 * * * *": "15m",
    "*/30 * * * *": "30m",
    "0 * * * *": "1h",
    "0 */2 * * *": "2h",
    "0 9 * * *": "1d",
  };
  const matched = presetMap[cron];
  if (matched) return { preset: matched, custom: "" };
  return { preset: "custom", custom: cron };
}

export function ScheduleForm({
  projects,
  initialValues,
  onSubmit,
  submitLabel,
  loading,
  error,
  onError,
}: ScheduleFormProps) {
  const runtimeOptions = listRuntimeCatalog();
  const runtimeLabelMap = new Map(
    runtimeOptions.map((runtime) => [runtime.id, runtime.label])
  );

  // Determine initial interval state
  const initInterval = initialValues
    ? cronToPreset(initialValues.interval)
    : { preset: "5m", custom: "" };

  const [name, setName] = useState(initialValues?.name ?? "");
  const [prompt, setPrompt] = useState(initialValues?.prompt ?? "");
  const [intervalPreset, setIntervalPreset] = useState(initInterval.preset);
  const [customInterval, setCustomInterval] = useState(initInterval.custom);
  const [projectId, setProjectId] = useState(initialValues?.projectId ?? "");
  const [assignedAgent, setAssignedAgent] = useState(
    initialValues?.assignedAgent ?? ""
  );
  const [agentProfile, setAgentProfile] = useState(
    initialValues?.agentProfile ?? ""
  );
  const [recurs, setRecurs] = useState(initialValues?.recurs ?? true);
  const [maxFirings, setMaxFirings] = useState<number | "">(
    initialValues?.maxFirings ?? ""
  );
  const [expiresInHours, setExpiresInHours] = useState<number | "">(
    initialValues ? "" : ""
  );
  const [maxTurns, setMaxTurns] = useState<number | null>(initialValues?.maxTurns ?? null);
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);

  // NL schedule input state
  const [nlInput, setNlInput] = useState("");
  const [nlParsing, setNlParsing] = useState(false);
  const [nlResult, setNlResult] = useState<{
    cronExpression: string;
    description: string;
    nextFireTimes: string[];
    confidence: number;
  } | null>(null);
  const [nlError, setNlError] = useState<string | null>(null);
  const nlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parseNlExpression = useCallback(async (value: string) => {
    if (!value.trim()) {
      setNlResult(null);
      setNlError(null);
      return;
    }
    setNlParsing(true);
    setNlError(null);
    try {
      const res = await fetch("/api/schedules/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNlResult(null);
        setNlError(data.error ?? "Could not parse");
      } else {
        setNlResult(data);
        setNlError(null);
        // Auto-fill if confidence >= 0.8
        if (data.confidence >= 0.8) {
          setIntervalPreset("custom");
          setCustomInterval(data.cronExpression);
        }
      }
    } catch {
      setNlResult(null);
      setNlError("Failed to reach parse API");
    } finally {
      setNlParsing(false);
    }
  }, []);

  function handleNlInputChange(value: string) {
    setNlInput(value);
    if (nlTimerRef.current) clearTimeout(nlTimerRef.current);
    nlTimerRef.current = setTimeout(() => {
      parseNlExpression(value);
    }, 500);
  }

  // Heartbeat state
  const [scheduleType, setScheduleType] = useState<"scheduled" | "heartbeat">("scheduled");
  const [heartbeatChecklist, setHeartbeatChecklist] = useState<HeartbeatChecklistItem[]>([]);
  const [activeHoursStart, setActiveHoursStart] = useState<number | "">(9);
  const [activeHoursEnd, setActiveHoursEnd] = useState<number | "">(17);
  const [activeTimezone, setActiveTimezone] = useState("UTC");
  const [heartbeatBudgetPerDay, setHeartbeatBudgetPerDay] = useState<number | "">("");

  // Document picker state
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [selectedDocs, setSelectedDocs] = useState<Array<{ id: string; originalName: string; mimeType: string; size: number }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleDocPickerConfirm = useCallback(
    (ids: string[], meta: Array<{ id: string; originalName: string; mimeType: string; size: number }>) => {
      setSelectedDocIds(new Set(ids));
      setSelectedDocs(meta);
    },
    []
  );

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data: ProfileOption[]) => setProfiles(data))
      .catch(() => {});
  }, []);

  const selectedRuntimeId = (assignedAgent ||
    DEFAULT_AGENT_RUNTIME) as AgentRuntimeId;
  const selectedProfile = profiles.find(
    (profile) => profile.id === agentProfile
  );
  const profileCompatibilityError =
    selectedProfile && !profileSupportsRuntime(selectedProfile, selectedRuntimeId)
      ? `${selectedProfile.name} does not support ${
          runtimeLabelMap.get(selectedRuntimeId) ?? selectedRuntimeId
        }`
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (scheduleType === "scheduled" && !prompt.trim()) return;
    if (scheduleType === "heartbeat" && heartbeatChecklist.length === 0) {
      onError("Add at least one checklist item");
      return;
    }
    if (scheduleType === "heartbeat" && heartbeatChecklist.some((item) => !item.instruction.trim())) {
      onError("All checklist items must have instructions");
      return;
    }

    const interval =
      intervalPreset === "custom" ? customInterval : intervalPreset;
    if (!interval.trim()) {
      onError("Please enter an interval");
      return;
    }
    if (profileCompatibilityError) {
      onError(profileCompatibilityError);
      return;
    }

    onError(null);
    await onSubmit({
      name: name.trim(),
      prompt: prompt.trim(),
      interval,
      projectId,
      assignedAgent,
      agentProfile,
      recurs,
      maxFirings,
      expiresInHours,
      type: scheduleType,
      heartbeatChecklist,
      activeHoursStart,
      activeHoursEnd,
      activeTimezone,
      heartbeatBudgetPerDay,
      documentIds: [...selectedDocIds],
      maxTurns,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="sched-name">Name</Label>
        <Input
          id="sched-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Build status check"
          required
        />
        <p className="text-xs text-muted-foreground">
          Human-readable schedule name
        </p>
      </div>

      {/* Schedule Type */}
      <div className="space-y-2">
        <Label>Schedule Type</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setScheduleType("scheduled")}
            className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
              scheduleType === "scheduled"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Interval</div>
              <div className="text-xs text-muted-foreground">
                Fire on a schedule
              </div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setScheduleType("heartbeat")}
            className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
              scheduleType === "heartbeat"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <Heart className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">Heartbeat</div>
              <div className="text-xs text-muted-foreground">
                Check, then act if needed
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Heartbeat Checklist (heartbeat only) */}
      {scheduleType === "heartbeat" && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <Heart className="h-3.5 w-3.5 text-muted-foreground" />
            Checklist
          </Label>
          <p className="text-xs text-muted-foreground">
            Items the agent evaluates each heartbeat. Only acts if something needs attention.
          </p>
          <div className="space-y-2">
            {heartbeatChecklist.map((item, idx) => (
              <div key={item.id} className="flex items-start gap-2">
                <GripVertical className="h-4 w-4 mt-2.5 text-muted-foreground/50 shrink-0" />
                <div className="flex-1 space-y-1">
                  <Input
                    value={item.instruction}
                    onChange={(e) => {
                      const updated = [...heartbeatChecklist];
                      updated[idx] = { ...item, instruction: e.target.value };
                      setHeartbeatChecklist(updated);
                    }}
                    placeholder="e.g., Check if there are unread customer inquiries older than 2 hours"
                  />
                </div>
                <Select
                  value={item.priority}
                  onValueChange={(v) => {
                    const updated = [...heartbeatChecklist];
                    updated[idx] = { ...item, priority: v as "high" | "medium" | "low" };
                    setHeartbeatChecklist(updated);
                  }}
                >
                  <SelectTrigger className="w-24 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => {
                    setHeartbeatChecklist(heartbeatChecklist.filter((_, i) => i !== idx));
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setHeartbeatChecklist([
                  ...heartbeatChecklist,
                  {
                    id: crypto.randomUUID().slice(0, 8),
                    instruction: "",
                    priority: "medium",
                  },
                ]);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add item
            </Button>
          </div>
        </div>
      )}

      {/* Active Hours (heartbeat only) */}
      {scheduleType === "heartbeat" && (
        <div className="space-y-2">
          <Label>Active Hours</Label>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="active-start" className="text-xs text-muted-foreground">Start</Label>
              <Input
                id="active-start"
                type="number"
                min={0}
                max={23}
                value={activeHoursStart}
                onChange={(e) => setActiveHoursStart(e.target.value ? Number(e.target.value) : "")}
                placeholder="9"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="active-end" className="text-xs text-muted-foreground">End</Label>
              <Input
                id="active-end"
                type="number"
                min={0}
                max={23}
                value={activeHoursEnd}
                onChange={(e) => setActiveHoursEnd(e.target.value ? Number(e.target.value) : "")}
                placeholder="17"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="active-tz" className="text-xs text-muted-foreground">Timezone</Label>
              <Input
                id="active-tz"
                value={activeTimezone}
                onChange={(e) => setActiveTimezone(e.target.value)}
                placeholder="UTC"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Heartbeats only fire within this window. Leave empty for 24/7.
          </p>
        </div>
      )}

      {/* Daily Budget (heartbeat only) */}
      {scheduleType === "heartbeat" && (
        <div className="space-y-2">
          <Label htmlFor="hb-budget">Daily Budget ($)</Label>
          <Input
            id="hb-budget"
            type="number"
            min={0}
            step={0.01}
            value={heartbeatBudgetPerDay === "" ? "" : (heartbeatBudgetPerDay as number) / 1_000_000}
            onChange={(e) =>
              setHeartbeatBudgetPerDay(
                e.target.value ? Math.round(Number(e.target.value) * 1_000_000) : ""
              )
            }
            placeholder="Unlimited"
          />
          <p className="text-xs text-muted-foreground">
            Cap daily heartbeat spend. Leave empty for no limit.
          </p>
        </div>
      )}

      {/* Prompt (scheduled type) or optional context (heartbeat) */}
      <div className="space-y-2">
        <Label htmlFor="sched-prompt">
          {scheduleType === "heartbeat" ? "Additional Context (optional)" : "Prompt"}
        </Label>
        <Textarea
          id="sched-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            scheduleType === "heartbeat"
              ? "Optional context for the agent when evaluating the checklist"
              : "What the agent does each firing"
          }
          rows={3}
          required={scheduleType === "scheduled"}
        />
        <p className="text-xs text-muted-foreground">
          {scheduleType === "heartbeat"
            ? "Extra instructions appended to the heartbeat evaluation"
            : "Instructions for each execution"}
        </p>
        {scheduleType === "scheduled" && (
          <p className="text-muted-foreground text-xs">
            Note: writing &quot;MAX N turns&quot; in your prompt is a hint to the model,
            not a runtime limit. Use <strong>Max agent steps</strong> below to enforce
            a budget.
          </p>
        )}
      </div>

      {/* Natural Language Schedule Input */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          Describe your schedule
        </Label>
        <Input
          value={nlInput}
          onChange={(e) => handleNlInputChange(e.target.value)}
          placeholder="e.g., every weekday at 9am"
        />
        {nlParsing && (
          <p className="text-xs text-muted-foreground">Parsing...</p>
        )}
        {nlResult && !nlParsing && (
          <div className="rounded-lg border p-3 space-y-1.5 bg-surface-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-sm font-medium">{nlResult.description}</span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              {nlResult.cronExpression}
            </p>
            {nlResult.nextFireTimes.length > 0 && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p className="font-medium">Next fires:</p>
                {nlResult.nextFireTimes.map((t, i) => (
                  <p key={i}>{new Date(t).toLocaleString()}</p>
                ))}
              </div>
            )}
            {nlResult.confidence < 1.0 && (
              <p className="text-xs text-amber-600">
                Confidence: {Math.round(nlResult.confidence * 100)}%
                {nlResult.confidence < 0.8 && ". Not auto-filled, verify below."}
              </p>
            )}
          </div>
        )}
        {nlError && !nlParsing && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {nlError}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Or use the preset/custom interval below
        </p>
      </div>

      {/* Interval */}
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
            <p className="text-xs text-muted-foreground">
              Duration or cron expression
            </p>
          </>
        )}
      </div>

      {/* Recurring toggle */}
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
          <div className="grid grid-cols-2 gap-3">
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
              <p className="text-xs text-muted-foreground">
                Leave empty = unlimited
              </p>
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
          </div>
        )}
      </div>

      {/* Max agent steps */}
      <div className="space-y-2">
        <Label htmlFor="max-turns">Max agent steps per run</Label>
        <Input
          id="max-turns"
          type="number"
          min={1}
          max={10000}
          placeholder="Inherits global default"
          value={maxTurns ?? ""}
          onChange={(e) =>
            setMaxTurns(e.target.value ? parseInt(e.target.value, 10) : null)
          }
        />
        <p className="text-muted-foreground text-xs">
          One step = one agent action (message, tool call, or sub-response). Most
          schedules use 50–500 steps; heavy research runs 2,000+.
        </p>
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

      {/* Context Documents */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5">
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          Context Documents
        </Label>
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
        {selectedDocs.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {selectedDocs.length} document{selectedDocs.length !== 1 ? "s" : ""} will be provided as context for each firing
          </p>
        )}
      </div>

      <DocumentPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        projectId={projectId || null}
        selectedIds={selectedDocIds}
        onConfirm={handleDocPickerConfirm}
        groupBy="source"
        title="Select Context Documents"
        allowCrossProject
        selectedDocumentMeta={selectedDocs}
      />

      {/* Runtime */}
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
            Auto-detect only considers profiles compatible with the selected
            runtime
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="submit"
        disabled={
          loading ||
          !name.trim() ||
          (scheduleType === "scheduled" && !prompt.trim()) ||
          (scheduleType === "heartbeat" && heartbeatChecklist.length === 0)
        }
        className="w-full"
      >
        {loading ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
