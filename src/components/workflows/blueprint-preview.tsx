"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { patternLabels } from "@/lib/constants/status-colors";
import { IconCircle, getWorkflowIconFromName } from "@/lib/constants/card-icons";
import type { WorkflowBlueprint } from "@/lib/workflows/blueprints/types";
import { VariableInput } from "./variable-input";
import { blueprintApiPath } from "@/lib/routing/primitive-paths";

interface BlueprintPreviewProps {
  blueprint: WorkflowBlueprint;
  projects: { id: string; name: string }[];
}

export function BlueprintPreview({
  blueprint,
  projects,
}: BlueprintPreviewProps) {
  const router = useRouter();
  const [variables, setVariables] = useState<Record<string, unknown>>(() => {
    const defaults: Record<string, unknown> = {};
    for (const v of blueprint.variables) {
      if (v.default !== undefined) defaults[v.id] = v.default;
    }
    return defaults;
  });
  const [projectId, setProjectId] = useState<string>("none");
  const [submitting, setSubmitting] = useState(false);

  function setVar(id: string, value: unknown) {
    setVariables((prev) => ({ ...prev, [id]: value }));
  }

  async function handleCreate() {
    setSubmitting(true);
    try {
      const res = await fetch(blueprintApiPath(blueprint.id, "instantiate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variables,
          projectId: projectId !== "none" ? projectId : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create workflow");
        return;
      }

      toast.success(`Workflow created: ${data.name}`);
      router.push(`/workflows/${data.workflowId}`);
    } catch {
      toast.error("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <IconCircle
            icon={getWorkflowIconFromName(blueprint.name, blueprint.pattern).icon}
            colors={getWorkflowIconFromName(blueprint.name, blueprint.pattern).colors}
          />
          <h1 className="text-2xl font-bold tracking-tight">{blueprint.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{blueprint.description}</p>
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Badge variant={blueprint.domain === "work" ? "default" : "secondary"}>
            {blueprint.domain}
          </Badge>
          <Badge variant="outline">{patternLabels[blueprint.pattern] ?? blueprint.pattern}</Badge>
          {blueprint.estimatedDuration && (
            <Badge variant="outline">{blueprint.estimatedDuration}</Badge>
          )}
          {blueprint.difficulty && (
            <Badge variant="outline">{blueprint.difficulty}</Badge>
          )}
        </div>
      </div>

      {/* Step Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative space-y-3 pl-4 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-border">
            {blueprint.steps.map((step, i) => (
              <div key={i} className="relative flex items-start gap-3">
                <div className="absolute -left-4 top-1.5 h-2 w-2 rounded-full bg-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{step.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Profile: {step.profileId}
                    {step.requiresApproval && " · Requires approval"}
                    {step.condition && " · Conditional"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Variable Form */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Configure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Project selector */}
          <div className="space-y-1.5">
            <Label>Project (optional)</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="No project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic variables */}
          {blueprint.variables.map((v) => (
            <VariableInput
              key={v.id}
              variable={v}
              value={variables[v.id]}
              onChange={(val) => setVar(v.id, val)}
            />
          ))}

          {/* Create button */}
          <Button onClick={handleCreate} disabled={submitting} className="w-full mt-2">
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Create Workflow
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

