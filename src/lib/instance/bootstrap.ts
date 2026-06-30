import { randomUUID } from "crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync, renameSync } from "fs";
import { join } from "path";
import type { EnsureStepResult, EnsureResult, GitOps, ConsentStatus } from "./types";
import { getInstanceConfig, setInstanceConfig, getGuardrails, setGuardrails } from "./settings";
import { isPrivateInstance, isDevMode, hasGitDir, detectRebaseInProgress } from "./detect";
import { isDevModeEnv } from "@/lib/config/env";
import { createGitOps } from "./git-ops";

const DEFAULT_BRANCH_NAME = "local";

/**
 * Phase A step 1: ensure the instance config row exists with a stable instanceId.
 * Idempotent — returns early if config already exists.
 */
export async function ensureInstanceConfig(): Promise<EnsureStepResult> {
  const existing = getInstanceConfig();
  if (existing) {
    return { step: "instance-config", status: "skipped", reason: "already_exists" };
  }
  await setInstanceConfig({
    instanceId: randomUUID(),
    branchName: DEFAULT_BRANCH_NAME,
    isPrivateInstance: isPrivateInstance(),
    createdAt: Math.floor(Date.now() / 1000),
  });
  return { step: "instance-config", status: "ok" };
}

const SHIM_TRACK_REF = "refs/remotes/origin/main";

/**
 * Phase A step 2: align the `local` tracking shim with origin/main.
 *
 * Behavior matrix:
 * - origin/main not fetched yet → skip with "no_upstream_main"
 *   (heals on next boot after upgrade-poller runs git fetch)
 * - local doesn't exist → create at origin/main
 * - local exists at the same SHA as origin/main → no-op ("shim_aligned")
 * - local exists at a different SHA AND is the currently-checked-out branch
 *   → skip ("shim_is_current_branch") to avoid mutating the working tree
 * - local exists at a different SHA AND is not checked out → repoint
 *
 * NEVER moves HEAD. NEVER throws. Bootstrap failures must not crash startup.
 */
