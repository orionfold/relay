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
import { toastDraftCreated } from "./run-now-toast";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";

interface RunNowSheetProps {
  blueprintId: string;
  variables: BlueprintVariable[];
  label?: string;
}

/**
 * Run-now sheet for blueprints that declare input variables. Renders a
 * VariableInput per variable, runs client-side `validateVariables` before
 * submit, and POSTs `{ variables }` to `/api/blueprints/{id}/instantiate`.
 *
 * Error contract: API responses with status 400 and a `{ field, message }`
 * body surface as inline field-level errors; everything else falls back to
 * a toast. Inputs are preserved on any failure so the user can correct and
 * retry.
 */
export function RunNowSheet({
  blueprintId,
  variables,
  label = "Run now",
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
      const res = await fetch(`/api/blueprints/${blueprintId}/instantiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: values }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          field?: string;
          message?: string;
          error?: string;
        };
        if (res.status === 400 && body.field && body.message) {
          setErrors({ [body.field]: body.message });
        } else {
          toast.error(body.error ?? body.message ?? `Failed (${res.status})`);
        }
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        workflowId?: string;
      };
      toastDraftCreated(body.workflowId);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create draft");
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" className="gap-1.5">
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
            {pending ? "Starting…" : "Start run"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
