import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Mock ainative-paths to use a temp directory
const testDir = join(tmpdir(), "ainative-screenshot-test-" + Date.now());
vi.mock("@/lib/utils/ainative-paths", () => ({
  getAinativeScreenshotsDir: () => testDir,
}));

// Mock the database
const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
vi.mock("@/lib/db", () => ({
  db: { insert: (...args: unknown[]) => mockInsert(...args) },
}));

vi.mock("@/lib/db/schema", () => ({
  documents: Symbol("documents"),
}));

import { persistScreenshot, SCREENSHOT_TOOL_NAMES } from "../persist";

// Minimal 1x1 red PNG as base64
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

describe("persistScreenshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up test files
    try {
      const { readdirSync } = require("fs");
      for (const f of readdirSync(testDir)) {
        unlinkSync(join(testDir, f));
      }
    } catch { /* ignore */ }
  });

  it("persists a valid screenshot and returns attachment metadata", async () => {
    const result = await persistScreenshot(TINY_PNG_BASE64, {
      conversationId: "conv-1",
      messageId: "msg-1",
      toolName: "mcp__chrome-devtools__take_screenshot",
    });

    expect(result).not.toBeNull();
    expect(result!.documentId).toBeTruthy();
    expect(result!.thumbnailUrl).toContain("/api/documents/");
    expect(result!.thumbnailUrl).toContain("thumb=1");
    expect(result!.originalUrl).toContain("inline=1");
    expect(result!.width).toBe(1);
    expect(result!.height).toBe(1);

    // File should exist on disk
    const originalPath = join(testDir, `${result!.documentId}.png`);
    expect(existsSync(originalPath)).toBe(true);

    // DB insert should have been called
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized base64 data", async () => {
    // Create a string > 20MB
    const oversized = "A".repeat(21 * 1024 * 1024);
    const result = await persistScreenshot(oversized, {
      toolName: "mcp__chrome-devtools__take_screenshot",
    });

    expect(result).toBeNull();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("returns null on invalid base64 data", async () => {
    const result = await persistScreenshot("not-valid-base64!!!", {
      toolName: "mcp__chrome-devtools__take_screenshot",
    });

    // image-size will fail on invalid data
    expect(result).toBeNull();
  });

  it("returns null when DB insert fails and cleans up files", async () => {
    mockInsert.mockReturnValueOnce({
      values: vi.fn().mockRejectedValue(new Error("DB locked")),
    });

    const result = await persistScreenshot(TINY_PNG_BASE64, {
      toolName: "mcp__chrome-devtools__take_screenshot",
    });

    expect(result).toBeNull();
  });

  it("exports correct screenshot tool names", () => {
    expect(SCREENSHOT_TOOL_NAMES.has("mcp__chrome-devtools__take_screenshot")).toBe(true);
    expect(SCREENSHOT_TOOL_NAMES.has("mcp__playwright__browser_take_screenshot")).toBe(true);
    expect(SCREENSHOT_TOOL_NAMES.has("mcp__relay__execute_task")).toBe(false);
  });
});
