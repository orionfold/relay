"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  InstanceIdentityResponse,
  LicenseTag,
} from "@/app/api/instance/identity/route";

const POLL_MS = 60_000;

export type { LicenseTag };

export type InstanceIdentityState =
  | { status: "loading"; version: null; activeModel: null; licenseTag: null }
  | {
      status: "ready";
      version: string | null;
      activeModel: string | null;
      licenseTag: LicenseTag;
    }
  | {
      status: "error";
      version: string | null;
      activeModel: string | null;
      licenseTag: LicenseTag | null;
      error: string;
    };

// Polls /api/instance/identity on a slow (~60s) cadence — instance identity
// (version, license, active model) changes rarely, so a fast poll would be
// wasteful. Mirrors useTelemetry's shape: keeps the last good identity across a
// transient poll error (so a blip doesn't blank the bar cluster) but surfaces
// the error state explicitly — no silent failures. Consumers that see `error`
// with null fields render nothing rather than a skeleton flash.
export function useInstanceIdentity(): InstanceIdentityState {
  const [state, setState] = useState<InstanceIdentityState>({
    status: "loading",
    version: null,
    activeModel: null,
    licenseTag: null,
  });
  const lastRef = useRef<InstanceIdentityResponse | null>(null);

  const fetchIdentity = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/instance/identity", {
        signal,
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `instance identity HTTP ${res.status}`);
      }
      const data = (await res.json()) as InstanceIdentityResponse;
      lastRef.current = data;
      setState({
        status: "ready",
        version: data.version,
        activeModel: data.activeModel,
        licenseTag: data.licenseTag,
      });
    } catch (err) {
      if (signal?.aborted) return;
      const message =
        err instanceof Error ? err.message : "instance identity fetch failed";
      const last = lastRef.current;
      setState({
        status: "error",
        version: last?.version ?? null,
        activeModel: last?.activeModel ?? null,
        licenseTag: last?.licenseTag ?? null,
        error: message,
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchIdentity(controller.signal);

    let interval: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (interval) return;
      interval = setInterval(() => {
        if (document.visibilityState === "visible") {
          void fetchIdentity();
        }
      }, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchIdentity();
    };

    startPolling();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchIdentity]);

  return state;
}
