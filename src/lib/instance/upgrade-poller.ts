/**
 * Upgrade Poller — background service that polls origin/main for new commits.
 *
 * Uses `git fetch` locally (not the GitHub REST API) to avoid rate limits
 * and auth token management. Runs alongside the scheduler via instrumentation.ts.
 *
 * Skipped entirely if dev-mode is active or .git is absent — mirrors the
 * instance bootstrap gating.
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync, statSync } from "fs";
import { join } from "path";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import { isDevMode, hasGitDir } from "./detect";
import { createGitOps } from "./git-ops";
import { getUpgradeState, setUpgradeState } from "./settings";

const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_FILENAME = ".relay-upgrade-check.lock";
const FAILURE_THRESHOLD = 3;
// Sentinel value in notifications.toolName so we can dedupe / clear the banner.
const FAILURE_MARKER = "upgrade_check_failing";

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let ticking = false;

/** Poll once immediately, then on a 1-hour interval. */
export function startUpgradePoller(): void {
  if (intervalHandle !== null) return;
  if (isDevMode() || !hasGitDir()) {
    console.log(`[upgrade-poller] skipped (dev mode or no .git)`);
    return;
  }

  // Kick off an initial poll on boot, then schedule hourly.
  tick().catch((err) => console.error("[upgrade-poller] initial tick error:", err));
  intervalHandle = setInterval(() => {
    tick().catch((err) => console.error("[upgrade-poller] tick error:", err));
  }, POLL_INTERVAL_MS);
  console.log(`[upgrade-poller] started — polling every ${POLL_INTERVAL_MS / 1000 / 60}m`);
}

export function stopUpgradePoller(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

/**
 * Exposed for testing and for the manual `POST /api/instance/upgrade/check`
 * force-check endpoint. Returns the new state, or null if skipped (lock held,
 * or dev mode).
 */
export async function tick(cwd: string = process.cwd()): Promise<UpgradeTickResult> {
  if (ticking) return { skipped: "in_progress" };
  if (isDevMode(cwd) || !hasGitDir(cwd)) return { skipped: "dev_mode_or_no_git" };

  ticking = true;
  try {
    // Advisory lock: cross-process safety (subprocess + dev server + manual check)
    const lockPath = join(cwd, ".git", LOCK_FILENAME);
    if (!acquireLock(lockPath)) {
      return { skipped: "lock_held" };
    }

    try {
      const git = createGitOps(cwd);
      const current = getUpgradeState();

      try {
        git.fetchOrigin();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const nextFailureCount = current.pollFailureCount + 1;
        await setUpgradeState({
          ...current,
          lastPolledAt: Math.floor(Date.now() / 1000),
          pollFailureCount: nextFailureCount,
          lastPollError: message,
        });
        if (nextFailureCount >= FAILURE_THRESHOLD) {
          await ensureFailureNotification(nextFailureCount, message);
        }
        return { skipped: "fetch_failed", error: message };
      }

      const upstreamSha = git.revParse("origin/main");
      const localMainSha = git.revParse("main");
      const commitsBehind =
        upstreamSha && localMainSha ? git.countCommitsAhead("main", "origin/main") : 0;

      const newState = {
        ...current,
        lastPolledAt: Math.floor(Date.now() / 1000),
        lastUpstreamSha: upstreamSha,
        localMainSha: localMainSha,
        upgradeAvailable: commitsBehind > 0,
        commitsBehind,
        pollFailureCount: 0,
        lastPollError: null,
      };
      await setUpgradeState(newState);
      if (current.pollFailureCount >= FAILURE_THRESHOLD) {
        await clearFailureNotification();
      }
      return { updated: newState };
    } finally {
      releaseLock(lockPath);
    }
  } finally {
    ticking = false;
  }
}

export interface UpgradeTickResult {
  updated?: ReturnType<typeof getUpgradeState>;
  skipped?: "in_progress" | "dev_mode_or_no_git" | "lock_held" | "fetch_failed";
  error?: string;
}

function acquireLock(lockPath: string): boolean {
  // Ensure .git/ exists (it does in normal repos; belt-and-suspenders)
  try {
    mkdirSync(join(lockPath, ".."), { recursive: true });
  } catch {
    /* ignore */
  }

  if (existsSync(lockPath)) {
    // Stale lock check: if older than TTL, break it
    try {
      const age = Date.now() - statSync(lockPath).mtimeMs;
      if (age > LOCK_TTL_MS) {
        unlinkSync(lockPath);
      } else {
        return false;
      }
    } catch {
      // Stat failed; treat as stale and try to remove
      try {
        unlinkSync(lockPath);
      } catch {
        return false;
      }
    }
  }

  try {
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    /* ignore */
  }
}

/**
 * Insert a persistent "Upgrade check failing" notification, at most one at a time.
 * Dedup key: `notifications.toolName = FAILURE_MARKER` with no response set.
 */
async function ensureFailureNotification(failureCount: number, error: string): Promise<void> {
  try {
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.toolName, FAILURE_MARKER), isNull(notifications.respondedAt)))
      .limit(1);
    if (existing.length > 0) return;

    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      type: "agent_message",
      title: "Upgrade check failing",
      body: `Last ${failureCount} upgrade checks failed: ${error.slice(0, 400)}. Open Settings → Instance to retry.`,
      toolName: FAILURE_MARKER,
      read: false,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[upgrade-poller] failed to insert failure notification:", err);
  }
}

/** Mark any open failure notification as responded so the inbox clears it. */
async function clearFailureNotification(): Promise<void> {
  try {
    await db
      .update(notifications)
      .set({ respondedAt: new Date(), read: true })
      .where(and(eq(notifications.toolName, FAILURE_MARKER), isNull(notifications.respondedAt)));
  } catch (err) {
    console.error("[upgrade-poller] failed to clear failure notification:", err);
  }
}
