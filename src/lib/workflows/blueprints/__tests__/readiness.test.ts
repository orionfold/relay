import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveTarget, classifyError, previewItem } = vi.hoisted(() => ({
  resolveTarget: vi.fn(),
  classifyError: vi.fn(),
  previewItem: vi.fn(),
}));
vi.mock("@/lib/agents/runtime/execution-target", () => ({
  resolveTaskExecutionTarget: resolveTarget,
}));
vi.mock("@/lib/agents/runtime/execution-target-preview", () => ({
  classifyExecutionTargetError: classifyError,
  toExecutionTargetPreviewItem: previewItem,
}));

import { getBlueprintReadiness } from "../readiness";

describe("getBlueprintReadiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveTarget.mockResolvedValue({ effectiveRuntimeId: "claude-code" });
    previewItem.mockReturnValue({
      key: "first",
      effectiveRuntimeId: "claude-code",
    });
  });

  it("calls Ready only after the first task profile resolves", async () => {
    const result = await getBlueprintReadiness("research-report");

    expect(result).toMatchObject({
      ready: true,
      target: { effectiveRuntimeId: "claude-code" },
    });
    expect(resolveTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.any(String),
        profileId: expect.any(String),
      }),
    );
  });

  it("returns a settings recovery path for an ineligible target", async () => {
    resolveTarget.mockRejectedValue(new Error("No eligible runtime"));
    classifyError.mockReturnValue({
      code: "no_eligible_runtime",
      message: "No eligible runtime",
    });

    await expect(getBlueprintReadiness("research-report")).resolves.toMatchObject({
      ready: false,
      code: "no_eligible_runtime",
      settingsHref: "/settings#settings-providers-runtimes",
    });
  });

  it("does not call a missing blueprint ready", async () => {
    await expect(getBlueprintReadiness("missing-blueprint")).resolves.toMatchObject({
      ready: false,
      code: "blueprint_not_found",
    });
    expect(resolveTarget).not.toHaveBeenCalled();
  });
});
