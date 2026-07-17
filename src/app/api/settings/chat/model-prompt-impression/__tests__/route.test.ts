import { beforeEach, describe, expect, it, vi } from "vitest";

const { claimPrompt } = vi.hoisted(() => ({ claimPrompt: vi.fn() }));

vi.mock("@/lib/settings/helpers", () => ({
  claimModelPreferencePromptImpression: claimPrompt,
  MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED:
    "MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED",
}));

import { POST } from "../route";

beforeEach(() => {
  claimPrompt.mockReset();
});

describe("POST /api/settings/chat/model-prompt-impression", () => {
  it("grants the first durable impression claim", async () => {
    claimPrompt.mockResolvedValue(true);
    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ claimed: true });
  });

  it("refuses subsequent browser/session claims without an error", async () => {
    claimPrompt.mockResolvedValue(false);
    const response = await POST();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ claimed: false });
  });

  it("returns a named visible failure contract when storage fails", async () => {
    claimPrompt.mockRejectedValue(new Error("database is read-only"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await POST();
      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({
        error: "MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED",
        message:
          "Relay could not record the default-model prompt. Choose a model in Settings after storage is available.",
      });
      expect(consoleError).toHaveBeenCalledWith(
        "[MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED]",
        expect.any(Error)
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
