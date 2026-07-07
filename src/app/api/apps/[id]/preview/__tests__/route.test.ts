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
    createAppPreview: vi.fn(),
  };
});

import { POST } from "../route";
import { AppPublishError, createAppPreview } from "@/lib/publishers/app-publish";

function req() {
  return new Request("http://localhost/api/apps/app-1/preview", {
    method: "POST",
  }) as unknown as import("next/server").NextRequest;
}

describe("POST /api/apps/[id]/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a preview artifact and returns 201", async () => {
    vi.mocked(createAppPreview).mockResolvedValue({
      artifactId: "artifact-1",
      url: "http://127.0.0.1:3000/api/apps/app-1/previews/artifact-1",
      hash: "abc123",
      createdAt: "2026-07-07T00:00:00.000Z",
      expiresAt: "2026-07-08T00:00:00.000Z",
    });

    const res = await POST(req(), { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      artifactId: "artifact-1",
      url: "http://127.0.0.1:3000/api/apps/app-1/previews/artifact-1",
      hash: "abc123",
      createdAt: "2026-07-07T00:00:00.000Z",
      expiresAt: "2026-07-08T00:00:00.000Z",
    });
    expect(createAppPreview).toHaveBeenCalledWith("app-1");
  });

  it("returns named preview creation errors", async () => {
    vi.mocked(createAppPreview).mockRejectedValue(
      new AppPublishError(
        "APP_GENERATE_NOT_CONFIGURED",
        "App manifest does not declare view.bindings.generate",
        400
      )
    );

    const res = await POST(req(), { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "App manifest does not declare view.bindings.generate",
      code: "APP_GENERATE_NOT_CONFIGURED",
    });
  });
});
