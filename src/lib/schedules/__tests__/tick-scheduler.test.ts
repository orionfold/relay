import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { tasks, schedules, projects, settings, scheduleFiringMetrics } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { tickScheduler } from "../scheduler";
import { registerChatStream, unregisterChatStream } from "@/lib/chat/active-streams";

// Hold claimed executions at the dispatch boundary. Resolving immediately lets
// the scheduler's background finalizer drain queued rows before this test can
// observe the cap, while reaching the real target resolver makes the outcome
// depend on whichever provider credentials exist on the machine.
vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: vi.fn(() => new Promise<void>(() => {})),
}));

function seedProject(): string {
  const id = randomUUID();
  const now = new Date();
  db.insert(projects)
    .values({ id, name: "test", status: "active", createdAt: now, updatedAt: now })
    .run();
  return id;
}

function seedScheduleDue(projectId: string, nextFireAt: Date): string {
  const id = randomUUID();
  const now = new Date();
  db.insert(schedules)
    .values({
      id,
      projectId,
      name: `sched-${id.slice(0, 4)}`,
      prompt: "test prompt",
      cronExpression: "* * * * *",
      status: "active",
      type: "scheduled",
      firingCount: 0,
      suppressionCount: 0,
      heartbeatSpentToday: 0,
      failureStreak: 0,
      turnBudgetBreachStreak: 0,
      nextFireAt,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

describe("tickScheduler with concurrency cap", () => {
  beforeEach(() => {
    db.delete(scheduleFiringMetrics).run();
    db.delete(tasks).run();
    db.delete(schedules).run();
    db.delete(projects).run();
    db.delete(settings).where(eq(settings.key, "schedule.maxConcurrent")).run();
    db.insert(settings)
      .values({ key: "schedule.maxConcurrent", value: "2", updatedAt: new Date() })
      .run();
    for (const id of ["x", "y", "z"]) unregisterChatStream(id);
  });

  it("fires up to cap schedules, queues the rest", async () => {
    const pid = seedProject();
    const past = new Date(Date.now() - 10_000);
    for (let i = 0; i < 5; i++) seedScheduleDue(pid, past);

    await tickScheduler();

    const runningCount = db
      .select()
      .from(tasks)
      .where(eq(tasks.status, "running"))
      .all().length;
    const queuedCount = db
      .select()
      .from(tasks)
      .where(eq(tasks.status, "queued"))
      .all().length;

    expect(runningCount).toBe(2); // cap=2
    expect(queuedCount).toBe(3); // remaining 3 waiting
  });

  it("defers new firings when chat is active", async () => {
    const pid = seedProject();
    const past = new Date(Date.now() - 10_000);
    const sid = seedScheduleDue(pid, past);

    registerChatStream("x");

    await tickScheduler();

    // No task should have been created
    const taskCount = db.select().from(tasks).all().length;
    expect(taskCount).toBe(0);

    // The schedule's next_fire_at should have been pushed forward ≥25s
    const row = db.select().from(schedules).where(eq(schedules.id, sid)).get();
    expect(row?.nextFireAt?.getTime()).toBeGreaterThan(Date.now() + 25 * 1000);

    unregisterChatStream("x");
  });
});
