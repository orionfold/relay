import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
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

/**
 * Wraps the existing runGit() helper to capture stdout. The base runGit
 * uses stdio: "pipe" without an encoding so it returns nothing — this
 * variant captures the trimmed string output for SHA reads.
 */
function getGit(args: string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

async function expectNoBootstrapMutation(dir: string) {
  expect(getGit(["branch", "--format=%(refname:short)"], dir)).toBe("main");
  expect(existsSync(join(dir, ".git", "hooks", "pre-push"))).toBe(false);
  const pushConfig = spawnSync(
    "git",
    ["config", "--get-regexp", "^branch\\..*\\.pushRemote$"],
    { cwd: dir, encoding: "utf-8" },
  );
  expect(pushConfig.stdout.trim()).toBe("");
  const { getInstanceConfig, getGuardrails } = await import("../settings");
  expect(getInstanceConfig()).toBeNull();
  expect(getGuardrails().firstBootCompletedAt).toBeNull();
}

/**
 * Creates a bare clone of `dir` as the `origin` remote and fetches it.
 * Returns the bare-clone path so callers can advance origin/main if needed.
 */
function setupOriginRemote(dir: string, bareDirParent: string): string {
  const bareDir = mkdtempSync(join(bareDirParent, "ainative-bootstrap-bare-"));
  rmSync(bareDir, { recursive: true, force: true });
  runGit(["clone", "--bare", dir, bareDir], dir);
  runGit(["remote", "add", "origin", bareDir], dir);
  runGit(["fetch", "origin", "main"], dir);
  return bareDir;
}

/**
 * Advances origin/main by adding a commit in the bare remote, then
 * re-fetches into `dir`. Returns the new origin/main SHA.
 */
function advanceOriginMain(dir: string, bareDir: string, message: string): string {
  const workDir = mkdtempSync(join(tmpdir(), "ainative-bootstrap-origin-work-"));
  try {
    runGit(["clone", bareDir, workDir], workDir);
    runGit(["config", "user.email", "test@example.com"], workDir);
    runGit(["config", "user.name", "Test"], workDir);
    writeFileSync(join(workDir, `${Date.now()}.txt`), message);
    runGit(["add", "-A"], workDir);
    runGit(["commit", "-m", message], workDir);
    runGit(["push", "origin", "main"], workDir);
    runGit(["fetch", "origin", "main"], dir);
    return getGit(["rev-parse", "refs/remotes/origin/main"], dir);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-bootstrap-repo-"));
  dataDir = mkdtempSync(join(tmpdir(), "ainative-bootstrap-data-"));
  initRepo(tempDir);
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("RELAY_DATA_DIR", dataDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const { sqlite } = await import("@/lib/db");
  if (sqlite.open) sqlite.close();
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
});

describe("ensureInstanceConfig (Phase A)", () => {
  it("generates a new instanceId on first call", async () => {
    const { ensureInstanceConfig } = await import("../bootstrap");
    const result = await ensureInstanceConfig();
    expect(result.status).toBe("ok");
    const { getInstanceConfig } = await import("../settings");
    const config = getInstanceConfig();
    expect(config).not.toBeNull();
    expect(config!.instanceId).toMatch(/^[a-f0-9-]{36}$/);
    expect(config!.branchName).toBe("local");
    // RELAY_DATA_DIR is stubbed to a temp dir (non-default), so this clone
    // correctly registers as a private instance in the test environment.
    expect(config!.isPrivateInstance).toBe(true);
    expect(config!.createdAt).toBeGreaterThan(0);
  });

  it("does not regenerate instanceId on subsequent calls", async () => {
    const { ensureInstanceConfig } = await import("../bootstrap");
    await ensureInstanceConfig();
    const { getInstanceConfig } = await import("../settings");
    const firstId = getInstanceConfig()!.instanceId;
    await ensureInstanceConfig();
    const secondId = getInstanceConfig()!.instanceId;
    expect(secondId).toBe(firstId);
  });
});

describe("ensureLocalBranchShim (Phase A)", () => {
  let bareDir: string;

  beforeEach(() => {
    bareDir = setupOriginRemote(tempDir, tmpdir());
  });

  afterEach(() => {
    rmSync(bareDir, { recursive: true, force: true });
  });

  it("creates local at origin/main when it does not exist (no HEAD swap)", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureLocalBranchShim } = await import("../bootstrap");
    const ops = createGitOps(tempDir);
    const upstreamSha = getGit(["rev-parse", "refs/remotes/origin/main"], tempDir);
    const branchBefore = ops.getCurrentBranch();

    const result = ensureLocalBranchShim(ops);

    expect(result.status).toBe("ok");
    expect(result.reason).toBe("created");
    expect(ops.branchExists("local")).toBe(true);
    expect(ops.getCurrentBranch()).toBe(branchBefore); // HEAD did NOT move
    expect(getGit(["rev-parse", "local"], tempDir)).toBe(upstreamSha);
  });

  it("is a no-op when local already aligned with origin/main", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureLocalBranchShim } = await import("../bootstrap");
    const ops = createGitOps(tempDir);
    ops.createBranchAt("local", "refs/remotes/origin/main");

    const result = ensureLocalBranchShim(ops);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("shim_aligned");
  });

  it("repoints local when it has drifted from origin/main", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureLocalBranchShim } = await import("../bootstrap");
    const ops = createGitOps(tempDir);

    // Create local at the OLD origin/main, then advance origin so they diverge.
    ops.createBranchAt("local", "refs/remotes/origin/main");
    const newUpstreamSha = advanceOriginMain(tempDir, bareDir, "advance upstream");

    const result = ensureLocalBranchShim(ops);

    expect(result.status).toBe("ok");
    expect(result.reason).toBe("repointed");
    expect(getGit(["rev-parse", "local"], tempDir)).toBe(newUpstreamSha);
  });

  it("skips when origin/main is not yet fetched", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureLocalBranchShim } = await import("../bootstrap");

    runGit(["remote", "remove", "origin"], tempDir);
    rmSync(join(tempDir, ".git", "refs", "remotes", "origin"), { recursive: true, force: true });

    const ops = createGitOps(tempDir);
    const result = ensureLocalBranchShim(ops);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_upstream_main");
    expect(ops.branchExists("local")).toBe(false);
  });

  it("skips when local is currently checked out (avoids changing working tree)", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureLocalBranchShim } = await import("../bootstrap");
    const ops = createGitOps(tempDir);

    ops.createBranchAt("local", "refs/remotes/origin/main");
    runGit(["checkout", "local"], tempDir);
    advanceOriginMain(tempDir, bareDir, "advance after local checkout");

    const result = ensureLocalBranchShim(ops);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("shim_is_current_branch");
  });
});

