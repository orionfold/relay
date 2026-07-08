"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { RunNowSheet } from "./run-now-sheet";
import { toastDraftCreated, toastRunStarted } from "./run-now-toast";
import { instantiateAndMaybeExecute } from "./run-now-actions";
import { cn } from "@/lib/utils";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";

interface RunNowButtonProps {
  blueprintId: string | null | undefined;
  /**
   * If the blueprint declares input variables, the buttons delegate to
   * `RunNowSheet` which collects values via an inline form before posting.
   * When null/undefined/empty, the direct-POST path is used.
   */
  variables?: BlueprintVariable[] | null;
  /**
   * Label for the primary Run button. Defaults to "Run". Kits may pass a
   * domain-specific verb; the secondary "Create workflow" button is fixed.
   */
  label?: string;
  /** Compact button treatment for card status toolbars. */
  compact?: boolean;
}

/**
 * FEAT-6: two explicit verbs on a runnable blueprint card.
 *  - **Run** — instantiate THEN execute, so the workflow genuinely dispatches
 *    (resolves BUG-4's mislabeled draft-only button). Engine-adjacent.
 *  - **Create workflow** — instantiate only, leaving a draft to review/Execute
 *    later from /workflows.
 *
 * When the blueprint declares variables, both verbs route through
 * `RunNowSheet` (which collects inputs first) via its `mode`.
 */
export function RunNowButton({
  blueprintId,
  variables,
  label = "Run",
  compact = false,
}: RunNowButtonProps) {
  const [pending, setPending] = useState<"run" | "create" | null>(null);

  if (!blueprintId) return null;

  // Delegate to the sheet when the blueprint declares variables — it collects
  // inputs, then runs or creates per the button the user pressed.
  if (variables && variables.length > 0) {
    const triggerClassName = compact ? "h-6 gap-1 px-1.5 text-[11px]" : undefined;
    return (
      <div className={cn("flex items-center", compact ? "gap-1" : "flex-wrap gap-2")}>
        <RunNowSheet
          blueprintId={blueprintId}
          variables={variables}
          label={label}
          mode="run"
          triggerClassName={triggerClassName}
        />
        <RunNowSheet
          blueprintId={blueprintId}
          variables={variables}
          label={compact ? "Create" : "Create workflow"}
          mode="create"
          buttonVariant="outline"
          triggerClassName={triggerClassName}
        />
      </div>
    );
  }

  async function act(mode: "run" | "create") {
    if (!blueprintId) return;
    setPending(mode);
    try {
      const result = await instantiateAndMaybeExecute(blueprintId, {}, mode);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (mode === "run") toastRunStarted(result.workflowId);
      else toastDraftCreated(result.workflowId);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={cn("flex items-center", compact ? "gap-1" : "flex-wrap gap-2")}>
      <Button
        type="button"
        size="sm"
        onClick={() => act("run")}
        disabled={pending !== null}
        className={cn("gap-1.5", compact && "h-6 gap-1 px-1.5 text-[11px]")}
      >
        <Play className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
        {label}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => act("create")}
        disabled={pending !== null}
        aria-label="Create workflow"
        className={cn("gap-1.5", compact && "h-6 gap-1 px-1.5 text-[11px]")}
      >
        <Plus className={cn("h-3.5 w-3.5", compact && "h-3 w-3")} />
        {compact ? "Create" : "Create workflow"}
      </Button>
    </div>
  );
}