export function ensureLocalBranchShim(git: GitOps): EnsureStepResult {
  const upstream = git.revParse(SHIM_TRACK_REF);
  if (!upstream) {
    return { step: "local-branch", status: "skipped", reason: "no_upstream_main" };
  }
  const existing = git.revParse(`refs/heads/${DEFAULT_BRANCH_NAME}`);
  if (existing === upstream) {
    return { step: "local-branch", status: "skipped", reason: "shim_aligned" };
  }
  if (existing !== null && git.getCurrentBranch() === DEFAULT_BRANCH_NAME) {
    return { step: "local-branch", status: "skipped", reason: "shim_is_current_branch" };
  }
  try {
    git.createBranchAt(DEFAULT_BRANCH_NAME, SHIM_TRACK_REF);
    return {
      step: "local-branch",
      status: "ok",
      reason: existing === null ? "created" : "repointed",
    };
  } catch (err) {
    return {
      step: "local-branch",
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

const MAIN_BRANCH_NAME = "main";

/**
 * Phase A step 2b: align refs/heads/main with origin/main on domain clones.
 *
 * On a domain clone (PRIVATE-INSTANCES.md §1.7), the user's working branch
 * is `<domain>-mgr` and `main` is a tracking shim. After an upstream history
 * rewrite (e.g. the 2026-04-17 navam-io → manavsehgal migration) `main` can
 * orphan and accumulate hundreds of commits of phantom divergence — which
 * the upgrade-detection poller renders as a "500+ updates" badge.
 *
 * Behavior matrix is identical to ensureLocalBranchShim, with one extra
 * skip path: if local main does not exist at all, do nothing
 * ("main_branch_absent") — bootstrap does not invent branches the user
 * deleted on purpose.
 */
export function ensureMainShim(git: GitOps): EnsureStepResult {
  const upstream = git.revParse(SHIM_TRACK_REF);
  if (!upstream) {
    return { step: "main-branch", status: "skipped", reason: "no_upstream_main" };
  }
  const existing = git.revParse(`refs/heads/${MAIN_BRANCH_NAME}`);
  if (existing === null) {
    return { step: "main-branch", status: "skipped", reason: "main_branch_absent" };
  }
  if (existing === upstream) {
    return { step: "main-branch", status: "skipped", reason: "shim_aligned" };
  }
  if (git.getCurrentBranch() === MAIN_BRANCH_NAME) {
    return { step: "main-branch", status: "skipped", reason: "main_is_current_branch" };
  }
  try {
    git.createBranchAt(MAIN_BRANCH_NAME, SHIM_TRACK_REF);
    return { step: "main-branch", status: "ok", reason: "repointed" };
  } catch (err) {
    return {
      step: "main-branch",
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export const RELAY_HOOK_VERSION = "1.0.0";

/**
 * Pre-push hook template. Installed verbatim at .git/hooks/pre-push.
 *
 * Reads the blocked branch list from the Relay SQLite settings table
 * via a bounded sqlite3 invocation. The query is hardcoded — no user
 * input reaches the shell.
 *
 * Escape hatch: set ALLOW_PRIVATE_PUSH=1 in env to bypass the guardrail
 * for legitimate cherry-pick pushes.
 */
const PRE_PUSH_HOOK_TEMPLATE = `#!/bin/sh
# RELAY_HOOK_VERSION=${RELAY_HOOK_VERSION}
# Blocks pushes of private instance branches to origin.
# Escape hatch: ALLOW_PRIVATE_PUSH=1 git push ...
#
# Generated by src/lib/instance/bootstrap.ts — do not edit manually.

if [ "$ALLOW_PRIVATE_PUSH" = "1" ]; then
  exit 0
fi

current_branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "")
if [ -z "$current_branch" ]; then
  exit 0
fi

data_dir="\${RELAY_DATA_DIR:-$HOME/.relay}"
db_path="$data_dir/relay.db"
if [ ! -f "$db_path" ] || ! command -v sqlite3 >/dev/null 2>&1; then
  exit 0
fi

blocked_json=$(sqlite3 "$db_path" "SELECT value FROM settings WHERE key='instance.guardrails';" 2>/dev/null)
if [ -z "$blocked_json" ]; then
  exit 0
fi

if echo "$blocked_json" | grep -q "\\"$current_branch\\""; then
  echo "relay: refusing to push private instance branch '$current_branch' to origin." >&2
  echo "relay: set ALLOW_PRIVATE_PUSH=1 to override (not recommended)." >&2
  exit 1
fi

exit 0
`;

/**
 * Phase B step 1: install the pre-push hook at .git/hooks/pre-push.
 * Idempotent: checks version marker in existing file; backs up foreign hooks.
 */
export function ensurePrePushHook(git: GitOps): EnsureStepResult {
  const hookPath = join(git.getGitDir(), "hooks", "pre-push");
  const markerLine = `RELAY_HOOK_VERSION=${RELAY_HOOK_VERSION}`;

  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf-8");
    if (existing.includes(markerLine)) {
      return { step: "pre-push-hook", status: "skipped", reason: "already_installed" };
    }
    if (existing.includes("RELAY_HOOK_VERSION=") || existing.includes("AINATIVE_HOOK_VERSION=")) {
      try {
        writeFileSync(hookPath, PRE_PUSH_HOOK_TEMPLATE, { mode: 0o755 });
        return { step: "pre-push-hook", status: "ok", reason: "upgraded" };
      } catch (err) {
        return {
          step: "pre-push-hook",
          status: "failed",
          reason: err instanceof Error ? err.message : String(err),
        };
      }
    }
    try {
      renameSync(hookPath, `${hookPath}.relay-backup`);
    } catch (err) {
      return {
        step: "pre-push-hook",
        status: "failed",
        reason: `backup_failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  try {
    writeFileSync(hookPath, PRE_PUSH_HOOK_TEMPLATE, { mode: 0o755 });
    chmodSync(hookPath, 0o755);
    return { step: "pre-push-hook", status: "ok" };
  } catch (err) {
    return {
      step: "pre-push-hook",
      status: "failed",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Phase B step 2: set branch.<name>.pushRemote=no_push for each blocked branch.
 * Idempotent via git config semantics (setting the same value is a no-op).
 */
export function ensureBranchPushConfig(git: GitOps, branches: string[]): EnsureStepResult {
  const failures: string[] = [];
  for (const branch of branches) {
    try {
      git.setConfig(`branch.${branch}.pushRemote`, "no_push");
    } catch (err) {
      failures.push(`${branch}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (failures.length > 0) {
    return {
      step: "branch-push-config",
      status: "failed",
      reason: failures.join("; "),
    };
  }
  return { step: "branch-push-config", status: "ok" };
}

export interface ConsentDecision {
  shouldRunPhaseB: boolean;
  reason: ConsentStatus;
}

/**
 * Reads the current consent status from settings and returns a decision
 * about whether Phase B (destructive guardrail installation) should run.
 *
 * On first call, stamps firstBootCompletedAt so the system has a record
 * that bootstrap has run at least once. This enables the upgrade-session
 * feature to distinguish "never booted" from "booted but consent not yet
 * given" in its Settings → Instance UI.
 *
 * Does NOT create any UI artifact. The prompt surface is owned by
 * upgrade-session, which renders a "Enable guardrails" action in the
 * Settings → Instance section reading from settings.instance.guardrails.
 */
export async function resolveConsentDecision(): Promise<ConsentDecision> {
  const current = getGuardrails();

  if (current.firstBootCompletedAt === null) {
    await setGuardrails({
      ...current,
      firstBootCompletedAt: Math.floor(Date.now() / 1000),
    });
  }

  return {
    shouldRunPhaseB: current.consentStatus === "enabled",
    reason: current.consentStatus,
  };
}

/**
 * Main entry point called from src/instrumentation.ts.
 * Idempotent — safe to run on every boot.
 *
 * Execution order:
 * 1. Dev-mode gates (env + sentinel) — skip entirely if active
 * 2. .git presence check — skip if absent (npx runtime)
 * 3. Phase A: instanceId, local branch (non-destructive, always runs)
 * 4. Consent: resolves consent decision (stamps firstBootCompletedAt on first call)
 * 5. Phase B: pre-push hook, pushRemote config (only if consent=enabled)
 */
export async function ensureInstance(cwd: string = process.cwd()): Promise<EnsureResult> {
  if (isDevMode(cwd)) {
    const reason = isDevModeEnv() ? "dev_mode_env" : "dev_mode_sentinel";
    return { skipped: reason, steps: [] };
  }

  if (!hasGitDir(cwd)) {
    return { skipped: "no_git", steps: [] };
  }

  const steps: EnsureStepResult[] = [];
  const git = createGitOps(cwd);

  // Phase A step 1: instance config
  steps.push(await ensureInstanceConfig());

  // Phase A step 2: local branch — skip if rebase in progress
  if (detectRebaseInProgress(cwd)) {
    steps.push({ step: "local-branch", status: "skipped", reason: "rebase_in_progress" });
  } else {
    steps.push(ensureLocalBranchShim(git));
  }

  // Phase A step 2b: main-branch shim (domain clones only).
  // Domain clone = settings.instance.branchName != "main". On those clones,
  // refs/heads/main is a tracking shim that bootstrap re-points to origin/main
  // on every boot. On single-clone setups (branchName == "main"), skip — main
  // IS the user's working branch.
  const config = getInstanceConfig();
  if (config && config.branchName !== "main") {
    if (detectRebaseInProgress(cwd)) {
      steps.push({ step: "main-branch", status: "skipped", reason: "rebase_in_progress" });
    } else {
      steps.push(ensureMainShim(git));
    }
  }

  // Resolve consent (stamps firstBootCompletedAt on first call, returns decision)
  const decision = await resolveConsentDecision();

  // Phase B — only if user has explicitly enabled guardrails
  if (decision.shouldRunPhaseB) {
    const hookResult = ensurePrePushHook(git);
    steps.push(hookResult);

    const config = getInstanceConfig();
    const blockedBranches = config ? [config.branchName] : [];
    if (blockedBranches.length > 0) {
      const configResult = ensureBranchPushConfig(git, blockedBranches);
      steps.push(configResult);

      // Persist guardrail state back to settings so the pre-push hook can
      // read the list of blocked branches at push time (the hook greps the
      // serialized JSON of settings.instance.guardrails for the current
      // branch name). Without this write, the hook would silently allow
      // all pushes because pushRemoteBlocked would stay [].
      if (hookResult.status !== "failed" && configResult.status !== "failed") {
        const current = getGuardrails();
        await setGuardrails({
          ...current,
          prePushHookInstalled: true,
          prePushHookVersion: RELAY_HOOK_VERSION,
          pushRemoteBlocked: blockedBranches,
        });
      }
    }
  }

  return { steps };
}