describe("ensureMainShim (Phase A — domain clones only)", () => {
  let bareDir: string;

  beforeEach(() => {
    bareDir = setupOriginRemote(tempDir, tmpdir());
  });

  afterEach(() => {
    rmSync(bareDir, { recursive: true, force: true });
  });

  it("repoints local main when it has drifted from origin/main", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureMainShim } = await import("../bootstrap");
    const ops = createGitOps(tempDir);

    // Simulate a domain-clone setup: rename main → wealth-mgr, leave a dead
    // main shim at the old SHA, then advance origin so main is orphaned.
    runGit(["branch", "-m", "main", "wealth-mgr"], tempDir);
    runGit(["branch", "main", "wealth-mgr"], tempDir);
    const newUpstream = advanceOriginMain(tempDir, bareDir, "upstream advances");

    const mainBefore = getGit(["rev-parse", "main"], tempDir);
    expect(mainBefore).not.toBe(newUpstream);

    const result = ensureMainShim(ops);

    expect(result.status).toBe("ok");
    expect(result.reason).toBe("repointed");
    expect(getGit(["rev-parse", "main"], tempDir)).toBe(newUpstream);
  });

  it("is a no-op when main is already aligned with origin/main", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureMainShim } = await import("../bootstrap");
    const ops = createGitOps(tempDir);

    runGit(["checkout", "-b", "wealth-mgr"], tempDir);

    const result = ensureMainShim(ops);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("shim_aligned");
  });

  it("skips when main is the currently checked out branch", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureMainShim } = await import("../bootstrap");
    const ops = createGitOps(tempDir);

    advanceOriginMain(tempDir, bareDir, "upstream advances while user on main");
    expect(ops.getCurrentBranch()).toBe("main");

    const result = ensureMainShim(ops);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("main_is_current_branch");
  });

  it("skips when origin/main is not yet fetched", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureMainShim } = await import("../bootstrap");

    runGit(["checkout", "-b", "wealth-mgr"], tempDir);
    runGit(["remote", "remove", "origin"], tempDir);
    rmSync(join(tempDir, ".git", "refs", "remotes", "origin"), { recursive: true, force: true });

    const ops = createGitOps(tempDir);
    const result = ensureMainShim(ops);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no_upstream_main");
  });

  it("skips when local main does not exist", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureMainShim } = await import("../bootstrap");
    const ops = createGitOps(tempDir);

    runGit(["checkout", "-b", "wealth-mgr"], tempDir);
    runGit(["branch", "-D", "main"], tempDir);

    const result = ensureMainShim(ops);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("main_branch_absent");
  });
});

