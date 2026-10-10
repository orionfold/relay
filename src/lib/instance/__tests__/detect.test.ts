import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";

let tempDir: string;
let gitDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-detect-"));
  gitDir = join(tempDir, ".git");
  mkdirSync(gitDir, { recursive: true });
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

async function loadDetect() {
  return await import("../detect");
}

describe("isDevMode", () => {
  it("returns true when RELAY_DEV_MODE=true", async () => {
    vi.stubEnv("RELAY_DEV_MODE", "true");
    const { isDevMode } = await loadDetect();
    expect(isDevMode(tempDir)).toBe(true);
  });

  it("returns true when .git/relay-dev-mode sentinel file exists", async () => {
    writeFileSync(join(gitDir, "relay-dev-mode"), "");
    const { isDevMode } = await loadDetect();
    expect(isDevMode(tempDir)).toBe(true);
  });

  it("returns false when neither gate is set", async () => {
    const { isDevMode } = await loadDetect();
    expect(isDevMode(tempDir)).toBe(false);
  });

  it("returns false when RELAY_INSTANCE_MODE=true overrides env gate", async () => {
    vi.stubEnv("RELAY_DEV_MODE", "true");
    vi.stubEnv("RELAY_INSTANCE_MODE", "true");
    const { isDevMode } = await loadDetect();
    expect(isDevMode(tempDir)).toBe(false);
  });

  it("returns false when RELAY_INSTANCE_MODE=true overrides sentinel gate", async () => {
    writeFileSync(join(gitDir, "relay-dev-mode"), "");
    vi.stubEnv("RELAY_INSTANCE_MODE", "true");
    const { isDevMode } = await loadDetect();
    expect(isDevMode(tempDir)).toBe(false);
  });
});

describe("isDevMode with a .git file", () => {
  let checkout: string;
  let realGitDir: string;

  beforeEach(() => {
    checkout = mkdtempSync(join(tmpdir(), "ainative-detect-file-"));
    realGitDir = join(tempDir, "modules", "checkout");
    mkdirSync(realGitDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(checkout, { recursive: true, force: true });
  });

  it("finds the sentinel through an absolute gitdir pointer", async () => {
    writeFileSync(join(checkout, ".git"), `gitdir: ${realGitDir}\n`);
    writeFileSync(join(realGitDir, "relay-dev-mode"), "");
    const { isDevMode } = await loadDetect();
    expect(isDevMode(checkout)).toBe(true);
  });

  it("finds the sentinel through a relative gitdir pointer", async () => {
    const { relative } = await import("path");
    writeFileSync(join(checkout, ".git"), `gitdir: ${relative(checkout, realGitDir)}\n`);
    writeFileSync(join(realGitDir, "relay-dev-mode"), "");
    const { isDevMode } = await loadDetect();
    expect(isDevMode(checkout)).toBe(true);
  });

  it("returns false when the pointed-at git directory has no sentinel", async () => {
    writeFileSync(join(checkout, ".git"), `gitdir: ${realGitDir}\n`);
    const { isDevMode } = await loadDetect();
    expect(isDevMode(checkout)).toBe(false);
  });

  it("returns false when the .git file is not a gitdir pointer", async () => {
    writeFileSync(join(checkout, ".git"), "not a pointer\n");
    const { isDevMode } = await loadDetect();
    expect(isDevMode(checkout)).toBe(false);
  });

  it("returns false when the checkout has no .git at all", async () => {
    const { isDevMode } = await loadDetect();
    expect(isDevMode(checkout)).toBe(false);
  });
});

describe("resolveGitDir", () => {
  it("returns the .git directory in a normal clone", async () => {
    const { resolveGitDir } = await loadDetect();
    expect(resolveGitDir(tempDir)).toBe(gitDir);
  });

  it("returns null outside a git checkout", async () => {
    const { resolveGitDir } = await loadDetect();
    expect(resolveGitDir(join(tempDir, "nowhere"))).toBeNull();
  });
});

describe("hasGitDir", () => {
  it("returns true when .git directory exists", async () => {
    const { hasGitDir } = await loadDetect();
    expect(hasGitDir(tempDir)).toBe(true);
  });

  it("returns false when .git is absent", async () => {
    rmSync(gitDir, { recursive: true, force: true });
    const { hasGitDir } = await loadDetect();
    expect(hasGitDir(tempDir)).toBe(false);
  });
});

describe("isPrivateInstance", () => {
  it("returns false when RELAY_DATA_DIR is unset", async () => {
    vi.stubEnv("RELAY_DATA_DIR", "");
    const { isPrivateInstance } = await loadDetect();
    expect(isPrivateInstance()).toBe(false);
  });

  it("returns false when RELAY_DATA_DIR equals default ~/.relay", async () => {
    vi.stubEnv("RELAY_DATA_DIR", join(homedir(), ".relay"));
    const { isPrivateInstance } = await loadDetect();
    expect(isPrivateInstance()).toBe(false);
  });

  it("returns true when RELAY_DATA_DIR is a custom path", async () => {
    vi.stubEnv("RELAY_DATA_DIR", join(homedir(), ".relay-custom"));
    const { isPrivateInstance } = await loadDetect();
    expect(isPrivateInstance()).toBe(true);
  });

  it("returns false when RELAY_DATA_DIR equals default with trailing slash", async () => {
    vi.stubEnv("RELAY_DATA_DIR", join(homedir(), ".relay") + "/");
    const { isPrivateInstance } = await loadDetect();
    expect(isPrivateInstance()).toBe(false);
  });
});

describe("detectRebaseInProgress", () => {
  it("returns true when .git/rebase-merge exists", async () => {
    mkdirSync(join(gitDir, "rebase-merge"));
    const { detectRebaseInProgress } = await loadDetect();
    expect(detectRebaseInProgress(tempDir)).toBe(true);
  });

  it("returns true when .git/rebase-apply exists", async () => {
    mkdirSync(join(gitDir, "rebase-apply"));
    const { detectRebaseInProgress } = await loadDetect();
    expect(detectRebaseInProgress(tempDir)).toBe(true);
  });

  it("returns false when no rebase state directories exist", async () => {
    const { detectRebaseInProgress } = await loadDetect();
    expect(detectRebaseInProgress(tempDir)).toBe(false);
  });
});
