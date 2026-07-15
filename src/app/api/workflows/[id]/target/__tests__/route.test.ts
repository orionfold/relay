import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";

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
  const definition = {
    pattern: "sequence",
    steps: [{ id: "draft", name: "Draft", prompt: "Write it" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    workflowId = randomUUID();
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
    expect(await response.json()).toEqual({
      kind: "workflow",
      ready: true,
      targets,
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
});
