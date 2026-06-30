import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;
let dataDir: string;

function runGit(args: string[], cwd: string) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function initRepo(dir: string) {
  runGit(["init", "-b", "main"], dir);
  runGit(["config", "user.email", "test@example.com"], dir);
  runGit(["config", "user.name", "Test"], dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  runGit(["add", "README.md"], dir);
  runGit(["commit", "-m", "initial"], dir);
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-upgrade-poller-"));
  dataDir = mkdtempSync(join(tmpdir(), "ainative-upgrade-poller-data-"));
  initRepo(tempDir);
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
});

describe("tick", () => {
  it("returns skipped=dev_mode_or_no_git when RELAY_DEV_MODE=true", async () => {
    vi.stubEnv("RELAY_DEV_MODE", "true");
    const { tick } = await import("../upgrade-poller");
    const result = await tick(tempDir);
    expect(result.skipped).toBe("dev_mode_or_no_git");
  });

  it("returns skipped=dev_mode_or_no_git when .git is absent", async () => {
    const noGitDir = mkdtempSync(join(tmpdir(), "ainative-nogit-"));
    try {
      const { tick } = await import("../upgrade-poller");
      const result = await tick(noGitDir);
      expect(result.skipped).toBe("dev_mode_or_no_git");
    } finally {
      rmSync(noGitDir, { recursive: true, force: true });
    }
  });

  it("returns skipped=fetch_failed and records failure count when fetch fails (no remote)", async () => {
    // No origin configured → fetch will fail
    const { tick } = await import("../upgrade-poller");
    const result = await tick(tempDir);
    expect(result.skipped).toBe("fetch_failed");
    expect(result.error).toBeDefined();
    const { getUpgradeState } = await import("../settings");
    const state = getUpgradeState();
    expect(state.pollFailureCount).toBe(1);
    expect(state.lastPollError).toBeTruthy();
    expect(state.lastPolledAt).not.toBeNull();
  });

  it("increments pollFailureCount on repeated failures", async () => {
    const { tick } = await import("../upgrade-poller");
    await tick(tempDir);
    await tick(tempDir);
    await tick(tempDir);
    const { getUpgradeState } = await import("../settings");
    expect(getUpgradeState().pollFailureCount).toBe(3);
  });

  it("inserts one failure notification after 3 consecutive failures, dedupes on the 4th, clears on success", async () => {
    const { tick } = await import("../upgrade-poller");
    const { db } = await import("@/lib/db");
    const { notifications } = await import("@/lib/db/schema");
    const { eq, and, isNull } = await import("drizzle-orm");

    // 2 failures: no notification yet
    await tick(tempDir);
    await tick(tempDir);
    let open = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.toolName, "upgrade_check_failing"), isNull(notifications.respondedAt)));
    expect(open).toHaveLength(0);

    // 3rd failure: notification created
    await tick(tempDir);
    open = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.toolName, "upgrade_check_failing"), isNull(notifications.respondedAt)));
    expect(open).toHaveLength(1);
    expect(open[0].title).toBe("Upgrade check failing");
    expect(open[0].body).toContain("Last 3 upgrade checks failed");

    // 4th failure: still exactly one open notification (deduped)
    await tick(tempDir);
    open = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.toolName, "upgrade_check_failing"), isNull(notifications.respondedAt)));
    expect(open).toHaveLength(1);

    // Success clears the notification
    const bareDir = mkdtempSync(join(tmpdir(), "ainative-bare-"));
    try {
      runGit(["init", "--bare", "-b", "main"], bareDir);
      runGit(["remote", "add", "origin", bareDir], tempDir);
      runGit(["push", "origin", "main"], tempDir);
      await tick(tempDir);
      open = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.toolName, "upgrade_check_failing"), isNull(notifications.respondedAt)));
      expect(open).toHaveLength(0);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("successfully updates state with zero commitsBehind when local == origin/main", async () => {
    // Set up a local 'origin' remote pointing to a bare copy of the same repo
    const bareDir = mkdtempSync(join(tmpdir(), "ainative-bare-"));
    try {
      runGit(["init", "--bare", "-b", "main"], bareDir);
      runGit(["remote", "add", "origin", bareDir], tempDir);
      runGit(["push", "origin", "main"], tempDir);

      const { tick } = await import("../upgrade-poller");
      const result = await tick(tempDir);
      expect(result.updated).toBeDefined();
      expect(result.updated!.commitsBehind).toBe(0);
      expect(result.updated!.upgradeAvailable).toBe(false);
      expect(result.updated!.pollFailureCount).toBe(0);
      expect(result.updated!.lastUpstreamSha).toBeTruthy();
      expect(result.updated!.localMainSha).toBe(result.updated!.lastUpstreamSha);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("detects commits-behind when origin has new commits not in local main", async () => {
    const bareDir = mkdtempSync(join(tmpdir(), "ainative-bare-"));
    const otherCloneDir = mkdtempSync(join(tmpdir(), "ainative-other-"));
    try {
      runGit(["init", "--bare", "-b", "main"], bareDir);
      runGit(["remote", "add", "origin", bareDir], tempDir);
      runGit(["push", "origin", "main"], tempDir);

      // Clone, add 2 commits, push back to bare
      runGit(["clone", bareDir, otherCloneDir], otherCloneDir + "/..");
      runGit(["config", "user.email", "test@example.com"], otherCloneDir);
      runGit(["config", "user.name", "Test"], otherCloneDir);
      writeFileSync(join(otherCloneDir, "a.txt"), "a\n");
      runGit(["add", "a.txt"], otherCloneDir);
      runGit(["commit", "-m", "a"], otherCloneDir);
      writeFileSync(join(otherCloneDir, "b.txt"), "b\n");
      runGit(["add", "b.txt"], otherCloneDir);
      runGit(["commit", "-m", "b"], otherCloneDir);
      runGit(["push", "origin", "main"], otherCloneDir);

      const { tick } = await import("../upgrade-poller");
      const result = await tick(tempDir);
      expect(result.updated).toBeDefined();
      expect(result.updated!.commitsBehind).toBe(2);
      expect(result.updated!.upgradeAvailable).toBe(true);
      expect(result.updated!.lastUpstreamSha).not.toBe(result.updated!.localMainSha);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
      rmSync(otherCloneDir, { recursive: true, force: true });
    }
  });
});
