import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { usageLedger } from "@/lib/db/schema";
import type { UsageCompleteness } from "./ledger";

export interface TaskUsageSummary {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costMicros: number | null;
  modelId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  completeness: UsageCompleteness;
  providerReportedCost: boolean;
}

export async function getTaskUsageSummary(
  taskId: string
): Promise<TaskUsageSummary | undefined> {
  const rows = await db
    .select({
      inputTokens: usageLedger.inputTokens,
      outputTokens: usageLedger.outputTokens,
      totalTokens: usageLedger.totalTokens,
      costMicros: usageLedger.costMicros,
      modelId: usageLedger.modelId,
      startedAt: usageLedger.startedAt,
      finishedAt: usageLedger.finishedAt,
      pricingVersion: usageLedger.pricingVersion,
      usageCompleteness: usageLedger.usageCompleteness,
      status: usageLedger.status,
    })
    .from(usageLedger)
    .where(eq(usageLedger.taskId, taskId))
    .orderBy(desc(usageLedger.finishedAt));

  if (rows.length === 0) return undefined;

  const sumNullable = (
    field: "inputTokens" | "outputTokens" | "totalTokens" | "costMicros"
  ) => {
    const values = rows
      .map((row) => row[field])
      .filter((value): value is number => value != null);
    return values.length > 0
      ? values.reduce((total, value) => total + value, 0)
      : null;
  };
  const hasAnyMeasuredUsage = rows.some(
    (row) => row.totalTokens != null || row.costMicros != null
  );
  const completeness: UsageCompleteness = rows.every(
    (row) =>
      row.usageCompleteness === "complete" && row.status !== "unknown_pricing"
  )
    ? "complete"
    : hasAnyMeasuredUsage
      ? "partial"
      : "unavailable";
  const providerReportedCost = rows.every(
    (row) => row.pricingVersion?.startsWith("runtime-reported:") ?? false
  );
  const startedAt = rows.reduce<Date | null>(
    (earliest, row) =>
      !earliest || row.startedAt < earliest ? row.startedAt : earliest,
    null
  );
  const finishedAt = rows.reduce<Date | null>(
    (latest, row) =>
      !latest || row.finishedAt > latest ? row.finishedAt : latest,
    null
  );

  return {
    inputTokens: sumNullable("inputTokens"),
    outputTokens: sumNullable("outputTokens"),
    totalTokens: sumNullable("totalTokens"),
    costMicros: sumNullable("costMicros"),
    modelId: rows.find((row) => row.modelId)?.modelId ?? null,
    startedAt: startedAt?.toISOString() ?? null,
    finishedAt: finishedAt?.toISOString() ?? null,
    completeness,
    providerReportedCost,
  };
}
