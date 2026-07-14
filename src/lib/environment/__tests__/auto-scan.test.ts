import { describe, expect, it, vi, beforeEach } from "vitest";
import { shouldRescan, ensureFreshScan } from "../auto-scan";

vi.mock("../data", () => ({
  getLatestScan: vi.fn(),
  createScan: vi.fn(),
}));

vi.mock("../scanner", () => ({
  scanEnvironment: vi.fn(() => ({
    personas: ["claude-code"],
    artifacts: [],
    durationMs: 15,
    errors: [],
  })),
}));

import { getLatestScan, createScan } from "../data";
import { scanEnvironment } from "../scanner";

const mockGetLatestScan = getLatestScan as ReturnType<typeof vi.fn>;
const mockCreateScan = createScan as ReturnType<typeof vi.fn>;
const mockScanEnvironment = scanEnvironment as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockGetLatestScan.mockReset();
  mockCreateScan.mockReset();
  mockScanEnvironment.mockReset();
  mockScanEnvironment.mockReturnValue({
    personas: ["claude-code"],
    artifacts: [],
    durationMs: 15,
    errors: [],
  });
});

describe("shouldRescan", () => {
  it("returns true when no scan exists", () => {
    mockGetLatestScan.mockReturnValue(undefined);
    expect(shouldRescan("project-1")).toBe(true);
  });

  it("returns true when latest scan is older than 5 minutes", () => {
    mockGetLatestScan.mockReturnValue({
      scannedAt: new Date(Date.now() - 6 * 60 * 1000),
    });
    expect(shouldRescan("project-1")).toBe(true);
  });

  it("returns false when latest scan is recent", () => {
    mockGetLatestScan.mockReturnValue({
      scannedAt: new Date(Date.now() - 2 * 60 * 1000),
    });
    expect(shouldRescan("project-1")).toBe(false);
  });
});

describe("ensureFreshScan", () => {
  it("scans and persists when stale", () => {
    mockGetLatestScan.mockReturnValue(undefined);
    const result = ensureFreshScan("/home/user/project", "project-1");

    expect(mockScanEnvironment).toHaveBeenCalledWith({ projectDir: "/home/user/project" });
    expect(mockCreateScan).toHaveBeenCalled();
    expect(result).not.toBeNull();
  });

  it("returns null when scan is fresh", () => {
    mockGetLatestScan.mockReturnValue({
      scannedAt: new Date(Date.now() - 60 * 1000),
    });
    const result = ensureFreshScan("/home/user/project", "project-1");

    expect(mockScanEnvironment).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("catches errors and returns null", () => {
    mockGetLatestScan.mockReturnValue(undefined);
    mockScanEnvironment.mockImplementation(() => {
      throw new Error("scan failed");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = ensureFreshScan("/home/user/project", "project-1");

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Auto-scan failed"),
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });
});
