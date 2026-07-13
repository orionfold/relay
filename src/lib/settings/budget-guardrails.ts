import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, tasks, usageLedger } from "@/lib/db/schema";
import { SETTINGS_KEYS } from "@/lib/constants/settings";
import {
  DEFAULT_AGENT_RUNTIME,
  getRuntimeCatalogEntry,
  resolveAgentRuntime,
  SUPPORTED_AGENT_RUNTIMES,
  type AgentRuntimeId,
} from "@/lib/agents/runtime/catalog";
import { getSetting, setSetting } from "./helpers";
import {
  budgetPolicySchema,
  claudeOAuthPlanSchema,
  type BudgetPolicy,
  type RuntimeBudgetPolicy,
  type UpdateBudgetPolicyInput,
} from "@/lib/validators/settings";
import {
  recordUsageLedgerEntry,
  resolveUsageActivityType,
  type UsageActivityType,
  type UsageCompleteness,
} from "@/lib/usage/ledger";
import {
  getClaudeOAuthPlanPrice,
  getPricingRegistrySnapshot,
  type PricingRegistrySnapshot,
} from "@/lib/usage/pricing-registry";
import {
  getRuntimeSetupStates,
  listConfiguredRuntimeIds,
  type RuntimeSetupState,
} from "./runtime-setup";

const WARNING_THRESHOLD = 0.8;

type BudgetWindow = "daily" | "monthly";
type BudgetHealth = "unlimited" | "ok" | "warning" | "blocked";
type BudgetScopeId = "overall" | AgentRuntimeId;

interface UsageAggregate {
  costMicros: number;
  totalTokens: number;
}

function summarizeSpendCompleteness(
  rows: Array<{
    usageCompleteness: UsageCompleteness;
    costMicros: number | null;
    totalTokens: number | null;
    pricingVersion: string | null;
  }>
): UsageCompleteness {
  if (
    rows.length === 0 ||
    rows.every(
      (row) =>
        row.costMicros != null &&
        (row.usageCompleteness === "complete" ||
          (row.pricingVersion?.startsWith("runtime-reported:") ?? false))
    )
  ) {
    return "complete";
  }
  return rows.some((row) => row.costMicros != null || row.totalTokens != null)
    ? "partial"
    : "unavailable";
}

export interface BudgetWindowStatus {
  id: string;
  scopeId: BudgetScopeId;
  scopeLabel: string;
  runtimeId: AgentRuntimeId | null;
  window: BudgetWindow;
  currentValue: number;
  limitValue: number | null;
  ratio: number | null;
  health: BudgetHealth;
  resetAt: Date;
}

interface BudgetWarningState {
  [statusId: string]: string;
}

export interface BudgetSnapshot {
  policy: BudgetPolicy;
  statuses: Array<BudgetWindowStatus & { resetAtIso: string }>;
  dailyResetAtIso: string;
  monthlyResetAtIso: string;
  runtimeStates: Record<AgentRuntimeId, RuntimeSetupState>;
  pricing: PricingRegistrySnapshot;
  /** Real metered spend (usage_ledger sums) — never the plan-priced budget basis. */
  meteredSpend: {
    dailyMicros: number;
    monthlyMicros: number;
    dailyCompleteness: UsageCompleteness;
    monthlyCompleteness: UsageCompleteness;
  };
  /** Flat subscription price counted as the budget basis, when billing is subscription. */
  planPricedMonthlyMicros: number | null;
}