describe("ensurePrePushHook (Phase B)", () => {
  it("writes a pre-push hook with the RELAY_HOOK_VERSION marker", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensurePrePushHook } = await import("../bootstrap");
    const ops = createGitOps(tempDir);
    const result = ensurePrePushHook(ops);
    expect(result.status).toBe("ok");
    const hookPath = join(tempDir, ".git", "hooks", "pre-push");
    expect(existsSync(hookPath)).toBe(true);
    const content = readFileSync(hookPath, "utf-8");
    expect(content).toContain("RELAY_HOOK_VERSION=");
    expect(content).toContain("ALLOW_PRIVATE_PUSH");
    const mode = statSync(hookPath).mode & 0o777;
    expect(mode & 0o100).toBeTruthy();
  });

  it("is a no-op when a hook with matching version already exists", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensurePrePushHook } = await import("../bootstrap");
    const ops = createGitOps(tempDir);
    ensurePrePushHook(ops); // first install
    const firstMtime = statSync(join(tempDir, ".git", "hooks", "pre-push")).mtimeMs;
    const result = ensurePrePushHook(ops);
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("already_installed");
    const secondMtime = statSync(join(tempDir, ".git", "hooks", "pre-push")).mtimeMs;
    expect(secondMtime).toBe(firstMtime);
  });

  it("backs up a pre-existing non-relay hook before installing", async () => {
    const customHook = "#!/bin/sh\necho custom hook\n";
    writeFileSync(join(tempDir, ".git", "hooks", "pre-push"), customHook);
    chmodSync(join(tempDir, ".git", "hooks", "pre-push"), 0o755);
    const { createGitOps } = await import("../git-ops");
    const { ensurePrePushHook } = await import("../bootstrap");
    const ops = createGitOps(tempDir);
    const result = ensurePrePushHook(ops);
    expect(result.status).toBe("ok");
    const backupPath = join(tempDir, ".git", "hooks", "pre-push.relay-backup");
    expect(existsSync(backupPath)).toBe(true);
    expect(readFileSync(backupPath, "utf-8")).toBe(customHook);
    expect(readFileSync(join(tempDir, ".git", "hooks", "pre-push"), "utf-8"))
      .toContain("RELAY_HOOK_VERSION=");
  });
});

