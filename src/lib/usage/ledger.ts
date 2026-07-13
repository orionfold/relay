import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  projects,
  schedules,
  tasks,
  usageLedger,
  workflows,
} from "@/lib/db/schema";
import { deriveUsageCostMicros } from "./pricing";

export type UsageActivityType =
  | "task_run"
  | "task_resume"
  | "workflow_step"
  | "scheduled_firing"
  | "task_assist"
  | "profile_test"
  | "pattern_extraction"
  | "context_summarization"
  | "chat_turn"
  | "profile_assist"
  | "manual_force_bypass";

export type UsageLedgerStatus =
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked"
  | "unknown_pricing";

export type UsageCompleteness = "complete" | "partial" | "unavailable";

export interface UsageSnapshot {
  modelId?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
}

export interface UsageLedgerWriteInput extends UsageSnapshot {
  taskId?: string | null;
  workflowId?: string | null;
  scheduleId?: string | null;
  projectId?: string | null;
  customerId?: string | null;
  activityType: UsageActivityType;
  runtimeId: string;
  providerId: string;
  /** Provider/runtime-reported execution cost. When present, it is authoritative. */
  reportedCostMicros?: number | null;
  usageCompleteness?: UsageCompleteness;
  usageSource?: string | null;
  usageDetails?: Record<string, unknown> | null;
  status: Exclude<UsageLedgerStatus, "unknown_pricing">;
  startedAt: Date;
  finishedAt: Date;
}

export interface UsageAuditEntry {
  id: string;
  activityType: UsageActivityType;
  runtimeId: string;
  providerId: string;
  modelId: string | null;
  status: UsageLedgerStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costMicros: number | null;
  pricingVersion: string | null;
  usageCompleteness: UsageCompleteness;
  usageSource: string | null;
  usageDetails: string | null;
  startedAt: Date;
  finishedAt: Date;
  taskId: string | null;
  taskTitle: string | null;
  workflowId: string | null;
  workflowName: string | null;
  scheduleId: string | null;
  scheduleName: string | null;
  projectId: string | null;
  projectName: string | null;
}

export interface ProviderModelBreakdownEntry {
  providerId: string;
  modelId: string | null;
  runtimeId: string;
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  runs: number;
  unknownPricingRuns: number;
}

export interface CostByCustomerEntry {
  customerId: string | null;
  customerName: string; // "Unattributed" when customerId is null
  costMicros: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  runs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return null;
}

function mergeValue(
  current: number | string | null | undefined,
  next: number | string | null | undefined
) {
  return current ?? next ?? null;
}

export function mergeUsageSnapshot(
  current: UsageSnapshot,
  next: UsageSnapshot
): UsageSnapshot {
  return {
    modelId: mergeValue(current.modelId, next.modelId) as string | null,
    inputTokens: mergeValue(current.inputTokens, next.inputTokens) as number | null,
    outputTokens: mergeValue(current.outputTokens, next.outputTokens) as number | null,
    totalTokens: mergeValue(current.totalTokens, next.totalTokens) as number | null,
  };
}

export function extractUsageSnapshot(value: unknown): UsageSnapshot {
  const snapshot: UsageSnapshot = {};
  const visited = new Set<unknown>();

  function visit(node: unknown, depth: number) {
    if (depth > 6 || node == null || visited.has(node)) {
      return;
    }
    visited.add(node);

    if (Array.isArray(node)) {
      node.forEach((entry) => visit(entry, depth + 1));
      return;
    }

    if (!isRecord(node)) {
      return;
    }

    const modelId =
      (typeof node.model === "string" ? node.model : null) ??
      (typeof node.modelId === "string" ? node.modelId : null) ??
      (typeof node.model_id === "string" ? node.model_id : null);
    if (modelId && !snapshot.modelId) {
      snapshot.modelId = modelId;
    }

    const inputTokens =
      parseInteger(node.input_tokens) ??
      parseInteger(node.inputTokens) ??
      parseInteger(node.prompt_tokens) ??
      parseInteger(node.promptTokens);
    if (inputTokens !== null && snapshot.inputTokens == null) {
      snapshot.inputTokens = inputTokens;
    }

    const outputTokens =
      parseInteger(node.output_tokens) ??
      parseInteger(node.outputTokens) ??
      parseInteger(node.completion_tokens) ??
      parseInteger(node.completionTokens);
    if (outputTokens !== null && snapshot.outputTokens == null) {
      snapshot.outputTokens = outputTokens;
    }

    const totalTokens =
      parseInteger(node.total_tokens) ?? parseInteger(node.totalTokens);
    if (totalTokens !== null && snapshot.totalTokens == null) {
      snapshot.totalTokens = totalTokens;
    }

    Object.values(node).forEach((child) => visit(child, depth + 1));
  }

  visit(value, 0);

  if (
    snapshot.totalTokens == null &&
    snapshot.inputTokens != null &&
    snapshot.outputTokens != null
  ) {
    snapshot.totalTokens = snapshot.inputTokens + snapshot.outputTokens;
  }

  return snapshot;
}

