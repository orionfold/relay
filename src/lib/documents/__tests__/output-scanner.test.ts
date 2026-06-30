import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSelect,
  mockFrom,
  mockWhere,
  mockInsert,
  mockValues,
  mockProcessDocument,
} = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  const mockValues = vi.fn().mockResolvedValue(undefined);
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  const mockProcessDocument = vi.fn().mockResolvedValue(undefined);

  return {
    mockSelect,
    mockFrom,
    mockWhere,
    mockInsert,
    mockValues,
    mockProcessDocument,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock("@/lib/db/schema", () => ({
  tasks: {
    id: "id",
    projectId: "project_id",
  },
  documents: {
    taskId: "task_id",
    direction: "direction",
    originalName: "original_name",
    version: "version",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column: string, value: unknown) => ({ column, value })),
  and: vi.fn((...parts: unknown[]) => ({ type: "and", parts })),
}));

vi.mock("../processor", () => ({
  processDocument: mockProcessDocument,
}));

describe("output-scanner", () => {
  let tempDataDir: string;
  const originalDataDir = process.env.RELAY_DATA_DIR;

  beforeEach(() => {
    tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-output-scanner-"));
    process.env.RELAY_DATA_DIR = tempDataDir;
    vi.resetModules();
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhere.mockClear();
    mockInsert.mockClear();
    mockValues.mockClear();
    mockProcessDocument.mockClear();
  });

  afterEach(() => {
    process.env.RELAY_DATA_DIR = originalDataDir;
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  });

  it("prepares a clean task output directory for fresh runs", async () => {
    const outputDir = path.join(tempDataDir, "outputs", "task-1");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "stale.txt"), "stale");

    const mod = await import("../output-scanner");
    const prepared = await mod.prepareTaskOutputDirectory("task-1", {
      clearExisting: true,
    });

    expect(prepared).toBe(outputDir);
    expect(fs.existsSync(outputDir)).toBe(true);
    expect(fs.readdirSync(outputDir)).toEqual([]);
  });

  it("registers supported output files and versions rerun filenames", async () => {
    mockWhere
      .mockResolvedValueOnce([{ id: "task-1", projectId: "project-1" }])
      .mockResolvedValueOnce([{ originalName: "report.md", version: 1 }]);

    const outputDir = path.join(tempDataDir, "outputs", "task-1");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "report.md"), "# Report");
    fs.writeFileSync(path.join(outputDir, "summary.txt"), "Summary");
    fs.writeFileSync(path.join(outputDir, "image.png"), "ignored");

    const mod = await import("../output-scanner");
    const insertedIds = await mod.scanTaskOutputDocuments("task-1");

    expect(insertedIds).toHaveLength(2);
    expect(mockValues).toHaveBeenCalledTimes(2);
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-1",
        projectId: "project-1",
        originalName: "report.md",
        mimeType: "text/markdown",
        direction: "output",
        version: 2,
      })
    );
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-1",
        projectId: "project-1",
        originalName: "summary.txt",
        mimeType: "text/plain",
        direction: "output",
        version: 1,
      })
    );

    const archivedPaths = mockValues.mock.calls.map(
      ([value]) => (value as { storagePath: string }).storagePath
    );
    archivedPaths.forEach((archivedPath) => {
      expect(fs.existsSync(archivedPath)).toBe(true);
    });
    expect(mockProcessDocument).toHaveBeenCalledTimes(2);
  });
});
