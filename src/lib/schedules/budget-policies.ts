import { z } from "zod";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lt,
  lte,
  ne,
  or,
} from "drizzle-orm";
import { db } from "@/lib/db";
import {
  notifications,
  schedules,
  usageBudgetPolicies,
  usageLedger,
  type UsageBudgetPolicyRow,
} from "@/lib/db/schema";
import { parseAppScheduleId } from "@/lib/apps/app-schedule-id";
import type { AppBudgetPolicyRecommendation } from "@/lib/apps/registry";

const usdLimitSchema = z.number().positive().max(1_000_000).nullable();

export const updateUsageBudgetPolicySchema = z
  .object({
    enabled: z.boolean().default(true),
    onExceed: z.enum(["pause", "notify"]).default("pause"),
    maxCostPerRunUsd: usdLimitSchema.default(null),
    maxCostPerDayUsd: usdLimitSchema.default(null),
    maxCostPerMonthUsd: usdLimitSchema.default(null),
    sourceRecommendationId: z.string().min(1).nullable().default(null),
  })
  .strict()
  .refine(
    (value) =>
      value.maxCostPerRunUsd !== null ||
      value.maxCostPerDayUsd !== null ||
      value.maxCostPerMonthUsd !== null,
    { message: "At least one cost limit is required" }
  );

export type UpdateUsageBudgetPolicyInput = z.infer<
  typeof updateUsageBudgetPolicySchema
>;
export type BudgetPolicyHealth =
  | "disabled"
  | "ok"
  | "warning"
  | "blocked"
  | "unavailable";

export interface UsageBudgetPolicyView {
  id: string;
  scopeType: "app" | "schedule";
  scopeId: string;
  appId: string | null;
  scheduleId: string | null;
  sourceRecommendationId: string | null;
  enabled: boolean;
  onExceed: "pause" | "notify";
  maxCostPerRunUsd: number | null;
  maxCostPerDayUsd: number | null;
  maxCostPerMonthUsd: number | null;
  usage: {
    lastRunUsd: number | null;
    dailyUsd: number;
    monthlyUsd: number;
    measurementComplete: boolean;
  };
  ratios: {
    run: number | null;
    daily: number | null;
    monthly: number | null;
  };
  health: BudgetPolicyHealth;
  lastBreach: {
    kind: UsageBudgetPolicyRow["lastBreachKind"];
    message: string;
    at: string;
  } | null;
}

export interface ScheduleBudgetSnapshot {
  scheduleId: string;
  appId: string | null;
  recommendations: AppBudgetPolicyRecommendation[];
  effectivePolicies: UsageBudgetPolicyView[];
  health: "none" | BudgetPolicyHealth;
}

export interface AppBudgetSnapshot {
  appId: string;
  appName: string;
  origin: "user-created" | "installed-pack" | null;
  recommendations: AppBudgetPolicyRecommendation[];
  appPolicy: UsageBudgetPolicyView | null;
  schedules: Array<{
    id: string;
    name: string;
    recommendations: AppBudgetPolicyRecommendation[];
    policy: UsageBudgetPolicyView | null;
    health: "none" | BudgetPolicyHealth;
  }>;
}

interface PolicyUsage {
  lastRunMicros: number | null;
  dailyMicros: number;
  monthlyMicros: number;
  measurementComplete: boolean;
}

export interface ScheduleBudgetRunClaim {
  runId: string;
  scheduleId: string;
  policyIds: string[];
  startedAt: Date;
  strictestPerRunUsd: number | null;
}

export type BeginScheduleBudgetRunResult =
  | { status: "allowed"; claim: ScheduleBudgetRunClaim | null }
  | { status: "blocked"; reason: string }
  | { status: "busy"; reason: string; retryAt: Date };

const WARNING_THRESHOLD = 0.8;
const DEFAULT_CLAIM_TTL_SEC = 30 * 60;
const BUSY_RETRY_MS = 60_000;

class PolicyClaimBusyError extends Error {
  constructor(readonly policyId: string) {
    super(`Budget policy ${policyId} is already claimed by another run`);
    this.name = "PolicyClaimBusyError";
  }
}

