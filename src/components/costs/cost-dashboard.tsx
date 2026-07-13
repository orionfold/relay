import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarRange,
  Coins,
  ShieldAlert,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type {
  UsageAuditEntry,
  ProviderModelBreakdownEntry,
  UsageCompleteness,
} from "@/lib/usage/ledger";
import type { BudgetWindowStatus } from "@/lib/settings/budget-guardrails";
import type { RuntimeSetupState } from "@/lib/settings/runtime-setup";
import type { PricingRegistrySnapshot } from "@/lib/usage/pricing-registry";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DonutRing } from "@/components/charts/donut-ring";
import { MiniBar } from "@/components/charts/mini-bar";
import { Sparkline } from "@/components/charts/sparkline";
import { SectionHeading } from "@/components/shared/section-heading";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { CostFilters } from "@/components/costs/cost-filters";
import { PricingRegistryPanel } from "@/components/settings/pricing-registry-panel";

interface CostSummary {
  monthSpendMicros: number;
  monthSpendCompleteness: UsageCompleteness;
  derivedDailyBudgetMicros: number;
  remainingMonthlyHeadroomMicros: number;
  monthTokens: number;
}

interface RuntimeBreakdownRow {
  runtimeId: string;
  label: string;
  providerId: string;
  costMicros: number;
  totalTokens: number;
  runs: number;
  share: number;
  unknownPricingRuns: number;
}

interface TrendSeries {
  spend7: number[];
  spend30: number[];
  tokens7: number[];
  tokens30: number[];
}

interface FilterState {
  dateRange: string;
  runtimeId: string;
  status: string;
  activityType: string;
}

interface CostDashboardProps {
  filters: FilterState;
  summary: CostSummary;
  trendSeries: TrendSeries;
  budgetStatuses: Array<BudgetWindowStatus & { resetAtIso: string }>;
  runtimeStates: Record<string, RuntimeSetupState>;
  pricing: PricingRegistrySnapshot;
  runtimeBreakdown: RuntimeBreakdownRow[];
  modelBreakdown: ProviderModelBreakdownEntry[];
  auditEntries: UsageAuditEntry[];
}

function formatCurrencyMicros(value: number | null | undefined) {
  const amount = value ?? 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: amount >= 1_000_000 ? 2 : 4,
  }).format(amount / 1_000_000);
}