interface BudgetGuardInput {
  runtimeId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  workflowId?: string | null;
  scheduleId?: string | null;
  activityType: UsageActivityType;
  failTaskOnBlock?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toPositiveNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function roundUsd(value: number) {
  return Math.round(value * 100) / 100;
}

function createEmptyRuntimeBudgetPolicy(): RuntimeBudgetPolicy {
  return {
    monthlySpendCapUsd: null,
  };
}

export function createEmptyBudgetPolicy(): BudgetPolicy {
  return {
    overall: {
      monthlySpendCapUsd: null,
    },
    runtimes: Object.fromEntries(
      SUPPORTED_AGENT_RUNTIMES.map((runtimeId) => [
        runtimeId,
        createEmptyRuntimeBudgetPolicy(),
      ])
    ) as BudgetPolicy["runtimes"],
  };
}

function daysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function formatWindowKey(window: BudgetWindow, date: Date) {
  if (window === "daily") {
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function formatMicrosAsUsd(micros: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(micros / 1_000_000);
}

function formatResetAt(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function usdToMicros(value: number | null) {
  return value == null ? null : Math.round(value * 1_000_000);
}

function deriveDailyMicros(monthlySpendCapUsd: number | null, now: Date) {
  if (monthlySpendCapUsd == null) {
    return null;
  }
  return Math.round((monthlySpendCapUsd * 1_000_000) / daysInMonth(now));
}

function getBudgetWindowBounds(now = new Date()) {
  const dailyStart = new Date(now);
  dailyStart.setHours(0, 0, 0, 0);

  const dailyEnd = new Date(dailyStart);
  dailyEnd.setDate(dailyEnd.getDate() + 1);

  const monthlyStart = new Date(now.getFullYear(), now.getMonth(), 1);
  monthlyStart.setHours(0, 0, 0, 0);

  const monthlyEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  monthlyEnd.setHours(0, 0, 0, 0);

  return { dailyStart, dailyEnd, monthlyStart, monthlyEnd };
}

async function getWarningState(): Promise<BudgetWarningState> {
  const raw = await getSetting(SETTINGS_KEYS.BUDGET_WARNING_STATE);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as BudgetWarningState)
      : {};
  } catch {
    return {};
  }
}

async function setWarningState(state: BudgetWarningState) {
  await setSetting(SETTINGS_KEYS.BUDGET_WARNING_STATE, JSON.stringify(state));
}

function normalizePersistedBudgetPolicy(raw: unknown): BudgetPolicy {
  const fallback = createEmptyBudgetPolicy();
  if (!isRecord(raw)) {
    return fallback;
  }

  const overall = isRecord(raw.overall) ? raw.overall : {};
  const runtimes = isRecord(raw.runtimes) ? raw.runtimes : {};

  const next = createEmptyBudgetPolicy();
  next.overall.monthlySpendCapUsd =
    toPositiveNumber(overall.monthlySpendCapUsd) ??
    toPositiveNumber(overall.dailySpendCapUsd);

  for (const runtimeId of SUPPORTED_AGENT_RUNTIMES) {
    const runtimeRaw = isRecord(runtimes[runtimeId]) ? runtimes[runtimeId] : {};
    const runtime = next.runtimes[runtimeId];
    runtime.monthlySpendCapUsd =
      toPositiveNumber(runtimeRaw.monthlySpendCapUsd) ??
      toPositiveNumber(runtimeRaw.dailySpendCapUsd);

    if (
      runtimeId === "claude-code" &&
      typeof runtimeRaw.claudeOAuthPlan === "string"
    ) {
      const parsedPlan = claudeOAuthPlanSchema.safeParse(runtimeRaw.claudeOAuthPlan);
      if (parsedPlan.success) {
        runtime.claudeOAuthPlan = parsedPlan.data;
      }
    }
  }

  return next;
}

function normalizeBudgetPolicyWithRuntimeSetup(input: {
  policy: BudgetPolicy;
  runtimeStates: Record<AgentRuntimeId, RuntimeSetupState>;
}): BudgetPolicy {
  const next = createEmptyBudgetPolicy();
  const overallMonthly = input.policy.overall.monthlySpendCapUsd;
  const configuredRuntimeIds = listConfiguredRuntimeIds(input.runtimeStates);

  next.overall.monthlySpendCapUsd = overallMonthly;
  next.runtimes["claude-code"].claudeOAuthPlan =
    input.policy.runtimes["claude-code"].claudeOAuthPlan ??
    (input.runtimeStates["claude-code"].billingMode === "subscription"
      ? "pro"
      : undefined);

  if (overallMonthly == null || configuredRuntimeIds.length === 0) {
    return next;
  }

  if (configuredRuntimeIds.length === 1) {
    next.runtimes[configuredRuntimeIds[0]].monthlySpendCapUsd = overallMonthly;
    return next;
  }

  const activeRuntimeIds = configuredRuntimeIds.filter(
    (runtimeId) => input.runtimeStates[runtimeId].configured
  );
  const totalRequested = activeRuntimeIds.reduce(
    (sum, runtimeId) => sum + (input.policy.runtimes[runtimeId].monthlySpendCapUsd ?? 0),
    0
  );

  const claudeShare =
    totalRequested > 0
      ? (input.policy.runtimes["claude-code"].monthlySpendCapUsd ?? 0) / totalRequested
      : 0.5;
  const claudeMonthly = roundUsd(overallMonthly * claudeShare);
  const openAIMonthly = roundUsd(Math.max(overallMonthly - claudeMonthly, 0));

  next.runtimes["claude-code"].monthlySpendCapUsd = claudeMonthly;
  next.runtimes["openai-codex-app-server"].monthlySpendCapUsd = openAIMonthly;

  return next;
}

export async function getBudgetPolicy(): Promise<BudgetPolicy> {
  const raw = await getSetting(SETTINGS_KEYS.BUDGET_POLICY);
  if (!raw) {
    return createEmptyBudgetPolicy();
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizePersistedBudgetPolicy(parsed);
  } catch {
    return createEmptyBudgetPolicy();
  }
}

export async function setBudgetPolicy(
  input: UpdateBudgetPolicyInput
): Promise<BudgetPolicy> {
  const parsed = budgetPolicySchema.parse(input);
  const runtimeStates = await getRuntimeSetupStates();
  const normalized = normalizeBudgetPolicyWithRuntimeSetup({
    policy: parsed,
    runtimeStates,
  });
  await setSetting(SETTINGS_KEYS.BUDGET_POLICY, JSON.stringify(normalized));
  await setWarningState({});
  return normalized;
}

async function getUsageAggregates(
  policy: BudgetPolicy,
  runtimeStates: Record<AgentRuntimeId, RuntimeSetupState>,
  now = new Date()
) {
  const { dailyStart, dailyEnd, monthlyStart, monthlyEnd } =
    getBudgetWindowBounds(now);

  const rows = await db
    .select({
      runtimeId: usageLedger.runtimeId,
      costMicros: usageLedger.costMicros,
      totalTokens: usageLedger.totalTokens,
      usageCompleteness: usageLedger.usageCompleteness,
      pricingVersion: usageLedger.pricingVersion,
      finishedAt: usageLedger.finishedAt,
    })
    .from(usageLedger)
    .where(
      and(
        gte(usageLedger.finishedAt, monthlyStart),
        lt(usageLedger.finishedAt, monthlyEnd)
      )
    );

  const runtimes = Object.fromEntries(
    SUPPORTED_AGENT_RUNTIMES.map((runtimeId) => [
      runtimeId,
      {
        daily: { costMicros: 0, totalTokens: 0 },
        monthly: { costMicros: 0, totalTokens: 0 },
      },
    ])
  ) as Record<AgentRuntimeId, { daily: UsageAggregate; monthly: UsageAggregate }>;

  rows.forEach((row) => {
    const runtimeId = SUPPORTED_AGENT_RUNTIMES.find(
      (candidate) => candidate === row.runtimeId
    );
    if (!runtimeId) {
      return;
    }

    runtimes[runtimeId].monthly.costMicros += row.costMicros ?? 0;
    runtimes[runtimeId].monthly.totalTokens += row.totalTokens ?? 0;

    if (row.finishedAt >= dailyStart && row.finishedAt < dailyEnd) {
      runtimes[runtimeId].daily.costMicros += row.costMicros ?? 0;
      runtimes[runtimeId].daily.totalTokens += row.totalTokens ?? 0;
    }
  });

  // Real metered spend: the plain usage_ledger sums across every runtime,
  // captured BEFORE the subscription plan-price substitution below. Guardrail
  // statuses budget against the plan price (a flat subscription is the real
  // monthly outlay), but display surfaces must never present that basis as
  // spend — they read this instead.
  const metered = {
    daily: { costMicros: 0, totalTokens: 0 },
    monthly: { costMicros: 0, totalTokens: 0 },
  };
  for (const runtimeId of SUPPORTED_AGENT_RUNTIMES) {
    metered.daily.costMicros += runtimes[runtimeId].daily.costMicros;
    metered.daily.totalTokens += runtimes[runtimeId].daily.totalTokens;
    metered.monthly.costMicros += runtimes[runtimeId].monthly.costMicros;
    metered.monthly.totalTokens += runtimes[runtimeId].monthly.totalTokens;
  }
  const monthlyCompleteness = summarizeSpendCompleteness(rows);
  const dailyCompleteness = summarizeSpendCompleteness(
    rows.filter(
      (row) => row.finishedAt >= dailyStart && row.finishedAt < dailyEnd
    )
  );

  let planPricedMonthlyMicros: number | null = null;
  if (runtimeStates["claude-code"].billingMode === "subscription") {
    const planPriceUsd = await getClaudeOAuthPlanPrice(
      policy.runtimes["claude-code"].claudeOAuthPlan
    );
    const monthlyMicros = usdToMicros(planPriceUsd) ?? 0;
    const dailyMicros = Math.round(monthlyMicros / daysInMonth(now));
    runtimes["claude-code"].monthly.costMicros = monthlyMicros;
    runtimes["claude-code"].daily.costMicros = dailyMicros;
    planPricedMonthlyMicros = monthlyMicros;
  }

  const overall = {
    daily: { costMicros: 0, totalTokens: 0 },
    monthly: { costMicros: 0, totalTokens: 0 },
  };

  for (const runtimeId of SUPPORTED_AGENT_RUNTIMES) {
    if (!runtimeStates[runtimeId].configured) {
      continue;
    }

    overall.daily.costMicros += runtimes[runtimeId].daily.costMicros;
    overall.daily.totalTokens += runtimes[runtimeId].daily.totalTokens;
    overall.monthly.costMicros += runtimes[runtimeId].monthly.costMicros;
    overall.monthly.totalTokens += runtimes[runtimeId].monthly.totalTokens;
  }

  return {
    overall,
    runtimes,
    metered,
    dailyCompleteness,
    monthlyCompleteness,
    planPricedMonthlyMicros,
    ...getBudgetWindowBounds(now),
  };
}

function buildStatus(input: {
  scopeId: BudgetScopeId;
  scopeLabel: string;
  runtimeId: AgentRuntimeId | null;
  window: BudgetWindow;
  currentValue: number;
  limitValue: number | null;
  resetAt: Date;
}): BudgetWindowStatus {
  const ratio =
    input.limitValue && input.limitValue > 0
      ? input.currentValue / input.limitValue
      : null;

  let health: BudgetHealth = "unlimited";
  if (input.limitValue != null) {
    if (ratio != null && ratio >= 1) {
      health = "blocked";
    } else if (ratio != null && ratio >= WARNING_THRESHOLD) {
      health = "warning";
    } else {
      health = "ok";
    }
  }

  return {
    id: `${input.scopeId}:${input.window}:spend`,
    scopeId: input.scopeId,
    scopeLabel: input.scopeLabel,
    runtimeId: input.runtimeId,
    window: input.window,
    currentValue: input.currentValue,
    limitValue: input.limitValue,
    ratio,
    health,
    resetAt: input.resetAt,
  };
}

function buildBudgetStatuses(
  policy: BudgetPolicy,
  runtimeStates: Record<AgentRuntimeId, RuntimeSetupState>,
  aggregates: Awaited<ReturnType<typeof getUsageAggregates>>,
  now: Date
) {
  const statuses: BudgetWindowStatus[] = [];

  statuses.push(
    buildStatus({
      scopeId: "overall",
      scopeLabel: "Overall",
      runtimeId: null,
      window: "daily",
      currentValue: aggregates.overall.daily.costMicros,
      limitValue: deriveDailyMicros(policy.overall.monthlySpendCapUsd, now),
      resetAt: aggregates.dailyEnd,
    }),
    buildStatus({
      scopeId: "overall",
      scopeLabel: "Overall",
      runtimeId: null,
      window: "monthly",
      currentValue: aggregates.overall.monthly.costMicros,
      limitValue: usdToMicros(policy.overall.monthlySpendCapUsd),
      resetAt: aggregates.monthlyEnd,
    })
  );

  for (const runtimeId of SUPPORTED_AGENT_RUNTIMES) {
    if (!runtimeStates[runtimeId].configured) {
      continue;
    }

    const runtime = getRuntimeCatalogEntry(runtimeId);
    const runtimePolicy = policy.runtimes[runtimeId];
    const usage = aggregates.runtimes[runtimeId];

    statuses.push(
      buildStatus({
        scopeId: runtimeId,
        scopeLabel: runtime.label,
        runtimeId,
        window: "daily",
        currentValue: usage.daily.costMicros,
        limitValue: deriveDailyMicros(runtimePolicy.monthlySpendCapUsd, now),
        resetAt: aggregates.dailyEnd,
      }),
      buildStatus({
        scopeId: runtimeId,
        scopeLabel: runtime.label,
        runtimeId,
        window: "monthly",
        currentValue: usage.monthly.costMicros,
        limitValue: usdToMicros(runtimePolicy.monthlySpendCapUsd),
        resetAt: aggregates.monthlyEnd,
      })
    );
  }

  return statuses;
}

function describeBudgetStatus(status: BudgetWindowStatus) {
  const currentLabel = formatMicrosAsUsd(status.currentValue);
  const limitLabel =
    status.limitValue == null ? "Unlimited" : formatMicrosAsUsd(status.limitValue);

  return `${status.scopeLabel} ${status.window} spend is ${currentLabel} of ${limitLabel}. Resets ${formatResetAt(status.resetAt)}.`;
}

async function createBudgetNotification(input: {
  title: string;
  body: string;
  taskId?: string | null;
}) {
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    taskId: input.taskId ?? null,
    type: "budget_alert",
    title: input.title,
    body: input.body,
    read: false,
    toolName: null,
    toolInput: null,
    response: null,
    respondedAt: null,
    createdAt: new Date(),
  });
}

