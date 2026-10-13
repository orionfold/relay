/**
 * Concurrency control for on-demand agent runs.
 *
 * "On-demand" is every task run whose `source_type` is not `scheduled` or
 * `heartbeat` — a manual execute, a resume, a chat `execute_task`, a handoff,
 * a workflow step. Schedule firings keep their own independent cap and their
 * own claim in `@/lib/schedules/slot-claim`; the two counts are disjoint and
 * together cover every running task, so neither can starve the other.
 *
 * Four pieces:
 *   - an atomic single-statement claim (never check-then-act — see
 *     `tdr-atomic-slot-claim.md`),
 *   - a FIFO waiting line for runs the cap deferred, held in `tasks` as
 *     `status = 'queued' AND run_requested_at IS NOT NULL`, drained when a
 *     slot frees and by a low-frequency timer that only exists while
 *     something is waiting,
 *   - a startup sweep for runs a previous process left behind as `running`,
 *   - a startup recovery for runs it left behind in the waiting line
 *     (`@/lib/agents/deferred-run-recovery`).
 *
 * An over-cap run is never failed: its row stays `queued`, carries the marker
 * that says a run was actually submitted for it, and starts when its turn
 * comes. Callers that await the run simply wait longer.
 */

import { sqlite } from "@/lib/db";
import { readIntConfig } from "@/lib/schedules/config";
import { SETTINGS_KEYS } from "@/lib/constants/settings";

/** Source types the schedule cap owns. Everything else is on-demand. */
const SCHEDULED_SOURCE_TYPES = ["scheduled", "heartbeat"] as const;

const DEFAULT_TASK_MAX_CONCURRENT = 20;

/**
 * How often the waiting line is re-examined while something is in it. A slot
 * normally frees through `releaseTaskSlot()`; this timer is the backstop for
 * the ways a run can stop without passing through the dispatcher (a cancel, a
 * reap, a row edited by hand). It only exists while the line is non-empty and
 * is unref'd, so an idle Relay pays nothing for it.
 */
const DRAIN_INTERVAL_MS = 5_000;

/** Statuses a first claim may start from. Mirrors what `startTaskExecution`
 * has always been willing to run: anything that is not already finished. */
const CLAIMABLE_STATUSES = ["queued", "planned", "failed", "cancelled"] as const;

type ClaimableStatus = (typeof CLAIMABLE_STATUSES)[number];

/** Which dispatcher entry point a deferred run came through. */
export type RunRequestMode = "start" | "resume";

/**
 * The on-demand half of the running-task count, expressed the same way in the
 * claim and in the counter so the two can never disagree.
 */
const ON_DEMAND_PREDICATE = `(source_type IS NULL OR source_type NOT IN ('${SCHEDULED_SOURCE_TYPES.join(
  "', '",
)}'))`;

/** The persisted waiting line: a run that was submitted and deferred. */
const DEFERRED_PREDICATE = `status = 'queued' AND run_requested_at IS NOT NULL AND ${ON_DEMAND_PREDICATE}`;

/**
 * Atomic on-demand slot claim.
 *
 * One statement, for the reason `tdr-atomic-slot-claim.md` gives: every start
 * path can run concurrently, so a SELECT followed by an UPDATE would let two
 * callers both read "one slot left" and both take it. The subquery inside the
 * WHERE clause makes SQLite evaluate the count under the same write lock as
 * the update.
 *
 * It also clears the waiting-line marker, in the same statement rather than a
 * second one: a row that is `running` was started, so leaving the marker would
 * both lie about the line and make the row look deferred again if anything
 * ever put it back to `queued`.
 *
 * Deliberately writes no lease. An on-demand run has no bounded duration to
 * check against, so a lease could only ever kill a long legitimate run; the
 * orphan case is handled once at startup instead (`sweepOrphanedTaskRuns`).
 *
 * Four status placeholders rather than a built list, so the statement is
 * prepared once; a caller wanting fewer repeats one of them.
 */
export const TASK_SLOT_CLAIM_SQL =
  `UPDATE tasks SET status = 'running', slot_claimed_at = ?, run_requested_at = NULL, run_requested_mode = NULL, updated_at = ? WHERE id = ? AND status IN (?, ?, ?, ?) AND ${ON_DEMAND_PREDICATE} AND (SELECT COUNT(*) FROM tasks WHERE status = 'running' AND ${ON_DEMAND_PREDICATE}) < ?`;

const claimStmt = sqlite.prepare(TASK_SLOT_CLAIM_SQL);

const countRunningStmt = sqlite.prepare(
  `SELECT COUNT(*) AS n FROM tasks WHERE status = 'running' AND ${ON_DEMAND_PREDICATE}`,
);

