/** @vitest-environment node */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const listModels = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/runtime/openai-compatible", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/agents/runtime/openai-compatible")
  >("@/lib/agents/runtime/openai-compatible");
  return { ...actual, listOpenAICompatibleModels: listModels };
});

import { GET } from "../route";

function invoke(runtimeId: string) {
  return GET(
    new NextRequest(`http://relay.test/api/runtimes/openai-compatible/${runtimeId}`),
    { params: Promise.resolve({ runtimeId }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/runtimes/openai-compatible/[runtimeId] boundary contract", () => {
  it.each(["litellm", "lmstudio"])(
    "returns models attributed to the explicit %s runtime",
    async (runtimeId) => {
      listModels.mockResolvedValue([{ id: `${runtimeId}:model-a`, label: "Model A" }]);

      const response = await invoke(runtimeId);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        runtimeId,
        models: [{ id: `${runtimeId}:model-a`, label: "Model A" }],
      });
      expect(listModels).toHaveBeenCalledWith(runtimeId);
    }
  );

  it("rejects an unrecognized provider without discovery", async () => {
    const response = await invoke("openai");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "runtimeId must be litellm or lmstudio",
    });
    expect(listModels).not.toHaveBeenCalled();
  });

  it("exposes a named upstream discovery failure", async () => {
    listModels.mockRejectedValue(new Error("LiteLLM model endpoint returned 401"));

    const response = await invoke("litellm");

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "LiteLLM model endpoint returned 401",
    });
  });
});
