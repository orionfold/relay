import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDevMode: vi.fn(),
  hasGitDir: vi.fn(),
  getInstanceConfig: vi.fn(),
  getGuardrails: vi.fn(),
  getUpgradeState: vi.fn(),
  getRelayCellBoundary: vi.fn(),
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
vi.mock("@/lib/instance/cell-boundary", () => ({
  getRelayCellBoundary: mocks.getRelayCellBoundary,
}));

import { GET } from "../route";

const boundary = {
  vocabularyVersion: "relay-host-cell-v1",
  instanceId: null,
  dataDirectory: "/srv/relay/cell-a",
  databasePath: "/srv/relay/cell-a/relay.db",
  launchWorkingDirectory: "/srv/relay/work",
  dataDirectorySource: "override",
};

describe("GET /api/instance/config", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRelayCellBoundary.mockReturnValue(boundary);
    mocks.getInstanceConfig.mockReturnValue(null);
    mocks.getGuardrails.mockReturnValue(null);
    mocks.getUpgradeState.mockReturnValue(null);
  });

  it("returns cell facts while suppressing stale bootstrap identity in dev mode", async () => {
    mocks.isDevMode.mockReturnValue(true);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      devMode: true,
      boundary,
      config: null,
      guardrails: null,
      upgrade: null,
    });
    expect(mocks.getInstanceConfig).not.toHaveBeenCalled();
  });

  it("returns the cell facts and truthful no-git maintenance state for npx", async () => {
    mocks.isDevMode.mockReturnValue(false);
    mocks.hasGitDir.mockReturnValue(false);

    const response = await GET();

    expect(await response.json()).toMatchObject({
      devMode: false,
      skippedReason: "no_git",
      boundary,
      config: null,
    });
  });

  it("returns the initialized instance and the same safe boundary contract", async () => {
    mocks.isDevMode.mockReturnValue(false);
    mocks.hasGitDir.mockReturnValue(true);
    const config = {
      instanceId: "cell-a",
      branchName: "instance/a",
      isPrivateInstance: true,
      createdAt: 123,
    };
    mocks.getInstanceConfig.mockReturnValue(config);
    mocks.getGuardrails.mockReturnValue({ consentStatus: "enabled" });
    mocks.getUpgradeState.mockReturnValue({ upgradeAvailable: false });

    const body = await (await GET()).json();

    expect(body).toMatchObject({
      devMode: false,
      boundary,
      config,
    });
    expect(Object.keys(body.boundary).sort()).toEqual([
      "dataDirectory",
      "dataDirectorySource",
      "databasePath",
      "instanceId",
      "launchWorkingDirectory",
      "vocabularyVersion",
    ]);
  });
});
