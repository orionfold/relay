/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  discover: vi.fn(),
  startDownload: vi.fn(),
  getDownloadStatus: vi.fn(),
}));

vi.mock("@/lib/agents/runtime/provider-models", () => ({
  discoverOpenAICompatibleProviderModels: mocks.discover,
  startLMStudioModelDownload: mocks.startDownload,
  getLMStudioModelDownloadStatus: mocks.getDownloadStatus,
}));

import { GET, POST } from "../route";

function context(runtimeId: string) {
  return { params: Promise.resolve({ runtimeId }) };
}

function get(runtimeId: string, query = "") {
  return GET(
    new NextRequest(
      `http://relay.test/api/runtimes/openai-compatible/${runtimeId}${query}`
    ),
    context(runtimeId)
  );
}

function post(runtimeId: string, body: unknown) {
  return POST(
    new NextRequest(
      `http://relay.test/api/runtimes/openai-compatible/${runtimeId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }
    ),
    context(runtimeId)
  );
}

beforeEach(() => vi.clearAllMocks());

describe("provider model route contract", () => {
  it.each(["litellm", "lmstudio"])(
    "returns normalized %s model details",
    async (runtimeId) => {
      mocks.discover.mockResolvedValue({
        runtimeId,
        models: [{ id: "model-a", name: "Model A", provider: runtimeId }],
      });
      const response = await get(runtimeId);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ runtimeId });
      expect(mocks.discover).toHaveBeenCalledWith(runtimeId);
    }
  );

  it("rejects an unrecognized runtime without discovery", async () => {
    const response = await get("openai");
    expect(response.status).toBe(404);
    expect(mocks.discover).not.toHaveBeenCalled();
  });

  it("exposes a named discovery phase failure", async () => {
    mocks.discover.mockRejectedValue(new Error("LiteLLM returned 401"));
    const response = await get("litellm");
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      phase: "discovery",
      error: "LiteLLM returned 401",
    });
  });
});

describe("provider acquisition capability route", () => {
  it("starts and polls an LM Studio download", async () => {
    mocks.startDownload.mockResolvedValue({
      jobId: "job-1",
      status: "downloading",
      totalSizeBytes: 0,
    });
    const started = await post("lmstudio", {
      action: "download",
      model: "ibm/granite",
      quantization: "Q4_K_M",
    });
    expect(started.status).toBe(200);
    expect(await started.json()).toMatchObject({
      runtimeId: "lmstudio",
      action: "download",
      jobId: "job-1",
      totalSizeBytes: 0,
    });
    expect(mocks.startDownload).toHaveBeenCalledWith(
      "ibm/granite",
      "Q4_K_M"
    );

    mocks.getDownloadStatus.mockResolvedValue({
      jobId: "job-1",
      status: "completed",
    });
    const polled = await get("lmstudio", "?downloadJobId=job-1");
    expect(polled.status).toBe(200);
    expect(await polled.json()).toMatchObject({ status: "completed" });
  });

  it("refuses LiteLLM download and malformed LM Studio actions", async () => {
    expect((await post("litellm", { action: "download", model: "x" })).status).toBe(400);
    expect((await post("lmstudio", "{")).status).toBe(400);
    expect(mocks.startDownload).not.toHaveBeenCalled();
  });
});
