import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("GET /api/tasks/[id]/history", () => {
  let tempDataDir: string;
  const originalDataDir = process.env.RELAY_DATA_DIR;

  beforeEach(() => {
    tempDataDir = mkdtempSync(join(tmpdir(), "relay-task-history-"));
    process.env.RELAY_DATA_DIR = tempDataDir;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.RELAY_DATA_DIR = originalDataDir;
    rmSync(tempDataDir, { recursive: true, force: true });
  });

  async function load() {
    const { db } = await import("@/lib/db");
    const { tasks, agentLogs, notifications, usageLedger } = await import("@/lib/db/schema");
    const { GET } = await import("../route");
    return { db, tasks, agentLogs, notifications, usageLedger, GET };
  }

  it("returns 404 for an unknown task", async () => {
    const { GET } = await load();
    const response = await GET(new Request("http://test") as never, {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("distinguishes a never-run task from unavailable terminal history", async () => {
    const { db, tasks, GET } = await load();
    const now = new Date("2026-07-12T15:00:00.000Z");
    db.insert(tasks).values([
      {
        id: "never-run",
        title: "Never run",
        status: "planned",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "pruned-terminal",
        title: "Pruned terminal",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      },
    ]).run();

    const neverRun = await GET(new Request("http://test") as never, {
      params: Promise.resolve({ id: "never-run" }),
    });
    await expect(neverRun.json()).resolves.toMatchObject({
      runs: [],
      totalRuns: 0,
      historyUnavailable: false,
    });

    const pruned = await GET(new Request("http://test") as never, {
      params: Promise.resolve({ id: "pruned-terminal" }),
    });
    await expect(pruned.json()).resolves.toMatchObject({
      runs: [],
      totalRuns: 0,
      historyUnavailable: true,
    });
  });

  it("returns newest-first completed and failed attempts with isolated logs", async () => {
    const { db, tasks, agentLogs, usageLedger, GET } = await load();
    const firstStart = new Date("2026-07-12T15:00:00.000Z");
    const firstFinish = new Date("2026-07-12T15:02:00.000Z");
    const secondStart = new Date("2026-07-12T16:00:00.000Z");
    const secondFinish = new Date("2026-07-12T16:01:00.000Z");
    db.insert(tasks).values({
      id: "multiple-runs",
      title: "Multiple runs",
      status: "failed",
      effectiveRuntimeId: "openai-direct",
      createdAt: firstStart,
      updatedAt: secondFinish,
    }).run();
    db.insert(usageLedger).values([
      {
        id: "run-completed",
        taskId: "multiple-runs",
        activityType: "task_run",
        runtimeId: "claude-code",
        providerId: "anthropic",
        modelId: "claude-sonnet-4",
        status: "completed",
        totalTokens: 200,
        startedAt: firstStart,
        finishedAt: firstFinish,
      },
      {
        id: "run-failed",
        taskId: "multiple-runs",
        activityType: "task_resume",
        runtimeId: "openai-direct",
        providerId: "openai",
        modelId: "gpt-5",
        status: "failed",
        totalTokens: 50,
        startedAt: secondStart,
        finishedAt: secondFinish,
      },
    ]).run();
    db.insert(agentLogs).values([
      {
        id: "log-first",
        taskId: "multiple-runs",
        agentType: "general",
        event: "completed",
        payload: '{"result":"first"}',
        timestamp: firstFinish,
      },
      {
        id: "log-second",
        taskId: "multiple-runs",
        agentType: "general",
        event: "failed",
        payload: '{"error":"second"}',
        timestamp: secondFinish,
      },
    ]).run();

    const response = await GET(new Request("http://test") as never, {
      params: Promise.resolve({ id: "multiple-runs" }),
    });
    const body = await response.json();
    expect(body.totalRuns).toBe(2);
    expect(body.runs.map((run: { id: string }) => run.id)).toEqual([
      "run-failed",
      "run-completed",
    ]);
    expect(body.runs[0]).toMatchObject({
      status: "failed",
      activityType: "task_resume",
      runtimeId: "openai-direct",
      logs: [{ id: "log-second", event: "failed" }],
    });
    expect(body.runs[1]).toMatchObject({
      status: "completed",
      logs: [{ id: "log-first", event: "completed" }],
    });
  });

  it("synthesizes a current attempt after the latest durable run", async () => {
    const { db, tasks, agentLogs, usageLedger, GET } = await load();
    const priorStart = new Date("2026-07-12T15:00:00.000Z");
    const priorFinish = new Date("2026-07-12T15:01:00.000Z");
    const currentStart = new Date("2026-07-12T16:00:00.000Z");
    db.insert(tasks).values({
      id: "running-task",
      title: "Running task",
      status: "running",
      effectiveRuntimeId: "ollama",
      effectiveModelId: "llama3.2",
      createdAt: priorStart,
      updatedAt: currentStart,
    }).run();
    db.insert(usageLedger).values({
      id: "prior-run",
      taskId: "running-task",
      activityType: "task_run",
      runtimeId: "ollama",
      providerId: "ollama",
      status: "completed",
      startedAt: priorStart,
      finishedAt: priorFinish,
    }).run();
    db.insert(agentLogs).values({
      id: "current-log",
      taskId: "running-task",
      agentType: "general",
      event: "started",
      payload: '{"runtime":"ollama"}',
      timestamp: currentStart,
    }).run();

    const response = await GET(new Request("http://test") as never, {
      params: Promise.resolve({ id: "running-task" }),
    });
    const body = await response.json();
    expect(body.totalRuns).toBe(2);
    expect(body.runs[0]).toMatchObject({
      status: "running",
      current: true,
      runtimeId: "ollama",
      modelId: "llama3.2",
      logs: [{ id: "current-log", event: "started" }],
    });
    expect(body.runs[1]).toMatchObject({
      id: "prior-run",
      status: "completed",
      logsUnavailable: true,
    });
  });

  it("aggregates stream noise and places permission decisions in semantic order", async () => {
    const { db, tasks, agentLogs, notifications, GET } = await load();
    const start = new Date("2026-07-12T16:00:00.000Z");
    db.insert(tasks).values({
      id: "semantic-running",
      title: "Semantic running",
      status: "running",
      createdAt: start,
      updatedAt: start,
    }).run();
    db.insert(agentLogs).values([
      ...Array.from({ length: 150 }, (_, index) => ({
        id: `delta-before-${index}`,
        taskId: "semantic-running",
        agentType: "general",
        event: "content_block_delta",
        payload: '{"delta":{"text":"x"}}',
        timestamp: new Date(start.getTime() + index + 1),
      })),
      ...Array.from({ length: 150 }, (_, index) => ({
        id: `delta-after-${index}`,
        taskId: "semantic-running",
        agentType: "general",
        event: "content_block_delta",
        payload: '{"delta":{"text":"y"}}',
        timestamp: new Date(start.getTime() + index + 1_000),
      })),
    ]).run();
    db.insert(notifications).values({
      id: "permission-1",
      taskId: "semantic-running",
      type: "permission_required",
      title: "Allow WebFetch?",
      body: "Fetch the source page",
      toolName: "WebFetch",
      response: '{"behavior":"allow"}',
      createdAt: new Date(start.getTime() + 500),
    }).run();

    const response = await GET(new Request("http://test") as never, {
      params: Promise.resolve({ id: "semantic-running" }),
    });
    const body = await response.json();
    expect(body.runs[0].logs.map((event: { event: string }) => event.event)).toEqual([
      "response_progress",
      "permission_approved",
      "response_progress",
    ]);
    expect(body.runs[0].logs.map((event: { eventCount: number }) => event.eventCount)).toEqual([
      150,
      1,
      150,
    ]);
    expect(db.select().from(agentLogs).all()).toHaveLength(300);
    expect(JSON.stringify(body).length).toBeLessThan(10_000);
  });

  it("caps semantic events while retaining the raw diagnostic rows", async () => {
    const { db, tasks, agentLogs, GET } = await load();
    const start = new Date("2026-07-12T17:00:00.000Z");
    db.insert(tasks).values({
      id: "bounded-running",
      title: "Bounded running",
      status: "running",
      createdAt: start,
      updatedAt: start,
    }).run();
    const rows = Array.from({ length: 100 }, (_, index) => [
      {
        id: `tool-${index}`,
        taskId: "bounded-running",
        agentType: "general",
        event: "tool_start",
        payload: `{"tool":"Tool${index}"}`,
        timestamp: new Date(start.getTime() + index * 2 + 1),
      },
      {
        id: `delta-${index}`,
        taskId: "bounded-running",
        agentType: "general",
        event: "content_block_delta",
        payload: '{"delta":{"text":"x"}}',
        timestamp: new Date(start.getTime() + index * 2 + 2),
      },
    ]).flat();
    db.insert(agentLogs).values(rows).run();

    const response = await GET(new Request("http://test") as never, {
      params: Promise.resolve({ id: "bounded-running" }),
    });
    const body = await response.json();
    expect(body.runs[0].logs).toHaveLength(160);
    expect(body.logsTruncated).toBe(true);
    expect(db.select().from(agentLogs).all()).toHaveLength(200);
  });

  it("bounds individual payloads without mutating raw diagnostics", async () => {
    const { db, tasks, agentLogs, GET } = await load();
    const start = new Date("2026-07-12T18:00:00.000Z");
    const rawPayload = JSON.stringify({ tool: "Agent", input: { prompt: "x".repeat(20_000) } });
    db.insert(tasks).values({
      id: "large-payload",
      title: "Large payload",
      status: "running",
      createdAt: start,
      updatedAt: start,
    }).run();
    db.insert(agentLogs).values({
      id: "large-tool",
      taskId: "large-payload",
      agentType: "general",
      event: "tool_start",
      payload: rawPayload,
      timestamp: new Date(start.getTime() + 1),
    }).run();

    const response = await GET(new Request("http://test") as never, {
      params: Promise.resolve({ id: "large-payload" }),
    });
    const body = await response.json();
    expect(body.runs[0].logs[0]).toMatchObject({
      event: "tool_start",
      payloadTruncated: true,
    });
    expect(body.runs[0].logs[0].payload.length).toBeLessThan(2_300);
    expect(JSON.parse(body.runs[0].logs[0].payload)).toMatchObject({
      rawCharacters: rawPayload.length,
    });
    expect(db.select().from(agentLogs).get()?.payload).toBe(rawPayload);
  });
});
