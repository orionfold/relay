import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/publishers/app-publish", () => {
  class AppPublishError extends Error {
    code: string;
    statusCode: number;
    constructor(code: string, message: string, statusCode = 400) {
      super(message);
      this.name = "AppPublishError";
      this.code = code;
      this.statusCode = statusCode;
    }
  }
  return {
    AppPublishError,
    triggerAppPublish: vi.fn(),
    runDeployment: vi.fn(),
  };
});

import { POST } from "../route";
import {
  AppPublishError,
  runDeployment,
  triggerAppPublish,
} from "@/lib/publishers/app-publish";

function req(body: unknown) {
  return new Request("http://localhost/api/apps/app-1/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/apps/[id]/publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a deployment, starts background work, and returns 202", async () => {
    vi.mocked(triggerAppPublish).mockReturnValue({
      deployment: {
        id: "dep-1",
        appId: "app-1",
        targetId: "target-1",
        status: "pending",
        url: null,
        commit: null,
        artifactHash: null,
        startedAt: new Date("2026-07-07T00:00:00Z"),
        finishedAt: null,
        error: null,
      },
    });
    vi.mocked(runDeployment).mockResolvedValue({} as never);

    const res = await POST(req({ targetId: "target-1" }), {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.deployment.id).toBe("dep-1");
    expect(triggerAppPublish).toHaveBeenCalledWith("app-1", "target-1");
    expect(runDeployment).toHaveBeenCalledWith("dep-1");
  });

  it("returns a named 404 when the app or target does not exist", async () => {
    vi.mocked(triggerAppPublish).mockImplementation(() => {
      throw new AppPublishError("PUBLISH_TARGET_NOT_FOUND", "Publish target not found", 404);
    });

    const res = await POST(req({ targetId: "missing" }), {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "Publish target not found",
      code: "PUBLISH_TARGET_NOT_FOUND",
    });
    expect(runDeployment).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies before creating a deployment", async () => {
    const res = await POST(req({}), {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(400);
    expect(triggerAppPublish).not.toHaveBeenCalled();
  });
});
