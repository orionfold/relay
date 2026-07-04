"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { VariableInput } from "@/components/workflows/variable-input";
import { validateVariables } from "@/lib/workflows/blueprints/validate-variables";
import { toastDraftCreated, toastRunStarted } from "./run-now-toast";
import { instantiateAndMaybeExecute, type RunNowMode } from "./run-now-actions";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";

interface RunNowSheetProps {
  blueprintId: string;
  variables: BlueprintVariable[];
  label?: string;
  /** "run" (instantiate+execute) or "create" (draft only). Default "run". */
  mode?: RunNowMode;
  /** Button variant for the trigger — "outline" for the secondary Create verb. */
  buttonVariant?: "default" | "outline";
}

/**
 * Run-now sheet for blueprints that declare input variables. Renders a
 * VariableInput per variable, runs client-side `validateVariables` before
 * submit, then instantiates (and, in "run" mode, executes) via the shared
 * `instantiateAndMaybeExecute` helper so the two verbs match the non-variable
 * card exactly.
 *
 * Inputs are preserved on any failure so the user can correct and retry;
 * client-side validation errors surface inline, request failures as a toast.
 */
export function RunNowSheet({
  blueprintId,
  variables,
  label = "Run",
  mode = "run",
  buttonVariant = "default",
}: RunNowSheetProps) {
  const [open, setOpen] = useState(false);
  const initialValues = Object.fromEntries(
    variables.map((v) => [
      v.id,
      v.default ?? (v.type === "boolean" ? false : ""),
    ])
  );
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    const validation = validateVariables(values, variables);
    if (Object.keys(validation.errors).length > 0) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const result = await instantiateAndMaybeExecute(blueprintId, values, mode);
      if (!result.ok) {
        // A field-level validation error surfaces inline next to the input;
        // everything else falls back to a toast.
        if (result.field) setErrors({ [result.field]: result.error });
        else toast.error(result.error);
        return;
      }
      if (mode === "run") toastRunStarted(result.workflowId);
      else toastDraftCreated(result.workflowId);
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant={buttonVariant} className="gap-1.5">
          <Play className="h-3.5 w-3.5" />
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{label}</SheetTitle>
        </SheetHeader>
        <div className="px-6 pb-6 space-y-4 overflow-y-auto">
          {variables.map((v) => (
            <div key={v.id} className="space-y-1">
              <VariableInput
                variable={v}
                value={values[v.id]}
                onChange={(val) =>
                  setValues((prev) => ({ ...prev, [v.id]: val }))
                }
              />
              {errors[v.id] && (
                <p className="text-xs text-destructive">{errors[v.id]}</p>
              )}
            </div>
          ))}
          <Button
            onClick={handleSubmit}
            disabled={pending}
            className="w-full"
          >
            {pending
              ? mode === "run"
                ? "Starting…"
                : "Creating…"
              : mode === "run"
                ? "Start run"
                : "Create workflow"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
