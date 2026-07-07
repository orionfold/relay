import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import {
  tasks,
  schedules,
  projects,
  notifications,
  scheduleFiringMetrics,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { tickScheduler } from "@/lib/schedules/scheduler";
import * as instantiator from "@/lib/workflows/blueprints/instantiator";
import * as engine from "@/lib/workflows/engine";
import * as registry from "@/lib/apps/registry";

// Stub the runtime — coordination under test, not the SDK.
vi.mock("@/lib/agents/runtime", () => ({
  executeTaskWithRuntime: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/workflows/blueprints/instantiator", () => ({
  instantiateBlueprint: vi.fn(),
}));

// scheduler.ts statically imports resumeWorkflow — the mock must provide it.
vi.mock("@/lib/workflows/engine", () => ({
  executeWorkflow: vi.fn(),
  resumeWorkflow: vi.fn(),
}));

vi.mock("@/lib/apps/registry", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/apps/registry")>(
      "@/lib/apps/registry"
    );
  return { ...actual, getApp: vi.fn() };
});

const COMPOSITE_ID = "app:test-app:month-end";

function seedAppSchedule(overrides: Partial<typeof schedules.$inferInsert> = {}) {
  const now = new Date();
  db.insert(projects)
    .values({
      id: "test-app",
      name: "Test app",
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(schedules)
    .values({
      id: COMPOSITE_ID,
      projectId: "test-app",
      name: "Month End (test-app)",
      prompt: 'App schedule for "test-app" — runs blueprint "test-app--close".',
      cronExpression: "0 6 1 * *",
      status: "active",
      type: "scheduled",
      firingCount: 0,
      suppressionCount: 0,
      heartbeatSpentToday: 0,
      failureStreak: 0,
      turnBudgetBreachStreak: 0,
      nextFireAt: new Date(Date.now() - 10_000),
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
}

function mockAppManifest() {
  vi.mocked(registry.getApp).mockReturnValue({
    id: "test-app",
    manifest: {
      id: "test-app",
      name: "Test app",
      profiles: [],
      blueprints: [{ id: "test-app--close" }],
      tables: [],
      schedules: [
        { id: COMPOSITE_ID, cron: "0 6 1 * *", runs: "test-app--close" },
      ],
    },
  } as unknown as ReturnType<typeof registry.getApp>);
}

describe("app-manifest schedule firing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(engine.executeWorkflow).mockResolvedValue(undefined);
    db.delete(scheduleFiringMetrics).run();
    db.delete(notifications).run();
    db.delete(tasks).run();
    db.delete(schedules).run();
    db.delete(projects).run();
  });

  it("dispatches the manifest blueprint instead of creating a prompt task", async () => {
    seedAppSchedule();
    mockAppManifest();
    vi.mocked(instantiator.instantiateBlueprint).mockResolvedValue({
      workflowId: "wf-1",
      name: "Close",
      stepsCount: 1,
      skippedSteps: [],
    });

    await tickScheduler();

    expect(instantiator.instantiateBlueprint).toHaveBeenCalledWith(
      "test-app--close",
      expect.any(Object),
      "test-app"
    );
    expect(engine.executeWorkflow).toHaveBeenCalledWith("wf-1");

    // No schedule-prompt task was created — the blueprint IS the firing.
    const taskRows = db.select().from(tasks).all();
    expect(
      taskRows.filter((t) => t.scheduleId === COMPOSITE_ID)
    ).toHaveLength(0);

    // Counters advanced and the next fire is computed (scheduleNextFire KPI).
    const row = db
      .select()
      .from(schedules)
      .where(eq(schedules.id, COMPOSITE_ID))
      .get();
    expect(row!.firingCount).toBe(1);
    expect(row!.lastFiredAt).not.toBeNull();
    expect(row!.nextFireAt).not.toBeNull();
    expect(row!.failureStreak).toBe(0);
    expect(row!.lastFailureReason).toBeNull();
  });

  it("records dispatch failure without counting it as a successful firing", async () => {
    seedAppSchedule();
    mockAppManifest();
    vi.mocked(instantiator.instantiateBlueprint).mockRejectedValue(
      new Error('Missing required variables: "Lead" is required')
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await tickScheduler();

    expect(engine.executeWorkflow).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("fired app schedule")
    );

    const row = db
      .select()
      .from(schedules)
      .where(eq(schedules.id, COMPOSITE_ID))
      .get();
    expect(row!.firingCount).toBe(0);
    expect(row!.lastFiredAt).toBeNull();
    expect(row!.failureStreak).toBe(1);
    expect(row!.lastFailureReason).toBe("dispatch_failed");
    expect(row!.status).toBe("active");
    expect(row!.nextFireAt!.getTime()).toBeGreaterThan(Date.now());

    const notes = db.select().from(notifications).all();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toContain("Schedule failure");
    expect(notes[0].body).toContain("Missing required variables");

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("pauses the schedule and writes a notification when the owning app is gone", async () => {
    seedAppSchedule();
    vi.mocked(registry.getApp).mockReturnValue(null);

    await tickScheduler();

    expect(instantiator.instantiateBlueprint).not.toHaveBeenCalled();

    const row = db
      .select()
      .from(schedules)
      .where(eq(schedules.id, COMPOSITE_ID))
      .get();
    expect(row!.status).toBe("paused"); // no infinite refire loop

    const notes = db.select().from(notifications).all();
    expect(notes.length).toBeGreaterThan(0);
  });
});
