import { existsSync } from "fs";
import { join } from "path";
import { isDevModeEnv, isInstanceModeEnv, isPrivateDataDir } from "@/lib/config/env";

/**
 * Returns true if the current environment is the canonical Relay dev repo
 * and should skip all instance bootstrap operations.
 *
 * Layered gates:
 * 1. RELAY_DEV_MODE=true env var (primary, per-developer)
 * 2. .git/relay-dev-mode sentinel file (secondary, git-dir-scoped)
 *
 * Override: RELAY_INSTANCE_MODE=true forces bootstrap to run even in dev
 * mode, so contributors can test the feature in the main repo.
 */
export function isDevMode(cwd: string = process.cwd()): boolean {
  if (isInstanceModeEnv()) return false;
  if (isDevModeEnv()) return true;
  if (existsSync(join(cwd, ".git", "relay-dev-mode"))) return true;
  return false;
}

/** Returns true if a .git directory exists at the given path. */
export function hasGitDir(cwd: string = process.cwd()): boolean {
  return existsSync(join(cwd, ".git"));
}

/**
 * Returns true if RELAY_DATA_DIR is set to a non-default path,
 * indicating this clone is running as an isolated private instance.
 */
export function isPrivateInstance(): boolean {
  return isPrivateDataDir();
}

/**
 * Returns true if a rebase is in progress in the current repo.
 * Both rebase-merge (interactive) and rebase-apply (non-interactive) are detected.
 */
export function detectRebaseInProgress(cwd: string = process.cwd()): boolean {
  const gitDir = join(cwd, ".git");
  return (
    existsSync(join(gitDir, "rebase-merge")) ||
    existsSync(join(gitDir, "rebase-apply"))
  );
}
