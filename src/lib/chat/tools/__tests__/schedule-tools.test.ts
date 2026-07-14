import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

interface ScheduleRow {
  id: string;
  maxTurns: number | null;
  [key: string]: unknown;
}

const { mockState } = vi.hoisted(() => ({
  mockState: {
    rows: [] as ScheduleRow[],
    lastInsertValues: null as Record<string, unknown> | null,
    lastUpdateValues: null as Record<string, unknown> | null,
  },
}));

vi.mock("@/lib/db", () => {
  const selectBuilder = {
    from() { return this; },
    where() { return this; },
    orderBy() { return this; },
    limit() { return this; },
    get() { return Promise.resolve(mockState.rows[0]); },
    then<TResolve>(resolve: (rows: ScheduleRow[]) => TResolve) {
      return Promise.resolve(mockState.rows).then(resolve);
    },
  };
  return {
    db: {
      select: () => selectBuilder,
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          mockState.lastInsertValues = v;
          mockState.rows = [{ id: "sched-1", maxTurns: null, ...v } as ScheduleRow];
          return Promise.resolve();
        },
      }),
      update: () => ({
        set: (v: Record<string, unknown>) => {
          mockState.lastUpdateValues = v;
          mockState.rows[0] = { ...mockState.rows[0], ...v } as ScheduleRow;
          return { where: () => Promise.resolve() };
        },
      }),
      delete: () => ({ where: () => Promise.resolve() }),
    },
  };
});

