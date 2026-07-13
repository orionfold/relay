import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-budget-guardrails-"));
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-17T12:00:00.000Z"));
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

async function loadModules() {
  const { db } = await import("@/lib/db");
  const schema = await import("@/lib/db/schema");
  const ledger = await import("@/lib/usage/ledger");
  const budgets = await import("../budget-guardrails");
  const auth = await import("../auth");

  return { db, ...schema, ...ledger, ...budgets, ...auth };
}

describe("budget guardrails", () => {
  it("emits one warning notification per window after a cap crosses 80%", async () => {
    const {
      db,
      notifications,
      recordUsageLedgerEntry,
      setBudgetPolicy,
      enforceBudgetGuardrails,
      setAuthSettings,
    } = await loadModules();

    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    await setAuthSettings({ method: "api_key" });

    await setBudgetPolicy({
      overall: {
        monthlySpendCapUsd: 0.36,
      },
      runtimes: {
        "claude-code": {
          monthlySpendCapUsd: 0.36,
        },
        "openai-codex-app-server": {
          monthlySpendCapUsd: null,
        },
        "anthropic-direct": {
          monthlySpendCapUsd: null,
        },
        "openai-direct": {
          monthlySpendCapUsd: null,
        },
        ollama: {
          monthlySpendCapUsd: null,
        },
      },
    });

    const now = new Date();
    await recordUsageLedgerEntry({
      activityType: "task_run",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      inputTokens: 1_000,
      outputTokens: 500,
      totalTokens: 1_500,
      status: "completed",
      startedAt: new Date(now.getTime() - 60_000),
      finishedAt: now,
    });

    await enforceBudgetGuardrails({
      runtimeId: "claude-code",
      activityType: "task_assist",
    });
    await enforceBudgetGuardrails({
      runtimeId: "claude-code",
      activityType: "task_assist",
    });

    const rows = await db.select().from(notifications);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.type === "budget_alert")).toBe(true);
    expect(rows.some((row) => row.title.includes("Overall daily spend"))).toBe(true);
    expect(rows.some((row) => row.title.includes("Claude Code daily spend"))).toBe(true);
  });

  it("blocks new runtime activity, records a zero-cost ledger row, and fails queued tasks when requested", async () => {
    const {
      db,
      notifications,
      tasks,
      usageLedger,
      recordUsageLedgerEntry,
      setBudgetPolicy,
      enforceTaskBudgetGuardrails,
      BudgetLimitExceededError,
      setAuthSettings,
    } = await loadModules();

    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    await setAuthSettings({ method: "api_key" });

    const taskId = crypto.randomUUID();
    const now = new Date();

    await db.insert(tasks).values({
      id: taskId,
      projectId: null,
      workflowId: null,
      scheduleId: null,
      title: "Budget blocked task",
      description: "Should not start",
      status: "queued",
      assignedAgent: "claude-code",
      agentProfile: "general",
      priority: 1,
      result: null,
      sessionId: null,
      resumeCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await setBudgetPolicy({
      overall: {
        monthlySpendCapUsd: 0.001,
      },
      runtimes: {
        "claude-code": {
          monthlySpendCapUsd: 0.001,
        },
        "openai-codex-app-server": {
          monthlySpendCapUsd: null,
        },
        "anthropic-direct": {
          monthlySpendCapUsd: null,
        },
        "openai-direct": {
          monthlySpendCapUsd: null,
        },
        ollama: {
          monthlySpendCapUsd: null,
        },
      },
    });

    await recordUsageLedgerEntry({
      taskId,
      activityType: "task_run",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      inputTokens: 80,
      outputTokens: 40,
      totalTokens: 120,
      status: "completed",
      startedAt: new Date(now.getTime() - 60_000),
      finishedAt: new Date(now.getTime() - 30_000),
    });

    await expect(
      enforceTaskBudgetGuardrails(taskId, { failTaskOnBlock: true })
    ).rejects.toBeInstanceOf(BudgetLimitExceededError);

    const [task] = await db.select().from(tasks);
    expect(task?.status).toBe("failed");
    expect(task?.result).toContain("spend");

    const ledgerRows = await db.select().from(usageLedger);
    const blockedRow = ledgerRows.find((row) => row.status === "blocked");
    expect(blockedRow).toEqual(
      expect.objectContaining({
        taskId,
        runtimeId: "claude-code",
        providerId: "anthropic",
        status: "blocked",
        costMicros: 0,
        pricingVersion: "budget-guardrail",
      })
    );

    const budgetNotifications = await db.select().from(notifications);
    expect(budgetNotifications.at(-1)?.title).toContain("blocked");
    expect(budgetNotifications.at(-1)?.body).toContain("spend");
  });

  it("derives daily spend caps from the monthly cap and auto-assigns a single configured runtime", async () => {
    const { setBudgetPolicy, getBudgetGuardrailSnapshot, setAuthSettings } =
      await loadModules();

    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    vi.stubEnv("OPENAI_API_KEY", "");
    await setAuthSettings({ method: "api_key" });

    await setBudgetPolicy({
      overall: {
        monthlySpendCapUsd: 310,
      },
      runtimes: {
        "claude-code": {
          monthlySpendCapUsd: 155,
        },
        "openai-codex-app-server": {
          monthlySpendCapUsd: 155,
        },
        "anthropic-direct": {
          monthlySpendCapUsd: null,
        },
        "openai-direct": {
          monthlySpendCapUsd: null,
        },
        ollama: {
          monthlySpendCapUsd: null,
        },
      },
    });

    const snapshot = await getBudgetGuardrailSnapshot();
    const overallDaily = snapshot.statuses.find(
      (status) => status.scopeId === "overall" && status.window === "daily"
    );
    const claudeMonthly = snapshot.policy.runtimes["claude-code"].monthlySpendCapUsd;
    const openAIMonthly =
      snapshot.policy.runtimes["openai-codex-app-server"].monthlySpendCapUsd;

    expect(overallDaily?.limitValue).toBe(10_000_000);
    expect(claudeMonthly).toBe(310);
    // With anthropic-direct also configured (shares API key), the normalization
    // enters multi-runtime mode and assigns 0 to unconfigured OpenAI runtime
    expect(openAIMonthly).toBe(0);
  });

  it("exposes metered spend separately from the plan-priced budget basis under subscription billing", async () => {
    // A verified OAuth connection means claude-code bills as a flat subscription. The
    // guardrail statuses may use the plan price as the budget basis, but the
    // snapshot must also expose REAL metered spend (usage_ledger sums) so
    // display surfaces never present the plan price as cost.
    const { getBudgetGuardrailSnapshot, setAuthSettings, updateAuthStatus } = await loadModules();
    await setAuthSettings({ method: "oauth" });
    await updateAuthStatus("oauth");

    const snapshot = await getBudgetGuardrailSnapshot();

    // Fresh instance: zero ledger rows → metered spend is exactly 0.
    expect(snapshot.meteredSpend.dailyMicros).toBe(0);
    expect(snapshot.meteredSpend.monthlyMicros).toBe(0);
    expect(snapshot.meteredSpend.dailyCompleteness).toBe("complete");
    expect(snapshot.meteredSpend.monthlyCompleteness).toBe("complete");
    // The flat plan price is surfaced under its own name, not as spend.
    expect(snapshot.planPricedMonthlyMicros).toBe(20_000_000);
    // Guardrail statuses keep the plan-priced budget basis (unchanged behavior).
    const overallMonthly = snapshot.statuses.find(
      (status) => status.scopeId === "overall" && status.window === "monthly"
    );
    expect(overallMonthly?.currentValue).toBe(20_000_000);
  });

  it("reports metered spend from ledger rows and no plan price under usage billing", async () => {
    const {
      db,
      usageLedger,
      recordUsageLedgerEntry,
      getBudgetGuardrailSnapshot,
      setAuthSettings,
    } = await loadModules();

    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    await setAuthSettings({ method: "api_key" });

    const now = new Date();
    await recordUsageLedgerEntry({
      activityType: "task_run",
      runtimeId: "claude-code",
      providerId: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      inputTokens: 1_000,
      outputTokens: 500,
      totalTokens: 1_500,
      status: "completed",
      startedAt: new Date(now.getTime() - 60_000),
      finishedAt: now,
    });

    const [row] = await db.select().from(usageLedger);
    expect(row?.costMicros ?? 0).toBeGreaterThan(0);

    const snapshot = await getBudgetGuardrailSnapshot();
    expect(snapshot.meteredSpend.dailyMicros).toBe(row?.costMicros ?? -1);
    expect(snapshot.meteredSpend.monthlyMicros).toBe(row?.costMicros ?? -1);
    expect(snapshot.meteredSpend.dailyCompleteness).toBe("partial");
    expect(snapshot.meteredSpend.monthlyCompleteness).toBe("partial");
    expect(snapshot.planPricedMonthlyMicros).toBeNull();
  });

  it("splits configured provider caps from the overall budget when both runtimes are configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
    vi.stubEnv("OPENAI_API_KEY", "sk-test-openai");
    const { setBudgetPolicy, getBudgetGuardrailSnapshot, setAuthSettings } =
      await loadModules();
    await setAuthSettings({ method: "api_key" });

    await setBudgetPolicy({
      overall: {
        monthlySpendCapUsd: 300,
      },
      runtimes: {
        "claude-code": {
          monthlySpendCapUsd: 120,
        },
        "openai-codex-app-server": {
          monthlySpendCapUsd: 180,
        },
        "anthropic-direct": {
          monthlySpendCapUsd: null,
        },
        "openai-direct": {
          monthlySpendCapUsd: null,
        },
        ollama: {
          monthlySpendCapUsd: null,
        },
      },
    });

    const snapshot = await getBudgetGuardrailSnapshot();
    expect(snapshot.policy.runtimes["claude-code"].monthlySpendCapUsd).toBe(120);
    expect(snapshot.policy.runtimes["openai-codex-app-server"].monthlySpendCapUsd).toBe(
      180
    );
  });
});
