/** @vitest-environment node */

/**
 * The task routes against the on-demand waiting line.
 *
 * `status = 'queued' AND run_requested_at IS NOT NULL` is a run somebody
 * submitted; `queued` with no marker is a task at rest that nothing may start.
 * A status written through PATCH is not a submission, so it has to take the
 * row out of the line — otherwise dragging a deferred run back to `planned`
 * and forward again would leave a marker that boot recovery reads as a run
 * waiting since before the restart.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { listDeferredTaskRuns } from "@/lib/agents/task-slots";

import { DELETE, PATCH } from "../route";

function seedDeferred(overrides: Partial<typeof tasks.$inferInsert> = {}) {
  const id = randomUUID();
  const now = new Date();
  db.insert(tasks)
    .values({
      id,
      title: "deferred run",
      status: "queued",
      sourceType: "manual",
      priority: 2,
      resumeCount: 0,
      runRequestedAt: new Date(1_000),
      runRequestedMode: "start",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    })
    .run();
  return id;
}

function rowOf(id: string) {
  return db.select().from(tasks).where(eq(tasks.id, id)).get();
}

function patch(id: string, body: unknown) {
  return PATCH(
    new Request("http://relay.test", {
      method: "PATCH",
      body: JSON.stringify(body),
    }) as never,
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(() => {
  db.delete(tasks).run();
});

describe("PATCH /api/tasks/[id] and the waiting line", () => {
  it("clears the marker when the status changes", async () => {
    const id = seedDeferred();

    const response = await patch(id, { status: "planned" });

    expect(response.status).toBe(200);
    const row = rowOf(id);
    expect(row?.status).toBe("planned");
    expect(row?.runRequestedAt).toBeNull();
    expect(row?.runRequestedMode).toBeNull();
    expect(listDeferredTaskRuns()).toEqual([]);
  });

  it("leaves the marker alone when the status is not touched", async () => {
    const id = seedDeferred();

    const response = await patch(id, { title: "renamed" });

    expect(response.status).toBe(200);
    const row = rowOf(id);
    expect(row?.title).toBe("renamed");
    expect(row?.runRequestedAt?.getTime()).toBe(1_000);
    expect(listDeferredTaskRuns().map((run) => run.id)).toEqual([id]);
  });

  it("leaves the marker alone when the status is re-sent unchanged", async () => {
    const id = seedDeferred();

    const response = await patch(id, { status: "queued" });

    expect(response.status).toBe(200);
    expect(rowOf(id)?.runRequestedAt?.getTime()).toBe(1_000);
  });
});

describe("DELETE /api/tasks/[id] and the waiting line", () => {
  it("takes the deleted run out of the line with its row", async () => {
    const id = seedDeferred();

    const response = await DELETE(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id }),
    });

    expect(response.status).toBe(200);
    expect(rowOf(id)).toBeUndefined();
    expect(listDeferredTaskRuns()).toEqual([]);
  });
});
