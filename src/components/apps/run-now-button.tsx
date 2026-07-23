"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { RunNowSheet } from "./run-now-sheet";
import { toastDraftCreated, toastRunStarted } from "./run-now-toast";
import {
  instantiateAndMaybeExecute,
  needsRuntimeSetup,
} from "./run-now-actions";
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
  /** Show evidence-backed readiness next to this blueprint's controls. */
  showReadiness?: boolean;
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
  showReadiness = true,
}: RunNowButtonProps) {
  const [pending, setPending] = useState<"run" | "create" | null>(null);
  const actionClaimed = useRef(false);
  const [readiness, setReadiness] = useState<{
    state: "checking" | "ready" | "blocked";
    message?: string;
  }>({ state: "checking" });

  const refreshReadiness = useCallback(async () => {
    if (!blueprintId) return;
    setReadiness((current) =>
      current.state === "ready" ? current : { state: "checking" },
    );
    try {
      const response = await fetch(`/api/blueprints/${blueprintId}/readiness`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        ready?: boolean;
        message?: string;
      };
      setReadiness(
        response.ok && body.ready
          ? { state: "ready" }
          : {
              state: "blocked",
              message: body.message ?? "Connect an eligible runtime to run this blueprint.",
            },
      );
    } catch (error) {
      setReadiness({
        state: "blocked",
        message:
          error instanceof Error
            ? error.message
            : "Runtime readiness could not be checked.",
      });
    }
  }, [blueprintId]);

  useEffect(() => {
    void refreshReadiness();
    const refresh = () => void refreshReadiness();
    window.addEventListener("focus", refresh);
    window.addEventListener("relay:runtime-readiness-changed", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("relay:runtime-readiness-changed", refresh);
    };
  }, [refreshReadiness]);

  if (!blueprintId) return null;

  // Delegate to the sheet when the blueprint declares variables — it collects
  // inputs, then runs or creates per the button the user pressed.
  if (variables && variables.length > 0) {
    const triggerClassName = compact ? "h-6 gap-1 px-1.5 text-[11px]" : undefined;
    return (
      <div className={cn("flex items-center", compact ? "gap-1" : "flex-wrap gap-2")}>
        {showReadiness && <ReadinessBadge readiness={readiness} />}
        <RunNowSheet
          blueprintId={blueprintId}
          variables={variables}
          label={label}
          mode="run"
          triggerClassName={triggerClassName}
          disabled={readiness.state !== "ready"}
          disabledReason={readiness.message ?? "Checking runtime readiness…"}
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
    if (!blueprintId || actionClaimed.current) return;
    if (mode === "run" && readiness.state !== "ready") {
      toast.error(readiness.message ?? "Connect an eligible runtime before starting this run.");
      return;
    }
    actionClaimed.current = true;
    setPending(mode);
    try {
      const result = await instantiateAndMaybeExecute(blueprintId, {}, mode);
      if (!result.ok) {
        toast.error(result.error, {
          ...(needsRuntimeSetup(result)
            ? {
                action: (
                  <Link href="/settings#settings-providers-runtimes">
                    Open runtime settings
                  </Link>
                ),
              }
            : {}),
        });
        return;
      }
      if (mode === "run") toastRunStarted(result.workflowId);
      else toastDraftCreated(result.workflowId);
    } finally {
      actionClaimed.current = false;
      setPending(null);
    }
  }

  return (
    <div className={cn("flex items-center", compact ? "gap-1" : "flex-wrap gap-2")}>
      {showReadiness && <ReadinessBadge readiness={readiness} />}
      <Button
        type="button"
        size="sm"
        onClick={() => act("run")}
        disabled={pending !== null || readiness.state !== "ready"}
        title={
          readiness.state === "ready"
            ? undefined
            : readiness.message ?? "Checking runtime readiness…"
        }
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

function ReadinessBadge({
  readiness,
}: {
  readiness: { state: "checking" | "ready" | "blocked"; message?: string };
}) {
  if (readiness.state === "blocked") {
    return (
      <Link
        href="/settings#settings-providers-runtimes"
        className="inline-flex h-5 shrink-0 items-center rounded-md border px-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title={readiness.message}
        aria-label="Set up a runtime for this blueprint"
      >
        Setup needed
      </Link>
    );
  }
  return (
    <Badge
      variant="outline"
      className="h-5 shrink-0 px-1.5 text-[11px] font-medium"
      title={readiness.message}
    >
      {readiness.state === "ready" ? "Ready" : "Checking…"}
    </Badge>
  );
}
