import type { ScheduleSeed } from "./schedules";
import type { TaskSeed } from "./tasks";
import type { WorkflowSeed } from "./workflows";
import type { UsageLedgerWriteInput } from "@/lib/usage/ledger";

/**
 * Generate 45 usage ledger entries spread over 21 days with 3 runtimes.
 * This produces rich data for the Cost & Usage dashboard charts.
 */
export function createUsageLedgerSeeds(input: {
  tasks: TaskSeed[];
  workflows: WorkflowSeed[];
  schedules: ScheduleSeed[];
}): UsageLedgerWriteInput[] {
  const completedTasks = input.tasks.filter((t) => t.status === "completed");
  const runningTasks = input.tasks.filter((t) => t.status === "running");
  const failedTasks = input.tasks.filter((t) => t.status === "failed");

  const now = Date.now();
  const HOUR = 3_600_000;
  const DAY = 86_400_000;

  // Runtimes
  const receiptEvidence = {
    usageCompleteness: "complete" as const,
    usageSource: "seed-fixture",
  };
  const claude = { runtimeId: "claude-agent-sdk", providerId: "anthropic", modelId: "sonnet", ...receiptEvidence };
  const codex = { runtimeId: "openai-codex-app-server", providerId: "openai", modelId: "codex-mini-latest", ...receiptEvidence };
  const ollama = { runtimeId: "ollama", providerId: "local", modelId: "llama-3.1-8b", ...receiptEvidence };

  const seeds: UsageLedgerWriteInput[] = [];

  // ── task_run entries (15) — spread across 21 days ─────────────────
  completedTasks.slice(0, 10).forEach((task, i) => {
    const daysAgo = 20 - i * 2;
    const runtime = i % 3 === 0 ? codex : i % 3 === 1 ? ollama : claude;
    seeds.push({
      taskId: task.id,
      projectId: task.projectId,
      activityType: "task_run",
      ...runtime,
      status: "completed",
      inputTokens: 1800 + i * 400,
      outputTokens: 800 + i * 200,
      totalTokens: 2600 + i * 600,
      startedAt: new Date(now - daysAgo * DAY),
      finishedAt: new Date(now - daysAgo * DAY + 90_000 + i * 15_000),
    });
  });

  // Running tasks — in progress
  runningTasks.slice(0, 3).forEach((task, i) => {
    seeds.push({
      taskId: task.id,
      projectId: task.projectId,
      activityType: "task_run",
      ...claude,
      status: "completed",
      inputTokens: 2200 + i * 300,
      outputTokens: 900 + i * 150,
      totalTokens: 3100 + i * 450,
      startedAt: new Date(now - (4 + i) * HOUR),
      finishedAt: new Date(now - (4 + i) * HOUR + 120_000),
    });
  });

  // Failed tasks
  failedTasks.forEach((task, i) => {
    seeds.push({
      taskId: task.id,
      projectId: task.projectId,
      activityType: "task_run",
      ...(i === 0 ? claude : codex),
      status: "failed",
      inputTokens: 600 + i * 200,
      outputTokens: 0,
      totalTokens: 600 + i * 200,
      startedAt: new Date(now - (7 - i) * DAY),
      finishedAt: new Date(now - (7 - i) * DAY + 30_000),
    });
  });

  // ── workflow_step entries (8) ─────────────────────────────────────
  input.workflows.slice(0, 4).forEach((wf, i) => {
    const stepsPerWorkflow = 2;
    for (let s = 0; s < stepsPerWorkflow; s++) {
      const daysAgo = 18 - i * 3 - s;
      const runtime = i % 2 === 0 ? claude : codex;
      seeds.push({
        workflowId: wf.id,
        projectId: wf.projectId,
        activityType: "workflow_step",
        ...runtime,
        status: "completed",
        inputTokens: 2800 + s * 500,
        outputTokens: 1400 + s * 250,
        totalTokens: 4200 + s * 750,
        startedAt: new Date(now - daysAgo * DAY),
        finishedAt: new Date(now - daysAgo * DAY + 140_000),
      });
    }
  });

  // ── scheduled_firing entries (6) ──────────────────────────────────
  input.schedules.filter((s) => s.firingCount > 0).slice(0, 3).forEach((sched, i) => {
    for (let f = 0; f < 2; f++) {
      const daysAgo = 14 - i * 4 - f * 2;
      const runtime = sched.type === "heartbeat" ? ollama : claude;
      seeds.push({
        scheduleId: sched.id,
        projectId: sched.projectId,
        activityType: "scheduled_firing",
        ...runtime,
        status: "completed",
        inputTokens: 1200 + f * 300,
        outputTokens: 500 + f * 150,
        totalTokens: 1700 + f * 450,
        startedAt: new Date(now - daysAgo * DAY),
        finishedAt: new Date(now - daysAgo * DAY + 60_000),
      });
    }
  });

  // ── task_assist entries (5) ───────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    const daysAgo = 15 - i * 3;
    const runtime = i % 3 === 0 ? claude : i % 3 === 1 ? codex : ollama;
    seeds.push({
      activityType: "task_assist",
      ...runtime,
      status: "completed",
      inputTokens: 500 + i * 100,
      outputTokens: 200 + i * 60,
      totalTokens: 700 + i * 160,
      startedAt: new Date(now - daysAgo * DAY),
      finishedAt: new Date(now - daysAgo * DAY + 15_000),
    });
  }

  // ── chat_turn entries (4) ─────────────────────────────────────────
  for (let i = 0; i < 4; i++) {
    const hoursAgo = 8 + i * 12;
    const runtime = i % 2 === 0 ? claude : ollama;
    seeds.push({
      activityType: "chat_turn",
      ...runtime,
      status: "completed",
      inputTokens: 800 + i * 200,
      outputTokens: 400 + i * 100,
      totalTokens: 1200 + i * 300,
      startedAt: new Date(now - hoursAgo * HOUR),
      finishedAt: new Date(now - hoursAgo * HOUR + 8_000),
    });
  }

  // ── profile_test entries (3) ──────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const daysAgo = 10 - i * 4;
    seeds.push({
      activityType: "profile_test",
      ...claude,
      status: "completed",
      inputTokens: 1000 + i * 200,
      outputTokens: 500 + i * 100,
      totalTokens: 1500 + i * 300,
      startedAt: new Date(now - daysAgo * DAY),
      finishedAt: new Date(now - daysAgo * DAY + 30_000),
    });
  }

  // ── task_resume entries (2) ───────────────────────────────────────
  runningTasks.slice(0, 2).forEach((task, i) => {
    seeds.push({
      taskId: task.id,
      projectId: task.projectId,
      activityType: "task_resume",
      ...claude,
      status: "completed",
      inputTokens: 3000 + i * 500,
      outputTokens: 1500 + i * 200,
      totalTokens: 4500 + i * 700,
      startedAt: new Date(now - (2 + i) * HOUR),
      finishedAt: new Date(now - (2 + i) * HOUR + 100_000),
    });
  });

  // ── pattern_extraction (1) ────────────────────────────────────────
  seeds.push({
    activityType: "pattern_extraction",
    ...claude,
    status: "completed",
    inputTokens: 1800,
    outputTokens: 600,
    totalTokens: 2400,
    startedAt: new Date(now - 5 * DAY),
    finishedAt: new Date(now - 5 * DAY + 25_000),
  });

  // ── context_summarization (1) ─────────────────────────────────────
  seeds.push({
    activityType: "context_summarization",
    ...ollama,
    status: "completed",
    inputTokens: 2200,
    outputTokens: 400,
    totalTokens: 2600,
    startedAt: new Date(now - 3 * DAY),
    finishedAt: new Date(now - 3 * DAY + 18_000),
  });

  return seeds;
}