vi.mock("@/lib/db/schema", () => ({
  schedules: {
    id: "id",
    status: "status",
    projectId: "projectId",
    updatedAt: "updatedAt",
    cronExpression: "cronExpression",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  desc: () => ({}),
  like: () => ({}),
}));

vi.mock("@/lib/schedules/interval-parser", () => ({
  parseInterval: () => "*/30 * * * *",
  computeNextFireTime: () => new Date("2026-04-11T10:00:00Z"),
  computeStaggeredCron: (cron: string) => ({
    cronExpression: cron,
    offsetApplied: 0,
    collided: false,
  }),
}));

vi.mock("@/lib/schedules/nlp-parser", () => ({
  parseNaturalLanguage: () => null,
}));

vi.mock("@/lib/schedules/prompt-analyzer", () => ({
  analyzePromptEfficiency: () => [],
}));

import { scheduleTools } from "../schedule-tools";

function getTool(name: string) {
  const tools = scheduleTools({ projectId: "proj-1" } as never);
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

function parseArgs(toolName: string, args: unknown) {
  const tool = getTool(toolName);
  return z.object(tool.zodShape).safeParse(args);
}

beforeEach(() => {
  mockState.rows = [];
  mockState.lastInsertValues = null;
  mockState.lastUpdateValues = null;
});

describe("create_schedule maxTurns Zod validation", () => {
  const base = {
    name: "test",
    prompt: "hello",
    interval: "every 30 minutes",
  };

  it("accepts a valid maxTurns value", () => {
    const result = parseArgs("create_schedule", { ...base, maxTurns: 50 });
    expect(result.success).toBe(true);
  });

  it("accepts omitted maxTurns (inherit default)", () => {
    const result = parseArgs("create_schedule", base);
    expect(result.success).toBe(true);
  });

  it("rejects maxTurns below 10", () => {
    const result = parseArgs("create_schedule", { ...base, maxTurns: 9 });
    expect(result.success).toBe(false);
  });

  it("rejects maxTurns above 500", () => {
    const result = parseArgs("create_schedule", { ...base, maxTurns: 501 });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer maxTurns", () => {
    const result = parseArgs("create_schedule", { ...base, maxTurns: 50.5 });
    expect(result.success).toBe(false);
  });

  it("rejects explicit null on create (only update supports clear-to-null)", () => {
    const result = parseArgs("create_schedule", { ...base, maxTurns: null });
    expect(result.success).toBe(false);
  });
});

describe("update_schedule maxTurns Zod validation", () => {
  const base = { scheduleId: "sched-1" };

  it("accepts a valid maxTurns value", () => {
    const result = parseArgs("update_schedule", { ...base, maxTurns: 100 });
    expect(result.success).toBe(true);
  });

  it("accepts explicit null to clear an override", () => {
    const result = parseArgs("update_schedule", { ...base, maxTurns: null });
    expect(result.success).toBe(true);
  });

  it("accepts omitted maxTurns (unchanged)", () => {
    const result = parseArgs("update_schedule", base);
    expect(result.success).toBe(true);
  });

  it("rejects out-of-range maxTurns on update", () => {
    const result = parseArgs("update_schedule", { ...base, maxTurns: 9 });
    expect(result.success).toBe(false);
  });
});

describe("create_schedule maxTurns persistence", () => {
  it("writes maxTurns to the insert payload when provided", async () => {
    const tool = getTool("create_schedule");
    await tool.handler({
      name: "test",
      prompt: "hello",
      interval: "every 30 minutes",
      maxTurns: 75,
    });
    expect(mockState.lastInsertValues).not.toBeNull();
    expect(mockState.lastInsertValues?.maxTurns).toBe(75);
  });

  it("writes null to maxTurns when omitted (inherit default)", async () => {
    const tool = getTool("create_schedule");
    await tool.handler({
      name: "test",
      prompt: "hello",
      interval: "every 30 minutes",
    });
    expect(mockState.lastInsertValues?.maxTurns).toBe(null);
  });

  it("sets maxTurnsSetAt to a Date when maxTurns is provided", async () => {
    const tool = getTool("create_schedule");
    await tool.handler({
      name: "test",
      prompt: "hello",
      interval: "every 30 minutes",
      maxTurns: 75,
    });
    expect(mockState.lastInsertValues?.maxTurnsSetAt).toBeInstanceOf(Date);
  });

  it("sets maxTurnsSetAt to null when maxTurns is omitted", async () => {
    const tool = getTool("create_schedule");
    await tool.handler({
      name: "test",
      prompt: "hello",
      interval: "every 30 minutes",
    });
    expect(mockState.lastInsertValues?.maxTurnsSetAt).toBe(null);
  });
});

describe("schedule Operations Receipt criteria", () => {
  const criterion = {
    id: "run-completed",
    label: "Run completed",
    level: "required" as const,
    check: "status_is" as const,
    value: "completed" as const,
  };

  it("accepts the closed criteria grammar and rejects unsupported checks", () => {
    expect(
      parseArgs("create_schedule", {
        name: "test",
        prompt: "hello",
        interval: "1h",
        successCriteria: [criterion],
      }).success
    ).toBe(true);
    expect(
      parseArgs("create_schedule", {
        name: "test",
        prompt: "hello",
        interval: "1h",
        successCriteria: [{ ...criterion, check: "regex" }],
      }).success
    ).toBe(false);
  });

  it("normalizes criteria into the create payload", async () => {
    const tool = getTool("create_schedule");
    await tool.handler({
      name: "test",
      prompt: "hello",
      interval: "1h",
      successCriteria: [criterion],
    });

    expect(JSON.parse(String(mockState.lastInsertValues?.successCriteria))).toEqual([
      criterion,
    ]);
  });
});

describe("create_schedule appId discipline", () => {
  const base = {
    name: "weekly check",
    prompt: "do thing",
    interval: "every 30 minutes",
  };

  it("accepts a clean app slug appId", () => {
    const result = parseArgs("create_schedule", {
      ...base,
      appId: "habit-loop",
    });
    expect(result.success).toBe(true);
  });

  it("accepts omitted appId (non-app-composition schedule)", () => {
    const result = parseArgs("create_schedule", base);
    expect(result.success).toBe(true);
  });

  it("rejects an artifact id passed as appId (contains '--')", () => {
    const result = parseArgs("create_schedule", {
      ...base,
      appId: "habit-loop--coach",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues
        .map((iss) => iss.message)
        .join(" ");
      expect(message).toMatch(/appId/);
      expect(message).toMatch(/--/);
      expect(message).toMatch(/slug/i);
    }
  });
});

describe("update_schedule maxTurns persistence", () => {
  beforeEach(() => {
    mockState.rows = [{
      id: "sched-1",
      name: "existing",
      status: "active",
      maxTurns: 50,
    } as ScheduleRow];
  });

  it("writes the new maxTurns value when provided", async () => {
    const tool = getTool("update_schedule");
    await tool.handler({ scheduleId: "sched-1", maxTurns: 120 });
    expect(mockState.lastUpdateValues?.maxTurns).toBe(120);
  });

  it("writes null when explicitly clearing the override", async () => {
    const tool = getTool("update_schedule");
    await tool.handler({ scheduleId: "sched-1", maxTurns: null });
    expect(mockState.lastUpdateValues).not.toBeNull();
    expect("maxTurns" in (mockState.lastUpdateValues ?? {})).toBe(true);
    expect(mockState.lastUpdateValues?.maxTurns).toBe(null);
  });

  it("does not touch maxTurns when the field is omitted", async () => {
    const tool = getTool("update_schedule");
    await tool.handler({ scheduleId: "sched-1", name: "renamed" });
    expect("maxTurns" in (mockState.lastUpdateValues ?? {})).toBe(false);
  });

  it("sets maxTurnsSetAt to a Date when maxTurns is set to a number", async () => {
    const tool = getTool("update_schedule");
    await tool.handler({ scheduleId: "sched-1", maxTurns: 120 });
    expect(mockState.lastUpdateValues?.maxTurnsSetAt).toBeInstanceOf(Date);
  });

  it("sets maxTurnsSetAt to null when maxTurns is cleared", async () => {
    const tool = getTool("update_schedule");
    await tool.handler({ scheduleId: "sched-1", maxTurns: null });
    expect("maxTurnsSetAt" in (mockState.lastUpdateValues ?? {})).toBe(true);
    expect(mockState.lastUpdateValues?.maxTurnsSetAt).toBe(null);
  });

  it("does not touch maxTurnsSetAt when maxTurns is omitted", async () => {
    const tool = getTool("update_schedule");
    await tool.handler({ scheduleId: "sched-1", name: "renamed" });
    expect("maxTurnsSetAt" in (mockState.lastUpdateValues ?? {})).toBe(false);
  });
});