function usdToMicros(value: number | null): number | null {
  return value === null ? null : Math.round(value * 1_000_000);
}

function microsToUsd(value: number | null): number | null {
  return value === null ? null : value / 1_000_000;
}

function policyId(scopeType: "app" | "schedule", scopeId: string): string {
  return `usage-budget:${scopeType}:${scopeId}`;
}

function scopeCondition(policy: UsageBudgetPolicyRow) {
  return policy.scopeType === "app"
    ? like(usageLedger.scheduleId, `app:${policy.scopeId}:%`)
    : eq(usageLedger.scheduleId, policy.scopeId);
}

function getWindowBounds(now: Date) {
  const dailyStart = new Date(now);
  dailyStart.setHours(0, 0, 0, 0);
  const dailyEnd = new Date(dailyStart);
  dailyEnd.setDate(dailyEnd.getDate() + 1);
  const monthlyStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { dailyStart, dailyEnd, monthlyStart, monthlyEnd };
}

function isTrustedCost(row: {
  costMicros: number | null;
  usageCompleteness: "complete" | "partial" | "unavailable";
  pricingVersion: string | null;
}) {
  return (
    row.costMicros !== null &&
    (row.usageCompleteness === "complete" ||
      (row.pricingVersion?.startsWith("runtime-reported:") ?? false))
  );
}

async function getPolicyUsage(
  policy: UsageBudgetPolicyRow,
  now = new Date()
): Promise<PolicyUsage> {
  const { dailyStart, dailyEnd, monthlyStart, monthlyEnd } = getWindowBounds(now);
  const rows = await db
    .select({
      taskId: usageLedger.taskId,
      workflowId: usageLedger.workflowId,
      costMicros: usageLedger.costMicros,
      usageCompleteness: usageLedger.usageCompleteness,
      pricingVersion: usageLedger.pricingVersion,
      finishedAt: usageLedger.finishedAt,
    })
    .from(usageLedger)
    .where(
      and(
        scopeCondition(policy),
        ne(usageLedger.activityType, "manual_force_bypass"),
        gte(usageLedger.finishedAt, monthlyStart),
        lt(usageLedger.finishedAt, monthlyEnd)
      )
    )
    .orderBy(desc(usageLedger.finishedAt));

  let dailyMicros = 0;
  let monthlyMicros = 0;
  const dailyRows: typeof rows = [];
  for (const row of rows) {
    monthlyMicros += row.costMicros ?? 0;
    if (row.finishedAt >= dailyStart && row.finishedAt < dailyEnd) {
      dailyMicros += row.costMicros ?? 0;
      dailyRows.push(row);
    }
  }

  const latest = rows[0];
  let lastRunMicros: number | null = null;
  const latestRunRows = latest
    ? rows.filter((row) =>
        latest.workflowId
          ? row.workflowId === latest.workflowId
          : latest.taskId
            ? row.taskId === latest.taskId
            : row.finishedAt.getTime() === latest.finishedAt.getTime()
      )
    : [];
  if (latestRunRows.length > 0 && latestRunRows.every(isTrustedCost)) {
    lastRunMicros = latestRunRows.reduce(
      (sum, row) => sum + (row.costMicros ?? 0),
      0
    );
  }

  // Only require trustworthy measurements for windows this policy constrains.
  // An older incomplete row elsewhere in the month must not disable a
  // daily-only policy, while a monthly policy must account for the full month.
  const measurementComplete =
    (policy.maxCostPerMonthMicros === null || rows.every(isTrustedCost)) &&
    (policy.maxCostPerDayMicros === null || dailyRows.every(isTrustedCost)) &&
    (policy.maxCostPerRunMicros === null ||
      latestRunRows.length === 0 ||
      latestRunRows.every(isTrustedCost));

  return {
    lastRunMicros,
    dailyMicros,
    monthlyMicros,
    measurementComplete,
  };
}

function ratio(value: number | null, limit: number | null) {
  return value !== null && limit !== null ? value / limit : null;
}

