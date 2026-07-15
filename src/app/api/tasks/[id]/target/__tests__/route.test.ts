import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";

const { mockResolveTarget, mockToPreview, mockClassifyTargetError } = vi.hoisted(
  () => ({
    mockResolveTarget: vi.fn(),
    mockToPreview: vi.fn(),
    mockClassifyTargetError: vi.fn(),
  })
);

vi.mock("@/lib/agents/runtime/execution-target", () => ({
  resolveTaskExecutionTarget: mockResolveTarget,
}));
vi.mock("@/lib/agents/runtime/execution-target-preview", () => ({
  toExecutionTargetPreviewItem: mockToPreview,
  classifyExecutionTargetError: mockClassifyTargetError,
}));

import { GET } from "../route";

describe("GET /api/tasks/[id]/target", () => {
  let taskId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    taskId = randomUUID();
    const now = new Date();
    db.insert(tasks)
      .values({
        id: taskId,
        title: "Draft report",
        description: "Use local evidence",
        status: "queued",
        assignedAgent: "ollama",
        agentProfile: "general",
        priority: 2,
        resumeCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => {
    db.delete(tasks).where(eq(tasks.id, taskId)).run();
  });

  it("returns the exact ready target", async () => {
    const target = {
      requestedRuntimeId: "ollama",
      effectiveRuntimeId: "ollama",
      effectiveModelId: "qwen3:8b",
    };
    const preview = {
      key: taskId,
      profileId: "general",
      effectiveRuntimeId: "ollama",
      effectiveModelId: "qwen3:8b",
    };
    mockResolveTarget.mockResolvedValue(target);
    mockToPreview.mockReturnValue(preview);

    const response = await GET(new Request("http://relay.test"), {
      params: Promise.resolve({ id: taskId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      kind: "task",
      ready: true,
      targets: [preview],
      error: null,
    });
    expect(mockResolveTarget).toHaveBeenCalledWith({
      title: "Draft report",
      description: "Use local evidence",
      requestedRuntimeId: "ollama",
      profileId: "general",
    });
  });

  it("returns a named blocked target", async () => {
    mockResolveTarget.mockRejectedValue(new Error("Ollama is unavailable"));
    mockClassifyTargetError.mockReturnValue({
      code: "runtime_unavailable",
      message: "Ollama is unavailable",
    });

    const response = await GET(new Request("http://relay.test"), {
      params: Promise.resolve({ id: taskId }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      kind: "task",
      ready: false,
      targets: [],
      error: {
        code: "runtime_unavailable",
        message: "Ollama is unavailable",
      },
    });
  });
});
