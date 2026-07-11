import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/packs/app-exporter", () => ({
  AppPackExportError: class AppPackExportError extends Error {},
  buildAppPackArtifact: vi.fn(),
}));

vi.mock("@/lib/publishers/pack-publish", () => ({
  PackPublishError: class PackPublishError extends Error {
    code = "PACK_PUBLISH_FAILED";
    statusCode = 400;
  },
  triggerPackPublish: vi.fn(),
  runPackDeployment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/publishers/community-pack-submission", () => ({
  CommunityPackSubmissionError: class CommunityPackSubmissionError extends Error {
    statusCode = 409;
  },
  prepareCommunityPackSubmission: vi.fn(),
}));

import { POST as inspect } from "../inspect/route";
import { POST as publish } from "../publish/route";
import { POST as communitySubmission } from "../community-submission/route";
import { buildAppPackArtifact } from "@/lib/packs/app-exporter";
import {
  runPackDeployment,
  triggerPackPublish,
} from "@/lib/publishers/pack-publish";
import { prepareCommunityPackSubmission } from "@/lib/publishers/community-pack-submission";

function request(body: unknown) {
  return new Request("http://localhost/api/apps/app-1/pack", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

describe("app pack API routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("inspects the exact file tree without returning file contents", async () => {
    vi.mocked(buildAppPackArtifact).mockResolvedValue({
      packId: "app-1",
      version: "0.1.0",
      entryPoint: "pack.yaml",
      hash: "a".repeat(64),
      sampleRowsIncluded: 0,
      files: [
        { path: "pack.yaml", content: "secret-ish pack content" },
        { path: "base/manifest.yaml", content: "id: app-1" },
      ],
    });

    const response = await inspect(request({ includeSampleData: false }), {
      params: Promise.resolve({ id: "app-1" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      packId: "app-1",
      hash: "a".repeat(64),
      files: [
        { path: "pack.yaml", bytes: 23 },
        { path: "base/manifest.yaml", bytes: 9 },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("secret-ish pack content");
  });

  it("requires an explicit confirmation and preview hash before publish", async () => {
    const invalid = await publish(
      request({ targetId: "target-1", confirm: true }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    expect(invalid.status).toBe(400);
    expect(triggerPackPublish).not.toHaveBeenCalled();

    vi.mocked(triggerPackPublish).mockReturnValue({
      deployment: { id: "deployment-1" } as never,
    });
    const valid = await publish(
      request({
        targetId: "target-1",
        confirm: true,
        includeSampleData: false,
        expectedHash: "b".repeat(64),
      }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    expect(valid.status).toBe(202);
    expect(triggerPackPublish).toHaveBeenCalledWith("app-1", "target-1", {
      targetId: "target-1",
      confirm: true,
      includeSampleData: false,
      expectedHash: "b".repeat(64),
    });
    expect(runPackDeployment).toHaveBeenCalledWith("deployment-1");
  });

  it("prepares a community review URL only for a specific published hash", async () => {
    vi.mocked(prepareCommunityPackSubmission).mockResolvedValue({
      url: "https://github.com/orionfold/relay/issues/new?title=pack",
      repositoryUrl: "https://github.com/maker/pack",
      packId: "app-1",
      version: "0.1.0",
    });
    const response = await communitySubmission(
      request({ targetId: "target-1", expectedHash: "c".repeat(64) }),
      { params: Promise.resolve({ id: "app-1" }) }
    );
    expect(response.status).toBe(200);
    expect(prepareCommunityPackSubmission).toHaveBeenCalledWith(
      "app-1",
      "target-1",
      "c".repeat(64)
    );
  });
});