const readStatusStmt = sqlite.prepare(
  "SELECT status FROM tasks WHERE id = ?",
);

/**
 * Park a deferred run as `queued` and record that a run was submitted for it.
 *
 * One statement for both halves, so a row can never be parked without its
 * marker — a `queued` row with no marker is a task at rest and nothing may
 * start it. `COALESCE` keeps the first submission's instant across a second
 * call for the same run (a boot-recovered dispatch re-enters here), which is
 * what keeps FIFO by submission order rather than by last touch.
 *
 * Guarded on the status the caller observed, so a row that changed underneath
 * is left alone and its waiter is dropped by the next drain.
 */
const markStmt = sqlite.prepare(
  "UPDATE tasks SET status = 'queued', run_requested_at = COALESCE(run_requested_at, ?), run_requested_mode = ?, updated_at = ? WHERE id = ? AND status = ?",
);

const clearMarkStmt = sqlite.prepare(
  "UPDATE tasks SET run_requested_at = NULL, run_requested_mode = NULL WHERE id = ? AND run_requested_at IS NOT NULL",
);

const listDeferredStmt = sqlite.prepare(
  `SELECT id, source_type AS sourceType, run_requested_mode AS mode FROM tasks WHERE ${DEFERRED_PREDICATE} ORDER BY run_requested_at, rowid`,
);

const countDeferredStmt = sqlite.prepare(
  `SELECT COUNT(*) AS n FROM tasks WHERE ${DEFERRED_PREDICATE}`,
);

const sweepStmt = sqlite.prepare(
  `UPDATE tasks SET status = 'failed', failure_reason = 'process_restart', result = COALESCE(result, ?), updated_at = ? WHERE status = 'running' AND ${ON_DEMAND_PREDICATE} RETURNING id`,
);

const failDeferredWorkflowStmt = sqlite.prepare(
  `UPDATE tasks SET status = 'failed', failure_reason = 'process_restart', result = COALESCE(result, ?), run_requested_at = NULL, run_requested_mode = NULL, updated_at = ? WHERE ${DEFERRED_PREDICATE} AND source_type = 'workflow' RETURNING id`,
);

const clearStaleMarksStmt = sqlite.prepare(
  `UPDATE tasks SET run_requested_at = NULL, run_requested_mode = NULL WHERE run_requested_at IS NOT NULL AND NOT (${DEFERRED_PREDICATE}) RETURNING id`,
);

/** True for every task run the on-demand cap governs. */
export function isOnDemandSourceType(
  sourceType: string | null | undefined,
): boolean {
  if (!sourceType) return true;
  return !(SCHEDULED_SOURCE_TYPES as readonly string[]).includes(sourceType);
}

/**
 * The on-demand concurrency cap: `TASK_MAX_CONCURRENT`, then the
 * `task.maxConcurrent` setting, then 20.
 *
 * Independent of `SCHEDULE_MAX_CONCURRENT` by design. The schedule cap is low
 * (2) because a schedule firing is unattended and arrives in bursts; an
 * on-demand run is something a person or a workflow is waiting on, so its cap
 * is set high enough to be invisible in normal use and only bites when a burst
 * would otherwise exhaust the host.
 */
export function getTaskMaxConcurrent(): number {
  return readIntConfig(
    "TASK_MAX_CONCURRENT",
    SETTINGS_KEYS.TASK_MAX_CONCURRENT,
    DEFAULT_TASK_MAX_CONCURRENT,
  );
}

/** Running on-demand tasks. The schedule cap counts the complement. */
export function countRunningTaskSlots(): number {
  const row = countRunningStmt.get() as { n: number } | undefined;
  return row?.n ?? 0;
}

function readTaskStatus(taskId: string): string | undefined {
  const row = readStatusStmt.get(taskId) as { status: string } | undefined;
  return row?.status;
}

/**
 * Try to take a slot for `taskId` now.
 *
 * @param options.from — statuses the claim may start from. Defaults to every
 *   non-terminal one; the waiting line passes `["queued"]` so a run cancelled
 *   while it waited is not resurrected when its turn comes.
 * @param options.force — bypass the cap. The caller is responsible for the
 *   audit record; see the `force` branch of the task execute route.
 * @returns true when this call transitioned the row to `running`.
 */
