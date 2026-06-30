// FROZEN SCOPE (_SPECS/feature-cut-freeze.md Target 4 · _IDEAS/reprioritze.md §4)
// Frozen aggregate shape; no new trend series or live-host metrics without
// revisiting reprioritze §4. The telemetry cockpit is maintain-only.

import { NextResponse } from "next/server";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { cpus, loadavg, totalmem, freemem } from "node:os";
import { eq, count, and, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, notifications, projects, workflows } from "@/lib/db/schema";
import { getBudgetGuardrailSnapshot } from "@/lib/settings/budget-guardrails";
import { getWorkspaceContext } from "@/lib/environment/workspace-context";
import {
  getAgentActivityByHour,
  getCompletionsByDay,
  getFailuresByDay,
} from "@/lib/queries/chart-data";
import {
  DEFAULT_AGENT_RUNTIME,
  SUPPORTED_AGENT_RUNTIMES,
  type AgentRuntimeId,
} from "@/lib/agents/runtime/catalog";
import type { RuntimeSetupState } from "@/lib/settings/runtime-setup";
import type { TelemetrySnapshot } from "@/components/shell/telemetry-types";

// Telemetry is a live read of mutable server state; never let a route or the
// browser cache it.
export const dynamic = "force-dynamic";

// Map each provider to the SDK package whose installed version we surface in the
// RUNTIME cell. Direct-API runtimes (anthropic/openai) and the local Ollama
// runtime have no first-party agent SDK we version here → null sub-line.
const SDK_PACKAGE_BY_PROVIDER: Record<string, string | null> = {
  anthropic: "@anthropic-ai/claude-agent-sdk",
  openai: "openai",
  ollama: null,
};

