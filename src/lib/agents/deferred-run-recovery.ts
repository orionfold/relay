/**
 * Boot recovery for on-demand runs a previous process left in the waiting
 * line.
 *
 * `sweepOrphanedTaskRuns()` is the other half of the restart story and covers
 * runs that were *executing*. This covers runs that had been accepted — the
 * caller already holds a `202` with `state: "queued"` — and were waiting for a
 * slot when the process stopped. The table records them as
 * `status = 'queued' AND run_requested_at IS NOT NULL`; the promise their
 * dispatcher was parked on died with the process, so without this nothing
 * would ever start them and the row would be indistinguishable from a task
 * sitting at rest.
 *
 * Three outcomes, and every deferred row gets exactly one of them:
 *
 *   - **Workflow steps are failed** with `failure_reason = 'process_restart'`.
 *     Their workflow engine is driven by `executeWorkflow` in the process that
 *     died and nothing at boot resurrects a workflow run, so a re-dispatched
 *     step would produce a result nobody reads.
 *   - **Everything else is re-dispatched**, oldest submission first, through
 *     the normal cap, as a start or a resume according to `run_requested_mode`.
 *   - **A marker on a row that is not a deferred run is dropped**, so residue
 *     from a path that moved a row out of the line without clearing it cannot
 *     come back to life later.
 *
 * Re-dispatch is fire-and-forget on purpose: a recovered run holds its
 * dispatcher for as long as it executes, and boot must not wait for that. FIFO
 * survives anyway — `drainTaskQueue` orders by `run_requested_at`, which the
 * park preserves through `COALESCE`, so a recovered run keeps the place it had
 * before the restart even though its dispatcher re-enters the line last.
 *
 * See `.agents/skills/architect/references/tdr-on-demand-run-cap.md`.
 */

import {
  clearStaleRunRequests,
  failDeferredWorkflowRuns,
  listDeferredTaskRuns,
} from "@/lib/agents/task-slots";

export interface DeferredRunRecoveryReport {
  /** Ids re-dispatched, in the order they were submitted. */
  redispatched: string[];
  /** Workflow step ids failed with `process_restart`. */
  failed: string[];
  /** Ids whose marker was residue and was dropped. */
  cleared: string[];
}

/**
 * Handle every deferred on-demand run left by a previous process.
 *
 * Must run after `sweepOrphanedTaskRuns()`, so the cap is counted against
 * reality rather than against ghosts holding slots, and before anything else
 * can start a run.
 *
 * Never throws: a recovery that fails must not stop boot. Each re-dispatch is
 * isolated, so one bad row cannot strand the rest of the line.
 */
export async function recoverDeferredTaskRuns(): Promise<DeferredRunRecoveryReport> {
  const cleared = clearStaleRunRequests();
  const failed = failDeferredWorkflowRuns();

  const pending = listDeferredTaskRuns();
  const redispatched: string[] = [];

  if (pending.length > 0) {
    const { resumeTaskExecution, startTaskExecution } = await import(
      "@/lib/agents/task-dispatch"
    );
    for (const run of pending) {
      const dispatch =
        run.mode === "resume"
          ? () => resumeTaskExecution(run.id)
          : () => startTaskExecution(run.id);
      try {
        // Fire-and-forget: the call resolves only when the run finishes.
        void dispatch().catch((err) => {
          console.error(
            `[task-slots] re-dispatch of deferred run ${run.id} failed:`,
            err,
          );
        });
        redispatched.push(run.id);
      } catch (err) {
        console.error(
          `[task-slots] could not re-dispatch deferred run ${run.id}:`,
          err,
        );
      }
    }
  }

  return { redispatched, failed, cleared };
}
