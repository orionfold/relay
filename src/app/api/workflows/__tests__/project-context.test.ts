import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { NextRequest } from "next/server";

import { db } from "@/lib/db";
import { projects, workflows } from "@/lib/db/schema";
import { POST } from "../route";
import { PATCH } from "../[id]/route";
import { GET as GET_STATUS } from "../[id]/status/route";

const definition = {
  pattern: "sequence" as const,
  steps: [{ id: "draft", name: "Draft", prompt: "Write the brief" }],
};

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("workflow project context", () => {
  const projectIds: string[] = [];
  const workflowIds: string[] = [];

  beforeEach(() => {
    projectIds.length = 0;
    workflowIds.length = 0;
  });

  afterEach(() => {
    if (workflowIds.length > 0) {
      db.delete(workflows).where(inArray(workflows.id, workflowIds)).run();
    }
    if (projectIds.length > 0) {
      db.delete(projects).where(inArray(projects.id, projectIds)).run();
    }
  });

  function insertProject(name: string) {
    const id = randomUUID();
    projectIds.push(id);
    const now = new Date();
    db.insert(projects)
      .values({ id, name, status: "active", createdAt: now, updatedAt: now })
      .run();
    return id;
  }

  function insertWorkflow(projectId: string | null = null) {
    const id = randomUUID();
    workflowIds.push(id);
    const now = new Date();
    db.insert(workflows)
      .values({
        id,
        name: "Context workflow",
        projectId,
        definition: JSON.stringify(definition),
        status: "draft",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }

  it("creates a workflow with a valid project and refuses a missing project", async () => {
    const projectId = insertProject("Foundation account");
    const created = await POST(
      jsonRequest("http://relay.test/api/workflows", "POST", {
        name: "Project workflow",
        projectId,
        definition,
      })
    );

    expect(created.status).toBe(201);
    const createdBody = await created.json();
    workflowIds.push(createdBody.id);
    expect(createdBody.projectId).toBe(projectId);

    const missingId = randomUUID();
    const refused = await POST(
      jsonRequest("http://relay.test/api/workflows", "POST", {
        name: "Dangling workflow",
        projectId: missingId,
        definition,
      })
    );
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ error: `Project not found: ${missingId}` });
  });

  it("sets, changes, and explicitly clears projectId", async () => {
    const firstProjectId = insertProject("First project");
    const secondProjectId = insertProject("Second project");
    const workflowId = insertWorkflow();

    for (const projectId of [firstProjectId, secondProjectId, null]) {
      const response = await PATCH(
        jsonRequest(`http://relay.test/api/workflows/${workflowId}`, "PATCH", {
          projectId,
        }),
        { params: Promise.resolve({ id: workflowId }) }
      );
      expect(response.status).toBe(200);
      expect((await response.json()).projectId).toBe(projectId);
    }
  });

  it("rejects a missing project without changing the workflow", async () => {
    const projectId = insertProject("Existing project");
    const workflowId = insertWorkflow(projectId);
    const missingId = randomUUID();

    const response = await PATCH(
      jsonRequest(`http://relay.test/api/workflows/${workflowId}`, "PATCH", {
        projectId: missingId,
      }),
      { params: Promise.resolve({ id: workflowId }) }
    );

    expect(response.status).toBe(404);
    expect(
      db.select({ projectId: workflows.projectId })
        .from(workflows)
        .where(eq(workflows.id, workflowId))
        .get()?.projectId
    ).toBe(projectId);
  });

  it("returns the real project name in the shared workflow status contract", async () => {
    const projectId = insertProject("Visible project name");
    const workflowId = insertWorkflow(projectId);

    const response = await GET_STATUS(new NextRequest("http://relay.test"), {
      params: Promise.resolve({ id: workflowId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      projectId,
      projectName: "Visible project name",
      pattern: "sequence",
    });
  });
});
