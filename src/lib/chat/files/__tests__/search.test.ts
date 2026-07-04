import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mutable state so the mock factories can read it.
const { mockState } = vi.hoisted(() => ({
  mockState: {
    stdout: "" as string,
    execFileThrows: false as boolean | Error,
    files: new Map<string, { size: number; mtimeMs: number }>(),
    realpathMap: new Map<string, string>(),
  },
}));

vi.mock("node:child_process", () => {
  const execFileSync = vi.fn(() => {
    if (mockState.execFileThrows) {
      throw mockState.execFileThrows instanceof Error
        ? mockState.execFileThrows
        : new Error("git not available");
    }
    return mockState.stdout;
  });
  return {
    default: { execFileSync },
    execFileSync,
  };
});

vi.mock("node:fs", () => {
  const realpathSync = (p: string) => mockState.realpathMap.get(p) ?? p;
  const statSync = (absPath: string) => {
    const f = mockState.files.get(absPath);
    if (!f) throw new Error(`ENOENT: ${absPath}`);
    return { size: f.size, mtimeMs: f.mtimeMs };
  };
  return {
    default: { realpathSync, statSync },
    realpathSync,
    statSync,
  };
});

import { searchFiles } from "../search";
import { execFileSync } from "node:child_process";

// Helper: all test files live under this fake cwd
const CWD = "/repo";

function file(relPath: string, size: number, mtimeMs: number) {
  mockState.files.set(`${CWD}/${relPath}`, { size, mtimeMs });
}

beforeEach(() => {
  mockState.stdout = "";
  mockState.execFileThrows = false;
  mockState.files.clear();
  mockState.realpathMap.clear();
  mockState.realpathMap.set(CWD, CWD);
  vi.clearAllMocks();
});

describe("searchFiles", () => {
  it("returns all files when query is empty, mtime-sorted newest first", () => {
    mockState.stdout = ["src/a.ts", "src/b.ts", "src/c.ts", ""].join("\n");
    file("src/a.ts", 100, 1_000);
    file("src/b.ts", 200, 3_000);
    file("src/c.ts", 300, 2_000);

    const hits = searchFiles(CWD, "", 10);
    expect(hits.map((h) => h.path)).toEqual(["src/b.ts", "src/c.ts", "src/a.ts"]);
    expect(hits[0].sizeBytes).toBe(200);
  });

  it("ranks filename matches above directory-path matches", () => {
    mockState.stdout = [
      "src/schema/other.ts", // directory match for "schema"
      "src/lib/db/schema.ts", // filename match for "schema"
      ""
    ].join("\n");
    file("src/schema/other.ts", 100, 1_000);
    file("src/lib/db/schema.ts", 100, 500); // older but should still rank first

    const hits = searchFiles(CWD, "schema", 10);
    expect(hits[0].path).toBe("src/lib/db/schema.ts");
    expect(hits[1].path).toBe("src/schema/other.ts");
  });

  it("performs case-insensitive substring match", () => {
    mockState.stdout = ["src/Foo.TSX", "src/bar.ts", ""].join("\n");
    file("src/Foo.TSX", 100, 1_000);
    file("src/bar.ts", 100, 1_000);

    const hits = searchFiles(CWD, "foo", 10);
    expect(hits).toHaveLength(1);
    expect(hits[0].path).toBe("src/Foo.TSX");
  });

  it("respects limit cap", () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      const p = `src/file${i}.ts`;
      lines.push(p);
      file(p, 100, i * 10);
    }
    mockState.stdout = lines.join("\n");

    const hits = searchFiles(CWD, "", 5);
    expect(hits).toHaveLength(5);
  });

  it("returns [] when execFileSync throws (not a git repo)", () => {
    mockState.execFileThrows = new Error("not a git repository");
    const hits = searchFiles(CWD, "anything", 10);
    expect(hits).toEqual([]);
  });

  it("skips files that disappeared between ls-files and stat", () => {
    mockState.stdout = ["src/exists.ts", "src/ghost.ts", ""].join("\n");
    file("src/exists.ts", 100, 1_000);
    // src/ghost.ts intentionally absent from the files map — statSync throws

    const hits = searchFiles(CWD, "", 10);
    expect(hits.map((h) => h.path)).toEqual(["src/exists.ts"]);
  });

  it("pipes git stderr instead of inheriting it (no first-run fatal leak)", () => {
    // BUG-1 hardening: a non-git cwd must not leak `fatal: not a git
    // repository` to the customer console. The fix routes stderr to a pipe.
    mockState.stdout = "";
    searchFiles(CWD, "", 10);
    const opts = vi.mocked(execFileSync).mock.calls[0]?.[2] as
      | { stdio?: unknown }
      | undefined;
    expect(opts?.stdio).toEqual(["ignore", "pipe", "pipe"]);
  });

  it("excludes files that would resolve outside cwd (defense-in-depth)", () => {
    // git ls-files should never emit such a path, but if it did we must reject.
    mockState.stdout = ["../escape.ts", "src/ok.ts", ""].join("\n");
    // Do NOT register the escape path in files — resolve() would point outside
    // /repo, and the startsWith check in search.ts will discard it before
    // statSync is even called.
    file("src/ok.ts", 100, 1_000);

    const hits = searchFiles(CWD, "", 10);
    expect(hits.map((h) => h.path)).toEqual(["src/ok.ts"]);
  });
});
