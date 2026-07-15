/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  processDocument: vi.fn(),
  validateAssignment: vi.fn(),
}));

vi.mock("@/lib/documents/processor", () => ({
  processDocument: mocks.processDocument,
}));
vi.mock("@/lib/agents/profiles/assignment-validation", () => ({
  validateRuntimeProfileAssignment: mocks.validateAssignment,
}));

import { POST } from "../route";

function request(body: unknown) {
  return new NextRequest("http://relay.test/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  db.delete(tasks).run();
  vi.clearAllMocks();
  mocks.validateAssignment.mockReturnValue(null);
  mocks.processDocument.mockResolvedValue(undefined);
});

describe("POST /api/tasks boundary contract", () => {
  it("validates and persists one planned task", async () => {
    const response = await POST(
      request({
        title: "Prepare launch brief",
        description: "Use the approved evidence",
        priority: 1,
        assignedAgent: "claude-code",
      })
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      title: "Prepare launch brief",
      status: "planned",
      priority: 1,
      assignedAgent: "claude-code",
    });
    expect(db.select().from(tasks).all()).toEqual([
      expect.objectContaining({ title: "Prepare launch brief", status: "planned" }),
    ]);
  });

  it("names malformed JSON and creates no task", async () => {
    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
    expect(db.select().from(tasks).all()).toEqual([]);
  });

  it("returns schema errors without persistence", async () => {
    const response = await POST(request({ title: "", priority: 9 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error.fieldErrors");
    expect(db.select().from(tasks).all()).toEqual([]);
  });

  it("preserves an empty database when runtime/profile assignment is refused", async () => {
    mocks.validateAssignment.mockReturnValue(
      'Task profile "Engineer" does not support Ollama'
    );

    const response = await POST(
      request({ title: "Change code", assignedAgent: "ollama", agentProfile: "engineer" })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Task profile "Engineer" does not support Ollama',
    });
    expect(db.select().from(tasks).all()).toEqual([]);
  });
});