export function claimTaskSlot(
  taskId: string,
  options?: { from?: readonly ClaimableStatus[]; force?: boolean; cap?: number },
): boolean {
  const from = options?.from ?? CLAIMABLE_STATUSES;
  if (from.length === 0 || from.length > CLAIMABLE_STATUSES.length) {
    throw new Error(
      `claimTaskSlot: from must name 1..${CLAIMABLE_STATUSES.length} statuses`,
    );
  }
  // Pad to the statement's four placeholders by repeating the first entry — a
  // repeated value in an IN list is the same set.
  const padded = [...from];
  while (padded.length < 4) padded.push(from[0]);

  const cap = options?.force
    ? Number.MAX_SAFE_INTEGER
    : (options?.cap ?? getTaskMaxConcurrent());

  // Drizzle integer({ mode: "timestamp" }) stores Unix seconds; Math.ceil so a
  // slotClaimedAt read back is never before the Date.now() taken just here.
  const nowSec = Math.ceil(Date.now() / 1000);
  const result = claimStmt.run(
    nowSec,
    nowSec,
    taskId,
    padded[0],
    padded[1],
    padded[2],
    padded[3],
    cap,
  );
  return result.changes === 1;
}

/**
 * Forget that a run was submitted for this task.
 *
 * Called wherever a task leaves the waiting line by a route other than a claim
 * — a cancel, a status written through the PATCH route. Not clearing would
 * leave a marker on a row that nothing is waiting on, and a later edit putting
 * that row back to `queued` would make it look like a run somebody submitted.
 *
 * Deliberately does not touch `updated_at`: this is bookkeeping about a run
 * that is no longer pending, not a change to the task.
 */
export function clearRunRequest(taskId: string): void {
  clearMarkStmt.run(taskId);
}

/** A run the cap deferred, as the table records it. */
export interface DeferredTaskRun {
  id: string;
  sourceType: string | null;
  mode: RunRequestMode | null;
}

/**
 * Every deferred run, oldest submission first.
 *
 * `rowid` breaks a tie, so two submissions in the same millisecond keep insert
 * order rather than an arbitrary one.
 */
export function listDeferredTaskRuns(): DeferredTaskRun[] {
  return listDeferredStmt.all() as DeferredTaskRun[];
}

/** How many runs the table says are waiting for a slot. */
export function countDeferredTaskRuns(): number {
  const row = countDeferredStmt.get() as { n: number } | undefined;
  return row?.n ?? 0;
}

/**
 * The in-process half of the waiting line: the promise each deferred run's
 * dispatcher is parked on.
 *
 * The *order* is the table's, not this map's — see `drainTaskQueue`. This only
 * answers "is a dispatcher in this process waiting for that row", which is the
 * one thing the table cannot say and the one thing a restart destroys.
 */
const waiting = new Map<string, (claimed: boolean) => void>();
let drainTimer: ReturnType<typeof setInterval> | null = null;
let draining = false;

function syncDrainTimer(): void {
  if (waiting.size > 0 && drainTimer === null) {
    drainTimer = setInterval(() => {
      drainTaskQueue();
    }, DRAIN_INTERVAL_MS);
    drainTimer.unref?.();
    return;
  }
  if (waiting.size === 0 && drainTimer !== null) {
    clearInterval(drainTimer);
    drainTimer = null;
  }
}

/**
 * Start as many waiting runs as the cap allows, oldest submission first.
 *
 * The order comes from `run_requested_at` in the table rather than from the
 * order dispatchers happened to arrive in this process. That is what makes a
 * boot-recovered run keep its place: recovery re-dispatches it, its marker
 * still holds the instant it was first submitted, and it sorts ahead of
 * anything submitted since even though its dispatcher arrived last.
 *
 * Strictly head-of-line: when the head cannot claim because the cap is full we
 * stop rather than letting a later arrival overtake it. That is what FIFO
 * means, and it is what keeps a workflow's first branch from being starved by
 * its own later ones.
 *
 * A deferred row with no waiter in this process is skipped rather than stopping
 * the line. It is a row recovery has re-dispatched whose dispatcher has not
 * reached `acquireTaskSlot` yet; blocking on it would stall every other run for
 * as long as that takes, and in the worst case forever.
 */
export function drainTaskQueue(): void {
  // Nothing in this process is waiting, so there is nothing to resolve and no
  // reason to read the table. Boot recovery owns deferred rows with no waiter.
  if (waiting.size === 0 || draining) return;
  draining = true;
  try {
    const deferred = listDeferredTaskRuns();
    const deferredIds = new Set(deferred.map((row) => row.id));

    // Deleted, cancelled, or started by another path while it waited.
    for (const [taskId, resolve] of [...waiting]) {
      if (deferredIds.has(taskId)) continue;
      waiting.delete(taskId);
      resolve(false);
    }

    for (const { id } of deferred) {
      const resolve = waiting.get(id);
      if (!resolve) continue;
      if (!claimTaskSlot(id, { from: ["queued"] })) break;
      waiting.delete(id);
      resolve(true);
    }
  } finally {
    draining = false;
    syncDrainTimer();
  }
}

/**
 * Signal that a slot may have freed. Called when an on-demand run settles.
 *
 * Deliberately a signal and not a decrement: the cap is counted from the table
 * on every claim, so a missed call can delay a queued run until the drain timer
 * but can never let the cap be exceeded.
 */
