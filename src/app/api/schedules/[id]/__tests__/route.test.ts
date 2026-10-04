/** @vitest-environment node */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleFiringMetrics, schedules, tasks } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  validateAssignment: vi.fn(),
  checkCollision: vi.fn(),
}));

vi.mock("@/lib/agents/profiles/assignment-validation", () => ({
  validateRuntimeProfileAssignment: mocks.validateAssignment,
}));
vi.mock("@/lib/schedules/collision-check", () => ({
  checkCollision: mocks.checkCollision,
}));

import { DELETE, PATCH } from "../route";

function seedSchedule(
  status: "active" | "paused" = "active",
  agentProfile: string | null = null
) {
  const id = randomUUID();
  const now = new Date();
  db.insert(schedules)
    .values({
      id,
      name: "Route control",
      prompt: "Check the queue",
      cronExpression: "0 9 * * *",
      status,
      agentProfile,
      type: "scheduled",
      firingCount: 0,
      suppressionCount: 0,
      heartbeatSpentToday: 0,
      failureStreak: 0,
      turnBudgetBreachStreak: 0,
      nextFireAt: status === "active" ? new Date(now.getTime() + 60_000) : null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function request(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://relay.test/api/schedules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  db.delete(schedules).run();
  vi.clearAllMocks();
  mocks.validateAssignment.mockReturnValue(null);
  mocks.checkCollision.mockReturnValue([]);
});

describe("PATCH /api/schedules/[id] boundary contract", () => {
  it("persists legal pause and resume transitions", async () => {
    const id = seedSchedule("active");

    const paused = await request(id, { status: "paused" });
    expect(paused.status).toBe(200);
    expect(db.select().from(schedules).where(eq(schedules.id, id)).get()).toMatchObject({
      status: "paused",
      nextFireAt: null,
    });

    const resumed = await request(id, { status: "active" });
    expect(resumed.status).toBe(200);
    expect(db.select().from(schedules).where(eq(schedules.id, id)).get()).toMatchObject({
      status: "active",
      nextFireAt: expect.any(Date),
    });
  });

  it("rejects malformed shapes before dereferencing and leaves the row unchanged", async () => {
    const id = seedSchedule();

    const response = await request(id, { name: 42, activeHoursStart: 99 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid schedule update" });
    expect(db.select().from(schedules).where(eq(schedules.id, id)).get()).toMatchObject({
      name: "Route control",
      status: "active",
    });
  });

  it("rejects an illegal transition with 409 and no mutation", async () => {
    const id = seedSchedule("paused");

    const response = await request(id, { status: "paused" });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Can only pause an active schedule" });
    expect(db.select().from(schedules).where(eq(schedules.id, id)).get()?.status).toBe(
      "paused"
    );
  });

  it("preserves configuration when runtime/profile compatibility is refused", async () => {
    const id = seedSchedule();
    mocks.validateAssignment.mockReturnValue(
      'Schedule profile "Engineer" does not support Ollama'
    );

    const response = await request(id, {
      assignedAgent: "ollama",
      agentProfile: "engineer",
    });

    expect(response.status).toBe(400);
    expect(db.select().from(schedules).where(eq(schedules.id, id)).get()).toMatchObject({
      assignedAgent: null,
      agentProfile: null,
    });
  });

  it("pauses a schedule whose stored profile no longer exists", async () => {
    const id = seedSchedule("active", "removed-profile");
    mocks.validateAssignment.mockImplementation(({ profileId }) =>
      profileId === "removed-profile"
        ? 'Schedule profile "removed-profile" was not found'
        : null
    );

    const response = await request(id, { status: "paused" });

    expect(response.status).toBe(200);
    expect(mocks.validateAssignment).not.toHaveBeenCalled();
    expect(db.select().from(schedules).where(eq(schedules.id, id)).get()).toMatchObject({
      status: "paused",
      agentProfile: "removed-profile",
    });
  });

  it("still refuses a request that sets a profile that does not exist", async () => {
    const id = seedSchedule();
    mocks.validateAssignment.mockImplementation(({ profileId }) =>
      profileId === "removed-profile"
        ? 'Schedule profile "removed-profile" was not found'
        : null
    );

    const response = await request(id, { agentProfile: "removed-profile" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Schedule profile "removed-profile" was not found',
    });
    expect(db.select().from(schedules).where(eq(schedules.id, id)).get()?.agentProfile).toBeNull();
  });

  it("returns 404 for a missing schedule", async () => {
    const response = await request(randomUUID(), { status: "paused" });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/schedules/[id]", () => {
  it("deletes a schedule that has fired and keeps its task", async () => {
    const id = seedSchedule();
    const taskId = randomUUID();
    const metricId = randomUUID();
    const now = new Date();
    db.insert(tasks)
      .values({
        id: taskId,
        scheduleId: id,
        title: "firing",
        status: "completed",
        priority: 2,
        sourceType: "scheduled",
        resumeCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.insert(scheduleFiringMetrics)
      .values({ id: metricId, scheduleId: id, taskId, firedAt: now })
      .run();

    try {
      const response = await DELETE(
        new NextRequest(`http://relay.test/api/schedules/${id}`, { method: "DELETE" }),
        { params: Promise.resolve({ id }) }
      );

      expect(response.status).toBe(200);
      expect(db.select().from(schedules).where(eq(schedules.id, id)).get()).toBeUndefined();
      expect(db.select().from(tasks).where(eq(tasks.id, taskId)).get()?.scheduleId).toBeNull();
      expect(
        db.select().from(scheduleFiringMetrics).where(eq(scheduleFiringMetrics.id, metricId)).get()
      ).toBeUndefined();
    } finally {
      db.delete(scheduleFiringMetrics).where(eq(scheduleFiringMetrics.id, metricId)).run();
      db.delete(tasks).where(eq(tasks.id, taskId)).run();
    }
  });
});