describe("ensureBranchPushConfig (Phase B)", () => {
  it("sets branch.local.pushRemote=no_push", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureBranchPushConfig } = await import("../bootstrap");
    const ops = createGitOps(tempDir);
    runGit(["branch", "local"], tempDir);
    const result = ensureBranchPushConfig(ops, ["local"]);
    expect(result.status).toBe("ok");
    const value = execFileSync("git", ["config", "--get", "branch.local.pushRemote"], { cwd: tempDir, encoding: "utf-8" }).trim();
    expect(value).toBe("no_push");
  });

  it("handles multiple blocked branches", async () => {
    const { createGitOps } = await import("../git-ops");
    const { ensureBranchPushConfig } = await import("../bootstrap");
    const ops = createGitOps(tempDir);
    runGit(["branch", "wealth-mgr"], tempDir);
    runGit(["branch", "investor-mgr"], tempDir);
    const result = ensureBranchPushConfig(ops, ["wealth-mgr", "investor-mgr"]);
    expect(result.status).toBe("ok");
    expect(execFileSync("git", ["config", "--get", "branch.wealth-mgr.pushRemote"], { cwd: tempDir, encoding: "utf-8" }).trim()).toBe("no_push");
    expect(execFileSync("git", ["config", "--get", "branch.investor-mgr.pushRemote"], { cwd: tempDir, encoding: "utf-8" }).trim()).toBe("no_push");
  });
});

describe("resolveConsentDecision", () => {
  it("returns {shouldRunPhaseB: false, reason: 'not_yet'} when consent is not_yet (default)", async () => {
    const { resolveConsentDecision } = await import("../bootstrap");
    const decision = await resolveConsentDecision();
    expect(decision.shouldRunPhaseB).toBe(false);
    expect(decision.reason).toBe("not_yet");
  });

  it("returns {shouldRunPhaseB: true} when consent is enabled", async () => {
    const { setGuardrails } = await import("../settings");
    await setGuardrails({
      prePushHookInstalled: false,
      prePushHookVersion: "",
      pushRemoteBlocked: [],
      consentStatus: "enabled",
      firstBootCompletedAt: null,
    });
    const { resolveConsentDecision } = await import("../bootstrap");
    const decision = await resolveConsentDecision();
    expect(decision.shouldRunPhaseB).toBe(true);
    expect(decision.reason).toBe("enabled");
  });

  it("returns {shouldRunPhaseB: false, reason: 'declined_permanently'}", async () => {
    const { setGuardrails } = await import("../settings");
    await setGuardrails({
      prePushHookInstalled: false,
      prePushHookVersion: "",
      pushRemoteBlocked: [],
      consentStatus: "declined_permanently",
      firstBootCompletedAt: null,
    });
    const { resolveConsentDecision } = await import("../bootstrap");
    const decision = await resolveConsentDecision();
    expect(decision.shouldRunPhaseB).toBe(false);
    expect(decision.reason).toBe("declined_permanently");
  });

  it("stamps firstBootCompletedAt on first call when it was null", async () => {
    const { getGuardrails } = await import("../settings");
    expect(getGuardrails().consentStatus).toBe("not_yet");
    expect(getGuardrails().firstBootCompletedAt).toBeNull();
    const { resolveConsentDecision } = await import("../bootstrap");
    await resolveConsentDecision();
    const after = getGuardrails();
    expect(after.consentStatus).toBe("not_yet");
    expect(after.firstBootCompletedAt).not.toBeNull();
  });
});