async function toPolicyView(
  policy: UsageBudgetPolicyRow,
  now = new Date()
): Promise<UsageBudgetPolicyView> {
  const usage = await getPolicyUsage(policy, now);
  const ratios = {
    run: ratio(usage.lastRunMicros, policy.maxCostPerRunMicros),
    daily: ratio(usage.dailyMicros, policy.maxCostPerDayMicros),
    monthly: ratio(usage.monthlyMicros, policy.maxCostPerMonthMicros),
  };
  const comparableRatios = Object.values(ratios).filter(
    (value): value is number => value !== null
  );
  let health: BudgetPolicyHealth = "ok";
  if (!policy.enabled) health = "disabled";
  else if (!usage.measurementComplete) health = "unavailable";
  else if (comparableRatios.some((value) => value >= 1)) health = "blocked";
  else if (comparableRatios.some((value) => value >= WARNING_THRESHOLD)) {
    health = "warning";
  }

  return {
    id: policy.id,
    scopeType: policy.scopeType,
    scopeId: policy.scopeId,
    appId: policy.appId,
    scheduleId: policy.scheduleId,
    sourceRecommendationId: policy.sourceRecommendationId,
    enabled: policy.enabled,
    onExceed: policy.onExceed,
    maxCostPerRunUsd: microsToUsd(policy.maxCostPerRunMicros),
    maxCostPerDayUsd: microsToUsd(policy.maxCostPerDayMicros),
    maxCostPerMonthUsd: microsToUsd(policy.maxCostPerMonthMicros),
    usage: {
      lastRunUsd: microsToUsd(usage.lastRunMicros),
      dailyUsd: microsToUsd(usage.dailyMicros) ?? 0,
      monthlyUsd: microsToUsd(usage.monthlyMicros) ?? 0,
      measurementComplete: usage.measurementComplete,
    },
    ratios,
    health,
    lastBreach:
      policy.lastBreachKind && policy.lastBreachMessage && policy.lastBreachAt
        ? {
            kind: policy.lastBreachKind,
            message: policy.lastBreachMessage,
            at: policy.lastBreachAt.toISOString(),
          }
        : null,
  };
}

function combineHealth(
  policies: UsageBudgetPolicyView[]
): "none" | BudgetPolicyHealth {
  if (policies.length === 0) return "none";
  const rank: Record<BudgetPolicyHealth, number> = {
    disabled: 0,
    ok: 1,
    warning: 2,
    unavailable: 3,
    blocked: 4,
  };
  return policies.reduce(
    (worst, policy) => (rank[policy.health] > rank[worst] ? policy.health : worst),
    policies[0].health
  );
}

async function getPolicyRowsForSchedule(scheduleId: string) {
  const parsed = parseAppScheduleId(scheduleId);
  const ids = [policyId("schedule", scheduleId)];
  if (parsed) ids.push(policyId("app", parsed.appId));
  return db
    .select()
    .from(usageBudgetPolicies)
    .where(inArray(usageBudgetPolicies.id, ids));
}

async function validateRecommendationLineage(
  scopeType: "app" | "schedule",
  scopeId: string,
  sourceRecommendationId: string | null
) {
  if (!sourceRecommendationId) return;
  const appId = scopeType === "app" ? scopeId : parseAppScheduleId(scopeId)?.appId;
  if (!appId) {
    throw new Error("Standalone schedules cannot reference a Pack recommendation");
  }
  const { getApp } = await import("@/lib/apps/registry");
  const app = getApp(appId);
  const recommendation = app?.manifest.budgetPolicies.find(
    (candidate) => candidate.id === sourceRecommendationId
  );
  if (!recommendation) {
    throw new Error(`Budget recommendation not found: ${sourceRecommendationId}`);
  }
  if (recommendation.scope !== scopeType) {
    throw new Error(`Budget recommendation ${sourceRecommendationId} has wrong scope`);
  }
  if (
    scopeType === "schedule" &&
    recommendation.schedule !== scopeId
  ) {
    throw new Error(
      `Budget recommendation ${sourceRecommendationId} targets another schedule`
    );
  }
}

