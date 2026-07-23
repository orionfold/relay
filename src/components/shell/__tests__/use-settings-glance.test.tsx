// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SettingsGlanceResponse } from "../use-settings-glance";
import { useSettingsGlance } from "../use-settings-glance";
import { INSTANCE_IDENTITY_CHANGED_EVENT } from "@/lib/onboarding/events";

function glance(
  licenseTag: SettingsGlanceResponse["licenseTag"],
): SettingsGlanceResponse {
  return {
    activeRuntimeLabel: null,
    activeModel: null,
    routingPreference: null,
    configuredRuntimeCount: 0,
    readyRuntimeCount: 0,
    runtimeReadiness: {
      state: "setup-needed",
      label: "Setup needed",
      detail: "Configure an eligible runtime to run Relay work.",
      readyRuntimeLabels: [],
      attentionRuntimeLabels: [],
    },
    sdkTimeoutSeconds: null,
    maxTurns: null,
    licenseTag,
    budgetMonthlyCapUsd: null,
    activePreset: null,
    allowedPermissionCount: null,
    webSearchEnabled: null,
    channelCount: null,
    autoPromoteSkills: null,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSettingsGlance", () => {
  it("refreshes immediately after a successful license mutation event", async () => {
    const fetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(glance({ kind: "community" })),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            glance({ kind: "licensed", label: "Premium Packs" }),
          ),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetch);

    const { result, unmount } = renderHook(() => useSettingsGlance());
    await waitFor(() =>
      expect(result.current.data?.licenseTag.kind).toBe("community"),
    );

    act(() => {
      window.dispatchEvent(new Event(INSTANCE_IDENTITY_CHANGED_EVENT));
    });

    await waitFor(() =>
      expect(result.current.data?.licenseTag).toEqual({
        kind: "licensed",
        label: "Premium Packs",
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("ignores a pre-mutation response that resolves after the refresh", async () => {
    let resolveFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const licensed = glance({
      kind: "licensed",
      label: "Premium Packs",
    });
    const fetch = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(licensed), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);

    const { result, unmount } = renderHook(() => useSettingsGlance());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event(INSTANCE_IDENTITY_CHANGED_EVENT));
    });
    await waitFor(() =>
      expect(result.current.data?.licenseTag).toEqual(licensed.licenseTag),
    );

    resolveFirst(
      new Response(
        JSON.stringify(glance({ kind: "community" })),
        { status: 200 },
      ),
    );
    await act(async () => {
      await first;
    });

    expect(result.current.data?.licenseTag).toEqual(licensed.licenseTag);
    unmount();
  });

  it("refreshes immediately after runtime readiness changes", async () => {
    const initial = glance({ kind: "community" });
    const ready = {
      ...initial,
      readyRuntimeCount: 1,
      runtimeReadiness: {
        state: "ready" as const,
        label: "Ollama ready",
        detail: "Ollama is verified and eligible for routed work.",
        readyRuntimeLabels: ["Ollama"],
        attentionRuntimeLabels: [],
      },
    };
    const fetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(initial), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(ready), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);

    const { result, unmount } = renderHook(() => useSettingsGlance());
    await waitFor(() =>
      expect(result.current.data?.runtimeReadiness?.state).toBe("setup-needed"),
    );
    act(() => {
      window.dispatchEvent(new Event("relay:runtime-readiness-changed"));
    });
    await waitFor(() =>
      expect(result.current.data?.runtimeReadiness?.label).toBe("Ollama ready"),
    );
    unmount();
  });
});
