/** @vitest-environment node */

import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { tasks, workflowReceiptRuns, workflows } from "@/lib/db/schema";

const resume = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/lib/workflows/engine", () => ({ resumeWorkflow: resume }));

import { POST } from "../route";

function seed(status: "draft" | "active" | "paused" | "completed" | "failed") {
  const id = randomUUID();
  const now = new Date();
  db.insert(workflows)
    .values({
      id,
      name: "Resume route",
      definition: JSON.stringify({ pattern: "sequence", steps: [] }),
      status,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

function invoke(id: string) {
  return POST(new NextRequest(`http://relay.test/api/workflows/${id}/resume`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  db.delete(tasks).run();
  db.delete(workflowReceiptRuns).run();
  db.delete(workflows).run();
  vi.clearAllMocks();
});

describe("POST /api/workflows/[id]/resume boundary", () => {
  it("returns 404 without dispatch for a missing workflow", async () => {
    const response = await invoke(randomUUID());
    expect(response.status).toBe(404);
    expect(resume).not.toHaveBeenCalled();
  });

  it("returns a named conflict for a workflow that is no longer paused", async () => {
    const id = seed("active");
    const response = await invoke(id);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ status: "active" });
    expect(resume).not.toHaveBeenCalled();
  });

  it("dispatches the paused workflow recovery path", async () => {
    const id = seed("paused");
    const response = await invoke(id);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "resuming", workflowId: id });
    expect(resume).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledWith(id);
  });
});