export function resolveUsageActivityType(input: {
  workflowId?: string | null;
  scheduleId?: string | null;
  isResume?: boolean;
}): UsageActivityType {
  if (input.workflowId) {
    return "workflow_step";
  }
  if (input.scheduleId) {
    return "scheduled_firing";
  }
  return input.isResume ? "task_resume" : "task_run";
}

export async function recordUsageLedgerEntry(input: UsageLedgerWriteInput) {
  // Customer attribution: prefer an explicit customerId; otherwise inherit it from the
  // project the work belongs to (project → customer). Resolving here, at the single
  // ledger-write funnel, auto-attributes every project-scoped write without threading
  // customerId through all callers. Best-effort: absence of a customer is not a failure,
  // it surfaces as the "Unattributed" bucket in the rollup. See _SPECS/2026-06-30-132039_customer-dimension.md.
  let resolvedCustomerId = input.customerId ?? null;
  if (resolvedCustomerId == null && input.projectId != null) {
    const project = await db
      .select({ customerId: projects.customerId })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .get();
    resolvedCustomerId = project?.customerId ?? null;
  }

  const normalizedInputTokens = input.inputTokens ?? null;
  const normalizedOutputTokens = input.outputTokens ?? null;
  const normalizedTotalTokens =
    input.totalTokens ??
    (normalizedInputTokens != null && normalizedOutputTokens != null
      ? normalizedInputTokens + normalizedOutputTokens
      : null);
  const derivedCost = await deriveUsageCostMicros({
    providerId: input.providerId,
    modelId: input.modelId,
    inputTokens: normalizedInputTokens,
    outputTokens: normalizedOutputTokens,
  });

  const hasReportedCost = Object.prototype.hasOwnProperty.call(
    input,
    "reportedCostMicros"
  );
  const costMicros = hasReportedCost
    ? input.reportedCostMicros ?? null
    : derivedCost.costMicros;
  const pricingVersion = hasReportedCost
    ? input.reportedCostMicros == null
      ? null
      : `runtime-reported:${input.usageSource ?? input.runtimeId}`
    : derivedCost.pricingVersion;

  const resolvedCostMicros = input.status === "blocked" ? 0 : costMicros;
  const resolvedPricingVersion =
    input.status === "blocked" ? "budget-guardrail" : pricingVersion;
  const usageCompleteness: UsageCompleteness =
    input.usageCompleteness ??
    (input.status === "blocked"
      ? "complete"
      : normalizedTotalTokens == null && resolvedCostMicros == null
        ? "unavailable"
        : "partial");

  const status: UsageLedgerStatus =
    input.status === "completed" &&
    normalizedTotalTokens != null &&
    resolvedCostMicros === null
      ? "unknown_pricing"
      : input.status;

  const row = {
    id: crypto.randomUUID(),
    taskId: input.taskId ?? null,
    workflowId: input.workflowId ?? null,
    scheduleId: input.scheduleId ?? null,
    projectId: input.projectId ?? null,
    customerId: resolvedCustomerId,
    activityType: input.activityType,
    runtimeId: input.runtimeId,
    providerId: input.providerId,
    modelId: input.modelId ?? null,
    status,
    inputTokens: normalizedInputTokens,
    outputTokens: normalizedOutputTokens,
    totalTokens: normalizedTotalTokens,
    costMicros: resolvedCostMicros,
    pricingVersion: resolvedPricingVersion,
    usageCompleteness,
    usageSource: input.usageSource ?? null,
    usageDetails: input.usageDetails
      ? JSON.stringify(input.usageDetails)
      : null,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  } as const;

  await db.insert(usageLedger).values(row);

  return row;
}

function startOfWindow(days: number) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start;
}

function formatLocalDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function getDailySpendTotals(days = 7) {
  const rows = await db
    .select()
    .from(usageLedger)
    .where(gte(usageLedger.finishedAt, startOfWindow(days)))
    .orderBy(usageLedger.finishedAt);

  const totals = new Map<string, number>();
  rows.forEach((row) => {
    const day = formatLocalDay(row.finishedAt);
    totals.set(day, (totals.get(day) ?? 0) + (row.costMicros ?? 0));
  });

  return Array.from(totals.entries()).map(([day, costMicros]) => ({
    day,
    costMicros,
  }));
}

export async function getDailyTokenTotals(days = 7) {
  const rows = await db
    .select()
    .from(usageLedger)
    .where(gte(usageLedger.finishedAt, startOfWindow(days)))
    .orderBy(usageLedger.finishedAt);

  const totals = new Map<
    string,
    { inputTokens: number; outputTokens: number; totalTokens: number }
  >();

  rows.forEach((row) => {
    const day = formatLocalDay(row.finishedAt);
    const bucket = totals.get(day) ?? {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    };
    bucket.inputTokens += row.inputTokens ?? 0;
    bucket.outputTokens += row.outputTokens ?? 0;
    bucket.totalTokens += row.totalTokens ?? 0;
    totals.set(day, bucket);
  });

  return Array.from(totals.entries()).map(([day, values]) => ({
    day,
    ...values,
  }));
}

export async function getProviderModelBreakdown(options?: {
  startedAt?: Date;
  finishedAt?: Date;
}): Promise<ProviderModelBreakdownEntry[]> {
  const conditions = [];
  if (options?.startedAt) {
    conditions.push(gte(usageLedger.finishedAt, options.startedAt));
  }
  if (options?.finishedAt) {
    conditions.push(lte(usageLedger.finishedAt, options.finishedAt));
  }

  const rows = await db
    .select()
    .from(usageLedger)
    .where(conditions.length ? and(...conditions) : undefined);

  const totals = new Map<
    string,
    {
      providerId: string;
      modelId: string | null;
      runtimeId: string;
      costMicros: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      runs: number;
      unknownPricingRuns: number;
    }
  >();

  rows.forEach((row) => {
    const key = `${row.providerId}::${row.modelId ?? "unknown"}::${row.runtimeId}`;
    const bucket = totals.get(key) ?? {
      providerId: row.providerId,
      modelId: row.modelId ?? null,
      runtimeId: row.runtimeId,
      costMicros: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      runs: 0,
      unknownPricingRuns: 0,
    };

    bucket.costMicros += row.costMicros ?? 0;
    bucket.inputTokens += row.inputTokens ?? 0;
    bucket.outputTokens += row.outputTokens ?? 0;
    bucket.totalTokens += row.totalTokens ?? 0;
    bucket.runs += 1;
    if (row.status === "unknown_pricing") {
      bucket.unknownPricingRuns += 1;
    }
    totals.set(key, bucket);
  });

  return Array.from(totals.values()).sort(
    (left, right) => right.costMicros - left.costMicros
  );
}

// Per-customer cost rollup over a trailing window. Mirrors getProviderModelBreakdown's
// Map-reduce + name-join idiom. The null customerId path is FIRST-CLASS: rows with no
// customer aggregate into a single "Unattributed" bucket (Principle #3 — shadow paths;
// never silently drop a row). Customer names are joined back via the inArray + Map
// pattern from listUsageAuditEntries. See _SPECS/2026-06-30-132039_customer-dimension.md.
export async function getCostByCustomer(days = 7): Promise<CostByCustomerEntry[]> {
  const rows = await db
    .select()
    .from(usageLedger)
    .where(gte(usageLedger.finishedAt, startOfWindow(days)));

  const totals = new Map<
    string,
    {
      customerId: string | null;
      costMicros: number;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      runs: number;
    }
  >();

  rows.forEach((row) => {
    const key = row.customerId ?? "__unattributed__";
    const bucket = totals.get(key) ?? {
      customerId: row.customerId ?? null,
      costMicros: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      runs: 0,
    };
    bucket.costMicros += row.costMicros ?? 0;
    bucket.inputTokens += row.inputTokens ?? 0;
    bucket.outputTokens += row.outputTokens ?? 0;
    bucket.totalTokens += row.totalTokens ?? 0;
    bucket.runs += 1;
    totals.set(key, bucket);
  });

  // Resolve display names for the attributed buckets in one query.
  const customerIds = Array.from(totals.values())
    .map((b) => b.customerId)
    .filter((id): id is string => id != null);
  const customerRows = customerIds.length
    ? await db
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(inArray(customers.id, customerIds))
    : [];
  const nameMap = new Map(customerRows.map((row) => [row.id, row.name]));

  return Array.from(totals.values())
    .map((bucket): CostByCustomerEntry => ({
      customerId: bucket.customerId,
      customerName:
        bucket.customerId == null
          ? "Unattributed"
          : nameMap.get(bucket.customerId) ?? "Unknown customer",
      costMicros: bucket.costMicros,
      inputTokens: bucket.inputTokens,
      outputTokens: bucket.outputTokens,
      totalTokens: bucket.totalTokens,
      runs: bucket.runs,
    }))
    .sort((left, right) => right.costMicros - left.costMicros);
}

