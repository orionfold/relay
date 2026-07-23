import { beforeEach, describe, expect, it, vi } from "vitest";

const { startBlueprintMock, executeWorkflowMock, classifyErrorMock } = vi.hoisted(
  () => ({
    startBlueprintMock: vi.fn(),
    executeWorkflowMock: vi.fn(),
    classifyErrorMock: vi.fn(),
  }),
);
vi.mock("@/lib/workflows/blueprints/start", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/workflows/blueprints/start")
  >("@/lib/workflows/blueprints/start");
  return { ...actual, startBlueprint: startBlueprintMock };
});
vi.mock("@/lib/workflows/engine", () => ({
  executeWorkflow: executeWorkflowMock,
}));
vi.mock("@/lib/agents/runtime/execution-target-preview", () => ({
  classifyExecutionTargetError: classifyErrorMock,
}));

import { POST } from "../route";

const requestId = "e66a2afd-6922-410d-94e6-a1498f1182f9";

function request(body: unknown) {
  return new Request("http://relay.test/api/blueprints/research-report/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/blueprints/[id]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeWorkflowMock.mockResolvedValue(undefined);
    classifyErrorMock.mockReturnValue({
      code: "target_resolution_failed",
      message: "failed",
    });
  });

  it("rejects a missing request identity before any start mutation", async () => {
    const response = await POST(request({ variables: {} }), {
      params: Promise.resolve({ id: "research-report" }),
    });

    expect(response.status).toBe(400);
    expect(startBlueprintMock).not.toHaveBeenCalled();
    expect(executeWorkflowMock).not.toHaveBeenCalled();
  });

  it("dispatches a newly claimed exact workflow once", async () => {
    startBlueprintMock.mockResolvedValue({
      workflowId: requestId,
      name: "Report",
      duplicate: false,
    });

    const response = await POST(
      request({ variables: { topic: "Relay" }, idempotencyKey: requestId }),
      { params: Promise.resolve({ id: "research-report" }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: "started",
      workflowId: requestId,
    });
    expect(executeWorkflowMock).toHaveBeenCalledOnce();
    expect(executeWorkflowMock).toHaveBeenCalledWith(requestId);
  });

  it("returns the existing identity without dispatching a duplicate", async () => {
    startBlueprintMock.mockResolvedValue({
      workflowId: requestId,
      name: "Report",
      duplicate: true,
    });

    const response = await POST(
      request({ variables: { topic: "Relay" }, idempotencyKey: requestId }),
      { params: Promise.resolve({ id: "research-report" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "already_started",
      workflowId: requestId,
    });
    expect(executeWorkflowMock).not.toHaveBeenCalled();
  });

  it("preserves a named runtime refusal for recovery UI", async () => {
    startBlueprintMock.mockRejectedValue(new Error("No eligible runtime"));
    classifyErrorMock.mockReturnValue({
      code: "no_eligible_runtime",
      message: "No eligible runtime",
    });

    const response = await POST(
      request({ variables: {}, idempotencyKey: requestId }),
      { params: Promise.resolve({ id: "research-report" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "no_eligible_runtime",
      error: "No eligible runtime",
    });
    expect(executeWorkflowMock).not.toHaveBeenCalled();
  });
});
