import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import {
  getInstanceConfig,
  getUpgradeState,
  setUpgradeState,
} from "@/lib/instance/settings";
import { dataDir as getDataDir } from "@/lib/config/env";

/**
 * POST /api/instance/upgrade
 *
 * Spawns an upgrade task with the `upgrade-assistant` agent profile. Returns
 * 202 Accepted with the task id; the client then navigates to the upgrade
 * session view to watch streaming progress and respond to conflict prompts.
 *
 * The task description includes the instance context (branch name, commits
 * behind, data directory) as template variables that the profile's SKILL.md
 * references. The claude-agent runtime interpolates them when building the
 * system prompt.
 *
 * Fire-and-forget per TDR-001: the route returns immediately; task execution
 * runs in the background through the existing execution-manager pipeline.
 */
export async function POST() {
  try {
    const config = getInstanceConfig();
    if (!config) {
      return NextResponse.json(
        { error: "Instance not yet initialized — run POST /api/instance/init first" },
        { status: 409 }
      );
    }

    const upgrade = getUpgradeState();
    if (!upgrade.upgradeAvailable) {
      return NextResponse.json(
        { error: "No upgrade available", upgradeState: upgrade },
        { status: 409 }
      );
    }

    const branchName = config.branchName;
    const commitsBehind = upgrade.commitsBehind;
    const dataDir = getDataDir();

    const description = [
      `Upgrade instance branch \`${branchName}\` with ${commitsBehind} upstream commit(s) from origin/main.`,
      "",
      "Context for the upgrade-assistant profile:",
      `- INSTANCE_BRANCH=${branchName}`,
      `- COMMITS_BEHIND=${commitsBehind}`,
      `- DATA_DIR=${dataDir}`,
      "",
      "Follow the standard merge flow defined in SKILL.md. Stop and ask the user on any merge conflict. Abort and roll back on any failure. Do not push any branch.",
    ].join("\n");

    const id = randomUUID();
    const now = new Date();

    db.insert(tasks)
      .values({
        id,
        title: `Upgrade ${branchName} — ${commitsBehind} upstream commit${commitsBehind === 1 ? "" : "s"}`,
        description,
        projectId: null,
        priority: 1,
        assignedAgent: null,
        agentProfile: "upgrade-assistant",
        sourceType: "manual",
        status: "planned",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Record which task id owns this upgrade so the UI can deep-link to it,
    // and optimistically clear the pending-count so the sidebar badge and
    // settings card reflect the user's intent immediately. If the merge task
    // fails or is cancelled, the next scheduled poll (or a manual "Check for
    // upgrades") will restore the real count by re-running git rev-list.
    await setUpgradeState({
      ...upgrade,
      lastUpgradeTaskId: id,
      commitsBehind: 0,
      upgradeAvailable: false,
      lastSuccessfulUpgradeAt: Math.floor(Date.now() / 1000),
    });

    return NextResponse.json({ taskId: id }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
