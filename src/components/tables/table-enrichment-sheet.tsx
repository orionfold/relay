"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import type { ColumnDef, FilterOperator } from "@/lib/tables/types";
import type { EnrichmentPlan } from "@/lib/tables/enrichment-planner";

interface ProfileOption {
  id: string;
  name: string;
}

interface TableEnrichmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  columns: ColumnDef[];
  onLaunched?: () => void;
}

const SUPPORTED_TYPES = new Set([
  "text",
  "number",
  "boolean",
  "select",
  "url",
  "email",
]);

const FILTER_OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equal" },
  { value: "contains", label: "Contains" },
  { value: "starts_with", label: "Starts with" },
  { value: "gt", label: "Greater than" },
  { value: "gte", label: "Greater than or equal" },
  { value: "lt", label: "Less than" },
  { value: "lte", label: "Less than or equal" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
];

export function TableEnrichmentSheet({
  open,
  onOpenChange,
  tableId,
  columns,
  onLaunched,
}: TableEnrichmentSheetProps) {
  const router = useRouter();
  const supportedColumns = useMemo(
    () => columns.filter((column) => SUPPORTED_TYPES.has(column.dataType)),
    [columns]
  );
  const [profiles, setProfiles] = useState<ProfileOption[]>([]);
  const [targetColumn, setTargetColumn] = useState("");
  const [promptMode, setPromptMode] = useState<"auto" | "custom">("auto");
  const [prompt, setPrompt] = useState("");
  const [agentProfileOverride, setAgentProfileOverride] = useState("");
  const [batchSize, setBatchSize] = useState("50");
  const [filterEnabled, setFilterEnabled] = useState(false);
  const [filterColumn, setFilterColumn] = useState("");
  const [filterOperator, setFilterOperator] = useState<FilterOperator>("is_empty");
  const [filterValue, setFilterValue] = useState("");
  const [preview, setPreview] = useState<EnrichmentPlan | null>(null);
  const [previewSignature, setPreviewSignature] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [launching, setLaunching] = useState(false);

  const currentSignature = JSON.stringify({
    targetColumn,
    promptMode,
    prompt,
    agentProfileOverride,
    batchSize,
    filterEnabled,
    filterColumn,
    filterOperator,
    filterValue,
  });
  const previewIsStale = preview !== null && previewSignature !== currentSignature;
  const selectedTargetColumn = supportedColumns.find(
    (column) => column.name === targetColumn
  );

  useEffect(() => {
    if (!open) return;
    fetch("/api/agents")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Array<{ id: string; name: string }>) => {
        setProfiles(data.map((profile) => ({ id: profile.id, name: profile.name })));
      })
      .catch(() => setProfiles([]));
  }, [open]);

  useEffect(() => {
    if (!open || supportedColumns.length === 0) return;
    setTargetColumn((current) => current || supportedColumns[0].name);
    setFilterColumn((current) => current || supportedColumns[0].name);
  }, [open, supportedColumns]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setPreviewSignature("");
    }
  }, [open]);

  async function handlePreview() {
    if (!targetColumn) {
      toast.error("Choose a target column first");
      return;
    }

    setPreviewing(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/enrich/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(false)),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to build enrichment plan");
      }
      setPreview(data as EnrichmentPlan);
      setPreviewSignature(currentSignature);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to build plan");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleLaunch() {
    if (!preview) {
      toast.error("Preview the plan before launching");
      return;
    }
    if (previewIsStale) {
      toast.error("Preview is stale. Refresh it before launching.");
      return;
    }

    setLaunching(true);
    try {
      const res = await fetch(`/api/tables/${tableId}/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(true)),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to launch enrichment");
      }
      toast.success(`Started enrichment for ${data.rowCount} row(s)`);
      onOpenChange(false);
      onLaunched?.();
      router.push(`/workflows/${data.workflowId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to launch enrichment");
    } finally {
      setLaunching(false);
    }
  }

  function buildPayload(includePlan: boolean) {
    const payload: Record<string, unknown> = {
      targetColumn,
      promptMode,
      batchSize: Number(batchSize) || 50,
    };

    if (prompt.trim()) {
      payload.prompt = prompt.trim();
    }
    if (agentProfileOverride.trim()) {
      payload.agentProfileOverride = agentProfileOverride.trim();
    }

    const filter = buildFilter();
    if (filter) {
      payload.filter = filter;
    }

    if (includePlan && preview) {
      payload.plan = preview;
    }

    return payload;
  }

  function buildFilter(): Record<string, unknown> | undefined {
    if (!filterEnabled || !filterColumn) return undefined;
    const filter: Record<string, unknown> = {
      column: filterColumn,
      operator: filterOperator,
    };
    if (filterOperator === "is_empty" || filterOperator === "is_not_empty") {
      return filter;
    }
    if (filterValue.trim() === "") return undefined;
    filter.value = coerceFilterValue(filterValue.trim());
    return filter;
  }

  if (supportedColumns.length === 0) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-[520px] sm:max-w-[520px]">
          <SheetHeader>
            <SheetTitle>Enrich Table</SheetTitle>
            <SheetDescription>
              Review which columns support enrichment before configuring a planner run.
            </SheetDescription>
          </SheetHeader>
          <div className="px-6 py-4">
            <p className="text-sm text-muted-foreground">
              This table does not have any enrichment-compatible columns yet.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[560px] sm:max-w-[560px] flex flex-col">
        <SheetHeader>
          <SheetTitle>Enrich Table</SheetTitle>
          <SheetDescription>
            Choose a target column, preview the row-by-row plan, then launch the enrichment workflow.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          <section className="surface-card-muted rounded-lg border p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-column">Target Column</Label>
              <Select value={targetColumn} onValueChange={setTargetColumn}>
                <SelectTrigger id="target-column">
                  <SelectValue placeholder="Choose a target column" />
                </SelectTrigger>
                <SelectContent>
                  {supportedColumns.map((column) => (
                    <SelectItem key={column.name} value={column.name}>
                      {column.displayName} · {column.dataType}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label>Optional Filter</Label>
                  <p className="text-xs text-muted-foreground">
                    Narrow the rows before idempotent skip removes already-filled cells.
                  </p>
                </div>
                <Switch checked={filterEnabled} onCheckedChange={setFilterEnabled} />
              </div>

              {filterEnabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="filter-column">Filter Column</Label>
                    <Select value={filterColumn} onValueChange={setFilterColumn}>
                      <SelectTrigger id="filter-column">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {supportedColumns.map((column) => (
                          <SelectItem key={column.name} value={column.name}>
                            {column.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="filter-operator">Operator</Label>
                    <Select
                      value={filterOperator}
                      onValueChange={(value) => setFilterOperator(value as FilterOperator)}
                    >
                      <SelectTrigger id="filter-operator">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FILTER_OPERATORS.map((operator) => (
                          <SelectItem key={operator.value} value={operator.value}>
                            {operator.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {filterOperator !== "is_empty" &&
                    filterOperator !== "is_not_empty" && (
                      <div className="space-y-2">
                        <Label htmlFor="filter-value">Value</Label>
                        <Input
                          id="filter-value"
                          value={filterValue}
                          onChange={(event) => setFilterValue(event.target.value)}
                        />
                      </div>
                    )}
                </div>
              )}
            </div>
          </section>

          <section className="surface-card-muted rounded-lg border p-4 space-y-4">
            <div className="space-y-2">
              <Label>Planning Mode</Label>
              <RadioGroup
                value={promptMode}
                onValueChange={(value) => setPromptMode(value as "auto" | "custom")}
                className="gap-2"
              >
                <label className="surface-control rounded-lg border p-3 flex items-start gap-3">
                  <RadioGroupItem value="auto" />
                  <div>
                    <p className="text-sm font-medium">Auto plan</p>
                    <p className="text-xs text-muted-foreground">
                      Planner chooses the row strategy, output contract, and step sequence.
                    </p>
                  </div>
                </label>
                <label className="surface-control rounded-lg border p-3 flex items-start gap-3">
                  <RadioGroupItem value="custom" />
                  <div>
                    <p className="text-sm font-medium">Custom prompt</p>
                    <p className="text-xs text-muted-foreground">
                      Use one explicit prompt and let the system enforce the final typed contract.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="planner-prompt">
                {promptMode === "auto" ? "Extra Guidance" : "Custom Prompt"}
              </Label>
              <Textarea
                id="planner-prompt"
                rows={6}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={
                  promptMode === "auto"
                    ? "Optional. Add operator guidance that should influence the planner."
                    : `Describe how to determine the "${selectedTargetColumn?.displayName ?? "target"}" value for each row.`
                }
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="planner-profile">Agent Profile Override</Label>
                <Select
                  value={agentProfileOverride || "recommended"}
                  onValueChange={(value) =>
                    setAgentProfileOverride(value === "recommended" ? "" : value)
                  }
                >
                  <SelectTrigger id="planner-profile">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recommended">Use planner recommendation</SelectItem>
                    {profiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="batch-size">Batch Size</Label>
                <Input
                  id="batch-size"
                  inputMode="numeric"
                  value={batchSize}
                  onChange={(event) => setBatchSize(event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="surface-card rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">Plan Preview</h3>
                <p className="text-xs text-muted-foreground">
                  Strategy, contract, and row estimate before launch.
                </p>
              </div>
              <Button onClick={handlePreview} disabled={previewing}>
                {previewing ? "Planning…" : "Preview Plan"}
              </Button>
            </div>

            {!preview ? (
              <p className="text-sm text-muted-foreground">
                Preview the plan to inspect the strategy, generated prompts, and typed writeback contract.
              </p>
            ) : (
              <div className="space-y-4">
                {previewIsStale && (
                  <div className="rounded-lg border border-status-warning bg-status-warning/10 px-3 py-2 text-xs text-foreground">
                    Inputs changed after the last preview. Refresh the plan before launching.
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge>{preview.strategy}</Badge>
                  <Badge variant="outline">{preview.agentProfile}</Badge>
                  <Badge variant="outline">{preview.eligibleRowCount} eligible rows</Badge>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Planner reasoning
                  </p>
                  <p className="text-sm">{preview.reasoning}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Output contract
                  </p>
                  <div className="surface-control rounded-lg border p-3 space-y-1">
                    <p className="text-sm font-medium">
                      {preview.targetContract.columnLabel} · {preview.targetContract.dataType}
                    </p>
                    {preview.targetContract.allowedOptions?.length ? (
                      <p className="text-xs text-muted-foreground">
                        Allowed options: {preview.targetContract.allowedOptions.join(", ")}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Final step must return a typed value or NOT_FOUND.
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  {preview.steps.map((step) => (
                    <div key={step.id} className="surface-control rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{step.name}</p>
                          <p className="text-xs text-muted-foreground">{step.purpose}</p>
                        </div>
                        {step.agentProfile && (
                          <Badge variant="outline">{step.agentProfile}</Badge>
                        )}
                      </div>
                      <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono">
                        {step.prompt}
                      </pre>
                    </div>
                  ))}
                </div>

                {preview.sampleBindings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Sample row bindings
                    </p>
                    <pre className="surface-control rounded-lg border p-3 text-xs overflow-x-auto">
                      {JSON.stringify(preview.sampleBindings, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <SheetFooter className="px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleLaunch} disabled={!preview || previewIsStale || launching}>
            {launching ? "Launching…" : "Launch Enrichment"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function coerceFilterValue(value: string): string | number | boolean {
  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && value.trim() !== "") {
    return numeric;
  }
  return value;
}
