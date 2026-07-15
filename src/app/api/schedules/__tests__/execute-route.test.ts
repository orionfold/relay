import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { tasks, schedules, projects, settings, usageLedger } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { POST } from "../[id]/execute/route";

const mockStartTaskExecution = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/task-dispatch", () => ({
  startTaskExecution: mockStartTaskExecution,
}));

function req(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"));
}

function seedSchedule(): string {
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
      name: "manual",
      prompt: "test",
      cronExpression: "0 0 * * *",
      status: "active",
      type: "scheduled",
      firingCount: 0,
      suppressionCount: 0,
      heartbeatSpentToday: 0,
      failureStreak: 0,
      turnBudgetBreachStreak: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return sid;
}

describe("POST /api/schedules/:id/execute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartTaskExecution.mockReturnValue(new Promise(() => {}));
    db.delete(usageLedger).run();
    db.delete(tasks).run();
    db.delete(schedules).run();
    db.delete(projects).run();
    db.delete(settings).where(eq(settings.key, "schedule.maxConcurrent")).run();
    db.insert(settings)
      .values({ key: "schedule.maxConcurrent", value: "1", updatedAt: new Date() })
      .run();
  });

  it("fires when capacity available, returns 200 with taskId", async () => {
    const sid = seedSchedule();
    const res = await POST(req(`/api/schedules/${sid}/execute`), {
      params: Promise.resolve({ id: sid }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.taskId).toBeDefined();
    expect(db.select().from(tasks).where(eq(tasks.id, body.taskId)).get()).toMatchObject({
      scheduleId: sid,
      status: "running",
      sourceType: "scheduled",
    });
    expect(mockStartTaskExecution).toHaveBeenCalledWith(body.taskId);
  });

  it("returns 429 when cap is full", async () => {
    const sid1 = seedSchedule();
    const sid2 = seedSchedule();

    const res1 = await POST(req(`/api/schedules/${sid1}/execute`), {
      params: Promise.resolve({ id: sid1 }),
    });
    expect(res1.status).toBe(200);

    const res2 = await POST(req(`/api/schedules/${sid2}/execute`), {
      params: Promise.resolve({ id: sid2 }),
    });
    expect(res2.status).toBe(429);
    const body = await res2.json();
    expect(body.error).toBe("capacity_full");
    expect(body.slotEtaSec).toBeGreaterThanOrEqual(0);

    const remaining = db.select().from(tasks).all();
    expect(remaining.length).toBe(1); // only sid1's task remains; sid2's was cleaned up on refusal
    expect(mockStartTaskExecution).toHaveBeenCalledTimes(1);
  });

  it("bypasses the cap when ?force=true and writes audit-log entry", async () => {
    const sid1 = seedSchedule();
    const sid2 = seedSchedule();

    await POST(req(`/api/schedules/${sid1}/execute`), {
      params: Promise.resolve({ id: sid1 }),
    });

    const res2 = await POST(
      req(`/api/schedules/${sid2}/execute?force=true`),
      { params: Promise.resolve({ id: sid2 }) },
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();

    const ledger = db
      .select()
      .from(usageLedger)
      .where(eq(usageLedger.activityType, "manual_force_bypass"))
      .all();
    expect(ledger.length).toBe(1);
    expect(ledger[0].taskId).toBe(body2.taskId);
    expect(mockStartTaskExecution).toHaveBeenCalledTimes(2);
  });

  it("returns 404 when the schedule does not exist", async () => {
    const res = await POST(req("/api/schedules/nonexistent/execute"), {
      params: Promise.resolve({ id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });
});
