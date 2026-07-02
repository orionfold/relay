// Shape returned by GET /api/telemetry and consumed by use-telemetry. Kept in a
// dependency-free module so both the server route and the client hook can import
// it without dragging server-only code into the bundle. Every field maps to a
// real source (see the route handler) — there are no fabricated cells.

export interface TelemetrySnapshot {
  /** Tasks currently in `running` state. */
  tasksRunning: number;
  /** Tasks in `failed` state (all-time) — the standing failure backlog. */
  tasksFailed: number;
  /** Tasks completed since local midnight — today's throughput count. */
  completedToday: number;
  /** Projects in `active` status. */
  activeProjects: number;
  /** Workflows in `active` status. */
  activeWorkflows: number;
  /** Unread `permission_required` notifications awaiting a human decision. */
  reviewPending: number;
  /** Real metered spend today in micros (usage_ledger sum, USD * 1e6) — never a budget/plan figure. */
  costTodayMicros: number;
  /** Real metered spend this month in micros (usage_ledger sum, USD * 1e6) — never a budget/plan figure. */
  costToDateMicros: number;
  /** Overall monthly budget cap in micros, or null when unlimited. */
  budgetMonthlyCapMicros: number | null;
  /** Flat subscription plan price in micros when billing is subscription (not metered spend), else null. */
  planPricedMonthlyMicros: number | null;
  /** Display label of the active runtime (e.g. "Claude Code"), or null if none configured. */
  runtimeLabel: string | null;
  /** Provider behind the active runtime ("anthropic" | "openai" | "ollama"), or null. */
  providerId: string | null;
  /** Installed version of the active runtime's SDK (e.g. "0.2.71"), or null if unknown. */
  runtimeSdkVersion: string | null;
  /** Trend series for the cockpit sparklines — each maps to a chart-data query. */
  trends: {
    /** 24 hourly agent-log counts (index 0 = 24h ago, 23 = current hour). */
    agentActivity24h: number[];
    /** 7 daily completion counts (index 6 = today). */
    completions7d: number[];
    /** 7 daily failure counts (index 6 = today). */
    failures7d: number[];
  };
  /** Workspace + live host context for the HOST cell. */
  host: {
    cwd: string;
    /** Basename of cwd — compact display value. */
    folderName: string;
    branch: string | null;
    /** 1-minute load average as a percentage of core count (0–100+), or null if unavailable. */
    cpuLoadPct: number | null;
    /** Used physical memory as a percentage of total (0–100), or null if unavailable. */
    memUsedPct: number | null;
  };
}
