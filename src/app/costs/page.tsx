import { CostDashboard } from "@/components/costs/cost-dashboard";
import { PageShell } from "@/components/shared/page-shell";
import { getBudgetGuardrailSnapshot } from "@/lib/settings/budget-guardrails";
import {
  getDailySpendTotals,
  getDailyTokenTotals,
  getProviderModelBreakdown,
  listUsageAuditEntries,
  type ProviderModelBreakdownEntry,
  type UsageActivityType,
  type UsageLedgerStatus,
} from "@/lib/usage/ledger";

export const dynamic = "force-dynamic";

const validDateRanges = new Set(["7d", "30d", "90d", "all"]);
const validStatuses = new Set<UsageLedgerStatus>([
  "completed",
  "failed",
  "cancelled",
  "blocked",
  "unknown_pricing",
]);
const validActivityTypes = new Set<UsageActivityType>([
  "task_run",
  "task_resume",
  "workflow_step",
  "scheduled_firing",
  "task_assist",
  "profile_test",
]);

function toScalar(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveDateRange(value: string | undefined) {
  return value && validDateRanges.has(value) ? value : "30d";
}

function resolveStatus(value: string | undefined) {
  return value && validStatuses.has(value as UsageLedgerStatus) ? value : "all";
}

function resolveActivityType(value: string | undefined) {
  return value && validActivityTypes.has(value as UsageActivityType) ? value : "all";
}

function getRangeStart(range: string) {
  if (range === "all") {
    return undefined;
  }

  const now = new Date();
  const days =
    range === "7d"
      ? 7
      : range === "90d"
        ? 90
        : 30;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function buildDateKeys(days: number) {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    dates.push(
      new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date)
    );
  }
  return dates;
}

function fillSeries<T extends { day: string }>(
  days: number,
  rows: T[],
  getValue: (row: T) => number
) {
  const keys = buildDateKeys(days);
  const values = new Map(rows.map((row) => [row.day, getValue(row)]));
  return keys.map((key) => values.get(key) ?? 0);
}

function buildRuntimeBreakdown(
  rows: ProviderModelBreakdownEntry[]
): Array<{
  runtimeId: string;
  label: string;
  providerId: string;
  costMicros: number;
  totalTokens: number;
  runs: number;
  share: number;
  unknownPricingRuns: number;
}> {
  const totals = new Map<
    string,
    {
      runtimeId: string;
      label: string;
      providerId: string;
      costMicros: number;
      totalTokens: number;
      runs: number;
      unknownPricingRuns: number;
    }
  >();

  for (const row of rows) {
    const current = totals.get(row.runtimeId) ?? {
      runtimeId: row.runtimeId,
      label: row.runtimeId,
      providerId: row.providerId,
      costMicros: 0,
      totalTokens: 0,
      runs: 0,
      unknownPricingRuns: 0,
    };

    current.costMicros += row.costMicros;
    current.totalTokens += row.totalTokens;
    current.runs += row.runs;
    current.unknownPricingRuns += row.unknownPricingRuns;
    totals.set(row.runtimeId, current);
  }

  const totalCost = Array.from(totals.values()).reduce(
    (sum, row) => sum + row.costMicros,
    0
  );

  return Array.from(totals.values())
    .map((row) => ({
      ...row,
      share: totalCost > 0 ? (row.costMicros / totalCost) * 100 : 0,
    }))
    .sort((left, right) => right.costMicros - left.costMicros);
}

export default async function CostsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string | string[];
    runtime?: string | string[];
    status?: string | string[];
    activity?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const dateRange = resolveDateRange(toScalar(params.range));
  const status = resolveStatus(toScalar(params.status));
  const activityType = resolveActivityType(toScalar(params.activity));
  const rangeStart = getRangeStart(dateRange);

  const budgetSnapshot = await getBudgetGuardrailSnapshot();
  const configuredRuntimeIds = Object.values(budgetSnapshot.runtimeStates)
    .filter((runtime) => runtime.configured)
    .map((runtime) => runtime.runtimeId);
  const requestedRuntime = toScalar(params.runtime);
  const runtimeId =
    requestedRuntime && configuredRuntimeIds.includes(requestedRuntime as never)
      ? requestedRuntime
      : "all";

  const [spendRows30, tokenRows30, monthBreakdown, filteredBreakdown, auditEntries] =
    await Promise.all([
      getDailySpendTotals(30),
      getDailyTokenTotals(30),
      getProviderModelBreakdown({ startedAt: startOfCurrentMonth() }),
      getProviderModelBreakdown(rangeStart ? { startedAt: rangeStart } : undefined),
      listUsageAuditEntries({
        limit: 100,
        runtimeIds:
          runtimeId === "all"
            ? configuredRuntimeIds.length > 0
              ? configuredRuntimeIds
              : undefined
            : [runtimeId],
        statuses: status === "all" ? undefined : [status as UsageLedgerStatus],
        activityTypes:
          activityType === "all"
            ? undefined
            : [activityType as UsageActivityType],
        startedAt: rangeStart,
      }),
    ]);

  const configuredBreakdown = filteredBreakdown.filter((row) =>
    configuredRuntimeIds.length > 0
      ? configuredRuntimeIds.includes(row.runtimeId as never)
      : true
  );
  const configuredMonthBreakdown = monthBreakdown.filter((row) =>
    configuredRuntimeIds.length > 0
      ? configuredRuntimeIds.includes(row.runtimeId as never)
      : true
  );

  const spendSeries30 = fillSeries(30, spendRows30, (row) => row.costMicros);
  const tokenSeries30 = fillSeries(30, tokenRows30, (row) => row.totalTokens);
  const runtimeBreakdown = buildRuntimeBreakdown(configuredBreakdown).map((row) => ({
    ...row,
    label: budgetSnapshot.runtimeStates[row.runtimeId as keyof typeof budgetSnapshot.runtimeStates]
      ?.label ?? row.runtimeId,
  }));
  const monthTokens = configuredMonthBreakdown.reduce(
    (sum, row) => sum + row.totalTokens,
    0
  );

  const overallDaily = budgetSnapshot.statuses.find(
    (status) => status.scopeId === "overall" && status.window === "daily"
  );
  const overallMonthly = budgetSnapshot.statuses.find(
    (status) => status.scopeId === "overall" && status.window === "monthly"
  );

  return (
    <PageShell
      title="Cost & Usage"
      description="Track current spend pacing, provider mix, and the execution history behind paid runtime work without juggling a second budgeting model."
    >
      <CostDashboard
        filters={{
          dateRange,
          runtimeId,
          status,
          activityType,
        }}
        summary={{
          monthSpendMicros: budgetSnapshot.meteredSpend.monthlyMicros,
          monthSpendCompleteness:
            budgetSnapshot.meteredSpend.monthlyCompleteness,
          derivedDailyBudgetMicros: overallDaily?.limitValue ?? 0,
          remainingMonthlyHeadroomMicros: Math.max(
            (overallMonthly?.limitValue ?? 0) - (overallMonthly?.currentValue ?? 0),
            0
          ),
          monthTokens,
        }}
        trendSeries={{
          spend7: spendSeries30.slice(-7),
          spend30: spendSeries30,
          tokens7: tokenSeries30.slice(-7),
          tokens30: tokenSeries30,
        }}
        budgetStatuses={budgetSnapshot.statuses}
        runtimeStates={budgetSnapshot.runtimeStates}
        pricing={budgetSnapshot.pricing}
        runtimeBreakdown={runtimeBreakdown}
        modelBreakdown={configuredBreakdown}
        auditEntries={auditEntries}
      />
    </PageShell>
  );
}
