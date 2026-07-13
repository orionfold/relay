"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskRunHistory } from "@/lib/tasks/run-history";

export const EMPTY_TASK_RUN_HISTORY: TaskRunHistory = {
  runs: [],
  totalRuns: 0,
  omittedRuns: 0,
  logsTruncated: false,
  historyUnavailable: false,
};

interface UseTaskRunHistoryOptions {
  taskId: string | null;
  enabled: boolean;
  taskStatus?: string | null;
  taskUpdatedAt?: string | null;
  initialHistory?: TaskRunHistory;
}

export function useTaskRunHistory({
  taskId,
  enabled,
  taskStatus,
  taskUpdatedAt,
  initialHistory,
}: UseTaskRunHistoryOptions) {
  const initialTaskId = useRef(taskId);
  const [history, setHistory] = useState<TaskRunHistory>(
    initialHistory ?? EMPTY_TASK_RUN_HISTORY,
  );
  const [error, setError] = useState<string | null>(null);
  const activeController = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !taskId) return;
    activeController.current?.abort();
    const controller = new AbortController();
    activeController.current = controller;
    try {
      const response = await fetch(`/api/tasks/${taskId}/history`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Run history request failed (${response.status})`);
      }
      const next = await response.json() as TaskRunHistory;
      if (!controller.signal.aborted) {
        setHistory(next);
        setError(null);
      }
    } catch (historyError) {
      if (controller.signal.aborted) return;
      setError(
        historyError instanceof Error
          ? historyError.message
          : "Run history could not be refreshed",
      );
    }
  }, [enabled, taskId]);

  useEffect(() => {
    if (!taskId) {
      activeController.current?.abort();
      setHistory(EMPTY_TASK_RUN_HISTORY);
      setError(null);
      return;
    }

    if (taskId !== initialTaskId.current) {
      setHistory(EMPTY_TASK_RUN_HISTORY);
      setError(null);
      initialTaskId.current = taskId;
    }
  }, [taskId]);

  useEffect(() => {
    if (!enabled || !taskId) {
      activeController.current?.abort();
      return;
    }

    void refresh();
    if (taskStatus !== "running") {
      return () => activeController.current?.abort();
    }

    const interval = window.setInterval(() => void refresh(), 5_000);
    return () => {
      window.clearInterval(interval);
      activeController.current?.abort();
    };
  }, [enabled, refresh, taskId, taskStatus, taskUpdatedAt]);

  return { history, error, refresh };
}
