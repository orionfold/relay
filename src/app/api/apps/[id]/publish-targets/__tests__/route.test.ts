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
    createPublishTarget: vi.fn(),
    listPublishTargets: vi.fn(),
  };
});

import { GET, POST } from "../route";
import {
  createPublishTarget,
  listPublishTargets,
} from "@/lib/publishers/app-publish";

function req(body: unknown) {
  return new Request("http://localhost/api/apps/app-1/publish-targets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("/api/apps/[id]/publish-targets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists masked publish targets", async () => {
    vi.mocked(listPublishTargets).mockReturnValue([
      {
        id: "target-1",
        appId: "app-1",
        targetType: "github-pages",
        config: JSON.stringify({ githubToken: "****1234", owner: "acme" }),
        createdAt: new Date("2026-07-07T00:00:00Z"),
      },
    ]);

    const res = await GET({} as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "app-1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({
        id: "target-1",
        config: "{\"githubToken\":\"****1234\",\"owner\":\"acme\"}",
      }),
    ]);
  });

  it("creates a target and returns the masked row", async () => {
    vi.mocked(createPublishTarget).mockReturnValue({
      id: "target-1",
      appId: "app-1",
      targetType: "github-pages",
      config: JSON.stringify({ githubToken: "****1234", owner: "acme" }),
      createdAt: new Date("2026-07-07T00:00:00Z"),
    });

    const res = await POST(
      req({
        targetType: "github-pages",
        config: { owner: "acme", repo: "site", githubToken: "ghp_secret1234" },
      }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    expect(res.status).toBe(201);
    expect(createPublishTarget).toHaveBeenCalledWith("app-1", {
      targetType: "github-pages",
      config: { owner: "acme", repo: "site", githubToken: "ghp_secret1234" },
    });
    const body = await res.json();
    expect(body.config).toBe("{\"githubToken\":\"****1234\",\"owner\":\"acme\"}");
  });

  it("rejects unknown keys on create", async () => {
    const res = await POST(
      req({
        targetType: "github-pages",
        config: {},
        htmlEscapeHatch: true,
      }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    expect(res.status).toBe(400);
    expect(createPublishTarget).not.toHaveBeenCalled();
  });
});
