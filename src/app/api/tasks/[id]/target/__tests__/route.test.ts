import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";

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
  let projectId: string | null;

  beforeEach(() => {
    vi.clearAllMocks();
    taskId = randomUUID();
    projectId = null;
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
    if (projectId) db.delete(projects).where(eq(projects.id, projectId)).run();
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
    const body = await response.json();
    expect(body).toMatchObject({
      kind: "task",
      ready: true,
      targets: [preview],
      context: {
        workingDirectorySource: "launch",
        cell: { vocabularyVersion: "relay-host-cell-v1" },
      },
      error: null,
    });
    expect(Object.keys(body.context.cell).sort()).toEqual([
      "instanceId",
      "vocabularyVersion",
    ]);
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
    expect(await response.json()).toMatchObject({
      kind: "task",
      ready: false,
      targets: [],
      context: {
        workingDirectorySource: "launch",
        cell: { vocabularyVersion: "relay-host-cell-v1" },
      },
      error: {
        code: "runtime_unavailable",
        message: "Ollama is unavailable",
      },
    });
  });

  it("returns the project working directory beside the runtime target", async () => {
    projectId = randomUUID();
    const now = new Date();
    db.insert(projects)
      .values({
        id: projectId,
        name: "Acme report",
        workingDirectory: "/srv/acme-report",
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.update(tasks)
      .set({ projectId })
      .where(eq(tasks.id, taskId))
      .run();
    mockResolveTarget.mockResolvedValue({
      requestedRuntimeId: "ollama",
      effectiveRuntimeId: "ollama",
      effectiveModelId: "qwen3:8b",
    });
    mockToPreview.mockReturnValue({ key: taskId });

    const body = await (
      await GET(new Request("http://relay.test"), {
        params: Promise.resolve({ id: taskId }),
      })
    ).json();

    expect(body.context).toMatchObject({
      projectId,
      projectName: "Acme report",
      workingDirectory: "/srv/acme-report",
      workingDirectorySource: "project",
    });
  });
});
