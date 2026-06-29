import { NextResponse } from "next/server";
import { eq, count, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { tasks, notifications } from "@/lib/db/schema";
import { getBudgetGuardrailSnapshot } from "@/lib/settings/budget-guardrails";
import { getWorkspaceContext } from "@/lib/environment/workspace-context";
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
    const [[running], reviewPending, budget] = await Promise.all([
      db
        .select({ count: count() })
        .from(tasks)
        .where(eq(tasks.status, "running")),
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
    ]);

    const overallDaily = budget.statuses.find(
      (s) => s.scopeId === "overall" && s.window === "daily",
    );
    const overallMonthly = budget.statuses.find(
      (s) => s.scopeId === "overall" && s.window === "monthly",
    );

    const { runtimeLabel, providerId } = pickActiveRuntime(budget.runtimeStates);
    const host = getWorkspaceContext();

    const snapshot: TelemetrySnapshot = {
      tasksRunning: running?.count ?? 0,
      reviewPending,
      costTodayMicros: overallDaily?.currentValue ?? 0,
      costToDateMicros: overallMonthly?.currentValue ?? 0,
      runtimeLabel,
      providerId,
      host: {
        cwd: host.cwd,
        folderName: host.folderName,
        branch: host.gitBranch,
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
