import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, workflows } from "@/lib/db/schema";

const { mockResolveTargets, mockClassifyTargetError } = vi.hoisted(() => ({
  mockResolveTargets: vi.fn(),
  mockClassifyTargetError: vi.fn(),
}));

vi.mock("@/lib/workflows/execution-targets", () => ({
  resolveWorkflowExecutionTargets: mockResolveTargets,
}));
vi.mock("@/lib/agents/runtime/execution-target-preview", () => ({
  classifyExecutionTargetError: mockClassifyTargetError,
}));

import { GET } from "../route";

describe("GET /api/workflows/[id]/target", () => {
  let workflowId: string;
  let projectId: string | null;
  const definition = {
    pattern: "sequence",
    steps: [{ id: "draft", name: "Draft", prompt: "Write it" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RELAY_CELL_ID", "g096-cell");
    workflowId = randomUUID();
    projectId = null;
    const now = new Date();
    db.insert(workflows)
      .values({
        id: workflowId,
        name: "Local report",
        definition: JSON.stringify(definition),
        status: "draft",
        runtimeId: "ollama",
        runNumber: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    db.delete(workflows).where(eq(workflows.id, workflowId)).run();
    if (projectId) db.delete(projects).where(eq(projects.id, projectId)).run();
    vi.unstubAllEnvs();
  });

  it("returns every resolved workflow step target", async () => {
    const targets = [
      {
        key: "draft",
        label: "Draft",
        effectiveRuntimeId: "ollama",
        effectiveModelId: "qwen3:8b",
      },
    ];
    mockResolveTargets.mockResolvedValue(targets);

    const response = await GET(new Request("http://relay.test"), {
      params: Promise.resolve({ id: workflowId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "workflow",
      ready: true,
      targets,
      context: {
        workingDirectorySource: "launch",
        cell: {
          vocabularyVersion: "relay-host-cell-v1",
          instanceId: "g096-cell",
        },
      },
      error: null,
    });
    expect(mockResolveTargets).toHaveBeenCalledWith({
      definition,
      workflowRuntimeId: "ollama",
    });
  });

  it("returns a named blocked workflow target", async () => {
    mockResolveTargets.mockRejectedValue(
      new Error("Step `Draft` cannot run: Ollama lacks filesystem tools")
    );
    mockClassifyTargetError.mockReturnValue({
      code: "runtime_capability_mismatch",
      message: "Step `Draft` cannot run: Ollama lacks filesystem tools",
    });

    const response = await GET(new Request("http://relay.test"), {
      params: Promise.resolve({ id: workflowId }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      kind: "workflow",
      ready: false,
      targets: [],
      error: { code: "runtime_capability_mismatch" },
    });
  });

  it("returns the workflow project working directory beside every step target", async () => {
    projectId = randomUUID();
    const now = new Date();
    db.insert(projects)
      .values({
        id: projectId,
        name: "Release operations",
        workingDirectory: "/srv/release-ops",
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.update(workflows)
      .set({ projectId })
      .where(eq(workflows.id, workflowId))
      .run();
    mockResolveTargets.mockResolvedValue([
      { key: "draft", label: "Draft", effectiveRuntimeId: "ollama" },
    ]);

    const body = await (
      await GET(new Request("http://relay.test"), {
        params: Promise.resolve({ id: workflowId }),
      })
    ).json();

    expect(body.context).toMatchObject({
      projectId,
      projectName: "Release operations",
      workingDirectory: "/srv/release-ops",
      workingDirectorySource: "project",
      cell: { vocabularyVersion: "relay-host-cell-v1" },
    });
    expect(Object.keys(body.context.cell).sort()).toEqual([
      "instanceId",
      "vocabularyVersion",
    ]);
  });
});
