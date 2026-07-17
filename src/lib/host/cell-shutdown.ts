export type CellSignal = "SIGINT" | "SIGTERM";

export interface CellShutdownDependencies {
  stopSteps: ReadonlyArray<{
    name: string;
    stop: () => void;
  }>;
  isSnapshotLocked: () => boolean;
  activeTaskCount: () => number;
  checkpointWal: () => void;
  log?: (message: string) => void;
  error?: (message: string) => void;
}

export interface CellShutdownReceipt {
  signal: CellSignal;
  snapshotInProgress: boolean;
  activeTasks: number;
  checkpointed: boolean;
  failures: string[];
}

let installed = false;
let completedReceipt: CellShutdownReceipt | null = null;

/**
 * Stop new background work and checkpoint SQLite synchronously. Signal handlers
 * must not wait on promises: Next may have its own exit listener after this one.
 */
export function runCellShutdown(
  signal: CellSignal,
  dependencies: CellShutdownDependencies,
): CellShutdownReceipt {
  if (completedReceipt) return completedReceipt;

  const log = dependencies.log ?? console.log;
  const error = dependencies.error ?? console.error;
  const failures: string[] = [];
  log(`[cell-shutdown] draining signal=${signal}`);

  for (const step of dependencies.stopSteps) {
    try {
      step.stop();
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      const failure = `${step.name}:${detail}`;
      failures.push(failure);
      error(`[cell-shutdown] CELL_STOP_FAILED step=${step.name} detail=${detail}`);
    }
  }

  let snapshotInProgress = false;
  try {
    snapshotInProgress = dependencies.isSnapshotLocked();
    if (snapshotInProgress) {
      log("[cell-shutdown] SNAPSHOT_IN_PROGRESS atomic snapshot cleanup will resume on restart");
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    failures.push(`snapshot-state:${detail}`);
    error(`[cell-shutdown] SNAPSHOT_STATE_FAILED detail=${detail}`);
  }

  let activeTasks = 0;
  try {
    activeTasks = dependencies.activeTaskCount();
    if (activeTasks > 0) {
      log(`[cell-shutdown] ACTIVE_TASKS_RETAINED count=${activeTasks}`);
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    failures.push(`active-tasks:${detail}`);
    error(`[cell-shutdown] ACTIVE_TASK_COUNT_FAILED detail=${detail}`);
  }

  let checkpointed = false;
  try {
    dependencies.checkpointWal();
    checkpointed = true;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    failures.push(`sqlite-checkpoint:${detail}`);
    error(`[cell-shutdown] SQLITE_CHECKPOINT_FAILED detail=${detail}`);
  }

  completedReceipt = {
    signal,
    snapshotInProgress,
    activeTasks,
    checkpointed,
    failures,
  };
  log(`[cell-shutdown] complete ${JSON.stringify(completedReceipt)}`);
  return completedReceipt;
}

export function installCellShutdownHandlers(
  dependencies: CellShutdownDependencies,
): void {
  if (installed) return;
  installed = true;

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.prependOnceListener(signal, () => {
      runCellShutdown(signal, dependencies);
    });
  }
}

/** Test-only reset for this process-local lifecycle singleton. */
export function resetCellShutdownForTest(): void {
  installed = false;
  completedReceipt = null;
}
