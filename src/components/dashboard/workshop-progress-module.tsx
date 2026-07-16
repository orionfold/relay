import Link from "next/link";
import { DonutRing } from "@/components/charts/donut-ring";
import type { WorkshopRunView } from "@/lib/workshop/runs";

export function WorkshopProgressModule({ run }: { run: WorkshopRunView }) {
  const progress = run.requiredCount > 0
    ? Math.round((run.completedCount / run.requiredCount) * 100)
    : 0;

  return (
    <div className="surface-card-muted flex items-center gap-3 rounded-md border p-3">
      <DonutRing
        value={progress}
        size={48}
        strokeWidth={4}
        label={`${run.completedCount} of ${run.requiredCount} workshop checkpoints complete`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium capitalize">
          {run.status.replaceAll("_", " ")}
        </p>
        <p className="text-xs text-muted-foreground">
          {run.completedCount}/{run.requiredCount} checkpoints · {progress}%
        </p>
        <Link
          href="/workshop"
          className="mt-1.5 inline-flex text-xs text-primary underline underline-offset-2"
        >
          Continue workshop
        </Link>
      </div>
    </div>
  );
}
