import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import {
  tasks,
  schedules,
  projects,
  settings,
  scheduleFiringMetrics,
  usageBudgetPolicies,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { tickScheduler, recordFiringMetrics } from "../scheduler";

vi.mock("@/lib/agents/runtime", () => ({
  executeTaskWithRuntime: vi.fn().mockResolvedValue(undefined),
}));

describe("per-schedule turn budget propagation", () => {
  beforeEach(() => {
    db.delete(scheduleFiringMetrics).run();
    db.delete(usageBudgetPolicies).run();
    db.delete(tasks).run();
    db.delete(schedules).run();
    db.delete(projects).run();
    db.delete(settings).where(eq(settings.key, "schedule.maxConcurrent")).run();
    db.insert(settings)
      .values({ key: "schedule.maxConcurrent", value: "10", updatedAt: new Date() })
      .run();
  });

  it("copies schedules.max_turns into tasks.max_turns at firing time", async () => {
    const pid = randomUUID();
    const sid = randomUUID();
    const now = new Date();
    db.insert(projects)
      .values({ id: pid, name: "p", status: "active", createdAt: now, updatedAt: now })
      .run();
    db.insert(schedules)
      .values({
        id: sid,
        projectId: pid,
        name: "bounded",
        prompt: "test",
        cronExpression: "* * * * *",
        status: "active",
        type: "scheduled",
        firingCount: 0,
        suppressionCount: 0,
        heartbeatSpentToday: 0,
        failureStreak: 0,
        turnBudgetBreachStreak: 0,
        nextFireAt: new Date(now.getTime() - 10_000),
        maxTurns: 42,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await tickScheduler();

    const [task] = db.select().from(tasks).where(eq(tasks.scheduleId, sid)).all();
    expect(task?.maxTurns).toBe(42);
  });

  it("leaves tasks.max_turns null when schedules.max_turns is null", async () => {
    const pid = randomUUID();
    const sid = randomUUID();
    const now = new Date();
    db.insert(projects)
      .values({ id: pid, name: "p", status: "active", createdAt: now, updatedAt: now })
      .run();
    db.insert(schedules)
      .values({
        id: sid,
        projectId: pid,
        name: "unbounded",
        prompt: "test",
        cronExpression: "* * * * *",
        status: "active",
        type: "scheduled",
        firingCount: 0,
        suppressionCount: 0,
        heartbeatSpentToday: 0,
        failureStreak: 0,
        turnBudgetBreachStreak: 0,
        nextFireAt: new Date(now.getTime() - 10_000),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await tickScheduler();

    const [task] = db.select().from(tasks).where(eq(tasks.scheduleId, sid)).all();
    expect(task?.maxTurns).toBeNull();
  });

  it("copies the accepted per-run cost ceiling into a scheduled task", async () => {
    const pid = randomUUID();
    const sid = randomUUID();
    const now = new Date();
    db.insert(projects)
      .values({ id: pid, name: "p", status: "active", createdAt: now, updatedAt: now })
      .run();
    db.insert(schedules)
      .values({
        id: sid,
        projectId: pid,
        name: "cost bounded",
        prompt: "test",
        cronExpression: "* * * * *",
        status: "active",
        type: "scheduled",
        firingCount: 0,
        suppressionCount: 0,
        heartbeatSpentToday: 0,
        failureStreak: 0,
        turnBudgetBreachStreak: 0,
        nextFireAt: new Date(now.getTime() - 10_000),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(usageBudgetPolicies)
      .values({
        id: `usage-budget:schedule:${sid}`,
        scopeType: "schedule",
        scopeId: sid,
        scheduleId: sid,
        enabled: true,
        onExceed: "pause",
        maxCostPerRunMicros: 250_000,
        notificationState: "{}",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await tickScheduler();

    const [task] = db.select().from(tasks).where(eq(tasks.scheduleId, sid)).all();
    expect(task?.maxBudgetUsd).toBe(0.25);
  });
});

async function seedBreachedTask(scheduleId: string): Promise<string> {
  const id = randomUUID();
  const now = new Date();
  db.insert(tasks)
    .values({
      id,
      scheduleId,
      title: "firing",
      status: "failed",
      result: "Agent exhausted its turn limit (42 turns used)",
      priority: 2,
      sourceType: "scheduled",
      resumeCount: 0,
      failureReason: "turn_limit_exceeded",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe("turn_budget_breach_streak", () => {
  beforeEach(() => {
    db.delete(scheduleFiringMetrics).run();
    db.delete(tasks).run();
    db.delete(schedules).run();
    db.delete(projects).run();
  });

  it("does NOT increment generic failureStreak on turn-budget breach", async () => {
    const pid = randomUUID();
    const sid = randomUUID();
    const now = new Date();
    db.insert(projects)
      .values({ id: pid, name: "p", status: "active", createdAt: now, updatedAt: now })
      .run();
    db.insert(schedules)
      .values({
        id: sid,
        projectId: pid,
        name: "bounded",
        prompt: "test",
        cronExpression: "* * * * *",
        status: "active",
        type: "scheduled",
        firingCount: 1,
        suppressionCount: 0,
        heartbeatSpentToday: 0,
        failureStreak: 0,
        turnBudgetBreachStreak: 0,
        maxTurns: 20,
        maxTurnsSetAt: new Date(now.getTime() - 86400_000), // yesterday
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const tid = await seedBreachedTask(sid);
    await recordFiringMetrics(sid, tid);

    const row = db.select().from(schedules).where(eq(schedules.id, sid)).get();
    expect(row?.failureStreak).toBe(0);
    expect(row?.turnBudgetBreachStreak).toBe(1);
  });

  it("applies first-breach grace when maxTurns was set recently", async () => {
    const pid = randomUUID();
    const sid = randomUUID();
    const now = new Date();
    db.insert(projects)
      .values({ id: pid, name: "p", status: "active", createdAt: now, updatedAt: now })
      .run();
    db.insert(schedules)
      .values({
        id: sid,
        projectId: pid,
        name: "bounded",
        prompt: "test",
        cronExpression: "0 * * * *", // hourly
        status: "active",
        type: "scheduled",
        firingCount: 1,
        suppressionCount: 0,
        heartbeatSpentToday: 0,
        failureStreak: 0,
        turnBudgetBreachStreak: 0,
        maxTurns: 20,
        // maxTurnsSetAt 30 min ago → first firing after edit → grace applies
        maxTurnsSetAt: new Date(now.getTime() - 30 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const tid = await seedBreachedTask(sid);
    await recordFiringMetrics(sid, tid);

    const row = db.select().from(schedules).where(eq(schedules.id, sid)).get();
    expect(row?.turnBudgetBreachStreak).toBe(0); // grace applied
  });

  it("auto-pauses at turn_budget_breach_streak >= 5", async () => {
    const pid = randomUUID();
    const sid = randomUUID();
    const now = new Date();
    db.insert(projects)
      .values({ id: pid, name: "p", status: "active", createdAt: now, updatedAt: now })
      .run();
    db.insert(schedules)
      .values({
        id: sid,
        projectId: pid,
        name: "bounded",
        prompt: "test",
        cronExpression: "* * * * *",
        status: "active",
        type: "scheduled",
        firingCount: 5,
        suppressionCount: 0,
        heartbeatSpentToday: 0,
        failureStreak: 0,
        turnBudgetBreachStreak: 4, // next breach trips the threshold
        maxTurns: 20,
        maxTurnsSetAt: new Date(now.getTime() - 86400_000),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const tid = await seedBreachedTask(sid);
    await recordFiringMetrics(sid, tid);

    const row = db.select().from(schedules).where(eq(schedules.id, sid)).get();
    expect(row?.status).toBe("paused");
    expect(row?.turnBudgetBreachStreak).toBe(5);
  });
});
