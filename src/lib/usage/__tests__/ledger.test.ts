import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-usage-ledger-"));
  vi.resetModules();
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

async function loadUsageModules() {
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  const ledger = await import("../ledger");

  return { db, ...schema, ...ledger };
}

function formatLocalDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

describe("usage ledger", () => {
  it("records normalized ledger rows with derived, fallback, and unknown pricing states", async () => {
    const { db, usageLedger, recordUsageLedgerEntry } = await loadUsageModules();

    // Known model — gets specific pricing rule
    await recordUsageLedgerEntry({
      activityType: "task_assist",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      inputTokens: 1_000,
      outputTokens: 500,
      totalTokens: 1_500,
      status: "completed",
      startedAt: new Date("2026-03-10T08:00:00.000Z"),
      finishedAt: new Date("2026-03-10T08:01:00.000Z"),
    });

    // Unknown model — hits catch-all fallback pricing (conservative estimate)
    await recordUsageLedgerEntry({
      activityType: "task_assist",
      runtimeId: "openai-codex-app-server",
      providerId: "openai",
      modelId: "codex-unknown",
      inputTokens: 800,
      outputTokens: 300,
      totalTokens: 1_100,
      status: "completed",
      startedAt: new Date("2026-03-10T09:00:00.000Z"),
      finishedAt: new Date("2026-03-10T09:01:00.000Z"),
    });

    // Null modelId — gets unknown_pricing (no model to match)
    await recordUsageLedgerEntry({
      activityType: "task_run",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: null,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      status: "completed",
      startedAt: new Date("2026-03-10T10:00:00.000Z"),
      finishedAt: new Date("2026-03-10T10:01:00.000Z"),
    });

    const rows = await db.select().from(usageLedger);
    expect(rows).toHaveLength(3);

    // Known: specific pricing
    const priced = rows.find((row) => row.modelId === "claude-sonnet-4-20250514");
    expect(priced?.costMicros).toBe(10_500);
    expect(priced?.status).toBe("completed");
    expect(priced?.pricingVersion).toBe("anthropic-claude-sonnet");

    // Unknown model: fallback pricing (conservative Opus-tier for OpenAI: $10/$30)
    const fallback = rows.find((row) => row.modelId === "codex-unknown");
    expect(fallback?.costMicros).toBeGreaterThan(0);
    expect(fallback?.status).toBe("completed");
    expect(fallback?.pricingVersion).toBe("openai-fallback");

    // Null modelId: truly unknown
    const unknown = rows.find((row) => row.modelId === null);
    expect(unknown?.costMicros).toBeNull();
    expect(unknown?.status).toBe("unknown_pricing");
    expect(unknown?.pricingVersion).toBeNull();
  });

  it("records local Ollama usage as an explicit $0 row, not unknown pricing", async () => {
    // Local inference is known-free — a $0 row is the evidence for the
    // "prove the savings" blended-cost story (fix-chat-spend-metering-diagnose).
    // unknown_pricing would hide exactly the runs that demonstrate savings.
    const { db, usageLedger, recordUsageLedgerEntry } = await loadUsageModules();

    await recordUsageLedgerEntry({
      activityType: "chat_turn",
      runtimeId: "ollama",
      providerId: "ollama",
      modelId: "llama3.2",
      inputTokens: 900,
      outputTokens: 400,
      totalTokens: 1_300,
      status: "completed",
      startedAt: new Date("2026-03-10T08:00:00.000Z"),
      finishedAt: new Date("2026-03-10T08:01:00.000Z"),
    });

    const [row] = await db.select().from(usageLedger);
    expect(row?.status).toBe("completed");
    expect(row?.costMicros).toBe(0);
    expect(row?.pricingVersion).toBe("local-free");
  });

  it("aggregates daily totals, provider breakdowns, and audit entries with joins", async () => {
    const {
      db,
      projects,
      workflows,
      schedules,
      tasks,
      getDailySpendTotals,
      getDailyTokenTotals,
      getProviderModelBreakdown,
      listUsageAuditEntries,
      recordUsageLedgerEntry,
    } = await loadUsageModules();

    const projectId = crypto.randomUUID();
    const workflowId = crypto.randomUUID();
    const scheduleId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const firstFinish = new Date(now.getTime() - 60_000);
    const secondFinish = new Date(now.getTime() - 30_000);
    const expectedDay = formatLocalDay(firstFinish);

    await db.insert(projects).values({
      id: projectId,
      name: "Usage Project",
      description: null,
      workingDirectory: null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(workflows).values({
      id: workflowId,
      projectId,
      name: "Usage Workflow",
      definition: JSON.stringify({ pattern: "sequence", steps: [] }),
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(schedules).values({
      id: scheduleId,
      projectId,
      name: "Usage Schedule",
      prompt: "Run metering check",
      cronExpression: "0 9 * * *",
      assignedAgent: "claude-code",
      agentProfile: null,
      recurs: true,
      status: "active",
      maxFirings: null,
      firingCount: 0,
      expiresAt: null,
      lastFiredAt: null,
      nextFireAt: now,
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(tasks).values({
      id: taskId,
      projectId,
      workflowId,
      scheduleId,
      title: "Usage Task",
      description: "Verify usage joins",
      status: "completed",
      assignedAgent: "claude-code",
      agentProfile: "general",
      priority: 1,
      result: "ok",
      sessionId: null,
      resumeCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await recordUsageLedgerEntry({
      taskId,
      workflowId,
      scheduleId,
      projectId,
      activityType: "workflow_step",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      inputTokens: 2_000,
      outputTokens: 1_000,
      totalTokens: 3_000,
      status: "completed",
      startedAt: new Date(firstFinish.getTime() - 60_000),
      finishedAt: firstFinish,
    });

    await recordUsageLedgerEntry({
      activityType: "task_assist",
      runtimeId: "openai-codex-app-server",
      providerId: "openai",
      modelId: "codex-mini-latest",
      inputTokens: 1_500,
      outputTokens: 600,
      totalTokens: 2_100,
      status: "completed",
      startedAt: new Date(secondFinish.getTime() - 60_000),
      finishedAt: secondFinish,
    });

    const spendTotals = await getDailySpendTotals(7);
    expect(spendTotals).toEqual([
      {
        day: expectedDay,
        costMicros: 26_850,
      },
    ]);

    const tokenTotals = await getDailyTokenTotals(7);
    expect(tokenTotals).toEqual([
      {
        day: expectedDay,
        inputTokens: 3_500,
        outputTokens: 1_600,
        totalTokens: 5_100,
      },
    ]);

    const breakdown = await getProviderModelBreakdown();
    expect(breakdown).toEqual([
      expect.objectContaining({
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        costMicros: 21_000,
        runs: 1,
        unknownPricingRuns: 0,
      }),
      expect.objectContaining({
        providerId: "openai",
        modelId: "codex-mini-latest",
        costMicros: 5_850,
        runs: 1,
        unknownPricingRuns: 0,
      }),
    ]);

    const auditEntries = await listUsageAuditEntries({ limit: 10 });
    const workflowEntry = auditEntries.find((entry) => entry.taskId === taskId);
    expect(workflowEntry).toEqual(
      expect.objectContaining({
        taskTitle: "Usage Task",
        workflowName: "Usage Workflow",
        scheduleName: "Usage Schedule",
        projectName: "Usage Project",
      })
    );
  });

  it("persists customerId when supplied and null when absent", async () => {
    const { db, customers, usageLedger, recordUsageLedgerEntry } = await loadUsageModules();
    const customerId = crypto.randomUUID();
    const now = new Date("2026-03-12T00:00:00.000Z");

    await db.insert(customers).values({
      id: customerId,
      name: "Acme Realty",
      slug: "acme-realty",
      status: "active",
      industry: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    await recordUsageLedgerEntry({
      activityType: "task_assist",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      status: "completed",
      customerId,
      startedAt: new Date("2026-03-12T08:00:00.000Z"),
      finishedAt: new Date("2026-03-12T08:01:00.000Z"),
    });

    await recordUsageLedgerEntry({
      activityType: "task_assist",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      status: "completed",
      startedAt: new Date("2026-03-12T09:00:00.000Z"),
      finishedAt: new Date("2026-03-12T09:01:00.000Z"),
    });

    const rows = await db.select().from(usageLedger);
    expect(rows).toHaveLength(2);

    const attributed = rows.find(
      (row) => row.finishedAt.getTime() === new Date("2026-03-12T08:01:00.000Z").getTime()
    );
    const unattributed = rows.find(
      (row) => row.finishedAt.getTime() === new Date("2026-03-12T09:01:00.000Z").getTime()
    );
    expect(attributed?.customerId).toBe(customerId);
    expect(unattributed?.customerId).toBeNull();
  });

  it("inherits customerId from the project when not explicitly supplied", async () => {
    const { db, customers, projects, recordUsageLedgerEntry, usageLedger } =
      await loadUsageModules();
    const customerId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const now = new Date("2026-03-13T00:00:00.000Z");

    await db.insert(customers).values({
      id: customerId,
      name: "Beacon Nonprofit",
      slug: "beacon-nonprofit",
      status: "active",
      industry: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(projects).values({
      id: projectId,
      name: "Beacon Annual Report",
      description: null,
      workingDirectory: null,
      customerId,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // No customerId in the input — it must be resolved from project.customerId.
    await recordUsageLedgerEntry({
      projectId,
      activityType: "task_run",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      status: "completed",
      startedAt: new Date("2026-03-13T08:00:00.000Z"),
      finishedAt: new Date("2026-03-13T08:01:00.000Z"),
    });

    const [row] = await db.select().from(usageLedger);
    expect(row.projectId).toBe(projectId);
    expect(row.customerId).toBe(customerId);
  });

  it("rolls up cost per customer and buckets unattributed spend", async () => {
    const { db, customers, recordUsageLedgerEntry, getCostByCustomer } =
      await loadUsageModules();
    const customerId = crypto.randomUUID();
    const now = new Date();
    now.setMinutes(0, 0, 0);
    const finish = new Date(now.getTime() - 60_000);

    await db.insert(customers).values({
      id: customerId,
      name: "Meridian Commercial Realty",
      slug: "meridian-cre",
      status: "active",
      industry: "CRE",
      notes: null,
      createdAt: now,
      updatedAt: now,
    });

    // Two attributed entries for the same customer (should sum into one bucket).
    for (const offset of [0, 30_000]) {
      await recordUsageLedgerEntry({
        activityType: "task_assist",
        runtimeId: "claude-code",
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        inputTokens: 1_000,
        outputTokens: 500,
        totalTokens: 1_500,
        status: "completed",
        customerId,
        startedAt: new Date(finish.getTime() - 60_000 + offset),
        finishedAt: new Date(finish.getTime() + offset),
      });
    }

    // One entry with no customer — must land in the "Unattributed" bucket, not dropped.
    await recordUsageLedgerEntry({
      activityType: "task_run",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      inputTokens: 200,
      outputTokens: 100,
      totalTokens: 300,
      status: "completed",
      startedAt: new Date(finish.getTime() - 60_000),
      finishedAt: finish,
    });

    const rollup = await getCostByCustomer(7);

    const meridian = rollup.find((r) => r.customerId === customerId);
    expect(meridian).toBeDefined();
    expect(meridian?.customerName).toBe("Meridian Commercial Realty");
    expect(meridian?.runs).toBe(2);
    expect(meridian?.totalTokens).toBe(3_000);
    expect(meridian?.costMicros).toBe(21_000); // 2 × 10,500 (sonnet $3/$15 on 1k/500)

    const unattributed = rollup.find((r) => r.customerId === null);
    expect(unattributed).toBeDefined();
    expect(unattributed?.customerName).toBe("Unattributed");
    expect(unattributed?.runs).toBe(1);
    expect(unattributed?.totalTokens).toBe(300);
  });

  it("filters audit rows by runtime, status, activity type, and date range", async () => {
    const { listUsageAuditEntries, recordUsageLedgerEntry } = await loadUsageModules();

    await recordUsageLedgerEntry({
      activityType: "task_assist",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      inputTokens: 400,
      outputTokens: 200,
      totalTokens: 600,
      status: "completed",
      startedAt: new Date("2026-03-10T08:00:00.000Z"),
      finishedAt: new Date("2026-03-10T08:01:00.000Z"),
    });

    await recordUsageLedgerEntry({
      activityType: "task_run",
      runtimeId: "openai-codex-app-server",
      providerId: "openai",
      modelId: "codex-mini-latest",
      inputTokens: 600,
      outputTokens: 300,
      totalTokens: 900,
      status: "failed",
      startedAt: new Date("2026-03-11T09:00:00.000Z"),
      finishedAt: new Date("2026-03-11T09:01:00.000Z"),
    });

    const filtered = await listUsageAuditEntries({
      runtimeIds: ["openai-codex-app-server"],
      statuses: ["failed"],
      activityTypes: ["task_run"],
      startedAt: new Date("2026-03-11T00:00:00.000Z"),
      finishedAt: new Date("2026-03-11T23:59:59.999Z"),
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toEqual(
      expect.objectContaining({
        runtimeId: "openai-codex-app-server",
        status: "failed",
        activityType: "task_run",
      })
    );
  });
});
