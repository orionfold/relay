import { existsSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { isDevModeEnv, isInstanceModeEnv, isPrivateDataDir } from "@/lib/config/env";

/**
 * Returns true if the current environment is the canonical Relay dev repo
 * and should skip all instance bootstrap operations.
 *
 * Layered gates:
 * 1. RELAY_DEV_MODE=true env var (primary, per-developer)
 * 2. relay-dev-mode sentinel file inside the git directory (secondary,
 *    git-dir-scoped). The git directory is `.git/` in a normal clone, or the
 *    directory a `.git` file points at in a submodule or linked worktree.
 *
 * Override: RELAY_INSTANCE_MODE=true forces bootstrap to run even in dev
 * mode, so contributors can test the feature in the main repo.
 */
export function isDevMode(cwd: string = process.cwd()): boolean {
  if (isInstanceModeEnv()) return false;
  if (isDevModeEnv()) return true;
  const gitDir = resolveGitDir(cwd);
  if (gitDir && existsSync(join(gitDir, "relay-dev-mode"))) return true;
  return false;
}

/**
 * Resolves the git directory for a checkout.
 *
 * A normal clone has a `.git` directory. A submodule or a linked worktree has a
 * `.git` file instead, holding `gitdir: <path>` (relative to the checkout, or
 * absolute). Returns null when `cwd` is not a git checkout or the file is
 * unreadable.
 */
export function resolveGitDir(cwd: string = process.cwd()): string | null {
  const dotGit = join(cwd, ".git");
  try {
    const stat = statSync(dotGit);
    if (stat.isDirectory()) return dotGit;
    if (!stat.isFile()) return null;
    const match = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(dotGit, "utf-8"));
    return match ? resolve(cwd, match[1]) : null;
  } catch {
    return null;
  }
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