export async function upsertUsageBudgetPolicy(input: {
  scopeType: "app" | "schedule";
  scopeId: string;
  policy: UpdateUsageBudgetPolicyInput;
}) {
  const parsedInput = updateUsageBudgetPolicySchema.parse(input.policy);
  let appId: string | null = null;
  let scheduleId: string | null = null;
  if (input.scopeType === "app") {
    const { getApp } = await import("@/lib/apps/registry");
    if (!getApp(input.scopeId)) throw new Error(`App not found: ${input.scopeId}`);
    appId = input.scopeId;
  } else {
    const schedule = await db
      .select({ id: schedules.id })
      .from(schedules)
      .where(eq(schedules.id, input.scopeId))
      .get();
    if (!schedule) throw new Error(`Schedule not found: ${input.scopeId}`);
    scheduleId = input.scopeId;
    appId = parseAppScheduleId(input.scopeId)?.appId ?? null;
  }
  await validateRecommendationLineage(
    input.scopeType,
    input.scopeId,
    parsedInput.sourceRecommendationId
  );

  const id = policyId(input.scopeType, input.scopeId);
  const now = new Date();
  await db
    .insert(usageBudgetPolicies)
    .values({
      id,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      appId,
      scheduleId,
      sourceRecommendationId: parsedInput.sourceRecommendationId,
      enabled: parsedInput.enabled,
      onExceed: parsedInput.onExceed,
      maxCostPerRunMicros: usdToMicros(parsedInput.maxCostPerRunUsd),
      maxCostPerDayMicros: usdToMicros(parsedInput.maxCostPerDayUsd),
      maxCostPerMonthMicros: usdToMicros(parsedInput.maxCostPerMonthUsd),
      notificationState: "{}",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: usageBudgetPolicies.id,
      set: {
        appId,
        scheduleId,
        sourceRecommendationId: parsedInput.sourceRecommendationId,
        enabled: parsedInput.enabled,
        onExceed: parsedInput.onExceed,
        maxCostPerRunMicros: usdToMicros(parsedInput.maxCostPerRunUsd),
        maxCostPerDayMicros: usdToMicros(parsedInput.maxCostPerDayUsd),
        maxCostPerMonthMicros: usdToMicros(parsedInput.maxCostPerMonthUsd),
        notificationState: "{}",
        lastBreachKind: null,
        lastBreachMessage: null,
        lastBreachAt: null,
        updatedAt: now,
      },
    });
  const row = await db
    .select()
    .from(usageBudgetPolicies)
    .where(eq(usageBudgetPolicies.id, id))
    .get();
  if (!row) throw new Error(`Budget policy write did not persist: ${id}`);
  return toPolicyView(row);
}

export async function deleteUsageBudgetPolicy(
  scopeType: "app" | "schedule",
  scopeId: string
) {
  return db
    .delete(usageBudgetPolicies)
    .where(eq(usageBudgetPolicies.id, policyId(scopeType, scopeId)))
    .run().changes;
}

export async function deleteAppUsageBudgetPolicies(appId: string) {
  return db
    .delete(usageBudgetPolicies)
    .where(eq(usageBudgetPolicies.appId, appId))
    .run().changes;
}

export async function getScheduleBudgetSnapshot(
  scheduleId: string
): Promise<ScheduleBudgetSnapshot> {
  const schedule = await db
    .select({ id: schedules.id })
    .from(schedules)
    .where(eq(schedules.id, scheduleId))
    .get();
  if (!schedule) throw new Error(`Schedule not found: ${scheduleId}`);
  const appId = parseAppScheduleId(scheduleId)?.appId ?? null;
  let recommendations: AppBudgetPolicyRecommendation[] = [];
  if (appId) {
    const { getApp } = await import("@/lib/apps/registry");
    recommendations =
      getApp(appId)?.manifest.budgetPolicies.filter(
        (policy) =>
          policy.scope === "app" ||
          (policy.scope === "schedule" && policy.schedule === scheduleId)
      ) ?? [];
  }
  const views = await Promise.all(
    (await getPolicyRowsForSchedule(scheduleId)).map((row) => toPolicyView(row))
  );
  return {
    scheduleId,
    appId,
    recommendations,
    effectivePolicies: views,
    health: combineHealth(views),
  };
}

