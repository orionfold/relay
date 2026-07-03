"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Calendar } from "lucide-react";
import { toast } from "sonner";
import { ScheduleForm, type ScheduleFormValues } from "./schedule-form";
import type { CronCollisionWarning } from "@/lib/schedules/collision-check";

interface ScheduleCreateSheetProps {
  projects: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function ScheduleCreateSheet({
  projects,
  open,
  onOpenChange,
  onCreated,
}: ScheduleCreateSheetProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<CronCollisionWarning[]>([]);

  async function handleSubmit(values: ScheduleFormValues) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          prompt: values.prompt || undefined,
          interval: values.interval,
          projectId: values.projectId || undefined,
          assignedAgent: values.assignedAgent || undefined,
          agentProfile: values.agentProfile || undefined,
          recurs: values.recurs,
          maxFirings: values.maxFirings || undefined,
          expiresInHours: values.expiresInHours || undefined,
          type: values.type,
          ...(values.type === "heartbeat" && {
            heartbeatChecklist: values.heartbeatChecklist,
            activeHoursStart: values.activeHoursStart || undefined,
            activeHoursEnd: values.activeHoursEnd || undefined,
            activeTimezone: values.activeTimezone || undefined,
            heartbeatBudgetPerDay: values.heartbeatBudgetPerDay || undefined,
          }),
        }),
      });

      if (res.ok) {
        const { warnings: newWarnings } = await res.json();
        setError(null);
        setWarnings(newWarnings ?? []);
        toast.success("Schedule created");
        onCreated();
        if (!newWarnings || newWarnings.length === 0) {
          onOpenChange(false);
        }
        // Keep sheet open if there are warnings so the user sees the banner
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <SheetTitle>Create Schedule</SheetTitle>
          </div>
          <SheetDescription>
            Define when the agent should run, what it should do, and which
            project context it should use.
          </SheetDescription>
        </SheetHeader>

        {/* Body — px-6 pb-6 per project convention (SheetContent has NO body padding) */}
        <div className="px-6 pb-6 overflow-y-auto">
          {warnings.length > 0 && (
            <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">
                Overlap detected with: {warnings[0].overlappingSchedules.join(", ")}
              </p>
              <p className="text-amber-800">
                Combined load: ~{warnings[0].estimatedConcurrentSteps} agent steps.
                Schedules will take turns; the last to run may be delayed.
              </p>
            </div>
          )}
          <ScheduleForm
            projects={projects}
            onSubmit={handleSubmit}
            submitLabel="Create Schedule"
            loading={loading}
            error={error}
            onError={setError}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
