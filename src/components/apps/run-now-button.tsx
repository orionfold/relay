"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play, FilePlus } from "lucide-react";
import { toast } from "sonner";
import { RunNowSheet } from "./run-now-sheet";
import { toastDraftCreated, toastRunStarted } from "./run-now-toast";
import { instantiateAndMaybeExecute } from "./run-now-actions";
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
}: RunNowButtonProps) {
  const [pending, setPending] = useState<"run" | "create" | null>(null);

  if (!blueprintId) return null;

  // Delegate to the sheet when the blueprint declares variables — it collects
  // inputs, then runs or creates per the button the user pressed.
  if (variables && variables.length > 0) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <RunNowSheet
          blueprintId={blueprintId}
          variables={variables}
          label={label}
          mode="run"
        />
        <RunNowSheet
          blueprintId={blueprintId}
          variables={variables}
          label="Create workflow"
          mode="create"
          buttonVariant="outline"
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
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        onClick={() => act("run")}
        disabled={pending !== null}
        className="gap-1.5"
      >
        <Play className="h-3.5 w-3.5" />
        {label}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => act("create")}
        disabled={pending !== null}
        className="gap-1.5"
      >
        <FilePlus className="h-3.5 w-3.5" />
        Create workflow
      </Button>
    </div>
  );
}