export function releaseTaskSlot(): void {
  drainTaskQueue();
}

/** How many runs this process is holding for a slot. For tests and telemetry. */
export function countWaitingTaskSlots(): number {
  return waiting.size;
}

function enqueueForTaskSlot(taskId: string): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const previous = waiting.get(taskId);
    waiting.set(taskId, resolve);
    // Two dispatchers for one row is a bug upstream, but dropping the first
    // one's promise would hang it forever. Settle it as abandoned instead.
    previous?.(false);
    syncDrainTimer();
    // A slot may have freed between the failed claim and this push.
    drainTaskQueue();
  });
}

/**
 * Hold the dispatcher until this run owns a slot.
 *
 * Returns "claimed" when the row is `running` and counted, "abandoned" when
 * there is nothing left to run (the row was deleted, cancelled, or finished
 * while it waited). Never throws and never fails a run because the cap is full.
 *
 * @param mode — which entry point is asking, recorded on the row so boot
 *   recovery re-dispatches a deferred resume as a resume.
 */
export async function acquireTaskSlot(
  taskId: string,
  mode: RunRequestMode = "start",
): Promise<"claimed" | "abandoned"> {
  if (claimTaskSlot(taskId)) return "claimed";

  const status = readTaskStatus(taskId);
  if (status === undefined) return "abandoned";
  // Already running — the caller (a route, or a retry inside one run) claimed
  // it, so the slot is held and the dispatcher owns its release.
  if (status === "running") return "claimed";
  if (!(CLAIMABLE_STATUSES as readonly string[]).includes(status)) {
    return "abandoned";
  }

  // The cap is full. Park the run as `queued` and mark it as submitted, so
  // what it is waiting for survives this process, then take a place in line.
  const nowMs = Date.now();
  markStmt.run(nowMs, mode, Math.ceil(nowMs / 1000), taskId, status);
  return (await enqueueForTaskSlot(taskId)) ? "claimed" : "abandoned";
}

const SWEEP_RESULT =
  "Relay restarted while this run was in flight. The attempt was stopped and was not replayed automatically.";

const DEFERRED_WORKFLOW_RESULT =
  "Relay restarted while this workflow step was waiting for a run slot. The workflow run stopped with the process, so the step was not replayed.";

/**
 * Mark on-demand runs a previous process left `running` as failed.
 *
 * Run once at boot, before anything can start a new run. Scheduled runs are
 * untouched: they carry a lease and `reapExpiredLeases` is theirs.
 *
 * This is the whole of the orphan story for on-demand runs, on purpose. A
 * periodic reaper would need a duration to measure against, and an on-demand
 * run has none — a reaper would eventually kill a long legitimate run instead
 * of a dead one. A row still `running` after a restart, by contrast, is
 * unambiguously dead: nothing in this process is executing it.
 *
 * @returns the ids it failed.
 */
export function sweepOrphanedTaskRuns(): string[] {
  const nowSec = Math.ceil(Date.now() / 1000);
  const rows = sweepStmt.all(SWEEP_RESULT, nowSec) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

/**
 * Fail every deferred **workflow step**, with `failure_reason =
 * 'process_restart'`.
 *
 * Boot recovery re-dispatches the other deferred runs, but not these: a step's
 * workflow engine is driven by `executeWorkflow` in the process that died, and
 * nothing at boot resurrects a workflow run. Re-dispatching the step would run
 * an agent whose result nobody reads, and leaving it `queued` would hide a
 * workflow that is never going to finish. Failing it is the one answer that is
 * both visible and true.
 *
 * @returns the ids it failed.
 */
export function failDeferredWorkflowRuns(): string[] {
  const nowSec = Math.ceil(Date.now() / 1000);
  const rows = failDeferredWorkflowStmt.all(
    DEFERRED_WORKFLOW_RESULT,
    nowSec,
  ) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

/**
 * Drop markers left on rows that are not deferred runs.
 *
 * A marker only means anything on a `queued` on-demand row. One anywhere else
 * is the residue of a path that moved a row out of the line without clearing
 * it; left alone it would come back to life the moment anything put that row
 * back to `queued`. Run at boot, where it is cheap and where no dispatcher is
 * mid-flight.
 *
 * @returns the ids it cleared.
 */
export function clearStaleRunRequests(): string[] {
  const rows = clearStaleMarksStmt.all() as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

/** Test seam: drop the in-process waiting line and stop the drain timer. */
export function __resetTaskSlotsForTests(): void {
  for (const [taskId, resolve] of [...waiting]) {
    waiting.delete(taskId);
    resolve(false);
  }
  syncDrainTimer();
}
