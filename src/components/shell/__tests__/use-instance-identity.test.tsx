// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstanceIdentity } from "../use-instance-identity";
import { INSTANCE_IDENTITY_CHANGED_EVENT } from "@/lib/onboarding/events";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useInstanceIdentity", () => {
  it("refreshes immediately after a local license mutation event", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          version: "0.45.2",
          activeModel: null,
          licenseTag: { kind: "community" },
          orientation: {
            edition: "community",
            license: {
              lifecycle: "none",
              licensee: null,
              detail: "Community Edition is active.",
              expiresAt: null,
            },
            entitlements: { packs: false, host: false },
            packs: {
              premium: "locked",
              agency: "available",
              readError: null,
            },
            host: {
              state: "preview",
              managedCellsLimit: null,
              detail: "Optional.",
            },
            headline: "Start",
            description: "Start here.",
            entitlementLabel: "Community Edition",
            primaryAction: {
              kind: "link",
              label: "Browse Packs",
              href: "/packs",
            },
            secondaryActions: [],
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    const { unmount } = renderHook(() => useInstanceIdentity());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event(INSTANCE_IDENTITY_CHANGED_EVENT));
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    unmount();
  });

  it("ignores an older identity response after a mutation refresh", async () => {
    let resolveFirst!: (response: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const licensed = {
      version: "0.45.2",
      activeModel: null,
      licenseTag: { kind: "licensed", label: "Premium Packs" },
      orientation: null,
    };
    const fetch = vi
      .fn<() => Promise<Response>>()
      .mockImplementationOnce(() => first)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(licensed), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetch);

    const { result, unmount } = renderHook(() => useInstanceIdentity());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new Event(INSTANCE_IDENTITY_CHANGED_EVENT));
    });
    await waitFor(() =>
      expect(result.current.licenseTag).toEqual(licensed.licenseTag),
    );

    resolveFirst(
      new Response(
        JSON.stringify({
          ...licensed,
          licenseTag: { kind: "community" },
        }),
        { status: 200 },
      ),
    );
    await act(async () => {
      await first;
    });

    expect(result.current.licenseTag).toEqual(licensed.licenseTag);
    unmount();
  });
});
