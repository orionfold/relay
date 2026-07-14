import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "relay-schedule-budget-"));
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-14T12:00:00.000Z"));
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

async function loadModules() {
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  const policies = await import("../budget-policies");
  const { recordUsageLedgerEntry } = await import("@/lib/usage/ledger");
  return { db, ...schema, ...policies, recordUsageLedgerEntry };
}

async function insertSchedule(
  modules: Awaited<ReturnType<typeof loadModules>>,
  id = "standalone-schedule"
) {
  const now = new Date();
  await modules.db.insert(modules.schedules).values({
    id,
    projectId: null,
    name: "Budgeted schedule",
    prompt: "Run safely",
    cronExpression: "0 9 * * *",
    recurs: true,
    status: "active",
    firingCount: 0,
    type: "scheduled",
    suppressionCount: 0,
    heartbeatSpentToday: 0,
    failureStreak: 0,
    turnBudgetBreachStreak: 0,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

describe("schedule usage budget policies", () => {
  it("rejects empty and non-positive effective policies", async () => {
    const modules = await loadModules();
    expect(
      modules.updateUsageBudgetPolicySchema.safeParse({
        enabled: true,
        onExceed: "pause",
        maxCostPerRunUsd: null,
        maxCostPerDayUsd: null,
        maxCostPerMonthUsd: null,
        sourceRecommendationId: null,
      }).success
    ).toBe(false);
    expect(
      modules.updateUsageBudgetPolicySchema.safeParse({
        maxCostPerRunUsd: -1,
      }).success
    ).toBe(false);
  });

  it("serializes concurrent runs that share an accepted policy", async () => {
    const modules = await loadModules();
    const scheduleId = await insertSchedule(modules);
    await modules.upsertUsageBudgetPolicy({
      scopeType: "schedule",
      scopeId: scheduleId,
      policy: {
        enabled: true,
        onExceed: "pause",
        maxCostPerRunUsd: 1,
        maxCostPerDayUsd: null,
        maxCostPerMonthUsd: null,
        sourceRecommendationId: null,
      },
    });

    const first = await modules.beginScheduleBudgetRun({
      scheduleId,
      runId: "run-1",
    });
    const second = await modules.beginScheduleBudgetRun({
      scheduleId,
      runId: "run-2",
    });

    expect(first.status).toBe("allowed");
    expect(second.status).toBe("busy");
    await modules.releaseScheduleBudgetRun(
      first.status === "allowed" ? first.claim : null
    );
    await expect(
      modules.beginScheduleBudgetRun({ scheduleId, runId: "run-3" })
    ).resolves.toMatchObject({ status: "allowed" });
  });

  it("recovers a corrupt claim with no expiry instead of blocking forever", async () => {
    const modules = await loadModules();
    const scheduleId = await insertSchedule(modules, "stale-claim-schedule");
    await modules.upsertUsageBudgetPolicy({
      scopeType: "schedule",
      scopeId: scheduleId,
      policy: {
        enabled: true,
        onExceed: "pause",
        maxCostPerRunUsd: 1,
        maxCostPerDayUsd: null,
        maxCostPerMonthUsd: null,
        sourceRecommendationId: null,
      },
    });
    await modules.db
      .update(modules.usageBudgetPolicies)
      .set({
        activeRunId: "orphaned-run",
        activeScheduleId: scheduleId,
        claimExpiresAt: null,
      });

    await expect(
      modules.beginScheduleBudgetRun({ scheduleId, runId: "recovered-run" })
    ).resolves.toMatchObject({ status: "allowed" });
  });

  it("combines matching app and schedule policies and uses the strictest run cap", async () => {
    const modules = await loadModules();
    const scheduleId = await insertSchedule(modules, "app:cost-app:daily");
    const now = new Date();
    await modules.db.insert(modules.usageBudgetPolicies).values([
      {
        id: "usage-budget:app:cost-app",
        scopeType: "app",
        scopeId: "cost-app",
        appId: "cost-app",
        enabled: true,
        onExceed: "pause",
        maxCostPerRunMicros: 400_000,
        notificationState: "{}",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: `usage-budget:schedule:${scheduleId}`,
        scopeType: "schedule",
        scopeId: scheduleId,
        appId: "cost-app",
        scheduleId,
        enabled: true,
        onExceed: "pause",
        maxCostPerRunMicros: 200_000,
        notificationState: "{}",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const result = await modules.beginScheduleBudgetRun({
      scheduleId,
      runId: "combined-run",
    });
    expect(result).toMatchObject({
      status: "allowed",
      claim: { strictestPerRunUsd: 0.2 },
    });
    if (result.status === "allowed") {
      expect(result.claim?.policyIds).toHaveLength(2);
      await modules.releaseScheduleBudgetRun(result.claim);
    }
  });

  it("pauses only the affected schedule and deduplicates a daily breach alert", async () => {
    const modules = await loadModules();
    const scheduleId = await insertSchedule(modules, "limited-schedule");
    const otherId = await insertSchedule(modules, "unaffected-schedule");
    await modules.upsertUsageBudgetPolicy({
      scopeType: "schedule",
      scopeId: scheduleId,
      policy: {
        enabled: true,
        onExceed: "pause",
        maxCostPerRunUsd: null,
        maxCostPerDayUsd: 0.5,
        maxCostPerMonthUsd: null,
        sourceRecommendationId: null,
      },
    });

    const startedAt = new Date();
    const begun = await modules.beginScheduleBudgetRun({
      scheduleId,
      runId: "daily-run",
      now: startedAt,
    });
    expect(begun.status).toBe("allowed");
    if (begun.status !== "allowed") throw new Error("run was not allowed");

    await modules.recordUsageLedgerEntry({
      scheduleId,
      activityType: "scheduled_firing",
      runtimeId: "test-runtime",
      providerId: "test-provider",
      reportedCostMicros: 600_000,
      usageCompleteness: "complete",
      status: "completed",
      startedAt,
      finishedAt: new Date(startedAt.getTime() + 1_000),
    });
    await modules.completeScheduleBudgetRun({ claim: begun.claim });

    const rows = await modules.db.select().from(modules.schedules);
    expect(rows.find((row) => row.id === scheduleId)?.status).toBe("paused");
    expect(rows.find((row) => row.id === otherId)?.status).toBe("active");

    await modules.db
      .update(modules.schedules)
      .set({ status: "active", updatedAt: new Date() })
      .where((await import("drizzle-orm")).eq(modules.schedules.id, scheduleId));
    await expect(
      modules.beginScheduleBudgetRun({ scheduleId, runId: "blocked-run" })
    ).resolves.toMatchObject({ status: "blocked" });
    const alerts = await modules.db.select().from(modules.notifications);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("budget_alert");
  });

  it("surfaces unavailable run measurement and releases the claim", async () => {
    const modules = await loadModules();
    const scheduleId = await insertSchedule(modules, "unmetered-schedule");
    await modules.upsertUsageBudgetPolicy({
      scopeType: "schedule",
      scopeId: scheduleId,
      policy: {
        enabled: true,
        onExceed: "pause",
        maxCostPerRunUsd: 0.25,
        maxCostPerDayUsd: null,
        maxCostPerMonthUsd: null,
        sourceRecommendationId: null,
      },
    });
    const begun = await modules.beginScheduleBudgetRun({
      scheduleId,
      runId: "unmetered-run",
    });
    if (begun.status !== "allowed") throw new Error("run was not allowed");

    await modules.completeScheduleBudgetRun({ claim: begun.claim });

    const [schedule] = await modules.db.select().from(modules.schedules);
    const [policy] = await modules.db.select().from(modules.usageBudgetPolicies);
    expect(schedule.status).toBe("paused");
    expect(policy.lastBreachKind).toBe("measurement_unavailable");
    expect(policy.activeRunId).toBeNull();
  });

  it("notifies but permits execution when a notify-only daily limit is reached", async () => {
    const modules = await loadModules();
    const scheduleId = await insertSchedule(modules, "notify-schedule");
    const now = new Date();
    await modules.recordUsageLedgerEntry({
      scheduleId,
      activityType: "scheduled_firing",
      runtimeId: "test-runtime",
      providerId: "test-provider",
      reportedCostMicros: 600_000,
      usageCompleteness: "complete",
      status: "completed",
      startedAt: new Date(now.getTime() - 2_000),
      finishedAt: new Date(now.getTime() - 1_000),
    });
    await modules.upsertUsageBudgetPolicy({
      scopeType: "schedule",
      scopeId: scheduleId,
      policy: {
        enabled: true,
        onExceed: "notify",
        maxCostPerRunUsd: null,
        maxCostPerDayUsd: 0.5,
        maxCostPerMonthUsd: null,
        sourceRecommendationId: null,
      },
    });

    const result = await modules.beginScheduleBudgetRun({
      scheduleId,
      runId: "notify-run",
    });
    expect(result.status).toBe("allowed");
    const [schedule] = await modules.db.select().from(modules.schedules);
    const alerts = await modules.db.select().from(modules.notifications);
    expect(schedule.status).toBe("active");
    expect(alerts).toHaveLength(1);
    if (result.status === "allowed") {
      await modules.releaseScheduleBudgetRun(result.claim);
    }
  });
});
