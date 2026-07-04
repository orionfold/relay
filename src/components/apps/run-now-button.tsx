"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { RunNowSheet } from "./run-now-sheet";
import { toastDraftCreated } from "./run-now-toast";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";

interface RunNowButtonProps {
  blueprintId: string | null | undefined;
  /**
   * If the blueprint declares input variables, the button delegates to
   * `RunNowSheet` which collects values via an inline form before posting.
   * When null/undefined/empty, the Phase 2 direct-POST behavior is used.
   */
  variables?: BlueprintVariable[] | null;
  /**
   * Defaults to a label of "Run now". Tracker uses the default; future kits
   * may pass a domain-specific label like "Synthesize now".
   */
  label?: string;
}

/**
 * Posts to the blueprint instantiate endpoint with empty variables when the
 * blueprint declares no inputs. When `variables` is non-empty, delegates to
 * `RunNowSheet` so the user can fill in the inputs before the request.
 *
 * Phase 2 contract preserved: with no/empty `variables`, this behaves exactly
 * like the previous direct-POST button — clicking issues the instantiate POST
 * and toasts the result.
 */
export function RunNowButton({
  blueprintId,
  variables,
  label = "Run now",
}: RunNowButtonProps) {
  const [pending, setPending] = useState(false);

  if (!blueprintId) return null;

  // Delegate to sheet when blueprint declares variables
  if (variables && variables.length > 0) {
    return (
      <RunNowSheet
        blueprintId={blueprintId}
        variables={variables}
        label={label}
      />
    );
  }

  // Fallback: direct POST (existing Phase 2 behavior)
  async function handleClick() {
    if (!blueprintId) return;
    setPending(true);
    try {
      const res = await fetch(`/api/blueprints/${blueprintId}/instantiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: {} }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error ?? `Failed to create draft (${res.status})`);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        workflowId?: string;
      };
      toastDraftCreated(body.workflowId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create draft");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className="gap-1.5"
    >
      <Play className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
