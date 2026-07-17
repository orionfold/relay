import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetCellShutdownForTest,
  runCellShutdown,
} from "@/lib/host/cell-shutdown";

describe("cell shutdown", () => {
  afterEach(() => resetCellShutdownForTest());

  it("stops claimers, reports durable work, and checkpoints exactly once", () => {
    const order: string[] = [];
    const log = vi.fn();
    const receipt = runCellShutdown("SIGTERM", {
      stopSteps: [
        { name: "scheduler", stop: () => order.push("scheduler") },
        { name: "backup", stop: () => order.push("backup") },
      ],
      isSnapshotLocked: () => true,
      activeTaskCount: () => 2,
      checkpointWal: () => order.push("checkpoint"),
      log,
    });

    expect(order).toEqual(["scheduler", "backup", "checkpoint"]);
    expect(receipt).toEqual({
      signal: "SIGTERM",
      snapshotInProgress: true,
      activeTasks: 2,
      checkpointed: true,
      failures: [],
    });
    expect(log).toHaveBeenCalledWith(
      "[cell-shutdown] ACTIVE_TASKS_RETAINED count=2",
    );

    expect(
      runCellShutdown("SIGINT", {
        stopSteps: [],
        isSnapshotLocked: () => false,
        activeTaskCount: () => 0,
        checkpointWal: vi.fn(),
      }),
    ).toBe(receipt);
  });

  it("names each failed drain step without hiding the remaining checkpoint", () => {
    const error = vi.fn();
    const checkpointWal = vi.fn();
    const receipt = runCellShutdown("SIGTERM", {
      stopSteps: [
        {
          name: "scheduler",
          stop: () => {
            throw new Error("busy");
          },
        },
      ],
      isSnapshotLocked: () => false,
      activeTaskCount: () => 0,
      checkpointWal,
      log: vi.fn(),
      error,
    });

    expect(receipt.failures).toEqual(["scheduler:busy"]);
    expect(receipt.checkpointed).toBe(true);
    expect(checkpointWal).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledWith(
      "[cell-shutdown] CELL_STOP_FAILED step=scheduler detail=busy",
    );
  });
});
