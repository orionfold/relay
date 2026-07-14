import { Badge } from "@/components/ui/badge";
import type { BudgetPolicyHealth } from "@/lib/schedules/budget-policies";

const styles: Record<BudgetPolicyHealth | "none", string> = {
  none: "text-muted-foreground",
  disabled: "text-muted-foreground",
  ok: "border-status-completed/30 bg-status-completed/10 text-status-completed",
  warning: "border-status-warning/30 bg-status-warning/10 text-status-warning",
  blocked: "border-status-failed/30 bg-status-failed/10 text-status-failed",
  unavailable: "border-status-warning/30 bg-status-warning/10 text-status-warning",
};

const labels: Record<BudgetPolicyHealth | "none", string> = {
  none: "No policy",
  disabled: "Disabled",
  ok: "Within budget",
  warning: "Near limit",
  blocked: "Limit reached",
  unavailable: "Cost unavailable",
};

export function BudgetPolicyStatusBadge({
  health,
}: {
  health: BudgetPolicyHealth | "none";
}) {
  return (
    <Badge variant="outline" className={styles[health]}>
      {labels[health]}
    </Badge>
  );
}
