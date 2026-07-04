import { describe, it, expect, vi, beforeEach } from "vitest";

// BUG-1 defense-in-depth: the git() helper must route stderr to a pipe so a
// non-git cwd can never leak `fatal: not a git repository` to the customer
// console. This site is dead-code-gated today (only sync-engine.ts imports it,
// and executeSync has no callers), but harden it so it can't leak if re-reached.
const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(() => ""),
}));

vi.mock("child_process", () => ({
  default: { execFileSync: execFileSyncMock },
  execFileSync: execFileSyncMock,
}));

import { isGitRepo } from "../git-manager";

beforeEach(() => {
  execFileSyncMock.mockReset();
  execFileSyncMock.mockReturnValue("true");
});

describe("git-manager git() helper", () => {
  it("pipes stderr instead of inheriting it (no fatal leak)", () => {
    isGitRepo("/some/dir");
    const call = execFileSyncMock.mock.calls[0] as unknown[] | undefined;
    const opts = call?.[2] as { stdio?: unknown } | undefined;
    expect(opts?.stdio).toEqual(["ignore", "pipe", "pipe"]);
  });

  it("degrades to success:false when git throws (non-git dir)", () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("fatal: not a git repository");
    });
    expect(isGitRepo("/not/a/repo")).toBe(false);
  });
});
