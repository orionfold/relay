// Shape returned by GET /api/telemetry and consumed by use-telemetry. Kept in a
// dependency-free module so both the server route and the client hook can import
// it without dragging server-only code into the bundle. Every field maps to a
// real source (see the route handler) — there are no fabricated cells.

export interface TelemetrySnapshot {
  /** Tasks currently in `running` state. */
  tasksRunning: number;
  /** Unread `permission_required` notifications awaiting a human decision. */
  reviewPending: number;
  /** Overall daily spend in micros (USD * 1e6). */
  costTodayMicros: number;
  /** Overall monthly (to-date) spend in micros (USD * 1e6). */
  costToDateMicros: number;
  /** Display label of the active runtime (e.g. "Claude Code"), or null if none configured. */
  runtimeLabel: string | null;
  /** Provider behind the active runtime ("anthropic" | "openai" | "ollama"), or null. */
  providerId: string | null;
  /** Workspace context for the HOST cell. */
  host: {
    cwd: string;
    /** Basename of cwd — compact display value. */
    folderName: string;
    branch: string | null;
  };
}
