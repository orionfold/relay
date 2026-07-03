"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { APPS_CHANGED_EVENT } from "./apps-events";
import type { AppSummary } from "./registry";

export interface UseAppsResult {
  apps: AppSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Client-side hook that polls /api/apps for the user's composed apps list
 * and fires its own refresh when the window receives the
 * `relay-apps-changed` CustomEvent (dispatched on undo / materialize).
 *
 * Per TDR-037 Phase 2 — polling is the MVP for dynamic sidebar rendering;
 * events can be promoted to SSE later if UX feels laggy.
 */
export function useApps(pollIntervalMs = 5000): UseAppsResult {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/apps", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as AppSummary[];
      if (!alive.current) return;
      setApps(Array.isArray(data) ? data : []);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const timer = setInterval(refresh, pollIntervalMs);
    const onChanged = () => { refresh(); };
    window.addEventListener(APPS_CHANGED_EVENT, onChanged);
    return () => {
      alive.current = false;
      clearInterval(timer);
      window.removeEventListener(APPS_CHANGED_EVENT, onChanged);
    };
  }, [refresh, pollIntervalMs]);

  return { apps, loading, refresh };
}
