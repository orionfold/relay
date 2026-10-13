import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";

const now = new Date();

/**
 * The persisted on-demand waiting line's two columns. Both are added by
 * `addColumnIfMissing` in bootstrap, so this is also what catches a drizzle
 * definition that landed without its ALTER.
 */
describe("tasks.runRequestedAt / runRequestedMode", () => {
  it("round-trips a marker at millisecond resolution", () => {
    const taskId = `t_run_req_${Date.now()}`;
    const requestedAt = new Date(1_767_225_600_123);

    db.insert(tasks)
      .values({
        id: taskId,
        title: "deferred",
        status: "queued",
        runRequestedAt: requestedAt,
        runRequestedMode: "resume",
        createdAt: now,
        updatedAt: now,
      } as never)
      .run();

    const row = db
      .select()
      .from(tasks)
      .where(sql`${tasks.id} = ${taskId}`)
      .get();
    // Seconds would truncate the .123 and make FIFO a coin toss inside a burst.
    expect(row?.runRequestedAt?.getTime()).toBe(1_767_225_600_123);
    expect(row?.runRequestedMode).toBe("resume");

    db.delete(tasks).where(sql`${tasks.id} = ${taskId}`).run();
  });

  it("is NULL on a row nobody submitted a run for", () => {
    const taskId = `t_run_req_rest_${Date.now()}`;

    db.insert(tasks)
      .values({
        id: taskId,
        title: "at rest",
        status: "queued",
        createdAt: now,
        updatedAt: now,
      } as never)
      .run();

    const row = db
      .select()
      .from(tasks)
      .where(sql`${tasks.id} = ${taskId}`)
      .get();
    expect(row?.runRequestedAt).toBeNull();
    expect(row?.runRequestedMode).toBeNull();

    db.delete(tasks).where(sql`${tasks.id} = ${taskId}`).run();
  });
});
