import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDevMode: vi.fn(),
  hasGitDir: vi.fn(),
  getInstanceConfig: vi.fn(),
  getGuardrails: vi.fn(),
  getUpgradeState: vi.fn(),
}));

vi.mock("@/lib/instance/detect", () => ({
  isDevMode: mocks.isDevMode,
  hasGitDir: mocks.hasGitDir,
}));

vi.mock("@/lib/instance/settings", () => ({
  getInstanceConfig: mocks.getInstanceConfig,
  getGuardrails: mocks.getGuardrails,
  getUpgradeState: mocks.getUpgradeState,
}));

import { GET } from "../route";

describe("GET /api/instance/config managed Cell identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RELAY_CELL_ID", "g096-cell");
    mocks.isDevMode.mockReturnValue(false);
    mocks.hasGitDir.mockReturnValue(false);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the environment-backed Cell ID for a no-git OCI runtime", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      devMode: false,
      skippedReason: "no_git",
      boundary: { instanceId: "g096-cell" },
      config: null,
    });
    expect(mocks.getInstanceConfig).not.toHaveBeenCalled();
  });

  it("fails closed with a named error for an invalid managed Cell ID", async () => {
    vi.stubEnv("RELAY_CELL_ID", "Customer / A");

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: "CELL_ID_INVALID",
      error: "RELAY_CELL_ID must be a lowercase DNS label of at most 63 characters.",
    });
    expect(mocks.getInstanceConfig).not.toHaveBeenCalled();
  });
});