export async function getAppBudgetSnapshot(appId: string): Promise<AppBudgetSnapshot> {
  const { getApp } = await import("@/lib/apps/registry");
  const app = getApp(appId);
  if (!app) throw new Error(`App not found: ${appId}`);
  const rows = await db
    .select()
    .from(usageBudgetPolicies)
    .where(eq(usageBudgetPolicies.appId, appId));
  const views = await Promise.all(rows.map((row) => toPolicyView(row)));
  const byId = new Map(views.map((view) => [view.id, view]));
  return {
    appId,
    appName: app.name,
    origin: app.origin,
    recommendations: app.manifest.budgetPolicies,
    appPolicy: byId.get(policyId("app", appId)) ?? null,
    schedules: app.manifest.schedules.map((schedule) => {
      const scheduleRecommendations = app.manifest.budgetPolicies.filter(
        (policy) => policy.scope === "schedule" && policy.schedule === schedule.id
      );
      const policy = byId.get(policyId("schedule", schedule.id)) ?? null;
      const scheduleName = (schedule as Record<string, unknown>).name;
      const name = typeof scheduleName === "string" ? scheduleName : schedule.id;
      return {
        id: schedule.id,
        name,
        recommendations: scheduleRecommendations,
        policy,
        health: policy?.health ?? "none",
      };
    }),
  };
}

function parseNotificationState(raw: string): Record<string, true> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.keys(parsed as Record<string, unknown>).map((key) => [key, true])
    );
  } catch {
    return {};
  }
}

