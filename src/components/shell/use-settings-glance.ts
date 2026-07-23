"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SettingsGlanceResponse } from "@/app/api/settings/glance/route";
import { INSTANCE_IDENTITY_CHANGED_EVENT } from "@/lib/onboarding/events";

const POLL_MS = 60_000;

export type { SettingsGlanceResponse };

// Mirrors useInstanceIdentity: a 3-arm discriminated union on `status`. On
// `ready`/`error` the `data` field carries the last-good glance payload (or null
// if the first read never succeeded). Consumers render the chips that resolved;
// an `error` with null data collapses the rail to nothing — no crash, no
// half-rendered skeleton (Engineering Principle #1/#3).
export type SettingsGlanceState =
  | { status: "loading"; data: null }
  | { status: "ready"; data: SettingsGlanceResponse }
  | { status: "error"; data: SettingsGlanceResponse | null; error: string };

// Polls /api/settings/glance on the same slow (~60s) cadence as
// useInstanceIdentity — settings change rarely, so a fast poll would be
// wasteful. Keeps the last good snapshot across a transient poll error so a blip
// doesn't blank the rail; surfaces the error state explicitly.
export function useSettingsGlance(): SettingsGlanceState {
  const [state, setState] = useState<SettingsGlanceState>({
    status: "loading",
    data: null,
  });
  const lastRef = useRef<SettingsGlanceResponse | null>(null);
  const requestSequenceRef = useRef(0);

  const fetchGlance = useCallback(async (signal?: AbortSignal) => {
    const requestSequence = ++requestSequenceRef.current;
    try {
      const res = await fetch("/api/settings/glance", {
        signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `settings glance HTTP ${res.status}`);
      }
      const data = (await res.json()) as SettingsGlanceResponse;
      if (requestSequence !== requestSequenceRef.current) return;
      lastRef.current = data;
      setState({ status: "ready", data });
    } catch (err) {
      if (
        signal?.aborted ||
        requestSequence !== requestSequenceRef.current
      ) {
        return;
      }
      const message =
        err instanceof Error ? err.message : "settings glance fetch failed";
      setState({ status: "error", data: lastRef.current, error: message });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchGlance(controller.signal);

    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          void fetchGlance();
        }
      }, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchGlance();
    };

    startPolling();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(INSTANCE_IDENTITY_CHANGED_EVENT, onVisibility);
    window.addEventListener("relay:runtime-readiness-changed", onVisibility);

    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(INSTANCE_IDENTITY_CHANGED_EVENT, onVisibility);
      window.removeEventListener("relay:runtime-readiness-changed", onVisibility);
    };
  }, [fetchGlance]);

  return state;
}
