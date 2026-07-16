import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { WorkshopRunView } from "@/lib/workshop/runs";

export function WorkshopProgressModule({ run }: { run: WorkshopRunView }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Relay Operator Workshop</p>
          <p className="text-xs text-muted-foreground">
            {run.completedCount}/{run.requiredCount} checkpoints · {run.status}
          </p>
        </div>
        <CheckCircle2 className="h-5 w-5 text-primary" />
      </div>
      <Progress value={(run.completedCount / run.requiredCount) * 100} />
      <Link
        href="/workshop"
        className="inline-flex text-xs text-primary underline underline-offset-2"
      >
        Continue workshop
      </Link>
    </div>
  );
}