function breachKey(kind: NonNullable<UsageBudgetPolicyRow["lastBreachKind"]>, now: Date, runId: string) {
  if (kind === "run") return `run:${runId}`;
  if (kind === "monthly") return `monthly:${now.getFullYear()}-${now.getMonth() + 1}`;
  return `${kind}:${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

async function applyPolicyEvent(input: {
  policy: UsageBudgetPolicyRow;
  scheduleId: string;
  runId: string;
  kind: NonNullable<UsageBudgetPolicyRow["lastBreachKind"]>;
  message: string;
  taskId?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.policy.onExceed === "pause") {
    await db
      .update(schedules)
      .set({ status: "paused", nextFireAt: null, updatedAt: now })
      .where(and(eq(schedules.id, input.scheduleId), eq(schedules.status, "active")));
  }

  const fresh = await db
    .select()
    .from(usageBudgetPolicies)
    .where(eq(usageBudgetPolicies.id, input.policy.id))
    .get();
  if (!fresh) return;
  const state = parseNotificationState(fresh.notificationState);
  const key = breachKey(input.kind, now, input.runId);
  await db
    .update(usageBudgetPolicies)
    .set({
      lastBreachKind: input.kind,
      lastBreachMessage: input.message,
      lastBreachAt: now,
      updatedAt: now,
    })
    .where(eq(usageBudgetPolicies.id, fresh.id));
  if (state[key]) return;

  try {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      taskId: input.taskId ?? null,
      type: "budget_alert",
      title:
        input.policy.onExceed === "pause"
          ? "Schedule paused by budget policy"
          : "Schedule budget alert",
      body: input.message,
      read: false,
      createdAt: now,
    });
    state[key] = true;
    await db
      .update(usageBudgetPolicies)
      .set({ notificationState: JSON.stringify(state), updatedAt: now })
      .where(eq(usageBudgetPolicies.id, fresh.id));
  } catch (error) {
    console.error(
      `[schedule-budget] notification write failed for policy ${fresh.id}:`,
      error
    );
  }
}

function formatUsdMicros(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value / 1_000_000);
}

async function evaluatePreRunPolicy(
  policy: UsageBudgetPolicyRow,
  scheduleId: string,
  runId: string,
  now: Date
) {
  const usage = await getPolicyUsage(policy, now);
  const needsWindowMeasurement =
    policy.maxCostPerDayMicros !== null || policy.maxCostPerMonthMicros !== null;
  if (needsWindowMeasurement && !usage.measurementComplete) {
    const message = `Cost measurement is unavailable for ${policy.scopeType} budget policy ${policy.scopeId}; Relay cannot prove the accepted ceiling is safe.`;
    await applyPolicyEvent({
      policy,
      scheduleId,
      runId,
      kind: "measurement_unavailable",
      message,
      now,
    });
    return policy.onExceed === "pause" ? message : null;
  }
  const breaches: Array<{ kind: "daily" | "monthly"; message: string }> = [];
  if (
    policy.maxCostPerDayMicros !== null &&
    usage.dailyMicros >= policy.maxCostPerDayMicros
  ) {
    breaches.push({
      kind: "daily",
      message: `Daily spend ${formatUsdMicros(usage.dailyMicros)} reached the ${formatUsdMicros(policy.maxCostPerDayMicros)} ceiling for ${policy.scopeType} policy ${policy.scopeId}.`,
    });
  }
  if (
    policy.maxCostPerMonthMicros !== null &&
    usage.monthlyMicros >= policy.maxCostPerMonthMicros
  ) {
    breaches.push({
      kind: "monthly",
      message: `Monthly spend ${formatUsdMicros(usage.monthlyMicros)} reached the ${formatUsdMicros(policy.maxCostPerMonthMicros)} ceiling for ${policy.scopeType} policy ${policy.scopeId}.`,
    });
  }
  for (const breach of breaches) {
    await applyPolicyEvent({ policy, scheduleId, runId, ...breach, now });
  }
  return breaches.length > 0 && policy.onExceed === "pause"
    ? breaches.map((breach) => breach.message).join(" ")
    : null;
}

export async function beginScheduleBudgetRun(input: {
  scheduleId: string;
  runId?: string;
  claimTtlSec?: number;
  now?: Date;
}): Promise<BeginScheduleBudgetRunResult> {
  const now = input.now ?? new Date();
  const runId = input.runId ?? crypto.randomUUID();
  const policies = (await getPolicyRowsForSchedule(input.scheduleId)).filter(
    (policy) => policy.enabled
  );
  if (policies.length === 0) return { status: "allowed", claim: null };

  for (const policy of policies) {
    const blockedReason = await evaluatePreRunPolicy(
      policy,
      input.scheduleId,
      runId,
      now
    );
    if (blockedReason) return { status: "blocked", reason: blockedReason };
  }

  const claimExpiresAt = new Date(
    now.getTime() + (input.claimTtlSec ?? DEFAULT_CLAIM_TTL_SEC) * 1000
  );
  try {
    db.transaction((tx) => {
      for (const policy of policies) {
        const result = tx
          .update(usageBudgetPolicies)
          .set({
            activeRunId: runId,
            activeScheduleId: input.scheduleId,
            claimStartedAt: now,
            claimExpiresAt,
            updatedAt: now,
          })
          .where(
            and(
              eq(usageBudgetPolicies.id, policy.id),
              eq(usageBudgetPolicies.enabled, true),
              or(
                isNull(usageBudgetPolicies.activeRunId),
                isNull(usageBudgetPolicies.claimExpiresAt),
                lte(usageBudgetPolicies.claimExpiresAt, now)
              )
            )
          )
          .run();
        if (result.changes !== 1) throw new PolicyClaimBusyError(policy.id);
      }
    });
  } catch (error) {
    if (error instanceof PolicyClaimBusyError) {
      return {
        status: "busy",
        reason: error.message,
        retryAt: new Date(now.getTime() + BUSY_RETRY_MS),
      };
    }
    throw error;
  }

  const perRunLimits = policies
    .map((policy) => microsToUsd(policy.maxCostPerRunMicros))
    .filter((value): value is number => value !== null);
  return {
    status: "allowed",
    claim: {
      runId,
      scheduleId: input.scheduleId,
      policyIds: policies.map((policy) => policy.id),
      startedAt: now,
      strictestPerRunUsd:
        perRunLimits.length > 0 ? Math.min(...perRunLimits) : null,
    },
  };
}

export async function deferScheduleForBudgetClaim(
  scheduleId: string,
  retryAt: Date
) {
  await db
    .update(schedules)
    .set({ nextFireAt: retryAt, updatedAt: new Date() })
    .where(and(eq(schedules.id, scheduleId), eq(schedules.status, "active")));
}

export async function releaseScheduleBudgetRun(claim: ScheduleBudgetRunClaim | null) {
  if (!claim || claim.policyIds.length === 0) return;
  await db
    .update(usageBudgetPolicies)
    .set({
      activeRunId: null,
      activeScheduleId: null,
      claimStartedAt: null,
      claimExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(usageBudgetPolicies.activeRunId, claim.runId),
        eq(usageBudgetPolicies.activeScheduleId, claim.scheduleId)
      )
    );
}

async function getRunUsage(input: {
  claim: ScheduleBudgetRunClaim;
  taskId?: string | null;
  workflowId?: string | null;
}) {
  const identity = input.workflowId
    ? eq(usageLedger.workflowId, input.workflowId)
    : input.taskId
      ? eq(usageLedger.taskId, input.taskId)
      : and(
          eq(usageLedger.scheduleId, input.claim.scheduleId),
          gte(usageLedger.finishedAt, input.claim.startedAt)
        );
  const rows = await db
    .select({
      costMicros: usageLedger.costMicros,
      usageCompleteness: usageLedger.usageCompleteness,
      pricingVersion: usageLedger.pricingVersion,
    })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.scheduleId, input.claim.scheduleId),
        ne(usageLedger.activityType, "manual_force_bypass"),
        identity
      )
    );
  return {
    costMicros: rows.reduce((sum, row) => sum + (row.costMicros ?? 0), 0),
    measurementComplete: rows.length > 0 && rows.every(isTrustedCost),
  };
}

export async function completeScheduleBudgetRun(input: {
  claim: ScheduleBudgetRunClaim | null;
  taskId?: string | null;
  workflowId?: string | null;
}) {
  if (!input.claim) return;
  const now = new Date();
  try {
    const runUsage = await getRunUsage({ ...input, claim: input.claim });
    const policies = await db.select().from(usageBudgetPolicies);
    const matching = policies.filter(
      (policy) =>
        input.claim!.policyIds.includes(policy.id) &&
        policy.enabled &&
        policy.activeRunId === input.claim!.runId
    );
    for (const policy of matching) {
      if (!runUsage.measurementComplete) {
        await applyPolicyEvent({
          policy,
          scheduleId: input.claim.scheduleId,
          runId: input.claim.runId,
          taskId: input.taskId,
          kind: "measurement_unavailable",
          message: `Relay could not verify metered cost for run ${input.claim.runId} under ${policy.scopeType} budget policy ${policy.scopeId}.`,
          now,
        });
        continue;
      }
      if (
        policy.maxCostPerRunMicros !== null &&
        runUsage.costMicros > policy.maxCostPerRunMicros
      ) {
        await applyPolicyEvent({
          policy,
          scheduleId: input.claim.scheduleId,
          runId: input.claim.runId,
          taskId: input.taskId,
          kind: "run",
          message: `Run spend ${formatUsdMicros(runUsage.costMicros)} exceeded the ${formatUsdMicros(policy.maxCostPerRunMicros)} per-run ceiling for ${policy.scopeType} policy ${policy.scopeId}.`,
          now,
        });
      }
      const usage = await getPolicyUsage(policy, now);
      if (
        policy.maxCostPerDayMicros !== null &&
        usage.dailyMicros >= policy.maxCostPerDayMicros
      ) {
        await applyPolicyEvent({
          policy,
          scheduleId: input.claim.scheduleId,
          runId: input.claim.runId,
          taskId: input.taskId,
          kind: "daily",
          message: `Daily spend ${formatUsdMicros(usage.dailyMicros)} reached the ${formatUsdMicros(policy.maxCostPerDayMicros)} ceiling for ${policy.scopeType} policy ${policy.scopeId}.`,
          now,
        });
      }
      if (
        policy.maxCostPerMonthMicros !== null &&
        usage.monthlyMicros >= policy.maxCostPerMonthMicros
      ) {
        await applyPolicyEvent({
          policy,
          scheduleId: input.claim.scheduleId,
          runId: input.claim.runId,
          taskId: input.taskId,
          kind: "monthly",
          message: `Monthly spend ${formatUsdMicros(usage.monthlyMicros)} reached the ${formatUsdMicros(policy.maxCostPerMonthMicros)} ceiling for ${policy.scopeType} policy ${policy.scopeId}.`,
          now,
        });
      }
    }
  } finally {
    await releaseScheduleBudgetRun(input.claim);
  }
}