describe("ensureInstance orchestrator", () => {
  it("returns skipped with dev_mode_env when RELAY_DEV_MODE=true", async () => {
    vi.stubEnv("RELAY_DEV_MODE", "true");
    const { ensureInstance } = await import("../bootstrap");
    const result = await ensureInstance(tempDir);
    expect(result.skipped).toBe("dev_mode_env");
    expect(result.steps).toEqual([]);
    await expectNoBootstrapMutation(tempDir);
  });

  it("returns skipped with dev_mode_sentinel when sentinel file exists", async () => {
    writeFileSync(join(tempDir, ".git", "relay-dev-mode"), "");
    const { ensureInstance } = await import("../bootstrap");
    const result = await ensureInstance(tempDir);
    expect(result.skipped).toBe("dev_mode_sentinel");
    expect(result.steps).toEqual([]);
    await expectNoBootstrapMutation(tempDir);
  });

  it("returns skipped with no_git when .git directory is absent", async () => {
    const noGitDir = mkdtempSync(join(tmpdir(), "ainative-nogit-"));
    try {
      const { ensureInstance } = await import("../bootstrap");
      const result = await ensureInstance(noGitDir);
      expect(result.skipped).toBe("no_git");
    } finally {
      rmSync(noGitDir, { recursive: true, force: true });
    }
  });

  it("runs Phase A and stamps consent state on fresh clone (consent not_yet)", async () => {
    // ensureLocalBranchShim needs origin/main to exist; set it up first.
    const bareDir = setupOriginRemote(tempDir, tmpdir());
    try {
      const { ensureInstance } = await import("../bootstrap");
      const result = await ensureInstance(tempDir);
      expect(result.skipped).toBeUndefined();
      const steps = result.steps.map((s) => s.step);
      expect(steps).toContain("instance-config");
      expect(steps).toContain("local-branch");
      expect(steps).not.toContain("pre-push-hook");
      expect(steps).not.toContain("branch-push-config");
      const { createGitOps } = await import("../git-ops");
      expect(createGitOps(tempDir).branchExists("local")).toBe(true);
      expect(existsSync(join(tempDir, ".git", "hooks", "pre-push"))).toBe(false);
      const { getGuardrails } = await import("../settings");
      expect(getGuardrails().firstBootCompletedAt).not.toBeNull();
      expect(getGuardrails().consentStatus).toBe("not_yet");
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("runs Phase B when consent is enabled", async () => {
    const { setGuardrails } = await import("../settings");
    await setGuardrails({
      prePushHookInstalled: false,
      prePushHookVersion: "",
      pushRemoteBlocked: [],
      consentStatus: "enabled",
      firstBootCompletedAt: null,
    });
    const { ensureInstance } = await import("../bootstrap");
    const result = await ensureInstance(tempDir);
    const steps = result.steps.map((s) => s.step);
    expect(steps).toContain("pre-push-hook");
    expect(steps).toContain("branch-push-config");
    expect(existsSync(join(tempDir, ".git", "hooks", "pre-push"))).toBe(true);
  });

  it("RELAY_INSTANCE_MODE=true override beats RELAY_DEV_MODE=true", async () => {
    vi.stubEnv("RELAY_DEV_MODE", "true");
    vi.stubEnv("RELAY_INSTANCE_MODE", "true");
    const { ensureInstance } = await import("../bootstrap");
    const result = await ensureInstance(tempDir);
    expect(result.skipped).toBeUndefined();
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("RELAY_INSTANCE_MODE=true override beats the sentinel gate", async () => {
    writeFileSync(join(tempDir, ".git", "relay-dev-mode"), "");
    vi.stubEnv("RELAY_INSTANCE_MODE", "true");
    const { ensureInstance } = await import("../bootstrap");
    const result = await ensureInstance(tempDir);
    expect(result.skipped).toBeUndefined();
    expect(result.steps.length).toBeGreaterThan(0);
  });

  it("is a full no-op on the second call (idempotent)", async () => {
    const { ensureInstance } = await import("../bootstrap");
    await ensureInstance(tempDir);
    const result = await ensureInstance(tempDir);
    for (const step of result.steps) {
      if (step.step === "instance-config" || step.step === "local-branch") {
        expect(step.status).toBe("skipped");
      }
    }
  });

  it("skips ensureLocalBranchShim with warning when rebase is in progress", async () => {
    mkdirSync(join(tempDir, ".git", "rebase-merge"));
    const { ensureInstance } = await import("../bootstrap");
    const result = await ensureInstance(tempDir);
    const branchStep = result.steps.find((s) => s.step === "local-branch");
    expect(branchStep?.status).toBe("skipped");
    expect(branchStep?.reason).toBe("rebase_in_progress");
  });

  it("populates guardrails state after a Phase B run with consent=enabled", async () => {
    // Regression test for the critical bug where ensureBranchPushConfig() set
    // the git config values but never wrote the blocked branch list back to
    // settings.instance.guardrails. The hook's grep would never match and all
    // pushes would be silently allowed.
    const { setGuardrails, getGuardrails } = await import("../settings");
    await setGuardrails({
      prePushHookInstalled: false,
      prePushHookVersion: "",
      pushRemoteBlocked: [],
      consentStatus: "enabled",
      firstBootCompletedAt: null,
    });
    const { ensureInstance, RELAY_HOOK_VERSION } = await import("../bootstrap");
    const result = await ensureInstance(tempDir);
    expect(result.skipped).toBeUndefined();
    const guardrails = getGuardrails();
    expect(guardrails.prePushHookInstalled).toBe(true);
    expect(guardrails.prePushHookVersion).toBe(RELAY_HOOK_VERSION);
    expect(guardrails.pushRemoteBlocked).toContain("local");
  });

  it("runs ensureMainShim when branchName is not 'main' (domain clone)", async () => {
    const bareDir = setupOriginRemote(tempDir, tmpdir());
    try {
      runGit(["branch", "-m", "main", "wealth-mgr"], tempDir);
      runGit(["branch", "main", "wealth-mgr"], tempDir);
      const newUpstream = advanceOriginMain(tempDir, bareDir, "upstream advances on domain clone");

      const { setInstanceConfig } = await import("../settings");
      await setInstanceConfig({
        instanceId: "test-instance-id",
        branchName: "wealth-mgr",
        isPrivateInstance: true,
        createdAt: Math.floor(Date.now() / 1000),
      });

      const { ensureInstance } = await import("../bootstrap");
      const result = await ensureInstance(tempDir);

      const mainStep = result.steps.find((s) => s.step === "main-branch");
      expect(mainStep?.status).toBe("ok");
      expect(mainStep?.reason).toBe("repointed");
      expect(getGit(["rev-parse", "main"], tempDir)).toBe(newUpstream);
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  it("does NOT run ensureMainShim when branchName is explicitly 'main'", async () => {
    const bareDir = setupOriginRemote(tempDir, tmpdir());
    try {
      // Edge case: a user (or some future migration) has set branchName to
      // "main" — treat them as a single-clone working directly on main, so
      // skip the shim. (Default first-boot value is "local", which IS treated
      // as a domain-style clone for shim purposes — the shim's safety guards
      // make it a harmless no-op when the user happens to be on main.)
      const { setInstanceConfig } = await import("../settings");
      await setInstanceConfig({
        instanceId: "test-instance-id",
        branchName: "main",
        isPrivateInstance: false,
        createdAt: Math.floor(Date.now() / 1000),
      });
      const { ensureInstance } = await import("../bootstrap");
      const result = await ensureInstance(tempDir);
      expect(result.steps.map((s) => s.step)).not.toContain("main-branch");
    } finally {
      rmSync(bareDir, { recursive: true, force: true });
    }
  });

  // NOTE: We do not test "single-clone user (RELAY_DATA_DIR equals default)" at the
  // orchestrator level here because vi.spyOn(os, "homedir") is not possible in ESM —
  // Node's os module exports are non-configurable and cannot be redefined (vitest throws
  // "Cannot redefine property: homedir"). Stubbing RELAY_DATA_DIR to the real ~/.ainative
  // would pollute the developer's live database, which is also unacceptable.
  //
  // The single-clone path is fully covered at the unit level by
  // src/lib/instance/__tests__/detect.test.ts → "isPrivateInstance" describe block,
  // specifically the test "returns false when RELAY_DATA_DIR equals default ~/.ainative".
  // That test directly exercises the detect.isPrivateInstance() function that
  // ensureInstanceConfig() delegates to, making an orchestrator-level duplicate redundant.
});
