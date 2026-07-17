import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDevMode: vi.fn(),
  hasGitDir: vi.fn(),
  getInstanceConfig: vi.fn(),
}));

vi.mock("../detect", () => ({
  isDevMode: mocks.isDevMode,
  hasGitDir: mocks.hasGitDir,
}));

vi.mock("../settings", () => ({
  getInstanceConfig: mocks.getInstanceConfig,
}));

import { getRelayCellBoundary } from "../cell-boundary";

describe("Relay cell identity resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RELAY_CELL_ID;
    mocks.isDevMode.mockReturnValue(false);
    mocks.hasGitDir.mockReturnValue(false);
    mocks.getInstanceConfig.mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.RELAY_CELL_ID;
  });

  it("uses a validated managed Cell ID in a no-git OCI runtime", () => {
    vi.stubEnv("RELAY_CELL_ID", "g096-cell");

    expect(getRelayCellBoundary().instanceId).toBe("g096-cell");
    expect(mocks.getInstanceConfig).not.toHaveBeenCalled();
  });

  it("gives the managed Cell ID precedence over git-backed bootstrap identity", () => {
    vi.stubEnv("RELAY_CELL_ID", "managed-cell");
    mocks.hasGitDir.mockReturnValue(true);
    mocks.getInstanceConfig.mockReturnValue({ instanceId: "git-instance" });

    expect(getRelayCellBoundary().instanceId).toBe("managed-cell");
    expect(mocks.getInstanceConfig).not.toHaveBeenCalled();
  });

  it("fails closed when the managed Cell ID is invalid", () => {
    vi.stubEnv("RELAY_CELL_ID", "Customer / A");

    expect(() => getRelayCellBoundary()).toThrowError(
      expect.objectContaining({
        name: "InvalidRelayCellIdError",
        code: "CELL_ID_INVALID",
      }),
    );
    expect(mocks.getInstanceConfig).not.toHaveBeenCalled();
  });

  it("preserves unavailable identity for ordinary no-git and dev installs", () => {
    expect(getRelayCellBoundary().instanceId).toBeNull();

    mocks.isDevMode.mockReturnValue(true);
    mocks.hasGitDir.mockReturnValue(true);
    mocks.getInstanceConfig.mockReturnValue({ instanceId: "stale-instance" });
    expect(getRelayCellBoundary().instanceId).toBeNull();
    expect(mocks.getInstanceConfig).not.toHaveBeenCalled();
  });

  it("retains the persisted identity for an eligible git-backed instance", () => {
    mocks.hasGitDir.mockReturnValue(true);
    mocks.getInstanceConfig.mockReturnValue({ instanceId: "git-instance" });

    expect(getRelayCellBoundary().instanceId).toBe("git-instance");
  });
});