export async function listUsageAuditEntries(options?: {
  limit?: number;
  offset?: number;
  statuses?: UsageLedgerStatus[];
  activityTypes?: UsageActivityType[];
  runtimeIds?: string[];
  startedAt?: Date;
  finishedAt?: Date;
}) {
  const conditions = [];
  if (options?.statuses?.length) {
    conditions.push(inArray(usageLedger.status, options.statuses));
  }
  if (options?.activityTypes?.length) {
    conditions.push(inArray(usageLedger.activityType, options.activityTypes));
  }
  if (options?.runtimeIds?.length) {
    conditions.push(inArray(usageLedger.runtimeId, options.runtimeIds));
  }
  if (options?.startedAt) {
    conditions.push(gte(usageLedger.finishedAt, options.startedAt));
  }
  if (options?.finishedAt) {
    conditions.push(lte(usageLedger.finishedAt, options.finishedAt));
  }

  const rows = await db
    .select()
    .from(usageLedger)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(usageLedger.finishedAt));

  const pagedRows = rows.slice(
    options?.offset ?? 0,
    (options?.offset ?? 0) + (options?.limit ?? 50)
  );

  const taskIds = Array.from(
    new Set(pagedRows.map((row) => row.taskId).filter(Boolean))
  ) as string[];
  const workflowIds = Array.from(
    new Set(pagedRows.map((row) => row.workflowId).filter(Boolean))
  ) as string[];
  const scheduleIds = Array.from(
    new Set(pagedRows.map((row) => row.scheduleId).filter(Boolean))
  ) as string[];
  const projectIds = Array.from(
    new Set(pagedRows.map((row) => row.projectId).filter(Boolean))
  ) as string[];

  const [taskRows, workflowRows, scheduleRows, projectRows] = await Promise.all([
    taskIds.length
      ? db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(inArray(tasks.id, taskIds))
      : Promise.resolve([]),
    workflowIds.length
      ? db
          .select({ id: workflows.id, name: workflows.name })
          .from(workflows)
          .where(inArray(workflows.id, workflowIds))
      : Promise.resolve([]),
    scheduleIds.length
      ? db
          .select({ id: schedules.id, name: schedules.name })
          .from(schedules)
          .where(inArray(schedules.id, scheduleIds))
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({ id: projects.id, name: projects.name })
          .from(projects)
          .where(inArray(projects.id, projectIds))
      : Promise.resolve([]),
  ]);

  const taskMap = new Map(taskRows.map((row) => [row.id, row.title]));
  const workflowMap = new Map(workflowRows.map((row) => [row.id, row.name]));
  const scheduleMap = new Map(scheduleRows.map((row) => [row.id, row.name]));
  const projectMap = new Map(projectRows.map((row) => [row.id, row.name]));

  return pagedRows.map(
    (row): UsageAuditEntry => ({
      id: row.id,
      activityType: row.activityType,
      runtimeId: row.runtimeId,
      providerId: row.providerId,
      modelId: row.modelId ?? null,
      status: row.status,
      inputTokens: row.inputTokens ?? null,
      outputTokens: row.outputTokens ?? null,
      totalTokens: row.totalTokens ?? null,
      costMicros: row.costMicros ?? null,
      pricingVersion: row.pricingVersion ?? null,
      usageCompleteness: row.usageCompleteness,
      usageSource: row.usageSource ?? null,
      usageDetails: row.usageDetails ?? null,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      taskId: row.taskId ?? null,
      taskTitle: row.taskId ? taskMap.get(row.taskId) ?? null : null,
      workflowId: row.workflowId ?? null,
      workflowName: row.workflowId
        ? workflowMap.get(row.workflowId) ?? null
        : null,
      scheduleId: row.scheduleId ?? null,
      scheduleName: row.scheduleId
        ? scheduleMap.get(row.scheduleId) ?? null
        : null,
      projectId: row.projectId ?? null,
      projectName: row.projectId ? projectMap.get(row.projectId) ?? null : null,
    })
  );
}
