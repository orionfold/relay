/** @vitest-environment node */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schedules } from "@/lib/db/schema";

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

import { PATCH } from "../route";

function seedSchedule(status: "active" | "paused" = "active") {
  const id = randomUUID();
  const now = new Date();
  db.insert(schedules)
    .values({
      id,
      name: "Route control",
      prompt: "Check the queue",
      cronExpression: "0 9 * * *",
      status,
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

  it("returns 404 for a missing schedule", async () => {
    const response = await request(randomUUID(), { status: "paused" });
    expect(response.status).toBe(404);
  });
});