async function emitWarningNotifications(
  statuses: BudgetWindowStatus[],
  warningState: BudgetWarningState,
  taskId?: string | null
) {
  let changed = false;

  for (const status of statuses) {
    const windowKey = formatWindowKey(status.window, status.resetAt);
    if (warningState[status.id] === windowKey) {
      continue;
    }

    const percent = status.ratio == null ? 0 : Math.round(status.ratio * 100);
    await createBudgetNotification({
      taskId,
      title: `${status.scopeLabel} ${status.window} spend at ${percent}%`,
      body: describeBudgetStatus(status),
    });
    warningState[status.id] = windowKey;
    changed = true;
  }

  if (changed) {
    await setWarningState(warningState);
  }
}

async function recordBlockedAttempt(input: {
  runtimeId: AgentRuntimeId;
  activityType: UsageActivityType;
  taskId?: string | null;
  projectId?: string | null;
  workflowId?: string | null;
  scheduleId?: string | null;
}) {
  const runtime = getRuntimeCatalogEntry(input.runtimeId);
  await recordUsageLedgerEntry({
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    workflowId: input.workflowId ?? null,
    scheduleId: input.scheduleId ?? null,
    activityType: input.activityType,
    runtimeId: input.runtimeId,
    providerId: runtime.providerId,
    usageCompleteness: "complete",
    usageSource: "budget-guardrail",
    status: "blocked",
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

async function markTaskBlocked(taskId: string, message: string) {
  await db
    .update(tasks)
    .set({
      status: "failed",
      result: message,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}

async function getTaskBudgetContext(taskId: string, isResume = false) {
  const [task] = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      workflowId: tasks.workflowId,
      scheduleId: tasks.scheduleId,
      assignedAgent: tasks.assignedAgent,
    })
    .from(tasks)
    .where(eq(tasks.id, taskId));

  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  return {
    runtimeId: resolveAgentRuntime(task.assignedAgent ?? DEFAULT_AGENT_RUNTIME),
    taskId: task.id,
    projectId: task.projectId ?? null,
    workflowId: task.workflowId ?? null,
    scheduleId: task.scheduleId ?? null,
    activityType: resolveUsageActivityType({
      workflowId: task.workflowId,
      scheduleId: task.scheduleId,
      isResume,
    }),
  };
}

export class BudgetLimitExceededError extends Error {
  readonly status: BudgetWindowStatus;

  constructor(status: BudgetWindowStatus) {
    super(describeBudgetStatus(status));
    this.name = "BudgetLimitExceededError";
    this.status = status;
  }
}

export async function enforceBudgetGuardrails(input: BudgetGuardInput) {
  const runtimeId = resolveAgentRuntime(input.runtimeId ?? DEFAULT_AGENT_RUNTIME);
  const policy = await getBudgetPolicy();
  const warningState = await getWarningState();
  const runtimeStates = await getRuntimeSetupStates();

  if (!runtimeStates[runtimeId].configured) {
    return;
  }

  const now = new Date();
  const aggregates = await getUsageAggregates(policy, runtimeStates, now);
  const statuses = buildBudgetStatuses(policy, runtimeStates, aggregates, now).filter(
    (status) => status.scopeId === "overall" || status.runtimeId === runtimeId
  );

  const blocked = statuses.find((status) => status.health === "blocked");
  const warnings = statuses.filter((status) => status.health === "warning");

  if (!blocked && warnings.length > 0) {
    await emitWarningNotifications(warnings, warningState, input.taskId ?? null);
  }

  if (!blocked) {
    return;
  }

  const runtime = getRuntimeCatalogEntry(runtimeId);
  const title = `${runtime.label} blocked by ${blocked.window} spend cap`;
  const body = describeBudgetStatus(blocked);

  await createBudgetNotification({
    taskId: input.taskId ?? null,
    title,
    body,
  });
  await recordBlockedAttempt({
    runtimeId,
    activityType: input.activityType,
    taskId: input.taskId ?? null,
    projectId: input.projectId ?? null,
    workflowId: input.workflowId ?? null,
    scheduleId: input.scheduleId ?? null,
  });

  if (input.failTaskOnBlock && input.taskId) {
    await markTaskBlocked(input.taskId, body);
  }

  throw new BudgetLimitExceededError(blocked);
}

export async function enforceTaskBudgetGuardrails(
  taskId: string,
  options?: {
    isResume?: boolean;
    failTaskOnBlock?: boolean;
  }
) {
  const context = await getTaskBudgetContext(taskId, options?.isResume);
  return enforceBudgetGuardrails({
    ...context,
    failTaskOnBlock: options?.failTaskOnBlock,
  });
}

export async function getBudgetGuardrailSnapshot(): Promise<BudgetSnapshot> {
  const [runtimeStates, pricing] = await Promise.all([
    getRuntimeSetupStates(),
    getPricingRegistrySnapshot(),
  ]);
  const policy = normalizeBudgetPolicyWithRuntimeSetup({
    policy: await getBudgetPolicy(),
    runtimeStates,
  });
  const now = new Date();
  const aggregates = await getUsageAggregates(policy, runtimeStates, now);
  const statuses = buildBudgetStatuses(policy, runtimeStates, aggregates, now).map(
    (status) => ({
      ...status,
      resetAtIso: status.resetAt.toISOString(),
    })
  );

  return {
    policy,
    statuses,
    dailyResetAtIso: aggregates.dailyEnd.toISOString(),
    monthlyResetAtIso: aggregates.monthlyEnd.toISOString(),
    runtimeStates,
    pricing,
    meteredSpend: {
      dailyMicros: aggregates.metered.daily.costMicros,
      monthlyMicros: aggregates.metered.monthly.costMicros,
      dailyCompleteness: aggregates.dailyCompleteness,
      monthlyCompleteness: aggregates.monthlyCompleteness,
    },
    planPricedMonthlyMicros: aggregates.planPricedMonthlyMicros,
  };
}
