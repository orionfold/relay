import { randomUUID } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowReceiptRuns, workflows } from "@/lib/db/schema";

const { mockResolveTargets, mockClassifyTargetError, mockExecuteWorkflow } =
  vi.hoisted(() => ({
    mockResolveTargets: vi.fn(),
    mockClassifyTargetError: vi.fn(),
    mockExecuteWorkflow: vi.fn(),
  }));

vi.mock("@/lib/workflows/execution-targets", () => ({
  resolveWorkflowExecutionTargets: mockResolveTargets,
}));
vi.mock("@/lib/agents/runtime/execution-target-preview", () => ({
  classifyExecutionTargetError: mockClassifyTargetError,
}));
vi.mock("@/lib/workflows/engine", () => ({
  executeWorkflow: mockExecuteWorkflow,
}));

import { POST } from "../route";

describe("POST /api/workflows/[id]/execute target preflight", () => {
  let workflowId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    db.delete(workflowReceiptRuns).run();
    db.delete(workflows).run();
    workflowId = randomUUID();
    const now = new Date();
    db.insert(workflows)
      .values({
        id: workflowId,
        name: "Local report",
        definition: JSON.stringify({
          pattern: "sequence",
          steps: [{ id: "draft", name: "Draft", prompt: "Write it" }],
        }),
        status: "draft",
        runNumber: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    mockResolveTargets.mockResolvedValue([]);
    mockExecuteWorkflow.mockReturnValue(new Promise(() => {}));
  });

  afterEach(() => {
    db.delete(workflowReceiptRuns).run();
    db.delete(workflows).where(eq(workflows.id, workflowId)).run();
  });

  it("leaves the workflow draft when any step target is blocked", async () => {
    mockResolveTargets.mockRejectedValue(
      new Error("Step `Draft` cannot run: Ollama lacks filesystem tools")
    );
    mockClassifyTargetError.mockReturnValue({
      code: "runtime_capability_mismatch",
      message: "Step `Draft` cannot run: Ollama lacks filesystem tools",
    });

    const response = await POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: workflowId }),
    });

    expect(response.status).toBe(409);
    const row = db.select().from(workflows).where(eq(workflows.id, workflowId)).get();
    expect(row?.status).toBe("draft");
    expect(row?.runNumber).toBe(0);
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });

  it("claims one run and persists its receipt before dispatch", async () => {
    const response = await POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: workflowId }),
    });

    expect(response.status).toBe(202);
    expect(db.select().from(workflows).where(eq(workflows.id, workflowId)).get()).toMatchObject({
      status: "active",
      runNumber: 1,
    });
    expect(
      db.select().from(workflowReceiptRuns).where(eq(workflowReceiptRuns.workflowId, workflowId)).all()
    ).toEqual([
      expect.objectContaining({ workflowId, runNumber: 1, terminalStatus: null }),
    ]);
    expect(mockExecuteWorkflow).toHaveBeenCalledOnce();
  });

  it("allows only one concurrent launch and one run receipt", async () => {
    let release!: (value: unknown[]) => void;
    mockResolveTargets.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );

    const first = POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: workflowId }),
    });
    const second = POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: workflowId }),
    });
    await vi.waitFor(() => expect(mockResolveTargets).toHaveBeenCalledTimes(2));
    release([]);

    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status).sort()).toEqual([202, 409]);
    expect(mockExecuteWorkflow).toHaveBeenCalledTimes(1);
    expect(
      db.select().from(workflowReceiptRuns).where(eq(workflowReceiptRuns.workflowId, workflowId)).all()
    ).toHaveLength(1);
  });

  it("returns 404 for a missing workflow", async () => {
    const response = await POST(new Request("http://relay.test") as never, {
      params: Promise.resolve({ id: randomUUID() }),
    });

    expect(response.status).toBe(404);
    expect(mockExecuteWorkflow).not.toHaveBeenCalled();
  });
});