// Resolve the *installed* version of an SDK package. The package's `exports`
// map hides `./package.json`, so a direct require throws — instead resolve the
// entry point and walk up to the package root, then read its manifest. Returns
// null on any failure (zero silent failures: null renders as no sub-line, never
// a fabricated version string). Memoized across requests — the installed version
// cannot change while the process is alive.
const sdkVersionCache = new Map<string, string | null>();
function resolveSdkVersion(pkg: string): string | null {
  if (sdkVersionCache.has(pkg)) return sdkVersionCache.get(pkg) ?? null;
  let version: string | null = null;
  try {
    const req = createRequire(`${process.cwd()}/`);
    let dir = dirname(req.resolve(pkg));
    for (let i = 0; i < 8; i++) {
      const manifest = join(dir, "package.json");
      if (existsSync(manifest)) {
        const json = JSON.parse(readFileSync(manifest, "utf-8")) as {
          name?: string;
          version?: string;
        };
        if (json.name === pkg && json.version) {
          version = json.version;
          break;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // unresolvable (e.g. optional/absent dep) — leave null
  }
  sdkVersionCache.set(pkg, version);
  return version;
}

// Live host pressure for the HOST cell. 1-min load average as a percent of core
// count (so 100% ≈ one core fully saturated per core); used physical memory as a
// percent of total. Both degrade to null if the platform doesn't report them
// (e.g. loadavg() returns 0 on Windows).
function getHostMetrics(): { cpuLoadPct: number | null; memUsedPct: number | null } {
  let cpuLoadPct: number | null = null;
  let memUsedPct: number | null = null;
  try {
    const cores = cpus().length || 1;
    const load1 = loadavg()[0];
    cpuLoadPct = load1 > 0 ? Math.round((load1 / cores) * 100) : null;
  } catch {
    // leave null
  }
  try {
    const total = totalmem();
    if (total > 0) memUsedPct = Math.round(((total - freemem()) / total) * 100);
  } catch {
    // leave null
  }
  return { cpuLoadPct, memUsedPct };
}

// Pick the runtime to surface in the RUNTIME cell: the default (claude-code) if
// it is configured, otherwise the first configured runtime in catalog order, and
// failing that the default's label (so the cell shows "Claude Code · anthropic"
// with the understanding it is not yet set up, rather than an empty cell).
function pickActiveRuntime(
  states: Record<AgentRuntimeId, RuntimeSetupState>,
): { runtimeLabel: string | null; providerId: string | null } {
  const ordered: AgentRuntimeId[] = [
    DEFAULT_AGENT_RUNTIME,
    ...SUPPORTED_AGENT_RUNTIMES.filter((id) => id !== DEFAULT_AGENT_RUNTIME),
  ];
  const configured = ordered.find((id) => states[id]?.configured);
  const chosen = configured ?? DEFAULT_AGENT_RUNTIME;
  const state = states[chosen];
  if (!state) return { runtimeLabel: null, providerId: null };
  return { runtimeLabel: state.label, providerId: state.providerId };
}

export async function GET() {
  try {
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const [
      [running],
      [failed],
      [completedToday],
      [activeProjects],
      [activeWorkflows],
      reviewPending,
      budget,
      agentActivity24h,
      completions7d,
      failures7d,
    ] = await Promise.all([
      db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.status, "running")),
      db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.status, "failed")),
      db
        .select({ count: count() })
        .from(tasks)
        .where(
          and(
            eq(tasks.status, "completed"),
            gte(tasks.updatedAt, todayMidnight),
          ),
        ),
      db
        .select({ count: count() })
        .from(projects)
        .where(eq(projects.status, "active")),
      db
        .select({ count: count() })
        .from(workflows)
        .where(eq(workflows.status, "active")),
      db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.type, "permission_required"),
            eq(notifications.read, false),
          ),
        )
        .then((rows) => rows.length),
      // One call yields both the cost windows AND the runtime setup states.
      getBudgetGuardrailSnapshot(),
      // Trend series for the cockpit sparklines.
      getAgentActivityByHour(),
      getCompletionsByDay(7),
      getFailuresByDay(7),
    ]);

    const overallDaily = budget.statuses.find(
      (s) => s.scopeId === "overall" && s.window === "daily",
    );
    const overallMonthly = budget.statuses.find(
      (s) => s.scopeId === "overall" && s.window === "monthly",
    );

    const { runtimeLabel, providerId } = pickActiveRuntime(budget.runtimeStates);
    const sdkPackage = providerId ? SDK_PACKAGE_BY_PROVIDER[providerId] : null;
    const runtimeSdkVersion = sdkPackage ? resolveSdkVersion(sdkPackage) : null;

    const host = getWorkspaceContext();
    const { cpuLoadPct, memUsedPct } = getHostMetrics();

    const snapshot: TelemetrySnapshot = {
      tasksRunning: running?.count ?? 0,
      tasksFailed: failed?.count ?? 0,
      completedToday: completedToday?.count ?? 0,
      activeProjects: activeProjects?.count ?? 0,
      activeWorkflows: activeWorkflows?.count ?? 0,
      reviewPending,
      costTodayMicros: overallDaily?.currentValue ?? 0,
      costToDateMicros: overallMonthly?.currentValue ?? 0,
      runtimeLabel,
      providerId,
      runtimeSdkVersion,
      trends: {
        agentActivity24h,
        completions7d,
        failures7d,
      },
      host: {
        cwd: host.cwd,
        folderName: host.folderName,
        branch: host.gitBranch,
        cpuLoadPct,
        memUsedPct,
      },
    };

    return NextResponse.json(snapshot);
  } catch (error) {
    // Zero silent failures: a telemetry aggregation error is surfaced as a 500
    // with a named message so the rail can show an explicit error state instead
    // of fabricated zeros.
    const message =
      error instanceof Error ? error.message : "unknown telemetry error";
    console.error("[telemetry] failed to build snapshot:", error);
    return NextResponse.json(
      { error: "TelemetrySnapshotError", message },
      { status: 500 },
    );
  }
}
