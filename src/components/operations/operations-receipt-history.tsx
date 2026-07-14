import Link from "next/link";
import {
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface OperationsReceiptHistoryItem {
  id: string;
  ownerType: "schedule" | "workflow";
  workflowId: string | null;
  taskId: string | null;
  workflowRunNumber: number | null;
  verdict: "passed" | "at_risk" | "failed";
  evidence: Array<{
    criterionId?: string;
    label?: string;
    level?: "required" | "advisory";
    check?: string;
    expected?: string | number;
    actual?: string | number | null;
    status?: "passed" | "failed" | "missing";
    detail?: string;
  }>;
  summary: string;
  nextAction: string;
  finishedAt: string | Date;
}

interface OperationsReceiptHistoryProps {
  receipts: OperationsReceiptHistoryItem[];
  reconciliationErrors?: string[];
}

const VERDICT = {
  passed: {
    label: "Passed",
    icon: CheckCircle2,
    badge: "success" as const,
    iconClass: "text-status-completed",
  },
  at_risk: {
    label: "At risk",
    icon: TriangleAlert,
    badge: "outline" as const,
    iconClass: "text-status-warning",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    badge: "destructive" as const,
    iconClass: "text-status-failed",
  },
};

export function OperationsReceiptHistory({
  receipts,
  reconciliationErrors = [],
}: OperationsReceiptHistoryProps) {
  return (
    <div className="space-y-2">
      {reconciliationErrors.length > 0 && (
        <div
          role="alert"
          className="flex gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 p-3 text-xs"
        >
          <CircleAlert className="h-4 w-4 shrink-0 text-status-warning" />
          <span>
            Some receipts could not be reconciled. Reopen this view after checking storage and database health.
          </span>
        </div>
      )}

      {receipts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No Operations Receipts yet. The next terminal run will record one.
        </div>
      ) : (
        <ol className="space-y-2" aria-label="Operations Receipt history">
          {receipts.map((receipt) => {
            const verdict = VERDICT[receipt.verdict];
            const Icon = verdict.icon;
            const sourceHref = receipt.taskId
              ? `/monitor?taskId=${receipt.taskId}`
              : receipt.workflowId
                ? `/workflows/${receipt.workflowId}`
                : null;
            return (
              <li key={receipt.id} className="surface-card-muted rounded-lg border p-3">
                <div className="flex min-w-0 items-start gap-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${verdict.iconClass}`} />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge
                        variant={verdict.badge}
                        className={
                          receipt.verdict === "at_risk"
                            ? "border-status-warning/40 text-status-warning"
                            : undefined
                        }
                      >
                        {verdict.label}
                      </Badge>
                      {receipt.workflowRunNumber !== null && (
                        <span className="text-xs text-muted-foreground">
                          Run {receipt.workflowRunNumber}
                        </span>
                      )}
                      <time className="text-xs text-muted-foreground">
                        {new Date(receipt.finishedAt).toLocaleString()}
                      </time>
                    </div>
                    <p className="text-sm">{receipt.summary}</p>
                    <p className="text-xs text-muted-foreground">
                      Next action: {receipt.nextAction}
                    </p>
                  </div>
                  {sourceHref && (
                    <Button asChild variant="ghost" size="icon-sm">
                      <Link href={sourceHref} aria-label="Open receipt source diagnostics">
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>

                {receipt.evidence.length > 0 && (
                  <details className="mt-2 border-t pt-2">
                    <summary className="text-xs font-medium focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                      Evidence ({receipt.evidence.length})
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {receipt.evidence.map((item, index) => (
                        <li key={item.criterionId ?? index} className="text-xs">
                          <p className="font-medium">
                            {item.label ?? "Receipt evaluation"}
                            {item.level ? ` · ${item.level}` : ""}
                            {item.status ? ` · ${item.status}` : ""}
                          </p>
                          {(item.expected !== undefined || item.actual !== undefined) && (
                            <p className="text-muted-foreground">
                              Expected: {String(item.expected ?? "—")} · Observed:{" "}
                              {item.actual === null || item.actual === undefined
                                ? "unavailable"
                                : String(item.actual)}
                            </p>
                          )}
                          <p className="text-muted-foreground">
                            {item.detail ?? "No evidence detail"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
