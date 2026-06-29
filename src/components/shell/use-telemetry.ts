"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TelemetrySnapshot } from "./telemetry-types";

const POLL_MS = 12_000;

export type TelemetryState =
  | { status: "loading"; data: null; error: null }
  | { status: "ready"; data: TelemetrySnapshot; error: null }
  | { status: "error"; data: TelemetrySnapshot | null; error: string };

// Polls /api/telemetry on a ~12s cadence and refetches on tab refocus. Keeps the
// last good snapshot on transient errors (so a single failed poll doesn't blank
// the rail) but surfaces the error state explicitly — no silent failures. The
// poll pauses while the tab is hidden to avoid hammering the DB in the
// background.
export function useTelemetry(): TelemetryState {
  const [state, setState] = useState<TelemetryState>({
    status: "loading",
    data: null,
    error: null,
  });
  // Hold the latest data in a ref so error transitions can preserve it without
  // adding `state` to the fetch callback's dependency list (which would
  // re-create the interval on every poll).
  const lastDataRef = useRef<TelemetrySnapshot | null>(null);

  const fetchSnapshot = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/telemetry", { signal, cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(body?.message ?? `telemetry HTTP ${res.status}`);
      }
      const data = (await res.json()) as TelemetrySnapshot;
      lastDataRef.current = data;
      setState({ status: "ready", data, error: null });
    } catch (err) {
      if (signal?.aborted) return;
      const message = err instanceof Error ? err.message : "telemetry fetch failed";
      setState({ status: "error", data: lastDataRef.current, error: message });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSnapshot(controller.signal);

    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          void fetchSnapshot();
        }
      }, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchSnapshot();
    };

    startPolling();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchSnapshot]);

  return state;
}
