import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTaskRunHistory } from "../use-task-run-history";

const emptyHistory = {
  runs: [],
  totalRuns: 0,
  omittedRuns: 0,
  logsTruncated: false,
  historyUnavailable: false,
};

describe("useTaskRunHistory", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("polls only while running and aborts requests when switching or closing", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return Promise.resolve(new Response(JSON.stringify(emptyHistory), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender, unmount } = renderHook(
      ({ taskId, enabled, taskStatus }) => useTaskRunHistory({
        taskId,
        enabled,
        taskStatus,
      }),
      { initialProps: { taskId: "task-1" as string | null, enabled: true, taskStatus: "running" } },
    );

    await act(async () => Promise.resolve());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0].aborted).toBe(true);

    rerender({ taskId: "task-2", enabled: true, taskStatus: "completed" });
    await act(async () => Promise.resolve());
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(signals[1].aborted).toBe(true);

    rerender({ taskId: "task-2", enabled: false, taskStatus: "completed" });
    expect(signals[2].aborted).toBe(true);
    act(() => vi.advanceTimersByTime(10_000));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    unmount();
  });

  it("surfaces a named refresh failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const { result } = renderHook(() => useTaskRunHistory({
      taskId: "task-1",
      enabled: true,
      taskStatus: "completed",
    }));

    await waitFor(() => {
      expect(result.current.error).toBe("Run history request failed (503)");
    });
  });
});
