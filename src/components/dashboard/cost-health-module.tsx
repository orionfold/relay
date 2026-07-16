import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { DonutRing } from "@/components/charts/donut-ring";

export function CostHealthModule({
  runs,
  unknownPricingRuns,
}: {
  costMicros: number;
  runs: number;
  unknownPricingRuns: number;
}) {
  const hasRuns = runs > 0;
  const pricedRuns = Math.max(0, runs - unknownPricingRuns);
  const coverage = hasRuns ? Math.round((pricedRuns / runs) * 100) : 0;

  return (
    <div className="surface-card-muted flex items-center gap-3 rounded-md border p-3">
      <DonutRing
        value={coverage}
        size={48}
        strokeWidth={4}
        color={
          !hasRuns
            ? "var(--muted-foreground)"
            : unknownPricingRuns > 0
              ? "var(--status-warning)"
              : "var(--status-completed)"
        }
        label={
          hasRuns
            ? `${coverage}% of run receipts have complete pricing`
            : "No pricing coverage available"
        }
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {hasRuns ? `${coverage}% priced` : "No usage receipts yet"}
        </p>
        <p className="text-xs text-muted-foreground">
          {!hasRuns
            ? "Coverage appears after the first metered run"
            : unknownPricingRuns > 0
            ? `${unknownPricingRuns.toLocaleString()} of ${runs.toLocaleString()} receipts need pricing`
            : `${runs.toLocaleString()} run receipts are complete`}
        </p>
      </div>
    </div>
  );
}

export function RuntimeHealthModule({
  configured,
  unconfigured,
}: {
  configured: number;
  unconfigured: number;
}) {
  const total = configured + unconfigured;
  const hasProviders = total > 0;
  const readiness = hasProviders ? Math.round((configured / total) * 100) : 0;
  const Icon = !hasProviders
    ? CircleDashed
    : unconfigured > 0
      ? AlertTriangle
      : CheckCircle2;

  return (
    <div className="surface-card-muted flex items-center gap-3 rounded-md border p-3">
      <DonutRing
        value={readiness}
        size={48}
        strokeWidth={4}
        color={
          !hasProviders
            ? "var(--muted-foreground)"
            : unconfigured > 0
              ? "var(--status-warning)"
              : "var(--status-completed)"
        }
        label={
          hasProviders
            ? `${readiness}% of detected providers are ready`
            : "No model providers detected"
        }
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Icon
            className={
              !hasProviders
                ? "h-4 w-4 text-muted-foreground"
                : unconfigured > 0
                  ? "h-4 w-4 text-status-warning"
                  : "h-4 w-4 text-status-completed"
            }
            aria-hidden="true"
          />
          {!hasProviders
            ? "No providers detected"
            : unconfigured > 0
              ? `${unconfigured} need setup`
              : "All providers ready"}
        </p>
        <p className="text-xs text-muted-foreground">
          {hasProviders
            ? `${readiness}% readiness across detected providers`
            : "Provider readiness appears after environment discovery"}
        </p>
      </div>
    </div>
  );
}