function formatTokenCount(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatCompactCount(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDateRangeLabel(range: string) {
  switch (range) {
    case "7d":
      return "Last 7 days";
    case "90d":
      return "Last 90 days";
    case "all":
      return "All time";
    default:
      return "Last 30 days";
  }
}

function formatActivityLabel(value: UsageAuditEntry["activityType"]) {
  switch (value) {
    case "task_run":
      return "Task run";
    case "task_resume":
      return "Task resume";
    case "workflow_step":
      return "Workflow step";
    case "scheduled_firing":
      return "Scheduled firing";
    case "task_assist":
      return "Task assist";
    case "profile_test":
      return "Profile test";
    case "pattern_extraction":
      return "Pattern extraction";
    case "context_summarization":
      return "Context summarization";
    default:
      return (value as string)
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
  }
}

function statusBadge(status: UsageAuditEntry["status"]) {
  switch (status) {
    case "completed":
      return <Badge variant="success">Completed</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "blocked":
      return (
        <Badge
          variant="outline"
          className="border-status-warning/30 bg-status-warning/10 text-status-warning"
        >
          Blocked
        </Badge>
      );
    case "unknown_pricing":
      return <Badge variant="secondary">Pricing unavailable</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Cancelled</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function renderEntityLink(entry: UsageAuditEntry) {
  if (entry.taskId && entry.taskTitle) {
    return (
      <Link href={`/tasks/${entry.taskId}`} className="font-medium hover:underline">
        {entry.taskTitle}
      </Link>
    );
  }
  if (entry.workflowId && entry.workflowName) {
    return (
      <Link
        href={`/workflows/${entry.workflowId}`}
        className="font-medium hover:underline"
      >
        {entry.workflowName}
      </Link>
    );
  }
  if (entry.scheduleId && entry.scheduleName) {
    return (
      <Link
        href={`/schedules/${entry.scheduleId}`}
        className="font-medium hover:underline"
      >
        {entry.scheduleName}
      </Link>
    );
  }

  return <span className="font-medium">{formatActivityLabel(entry.activityType)}</span>;
}

function SummaryCard({
  eyebrow,
  title,
  value,
  detail,
  icon: Icon,
}: {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  icon: typeof Wallet;
}) {
  return (
    <div className="surface-card rounded-xl p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
        </div>
        <div className="surface-card-muted rounded-lg p-2.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function getStatus(
  statuses: Array<BudgetWindowStatus & { resetAtIso: string }>,
  scopeId: string,
  window: "daily" | "monthly"
) {
  return statuses.find(
    (status) => status.scopeId === scopeId && status.window === window
  );
}

export function CostDashboard({
  filters,
  summary,
  trendSeries,
  budgetStatuses,
  runtimeStates,
  pricing,
  runtimeBreakdown,
  modelBreakdown,
  auditEntries,
}: CostDashboardProps) {
  const configuredRuntimes = Object.values(runtimeStates).filter((runtime) => runtime.configured);
  const warnings = budgetStatuses.filter((status) => status.health === "warning");
  const blocked = budgetStatuses.filter((status) => status.health === "blocked");
  const hasUsage =
    summary.monthSpendMicros > 0 ||
    summary.monthTokens > 0 ||
    modelBreakdown.length > 0 ||
    auditEntries.length > 0;
  const filteredUnknownPricingRuns = modelBreakdown.reduce(
    (total, row) => total + row.unknownPricingRuns,
    0
  );
  const activeMixLabel =
    configuredRuntimes.length === 0
      ? "No providers configured"
      : configuredRuntimes.length === 1
        ? configuredRuntimes[0]!.label
        : configuredRuntimes.map((runtime) => runtime.label).join(" + ");
  const dominantRuntime = runtimeBreakdown[0] ?? null;
  const hasIncompleteAccounting = summary.monthSpendCompleteness !== "complete";
  const pacingTone =
    blocked.length > 0
      ? "blocked"
      : warnings.length > 0 || hasIncompleteAccounting
        ? "warning"
        : "healthy";
  const overallMonthly = getStatus(budgetStatuses, "overall", "monthly");

  return (
    <div className="flex flex-col gap-6">
      <CostFilters
        dateRange={filters.dateRange}
        runtimeId={filters.runtimeId}
        status={filters.status}
        activityType={filters.activityType}
        runtimeOptions={configuredRuntimes.map((runtime) => ({
          id: runtime.runtimeId,
          label: runtime.label,
        }))}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard
          eyebrow="Month"
          title={hasIncompleteAccounting ? "Known Spend" : "Spend"}
          value={formatCurrencyMicros(summary.monthSpendMicros)}
          detail={
            hasIncompleteAccounting
              ? "Known minimum; one or more runtime receipts are incomplete"
              : "Metered runtime spend for the current month"
          }
          icon={Wallet}
        />
        <SummaryCard
          eyebrow="Derived"
          title="Daily Budget"
          value={formatCurrencyMicros(summary.derivedDailyBudgetMicros)}
          detail="Calculated from the monthly cap"
          icon={CalendarRange}
        />
        <SummaryCard
          eyebrow="Remaining"
          title="Monthly Headroom"
          value={formatCurrencyMicros(summary.remainingMonthlyHeadroomMicros)}
          detail="Spend left before the monthly cap"
          icon={ShieldCheck}
        />
        <SummaryCard
          eyebrow="Providers"
          title="Active Mix"
          value={configuredRuntimes.length === 0 ? "None" : String(configuredRuntimes.length)}
          detail={activeMixLabel}
          icon={ArrowRight}
        />
        <SummaryCard
          eyebrow="Pricing"
          title="Freshness"
          value={pricing.stale ? "Stale" : "Current"}
          detail={
            pricing.lastUpdatedIso
              ? `Updated ${formatDateTime(pricing.lastUpdatedIso)}`
              : "No refresh recorded yet"
          }
          icon={CalendarClock}
        />
      </div>

      <div
        className={`surface-card rounded-xl p-5 ${
          pacingTone === "blocked"
            ? "border border-status-failed/25 bg-status-failed/8"
            : pacingTone === "warning"
              ? "border border-status-warning/25 bg-status-warning/8"
              : ""
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div
              className={`flex items-center gap-2 ${
                pacingTone === "blocked"
                  ? "text-status-failed"
                  : pacingTone === "warning"
                    ? "text-status-warning"
                    : "text-status-completed"
              }`}
            >
              {pacingTone === "blocked" ? (
                <ShieldAlert className="h-4 w-4" />
              ) : pacingTone === "warning" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              <p className="text-sm font-semibold">
                {pacingTone === "blocked"
                  ? "Budget pacing is blocked"
                  : hasIncompleteAccounting
                    ? "Budget pacing uses partial spend"
                    : pacingTone === "warning"
                    ? "Budget pacing is near a cap"
                    : "Budget pacing is on track"}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {pacingTone === "blocked"
                ? "One or more active spend windows have been exceeded. New paid work remains blocked until the affected window resets."
                : hasIncompleteAccounting
                  ? "Known spend is enforced, but actual spend may be higher until every runtime supplies a complete receipt. Review partial rows before relying on remaining headroom."
                  : pacingTone === "warning"
                  ? "A configured spend window is approaching its limit. Review the active provider mix before it becomes a hard stop."
                  : "Spend is within the configured pacing windows. Derived daily caps continue to roll forward from the monthly budget."}
            </p>
          </div>

          <div className="grid gap-2 lg:min-w-[340px]">
            <div className="surface-card-muted rounded-lg p-3">
              <p className="text-sm font-medium">Primary spend driver</p>
              <p className="text-xs text-muted-foreground">
                {dominantRuntime
                  ? `${dominantRuntime.label} represents ${formatPercent(
                      dominantRuntime.share
                    )} of filtered spend.`
                  : "No provider has recorded spend in the current filtered window."}
              </p>
            </div>
            {overallMonthly ? (
              <div className="surface-card-muted rounded-lg p-3">
                <p className="text-sm font-medium">
                  {formatCurrencyMicros(overallMonthly.currentValue)} of{" "}
                  {overallMonthly.limitValue == null
                    ? "Unlimited"
                    : formatCurrencyMicros(overallMonthly.limitValue)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Monthly reset {formatDateTime(overallMonthly.resetAtIso)}.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <PricingRegistryPanel
        initialSnapshot={pricing}
        showClaudePlans={runtimeStates["claude-code"]?.billingMode === "subscription"}
      />

      {hasUsage ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="surface-card rounded-xl p-5">
              <SectionHeading>Spend Trends</SectionHeading>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="surface-card-muted rounded-lg p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Spend velocity</p>
                      <p className="text-xs text-muted-foreground">
                        7-day and 30-day spend series
                      </p>
                    </div>
                    <Badge variant="outline">{formatCurrencyMicros(summary.monthSpendMicros)}</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border/50 bg-background p-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        7-day
                      </p>
                      <Sparkline
                        data={trendSeries.spend7}
                        width={160}
                        height={48}
                        color="var(--chart-1)"
                        label="7 day spend trend"
                        className="w-full"
                      />
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background p-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        30-day
                      </p>
                      <MiniBar
                        data={trendSeries.spend30.map((value) => ({
                          value,
                          color: "var(--chart-1)",
                        }))}
                        width={220}
                        height={48}
                        label="30 day spend trend"
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                <div className="surface-card-muted rounded-lg p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Activity tokens</p>
                      <p className="text-xs text-muted-foreground">
                        Secondary telemetry for the same window
                      </p>
                    </div>
                    <Badge variant="outline">{formatCompactCount(summary.monthTokens)} tokens</Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border/50 bg-background p-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        7-day
                      </p>
                      <Sparkline
                        data={trendSeries.tokens7}
                        width={160}
                        height={48}
                        color="var(--chart-1)"
                        label="7 day token trend"
                        className="w-full"
                      />
                    </div>
                    <div className="rounded-lg border border-border/50 bg-background p-3">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        30-day
                      </p>
                      <MiniBar
                        data={trendSeries.tokens30.map((value) => ({
                          value,
                          color: "var(--chart-1)",
                        }))}
                        width={220}
                        height={48}
                        label="30 day token trend"
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="surface-card rounded-xl p-5">
              <SectionHeading>
                {runtimeBreakdown.length <= 1 ? "Active Provider" : "Provider Breakdown"}
              </SectionHeading>
              <div className="space-y-3">
                {runtimeBreakdown.length > 0 ? (
                  runtimeBreakdown.map((runtime) => (
                    <div
                      key={runtime.runtimeId}
                      className="surface-card-muted flex items-center justify-between gap-4 rounded-lg p-4"
                    >
                      <div className="flex items-center gap-4">
                        {runtimeBreakdown.length > 1 ? (
                          <DonutRing
                            value={runtime.share}
                            size={44}
                            strokeWidth={4}
                            color="var(--chart-1)"
                            trackColor="var(--muted)"
                            label={`${runtime.label} share of spend`}
                          />
                        ) : (
                          <div className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm font-semibold">
                            {runtime.label}
                          </div>
                        )}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{runtime.label}</p>
                            <Badge variant="outline">{runtime.providerId}</Badge>
                            {runtimeStates[runtime.runtimeId]?.billingMode === "subscription" ? (
                              <Badge variant="secondary">Plan priced</Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {runtimeBreakdown.length > 1
                              ? `${formatPercent(runtime.share)} of filtered spend across ${runtime.runs} runs`
                              : `${runtime.runs} filtered runs in the selected window`}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-right text-sm">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Spend
                          </p>
                          <p className="font-medium">
                            {formatCurrencyMicros(runtime.costMicros)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Tokens
                          </p>
                          <p className="font-medium">
                            {formatCompactCount(runtime.totalTokens)}
                          </p>
                        </div>
                        {runtime.unknownPricingRuns > 0 ? (
                          <div className="col-span-2">
                            <p className="text-xs text-muted-foreground">
                              {runtime.unknownPricingRuns} row
                              {runtime.unknownPricingRuns === 1 ? "" : "s"} without price data
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="surface-card-muted rounded-lg p-4 text-sm text-muted-foreground">
                    No metered provider activity exists for{" "}
                    {formatDateRangeLabel(filters.dateRange).toLowerCase()}.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="surface-card rounded-xl p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <SectionHeading className="mb-2">Model Breakdown</SectionHeading>
                <p className="text-sm text-muted-foreground">
                  Spend-first concentration by model for{" "}
                  {formatDateRangeLabel(filters.dateRange).toLowerCase()}.
                </p>
              </div>
              {filteredUnknownPricingRuns > 0 ? (
                <Badge variant="secondary">
                  {filteredUnknownPricingRuns} pricing gap
                  {filteredUnknownPricingRuns === 1 ? "" : "s"}
                </Badge>
              ) : null}
            </div>

            {modelBreakdown.length > 0 ? (
              <div className="space-y-3">
                {modelBreakdown.map((row) => (
                  <div
                    key={`${row.runtimeId}-${row.modelId ?? "unknown"}`}
                    className="surface-card-muted rounded-lg p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">
                            {row.modelId ?? "Unknown model"}
                          </p>
                          <Badge variant="outline">
                            {runtimeStates[row.runtimeId]?.label ?? row.runtimeId}
                          </Badge>
                          {row.unknownPricingRuns > 0 ? (
                            <Badge variant="secondary">Pricing unavailable</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {row.providerId} • {row.runs} run
                          {row.runs === 1 ? "" : "s"} • {formatCompactCount(row.totalTokens)} tokens
                        </p>
                      </div>

                      <div className="grid gap-2 text-left sm:min-w-[180px] sm:text-right">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Spend
                          </p>
                          <p className="font-medium">{formatCurrencyMicros(row.costMicros)}</p>
                        </div>
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Tokens
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatCompactCount(row.totalTokens)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="surface-card-muted rounded-lg p-4 text-sm text-muted-foreground">
                No model breakdown is available for the selected window yet.
              </div>
            )}
          </div>

          <div className="surface-card rounded-xl p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <SectionHeading className="mb-2">Audit Log</SectionHeading>
                <p className="text-sm text-muted-foreground">
                  Filtered execution history for {formatDateRangeLabel(filters.dateRange).toLowerCase()}.
                </p>
              </div>
              <Badge variant="outline">{auditEntries.length} rows</Badge>
            </div>

            {auditEntries.length > 0 ? (
              <div className="surface-scroll rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Linked entity</TableHead>
                      <TableHead>Runtime</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Tokens</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="align-top text-xs text-muted-foreground">
                          {formatDateTime(entry.finishedAt.toISOString())}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <p className="font-medium">
                              {formatActivityLabel(entry.activityType)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.modelId ?? "Unknown model"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            {renderEntityLink(entry)}
                            {entry.projectId && entry.projectName ? (
                              <p className="text-xs text-muted-foreground">
                                <Link
                                  href={`/projects/${entry.projectId}`}
                                  className="hover:underline"
                                >
                                  {entry.projectName}
                                </Link>
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <p className="font-medium">
                              {runtimeStates[entry.runtimeId]?.label ?? entry.runtimeId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.providerId}
                              {runtimeStates[entry.runtimeId]?.billingMode === "subscription"
                                ? " • plan priced"
                                : ""}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-right">
                          {entry.status === "unknown_pricing"
                            ? "Unavailable"
                            : `${
                                entry.usageCompleteness !== "complete" &&
                                !(entry.pricingVersion?.startsWith("runtime-reported:") ?? false)
                                  ? "≥"
                                  : ""
                              }${formatCurrencyMicros(entry.costMicros)}`}
                        </TableCell>
                        <TableCell className="align-top text-right text-muted-foreground">
                          {formatCompactCount(entry.totalTokens ?? 0)}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col items-start gap-1">
                            {statusBadge(entry.status)}
                            {entry.usageCompleteness !== "complete" && (
                              <Badge variant="outline" className="text-status-warning">
                                {entry.usageCompleteness === "partial"
                                  ? "Partial usage"
                                  : "Usage unavailable"}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="surface-card-muted rounded-lg p-4 text-sm text-muted-foreground">
                No audit rows match the current filters. Adjust the runtime, status,
                activity, or date range to widen the view.
              </div>
            )}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Wallet}
          heading="No usage recorded yet"
          description="Metering is wired, but there are no paid runtime rows to visualize yet. Run a task, schedule, or workflow to populate the dashboard."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button asChild size="sm">
                <Link href="/tasks?create=task">
                  Create Task
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings">Review Budgets</Link>
              </Button>
            </div>
          }
        />
      )}
    </div>
  );
}
